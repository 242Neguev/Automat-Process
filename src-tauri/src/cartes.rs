//! Rendu des cartes de visite à partir des données d'agents préparées par l'interface
//! (valeurs déjà associées aux colonnes de la liste et nettoyées, texte de la vCard).
//! En attendant l'import de modèles (phase 1, incrément 2), le modèle est celui de démonstration.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use typst::foundations::Bytes;

use crate::moteur::{Document, ErreurMoteur, Fichiers, Moteur};
use crate::qr::{self, CodeQr};

const GABARIT_CARTE: &str = include_str!("../gabarits/carte.typ");
const MODELE_DEMO: &[u8] = include_bytes!("../ressources/demo/projet.json");

/// Description et fonds du modèle de démonstration.
static FICHIERS_MODELE: LazyLock<Fichiers> = LazyLock::new(|| {
    [
        ("/projet.json", MODELE_DEMO),
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

/// Un agent tel que l'envoie l'interface : valeur de chaque champ texte du modèle, et vCard du QR code.
#[derive(Debug, Deserialize)]
pub struct DonneesAgent {
    pub id: String,
    pub valeurs: HashMap<String, String>,
    #[serde(default)]
    pub vcard: Option<String>,
}

/// Un agent tel que le lit le gabarit dans /agents.json.
#[derive(Serialize)]
struct AgentGabarit<'a> {
    id: &'a str,
    valeurs: &'a HashMap<String, String>,
    qr: Option<CodeQr>,
}

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

/// Description du modèle de démonstration (format, champs, transformations, vCard) pour l'interface.
pub fn modele_demo() -> serde_json::Value {
    serde_json::from_slice(MODELE_DEMO).expect("modèle de démonstration valide")
}

/// Aperçu SVG d'une face de la carte d'un agent (carte finie, sans le fond perdu).
pub fn apercu(moteur: &Moteur, agent: &DonneesAgent, face: Face) -> Result<String, ErreurMoteur> {
    let face = match face {
        Face::Recto => "recto",
        Face::Verso => "verso",
    };
    let entrees = [("mode", "apercu"), ("agent", "0"), ("face", face)];
    compiler(moteur, std::slice::from_ref(agent), &entrees)?.svg(0)
}

/// PDF prêt pour l'impression : cartes unitaires (recto puis verso) ou planches recto/verso.
pub fn exporter(
    moteur: &Moteur,
    agents: &[DonneesAgent],
    sortie: Sortie,
    feuille: Feuille,
) -> Result<Vec<u8>, ErreurMoteur> {
    if agents.is_empty() {
        return Err(ErreurMoteur::simple("La liste ne contient aucun agent."));
    }
    let mode = match sortie {
        Sortie::Cartes => "cartes",
        Sortie::Planches => "planches",
    };
    let feuille = match feuille {
        Feuille::A4 => "A4",
        Feuille::A3 => "A3",
        Feuille::SRA3 => "SRA3",
    };
    compiler(moteur, agents, &[("mode", mode), ("feuille", feuille)])?.pdf()
}

fn compiler(
    moteur: &Moteur,
    agents: &[DonneesAgent],
    entrees: &[(&str, &str)],
) -> Result<Document, ErreurMoteur> {
    let agents = agents
        .iter()
        .map(|agent| {
            let vcard = agent.vcard.as_deref().filter(|texte| !texte.is_empty());
            Ok(AgentGabarit {
                id: &agent.id,
                valeurs: &agent.valeurs,
                qr: vcard.map(qr::encoder).transpose()?,
            })
        })
        .collect::<Result<Vec<_>, ErreurMoteur>>()?;
    let json = serde_json::to_vec(&agents).map_err(|erreur| {
        ErreurMoteur::simple(format!("Données des agents illisibles : {erreur}"))
    })?;
    let mut fichiers = FICHIERS_MODELE.clone();
    fichiers.insert("/agents.json".into(), Bytes::new(json));
    moteur.compiler(GABARIT_CARTE, &fichiers, entrees)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn agent(numero: usize, avec_qr: bool) -> DonneesAgent {
        let valeurs = [
            ("c1", format!("Aïssatou DIALLO {numero}")),
            ("c2", "Responsable Communication".into()),
            ("c3", "Mob. +237 612 34 56 78".into()),
            ("c4", String::new()),
            ("c5", "a.diallo@exemple.com".into()),
        ];
        DonneesAgent {
            id: format!("ligne {}", numero + 1),
            valeurs: valeurs
                .into_iter()
                .map(|(c, v)| (c.to_string(), v))
                .collect(),
            vcard: avec_qr
                .then(|| "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Aïssatou DIALLO\r\nEND:VCARD".into()),
        }
    }

    #[test]
    fn le_modele_de_demo_decrit_ses_champs() {
        let modele = modele_demo();
        assert_eq!(modele["champs"].as_array().unwrap().len(), 6);
        assert_eq!(modele["transformations"]["NOM"], "majuscules");
    }

    #[test]
    fn apercu_recto_verso_avec_ou_sans_qr() {
        let moteur = Moteur::nouveau();
        assert!(
            apercu(&moteur, &agent(0, true), Face::Recto)
                .unwrap()
                .starts_with("<svg")
        );
        assert!(
            apercu(&moteur, &agent(0, false), Face::Recto)
                .unwrap()
                .starts_with("<svg")
        );
        assert!(
            apercu(&moteur, &agent(0, true), Face::Verso)
                .unwrap()
                .starts_with("<svg")
        );
    }

    #[test]
    fn export_cartes_et_planches() {
        let moteur = Moteur::nouveau();
        let agents: Vec<_> = (0..3).map(|n| agent(n, true)).collect();
        let entrees = [("mode", "cartes")];
        let cartes = compiler(&moteur, &agents, &entrees).unwrap();
        assert_eq!(cartes.nb_pages(), 6);
        let pdf = cartes.pdf().unwrap();
        assert!(
            pdf.windows(b"/TrimBox".len())
                .any(|fenetre| fenetre == b"/TrimBox")
        );
        let planches = compiler(&moteur, &agents, &[("mode", "planches"), ("feuille", "A4")]);
        assert_eq!(planches.unwrap().nb_pages(), 2);
        assert!(exporter(&moteur, &[], Sortie::Cartes, Feuille::A4).is_err());
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
        let agent: DonneesAgent = serde_json::from_value(serde_json::json!({
            "id": "ligne 2", "valeurs": { "c1": "Jean DUPONT" }
        }))
        .unwrap();
        assert!(agent.vcard.is_none());
    }
}
