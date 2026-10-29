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
        let genre = match extension.as_str() {
            "svg" => Genre::Svg,
            "pdf" => Genre::Pdf,
            "png" | "jpg" | "jpeg" => Genre::Image,
            _ => {
                return Err(ErreurMoteur::simple(format!(
                    "Format de visuel non pris en charge (.{extension}) : utilisez un PDF, un SVG, un PNG ou un JPG."
                )));
            }
        };
        let illisible = |erreur: std::io::Error| {
            ErreurMoteur::simple(format!("Impossible de lire « {chemin_disque} » : {erreur}"))
        };
        if std::fs::metadata(chemin).map_err(illisible)?.len() > TAILLE_MAX {
            return Err(ErreurMoteur::simple("Le visuel dépasse 50 Mo."));
        }
        let octets = std::fs::read(chemin).map_err(illisible)?;
        let mut fond = decrire(&octets, genre)?;
        fond.nom_fichier = chemin
            .file_name()
            .map(|nom| nom.to_string_lossy().into_owned())
            .unwrap_or_default();
        let numero = self.compteur.fetch_add(1, Ordering::Relaxed) + 1;
        fond.chemin = format!("/fonds/{numero}.{extension}");
        self.fichiers
            .lock()
            .expect("réserve des fonds")
            .insert(fond.chemin.clone(), Bytes::new(octets));
        Ok(fond)
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
