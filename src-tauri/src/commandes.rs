//! Commandes appelées par l'interface (`invoke`). Les calculs tournent hors du fil
//! principal pour ne jamais figer la fenêtre.

use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

use crate::cartes::{self, DonneesAgent, Face, Feuille, Projet, Sortie, Zone};
use crate::fonds::{FondImporte, Fonds, TexteRetire};
use crate::moteur::{ErreurMoteur, Moteur, VERSION_TYPST};
use crate::projet_fichier::{self, ProjetOuvert};

/// Formats de liste acceptés, et taille maximale d'un fichier (une liste d'agents pèse bien moins).
const EXTENSIONS_LISTE: [&str; 7] = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"];
const TAILLE_MAX_LISTE: u64 = 50 * 1024 * 1024;

/// Le moteur est préparé en arrière-plan dès le démarrage (recensement des polices) ;
/// les commandes attendent qu'il soit prêt.
#[derive(Default, Clone)]
pub struct EtatMoteur(Arc<OnceLock<Moteur>>);

impl EtatMoteur {
    pub fn preparer(&self) {
        let cellule = self.0.clone();
        std::thread::spawn(move || {
            cellule.get_or_init(Moteur::nouveau);
        });
    }
}

async fn executer<T: Send + 'static>(
    etat: &EtatMoteur,
    travail: impl FnOnce(&Moteur) -> Result<T, ErreurMoteur> + Send + 'static,
) -> Result<T, ErreurMoteur> {
    let cellule = etat.0.clone();
    tauri::async_runtime::spawn_blocking(move || travail(cellule.wait()))
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Le calcul a été interrompu : {erreur}")))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfosMoteur {
    version_typst: &'static str,
    nb_polices: usize,
}

#[tauri::command]
pub async fn infos_moteur(etat: State<'_, EtatMoteur>) -> Result<InfosMoteur, ErreurMoteur> {
    executer(&etat, |moteur| {
        Ok(InfosMoteur {
            version_typst: VERSION_TYPST,
            nb_polices: moteur.familles().len(),
        })
    })
    .await
}

/// Familles de polices installées, pour choisir celle d'un champ.
#[tauri::command]
pub async fn familles_polices(etat: State<'_, EtatMoteur>) -> Result<Vec<String>, ErreurMoteur> {
    executer(&etat, |moteur| Ok(moteur.familles())).await
}

#[tauri::command]
pub fn modele_demo() -> serde_json::Value {
    cartes::modele_demo()
}

/// Importe un visuel de carte (PDF, SVG, PNG, JPG) choisi par l'utilisateur.
#[tauri::command]
pub async fn importer_fond(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
) -> Result<FondImporte, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || fonds.importer(&chemin))
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Import interrompu : {erreur}")))?
}

/// Remplace un SVG importé par sa version sans balises, préparée par l'interface.
#[tauri::command]
pub fn remplacer_fond(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    svg: String,
) -> Result<(), ErreurMoteur> {
    fonds.remplacer_svg(&chemin, svg)
}

#[tauri::command]
pub async fn apercu_carte(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agent: DonneesAgent,
    face: Face,
) -> Result<String, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::apercu(moteur, &projet, &agent, face)
    })
    .await
}

#[tauri::command]
pub async fn exporter_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    sortie: Sortie,
    feuille: Feuille,
    chemin: String,
) -> Result<(), ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        let pdf = cartes::exporter(moteur, &projet, &agents, sortie, feuille)?;
        std::fs::write(&chemin, pdf).map_err(|erreur| {
            ErreurMoteur::simple(format!("Impossible d'enregistrer « {chemin} » : {erreur}"))
        })
    })
    .await
}

/// Mesures de mise en page de chaque texte de chaque agent, pour le rapport de contrôle.
#[tauri::command]
pub async fn controler_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
) -> Result<Vec<serde_json::Value>, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::controler(moteur, &projet, &agents)
    })
    .await
}

/// Vignettes JPEG du recto des agents, pour la mosaïque (format décrit dans `cartes::vignettes`).
#[tauri::command]
pub async fn vignettes_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    largeur_px: u32,
) -> Result<Response, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::vignettes(moteur, &projet, &agents, largeur_px).map(Response::new)
    })
    .await
}

/// Contenu brut d'une liste choisie par l'utilisateur ; elle est décodée dans l'interface.
#[tauri::command]
pub async fn lire_liste(chemin: String) -> Result<Response, ErreurMoteur> {
    let extension = Path::new(&chemin)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();
    if !EXTENSIONS_LISTE.contains(&extension.as_str()) {
        return Err(ErreurMoteur::simple(format!(
            "Format de liste non pris en charge (.{extension}) : utilisez un fichier Excel, CSV ou ODS."
        )));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let illisible = |erreur: std::io::Error| {
            ErreurMoteur::simple(format!("Impossible de lire « {chemin} » : {erreur}"))
        };
        if std::fs::metadata(&chemin).map_err(illisible)?.len() > TAILLE_MAX_LISTE {
            return Err(ErreurMoteur::simple(
                "Le fichier dépasse 50 Mo : est-ce bien une liste ?",
            ));
        }
        std::fs::read(&chemin).map(Response::new).map_err(illisible)
    })
    .await
    .map_err(|erreur| ErreurMoteur::simple(format!("Lecture interrompue : {erreur}")))?
}

/// Couleur du visuel autour d'une zone : elle sert à effacer un texte incrusté sur un fond uni.
#[tauri::command]
pub async fn couleur_autour(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    zone: Zone,
) -> Result<String, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::couleur_autour(moteur, &projet, zone)
    })
    .await
}

/// Enregistre le modèle, ses visuels et les correspondances dans un fichier « .automat ».
#[tauri::command]
pub async fn enregistrer_projet(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    modele: serde_json::Value,
    correspondances: serde_json::Value,
    visuels: serde_json::Value,
) -> Result<(), ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || {
        projet_fichier::enregistrer(&chemin, &modele, &correspondances, &visuels, &fonds)
    })
    .await
    .map_err(|erreur| ErreurMoteur::simple(format!("Enregistrement interrompu : {erreur}")))?
}

#[tauri::command]
pub async fn ouvrir_projet(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
) -> Result<ProjetOuvert, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || projet_fichier::ouvrir(&chemin, &fonds))
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Ouverture interrompue : {erreur}")))?
}

/// Retire un texte d'exemple d'un visuel PDF ; l'interface en fait un champ au même endroit.
#[tauri::command]
pub async fn retirer_texte_pdf(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    id: usize,
) -> Result<TexteRetire, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || fonds.retirer_texte_pdf(&chemin, id))
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Traitement interrompu : {erreur}")))?
}
