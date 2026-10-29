//! Commandes appelées par l'interface (`invoke`). Les calculs tournent hors du fil
//! principal pour ne jamais figer la fenêtre.

use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

use crate::cartes::{self, DonneesAgent, Face, Feuille, Sortie};
use crate::moteur::{ErreurMoteur, Moteur, VERSION_TYPST};

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

#[tauri::command]
pub fn modele_demo() -> serde_json::Value {
    cartes::modele_demo()
}

#[tauri::command]
pub async fn apercu_carte(
    etat: State<'_, EtatMoteur>,
    agent: DonneesAgent,
    face: Face,
) -> Result<String, ErreurMoteur> {
    executer(&etat, move |moteur| cartes::apercu(moteur, &agent, face)).await
}

#[tauri::command]
pub async fn exporter_cartes(
    etat: State<'_, EtatMoteur>,
    agents: Vec<DonneesAgent>,
    sortie: Sortie,
    feuille: Feuille,
    chemin: String,
) -> Result<(), ErreurMoteur> {
    executer(&etat, move |moteur| {
        let pdf = cartes::exporter(moteur, &agents, sortie, feuille)?;
        std::fs::write(&chemin, pdf).map_err(|erreur| {
            ErreurMoteur::simple(format!("Impossible d'enregistrer « {chemin} » : {erreur}"))
        })
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
