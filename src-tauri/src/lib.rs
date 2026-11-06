mod cartes;
mod commandes;
mod conversion;
mod effacement;
mod fichiers;
mod fonds;
mod impression;
mod langue;
pub mod moteur;
mod ocr;
mod outils_pdf;
mod ouverture;
mod pdf_textes;
mod photos;
mod projet_fichier;
mod qr;
mod registres;
mod word;

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
        .manage(Arc::new(photos::Photos::default()))
        .invoke_handler(tauri::generate_handler![
            commandes::infos_moteur,
            commandes::familles_polices,
            commandes::modele_demo,
            commandes::importer_fond,
            commandes::remplacer_fond,
            commandes::apercu_carte,
            commandes::exporter_cartes,
            commandes::exporter_numerique,
            commandes::exporter_bat,
            commandes::controler_cartes,
            commandes::vignettes_cartes,
            commandes::imprimantes,
            commandes::imprimer_cartes,
            commandes::couleur_autour,
            commandes::retirer_texte_pdf,
            commandes::empreinte_modele,
            commandes::lire_registre,
            commandes::ecrire_registre,
            commandes::oublier_registre,
            commandes::charger_photos,
            commandes::reconnaitre_textes,
            commandes::effacer_texte,
            commandes::definir_langue,
            commandes::enregistrer_projet,
            commandes::ouvrir_projet,
            commandes::lire_liste,
            commandes::lire_fichier,
            commandes::ecrire_fichiers,
            commandes::enregistrer_classeur,
            commandes::fusionner_pdf,
            commandes::lire_modele_word,
            commandes::ecrire_courriers,
            commandes::dossier_temporaire,
            commandes::supprimer_temporaire,
            commandes::convertir_courriers,
            commandes::apercu_courrier,
            commandes::ouvrir_fichier,
            commandes::montrer_dans_dossier,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement d'Automat-Process");
}
