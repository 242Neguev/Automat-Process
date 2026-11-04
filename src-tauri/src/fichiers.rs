//! Fichiers choisis par l'utilisateur : lecture contrôlée (liste, logo, signature existante) et
//! écriture d'un dossier de résultats (pages de signature…), sans jamais sortir de ce dossier.

use std::path::Path;

use serde::Deserialize;

use crate::moteur::ErreurMoteur;

/// Ce que l'on s'attend à lire : chaque nature a ses formats et sa taille maximale.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Nature {
    Liste,
    Image,
    Signature,
    Pdf,
    Word,
}

impl Nature {
    fn extensions(self) -> &'static [&'static str] {
        match self {
            Nature::Liste => &["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"],
            Nature::Image => &["png", "jpg", "jpeg", "gif", "svg"],
            Nature::Signature => &["htm", "html"],
            Nature::Pdf => &["pdf"],
            Nature::Word => &["docx", "dotx"],
        }
    }

    fn taille_max(self) -> u64 {
        match self {
            Nature::Liste => 50 * 1024 * 1024,
            Nature::Image => 10 * 1024 * 1024,
            Nature::Signature => 5 * 1024 * 1024,
            Nature::Pdf => 500 * 1024 * 1024,
            Nature::Word => 100 * 1024 * 1024,
        }
    }

    fn refus(self, extension: &str) -> String {
        match self {
            Nature::Liste => format!(
                "Format de liste non pris en charge (.{extension}) : utilisez un fichier Excel, CSV ou ODS."
            ),
            Nature::Image => format!(
                "Format d'image non pris en charge (.{extension}) : utilisez un PNG, un JPG, un GIF ou un SVG."
            ),
            Nature::Signature => format!(
                "Format non pris en charge (.{extension}) : choisissez une signature enregistrée en HTML (.htm ou .html)."
            ),
            Nature::Pdf => format!("Format non pris en charge (.{extension}) : choisissez un PDF."),
            Nature::Word => format!(
                "Format non pris en charge (.{extension}) : choisissez un document Word (.docx ou .dotx)."
            ),
        }
    }
}

/// Contenu d'un fichier, après contrôle de son format et de sa taille.
pub fn lire(chemin: &str, nature: Nature) -> Result<Vec<u8>, ErreurMoteur> {
    let extension = Path::new(chemin)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();
    if !nature.extensions().contains(&extension.as_str()) {
        return Err(ErreurMoteur::simple(nature.refus(&extension)));
    }
    let illisible = |erreur: std::io::Error| {
        ErreurMoteur::simple(format!("Impossible de lire « {chemin} » : {erreur}"))
    };
    let taille = std::fs::metadata(chemin).map_err(illisible)?.len();
    if taille > nature.taille_max() {
        return Err(ErreurMoteur::simple(format!(
            "Le fichier dépasse {} Mo.",
            nature.taille_max() / (1024 * 1024)
        )));
    }
    std::fs::read(chemin).map_err(illisible)
}

/// Un fichier à créer : un texte (HTML…) ou des octets (image).
#[derive(Debug, Deserialize)]
pub struct FichierAEcrire {
    pub nom: String,
    #[serde(default)]
    pub texte: Option<String>,
    #[serde(default)]
    pub octets: Option<Vec<u8>>,
}

/// Nom de fichier sans risque : ni séparateur, ni caractère interdit par Windows, ni « .. », ni nom
/// réservé par Windows (« CON », « NUL.pdf »… deviennent « CON_ », « NUL_.pdf »).
pub fn nom_sur(nom: &str) -> Option<String> {
    let propre: String = nom
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    // Les points finaux sont retirés (Windows les ignore) : « . » et « .. » deviennent vides.
    let propre = propre.trim().trim_end_matches('.').to_string();
    if propre.is_empty() {
        return None;
    }
    let fin_du_nom = propre.find('.').unwrap_or(propre.len());
    Some(if reserve_par_windows(&propre[..fin_du_nom]) {
        format!("{}_{}", &propre[..fin_du_nom], &propre[fin_du_nom..])
    } else {
        propre
    })
}

/// Noms de périphériques de Windows : un fichier ainsi nommé, même avec une extension, est inaccessible.
fn reserve_par_windows(nom: &str) -> bool {
    let nom = nom.trim_end().to_ascii_uppercase();
    let numerote = |prefixe: &str| {
        nom.len() == 4 && nom.starts_with(prefixe) && nom.as_bytes()[3].is_ascii_digit()
    };
    matches!(
        nom.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || numerote("COM")
        || numerote("LPT")
}

/// Chemin relatif sans risque (« signatures/001/logo.png ») : chaque élément est un nom sûr ; les
/// « . » et « .. » sont écartés, on ne sort jamais du dossier.
fn chemin_sur(nom: &str) -> Option<std::path::PathBuf> {
    let elements: Vec<String> = nom.split(['/', '\\']).filter_map(nom_sur).collect();
    (!elements.is_empty()).then(|| elements.iter().collect())
}

/// Crée (ou complète) le dossier `sous_dossier` dans `dossier` et y écrit les fichiers ; renvoie son chemin.
/// Un nom de fichier peut contenir des sous-dossiers (« signatures/001/signature.htm »).
pub fn ecrire(
    dossier: &str,
    sous_dossier: &str,
    fichiers: &[FichierAEcrire],
) -> Result<String, ErreurMoteur> {
    let nom_dossier =
        nom_sur(sous_dossier).ok_or_else(|| ErreurMoteur::simple("Nom de dossier invalide."))?;
    let cible = Path::new(dossier).join(nom_dossier);
    let echec = |erreur: std::io::Error| {
        ErreurMoteur::simple(format!(
            "Impossible d'écrire dans « {} » : {erreur}",
            cible.display()
        ))
    };
    std::fs::create_dir_all(&cible).map_err(echec)?;
    for fichier in fichiers {
        let nom = chemin_sur(&fichier.nom).ok_or_else(|| {
            ErreurMoteur::simple(format!("Nom de fichier invalide : {}", fichier.nom))
        })?;
        if let Some(parent) = cible.join(&nom).parent() {
            std::fs::create_dir_all(parent).map_err(echec)?;
        }
        let contenu = match (&fichier.texte, &fichier.octets) {
            (Some(texte), _) => texte.as_bytes(),
            (None, Some(octets)) => octets.as_slice(),
            (None, None) => &[],
        };
        std::fs::write(cible.join(nom), contenu).map_err(echec)?;
    }
    Ok(cible.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_de_test(nom: &str) -> std::path::PathBuf {
        let dossier = std::env::temp_dir().join("automat-process-tests").join(nom);
        let _ = std::fs::remove_dir_all(&dossier);
        std::fs::create_dir_all(&dossier).unwrap();
        dossier
    }

    #[test]
    fn controle_le_format_et_la_taille() {
        let dossier = dossier_de_test("lecture");
        let logo = dossier.join("logo.png");
        std::fs::write(&logo, b"\x89PNG").unwrap();
        assert_eq!(
            lire(logo.to_str().unwrap(), Nature::Image).unwrap(),
            b"\x89PNG"
        );
        let erreur = lire(logo.to_str().unwrap(), Nature::Signature).unwrap_err();
        assert!(erreur.message.contains(".htm"));
    }

    #[test]
    fn evite_les_noms_reserves_par_windows() {
        assert_eq!(nom_sur("Con").as_deref(), Some("Con_"));
        assert_eq!(nom_sur("nul.pdf").as_deref(), Some("nul_.pdf"));
        assert_eq!(nom_sur("COM1.docx").as_deref(), Some("COM1_.docx"));
        assert_eq!(nom_sur("lpt9").as_deref(), Some("lpt9_"));
        assert_eq!(nom_sur("Constance").as_deref(), Some("Constance"));
        assert_eq!(nom_sur("COM10").as_deref(), Some("COM10"));
        assert_eq!(nom_sur("Aux Champs.png").as_deref(), Some("Aux Champs.png"));
    }

    #[test]
    fn ecrit_sans_sortir_du_dossier() {
        let dossier = dossier_de_test("ecriture");
        let fichiers = [
            FichierAEcrire {
                nom: "Aïssatou DIALLO.html".into(),
                texte: Some("<p>ok</p>".into()),
                octets: None,
            },
            FichierAEcrire {
                nom: "../../évasion.html".into(),
                texte: Some("non".into()),
                octets: None,
            },
            FichierAEcrire {
                nom: "logo.png".into(),
                texte: None,
                octets: Some(vec![1, 2, 3]),
            },
            FichierAEcrire {
                nom: "signatures/001/signature.htm".into(),
                texte: Some("<p>kit</p>".into()),
                octets: None,
            },
        ];
        let cible = ecrire(dossier.to_str().unwrap(), "Signatures : équipe", &fichiers).unwrap();
        assert!(cible.ends_with("Signatures - équipe"));
        let cible = Path::new(&cible);
        assert_eq!(
            std::fs::read_to_string(cible.join("Aïssatou DIALLO.html")).unwrap(),
            "<p>ok</p>"
        );
        // « ../../évasion.html » reste dans le dossier : les « .. » sont écartés.
        assert!(cible.join("évasion.html").exists());
        assert!(!dossier.join("évasion.html").exists());
        assert_eq!(std::fs::read(cible.join("logo.png")).unwrap(), [1, 2, 3]);
        assert!(
            cible
                .join("signatures")
                .join("001")
                .join("signature.htm")
                .exists()
        );
    }
}
