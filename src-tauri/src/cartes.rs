//! Rendu des cartes de visite. L'interface fournit le modèle (format, fonds, champs) et les
//! données des agents (valeurs déjà associées aux colonnes, nettoyées, texte de la vCard) ;
//! les visuels importés par l'utilisateur sont servis depuis la réserve des fonds.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use typst::foundations::Bytes;

use crate::effacement;
use crate::fichiers::{self, FichierAEcrire};
use crate::impression;
use crate::moteur::{Document, ErreurMoteur, Fichiers, Moteur};
use crate::ocr;
use crate::qr::{self, CodeQr};
use crate::tr;

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

/// Un agent tel que l'envoie l'interface : valeur de chaque champ texte du modèle, vCard du QR code
/// et, pour les cartes numériques, lien de certains champs (tel:, mailto:, https:).
#[derive(Debug, Deserialize)]
pub struct DonneesAgent {
    pub id: String,
    pub valeurs: HashMap<String, String>,
    #[serde(default)]
    pub vcard: Option<String>,
    #[serde(default)]
    pub liens: HashMap<String, String>,
    /// Nom de l'agent, pour le bon à tirer.
    #[serde(default)]
    pub libelle: Option<String>,
    /// Rang de sa variante dans `modele.variantes.valeurs` ; aucune : les visuels du modèle.
    #[serde(default)]
    pub variante: Option<usize>,
    /// Photo de chaque champ photo du modèle (par identifiant de champ), avec son recadrage.
    #[serde(default)]
    pub photos: HashMap<String, PhotoAgent>,
}

/// Photo d'un agent dans un cadre de la carte. Le recadrage vise un point de la photo (fractions
/// depuis son coin haut-gauche), amené au centre du cadre ; un zoom de 1 couvre juste le cadre.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PhotoAgent {
    pub chemin: String,
    pub largeur_px: f64,
    pub hauteur_px: f64,
    pub centre_x: f64,
    pub centre_y: f64,
    pub zoom: f64,
}

/// Un agent tel que le lit le gabarit dans /agents.json.
#[derive(Serialize)]
struct AgentGabarit<'a> {
    id: &'a str,
    valeurs: &'a HashMap<String, String>,
    qr: Option<CodeQr>,
    liens: &'a HashMap<String, String>,
    libelle: Option<&'a str>,
    variante: Option<usize>,
    photos: &'a HashMap<String, PhotoAgent>,
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

/// Format des cartes numériques (WhatsApp, e-mail, réseaux).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FormatNumerique {
    Png,
    Jpg,
    Pdf,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsNumerique {
    pub format: FormatNumerique,
    /// Largeur des images, en pixels.
    pub largeur_px: u32,
    pub verso: bool,
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

/// Empreinte du modèle tel qu'il s'imprime, pour la mise à jour incrémentale : format, champs, mises
/// en forme et contenu des visuels (leur chemin virtuel change à chaque ouverture du projet). Le nom,
/// l'identifiant, le verrou et le calque de référence (jamais imprimé) n'y entrent pas.
pub fn empreinte_modele(modele: &serde_json::Value, fonds: &Fichiers) -> String {
    use serde_json::Value;
    fn canonique(valeur: &Value, fonds: &Fichiers, sortie: &mut String) {
        match valeur {
            Value::String(texte) => {
                let contenu = fonds
                    .get(texte.as_str())
                    .cloned()
                    .or_else(|| fichier_demo(texte));
                match contenu {
                    Some(octets) => sortie.push_str(&format!(
                        "\"#{:016x}\"",
                        crate::registres::fnv1a(&octets[..])
                    )),
                    None => sortie.push_str(&valeur.to_string()),
                }
            }
            Value::Array(elements) => {
                sortie.push('[');
                for (i, element) in elements.iter().enumerate() {
                    if i > 0 {
                        sortie.push(',');
                    }
                    canonique(element, fonds, sortie);
                }
                sortie.push(']');
            }
            // Clés triées : l'ordre dans lequel l'interface a construit l'objet ne compte pas.
            Value::Object(objet) => {
                let mut cles: Vec<&String> = objet.keys().collect();
                cles.sort();
                sortie.push('{');
                for (i, cle) in cles.into_iter().enumerate() {
                    if i > 0 {
                        sortie.push(',');
                    }
                    sortie.push_str(&Value::String(cle.clone()).to_string());
                    sortie.push(':');
                    canonique(&objet[cle], fonds, sortie);
                }
                sortie.push('}');
            }
            autre => sortie.push_str(&autre.to_string()),
        }
    }
    let mut modele = modele.clone();
    if let Some(objet) = modele.as_object_mut() {
        for cle in [
            "nom",
            "id",
            "verrouille",
            "fond_calque",
            "fond_calque_avec_fond_perdu",
        ] {
            objet.remove(cle);
        }
    }
    let mut texte = String::new();
    canonique(&modele, fonds, &mut texte);
    format!("{:016x}", crate::registres::fnv1a(texte.as_bytes()))
}

/// Zone de la carte finie, en mm depuis son coin haut-gauche.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
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
        liens: HashMap::new(),
        libelle: None,
        variante: None,
        photos: HashMap::new(),
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

/// Rendu RVBA du visuel du recto seul (sans les informations, mais avec les zones effacées) : largeur,
/// hauteur et pixels de la carte finie.
fn rendre_visuel(
    moteur: &Moteur,
    projet: &Projet,
    pixels_par_point: f64,
) -> Result<(u32, u32, Vec<u8>), ErreurMoteur> {
    let mut visuel_seul = projet.modele.clone();
    let masques: Vec<serde_json::Value> = projet.modele["champs"]
        .as_array()
        .map(|champs| {
            champs
                .iter()
                .filter(|c| c["type"] == "masque")
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    visuel_seul["champs"] = serde_json::Value::Array(masques);
    let projet = Projet {
        modele: visuel_seul,
        fonds: projet.fonds.clone(),
    };
    let agent = DonneesAgent {
        id: "visuel".into(),
        valeurs: HashMap::new(),
        vcard: None,
        liens: HashMap::new(),
        libelle: None,
        variante: None,
        photos: HashMap::new(),
    };
    let entrees = [("mode", "apercu"), ("agent", "0"), ("face", "recto")];
    compiler(moteur, &projet, std::slice::from_ref(&agent), &entrees)?.pixels(0, pixels_par_point)
}

/// Textes d'exemple incrustés dans le visuel du recto, lus par la reconnaissance de caractères de
/// Windows sur son rendu (environ 2 400 pixels de large) ; positions en mm de la carte finie.
pub fn reconnaitre_textes(
    moteur: &Moteur,
    projet: &Projet,
) -> Result<Vec<ocr::TexteLu>, ErreurMoteur> {
    let largeur_pt = projet.modele["format"]["largeur_mm"]
        .as_f64()
        .unwrap_or(85.0)
        / MM_PAR_POINT;
    let pixels_par_point = (2400.0 / largeur_pt).clamp(1.0, 8.0);
    let (largeur, hauteur, rvba) = rendre_visuel(moteur, projet, pixels_par_point)?;
    ocr::reconnaitre(&rvba, largeur, hauteur, pixels_par_point / MM_PAR_POINT)
        .map_err(ErreurMoteur::simple)
}

/// Effacement intelligent de zones (mm de la carte finie) du visuel du recto, quand c'est une image :
/// renvoie la nouvelle image (même format) et son extension. Le texte est repeint à partir du fond qui
/// l'entoure ; le reste de l'image est intact.
pub fn effacer_texte(
    projet: &Projet,
    zones: &[Zone],
) -> Result<(Vec<u8>, &'static str), ErreurMoteur> {
    use image::{DynamicImage, ImageDecoder, ImageReader};
    let chemin = projet.modele["fond_recto"].as_str().unwrap_or_default();
    let extension = chemin.rsplit('.').next().unwrap_or_default().to_lowercase();
    let png = extension == "png";
    if !png && extension != "jpg" && extension != "jpeg" {
        return Err(ErreurMoteur::simple(tr!(
            "L'effacement intelligent ne s'applique qu'aux visuels en image (PNG, JPG).",
            "Smart erase only applies to image designs (PNG, JPG)."
        )));
    }
    let octets = projet.fonds.get(chemin).cloned().ok_or_else(|| {
        ErreurMoteur::simple(tr!("Visuel inconnu : {chemin}", "Unknown design: {chemin}"))
    })?;
    let illisible = |erreur: &dyn std::fmt::Display| {
        ErreurMoteur::simple(tr!(
            "Image du visuel illisible : {erreur}",
            "The design image cannot be read: {erreur}"
        ))
    };
    let mut decodeur = ImageReader::new(std::io::Cursor::new(&octets[..]))
        .with_guessed_format()
        .map_err(|e| illisible(&e))?
        .into_decoder()
        .map_err(|e| illisible(&e))?;
    let orientation = decodeur
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decodeur).map_err(|e| illisible(&e))?;
    image.apply_orientation(orientation);
    let mut rvba = image.to_rgba8();
    let (largeur_px, hauteur_px) = (f64::from(rvba.width()), f64::from(rvba.height()));

    // Pose du visuel, comme dans le gabarit : il couvre (« cover », centré) la carte avec son fond perdu,
    // ou la carte finie s'il est au format fini.
    let format = &projet.modele["format"];
    let mesure = |cle: &str| format[cle].as_f64().unwrap_or(0.0);
    let (largeur, hauteur, fond_perdu) = (
        mesure("largeur_mm"),
        mesure("hauteur_mm"),
        mesure("fond_perdu_mm"),
    );
    let avec_fond_perdu = projet.modele["fond_recto_avec_fond_perdu"]
        .as_bool()
        .unwrap_or(true);
    let (zone_l, zone_h, origine) = if avec_fond_perdu {
        (
            largeur + 2.0 * fond_perdu,
            hauteur + 2.0 * fond_perdu,
            -fond_perdu,
        )
    } else {
        (largeur, hauteur, 0.0)
    };
    let mm_par_px = (zone_l / largeur_px).max(zone_h / hauteur_px);
    let gauche = (zone_l - largeur_px * mm_par_px) / 2.0 + origine;
    let haut = (zone_h - hauteur_px * mm_par_px) / 2.0 + origine;
    let rectangles: Vec<effacement::Rectangle> = zones
        .iter()
        .map(|zone| {
            let px = |mm: f64, debut: f64, max: f64| ((mm - debut) / mm_par_px).clamp(0.0, max);
            effacement::Rectangle {
                x0: (px(zone.x_mm, gauche, largeur_px) - 1.0).max(0.0).floor() as u32,
                y0: (px(zone.y_mm, haut, hauteur_px) - 1.0).max(0.0).floor() as u32,
                x1: (px(zone.x_mm + zone.largeur_mm, gauche, largeur_px) + 1.0).ceil() as u32,
                y1: (px(zone.y_mm + zone.hauteur_mm, haut, hauteur_px) + 1.0).ceil() as u32,
            }
        })
        .collect();
    effacement::effacer(&mut rvba, &rectangles);

    let mut sortie = Vec::new();
    let image = DynamicImage::ImageRgba8(rvba);
    if png {
        image
            .write_to(
                &mut std::io::Cursor::new(&mut sortie),
                image::ImageFormat::Png,
            )
            .map_err(|e| illisible(&e))?;
        Ok((sortie, "png"))
    } else {
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut sortie, 95)
            .encode_image(&image.to_rgb8())
            .map_err(|e| illisible(&e))?;
        Ok((sortie, "jpg"))
    }
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
        return Err(ErreurMoteur::simple(tr!(
            "La liste ne contient aucun agent.",
            "The list contains no one."
        )));
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
        let jpeg = jpeg(&document, page, pixels_par_point, 85)?;
        sortie.extend_from_slice(&(jpeg.len() as u32).to_be_bytes());
        sortie.extend_from_slice(&jpeg);
    }
    Ok(sortie)
}

/// Page en JPEG ; les cartes sont opaques (fond blanc), le canal alpha peut être ignoré.
fn jpeg(
    document: &Document,
    page: usize,
    pixels_par_point: f64,
    qualite: u8,
) -> Result<Vec<u8>, ErreurMoteur> {
    let (largeur, hauteur, rvba) = document.pixels(page, pixels_par_point)?;
    let rvb: Vec<u8> = rvba
        .as_chunks::<4>()
        .0
        .iter()
        .flat_map(|&[r, v, b, _]| [r, v, b])
        .collect();
    let mut sortie = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut sortie, qualite)
        .encode(&rvb, largeur, hauteur, image::ExtendedColorType::Rgb8)
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Image JPEG impossible : {erreur}",
                "JPEG image failed: {erreur}"
            ))
        })?;
    Ok(sortie)
}

/// Les cartes ont un verso si le modèle ou l'une de ses variantes en a un (un agent sans verso
/// reçoit alors un verso blanc).
fn avec_verso(projet: &Projet) -> bool {
    let verso = |valeur: &serde_json::Value| {
        valeur["fond_verso"]
            .as_str()
            .is_some_and(|chemin| !chemin.is_empty())
    };
    verso(&projet.modele)
        || projet.modele["variantes"]["valeurs"]
            .as_array()
            .is_some_and(|valeurs| valeurs.iter().any(verso))
}

/// Nom d'une variante du modèle (« Douala »), pour nommer son verso.
fn nom_variante(projet: &Projet, rang: usize) -> Option<String> {
    projet.modele["variantes"]["valeurs"][rang]["valeur"]
        .as_str()
        .map(str::to_owned)
}

/// Cartes numériques, dans un nouveau dossier dont le chemin est renvoyé : une image PNG ou JPG
/// par agent (le verso, le même pour tous, une seule fois), ou un PDF par agent avec ses liens
/// cliquables ; plus sa fiche contact (.vcf) quand elle n'est pas vide. `noms` donne le nom de
/// fichier de chaque agent, sans extension.
#[allow(clippy::too_many_arguments)]
pub fn exporter_numerique(
    moteur: &Moteur,
    projet: &Projet,
    agents: &[DonneesAgent],
    noms: &[String],
    fiches: &[String],
    options: OptionsNumerique,
    dossier: &str,
    sous_dossier: &str,
) -> Result<String, ErreurMoteur> {
    if agents.is_empty() || noms.len() != agents.len() {
        return Err(ErreurMoteur::simple(tr!(
            "La liste ne contient aucun agent.",
            "The list contains no one."
        )));
    }
    let verso = options.verso && avec_verso(projet);
    let fichier = |nom: String, octets: Vec<u8>| FichierAEcrire {
        nom,
        texte: None,
        octets: Some(octets),
    };
    let mut fichiers = Vec::new();
    // Profil « écran » : les versions écran des visuels, quand le modèle en a.
    let profil = ("profil", "ecran");
    if options.format == FormatNumerique::Pdf {
        let entrees = [
            ("mode", "ecran"),
            ("verso", if verso { "oui" } else { "non" }),
            profil,
        ];
        for (agent, nom) in agents.iter().zip(noms) {
            let pdf = compiler(moteur, projet, std::slice::from_ref(agent), &entrees)?.pdf()?;
            fichiers.push(fichier(format!("{nom}.pdf"), pdf));
        }
    } else {
        let largeur_pt = projet.modele["format"]["largeur_mm"]
            .as_f64()
            .unwrap_or(85.0)
            / MM_PAR_POINT;
        let pixels_par_point = f64::from(options.largeur_px.clamp(200, 4000)) / largeur_pt;
        let image = |document: &Document, page: usize| match options.format {
            FormatNumerique::Jpg => jpeg(document, page, pixels_par_point, 90),
            _ => document.png(page, pixels_par_point),
        };
        let extension = if options.format == FormatNumerique::Jpg {
            "jpg"
        } else {
            "png"
        };
        let rectos = compiler(moteur, projet, agents, &[("mode", "mosaique"), profil])?;
        for (page, nom) in noms.iter().enumerate() {
            fichiers.push(fichier(format!("{nom}.{extension}"), image(&rectos, page)?));
        }
        if verso {
            let entrees = [
                ("mode", "apercu"),
                ("agent", "0"),
                ("face", "verso"),
                profil,
            ];
            // Le verso est le même pour tous les agents d'une variante : un fichier par variante.
            let mut variantes: Vec<Option<usize>> = Vec::new();
            for agent in agents {
                if !variantes.contains(&agent.variante) {
                    variantes.push(agent.variante);
                }
            }
            for variante in variantes {
                let agent = agents
                    .iter()
                    .find(|agent| agent.variante == variante)
                    .expect("variante d'un agent");
                let document = compiler(moteur, projet, std::slice::from_ref(agent), &entrees)?;
                let nom = match variante.and_then(|rang| nom_variante(projet, rang)) {
                    Some(variante) => format!(
                        "_Verso - {}",
                        fichiers::nom_sur(&variante).unwrap_or_default()
                    ),
                    None => "_Verso".to_string(),
                };
                fichiers.push(fichier(format!("{nom}.{extension}"), image(&document, 0)?));
            }
        }
    }
    for (fiche, nom) in fiches.iter().zip(noms) {
        if !fiche.is_empty() {
            fichiers.push(FichierAEcrire {
                nom: format!("{nom}.vcf"),
                texte: Some(fiche.clone()),
                octets: None,
            });
        }
    }
    fichiers::ecrire(dossier, sous_dossier, &fichiers)
}

/// Bon à tirer : une page A4 par carte, à faire valider avant l'impression.
pub fn bon_a_tirer(
    moteur: &Moteur,
    projet: &Projet,
    agents: &[DonneesAgent],
    titre: &str,
    date: &str,
) -> Result<Vec<u8>, ErreurMoteur> {
    if agents.is_empty() {
        return Err(ErreurMoteur::simple(tr!(
            "Aucune carte à faire valider.",
            "No card to approve."
        )));
    }
    let entrees = [("mode", "bat"), ("titre", titre), ("date", date)];
    compiler(moteur, projet, agents, &entrees)?.pdf()
}

/// Impression directe des cartes sur une imprimante Windows : recto, et verso au dos si demandé.
/// `Ok(false)` : l'utilisateur a annulé (imprimante virtuelle dont la boîte d'enregistrement a été refermée).
pub fn imprimer(
    moteur: &Moteur,
    projet: &Projet,
    agents: &[DonneesAgent],
    imprimante: &str,
    reglages: impression::Reglages,
) -> Result<bool, ErreurMoteur> {
    if agents.is_empty() {
        return Err(ErreurMoteur::simple(tr!(
            "Aucune carte à imprimer.",
            "No card to print."
        )));
    }
    let document = compiler(moteur, projet, agents, &[("mode", "cartes")])?;
    let faces = impression::faces(agents.len(), avec_verso(projet), reglages);
    let format = &projet.modele["format"];
    let taille_mm = (
        format["largeur_mm"].as_f64().unwrap_or(85.6),
        format["hauteur_mm"].as_f64().unwrap_or(54.0),
    );
    let rendre = |page: usize, dpi: f64| {
        document
            .pixels(page, dpi / 72.0)
            .map_err(|erreur| erreur.message)
    };
    impression::imprimer(
        imprimante,
        "Automat-Process : cartes",
        taille_mm,
        &faces,
        reglages.retourner_verso,
        &rendre,
    )
    .map_err(ErreurMoteur::simple)
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
                liens: &agent.liens,
                libelle: agent.libelle.as_deref(),
                variante: agent.variante,
                photos: &agent.photos,
            })
        })
        .collect::<Result<Vec<_>, ErreurMoteur>>()?;
    let illisible = |erreur: serde_json::Error| {
        ErreurMoteur::simple(tr!(
            "Données illisibles : {erreur}",
            "Unreadable data: {erreur}"
        ))
    };
    let mut fichiers = FICHIERS_DEMO.clone();
    fichiers.extend(projet.fonds.iter().map(|(c, o)| (c.clone(), o.clone())));
    let modele = serde_json::to_vec(&projet.modele).map_err(illisible)?;
    fichiers.insert("/projet.json".into(), Bytes::new(modele));
    let agents = serde_json::to_vec(&agents).map_err(illisible)?;
    fichiers.insert("/agents.json".into(), Bytes::new(agents));
    // Textes du bon à tirer et des planches dans la langue de l'interface (sauf langue imposée).
    let mut entrees = entrees.to_vec();
    if !entrees.iter().any(|(cle, _)| *cle == "langue") {
        entrees.push(("langue", crate::langue::code()));
    }
    moteur.compiler(GABARIT_CARTE, &fichiers, &entrees)
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
            liens: HashMap::new(),
            libelle: None,
            variante: None,
            photos: HashMap::new(),
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
    fn cartes_numeriques_images_pdf_et_fiches() {
        let moteur = Moteur::nouveau();
        let projet = projet_demo();
        let mut avec_liens = agent(0, true);
        avec_liens
            .liens
            .insert("c5".into(), "mailto:a.diallo@exemple.com".into());
        let agents = [avec_liens, agent(1, true)];
        let noms = ["Aïssatou DIALLO".to_string(), "Jean DUPONT".to_string()];
        let fiches = ["BEGIN:VCARD\r\nEND:VCARD".to_string(), String::new()];
        let dossier = std::env::temp_dir()
            .join("automat-process-tests")
            .join("numerique");
        let _ = std::fs::remove_dir_all(&dossier);
        let options = |format| OptionsNumerique {
            format,
            largeur_px: 600,
            verso: true,
        };
        let png = exporter_numerique(
            &moteur,
            &projet,
            &agents,
            &noms,
            &fiches,
            options(FormatNumerique::Png),
            dossier.to_str().unwrap(),
            "png",
        )
        .unwrap();
        let png = std::path::Path::new(&png);
        let image = std::fs::read(png.join("Aïssatou DIALLO.png")).unwrap();
        assert_eq!(imagesize::blob_size(&image).unwrap().width, 600);
        assert!(png.join("_Verso.png").exists());
        assert!(png.join("Aïssatou DIALLO.vcf").exists());
        assert!(!png.join("Jean DUPONT.vcf").exists());

        let pdf = exporter_numerique(
            &moteur,
            &projet,
            &agents,
            &noms,
            &fiches,
            options(FormatNumerique::Pdf),
            dossier.to_str().unwrap(),
            "pdf",
        )
        .unwrap();
        let pdf = std::fs::read(std::path::Path::new(&pdf).join("Aïssatou DIALLO.pdf")).unwrap();
        let contient = |motif: &[u8]| pdf.windows(motif.len()).any(|fenetre| fenetre == motif);
        // Lien cliquable, et pas de zone de coupe : c'est une carte pour l'écran.
        assert!(contient(b"mailto:a.diallo@exemple.com"));
        assert!(!contient(b"/TrimBox"));
    }

    #[test]
    fn bon_a_tirer_une_page_par_carte() {
        let moteur = Moteur::nouveau();
        let mut premiere = agent(0, true);
        premiere.libelle = Some("Aïssatou DIALLO".into());
        let agents = [premiere, agent(1, true)];
        let pdf = bon_a_tirer(
            &moteur,
            &projet_demo(),
            &agents,
            "Cartes 2026",
            "29 octobre 2026",
        )
        .unwrap();
        let document = lopdf::Document::load_mem(&pdf).unwrap();
        assert_eq!(document.get_pages().len(), 2);
        let texte = document.extract_text(&[1]).unwrap();
        assert!(texte.contains("Aïssatou DIALLO") && texte.contains("Cartes 2026"));
        assert!(texte.contains("BON") && texte.contains("Bon pour accord"));
        assert!(bon_a_tirer(&moteur, &projet_demo(), &[], "", "").is_err());

        // En anglais (langue imposée au gabarit : la langue du cœur reste celle des autres tests).
        let entrees = [
            ("mode", "bat"),
            ("titre", "Cards 2026"),
            ("date", "4 November 2026"),
            ("langue", "en"),
        ];
        let pdf = compiler(&moteur, &projet_demo(), &agents, &entrees)
            .unwrap()
            .pdf()
            .unwrap();
        let texte = lopdf::Document::load_mem(&pdf)
            .unwrap()
            .extract_text(&[1])
            .unwrap();
        assert!(
            texte.contains("PROOF") && texte.contains("Approved after corrections"),
            "{texte}"
        );
        assert!(!texte.contains("Bon pour accord"));
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

    /// Cartes numériques : la version écran d'un visuel remplace celle de l'imprimeur, qui reste
    /// celle de l'aperçu, de la mosaïque et des PDF d'impression.
    #[test]
    fn cartes_numeriques_avec_la_version_ecran() {
        let moteur = Moteur::nouveau();
        let uni = |r, v, b| {
            let mut image = tiny_skia::Pixmap::new(85, 55).unwrap();
            image.fill(tiny_skia::Color::from_rgba8(r, v, b, 255));
            Bytes::new(image.encode_png().unwrap())
        };
        let mut projet = projet_importe();
        projet.fonds.insert("/fonds/1.png".into(), uni(0, 0, 255));
        projet.fonds.insert("/fonds/2.png".into(), uni(255, 0, 0));
        projet.modele["fond_recto_avec_fond_perdu"] = false.into();
        projet.modele["fond_recto_ecran"] = "/fonds/2.png".into();
        let agents = [agent(0, false)];
        let coin = |entrees: &[(&str, &str)]| {
            let document = compiler(&moteur, &projet, &agents, entrees).unwrap();
            let (_, _, rvba) = document.pixels(0, 1.0).unwrap();
            (rvba[0], rvba[1], rvba[2])
        };
        assert_eq!(coin(&[("mode", "mosaique")]), (0, 0, 255));
        assert_eq!(coin(&[("mode", "cartes")]), (0, 0, 255));
        assert_eq!(coin(&[("mode", "ecran"), ("profil", "ecran")]), (255, 0, 0));

        let dossier = std::env::temp_dir()
            .join("automat-process-tests")
            .join("version-ecran");
        let _ = std::fs::remove_dir_all(&dossier);
        let options = OptionsNumerique {
            format: FormatNumerique::Png,
            largeur_px: 400,
            verso: false,
        };
        let cree = exporter_numerique(
            &moteur,
            &projet,
            &agents,
            &["Aïssatou DIALLO".to_string()],
            &[String::new()],
            options,
            dossier.to_str().unwrap(),
            "png",
        )
        .unwrap();
        let png = std::fs::read(std::path::Path::new(&cree).join("Aïssatou DIALLO.png")).unwrap();
        let image = tiny_skia::Pixmap::decode_png(&png).unwrap();
        let pixel = image.pixel(0, 0).unwrap();
        assert_eq!((pixel.red(), pixel.green(), pixel.blue()), (255, 0, 0));
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

    /// Mise à jour incrémentale : un projet rouvert (visuels sous d'autres chemins virtuels, clés dans
    /// un autre ordre) garde l'empreinte de son modèle ; un autre visuel ou un champ déplacé la change.
    #[test]
    fn empreinte_du_modele_independante_des_chemins_virtuels() {
        let projet = projet_importe();
        let empreinte = empreinte_modele(&projet.modele, &projet.fonds);
        assert_eq!(empreinte.len(), 16);
        let mut rouvert = serde_json::json!({ "champs": projet.modele["champs"].clone() });
        for (cle, valeur) in projet.modele.as_object().unwrap().iter().rev() {
            rouvert[cle] = valeur.clone();
        }
        rouvert["fond_recto"] = "/fonds/7.png".into();
        rouvert["nom"] = "Autre nom".into();
        rouvert["verrouille"] = true.into();
        let meme_visuel = Fichiers::from([(
            "/fonds/7.png".to_string(),
            projet.fonds["/fonds/1.png"].clone(),
        )]);
        assert_eq!(empreinte_modele(&rouvert, &meme_visuel), empreinte);

        let autre_visuel = Fichiers::from([(
            "/fonds/7.png".to_string(),
            Bytes::new(&include_bytes!("../icons/32x32.png")[..]),
        )]);
        assert_ne!(empreinte_modele(&rouvert, &autre_visuel), empreinte);
        let mut deplace = projet.modele.clone();
        deplace["champs"][0]["x_mm"] = 7.into();
        assert_ne!(empreinte_modele(&deplace, &projet.fonds), empreinte);
    }

    /// Image PNG unie, pour reconnaître un visuel ou une photo à la couleur d'un pixel.
    fn uni(largeur: u32, hauteur: u32, (r, v, b): (u8, u8, u8)) -> Bytes {
        let mut image = tiny_skia::Pixmap::new(largeur, hauteur).unwrap();
        image.fill(tiny_skia::Color::from_rgba8(r, v, b, 255));
        Bytes::new(image.encode_png().unwrap())
    }

    /// Couleur d'un pixel (à `x_mm`, `y_mm` de la carte finie) de la page `page` d'un document.
    fn couleur(document: &Document, page: usize, x_mm: f64, y_mm: f64) -> (u8, u8, u8) {
        let pixels_par_point = 2.0;
        let (largeur, _, rvba) = document.pixels(page, pixels_par_point).unwrap();
        let px = |mm: f64| (mm / MM_PAR_POINT * pixels_par_point) as u32;
        let i = ((px(y_mm) * largeur + px(x_mm)) * 4) as usize;
        (rvba[i], rvba[i + 1], rvba[i + 2])
    }

    const BLEU: (u8, u8, u8) = (0, 0, 255);
    const ROUGE: (u8, u8, u8) = (255, 0, 0);
    const VERT: (u8, u8, u8) = (0, 160, 0);

    /// Modèle aux visuels unis : bleu pour le modèle, rouge pour la variante « Douala » (recto et verso).
    fn projet_a_variantes() -> Projet {
        let mut projet = projet_importe();
        projet
            .fonds
            .insert("/fonds/1.png".into(), uni(85, 55, BLEU));
        projet
            .fonds
            .insert("/fonds/2.png".into(), uni(85, 55, ROUGE));
        projet
            .fonds
            .insert("/fonds/3.png".into(), uni(85, 55, VERT));
        projet.modele["fond_recto_avec_fond_perdu"] = false.into();
        projet.modele["variantes"] = serde_json::json!({ "balise": "Filiale", "valeurs": [
            { "id": "v1", "valeur": "Douala", "fond_recto": "/fonds/2.png", "fond_recto_avec_fond_perdu": false,
              "fond_verso": "/fonds/3.png", "fond_verso_avec_fond_perdu": false },
            { "id": "v2", "valeur": "Abidjan" },
        ] });
        projet
    }

    /// Variantes : chaque agent a le recto et le verso de sa variante ; sans variante (ou pour une
    /// variante sans visuel), ceux du modèle ; un verso blanc quand le modèle n'en a pas.
    #[test]
    fn chaque_agent_a_les_visuels_de_sa_variante() {
        let moteur = Moteur::nouveau();
        let projet = projet_a_variantes();
        let mut douala = agent(0, false);
        douala.variante = Some(0);
        let mut abidjan = agent(1, false);
        abidjan.variante = Some(1);
        let agents = [douala, abidjan, agent(2, false)];
        let cartes = compiler(&moteur, &projet, &agents, &[("mode", "cartes")]).unwrap();
        // Un verso pour chaque carte, puisqu'une variante en a un.
        assert_eq!(cartes.nb_pages(), 6);
        let coin = |page| couleur(&cartes, page, 1.0, 1.0);
        assert_eq!(coin(0), ROUGE);
        assert_eq!(coin(1), VERT);
        assert_eq!(coin(2), BLEU);
        assert_eq!(coin(3), (255, 255, 255));
        assert_eq!(coin(4), BLEU);
        assert!(avec_verso(&projet));
        assert!(!avec_verso(&projet_importe()));
    }

    /// Cartes numériques : le verso, le même pour les agents d'une variante, est fourni une fois par variante.
    #[test]
    fn cartes_numeriques_un_verso_par_variante() {
        let moteur = Moteur::nouveau();
        let mut projet = projet_a_variantes();
        projet.modele["fond_verso"] = "/fonds/1.png".into();
        let mut douala = agent(0, false);
        douala.variante = Some(0);
        let agents = [douala, agent(1, false), agent(2, false)];
        let noms = ["A", "B", "C"].map(String::from);
        let dossier = std::env::temp_dir()
            .join("automat-process-tests")
            .join("numerique-variantes");
        let _ = std::fs::remove_dir_all(&dossier);
        let options = OptionsNumerique {
            format: FormatNumerique::Png,
            largeur_px: 300,
            verso: true,
        };
        let cree = exporter_numerique(
            &moteur,
            &projet,
            &agents,
            &noms,
            &[],
            options,
            dossier.to_str().unwrap(),
            "png",
        )
        .unwrap();
        let cree = std::path::Path::new(&cree);
        assert!(cree.join("_Verso.png").exists());
        assert!(cree.join("_Verso - Douala.png").exists());
        assert_eq!(std::fs::read_dir(cree).unwrap().count(), 5);
    }

    /// Photos : la photo couvre son cadre (recadrée, jamais déformée), sous les textes ; un agent sans
    /// photo garde le visuel à cet endroit.
    #[test]
    fn photo_recadree_dans_son_cadre() {
        let moteur = Moteur::nouveau();
        let mut projet = projet_a_variantes();
        projet.modele["variantes"] = serde_json::Value::Null;
        // Photo en paysage (rouge à gauche, vert à droite) dans un cadre carré de 20 mm, rond.
        let mut image = tiny_skia::Pixmap::new(200, 100).unwrap();
        image.fill(tiny_skia::Color::from_rgba8(255, 0, 0, 255));
        let vert = tiny_skia::Paint {
            shader: tiny_skia::Shader::SolidColor(tiny_skia::Color::from_rgba8(0, 160, 0, 255)),
            ..Default::default()
        };
        image.fill_rect(
            tiny_skia::Rect::from_xywh(100.0, 0.0, 100.0, 100.0).unwrap(),
            &vert,
            tiny_skia::Transform::identity(),
            None,
        );
        projet.fonds.insert(
            "/photos/9.png".into(),
            Bytes::new(image.encode_png().unwrap()),
        );
        projet.modele["champs"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "id": "p1", "type": "photo", "x_mm": 50, "y_mm": 10, "largeur_mm": 20, "hauteur_mm": 20,
                "balise": "Photo", "forme": "cercle"
            }));
        let photo = |centre_x| PhotoAgent {
            chemin: "/photos/9.png".into(),
            largeur_px: 200.0,
            hauteur_px: 100.0,
            centre_x,
            centre_y: 0.5,
            zoom: 1.0,
        };
        let mut a_gauche = agent(0, false);
        a_gauche.photos.insert("p1".into(), photo(0.0));
        let mut a_droite = agent(1, false);
        a_droite.photos.insert("p1".into(), photo(0.8));
        let agents = [a_gauche, a_droite, agent(2, false)];
        let cartes = compiler(&moteur, &projet, &agents, &[("mode", "mosaique")]).unwrap();
        // Centre du cadre : la moitié gauche (rouge) visée, puis la droite (verte) ; sans photo, le visuel.
        assert_eq!(couleur(&cartes, 0, 60.0, 20.0), ROUGE);
        assert_eq!(couleur(&cartes, 1, 60.0, 20.0), VERT);
        assert_eq!(couleur(&cartes, 2, 60.0, 20.0), BLEU);
        // Cadre rond : son coin reste le visuel.
        assert_eq!(couleur(&cartes, 0, 50.5, 10.5), BLEU);
        // Hors du cadre, le visuel.
        assert_eq!(couleur(&cartes, 0, 75.0, 20.0), BLEU);
    }

    /// Reconnaissance de caractères (Windows) : « EXEMPLE SA » du visuel de démonstration (SVG : Arial
    /// gras 9 pt, bleu nuit, en x = 54 pt, ligne de base à 40,3 pt, fond perdu de 3 mm) est lu à sa
    /// place, à sa taille et dans sa couleur. Sans le module de langue de Windows, le test s'arrête là.
    #[cfg(windows)]
    #[test]
    fn lit_les_textes_du_visuel_de_demonstration() {
        let moteur = Moteur::nouveau();
        let textes = match reconnaitre_textes(&moteur, &projet_demo()) {
            Ok(textes) => textes,
            Err(erreur) => {
                eprintln!(
                    "Reconnaissance de caractères indisponible : {}",
                    erreur.message
                );
                return;
            }
        };
        let lu = textes
            .iter()
            .find(|t| t.texte.to_uppercase().contains("EXEMPLE SA"))
            .unwrap_or_else(|| panic!("« EXEMPLE SA » non lu : {textes:?}"));
        let mm = |pt: f64| pt * MM_PAR_POINT - 3.0;
        assert!((lu.x_mm - mm(54.0)).abs() < 1.0, "{lu:?}");
        assert!((lu.y_mm - mm(40.3)).abs() < 0.8, "{lu:?}");
        assert!((lu.taille_pt - 9.0).abs() < 1.0, "{lu:?}");
        let canal = |i: usize| i64::from_str_radix(&lu.couleur[i..i + 2], 16).unwrap();
        let attendu = [0x1d, 0x35, 0x57];
        assert!(
            (0..3).all(|c| (canal(1 + 2 * c) - attendu[c]).abs() < 30),
            "{lu:?}"
        );
        assert!(
            lu.zone.largeur_mm > 15.0 && lu.zone.hauteur_mm > 2.0,
            "{lu:?}"
        );
    }

    /// Effacement intelligent d'un texte dans un visuel en image : seul le texte est repeint ; un
    /// visuel vectoriel est refusé (il garde l'aplat de couleur).
    #[test]
    fn efface_un_texte_d_un_visuel_en_image() {
        // Visuel au format fini (85 × 55 mm à 10 px par mm), bleu nuit, avec un « texte » blanc.
        let mut image = tiny_skia::Pixmap::new(850, 550).unwrap();
        image.fill(tiny_skia::Color::from_rgba8(29, 53, 87, 255));
        let blanc = tiny_skia::Paint {
            shader: tiny_skia::Shader::SolidColor(tiny_skia::Color::WHITE),
            ..Default::default()
        };
        for x in (200..400).step_by(14) {
            let trait_ = tiny_skia::Rect::from_xywh(x as f32, 290.0, 6.0, 22.0).unwrap();
            image.fill_rect(trait_, &blanc, tiny_skia::Transform::identity(), None);
        }
        let mut projet = projet_importe();
        projet.fonds.insert(
            "/fonds/1.png".into(),
            Bytes::new(image.encode_png().unwrap()),
        );
        projet.modele["fond_recto_avec_fond_perdu"] = false.into();
        let zone = Zone {
            x_mm: 19.0,
            y_mm: 28.0,
            largeur_mm: 22.0,
            hauteur_mm: 4.0,
        };
        let (octets, extension) = effacer_texte(&projet, &[zone]).unwrap();
        assert_eq!(extension, "png");
        let efface = image::load_from_memory(&octets).unwrap().to_rgba8();
        assert_eq!(efface.dimensions(), (850, 550));
        assert!(efface.pixels().all(|p| p.0 == [29, 53, 87, 255]));
        assert!(effacer_texte(&projet_demo(), &[zone]).is_err());
    }
}
