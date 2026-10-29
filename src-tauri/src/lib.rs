mod cartes;
mod commandes;
pub mod moteur;
mod qr;

use commandes::EtatMoteur;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let etat = EtatMoteur::default();
    etat.preparer();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(etat)
        .invoke_handler(tauri::generate_handler![
            commandes::infos_moteur,
            commandes::modele_demo,
            commandes::apercu_carte,
            commandes::exporter_cartes,
            commandes::lire_liste,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement d'Automat-Process");
}
