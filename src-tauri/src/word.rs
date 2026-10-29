//! Courriers Word (.docx) : lecture des parties XML d'un modèle (remplies par l'interface), puis
//! écriture de chaque courrier. Tout le reste de l'archive (images, styles, polices) est recopié tel quel.

use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::fichiers;
use crate::moteur::ErreurMoteur;

/// Parties lues dans le modèle : celles qui portent du texte, les réglages, les relations (liens) et
/// la liste des types de contenu (un modèle .dotx devient un document ordinaire).
fn a_lire(chemin: &str) -> bool {
    let nom = chemin.strip_prefix("word/").unwrap_or("");
    chemin == "[Content_Types].xml"
        || nom == "settings.xml"
        || (nom.starts_with("_rels/") && nom.ends_with(".rels"))
        || ["document", "header", "footer", "footnotes", "endnotes"]
            .iter()
            .any(|debut| nom.starts_with(debut) && nom.ends_with(".xml") && !nom.contains('/'))
}

fn illisible(_: impl std::fmt::Display) -> ErreurMoteur {
    ErreurMoteur::simple("Ce fichier n'est pas un document Word (.docx) lisible.")
}

/// Parties XML à remplir d'un modèle Word.
pub fn lire_parties(octets: &[u8]) -> Result<HashMap<String, String>, ErreurMoteur> {
    let mut archive = ZipArchive::new(Cursor::new(octets)).map_err(illisible)?;
    if archive.by_name("word/document.xml").is_err() {
        return Err(illisible(""));
    }
    let mut parties = HashMap::new();
    for index in 0..archive.len() {
        let mut entree = archive.by_index(index).map_err(illisible)?;
        let chemin = entree.name().map_err(illisible)?.into_owned();
        if !a_lire(&chemin) {
            continue;
        }
        let mut texte = String::new();
        entree.read_to_string(&mut texte).map_err(illisible)?;
        parties.insert(chemin, texte);
    }
    Ok(parties)
}

/// Un courrier à écrire : son nom de fichier (sans extension) et ses parties remplies.
#[derive(Debug, Deserialize)]
pub struct Courrier {
    pub nom: String,
    pub parties: HashMap<String, String>,
}

/// Écrit chaque courrier dans `dossier` ; les entrées gardent l'ordre de l'archive du modèle.
pub fn ecrire(
    modele: &[u8],
    courriers: &[Courrier],
    dossier: &Path,
) -> Result<Vec<PathBuf>, ErreurMoteur> {
    let echec = |erreur: &dyn std::fmt::Display| {
        ErreurMoteur::simple(format!("Le courrier n'a pas pu être écrit : {erreur}"))
    };
    std::fs::create_dir_all(dossier).map_err(|e| echec(&e))?;
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    courriers
        .iter()
        .map(|courrier| {
            let nom = fichiers::nom_sur(&courrier.nom).unwrap_or_else(|| "Courrier".into());
            let chemin = dossier.join(format!("{nom}.docx"));
            let mut archive = ZipArchive::new(Cursor::new(modele)).map_err(illisible)?;
            let mut sortie = ZipWriter::new(std::fs::File::create(&chemin).map_err(|e| echec(&e))?);
            for index in 0..archive.len() {
                let entree = archive.by_index_raw(index).map_err(illisible)?;
                let nom = entree.name().map_err(illisible)?.into_owned();
                match courrier.parties.get(&nom) {
                    Some(xml) => {
                        drop(entree);
                        sortie.start_file(nom, options).map_err(|e| echec(&e))?;
                        sortie.write_all(xml.as_bytes()).map_err(|e| echec(&e))?;
                    }
                    None => sortie.raw_copy_file(entree).map_err(|e| echec(&e))?,
                }
            }
            sortie.finish().map_err(|e| echec(&e))?;
            Ok(chemin)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Petit .docx : corps, en-tête, image (recopiée telle quelle) et types de contenu.
    pub fn docx_minimal(corps: &str) -> Vec<u8> {
        let mut octets = Vec::new();
        let mut zip = ZipWriter::new(Cursor::new(&mut octets));
        let options = SimpleFileOptions::default();
        for (nom, contenu) in [
            ("[Content_Types].xml", "<Types/>"),
            ("word/document.xml", corps),
            ("word/header1.xml", "<w:hdr/>"),
            ("word/media/image1.png", "PNG"),
            ("word/styles.xml", "<w:styles/>"),
        ] {
            zip.start_file(nom, options).unwrap();
            zip.write_all(contenu.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
        octets
    }

    #[test]
    fn lit_les_parties_a_remplir() {
        let parties = lire_parties(&docx_minimal("<w:document>{{NOM}}</w:document>")).unwrap();
        let mut noms: Vec<_> = parties.keys().cloned().collect();
        noms.sort();
        assert_eq!(
            noms,
            [
                "[Content_Types].xml",
                "word/document.xml",
                "word/header1.xml"
            ]
        );
        assert!(lire_parties(b"pas un zip").is_err());
    }

    #[test]
    fn ecrit_les_courriers_en_recopiant_le_reste() {
        let modele = docx_minimal("<w:document>{{NOM}}</w:document>");
        let dossier = std::env::temp_dir()
            .join("automat-process-tests")
            .join("courriers");
        let _ = std::fs::remove_dir_all(&dossier);
        let courrier = Courrier {
            nom: "Aïssatou DIALLO".into(),
            parties: HashMap::from([(
                "word/document.xml".to_string(),
                "<w:document>DIALLO</w:document>".to_string(),
            )]),
        };
        let chemins = ecrire(&modele, &[courrier], &dossier).unwrap();
        let octets = std::fs::read(&chemins[0]).unwrap();
        let mut archive = ZipArchive::new(Cursor::new(octets)).unwrap();
        let mut lire = |nom: &str| {
            let mut texte = String::new();
            archive
                .by_name(nom)
                .unwrap()
                .read_to_string(&mut texte)
                .unwrap();
            texte
        };
        assert_eq!(lire("word/document.xml"), "<w:document>DIALLO</w:document>");
        assert_eq!(lire("word/media/image1.png"), "PNG");
        let premier = archive.file_names().next().unwrap().unwrap().into_owned();
        assert_eq!(premier, "[Content_Types].xml");
    }
}
