//! Langue des messages du cœur et des documents qu'il produit (bon à tirer, planches) : le français,
//! sauf si l'utilisateur a choisi l'anglais. L'interface l'indique dès son démarrage.

use std::sync::atomic::{AtomicBool, Ordering};

static ANGLAIS: AtomicBool = AtomicBool::new(false);

/// Langue choisie dans l'interface (« fr » ou « en »).
pub fn definir(code: &str) {
    ANGLAIS.store(code == "en", Ordering::Relaxed);
}

pub fn anglais() -> bool {
    ANGLAIS.load(Ordering::Relaxed)
}

/// Code de la langue, pour le gabarit des cartes.
pub fn code() -> &'static str {
    if anglais() { "en" } else { "fr" }
}

/// Texte fixe dans la langue de l'interface.
pub fn texte(francais: &'static str, anglais_: &'static str) -> &'static str {
    choisir(anglais(), francais, anglais_)
}

fn choisir<'a>(anglais: bool, francais: &'a str, anglais_: &'a str) -> &'a str {
    if anglais { anglais_ } else { francais }
}

/// Message formaté dans la langue de l'interface ; les deux formats reçoivent les mêmes valeurs :
/// `tr!("Impossible de lire « {chemin} » : {erreur}", "Cannot read “{chemin}”: {erreur}")`.
#[macro_export]
macro_rules! tr {
    ($francais:literal, $anglais:literal $(, $valeur:expr)* $(,)?) => {
        if $crate::langue::anglais() {
            format!($anglais $(, $valeur)*)
        } else {
            format!($francais $(, $valeur)*)
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    // La langue est commune à tout le cœur : les tests (qui tournent en parallèle) restent en français.
    #[test]
    fn francais_par_defaut() {
        assert!(!anglais());
        assert_eq!(code(), "fr");
        assert_eq!(texte("Aperçu", "Preview"), "Aperçu");
        let chemin = "liste.xlsx";
        assert_eq!(
            tr!("Impossible de lire « {chemin} »", "Cannot read “{chemin}”"),
            "Impossible de lire « liste.xlsx »"
        );
        assert_eq!(tr!("{} carte(s)", "{} card(s)", 3), "3 carte(s)");
    }

    #[test]
    fn choisit_l_anglais() {
        assert_eq!(choisir(true, "Aperçu", "Preview"), "Preview");
        assert_eq!(choisir(false, "Aperçu", "Preview"), "Aperçu");
    }
}
