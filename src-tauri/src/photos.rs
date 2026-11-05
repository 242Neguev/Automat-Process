//! Photos des agents : lues dans le dossier choisi par l'utilisateur (ou au chemin donné par la liste),
//! redressées d'après leur orientation EXIF, réduites et gardées en mémoire comme fichiers virtuels
//! « /photos/… ». Sous Windows, le visage est repéré (détection intégrée au système, hors ligne) pour
//! centrer d'office le recadrage.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::fonds::Fonds;
use crate::tr;

/// Plus grand côté d'une photo gardée : 1 200 px suffisent pour une photo d'identité imprimée à 300 dpi.
const COTE_MAX: u32 = 1200;
/// Plus grand côté de l'image où l'on cherche le visage (plus rapide, aussi fiable).
const COTE_DETECTION: u32 = 640;
const TAILLE_MAX: u64 = 40 * 1024 * 1024;
const EXTENSIONS: [&str; 3] = ["jpg", "jpeg", "png"];

/// Visage repéré : son centre et sa hauteur, en fractions de la photo (0 à 1, depuis le haut-gauche).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Visage {
    pub x: f64,
    pub y: f64,
    pub hauteur: f64,
}

/// Une photo demandée par l'interface, telle qu'elle a pu être chargée.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoChargee {
    /// Valeur de la colonne : nom du fichier (avec ou sans extension) ou chemin complet.
    pub nom: String,
    /// Chemin virtuel de la photo réduite (« /photos/3.jpg ») ; absent si elle manque.
    pub chemin: Option<String>,
    pub largeur_px: u32,
    pub hauteur_px: u32,
    pub visage: Option<Visage>,
    /// Pourquoi la photo manque : « introuvable » ou la raison de l'échec de lecture.
    pub erreur: Option<String>,
}

/// Photos déjà chargées pendant la session, par fichier (chemin, taille, date) : une liste réimportée
/// ne relit pas ses photos.
#[derive(Default)]
pub struct Photos {
    cache: Mutex<HashMap<String, PhotoChargee>>,
}

impl Photos {
    /// Charge les photos désignées par `noms`, cherchées dans `dossier` quand ce ne sont pas des chemins.
    pub fn charger(&self, fonds: &Fonds, dossier: &str, noms: &[String]) -> Vec<PhotoChargee> {
        noms.iter()
            .map(|nom| self.charger_une(fonds, Path::new(dossier), nom))
            .collect()
    }

    fn charger_une(&self, fonds: &Fonds, dossier: &Path, nom: &str) -> PhotoChargee {
        let manque = |erreur: String| PhotoChargee {
            nom: nom.to_string(),
            chemin: None,
            largeur_px: 0,
            hauteur_px: 0,
            visage: None,
            erreur: Some(erreur),
        };
        let Some(fichier) = trouver(dossier, nom) else {
            return manque(crate::langue::texte("introuvable", "not found").into());
        };
        let cle = std::fs::metadata(&fichier)
            .map(|m| format!("{}|{}|{:?}", fichier.display(), m.len(), m.modified().ok()))
            .unwrap_or_default();
        if let Some(deja) = self
            .cache
            .lock()
            .expect("photos")
            .get(&cle)
            .filter(|_| !cle.is_empty())
        {
            return PhotoChargee {
                nom: nom.to_string(),
                ..deja.clone()
            };
        }
        match preparer(&fichier) {
            Ok(photo) => {
                let chargee = PhotoChargee {
                    nom: nom.to_string(),
                    chemin: Some(fonds.ajouter_photo(photo.jpeg)),
                    largeur_px: photo.largeur,
                    hauteur_px: photo.hauteur,
                    visage: detecter_visage(&photo.gris, photo.largeur_gris, photo.hauteur_gris),
                    erreur: None,
                };
                self.cache
                    .lock()
                    .expect("photos")
                    .insert(cle, chargee.clone());
                chargee
            }
            Err(erreur) => manque(erreur),
        }
    }
}

/// Fichier d'une photo : chemin complet, ou nom (avec ou sans extension) dans le dossier choisi.
pub fn trouver(dossier: &Path, nom: &str) -> Option<PathBuf> {
    let nom = nom.trim();
    if nom.is_empty() {
        return None;
    }
    let image = |chemin: &Path| {
        chemin.is_file()
            && chemin
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| EXTENSIONS.contains(&e.to_lowercase().as_str()))
    };
    let direct = if Path::new(nom).is_absolute() {
        PathBuf::from(nom)
    } else {
        dossier.join(nom)
    };
    if image(direct.as_path()) {
        return Some(direct);
    }
    EXTENSIONS
        .iter()
        .flat_map(|e| [e.to_string(), e.to_uppercase()])
        .map(|extension| PathBuf::from(format!("{}.{extension}", direct.display())))
        .find(|chemin| image(chemin.as_path()))
}

struct PhotoPreparee {
    jpeg: Vec<u8>,
    largeur: u32,
    hauteur: u32,
    /// Version réduite en niveaux de gris, pour chercher le visage.
    gris: Vec<u8>,
    largeur_gris: u32,
    hauteur_gris: u32,
}

/// Lit une photo, la redresse, la réduit et l'aplatit sur du blanc (JPEG de qualité 90).
fn preparer(fichier: &Path) -> Result<PhotoPreparee, String> {
    use image::{DynamicImage, ImageDecoder, ImageReader, imageops::FilterType};
    let illisible =
        |erreur: &dyn std::fmt::Display| tr!("illisible ({erreur})", "unreadable ({erreur})");
    let taille = std::fs::metadata(fichier).map_err(|e| illisible(&e))?.len();
    if taille > TAILLE_MAX {
        return Err(
            crate::langue::texte("trop lourde (plus de 40 Mo)", "too heavy (over 40 MB)").into(),
        );
    }
    let mut decodeur = ImageReader::open(fichier)
        .map_err(|e| illisible(&e))?
        .with_guessed_format()
        .map_err(|e| illisible(&e))?
        .into_decoder()
        .map_err(|e| illisible(&e))?;
    let orientation = decodeur
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut photo = DynamicImage::from_decoder(decodeur).map_err(|e| illisible(&e))?;
    photo.apply_orientation(orientation);
    if photo.width().max(photo.height()) > COTE_MAX {
        photo = photo.resize(COTE_MAX, COTE_MAX, FilterType::Lanczos3);
    }
    // Une photo détourée (PNG transparent) est posée sur du blanc, comme sur la carte.
    let mut rvba = photo.to_rgba8();
    for pixel in rvba.pixels_mut() {
        let [r, v, b, a] = pixel.0;
        let melange =
            |c: u8| ((u32::from(c) * u32::from(a) + 255 * (255 - u32::from(a))) / 255) as u8;
        pixel.0 = [melange(r), melange(v), melange(b), 255];
    }
    let rvb = DynamicImage::ImageRgba8(rvba).to_rgb8();
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 90)
        .encode_image(&rvb)
        .map_err(|e| illisible(&e))?;
    let gris = DynamicImage::ImageRgb8(rvb.clone())
        .resize(COTE_DETECTION, COTE_DETECTION, FilterType::Triangle)
        .to_luma8();
    Ok(PhotoPreparee {
        jpeg,
        largeur: rvb.width(),
        hauteur: rvb.height(),
        largeur_gris: gris.width(),
        hauteur_gris: gris.height(),
        gris: gris.into_raw(),
    })
}

/// Le plus grand visage de la photo (détection de Windows 10/11, hors ligne).
#[cfg(windows)]
pub fn detecter_visage(gris: &[u8], largeur: u32, hauteur: u32) -> Option<Visage> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::FaceAnalysis::FaceDetector;
    use windows::Storage::Streams::DataWriter;

    let chercher = || -> windows::core::Result<Option<Visage>> {
        if !FaceDetector::IsSupported()? {
            return Ok(None);
        }
        let ecrivain = DataWriter::new()?;
        ecrivain.WriteBytes(gris)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &ecrivain.DetachBuffer()?,
            BitmapPixelFormat::Gray8,
            largeur as i32,
            hauteur as i32,
        )?;
        let visages = FaceDetector::CreateAsync()?
            .join()?
            .DetectFacesAsync(&bitmap)?
            .join()?;
        let mut plus_grand: Option<windows::Graphics::Imaging::BitmapBounds> = None;
        for i in 0..visages.Size()? {
            let boite = visages.GetAt(i)?.FaceBox()?;
            if plus_grand.is_none_or(|g| boite.Height > g.Height) {
                plus_grand = Some(boite);
            }
        }
        Ok(plus_grand.map(|b| Visage {
            x: (f64::from(b.X) + f64::from(b.Width) / 2.0) / f64::from(largeur),
            y: (f64::from(b.Y) + f64::from(b.Height) / 2.0) / f64::from(hauteur),
            hauteur: f64::from(b.Height) / f64::from(hauteur),
        }))
    };
    chercher().ok().flatten()
}

/// Hors de Windows, pas de détection : le recadrage part du centre de la photo, un peu au-dessus.
#[cfg(not(windows))]
pub fn detecter_visage(_gris: &[u8], _largeur: u32, _hauteur: u32) -> Option<Visage> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier(nom: &str) -> PathBuf {
        let dossier = std::env::temp_dir().join("automat-process-tests").join(nom);
        let _ = std::fs::remove_dir_all(&dossier);
        std::fs::create_dir_all(&dossier).unwrap();
        dossier
    }

    /// Image PNG unie de `largeur` × `hauteur`, éventuellement transparente.
    fn png(largeur: u32, hauteur: u32, alpha: u8) -> Vec<u8> {
        let mut image = tiny_skia::Pixmap::new(largeur, hauteur).unwrap();
        image.fill(tiny_skia::Color::from_rgba8(200, 30, 30, alpha));
        image.encode_png().unwrap()
    }

    #[test]
    fn trouve_une_photo_avec_ou_sans_extension() {
        let dossier = dossier("photos-trouver");
        std::fs::write(dossier.join("jdupont.jpg"), b"x").unwrap();
        std::fs::write(dossier.join("Aïssatou DIALLO.PNG"), b"x").unwrap();
        std::fs::write(dossier.join("notes.txt"), b"x").unwrap();
        assert!(trouver(&dossier, "jdupont.jpg").is_some());
        assert!(trouver(&dossier, " jdupont ").is_some());
        assert!(trouver(&dossier, "Aïssatou DIALLO").is_some());
        let complet = dossier.join("jdupont.jpg");
        assert_eq!(
            trouver(Path::new("ailleurs"), complet.to_str().unwrap()),
            Some(complet)
        );
        assert!(trouver(&dossier, "notes.txt").is_none());
        assert!(trouver(&dossier, "notes").is_none());
        assert!(trouver(&dossier, "").is_none());
    }

    #[test]
    fn reduit_aplatit_et_garde_les_photos() {
        let dossier = dossier("photos-charger");
        std::fs::write(dossier.join("grande.png"), png(3000, 2000, 255)).unwrap();
        std::fs::write(dossier.join("detouree.png"), png(40, 60, 0)).unwrap();
        std::fs::write(dossier.join("abimee.jpg"), b"pas une image").unwrap();
        let fonds = Fonds::default();
        let photos = Photos::default();
        let noms = ["grande", "detouree.png", "abimee.jpg", "absente"].map(String::from);
        let chargees = photos.charger(&fonds, dossier.to_str().unwrap(), &noms);

        let grande = &chargees[0];
        assert_eq!((grande.largeur_px, grande.hauteur_px), (1200, 800));
        let chemin = grande.chemin.as_deref().unwrap();
        assert!(chemin.starts_with("/photos/") && chemin.ends_with(".jpg"));
        let jpeg = fonds.contenu(chemin).unwrap();
        assert_eq!(jpeg[..2], [0xFF, 0xD8]);

        // Transparente : posée sur du blanc.
        let detouree = fonds
            .contenu(chargees[1].chemin.as_deref().unwrap())
            .unwrap();
        let image = image::load_from_memory(&detouree).unwrap().to_rgb8();
        assert!(image.get_pixel(20, 30).0.iter().all(|&c| c > 245));

        assert!(
            chargees[2]
                .erreur
                .as_deref()
                .unwrap()
                .starts_with("illisible")
        );
        assert_eq!(chargees[3].erreur.as_deref(), Some("introuvable"));
        assert!(chargees[3].chemin.is_none());

        // Rechargée : la même photo en mémoire, sans relecture.
        let encore = photos.charger(&fonds, dossier.to_str().unwrap(), &noms[..1]);
        assert_eq!(encore[0].chemin, grande.chemin);
    }
}
