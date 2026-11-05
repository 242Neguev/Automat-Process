//! Textes d'exemple incrustés dans un visuel (image, ou PDF aplati) : la reconnaissance de caractères
//! intégrée à Windows 10/11 (hors ligne) lit leurs lignes sur le rendu du visuel, et chacune est décrite
//! comme un texte de la carte (position, taille, couleur), pour devenir d'un clic une information.

use serde::Serialize;

use crate::cartes::Zone;
#[cfg(windows)]
use crate::tr;

const MM_PAR_POINT: f64 = 25.4 / 72.0;

/// Ligne de texte lue dans le visuel, en mm depuis le coin haut-gauche de la carte finie.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexteLu {
    pub id: usize,
    pub texte: String,
    /// Début de sa ligne de base.
    pub x_mm: f64,
    pub y_mm: f64,
    pub largeur_mm: f64,
    pub taille_pt: f64,
    /// Couleur du texte (#rrggbb), mesurée sur le visuel.
    pub couleur: String,
    /// Rectangle de l'encre : la zone à effacer.
    pub zone: Zone,
}

/// Rectangle d'un mot, en pixels du rendu.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Boite {
    pub x: f64,
    pub y: f64,
    pub largeur: f64,
    pub hauteur: f64,
}

/// Mots d'une ligne lue, dans l'ordre de lecture.
pub type LigneLue = Vec<(String, Boite)>;

/// Lignes de texte d'une image RVBA, lues par la reconnaissance de caractères de Windows, dans les
/// langues de l'utilisateur.
#[cfg(windows)]
pub fn lire_lignes(rvba: &[u8], largeur: u32, hauteur: u32) -> Result<Vec<LigneLue>, String> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;

    let indisponible = |erreur: windows::core::Error| {
        tr!(
            "La reconnaissance de caractères de Windows est indisponible ({erreur}).",
            "Windows text recognition is unavailable ({erreur})."
        )
    };
    let moteur = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
        crate::langue::texte(
            "La reconnaissance de caractères de Windows n'est pas installée pour vos langues \
             (Paramètres › Heure et langue › Langue : ajoutez le module « Reconnaissance optique de caractères »).",
            "Windows text recognition is not installed for your languages \
             (Settings › Time & language › Language: add the “Optical character recognition” feature).",
        )
        .to_string()
    })?;
    let lire = || -> windows::core::Result<Vec<LigneLue>> {
        let maximum = OcrEngine::MaxImageDimension()?;
        if largeur > maximum || hauteur > maximum {
            return Ok(Vec::new());
        }
        // Windows attend des pixels BGRA.
        let (pixels, _) = rvba.as_chunks::<4>();
        let bgra: Vec<u8> = pixels
            .iter()
            .flat_map(|&[r, v, b, a]| [b, v, r, a])
            .collect();
        let ecrivain = DataWriter::new()?;
        ecrivain.WriteBytes(&bgra)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &ecrivain.DetachBuffer()?,
            BitmapPixelFormat::Bgra8,
            largeur as i32,
            hauteur as i32,
        )?;
        let resultat = moteur.RecognizeAsync(&bitmap)?.join()?;
        let lignes = resultat.Lines()?;
        let mut lues = Vec::new();
        for i in 0..lignes.Size()? {
            let mots = lignes.GetAt(i)?.Words()?;
            let mut ligne = Vec::new();
            for j in 0..mots.Size()? {
                let mot = mots.GetAt(j)?;
                let r = mot.BoundingRect()?;
                ligne.push((
                    mot.Text()?.to_string(),
                    Boite {
                        x: f64::from(r.X),
                        y: f64::from(r.Y),
                        largeur: f64::from(r.Width),
                        hauteur: f64::from(r.Height),
                    },
                ));
            }
            if !ligne.is_empty() {
                lues.push(ligne);
            }
        }
        Ok(lues)
    };
    lire().map_err(indisponible)
}

#[cfg(not(windows))]
pub fn lire_lignes(_rvba: &[u8], _largeur: u32, _hauteur: u32) -> Result<Vec<LigneLue>, String> {
    Err(crate::langue::texte(
        "La reconnaissance de caractères n'est disponible que sous Windows.",
        "Text recognition is only available on Windows.",
    )
    .into())
}

/// Coupe une ligne là où l'écart entre deux mots dépasse une fois et demie la hauteur des mots :
/// un téléphone à gauche et un site à droite, sur la même ligne, sont deux textes distincts.
pub fn decouper(ligne: &LigneLue) -> Vec<LigneLue> {
    let mut hauteurs: Vec<f64> = ligne.iter().map(|(_, b)| b.hauteur).collect();
    hauteurs.sort_by(f64::total_cmp);
    let hauteur = hauteurs.get(hauteurs.len() / 2).copied().unwrap_or(0.0);
    let mut morceaux: Vec<LigneLue> = Vec::new();
    for (mot, boite) in ligne {
        let colle = morceaux
            .last()
            .and_then(|m| m.last())
            .is_some_and(|(_, avant)| boite.x - (avant.x + avant.largeur) <= hauteur * 1.5);
        match morceaux.last_mut() {
            Some(morceau) if colle => morceau.push((mot.clone(), *boite)),
            _ => morceaux.push(vec![(mot.clone(), *boite)]),
        }
    }
    morceaux
}

/// Proportions d'un texte, en fractions de sa taille : hauteur au-dessus de la ligne de base (capitales,
/// chiffres, lettres hautes ou accentuées : celle des capitales, sinon celle des minuscules) et
/// profondeur des jambages.
pub fn proportions(texte: &str) -> (f64, f64) {
    let haut = texte.chars().any(|c| {
        c.is_uppercase()
            || c.is_ascii_digit()
            || "bdfhijklt'\"!?/\\()[]{}|@#$%&".contains(c)
            || (c.is_alphabetic() && !c.is_ascii())
    });
    let bas = texte.chars().any(|c| "gjpqyQ,;()[]{}|@ç".contains(c));
    (if haut { 0.72 } else { 0.53 }, if bas { 0.21 } else { 0.0 })
}

/// Couleur médiane de pixels RVBA donnés par leurs indices.
fn mediane(rvba: &[u8], indices: &[usize]) -> [u8; 3] {
    let mut canaux: [Vec<u8>; 3] = Default::default();
    for &i in indices {
        for (c, valeurs) in canaux.iter_mut().enumerate() {
            valeurs.push(rvba[i * 4 + c]);
        }
    }
    canaux.map(|mut v| {
        if v.is_empty() {
            return 0;
        }
        v.sort_unstable();
        v[v.len() / 2]
    })
}

/// Couleur du texte d'une boîte : celle des pixels les plus éloignés du fond qui l'entoure.
fn couleur_du_texte(rvba: &[u8], largeur: u32, hauteur: u32, boite: Boite) -> [u8; 3] {
    let (l, h) = (i64::from(largeur), i64::from(hauteur));
    let x0 = (boite.x.floor() as i64).clamp(0, l);
    let y0 = (boite.y.floor() as i64).clamp(0, h);
    let x1 = ((boite.x + boite.largeur).ceil() as i64).clamp(0, l);
    let y1 = ((boite.y + boite.hauteur).ceil() as i64).clamp(0, h);
    let indice = |x: i64, y: i64| (y * l + x) as usize;
    let mut anneau = Vec::new();
    for y in (y0 - 3).max(0)..(y1 + 3).min(h) {
        for x in (x0 - 3).max(0)..(x1 + 3).min(l) {
            if !((x0..x1).contains(&x) && (y0..y1).contains(&y)) {
                anneau.push(indice(x, y));
            }
        }
    }
    let fond = mediane(rvba, &anneau);
    let ecart = |i: usize| {
        (0..3)
            .map(|c| rvba[i * 4 + c].abs_diff(fond[c]))
            .max()
            .unwrap_or(0)
    };
    let interieur: Vec<usize> = (y0..y1)
        .flat_map(|y| (x0..x1).map(move |x| (x, y)))
        .map(|(x, y)| indice(x, y))
        .collect();
    let maximum = interieur.iter().map(|&i| ecart(i)).max().unwrap_or(0);
    let encre: Vec<usize> = interieur
        .into_iter()
        .filter(|&i| u16::from(ecart(i)) * 2 >= u16::from(maximum))
        .collect();
    mediane(rvba, &encre)
}

/// Rectangle de l'encre d'un texte, mesuré sur les pixels à partir de la boîte de la reconnaissance :
/// les boîtes de Windows sont plus serrées que les lettres (le haut des capitales en dépasse). Sans
/// cela, la taille serait sous-estimée et l'effacement laisserait des traces. Les lignes et colonnes
/// d'encre sont cherchées jusqu'à 40 % de la hauteur de la boîte autour d'elle.
fn encre(rvba: &[u8], largeur: u32, hauteur: u32, boite: Boite) -> Boite {
    let (l, h) = (i64::from(largeur), i64::from(hauteur));
    let marge = (boite.hauteur * 0.4).ceil() as i64;
    let x0 = (boite.x.floor() as i64).clamp(0, l);
    let y0 = (boite.y.floor() as i64).clamp(0, h);
    let x1 = ((boite.x + boite.largeur).ceil() as i64).clamp(0, l);
    let y1 = ((boite.y + boite.hauteur).ceil() as i64).clamp(0, h);
    if x1 <= x0 || y1 <= y0 {
        return boite;
    }
    // Fond : un anneau éloigné de la boîte (au-delà de la marge), hors des lettres qui en dépassent.
    let indice = |x: i64, y: i64| (y * l + x) as usize;
    let mut anneau = Vec::new();
    for y in (y0 - marge - 3).max(0)..(y1 + marge + 3).min(h) {
        for x in (x0 - marge - 3).max(0)..(x1 + marge + 3).min(l) {
            let dedans =
                (x0 - marge..x1 + marge).contains(&x) && (y0 - marge..y1 + marge).contains(&y);
            if !dedans {
                anneau.push(indice(x, y));
            }
        }
    }
    let fond = mediane(rvba, &anneau);
    let ecart = |i: usize| {
        (0..3)
            .map(|c| rvba[i * 4 + c].abs_diff(fond[c]))
            .max()
            .unwrap_or(0)
    };
    let maximum = (y0..y1)
        .flat_map(|y| (x0..x1).map(move |x| (x, y)))
        .map(|(x, y)| ecart(indice(x, y)))
        .max()
        .unwrap_or(0);
    let seuil = (maximum / 2).max(24);
    let (ex0, ex1) = ((x0 - marge).max(0), (x1 + marge).min(l));
    let ligne_d_encre = |y: i64| (ex0..ex1).any(|x| ecart(indice(x, y)) > seuil);
    // Lignes d'encre contiguës autour de la boîte.
    let Some(milieu) = (y0..y1).find(|&y| ligne_d_encre(y)) else {
        return boite;
    };
    let mut haut = milieu;
    while haut > (y0 - marge).max(0) && ligne_d_encre(haut - 1) {
        haut -= 1;
    }
    let mut bas = (y0..y1).rev().find(|&y| ligne_d_encre(y)).unwrap_or(milieu);
    while bas + 1 < (y1 + marge).min(h) && ligne_d_encre(bas + 1) {
        bas += 1;
    }
    let colonne_d_encre = |x: i64| (haut..=bas).any(|y| ecart(indice(x, y)) > seuil);
    let gauche = (ex0..ex1).find(|&x| colonne_d_encre(x)).unwrap_or(x0);
    let droite = (ex0..ex1)
        .rev()
        .find(|&x| colonne_d_encre(x))
        .unwrap_or(x1 - 1);
    Boite {
        x: gauche as f64,
        y: haut as f64,
        largeur: (droite - gauche + 1) as f64,
        hauteur: (bas - haut + 1) as f64,
    }
}

/// Lit les textes d'un rendu RVBA de la carte finie (`px_par_mm` : sa résolution).
pub fn reconnaitre(
    rvba: &[u8],
    largeur: u32,
    hauteur: u32,
    px_par_mm: f64,
) -> Result<Vec<TexteLu>, String> {
    let lignes = lire_lignes(rvba, largeur, hauteur)?;
    let mut textes = Vec::new();
    for morceau in lignes.iter().flat_map(decouper) {
        let texte = morceau
            .iter()
            .map(|(mot, _)| mot.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let x0 = morceau
            .iter()
            .map(|(_, b)| b.x)
            .fold(f64::INFINITY, f64::min);
        let y0 = morceau
            .iter()
            .map(|(_, b)| b.y)
            .fold(f64::INFINITY, f64::min);
        let x1 = morceau
            .iter()
            .map(|(_, b)| b.x + b.largeur)
            .fold(0.0, f64::max);
        let y1 = morceau
            .iter()
            .map(|(_, b)| b.y + b.hauteur)
            .fold(0.0, f64::max);
        let lue = Boite {
            x: x0,
            y: y0,
            largeur: x1 - x0,
            hauteur: y1 - y0,
        };
        if lue.largeur <= 0.0 || lue.hauteur <= 0.0 {
            continue;
        }
        let encre = encre(rvba, largeur, hauteur, lue);
        let (haut, bas) = proportions(&texte);
        let taille_px = encre.hauteur / (haut + bas);
        let [r, v, b] = couleur_du_texte(rvba, largeur, hauteur, encre);
        let mm = |px: f64| (px / px_par_mm * 100.0).round() / 100.0;
        textes.push(TexteLu {
            id: textes.len(),
            texte,
            x_mm: mm(encre.x),
            y_mm: mm(encre.y + encre.hauteur - bas * taille_px),
            largeur_mm: mm(encre.largeur),
            taille_pt: ((taille_px / px_par_mm / MM_PAR_POINT) * 10.0).round() / 10.0,
            couleur: format!("#{r:02x}{v:02x}{b:02x}"),
            zone: Zone {
                x_mm: mm(encre.x),
                y_mm: mm(encre.y),
                largeur_mm: mm(encre.largeur),
                hauteur_mm: mm(encre.hauteur),
            },
        });
    }
    Ok(textes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mot(texte: &str, x: f64, largeur: f64) -> (String, Boite) {
        (
            texte.into(),
            Boite {
                x,
                y: 10.0,
                largeur,
                hauteur: 20.0,
            },
        )
    }

    #[test]
    fn coupe_une_ligne_aux_grands_ecarts() {
        let ligne = vec![
            mot("Tél.", 0.0, 40.0),
            mot("01", 50.0, 20.0),
            mot("www.exemple.com", 200.0, 150.0),
        ];
        let morceaux = decouper(&ligne);
        assert_eq!(morceaux.len(), 2);
        assert_eq!(morceaux[0].len(), 2);
        assert_eq!(morceaux[1][0].0, "www.exemple.com");
    }

    #[test]
    fn proportions_selon_les_lettres() {
        assert_eq!(proportions("NOM"), (0.72, 0.0));
        assert_eq!(proportions("comme"), (0.53, 0.0));
        assert_eq!(proportions("rayon"), (0.53, 0.21));
        // Le point du i et du j monte à la hauteur des capitales.
        assert_eq!(proportions("jeu"), (0.72, 0.21));
        assert_eq!(proportions("Éloïse"), (0.72, 0.0));
        assert_eq!(proportions("équipe"), (0.72, 0.21));
    }

    #[test]
    fn mesure_l_encre_au_dela_de_la_boite_lue() {
        // Fond clair ; « lettres » sombres de x 10 à 39, y 6 à 17 ; boîte lue plus serrée (y 8 à 15).
        let (l, h) = (60u32, 30u32);
        let mut rvba = Vec::new();
        for y in 0..h {
            for x in 0..l {
                let lettre = (10..40).contains(&x) && (6..18).contains(&y) && x % 4 != 3;
                rvba.extend_from_slice(if lettre {
                    &[20, 30, 40, 255]
                } else {
                    &[240, 238, 230, 255]
                });
            }
        }
        let lue = Boite {
            x: 11.0,
            y: 8.0,
            largeur: 26.0,
            hauteur: 8.0,
        };
        assert_eq!(
            encre(&rvba, l, h, lue),
            Boite {
                x: 10.0,
                y: 6.0,
                largeur: 29.0,
                hauteur: 12.0
            }
        );
        // Rien d'écrit : la boîte lue est gardée.
        let vide = vec![240u8; (l * h * 4) as usize];
        assert_eq!(encre(&vide, l, h, lue), lue);
    }

    #[test]
    fn couleur_du_texte_sur_son_fond() {
        // Fond bleu nuit, « texte » orange au milieu.
        let (l, h) = (40u32, 20u32);
        let mut rvba = Vec::new();
        for y in 0..h {
            for x in 0..l {
                let texte = (10..30).contains(&x) && (6..14).contains(&y) && x % 3 != 0;
                rvba.extend_from_slice(if texte {
                    &[232, 89, 12, 255]
                } else {
                    &[29, 53, 87, 255]
                });
            }
        }
        let boite = Boite {
            x: 10.0,
            y: 6.0,
            largeur: 20.0,
            hauteur: 8.0,
        };
        assert_eq!(couleur_du_texte(&rvba, l, h, boite), [232, 89, 12]);
    }
}
