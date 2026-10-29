mod cartes;
mod commandes;
mod fonds;
mod impression;
pub mod moteur;
mod pdf_textes;
mod projet_fichier;
mod qr;

use std::sync::Arc;

use commandes::EtatMoteur;
use fonds::Fonds;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let etat = EtatMoteur::default();
    etat.preparer();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(etat)
        .manage(Arc::new(Fonds::default()))
        .invoke_handler(tauri::generate_handler![
            commandes::infos_moteur,
            commandes::familles_polices,
            commandes::modele_demo,
            commandes::importer_fond,
            commandes::remplacer_fond,
            commandes::apercu_carte,
            commandes::exporter_cartes,
            commandes::controler_cartes,
            commandes::vignettes_cartes,
            commandes::imprimantes,
            commandes::imprimer_cartes,
            commandes::couleur_autour,
            commandes::retirer_texte_pdf,
            commandes::enregistrer_projet,
            commandes::ouvrir_projet,
            commandes::lire_liste,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement d'Automat-Process");
}
