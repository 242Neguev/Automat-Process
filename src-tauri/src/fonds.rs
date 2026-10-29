//! Visuels importés par l'utilisateur (fonds du recto et du verso). Ils restent en mémoire
//! pendant la session et sont servis au moteur comme fichiers virtuels « /fonds/… ».

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use hayro_syntax::Pdf;
use hayro_syntax::object::Rect;
use serde::Serialize;
use typst::foundations::Bytes;

use crate::moteur::{ErreurMoteur, Fichiers};
use crate::pdf_textes::{self, TextePdf};

const TAILLE_MAX: u64 = 50 * 1024 * 1024;
const MM_PAR_POINT: f64 = 25.4 / 72.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Genre {
    Svg,
    Pdf,
    Image,
}

/// Ce que l'interface doit savoir d'un visuel importé.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FondImporte {
    /// Chemin virtuel à reprendre dans le modèle (« /fonds/1.pdf »).
    pub chemin: String,
    pub nom_fichier: String,
    pub genre: Genre,
    /// Dimensions physiques connues (PDF : zone visible), en mm.
    pub largeur_mm: Option<f64>,
    pub hauteur_mm: Option<f64>,
    /// Marge entre la zone visible et la zone de coupe (TrimBox) d'un PDF : son fond perdu, en mm.
    pub fond_perdu_mm: Option<f64>,
    /// Dimensions d'une image, en pixels.
    pub largeur_px: Option<u32>,
    pub hauteur_px: Option<u32>,
    /// Source d'un SVG, analysée par l'interface (balises, dimensions).
    pub texte: Option<String>,
    /// PDF : lignes à balises {{…}}, retirées du visuel pour devenir des champs.
    pub champs: Vec<TextePdf>,
    /// PDF : autres lignes de texte (textes d'exemple que l'on peut remplacer d'un clic).
    pub textes: Vec<TextePdf>,
}

/// Résultat du remplacement d'un texte d'exemple d'un PDF.
#[derive(Debug, Serialize)]
pub struct TexteRetire {
    /// La ligne retirée du visuel : elle devient un champ au même endroit et au même style.
    pub texte: TextePdf,
    /// Les lignes qui restent dans le visuel.
    pub textes: Vec<TextePdf>,
}

#[derive(Default)]
pub struct Fonds {
    fichiers: Mutex<Fichiers>,
    compteur: AtomicUsize,
}

impl Fonds {
    /// Lit un visuel sur le disque, le garde en mémoire et décrit ce qu'il contient.
    pub fn importer(&self, chemin_disque: &str) -> Result<FondImporte, ErreurMoteur> {
        let chemin = Path::new(chemin_disque);
        let extension = chemin
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_lowercase)
            .unwrap_or_default();
        genre_de(&extension)?;
        let illisible = |erreur: std::io::Error| {
            ErreurMoteur::simple(format!("Impossible de lire « {chemin_disque} » : {erreur}"))
        };
        if std::fs::metadata(chemin).map_err(illisible)?.len() > TAILLE_MAX {
            return Err(ErreurMoteur::simple("Le visuel dépasse 50 Mo."));
        }
        let octets = std::fs::read(chemin).map_err(illisible)?;
        let nom_fichier = chemin
            .file_name()
            .map(|nom| nom.to_string_lossy().into_owned())
            .unwrap_or_default();
        self.ajouter(octets, &extension, nom_fichier)
    }

    /// Garde un visuel en mémoire sous un nouveau chemin virtuel et décrit ce qu'il contient.
    pub fn ajouter(
        &self,
        octets: Vec<u8>,
        extension: &str,
        nom_fichier: String,
    ) -> Result<FondImporte, ErreurMoteur> {
        let genre = genre_de(extension)?;
        let mut fond = decrire(&octets, genre)?;
        let mut octets = octets;
        if genre == Genre::Pdf {
            // Un PDF dont le texte est illisible reste utilisable comme simple fond.
            let lignes = pdf_textes::lister(&octets).unwrap_or_default();
            let balises: Vec<usize> = lignes
                .iter()
                .filter(|ligne| ligne.texte.contains("{{"))
                .map(|ligne| ligne.id)
                .collect();
            if balises.is_empty() {
                fond.textes = lignes;
            } else {
                octets = pdf_textes::retirer(&octets, &balises)?;
                fond.champs = lignes
                    .into_iter()
                    .filter(|ligne| balises.contains(&ligne.id))
                    .collect();
                fond.textes = pdf_textes::lister(&octets).unwrap_or_default();
            }
        }
        fond.nom_fichier = nom_fichier;
        let numero = self.compteur.fetch_add(1, Ordering::Relaxed) + 1;
        fond.chemin = format!("/fonds/{numero}.{extension}");
        self.fichiers
            .lock()
            .expect("réserve des fonds")
            .insert(fond.chemin.clone(), Bytes::new(octets));
        Ok(fond)
    }

    /// Retire une ligne de texte d'un visuel PDF (texte d'exemple remplacé par un champ).
    pub fn retirer_texte_pdf(&self, chemin: &str, id: usize) -> Result<TexteRetire, ErreurMoteur> {
        let inconnu = || ErreurMoteur::simple(format!("Visuel PDF inconnu : {chemin}"));
        let octets = self
            .contenu(chemin)
            .filter(|_| chemin.ends_with(".pdf"))
            .ok_or_else(inconnu)?;
        let texte = pdf_textes::lister(&octets)?
            .into_iter()
            .find(|ligne| ligne.id == id)
            .ok_or_else(|| ErreurMoteur::simple("Ce texte n'existe plus dans le visuel."))?;
        let nettoye = pdf_textes::retirer(&octets, &[id])?;
        let textes = pdf_textes::lister(&nettoye)?;
        self.fichiers
            .lock()
            .expect("réserve des fonds")
            .insert(chemin.to_string(), Bytes::new(nettoye));
        Ok(TexteRetire { texte, textes })
    }

    /// Contenu d'un visuel gardé en mémoire.
    pub fn contenu(&self, chemin: &str) -> Option<Bytes> {
        self.fichiers
            .lock()
            .expect("réserve des fonds")
            .get(chemin)
            .cloned()
    }

    /// Remplace un SVG importé par sa version nettoyée (balises retirées par l'interface).
    pub fn remplacer_svg(&self, chemin: &str, svg: String) -> Result<(), ErreurMoteur> {
        let mut fichiers = self.fichiers.lock().expect("réserve des fonds");
        match fichiers.get_mut(chemin) {
            Some(contenu) if chemin.ends_with(".svg") => {
                *contenu = Bytes::new(svg.into_bytes());
                Ok(())
            }
            _ => Err(ErreurMoteur::simple(format!("Visuel inconnu : {chemin}"))),
        }
    }

    /// Copie des fichiers virtuels (les contenus sont partagés, la copie est légère).
    pub fn fichiers(&self) -> Fichiers {
        self.fichiers.lock().expect("réserve des fonds").clone()
    }
}

fn genre_de(extension: &str) -> Result<Genre, ErreurMoteur> {
    match extension {
        "svg" => Ok(Genre::Svg),
        "pdf" => Ok(Genre::Pdf),
        "png" | "jpg" | "jpeg" => Ok(Genre::Image),
        _ => Err(ErreurMoteur::simple(format!(
            "Format de visuel non pris en charge (.{extension}) : utilisez un PDF, un SVG, un PNG ou un JPG."
        ))),
    }
}

fn decrire(octets: &[u8], genre: Genre) -> Result<FondImporte, ErreurMoteur> {
    let mut fond = FondImporte {
        chemin: String::new(),
        nom_fichier: String::new(),
        genre,
        largeur_mm: None,
        hauteur_mm: None,
        fond_perdu_mm: None,
        largeur_px: None,
        hauteur_px: None,
        texte: None,
        champs: Vec::new(),
        textes: Vec::new(),
    };
    match genre {
        Genre::Svg => {
            let texte = String::from_utf8(octets.to_vec())
                .map_err(|_| ErreurMoteur::simple("Ce SVG n'est pas un texte UTF-8 valide."))?;
            fond.texte = Some(texte);
        }
        Genre::Pdf => {
            let pdf = Pdf::new(Arc::new(octets.to_vec()))
                .map_err(|_| ErreurMoteur::simple("Ce PDF est illisible ou protégé."))?;
            let page = pdf
                .pages()
                .first()
                .ok_or_else(|| ErreurMoteur::simple("Ce PDF ne contient aucune page."))?;
            let visible = page.crop_box();
            fond.largeur_mm = Some((visible.x1 - visible.x0) * MM_PAR_POINT);
            fond.hauteur_mm = Some((visible.y1 - visible.y0) * MM_PAR_POINT);
            fond.fond_perdu_mm = page
                .raw()
                .get::<Rect>(b"TrimBox")
                .map(|coupe| (coupe.x0 - visible.x0).max(0.0) * MM_PAR_POINT);
        }
        Genre::Image => {
            let taille = imagesize::blob_size(octets)
                .map_err(|_| ErreurMoteur::simple("Cette image est illisible."))?;
            fond.largeur_px = Some(taille.width as u32);
            fond.hauteur_px = Some(taille.height as u32);
        }
    }
    Ok(fond)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ecrire(nom: &str, octets: &[u8]) -> String {
        let dossier = std::env::temp_dir().join("automat-process-tests");
        std::fs::create_dir_all(&dossier).unwrap();
        let chemin = dossier.join(nom);
        std::fs::write(&chemin, octets).unwrap();
        chemin.to_string_lossy().into_owned()
    }

    #[test]
    fn mesure_un_pdf_et_son_fond_perdu() {
        let fonds = Fonds::default();
        let pdf = ecrire("verso.pdf", include_bytes!("../ressources/demo/verso.pdf"));
        let fond = fonds.importer(&pdf).unwrap();
        assert_eq!(fond.genre, Genre::Pdf);
        assert_eq!(fond.chemin, "/fonds/1.pdf");
        assert!((fond.largeur_mm.unwrap() - 91.0).abs() < 0.1);
        assert!((fond.hauteur_mm.unwrap() - 61.0).abs() < 0.1);
        assert!(fonds.fichiers().contains_key("/fonds/1.pdf"));
    }

    #[test]
    fn mesure_une_image_et_garde_le_texte_d_un_svg() {
        let fonds = Fonds::default();
        let png = ecrire("icone.png", include_bytes!("../icons/32x32.png"));
        let image = fonds.importer(&png).unwrap();
        assert_eq!((image.largeur_px, image.hauteur_px), (Some(32), Some(32)));
        let svg = ecrire(
            "recto.svg",
            include_bytes!("../ressources/demo/recto-fond.svg"),
        );
        let fond = fonds.importer(&svg).unwrap();
        assert!(fond.texte.unwrap().contains("<svg"));
        fonds.remplacer_svg(&fond.chemin, "<svg/>".into()).unwrap();
        assert!(
            fonds
                .remplacer_svg("/fonds/1.png", "<svg/>".into())
                .is_err()
        );
    }

    #[test]
    fn refuse_les_formats_inconnus() {
        let fichier = ecrire("modele.cdr", b"CorelDRAW");
        let erreur = Fonds::default().importer(&fichier).unwrap_err();
        assert!(erreur.message.contains(".cdr"));
    }
}
