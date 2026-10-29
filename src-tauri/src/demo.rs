//! Carte de démonstration embarquée : valide dans l'application la chaîne complète
//! (gabarit, fond SVG, verso PDF en CMJN, données) en attendant l'import de vrais modèles.

use std::sync::LazyLock;

use serde::Deserialize;
use typst::foundations::Bytes;

use crate::moteur::{Document, ErreurMoteur, Fichiers, Moteur};

const GABARIT_CARTE: &str = include_str!("../gabarits/carte.typ");
const AGENTS: &[u8] = include_bytes!("../ressources/demo/agents.json");

static FICHIERS: LazyLock<Fichiers> = LazyLock::new(|| {
    [
        (
            "/projet.json",
            &include_bytes!("../ressources/demo/projet.json")[..],
        ),
        ("/agents.json", AGENTS),
        (
            "/demo/recto-fond.svg",
            &include_bytes!("../ressources/demo/recto-fond.svg")[..],
        ),
        (
            "/demo/verso.pdf",
            &include_bytes!("../ressources/demo/verso.pdf")[..],
        ),
    ]
    .into_iter()
    .map(|(chemin, octets)| (chemin.to_string(), Bytes::new(octets)))
    .collect()
});

static NB_AGENTS: LazyLock<usize> = LazyLock::new(|| {
    serde_json::from_slice::<Vec<serde_json::Value>>(AGENTS).map_or(0, |agents| agents.len())
});

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Face {
    Recto,
    Verso,
}

/// Ce que produit l'export : une carte par page, ou des planches imposées.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sortie {
    Cartes,
    Planches,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum Feuille {
    A4,
    A3,
    SRA3,
}

pub fn nb_agents() -> usize {
    *NB_AGENTS
}

/// Aperçu SVG d'une face de la carte d'un agent (carte finie, sans le fond perdu).
pub fn apercu(moteur: &Moteur, agent: usize, face: Face) -> Result<String, ErreurMoteur> {
    if agent >= nb_agents() {
        return Err(ErreurMoteur::simple(format!(
            "L'agent n° {} n'existe pas.",
            agent + 1
        )));
    }
    let face = match face {
        Face::Recto => "recto",
        Face::Verso => "verso",
    };
    compiler(
        moteur,
        &[
            ("mode", "apercu"),
            ("agent", &agent.to_string()),
            ("face", face),
        ],
    )?
    .svg(0)
}

/// PDF prêt pour l'impression : cartes unitaires (recto puis verso) ou planches recto/verso.
pub fn exporter(
    moteur: &Moteur,
    sortie: Sortie,
    feuille: Feuille,
) -> Result<Vec<u8>, ErreurMoteur> {
    let mode = match sortie {
        Sortie::Cartes => "cartes",
        Sortie::Planches => "planches",
    };
    let feuille = match feuille {
        Feuille::A4 => "A4",
        Feuille::A3 => "A3",
        Feuille::SRA3 => "SRA3",
    };
    compiler(moteur, &[("mode", mode), ("feuille", feuille)])?.pdf()
}

fn compiler(moteur: &Moteur, entrees: &[(&str, &str)]) -> Result<Document, ErreurMoteur> {
    moteur.compiler(GABARIT_CARTE, &FICHIERS, entrees)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_demo_contient_six_agents() {
        assert_eq!(nb_agents(), 6);
    }

    /// Les valeurs envoyées par l'interface (src/moteur.ts) doivent rester désérialisables.
    #[test]
    fn accepte_les_valeurs_envoyees_par_l_interface() {
        let lire = |valeur: &str| serde_json::Value::String(valeur.into());
        assert!(matches!(
            serde_json::from_value(lire("verso")),
            Ok(Face::Verso)
        ));
        assert!(matches!(
            serde_json::from_value(lire("planches")),
            Ok(Sortie::Planches)
        ));
        assert!(matches!(
            serde_json::from_value(lire("SRA3")),
            Ok(Feuille::SRA3)
        ));
        assert!(serde_json::from_value::<Feuille>(lire("A5")).is_err());
    }

    #[test]
    fn apercu_de_chaque_agent_et_du_verso() {
        let moteur = Moteur::nouveau();
        for agent in 0..nb_agents() {
            assert!(
                apercu(&moteur, agent, Face::Recto)
                    .unwrap()
                    .starts_with("<svg")
            );
        }
        assert!(apercu(&moteur, 0, Face::Verso).unwrap().starts_with("<svg"));
        assert!(apercu(&moteur, nb_agents(), Face::Recto).is_err());
    }

    #[test]
    fn cartes_unitaires_avec_zone_de_coupe() {
        let moteur = Moteur::nouveau();
        let document = compiler(&moteur, &[("mode", "cartes")]).unwrap();
        assert_eq!(document.nb_pages(), 2 * nb_agents());
        let pdf = document.pdf().unwrap();
        assert!(
            pdf.windows(b"/TrimBox".len())
                .any(|fenetre| fenetre == b"/TrimBox")
        );
    }

    #[test]
    fn planches_recto_verso() {
        let moteur = Moteur::nouveau();
        // A4 paysage : 9 cartes par feuille, donc les 6 agents tiennent sur une planche recto + verso.
        let document = compiler(&moteur, &[("mode", "planches"), ("feuille", "A4")]).unwrap();
        assert_eq!(document.nb_pages(), 2);
        assert!(
            exporter(&moteur, Sortie::Planches, Feuille::SRA3)
                .unwrap()
                .starts_with(b"%PDF")
        );
    }
}
