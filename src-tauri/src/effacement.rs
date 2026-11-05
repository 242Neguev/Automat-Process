//! Effacement intelligent d'un texte incrusté dans une image (visuel exporté de Canva, Photoshop…) :
//! seuls les pixels du texte (ceux qui se distinguent du fond qui l'entoure) sont repeints, à partir
//! de leurs voisins et du bord vers l'intérieur. Un fond uni, un dégradé ou une texture fine se
//! reconstruisent sans trace ; le reste de l'image n'est pas touché.

use image::RgbaImage;

/// Rectangle de l'image, en pixels (bord droit et bord bas exclus).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rectangle {
    pub x0: u32,
    pub y0: u32,
    pub x1: u32,
    pub y1: u32,
}

/// Rayon (pixels) du voisinage qui sert à repeindre un pixel.
const RAYON: i64 = 3;

/// Efface le texte des rectangles donnés.
pub fn effacer(image: &mut RgbaImage, zones: &[Rectangle]) {
    let (largeur, hauteur) = image.dimensions();
    let mut masque = vec![false; (largeur * hauteur) as usize];
    for zone in zones {
        let zone = Rectangle {
            x0: zone.x0.min(largeur),
            y0: zone.y0.min(hauteur),
            x1: zone.x1.min(largeur),
            y1: zone.y1.min(hauteur),
        };
        if zone.x1 > zone.x0 && zone.y1 > zone.y0 {
            masquer_le_texte(image, zone, &mut masque);
        }
    }
    repeindre(image, &mut masque);
}

/// Couleur médiane d'un anneau de 3 pixels autour d'un rectangle (le fond qui entoure le texte).
fn fond_autour(image: &RgbaImage, zone: Rectangle) -> [u8; 3] {
    let (largeur, hauteur) = image.dimensions();
    let anneau = 3;
    let mut canaux: [Vec<u8>; 3] = Default::default();
    let (x0, y0) = (
        zone.x0.saturating_sub(anneau),
        zone.y0.saturating_sub(anneau),
    );
    let (x1, y1) = (
        (zone.x1 + anneau).min(largeur),
        (zone.y1 + anneau).min(hauteur),
    );
    for y in y0..y1 {
        for x in x0..x1 {
            if (zone.x0..zone.x1).contains(&x) && (zone.y0..zone.y1).contains(&y) {
                continue;
            }
            let pixel = image.get_pixel(x, y).0;
            for (canal, valeurs) in canaux.iter_mut().enumerate() {
                valeurs.push(pixel[canal]);
            }
        }
    }
    canaux.map(|mut valeurs| {
        if valeurs.is_empty() {
            return 255;
        }
        valeurs.sort_unstable();
        valeurs[valeurs.len() / 2]
    })
}

fn ecart(a: [u8; 3], b: [u8; 3]) -> u8 {
    (0..3).map(|c| a[c].abs_diff(b[c])).max().unwrap_or(0)
}

/// Marque les pixels du texte d'une zone : ceux qui s'écartent nettement du fond qui l'entoure (le seuil
/// suit le contraste du texte), plus deux pixels autour (bords adoucis des lettres).
fn masquer_le_texte(image: &RgbaImage, zone: Rectangle, masque: &mut [bool]) {
    let (largeur, hauteur) = image.dimensions();
    let fond = fond_autour(image, zone);
    let pixel = |x: u32, y: u32| {
        let p = image.get_pixel(x, y).0;
        [p[0], p[1], p[2]]
    };
    let mut ecart_max = 0;
    for y in zone.y0..zone.y1 {
        for x in zone.x0..zone.x1 {
            ecart_max = ecart_max.max(ecart(pixel(x, y), fond));
        }
    }
    let seuil = (ecart_max as f64 * 0.35).max(24.0) as u8;
    let mut texte = Vec::new();
    for y in zone.y0..zone.y1 {
        for x in zone.x0..zone.x1 {
            if ecart(pixel(x, y), fond) > seuil {
                texte.push((x, y));
            }
        }
    }
    let marge = 2i64;
    for (x, y) in texte {
        for dy in -marge..=marge {
            for dx in -marge..=marge {
                let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                if nx >= 0 && ny >= 0 && (nx as u32) < largeur && (ny as u32) < hauteur {
                    masque[(ny as u32 * largeur + nx as u32) as usize] = true;
                }
            }
        }
    }
}

/// Repeint les pixels masqués, du bord vers l'intérieur : à chaque passe, chaque pixel masqué qui touche
/// un pixel connu prend la moyenne de ses voisins connus, pondérée par l'inverse du carré de la distance.
fn repeindre(image: &mut RgbaImage, masque: &mut [bool]) {
    let (largeur, hauteur) = image.dimensions();
    let (l, h) = (i64::from(largeur), i64::from(hauteur));
    let indice = |x: i64, y: i64| (y * l + x) as usize;
    let mut restants: Vec<(i64, i64)> = (0..h)
        .flat_map(|y| (0..l).map(move |x| (x, y)))
        .filter(|&(x, y)| masque[indice(x, y)])
        .collect();
    while !restants.is_empty() {
        let touche_un_connu = |&(x, y): &(i64, i64)| {
            (-1..=1).any(|dy| {
                (-1..=1).any(|dx| {
                    let (nx, ny) = (x + dx, y + dy);
                    nx >= 0 && ny >= 0 && nx < l && ny < h && !masque[indice(nx, ny)]
                })
            })
        };
        let (bord, interieur): (Vec<_>, Vec<_>) =
            restants.into_iter().partition(|p| touche_un_connu(p));
        if bord.is_empty() {
            // Toute l'image est masquée : rien d'où repartir.
            break;
        }
        let couleurs: Vec<[u8; 4]> = bord
            .iter()
            .map(|&(x, y)| {
                let mut somme = [0.0f64; 4];
                let mut poids = 0.0;
                for dy in -RAYON..=RAYON {
                    for dx in -RAYON..=RAYON {
                        let (nx, ny) = (x + dx, y + dy);
                        let distance = (dx * dx + dy * dy) as f64;
                        if distance == 0.0 || distance > (RAYON * RAYON) as f64 {
                            continue;
                        }
                        if nx < 0 || ny < 0 || nx >= l || ny >= h || masque[indice(nx, ny)] {
                            continue;
                        }
                        let p = image.get_pixel(nx as u32, ny as u32).0;
                        let w = 1.0 / distance;
                        for (s, &v) in somme.iter_mut().zip(p.iter()) {
                            *s += f64::from(v) * w;
                        }
                        poids += w;
                    }
                }
                somme.map(|s| (s / poids).round().clamp(0.0, 255.0) as u8)
            })
            .collect();
        for (&(x, y), couleur) in bord.iter().zip(couleurs) {
            image.put_pixel(x as u32, y as u32, image::Rgba(couleur));
            masque[indice(x, y)] = false;
        }
        restants = interieur;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ecrire_texte(image: &mut RgbaImage, couleur: [u8; 4]) {
        // Trois « lettres » : des traits de 2 px d'épaisseur.
        for (x0, y0, x1, y1) in [(20, 20, 22, 40), (26, 20, 34, 22), (38, 20, 40, 40)] {
            for y in y0..y1 {
                for x in x0..x1 {
                    image.put_pixel(x, y, image::Rgba(couleur));
                }
            }
        }
    }

    #[test]
    fn efface_un_texte_sur_fond_uni_sans_trace() {
        let mut image = RgbaImage::from_pixel(80, 60, image::Rgba([29, 53, 87, 255]));
        ecrire_texte(&mut image, [255, 255, 255, 255]);
        effacer(
            &mut image,
            &[Rectangle {
                x0: 18,
                y0: 18,
                x1: 42,
                y1: 42,
            }],
        );
        assert!(image.pixels().all(|p| p.0 == [29, 53, 87, 255]));
    }

    #[test]
    fn reconstruit_un_degrade_et_epargne_le_reste() {
        // Dégradé horizontal, du noir au blanc ; un texte rouge dessus.
        let mut image = RgbaImage::from_fn(100, 60, |x, _| {
            let v = (x * 255 / 99) as u8;
            image::Rgba([v, v, v, 255])
        });
        let avant = image.clone();
        ecrire_texte(&mut image, [220, 20, 20, 255]);
        effacer(
            &mut image,
            &[Rectangle {
                x0: 18,
                y0: 18,
                x1: 42,
                y1: 42,
            }],
        );
        for (x, y, p) in image.enumerate_pixels() {
            let attendu = avant.get_pixel(x, y).0;
            assert!(
                ecart([p[0], p[1], p[2]], [attendu[0], attendu[1], attendu[2]]) <= 10,
                "pixel ({x}, {y}) : {:?} au lieu de {attendu:?}",
                p.0
            );
        }
        // Hors de la zone, rien n'a bougé.
        assert_eq!(image.get_pixel(70, 30), avant.get_pixel(70, 30));
    }

    #[test]
    fn ignore_une_zone_hors_de_l_image() {
        let mut image = RgbaImage::from_pixel(10, 10, image::Rgba([1, 2, 3, 255]));
        effacer(
            &mut image,
            &[
                Rectangle {
                    x0: 20,
                    y0: 20,
                    x1: 30,
                    y1: 30,
                },
                Rectangle {
                    x0: 5,
                    y0: 5,
                    x1: 5,
                    y1: 9,
                },
            ],
        );
        assert!(image.pixels().all(|p| p.0 == [1, 2, 3, 255]));
    }
}
