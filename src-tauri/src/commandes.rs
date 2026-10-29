//! Commandes appelées par l'interface (`invoke`). Les calculs tournent hors du fil
//! principal pour ne jamais figer la fenêtre.

use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

use crate::cartes::{self, DonneesAgent, Face, Feuille, Projet, Sortie, Zone};
use crate::fichiers::{self, FichierAEcrire, Nature};
use crate::fonds::{FondImporte, Fonds, TexteRetire};
use crate::impression::{self, Imprimante, Reglages};
use crate::moteur::{ErreurMoteur, Moteur, VERSION_TYPST};
use crate::projet_fichier::{self, ProjetOuvert};

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

/// Imprimantes installées, pour l'impression directe des badges (sous Windows ; liste vide ailleurs).
#[tauri::command]
pub async fn imprimantes() -> Result<Vec<Imprimante>, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(impression::imprimantes)
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Recherche interrompue : {erreur}")))?
        .map_err(ErreurMoteur::simple)
}

/// Imprime directement les cartes des agents sur l'imprimante choisie.
#[tauri::command]
pub async fn imprimer_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    imprimante: String,
    reglages: Reglages,
) -> Result<(), ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::imprimer(moteur, &projet, &agents, &imprimante, reglages)
    })
    .await
}

/// Contenu brut d'une liste choisie par l'utilisateur ; elle est décodée dans l'interface.
#[tauri::command]
pub async fn lire_liste(chemin: String) -> Result<Response, ErreurMoteur> {
    lire_fichier(chemin, Nature::Liste).await
}

/// Contenu brut d'un fichier choisi par l'utilisateur (liste, logo, signature existante).
#[tauri::command]
pub async fn lire_fichier(chemin: String, nature: Nature) -> Result<Response, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(move || fichiers::lire(&chemin, nature).map(Response::new))
        .await
        .map_err(|erreur| ErreurMoteur::simple(format!("Lecture interrompue : {erreur}")))?
}

/// Écrit des fichiers (pages de signature…) dans un nouveau dossier ; renvoie son chemin.
#[tauri::command]
pub async fn ecrire_fichiers(
    dossier: String,
    sous_dossier: String,
    fichiers: Vec<FichierAEcrire>,
) -> Result<String, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(move || {
        fichiers::ecrire(&dossier, &sous_dossier, &fichiers)
    })
    .await
    .map_err(|erreur| ErreurMoteur::simple(format!("Écriture interrompue : {erreur}")))?
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
