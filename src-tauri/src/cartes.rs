//! Rendu des cartes de visite. L'interface fournit le modèle (format, fonds, champs) et les
//! données des agents (valeurs déjà associées aux colonnes, nettoyées, texte de la vCard) ;
//! les visuels importés par l'utilisateur sont servis depuis la réserve des fonds.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use typst::foundations::Bytes;

use crate::moteur::{Document, ErreurMoteur, Fichiers, Moteur};
use crate::qr::{self, CodeQr};

const GABARIT_CARTE: &str = include_str!("../gabarits/carte.typ");
const MM_PAR_POINT: f64 = 25.4 / 72.0;
const MODELE_DEMO: &[u8] = include_bytes!("../ressources/demo/projet.json");

/// Fonds du modèle de démonstration, toujours disponibles.
static FICHIERS_DEMO: LazyLock<Fichiers> = LazyLock::new(|| {
    [
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

/// Visuel du modèle de démonstration (pour enregistrer un projet bâti à partir de lui).
pub fn fichier_demo(chemin: &str) -> Option<Bytes> {
    FICHIERS_DEMO.get(chemin).cloned()
}

/// Zone de la carte finie, en mm depuis son coin haut-gauche.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Zone {
    pub x_mm: f64,
    pub y_mm: f64,
    pub largeur_mm: f64,
    pub hauteur_mm: f64,
}

/// Couleur du visuel tout autour d'une zone (médiane d'un anneau de 1 mm), mesurée sur le rendu
/// du visuel seul : c'est la couleur qui « efface » un texte posé sur un fond uni.
pub fn couleur_autour(
    moteur: &Moteur,
    projet: &Projet,
    zone: Zone,
) -> Result<String, ErreurMoteur> {
    let mut visuel_seul = projet.modele.clone();
    visuel_seul["champs"] = serde_json::Value::Array(Vec::new());
    let projet = Projet {
        modele: visuel_seul,
        fonds: projet.fonds.clone(),
    };
    let agent = DonneesAgent {
        id: "visuel".into(),
        valeurs: HashMap::new(),
        vcard: None,
    };
    const PIXELS_PAR_POINT: f64 = 3.0;
    let entrees = [("mode", "apercu"), ("agent", "0"), ("face", "recto")];
    let document = compiler(moteur, &projet, std::slice::from_ref(&agent), &entrees)?;
    let (largeur, hauteur, rvba) = document.pixels(0, PIXELS_PAR_POINT)?;
    let px_par_mm = PIXELS_PAR_POINT * 72.0 / 25.4;
    let borne = |mm: f64, max: u32| ((mm * px_par_mm).round().max(0.0) as u32).min(max);
    let anneau = 1.0;
    let (x0, y0) = (
        borne(zone.x_mm - anneau, largeur),
        borne(zone.y_mm - anneau, hauteur),
    );
    let (x1, y1) = (
        borne(zone.x_mm + zone.largeur_mm + anneau, largeur),
        borne(zone.y_mm + zone.hauteur_mm + anneau, hauteur),
    );
    let (ix0, iy0) = (borne(zone.x_mm, largeur), borne(zone.y_mm, hauteur));
    let (ix1, iy1) = (
        borne(zone.x_mm + zone.largeur_mm, largeur),
        borne(zone.y_mm + zone.hauteur_mm, hauteur),
    );
    let mut canaux: [Vec<u8>; 3] = Default::default();
    for y in y0..y1 {
        for x in x0..x1 {
            if (ix0..ix1).contains(&x) && (iy0..iy1).contains(&y) {
                continue;
            }
            let i = ((y * largeur + x) * 4) as usize;
            for (canal, valeurs) in canaux.iter_mut().enumerate() {
                valeurs.push(rvba[i + canal]);
            }
        }
    }
    if canaux[0].is_empty() {
        return Ok("#ffffff".into());
    }
    let mediane = |valeurs: &mut Vec<u8>| {
        valeurs.sort_unstable();
        valeurs[valeurs.len() / 2]
    };
    let [r, v, b] = &mut canaux;
    Ok(format!(
        "#{:02x}{:02x}{:02x}",
        mediane(r),
        mediane(v),
        mediane(b)
    ))
}

/// Le modèle décrit par l'interface et les visuels importés auxquels il fait référence.
pub struct Projet {
    pub modele: serde_json::Value,
    pub fonds: Fichiers,
}

/// Aperçu SVG d'une face de la carte d'un agent (carte finie, sans le fond perdu).
pub fn apercu(
    moteur: &Moteur,
    projet: &Projet,
    agent: &DonneesAgent,
    face: Face,
) -> Result<String, ErreurMoteur> {
    let face = match face {
        Face::Recto => "recto",
        Face::Verso => "verso",
    };
    let entrees = [("mode", "apercu"), ("agent", "0"), ("face", face)];
    compiler(moteur, projet, std::slice::from_ref(agent), &entrees)?.svg(0)
}

/// PDF prêt pour l'impression : cartes unitaires (recto puis verso) ou planches recto/verso.
pub fn exporter(
    moteur: &Moteur,
    projet: &Projet,
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
    compiler(
        moteur,
        projet,
        agents,
        &[("mode", mode), ("feuille", feuille)],
    )?
    .pdf()
}

/// Mesures de mise en page de chaque texte de chaque agent : taille retenue, nombre de lignes,
/// débordement et encombrement réel (mm). L'interface en tire le rapport de contrôle.
pub fn controler(
    moteur: &Moteur,
    projet: &Projet,
    agents: &[DonneesAgent],
) -> Result<Vec<serde_json::Value>, ErreurMoteur> {
    if agents.is_empty() {
        return Ok(Vec::new());
    }
    compiler(moteur, projet, agents, &[("mode", "controle")])?.metadonnees("controle")
}

/// Vignettes JPEG du recto de chaque agent (carte finie), larges de `largeur_px`, pour la mosaïque.
/// Elles sont mises bout à bout, chacune précédée de sa taille sur 4 octets (gros-boutiste).
pub fn vignettes(
    moteur: &Moteur,
    projet: &Projet,
    agents: &[DonneesAgent],
    largeur_px: u32,
) -> Result<Vec<u8>, ErreurMoteur> {
    if agents.is_empty() {
        return Ok(Vec::new());
    }
    let largeur_pt = projet.modele["format"]["largeur_mm"]
        .as_f64()
        .unwrap_or(85.0)
        / MM_PAR_POINT;
    let pixels_par_point = f64::from(largeur_px.clamp(40, 2000)) / largeur_pt;
    let document = compiler(moteur, projet, agents, &[("mode", "mosaique")])?;
    let mut sortie = Vec::new();
    for page in 0..document.nb_pages() {
        let (largeur, hauteur, rvba) = document.pixels(page, pixels_par_point)?;
        // Les cartes sont opaques (fond blanc) : le canal alpha peut être ignoré.
        let rvb: Vec<u8> = rvba
            .chunks_exact(4)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
            .collect();
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 85)
            .encode(&rvb, largeur, hauteur, image::ExtendedColorType::Rgb8)
            .map_err(|erreur| ErreurMoteur::simple(format!("Vignette impossible : {erreur}")))?;
        sortie.extend_from_slice(&(jpeg.len() as u32).to_be_bytes());
        sortie.extend_from_slice(&jpeg);
    }
    Ok(sortie)
}

fn compiler(
    moteur: &Moteur,
    projet: &Projet,
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
    let illisible =
        |erreur: serde_json::Error| ErreurMoteur::simple(format!("Données illisibles : {erreur}"));
    let mut fichiers = FICHIERS_DEMO.clone();
    fichiers.extend(projet.fonds.iter().map(|(c, o)| (c.clone(), o.clone())));
    let modele = serde_json::to_vec(&projet.modele).map_err(illisible)?;
    fichiers.insert("/projet.json".into(), Bytes::new(modele));
    let agents = serde_json::to_vec(&agents).map_err(illisible)?;
    fichiers.insert("/agents.json".into(), Bytes::new(agents));
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

    fn projet_demo() -> Projet {
        Projet {
            modele: modele_demo(),
            fonds: Fichiers::new(),
        }
    }

    /// Modèle de l'utilisateur : visuel importé en PNG, sans verso, un seul champ.
    fn projet_importe() -> Projet {
        let modele = serde_json::json!({
            "nom": "Mon modèle",
            "format": { "largeur_mm": 85, "hauteur_mm": 55, "fond_perdu_mm": 3 },
            "fond_recto": "/fonds/1.png",
            "fond_verso": null,
            "champs": [{
                "id": "c1", "type": "texte", "modele": "{{Prénom}} {{NOM}}", "x_mm": 6, "y_mm": 20,
                "police": "Arial", "graisse": 700, "taille_pt": 11, "couleur": { "rgb": "#22252a" },
                "interlettrage_em": 0, "ancre": "start", "largeur_max_mm": 50, "taille_min_pt": 8,
                "lignes_max": 1
            }]
        });
        let png = Bytes::new(&include_bytes!("../icons/128x128.png")[..]);
        Projet {
            modele,
            fonds: Fichiers::from([("/fonds/1.png".to_string(), png)]),
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
        let projet = projet_demo();
        for (avec_qr, face) in [
            (true, Face::Recto),
            (false, Face::Recto),
            (true, Face::Verso),
        ] {
            let svg = apercu(&moteur, &projet, &agent(0, avec_qr), face).unwrap();
            assert!(svg.starts_with("<svg"));
        }
    }

    #[test]
    fn export_cartes_et_planches() {
        let moteur = Moteur::nouveau();
        let projet = projet_demo();
        let agents: Vec<_> = (0..3).map(|n| agent(n, true)).collect();
        let cartes = compiler(&moteur, &projet, &agents, &[("mode", "cartes")]).unwrap();
        assert_eq!(cartes.nb_pages(), 6);
        let pdf = cartes.pdf().unwrap();
        assert!(
            pdf.windows(b"/TrimBox".len())
                .any(|fenetre| fenetre == b"/TrimBox")
        );
        let entrees = [("mode", "planches"), ("feuille", "A4")];
        let planches = compiler(&moteur, &projet, &agents, &entrees);
        assert_eq!(planches.unwrap().nb_pages(), 2);
        assert!(exporter(&moteur, &projet, &[], Sortie::Cartes, Feuille::A4).is_err());
    }

    #[test]
    fn modele_importe_sans_verso() {
        let moteur = Moteur::nouveau();
        let projet = projet_importe();
        let agents: Vec<_> = (0..3).map(|n| agent(n, false)).collect();
        // Sans verso : une page par carte, et seulement des planches recto.
        let cartes = compiler(&moteur, &projet, &agents, &[("mode", "cartes")]).unwrap();
        assert_eq!(cartes.nb_pages(), 3);
        let entrees = [("mode", "planches"), ("feuille", "A4")];
        assert_eq!(
            compiler(&moteur, &projet, &agents, &entrees)
                .unwrap()
                .nb_pages(),
            1
        );
        let verso = apercu(&moteur, &projet, &agents[0], Face::Verso).unwrap();
        assert!(verso.starts_with("<svg"));
    }

    #[test]
    fn controle_mesure_chaque_texte() {
        let moteur = Moteur::nouveau();
        let mut long = agent(1, true);
        long.valeurs.insert(
            "c1".into(),
            "Jean-Baptiste Emmanuel NKOULOU MBARGA ABESSOLO ESSOMBA".into(),
        );
        long.valeurs.insert(
            "c2".into(),
            "Directeur Adjoint des Ressources Humaines et de la Formation continue".into(),
        );
        let mesures = controler(&moteur, &projet_demo(), &[agent(0, true), long]).unwrap();
        // Quatre textes non vides par agent : le téléphone fixe est vide.
        assert_eq!(mesures.len(), 8);
        let mesure = |agent: &str, champ: &str| {
            let trouvee = mesures
                .iter()
                .find(|m| m["agent"] == agent && m["champ"] == champ);
            trouvee.unwrap().clone()
        };
        let nombre = |m: &serde_json::Value, cle: &str| m[cle].as_f64().unwrap();

        let nom = mesure("ligne 1", "c1");
        assert_eq!(
            (nombre(&nom, "taille"), nombre(&nom, "lignes")),
            (11.0, 1.0)
        );
        assert_eq!(nom["deborde"], false);
        assert!((nombre(&nom, "base") - 23.81).abs() < 0.01);
        assert!((nombre(&nom, "gauche") - 8.01).abs() < 0.01);
        assert!(nombre(&nom, "haut") < nombre(&nom, "base"));
        assert!(nombre(&nom, "base") <= nombre(&nom, "bas"));
        assert!(nombre(&nom, "droite") - nombre(&nom, "gauche") < 52.0);

        // Nom trop long : réduit jusqu'au minimum, il déborde encore.
        let nom_long = mesure("ligne 2", "c1");
        assert_eq!(nombre(&nom_long, "taille"), 8.0);
        assert_eq!(nom_long["deborde"], true);
        // Fonction passée sur deux lignes : le mobile descend d'autant.
        assert_eq!(nombre(&mesure("ligne 2", "c2"), "lignes"), 2.0);
        let descente =
            nombre(&mesure("ligne 2", "c3"), "base") - nombre(&mesure("ligne 1", "c3"), "base");
        assert!(descente > 2.0, "descente de {descente} mm");
    }

    #[test]
    fn vignettes_jpeg_de_la_mosaique() {
        let moteur = Moteur::nouveau();
        let agents: Vec<_> = (0..3).map(|n| agent(n, n != 1)).collect();
        let octets = vignettes(&moteur, &projet_demo(), &agents, 300).unwrap();
        let mut reste = &octets[..];
        let mut nombre = 0;
        while !reste.is_empty() {
            let taille = u32::from_be_bytes(reste[..4].try_into().unwrap()) as usize;
            let jpeg = &reste[4..4 + taille];
            assert_eq!(jpeg[..2], [0xFF, 0xD8]);
            let dimensions = imagesize::blob_size(jpeg).unwrap();
            assert!(dimensions.width.abs_diff(300) <= 1);
            reste = &reste[4 + taille..];
            nombre += 1;
        }
        assert_eq!(nombre, 3);
    }

    #[test]
    fn mesure_la_couleur_autour_d_une_zone() {
        let moteur = Moteur::nouveau();
        let projet = projet_demo();
        // Sous le nom (fond blanc) puis dans le bandeau bleu du bas.
        let zone = |y_mm| Zone {
            x_mm: 10.0,
            y_mm,
            largeur_mm: 30.0,
            hauteur_mm: 2.0,
        };
        let blanc = couleur_autour(&moteur, &projet, zone(20.0)).unwrap();
        assert_eq!(blanc, "#ffffff");
        let bleu = couleur_autour(&moteur, &projet, zone(51.0)).unwrap();
        assert_eq!(bleu, "#1d3557");
    }

    /// Visuel au format fini : posé tel quel, fond perdu complété en prolongeant ses bords.
    #[test]
    fn visuel_au_format_fini() {
        let moteur = Moteur::nouveau();
        let mut projet = projet_importe();
        projet.modele["fond_recto_avec_fond_perdu"] = false.into();
        let agents = [agent(0, true)];
        for entrees in [
            &[("mode", "cartes")][..],
            &[("mode", "planches"), ("feuille", "SRA3")],
        ] {
            let document = compiler(&moteur, &projet, &agents, entrees).unwrap();
            assert!(document.pdf().unwrap().starts_with(b"%PDF"));
        }
        let svg = apercu(&moteur, &projet, &agents[0], Face::Recto).unwrap();
        assert!(svg.starts_with("<svg"));
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
