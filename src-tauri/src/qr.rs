//! QR codes vectoriels : les modules sombres sont regroupés en segments horizontaux,
//! que le gabarit dessine en un seul tracé (net à toutes les tailles, en CMJN).

use qrcode::{Color, EcLevel, QrCode};
use serde::Serialize;

use crate::moteur::ErreurMoteur;

/// Un QR code prêt pour le gabarit : `n` modules de côté, segments `[x, y, longueur]`.
#[derive(Debug, Serialize)]
pub struct CodeQr {
    pub n: usize,
    pub runs: Vec<[usize; 3]>,
}

/// Encode `texte` avec une correction d'erreur moyenne (niveau M, 15 %), adaptée à l'impression.
pub fn encoder(texte: &str) -> Result<CodeQr, ErreurMoteur> {
    let code = QrCode::with_error_correction_level(texte.as_bytes(), EcLevel::M)
        .map_err(|erreur| ErreurMoteur::simple(format!("QR code impossible : {erreur}")))?;
    let n = code.width();
    let couleurs = code.to_colors();
    let mut runs = Vec::new();
    for y in 0..n {
        let ligne = &couleurs[y * n..(y + 1) * n];
        let mut x = 0;
        while x < n {
            if ligne[x] == Color::Dark {
                let debut = x;
                while x < n && ligne[x] == Color::Dark {
                    x += 1;
                }
                runs.push([debut, y, x - debut]);
            } else {
                x += 1;
            }
        }
    }
    Ok(CodeQr { n, runs })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_une_vcard() {
        let code =
            encoder("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Aïssatou DIALLO\r\nEND:VCARD").unwrap();
        // Les trois motifs de repérage commencent par 7 modules sombres en haut à gauche et à droite.
        assert!(code.runs.contains(&[0, 0, 7]));
        assert!(code.runs.contains(&[code.n - 7, 0, 7]));
        assert!(
            code.runs
                .iter()
                .all(|&[x, y, l]| x + l <= code.n && y < code.n && l > 0)
        );
    }

    #[test]
    fn grandit_avec_le_contenu() {
        assert!(encoder(&"x".repeat(400)).unwrap().n > encoder("court").unwrap().n);
    }
}
