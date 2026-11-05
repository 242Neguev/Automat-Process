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
use crate::langue::texte;
use crate::moteur::ErreurMoteur;
use crate::tr;

const APPLICATION: &str = "Automat-Process";
const VERSION_FORMAT: u64 = 1;
const ENTREE_PROJET: &str = "projet.json";
/// Visuels qu'un modèle peut désigner (clé « fond_… ») : recto et verso pour l'imprimeur, leurs
/// versions écran (cartes numériques) et le calque de référence de l'éditeur (jamais imprimé).
const EMPLACEMENTS: [&str; 5] = ["recto", "verso", "recto_ecran", "verso_ecran", "calque"];
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
    move |cause| ErreurMoteur::simple(tr!("{contexte} : {cause}", "{contexte}: {cause}"))
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
        return Err(ErreurMoteur::simple(tr!(
            "Sorte de document inconnue : {document}",
            "Unknown kind of document: {document}"
        )));
    }
    let mut modele = modele.clone();
    let mut visuels = visuels.clone();
    let mut fichiers = Vec::new();
    // Range un visuel dans l'archive, sous le nom de son emplacement ; renvoie son nom dans l'archive.
    let mut ranger = |virtuel: &str, emplacement: &str, visuels: &mut Value| {
        let extension = virtuel.rsplit('.').next().unwrap_or("bin");
        let interne = format!("fonds/{emplacement}.{extension}");
        let octets = fonds
            .contenu(virtuel)
            .or_else(|| cartes::fichier_demo(virtuel))
            .ok_or_else(|| {
                ErreurMoteur::simple(tr!(
                    "Visuel introuvable : {virtuel}",
                    "Design not found: {virtuel}"
                ))
            })?;
        fichiers.push((interne.clone(), octets));
        if let Some(visuel) = visuels.get_mut(emplacement).filter(|v| v.is_object()) {
            visuel["chemin"] = Value::String(interne.clone());
            visuel["texte"] = Value::Null;
        }
        Ok::<String, ErreurMoteur>(interne)
    };
    for face in EMPLACEMENTS {
        let cle = format!("fond_{face}");
        let Some(virtuel) = modele.get(&cle).and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        modele[&cle] = Value::String(ranger(&virtuel, face, &mut visuels)?);
    }
    // Visuels propres aux variantes (emplacements « variante-v1-recto »…).
    for (rang, variante) in valeurs_des_variantes(&mut modele).iter_mut().enumerate() {
        for face in ["recto", "verso"] {
            let cle = format!("fond_{face}");
            let Some(virtuel) = variante
                .get(&cle)
                .and_then(Value::as_str)
                .map(str::to_owned)
            else {
                continue;
            };
            let emplacement = emplacement_de_variante(variante, rang, face);
            variante[&cle] = Value::String(ranger(&virtuel, &emplacement, &mut visuels)?);
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

    let ecriture = erreur(texte(
        "Impossible d'enregistrer le projet",
        "Cannot save the project",
    ));
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

/// Variantes du modèle (filiale, langue…), chacune avec ses propres visuels.
fn valeurs_des_variantes(modele: &mut Value) -> &mut [Value] {
    match modele
        .pointer_mut("/variantes/valeurs")
        .and_then(Value::as_array_mut)
    {
        Some(valeurs) => valeurs,
        None => &mut [],
    }
}

/// Emplacement d'un visuel de variante, comme l'interface le nomme (« variante-v1-recto ») ; un
/// identifiant inattendu est remplacé par le rang de la variante (le nom sert dans l'archive).
fn emplacement_de_variante(variante: &Value, rang: usize, face: &str) -> String {
    let id = variante["id"]
        .as_str()
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 20
                && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        })
        .map_or_else(|| rang.to_string(), str::to_owned);
    format!("variante-{id}-{face}")
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
    let lecture = erreur(texte(
        "Impossible d'ouvrir le projet",
        "Cannot open the project",
    ));
    let fichier = std::fs::File::open(chemin).map_err(|e| lecture(&e))?;
    let mut archive = ZipArchive::new(fichier).map_err(|_| {
        ErreurMoteur::simple(tr!(
            "Ce fichier n'est pas un projet Automat-Process.",
            "This file is not an Automat-Process project."
        ))
    })?;
    let projet: Value = serde_json::from_reader(archive.by_name(ENTREE_PROJET).map_err(|_| {
        ErreurMoteur::simple(tr!(
            "Ce fichier n'est pas un projet Automat-Process.",
            "This file is not an Automat-Process project."
        ))
    })?)
    .map_err(|e| lecture(&e))?;
    if projet["application"] != APPLICATION {
        return Err(ErreurMoteur::simple(tr!(
            "Ce fichier n'est pas un projet Automat-Process.",
            "This file is not an Automat-Process project."
        )));
    }
    if projet["format"].as_u64().unwrap_or(0) > VERSION_FORMAT {
        return Err(ErreurMoteur::simple(tr!(
            "Ce projet a été créé par une version plus récente d'Automat-Process : mettez l'application à jour.",
            "This project was created by a newer version of Automat-Process: update the application."
        )));
    }

    let mut modele = projet["modele"].clone();
    let mut visuels = if projet["visuels"].is_object() {
        projet["visuels"].clone()
    } else {
        json!({})
    };
    // Remet un visuel de l'archive dans la réserve des fonds ; renvoie son nouveau chemin virtuel.
    let mut restaurer = |interne: &str, emplacement: &str, visuels: &mut Value| {
        let mut octets = Vec::new();
        archive
            .by_name(interne)
            .map_err(|_| {
                ErreurMoteur::simple(tr!(
                    "Visuel manquant dans le projet : {interne}",
                    "Design missing from the project: {interne}"
                ))
            })?
            .read_to_end(&mut octets)
            .map_err(|e| lecture(&e))?;
        let extension = interne.rsplit('.').next().unwrap_or_default();
        let nom = visuels[emplacement]["nomFichier"]
            .as_str()
            .unwrap_or(interne)
            .to_owned();
        let fond = fonds.ajouter(octets, extension, nom)?;
        if visuels[emplacement].is_object() {
            // Analyse fraîche : source d'un SVG, textes d'un PDF (pour les remplacer d'un clic).
            visuels[emplacement]["chemin"] = Value::String(fond.chemin.clone());
            visuels[emplacement]["texte"] =
                serde_json::to_value(&fond.texte).map_err(|e| lecture(&e))?;
            visuels[emplacement]["textes"] =
                serde_json::to_value(&fond.textes).map_err(|e| lecture(&e))?;
        } else {
            visuels[emplacement] = serde_json::to_value(&fond).map_err(|e| lecture(&e))?;
        }
        Ok::<String, ErreurMoteur>(fond.chemin)
    };
    for face in EMPLACEMENTS {
        let cle = format!("fond_{face}");
        let Some(interne) = modele.get(&cle).and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        modele[&cle] = Value::String(restaurer(&interne, face, &mut visuels)?);
    }
    for (rang, variante) in valeurs_des_variantes(&mut modele).iter_mut().enumerate() {
        for face in ["recto", "verso"] {
            let cle = format!("fond_{face}");
            let Some(interne) = variante
                .get(&cle)
                .and_then(Value::as_str)
                .map(str::to_owned)
            else {
                continue;
            };
            let emplacement = emplacement_de_variante(variante, rang, face);
            variante[&cle] = Value::String(restaurer(&interne, &emplacement, &mut visuels)?);
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
            .map_err(|_| {
                ErreurMoteur::simple(tr!(
                    "Le modèle Word manque dans ce projet.",
                    "The Word template is missing from this project."
                ))
            })?
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
    fn emporte_les_versions_ecran_et_le_calque() {
        let fonds = Fonds::default();
        let png = |cote: u32| {
            let image = tiny_skia::Pixmap::new(cote, cote).unwrap();
            image.encode_png().unwrap()
        };
        let ecran = fonds
            .ajouter(png(40), "png", "recto-ecran.png".into())
            .unwrap();
        let calque = fonds
            .ajouter(png(30), "png", "maquette.png".into())
            .unwrap();
        let mut modele = cartes::modele_demo();
        modele["fond_recto_ecran"] = ecran.chemin.clone().into();
        modele["fond_calque"] = calque.chemin.clone().into();
        // Comme l'interface : les informations de chaque visuel accompagnent le modèle.
        let visuels = json!({
            "recto_ecran": { "nomFichier": "recto-ecran.png", "largeurPx": 40 },
            "calque": { "nomFichier": "maquette.png", "largeurPx": 30 },
        });
        let chemin = chemin_temporaire("versions-ecran.automat");
        enregistrer(&chemin, "carte", &modele, &json!({}), &visuels, &fonds).unwrap();

        let rouverts = Fonds::default();
        let ouvert = ouvrir(&chemin, &rouverts).unwrap();
        for (cle, emplacement, cote) in [
            ("fond_recto_ecran", "recto_ecran", 40),
            ("fond_calque", "calque", 30),
        ] {
            let virtuel = ouvert.modele[cle].as_str().unwrap();
            assert_eq!(ouvert.visuels[emplacement]["chemin"], virtuel);
            assert_eq!(ouvert.visuels[emplacement]["largeurPx"], cote);
            assert!(rouverts.contenu(virtuel).is_some());
        }
    }

    #[test]
    fn emporte_les_visuels_des_variantes() {
        let fonds = Fonds::default();
        let png = |cote: u32| {
            tiny_skia::Pixmap::new(cote, cote)
                .unwrap()
                .encode_png()
                .unwrap()
        };
        let douala = fonds.ajouter(png(20), "png", "douala.png".into()).unwrap();
        let abidjan = fonds
            .ajouter(png(24), "png", "abidjan-verso.png".into())
            .unwrap();
        let mut modele = cartes::modele_demo();
        modele["variantes"] = json!({ "balise": "Filiale", "valeurs": [
            { "id": "v1", "valeur": "Douala", "fond_recto": douala.chemin },
            { "id": "v2", "valeur": "Abidjan", "fond_verso": abidjan.chemin, "fond_recto": null },
            { "id": "../x", "valeur": "Sans visuel" },
        ] });
        let visuels = json!({
            "variante-v1-recto": { "nomFichier": "douala.png", "largeurPx": 20 },
            "variante-v2-verso": { "nomFichier": "abidjan-verso.png", "largeurPx": 24 },
        });
        let chemin = chemin_temporaire("variantes.automat");
        enregistrer(&chemin, "carte", &modele, &json!({}), &visuels, &fonds).unwrap();

        let rouverts = Fonds::default();
        let ouvert = ouvrir(&chemin, &rouverts).unwrap();
        let valeurs = &ouvert.modele["variantes"]["valeurs"];
        for (rang, face, emplacement, cote) in [
            (0, "recto", "variante-v1-recto", 20),
            (1, "verso", "variante-v2-verso", 24),
        ] {
            let virtuel = valeurs[rang][format!("fond_{face}")].as_str().unwrap();
            assert!(virtuel.starts_with("/fonds/"), "{virtuel}");
            assert!(rouverts.contenu(virtuel).is_some());
            assert_eq!(ouvert.visuels[emplacement]["chemin"], virtuel);
            assert_eq!(ouvert.visuels[emplacement]["largeurPx"], cote);
        }
        assert!(valeurs[1]["fond_recto"].is_null());
        assert_eq!(valeurs[2]["valeur"], "Sans visuel");
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
