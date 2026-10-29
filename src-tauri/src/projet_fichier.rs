//! Fichier de projet « .automat » : une archive ZIP qui contient le modèle (carte de visite ou
//! signature e-mail), ses visuels et les correspondances avec les colonnes de la liste. Les données
//! des agents n'y sont jamais copiées : on rouvre le projet et on lui donne la nouvelle liste.

use std::io::{Read, Write};

use serde::Serialize;
use serde_json::{Value, json};
use zip::ZipArchive;
use zip::write::SimpleFileOptions;

use std::sync::atomic::{AtomicUsize, Ordering};

use typst::foundations::Bytes;

use crate::cartes;
use crate::fichiers::{self, Nature};
use crate::fonds::Fonds;
use crate::moteur::ErreurMoteur;

const APPLICATION: &str = "Automat-Process";
const VERSION_FORMAT: u64 = 1;
const ENTREE_PROJET: &str = "projet.json";
const FACES: [&str; 2] = ["recto", "verso"];
/// Sortes de documents : chacune s'ouvre dans son module.
const DOCUMENTS: [&str; 4] = ["carte", "ecran", "signature", "word"];

/// Ce que l'interface récupère en ouvrant un projet.
#[derive(Debug, Serialize)]
pub struct ProjetOuvert {
    /// « carte », « ecran » (visuel numérique), « signature » ou « word ».
    pub document: String,
    pub modele: Value,
    pub correspondances: Value,
    /// Informations des visuels (dimensions, fond perdu…), avec leurs nouveaux chemins virtuels.
    pub visuels: Value,
}

fn erreur(contexte: &str) -> impl Fn(&dyn std::fmt::Display) -> ErreurMoteur + '_ {
    move |cause| ErreurMoteur::simple(format!("{contexte} : {cause}"))
}

/// Enregistre le modèle, ses visuels et les correspondances dans `chemin`.
pub fn enregistrer(
    chemin: &str,
    document: &str,
    modele: &Value,
    correspondances: &Value,
    visuels: &Value,
    fonds: &Fonds,
) -> Result<(), ErreurMoteur> {
    if !DOCUMENTS.contains(&document) {
        return Err(ErreurMoteur::simple(format!(
            "Sorte de document inconnue : {document}"
        )));
    }
    let mut modele = modele.clone();
    let mut visuels = visuels.clone();
    let mut fichiers = Vec::new();
    for face in FACES {
        let cle = format!("fond_{face}");
        let Some(virtuel) = modele.get(&cle).and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let extension = virtuel.rsplit('.').next().unwrap_or("bin");
        let interne = format!("fonds/{face}.{extension}");
        let octets = fonds
            .contenu(&virtuel)
            .or_else(|| cartes::fichier_demo(&virtuel))
            .ok_or_else(|| ErreurMoteur::simple(format!("Visuel introuvable : {virtuel}")))?;
        fichiers.push((interne.clone(), octets));
        modele[&cle] = Value::String(interne.clone());
        if let Some(visuel) = visuels.get_mut(face).filter(|v| v.is_object()) {
            visuel["chemin"] = Value::String(interne);
            visuel["texte"] = Value::Null;
        }
    }
    // Courriers Word : le modèle (.docx ou .dotx) voyage avec le projet.
    if document == "word" {
        let source = modele["chemin"].as_str().unwrap_or_default().to_owned();
        let extension = if source.to_lowercase().ends_with(".dotx") {
            "dotx"
        } else {
            "docx"
        };
        let interne = format!("modele.{extension}");
        fichiers.push((
            interne.clone(),
            Bytes::new(fichiers::lire(&source, Nature::Word)?),
        ));
        modele["chemin"] = Value::String(interne);
    }
    let projet = json!({
        "application": APPLICATION,
        "format": VERSION_FORMAT,
        "document": document,
        "modele": modele,
        "correspondances": correspondances,
        "visuels": visuels,
    });

    let ecriture = erreur("Impossible d'enregistrer le projet");
    let fichier = std::fs::File::create(chemin).map_err(|e| ecriture(&e))?;
    let mut archive = zip::ZipWriter::new(fichier);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let contenu = serde_json::to_vec_pretty(&projet).map_err(|e| ecriture(&e))?;
    archive
        .start_file(ENTREE_PROJET, options)
        .map_err(|e| ecriture(&e))?;
    archive.write_all(&contenu).map_err(|e| ecriture(&e))?;
    for (nom, octets) in fichiers {
        archive.start_file(nom, options).map_err(|e| ecriture(&e))?;
        archive.write_all(&octets).map_err(|e| ecriture(&e))?;
    }
    archive.finish().map_err(|e| ecriture(&e))?;
    Ok(())
}

/// Dossier de travail neuf pour un projet rouvert (dans le dossier temporaire du système).
fn dossier_de_travail() -> std::io::Result<std::path::PathBuf> {
    static COMPTEUR: AtomicUsize = AtomicUsize::new(0);
    let numero = COMPTEUR.fetch_add(1, Ordering::Relaxed);
    let dossier = std::env::temp_dir().join(format!(
        "automat-process-{}-projet-{numero}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dossier)?;
    Ok(dossier)
}

/// Rouvre un projet : ses visuels reprennent place dans la réserve des fonds.
pub fn ouvrir(chemin: &str, fonds: &Fonds) -> Result<ProjetOuvert, ErreurMoteur> {
    let lecture = erreur("Impossible d'ouvrir le projet");
    let fichier = std::fs::File::open(chemin).map_err(|e| lecture(&e))?;
    let mut archive = ZipArchive::new(fichier)
        .map_err(|_| ErreurMoteur::simple("Ce fichier n'est pas un projet Automat-Process."))?;
    let projet: Value =
        serde_json::from_reader(archive.by_name(ENTREE_PROJET).map_err(|_| {
            ErreurMoteur::simple("Ce fichier n'est pas un projet Automat-Process.")
        })?)
        .map_err(|e| lecture(&e))?;
    if projet["application"] != APPLICATION {
        return Err(ErreurMoteur::simple(
            "Ce fichier n'est pas un projet Automat-Process.",
        ));
    }
    if projet["format"].as_u64().unwrap_or(0) > VERSION_FORMAT {
        return Err(ErreurMoteur::simple(
            "Ce projet a été créé par une version plus récente d'Automat-Process : mettez l'application à jour.",
        ));
    }

    let mut modele = projet["modele"].clone();
    let mut visuels = if projet["visuels"].is_object() {
        projet["visuels"].clone()
    } else {
        json!({})
    };
    for face in FACES {
        let cle = format!("fond_{face}");
        let Some(interne) = modele.get(&cle).and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let mut octets = Vec::new();
        archive
            .by_name(&interne)
            .map_err(|_| {
                ErreurMoteur::simple(format!("Visuel manquant dans le projet : {interne}"))
            })?
            .read_to_end(&mut octets)
            .map_err(|e| lecture(&e))?;
        let extension = interne.rsplit('.').next().unwrap_or_default();
        let nom = visuels[face]["nomFichier"]
            .as_str()
            .unwrap_or(&interne)
            .to_owned();
        let fond = fonds.ajouter(octets, extension, nom)?;
        modele[&cle] = Value::String(fond.chemin.clone());
        if visuels[face].is_object() {
            // Analyse fraîche : source d'un SVG, textes d'un PDF (pour les remplacer d'un clic).
            visuels[face]["chemin"] = Value::String(fond.chemin.clone());
            visuels[face]["texte"] = serde_json::to_value(&fond.texte).map_err(|e| lecture(&e))?;
            visuels[face]["textes"] =
                serde_json::to_value(&fond.textes).map_err(|e| lecture(&e))?;
        } else {
            visuels[face] = serde_json::to_value(&fond).map_err(|e| lecture(&e))?;
        }
    }
    // Courriers Word : le modèle est extrait dans un dossier de travail, d'où il sera relu.
    if projet["document"] == "word" {
        let interne = modele["chemin"]
            .as_str()
            .unwrap_or("modele.docx")
            .to_owned();
        let mut octets = Vec::new();
        archive
            .by_name(&interne)
            .map_err(|_| ErreurMoteur::simple("Le modèle Word manque dans ce projet."))?
            .read_to_end(&mut octets)
            .map_err(|e| lecture(&e))?;
        let dossier = dossier_de_travail().map_err(|e| lecture(&e))?;
        let extrait = dossier.join(&interne);
        std::fs::write(&extrait, octets).map_err(|e| lecture(&e))?;
        modele["chemin"] = Value::String(extrait.to_string_lossy().into_owned());
    }
    Ok(ProjetOuvert {
        // Les premiers projets ne contenaient que des cartes.
        document: projet["document"].as_str().unwrap_or("carte").to_owned(),
        modele,
        correspondances: projet["correspondances"].clone(),
        visuels,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chemin_temporaire(nom: &str) -> String {
        let dossier = std::env::temp_dir().join("automat-process-tests");
        std::fs::create_dir_all(&dossier).unwrap();
        dossier.join(nom).to_string_lossy().into_owned()
    }

    #[test]
    fn enregistre_et_rouvre_un_projet() {
        let fonds = Fonds::default();
        let chemin = chemin_temporaire("demo.automat");
        let mut modele = cartes::modele_demo();
        modele["nom"] = "Cartes 2026".into();
        let correspondances = json!({ "Email": "E-mail" });
        let visuels =
            json!({ "recto": { "nomFichier": "recto.svg", "largeurMm": 91.0, "texte": "<svg/>" } });
        enregistrer(
            &chemin,
            "carte",
            &modele,
            &correspondances,
            &visuels,
            &fonds,
        )
        .unwrap();

        let ouvert = ouvrir(&chemin, &fonds).unwrap();
        assert_eq!(ouvert.document, "carte");
        assert_eq!(ouvert.modele["nom"], "Cartes 2026");
        assert_eq!(ouvert.correspondances["Email"], "E-mail");
        let recto = ouvert.modele["fond_recto"].as_str().unwrap();
        assert!(recto.starts_with("/fonds/") && recto.ends_with(".svg"));
        assert_eq!(ouvert.visuels["recto"]["chemin"], recto);
        assert_eq!(ouvert.visuels["recto"]["largeurMm"], 91.0);
        // Le verso n'avait pas d'informations enregistrées : elles sont recalculées.
        assert_eq!(ouvert.visuels["verso"]["genre"], "pdf");
        assert!(fonds.contenu(recto).is_some());
        assert_eq!(ouvert.modele["champs"], modele["champs"]);
    }

    #[test]
    fn distingue_un_visuel_d_ecran_d_une_carte() {
        let fonds = Fonds::default();
        let chemin = chemin_temporaire("fond-teams.automat");
        let mut modele = cartes::modele_demo();
        modele["format"]["px"] = json!({ "largeur": 1920, "hauteur": 1080 });
        enregistrer(&chemin, "ecran", &modele, &json!({}), &json!({}), &fonds).unwrap();
        let ouvert = ouvrir(&chemin, &fonds).unwrap();
        assert_eq!(ouvert.document, "ecran");
        assert_eq!(ouvert.modele["format"]["px"]["largeur"], 1920);
    }

    #[test]
    fn enregistre_une_signature() {
        let fonds = Fonds::default();
        let chemin = chemin_temporaire("signature.automat");
        let modele = json!({ "nom": "Équipe", "source": "mise-en-page", "lignes": [{ "role": "nom", "modele": "{{NOM}}" }] });
        enregistrer(
            &chemin,
            "signature",
            &modele,
            &json!({ "NOM": "Nom" }),
            &json!({}),
            &fonds,
        )
        .unwrap();
        let ouvert = ouvrir(&chemin, &fonds).unwrap();
        assert_eq!(ouvert.document, "signature");
        assert_eq!(ouvert.modele, modele);
        assert!(enregistrer(&chemin, "affiche", &modele, &json!({}), &json!({}), &fonds).is_err());
    }

    #[test]
    fn enregistre_un_courrier_word_avec_son_modele() {
        let fonds = Fonds::default();
        let docx = chemin_temporaire("convocation.docx");
        let mut octets = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut octets));
            zip.start_file("word/document.xml", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"<w:document>{{NOM}}</w:document>").unwrap();
            zip.finish().unwrap();
        }
        std::fs::write(&docx, &octets).unwrap();
        let chemin = chemin_temporaire("courrier.automat");
        let modele =
            json!({ "chemin": docx, "nomFichier": "convocation.docx", "nommage": "{{NOM}}" });
        enregistrer(
            &chemin,
            "word",
            &modele,
            &json!({ "NOM": "Nom" }),
            &json!({}),
            &fonds,
        )
        .unwrap();
        std::fs::remove_file(&docx).unwrap(); // le projet se suffit à lui-même

        let ouvert = ouvrir(&chemin, &fonds).unwrap();
        assert_eq!(ouvert.document, "word");
        assert_eq!(ouvert.modele["nommage"], "{{NOM}}");
        let extrait = ouvert.modele["chemin"].as_str().unwrap();
        assert!(extrait.ends_with("modele.docx"));
        assert_eq!(std::fs::read(extrait).unwrap(), octets);
    }

    #[test]
    fn refuse_un_fichier_qui_n_est_pas_un_projet() {
        let chemin = chemin_temporaire("faux.automat");
        std::fs::write(&chemin, b"pas une archive").unwrap();
        let erreur = ouvrir(&chemin, &Fonds::default()).unwrap_err();
        assert!(erreur.message.contains("n'est pas un projet"));
    }
}
