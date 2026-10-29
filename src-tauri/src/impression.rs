//! Impression directe sur une imprimante Windows : imprimante à cartes PVC (Evolis, Zebra,
//! Magicard…) ou toute autre imprimante installée. Chaque carte est rendue à la résolution de
//! l'imprimante, puis envoyée à son pilote à sa taille réelle, centrée sur la page.

use serde::{Deserialize, Serialize};

/// Une imprimante installée.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imprimante {
    pub nom: String,
    pub par_defaut: bool,
    /// Le pilote sait imprimer recto verso.
    pub recto_verso: bool,
}

/// Réglages choisis par l'utilisateur.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reglages {
    /// Le verso de chaque carte est imprimé au dos (sinon, seul le recto est imprimé).
    pub recto_verso: bool,
    /// Le verso est tourné d'un demi-tour, selon le sens où l'imprimante retourne la carte.
    pub retourner_verso: bool,
    /// Exemplaires de chaque carte.
    pub exemplaires: u16,
}

/// Une face à imprimer : numéro de page du document, et s'il s'agit d'un verso.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Face {
    pub page: usize,
    pub verso: bool,
}

/// Rendu d'une page en pixels RVBA à `dpi` points par pouce : (largeur, hauteur, pixels).
pub type Rendu<'a> = dyn Fn(usize, f64) -> Result<(u32, u32, Vec<u8>), String> + 'a;

/// Ordre d'impression : chaque carte (recto, puis verso si demandé), répétée pour les exemplaires.
/// Le document contient, pour chaque carte, son recto suivi de son verso s'il existe.
pub fn faces(nb_cartes: usize, avec_verso: bool, reglages: Reglages) -> Vec<Face> {
    let pages_par_carte = if avec_verso { 2 } else { 1 };
    let mut faces = Vec::new();
    for carte in 0..nb_cartes {
        let recto = carte * pages_par_carte;
        for _ in 0..reglages.exemplaires.max(1) {
            faces.push(Face {
                page: recto,
                verso: false,
            });
            if avec_verso && reglages.recto_verso {
                faces.push(Face {
                    page: recto + 1,
                    verso: true,
                });
            }
        }
    }
    faces
}

/// Demi-tour d'une image RVBA (pour un verso que l'imprimante retourne dans l'autre sens).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn demi_tour(rvba: &mut [u8]) {
    let pixels = rvba.len() / 4;
    for i in 0..pixels / 2 {
        let j = pixels - 1 - i;
        for canal in 0..4 {
            rvba.swap(i * 4 + canal, j * 4 + canal);
        }
    }
}

#[cfg(not(windows))]
pub fn imprimantes() -> Result<Vec<Imprimante>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
pub fn imprimer(
    _imprimante: &str,
    _document: &str,
    _taille_mm: (f64, f64),
    _faces: &[Face],
    _retourner_verso: bool,
    _rendre: &Rendu,
) -> Result<(), String> {
    Err("L'impression directe n'est disponible que sous Windows.".into())
}

#[cfg(windows)]
pub use systeme::{imprimantes, imprimer};

#[cfg(windows)]
mod systeme {
    use std::ffi::c_void;
    use std::mem::size_of;

    use windows::Win32::Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateDCW, DEVMODEW, DIB_RGB_COLORS, DM_COPIES,
        DM_DUPLEX, DM_IN_BUFFER, DM_ORIENTATION, DM_OUT_BUFFER, DMDUP_SIMPLEX, DMDUP_VERTICAL,
        DMORIENT_LANDSCAPE, DMORIENT_PORTRAIT, DeleteDC, GetDeviceCaps, HALFTONE, HDC, LOGPIXELSX,
        LOGPIXELSY, PHYSICALHEIGHT, PHYSICALOFFSETX, PHYSICALOFFSETY, PHYSICALWIDTH, SRCCOPY,
        SetBrushOrgEx, SetStretchBltMode, StretchDIBits,
    };
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, DocumentPropertiesW, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW,
        PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_4W,
    };
    use windows::Win32::Storage::Xps::{
        AbortDoc, DC_DUPLEX, DOCINFOW, DeviceCapabilitiesW, EndDoc, EndPage, StartDocW, StartPage,
    };
    use windows::core::{HSTRING, PCWSTR, PWSTR};

    use super::{Face, Imprimante, Rendu, demi_tour};

    /// Tampon aligné pour les structures de taille variable renvoyées par Windows.
    fn tampon(octets: usize) -> Vec<u64> {
        vec![0; octets.div_ceil(8)]
    }

    pub fn imprimantes() -> Result<Vec<Imprimante>, String> {
        let drapeaux = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let (mut taille, mut nombre) = (0u32, 0u32);
        // Premier appel : il échoue en donnant la taille nécessaire.
        let _ =
            unsafe { EnumPrintersW(drapeaux, PCWSTR::null(), 4, None, &mut taille, &mut nombre) };
        if taille == 0 {
            return Ok(Vec::new());
        }
        let mut memoire = tampon(taille as usize);
        let octets = unsafe {
            std::slice::from_raw_parts_mut(memoire.as_mut_ptr().cast::<u8>(), taille as usize)
        };
        unsafe {
            EnumPrintersW(
                drapeaux,
                PCWSTR::null(),
                4,
                Some(octets),
                &mut taille,
                &mut nombre,
            )
        }
        .map_err(|erreur| format!("Liste des imprimantes illisible : {erreur}"))?;
        let infos = unsafe {
            std::slice::from_raw_parts(memoire.as_ptr().cast::<PRINTER_INFO_4W>(), nombre as usize)
        };
        let defaut = imprimante_par_defaut();
        Ok(infos
            .iter()
            .map(|info| {
                let nom = unsafe { info.pPrinterName.to_string() }.unwrap_or_default();
                Imprimante {
                    par_defaut: defaut.as_deref() == Some(nom.as_str()),
                    recto_verso: sait_imprimer_recto_verso(&nom),
                    nom,
                }
            })
            .collect())
    }

    fn imprimante_par_defaut() -> Option<String> {
        let mut taille = 0u32;
        let _ = unsafe { GetDefaultPrinterW(None, &mut taille) };
        if taille == 0 {
            return None;
        }
        let mut nom = vec![0u16; taille as usize];
        let ok = unsafe { GetDefaultPrinterW(Some(PWSTR(nom.as_mut_ptr())), &mut taille) };
        ok.as_bool()
            .then(|| String::from_utf16_lossy(&nom[..(taille as usize).saturating_sub(1)]))
    }

    fn sait_imprimer_recto_verso(nom: &str) -> bool {
        let nom = HSTRING::from(nom);
        unsafe { DeviceCapabilitiesW(&nom, PCWSTR::null(), DC_DUPLEX, None, None) == 1 }
    }

    /// Réglages du pilote (structure de taille variable : partie publique, puis données propres au
    /// pilote) avec l'orientation de la carte et le recto verso ; le pilote les valide et les complète.
    fn reglages_pilote(
        nom: &HSTRING,
        paysage: bool,
        recto_verso: bool,
    ) -> Result<Vec<u64>, String> {
        let illisibles = || "Les réglages de l'imprimante sont illisibles.".to_string();
        let mut imprimante = PRINTER_HANDLE::default();
        unsafe { OpenPrinterW(nom, &mut imprimante, None) }
            .map_err(|erreur| format!("Imprimante introuvable : {erreur}"))?;
        let resultat = (|| {
            let taille = unsafe { DocumentPropertiesW(None, imprimante, nom, None, None, 0) };
            if taille <= 0 {
                return Err(illisibles());
            }
            let mut memoire = tampon(taille as usize);
            let devmode = memoire.as_mut_ptr().cast::<DEVMODEW>();
            let lu = unsafe {
                DocumentPropertiesW(None, imprimante, nom, Some(devmode), None, DM_OUT_BUFFER.0)
            };
            if lu < 0 {
                return Err(illisibles());
            }
            unsafe {
                let dm = &mut *devmode;
                let orientation = if paysage {
                    DMORIENT_LANDSCAPE
                } else {
                    DMORIENT_PORTRAIT
                };
                dm.Anonymous1.Anonymous1.dmOrientation = orientation as i16;
                // Les exemplaires sont répétés par l'application : le pilote en imprime un seul.
                dm.Anonymous1.Anonymous1.dmCopies = 1;
                dm.dmDuplex = if recto_verso {
                    DMDUP_VERTICAL
                } else {
                    DMDUP_SIMPLEX
                };
                dm.dmFields |= DM_ORIENTATION | DM_COPIES | DM_DUPLEX;
            }
            let valide = unsafe {
                DocumentPropertiesW(
                    None,
                    imprimante,
                    nom,
                    Some(devmode),
                    Some(devmode),
                    (DM_IN_BUFFER | DM_OUT_BUFFER).0,
                )
            };
            if valide < 0 {
                return Err(illisibles());
            }
            Ok(memoire)
        })();
        let _ = unsafe { ClosePrinter(imprimante) };
        resultat
    }

    pub fn imprimer(
        imprimante: &str,
        document: &str,
        taille_mm: (f64, f64),
        faces: &[Face],
        retourner_verso: bool,
        rendre: &Rendu,
    ) -> Result<(), String> {
        let nom = HSTRING::from(imprimante);
        let recto_verso = faces.iter().any(|face| face.verso);
        let devmode = reglages_pilote(&nom, taille_mm.0 > taille_mm.1, recto_verso)?;
        let hdc = unsafe {
            CreateDCW(
                PCWSTR::null(),
                &nom,
                PCWSTR::null(),
                Some(devmode.as_ptr().cast::<DEVMODEW>()),
            )
        };
        if hdc.is_invalid() {
            return Err(format!(
                "Impossible d'ouvrir l'imprimante « {imprimante} »."
            ));
        }
        let resultat = envoyer(hdc, document, taille_mm, faces, retourner_verso, rendre);
        let _ = unsafe { DeleteDC(hdc) };
        resultat
    }

    fn envoyer(
        hdc: HDC,
        document: &str,
        (largeur_mm, hauteur_mm): (f64, f64),
        faces: &[Face],
        retourner_verso: bool,
        rendre: &Rendu,
    ) -> Result<(), String> {
        let nom_document = HSTRING::from(document);
        let info = DOCINFOW {
            cbSize: size_of::<DOCINFOW>() as i32,
            lpszDocName: PCWSTR(nom_document.as_ptr()),
            ..Default::default()
        };
        if unsafe { StartDocW(hdc, &info) } <= 0 {
            return Err("L'impression n'a pas pu démarrer.".into());
        }
        let caps = |index| unsafe { GetDeviceCaps(Some(hdc), index) };
        let (dpi_x, dpi_y) = (f64::from(caps(LOGPIXELSX)), f64::from(caps(LOGPIXELSY)));
        // Carte à sa taille réelle, centrée sur la page physique (les marges non imprimables
        // décalent l'origine des coordonnées).
        let cible_l = (largeur_mm / 25.4 * dpi_x).round() as i32;
        let cible_h = (hauteur_mm / 25.4 * dpi_y).round() as i32;
        let x = (caps(PHYSICALWIDTH) - cible_l) / 2 - caps(PHYSICALOFFSETX);
        let y = (caps(PHYSICALHEIGHT) - cible_h) / 2 - caps(PHYSICALOFFSETY);

        let resultat = faces.iter().try_for_each(|face| {
            let (largeur, hauteur, mut pixels) = rendre(face.page, dpi_x)?;
            if face.verso && retourner_verso {
                demi_tour(&mut pixels);
            }
            // RVBA (cartes opaques) → BVRA attendu par Windows.
            for pixel in pixels.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }
            let entete = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: largeur as i32,
                    biHeight: -(hauteur as i32), // lignes de haut en bas
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            if unsafe { StartPage(hdc) } <= 0 {
                return Err("L'imprimante a refusé une page.".to_string());
            }
            let lignes = unsafe {
                let _ = SetStretchBltMode(hdc, HALFTONE);
                let _ = SetBrushOrgEx(hdc, 0, 0, None);
                StretchDIBits(
                    hdc,
                    x,
                    y,
                    cible_l,
                    cible_h,
                    0,
                    0,
                    largeur as i32,
                    hauteur as i32,
                    Some(pixels.as_ptr().cast::<c_void>()),
                    &entete,
                    DIB_RGB_COLORS,
                    SRCCOPY,
                )
            };
            if lignes <= 0 || unsafe { EndPage(hdc) } <= 0 {
                return Err("Une carte n'a pas pu être envoyée à l'imprimante.".to_string());
            }
            Ok(())
        });
        let _ = unsafe {
            if resultat.is_ok() {
                EndDoc(hdc)
            } else {
                AbortDoc(hdc)
            }
        };
        resultat
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordre_des_faces_et_exemplaires() {
        let reglages = Reglages {
            recto_verso: true,
            retourner_verso: false,
            exemplaires: 2,
        };
        let pages: Vec<_> = faces(2, true, reglages)
            .iter()
            .map(|f| (f.page, f.verso))
            .collect();
        assert_eq!(
            pages,
            [
                (0, false),
                (1, true),
                (0, false),
                (1, true),
                (2, false),
                (3, true),
                (2, false),
                (3, true)
            ]
        );
        // Recto seul : les versos du document sont sautés.
        let recto_seul = Reglages {
            recto_verso: false,
            exemplaires: 1,
            ..reglages
        };
        let pages: Vec<_> = faces(2, true, recto_seul).iter().map(|f| f.page).collect();
        assert_eq!(pages, [0, 2]);
    }

    #[test]
    fn demi_tour_d_une_image() {
        // Image 2 × 1 : rouge puis bleu → bleu puis rouge.
        let mut pixels = vec![255, 0, 0, 255, 0, 0, 255, 255];
        demi_tour(&mut pixels);
        assert_eq!(pixels, [0, 0, 255, 255, 255, 0, 0, 255]);
    }
}
