//! Mise à jour incrémentale : registre des cartes déjà produites avec chaque modèle, rangé dans le
//! dossier de données de l'application. L'interface n'y met que des empreintes (jamais les données
//! des agents) ; ce module se contente de le lire, de l'écrire et de l'oublier.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::moteur::ErreurMoteur;
use crate::tr;

/// Fichier du registre d'un modèle ; l'identifiant ne peut pas désigner un autre dossier.
fn chemin(dossier: &Path, id: &str) -> Result<PathBuf, ErreurMoteur> {
    let valide = !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valide {
        return Err(ErreurMoteur::simple(tr!(
            "Identifiant de modèle invalide : {id}",
            "Invalid template identifier: {id}"
        )));
    }
    Ok(dossier.join("registres").join(format!("{id}.json")))
}

/// Registre d'un modèle, s'il existe. Un registre abîmé est ignoré : toutes les cartes seront nouvelles.
pub fn lire(dossier: &Path, id: &str) -> Result<Option<Value>, ErreurMoteur> {
    match std::fs::read(chemin(dossier, id)?) {
        Ok(octets) => Ok(serde_json::from_slice(&octets).ok()),
        Err(erreur) if erreur.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(erreur) => Err(ErreurMoteur::simple(tr!(
            "Impossible de lire le registre des exports : {erreur}",
            "Cannot read the export register: {erreur}"
        ))),
    }
}

/// Enregistre le registre d'un modèle (d'abord dans un fichier temporaire : jamais à moitié écrit).
pub fn ecrire(dossier: &Path, id: &str, registre: &Value) -> Result<(), ErreurMoteur> {
    let chemin = chemin(dossier, id)?;
    let echec = |erreur: &dyn std::fmt::Display| {
        ErreurMoteur::simple(tr!(
            "Impossible d'enregistrer le registre des exports : {erreur}",
            "Cannot save the export register: {erreur}"
        ))
    };
    if let Some(parent) = chemin.parent() {
        std::fs::create_dir_all(parent).map_err(|e| echec(&e))?;
    }
    let temporaire = chemin.with_extension("json.tmp");
    let contenu = serde_json::to_vec(registre).map_err(|e| echec(&e))?;
    std::fs::write(&temporaire, contenu).map_err(|e| echec(&e))?;
    std::fs::rename(&temporaire, &chemin).map_err(|e| echec(&e))
}

/// Oublie les exports précédents d'un modèle.
pub fn oublier(dossier: &Path, id: &str) -> Result<(), ErreurMoteur> {
    match std::fs::remove_file(chemin(dossier, id)?) {
        Err(erreur) if erreur.kind() != std::io::ErrorKind::NotFound => {
            Err(ErreurMoteur::simple(tr!(
                "Impossible d'oublier les exports précédents : {erreur}",
                "Cannot forget previous exports: {erreur}"
            )))
        }
        _ => Ok(()),
    }
}

/// Hachage FNV-1a sur 64 bits : stable d'une version de l'application à l'autre.
pub fn fnv1a(octets: &[u8]) -> u64 {
    octets.iter().fold(0xcbf2_9ce4_8422_2325, |h, &octet| {
        (h ^ u64::from(octet)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn dossier(nom: &str) -> PathBuf {
        let dossier = std::env::temp_dir().join("automat-process-tests").join(nom);
        let _ = std::fs::remove_dir_all(&dossier);
        dossier
    }

    #[test]
    fn ecrit_relit_et_oublie_un_registre() {
        let dossier = dossier("registres");
        assert_eq!(lire(&dossier, "a1b2").unwrap(), None);
        let registre = json!({ "version": 1, "canaux": { "impression": { "nombre": 3 } } });
        ecrire(&dossier, "a1b2", &registre).unwrap();
        assert_eq!(lire(&dossier, "a1b2").unwrap(), Some(registre));
        oublier(&dossier, "a1b2").unwrap();
        assert_eq!(lire(&dossier, "a1b2").unwrap(), None);
        oublier(&dossier, "a1b2").unwrap();
    }

    #[test]
    fn ignore_un_registre_abime() {
        let dossier = dossier("registre-abime");
        std::fs::create_dir_all(dossier.join("registres")).unwrap();
        std::fs::write(dossier.join("registres").join("x.json"), b"{ pas du JSON").unwrap();
        assert_eq!(lire(&dossier, "x").unwrap(), None);
    }

    #[test]
    fn refuse_un_identifiant_qui_sort_du_dossier() {
        let dossier = dossier("registre-refus");
        for id in ["", "../../evil", "a/b", "c:\\x", &"a".repeat(81)] {
            assert!(lire(&dossier, id).is_err(), "{id}");
            assert!(ecrire(&dossier, id, &json!({})).is_err(), "{id}");
        }
    }

    #[test]
    fn hachage_stable() {
        assert_eq!(fnv1a(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_ne!(fnv1a(b"carte"), fnv1a(b"Carte"));
    }
}
