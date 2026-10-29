//! Commandes appelées par l'interface (`invoke`). Les calculs tournent hors du fil
//! principal pour ne jamais figer la fenêtre.

use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::State;

use crate::demo::{self, Face, Feuille, Sortie};
use crate::moteur::{ErreurMoteur, Moteur, VERSION_TYPST};

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
    nb_agents_demo: usize,
}

#[tauri::command]
pub async fn infos_moteur(etat: State<'_, EtatMoteur>) -> Result<InfosMoteur, ErreurMoteur> {
    executer(&etat, |moteur| {
        Ok(InfosMoteur {
            version_typst: VERSION_TYPST,
            nb_polices: moteur.familles().len(),
            nb_agents_demo: demo::nb_agents(),
        })
    })
    .await
}

#[tauri::command]
pub async fn apercu_demo(
    etat: State<'_, EtatMoteur>,
    agent: usize,
    face: Face,
) -> Result<String, ErreurMoteur> {
    executer(&etat, move |moteur| demo::apercu(moteur, agent, face)).await
}

#[tauri::command]
pub async fn exporter_demo(
    etat: State<'_, EtatMoteur>,
    sortie: Sortie,
    feuille: Feuille,
    chemin: String,
) -> Result<(), ErreurMoteur> {
    executer(&etat, move |moteur| {
        let pdf = demo::exporter(moteur, sortie, feuille)?;
        std::fs::write(&chemin, pdf).map_err(|erreur| {
            ErreurMoteur::simple(format!("Impossible d'enregistrer « {chemin} » : {erreur}"))
        })
    })
    .await
}
