//! Commandes appelées par l'interface (`invoke`). Les calculs tournent hors du fil
//! principal pour ne jamais figer la fenêtre.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

use crate::cartes::{self, DonneesAgent, Face, Feuille, OptionsNumerique, Projet, Sortie, Zone};
use crate::conversion::{self, Conversion};
use crate::fichiers::{self, FichierAEcrire, Nature};
use crate::fonds::{FondImporte, Fonds, TexteRetire};
use crate::impression::{self, Imprimante, Reglages};
use crate::moteur::{ErreurMoteur, Moteur, VERSION_TYPST};
use crate::outils_pdf;
use crate::photos::{PhotoChargee, Photos};
use crate::projet_fichier::{self, ProjetOuvert};
use crate::registres;
use crate::tr;
use crate::word::{self, Courrier};

/// Le moteur est préparé en arrière-plan dès le démarrage (recensement des polices) ;
/// les commandes attendent qu'il soit prêt.
#[derive(Default, Clone)]
pub struct EtatMoteur(Arc<OnceLock<Moteur>>);

impl EtatMoteur {
    pub fn preparer(&self) {
        let cellule = self.0.clone();
        std::thread::spawn(move || {
            cellule.get_or_init(Moteur::nouveau);
        });
    }
}

async fn executer<T: Send + 'static>(
    etat: &EtatMoteur,
    travail: impl FnOnce(&Moteur) -> Result<T, ErreurMoteur> + Send + 'static,
) -> Result<T, ErreurMoteur> {
    let cellule = etat.0.clone();
    tauri::async_runtime::spawn_blocking(move || travail(cellule.wait()))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Le calcul a été interrompu : {erreur}",
                "The calculation was interrupted: {erreur}"
            ))
        })?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfosMoteur {
    version_typst: &'static str,
    nb_polices: usize,
}

#[tauri::command]
pub async fn infos_moteur(etat: State<'_, EtatMoteur>) -> Result<InfosMoteur, ErreurMoteur> {
    executer(&etat, |moteur| {
        Ok(InfosMoteur {
            version_typst: VERSION_TYPST,
            nb_polices: moteur.familles().len(),
        })
    })
    .await
}

/// Familles de polices installées, pour choisir celle d'un champ.
#[tauri::command]
pub async fn familles_polices(etat: State<'_, EtatMoteur>) -> Result<Vec<String>, ErreurMoteur> {
    executer(&etat, |moteur| Ok(moteur.familles())).await
}

#[tauri::command]
pub fn modele_demo() -> serde_json::Value {
    cartes::modele_demo()
}

/// Importe un visuel de carte (PDF, SVG, PNG, JPG) choisi par l'utilisateur.
#[tauri::command]
pub async fn importer_fond(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
) -> Result<FondImporte, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || fonds.importer(&chemin))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Import interrompu : {erreur}",
                "Import interrupted: {erreur}"
            ))
        })?
}

/// Remplace un SVG importé par sa version sans balises, préparée par l'interface.
#[tauri::command]
pub fn remplacer_fond(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    svg: String,
) -> Result<(), ErreurMoteur> {
    fonds.remplacer_svg(&chemin, svg)
}

#[tauri::command]
pub async fn apercu_carte(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agent: DonneesAgent,
    face: Face,
) -> Result<String, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::apercu(moteur, &projet, &agent, face)
    })
    .await
}

#[tauri::command]
pub async fn exporter_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    sortie: Sortie,
    feuille: Feuille,
    chemin: String,
) -> Result<(), ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        let pdf = cartes::exporter(moteur, &projet, &agents, sortie, feuille)?;
        std::fs::write(&chemin, pdf).map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Impossible d'enregistrer « {chemin} » : {erreur}",
                "Cannot save “{chemin}”: {erreur}"
            ))
        })
    })
    .await
}

/// Mesures de mise en page de chaque texte de chaque agent, pour le rapport de contrôle.
#[tauri::command]
pub async fn controler_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
) -> Result<Vec<serde_json::Value>, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::controler(moteur, &projet, &agents)
    })
    .await
}

/// Vignettes JPEG du recto des agents, pour la mosaïque (format décrit dans `cartes::vignettes`).
#[tauri::command]
pub async fn vignettes_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    largeur_px: u32,
) -> Result<Response, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::vignettes(moteur, &projet, &agents, largeur_px).map(Response::new)
    })
    .await
}

/// Bon à tirer des cartes données, enregistré dans `chemin`.
#[tauri::command]
pub async fn exporter_bat(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    titre: String,
    date: String,
    chemin: String,
) -> Result<(), ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        let pdf = cartes::bon_a_tirer(moteur, &projet, &agents, &titre, &date)?;
        std::fs::write(&chemin, pdf).map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Impossible d'enregistrer « {chemin} » : {erreur}",
                "Cannot save “{chemin}”: {erreur}"
            ))
        })
    })
    .await
}

/// Cartes numériques (images ou PDF cliquables, fiches contact) dans un nouveau dossier ; renvoie son chemin.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn exporter_numerique(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    noms: Vec<String>,
    fiches: Vec<String>,
    options: OptionsNumerique,
    dossier: String,
    sous_dossier: String,
) -> Result<String, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::exporter_numerique(
            moteur,
            &projet,
            &agents,
            &noms,
            &fiches,
            options,
            &dossier,
            &sous_dossier,
        )
    })
    .await
}

/// Nom d'un fichier, sans son dossier.
fn nom_de(chemin: &str) -> String {
    Path::new(chemin)
        .file_name()
        .map(|nom| nom.to_string_lossy().into_owned())
        .unwrap_or_else(|| chemin.to_string())
}

async fn en_arriere_plan<T: Send + 'static>(
    travail: impl FnOnce() -> Result<T, ErreurMoteur> + Send + 'static,
) -> Result<T, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(travail)
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Le traitement a été interrompu : {erreur}",
                "The processing was interrupted: {erreur}"
            ))
        })?
}

/// Fusionne des PDF (les PDF des courriers Word), dans l'ordre donné, dans le fichier `sortie`.
#[tauri::command]
pub async fn fusionner_pdf(chemins: Vec<String>, sortie: String) -> Result<(), ErreurMoteur> {
    en_arriere_plan(move || {
        let sources = chemins
            .iter()
            .map(|chemin| Ok((nom_de(chemin), fichiers::lire(chemin, Nature::Pdf)?)))
            .collect::<Result<Vec<_>, ErreurMoteur>>()?;
        let pdf = outils_pdf::fusionner(&sources)?;
        std::fs::write(&sortie, pdf).map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Impossible d'enregistrer « {sortie} » : {erreur}",
                "Cannot save “{sortie}”: {erreur}"
            ))
        })
    })
    .await
}

/// Parties XML à remplir d'un modèle Word (.docx ou .dotx).
#[tauri::command]
pub async fn lire_modele_word(chemin: String) -> Result<HashMap<String, String>, ErreurMoteur> {
    en_arriere_plan(move || word::lire_parties(&fichiers::lire(&chemin, Nature::Word)?)).await
}

/// Courriers écrits : leur dossier et le chemin de chacun.
#[derive(Serialize)]
pub struct CourriersEcrits {
    dossier: String,
    fichiers: Vec<String>,
}

/// Écrit des courriers Word d'après le modèle `modele`, dans le dossier `sous_dossier` de `dossier`
/// (créé au besoin : les courriers peuvent arriver en plusieurs fois).
#[tauri::command]
pub async fn ecrire_courriers(
    modele: String,
    courriers: Vec<Courrier>,
    dossier: String,
    sous_dossier: String,
) -> Result<CourriersEcrits, ErreurMoteur> {
    en_arriere_plan(move || {
        let cible = sous_dossier_de(&dossier, &sous_dossier)?;
        let fichiers = word::ecrire(&fichiers::lire(&modele, Nature::Word)?, &courriers, &cible)?;
        Ok(CourriersEcrits {
            dossier: cible.to_string_lossy().into_owned(),
            fichiers: fichiers
                .iter()
                .map(|f| f.to_string_lossy().into_owned())
                .collect(),
        })
    })
    .await
}

fn sous_dossier_de(dossier: &str, sous_dossier: &str) -> Result<std::path::PathBuf, ErreurMoteur> {
    let nom = fichiers::nom_sur(sous_dossier).ok_or_else(|| {
        ErreurMoteur::simple(tr!("Nom de dossier invalide.", "Invalid folder name."))
    })?;
    Ok(Path::new(dossier).join(nom))
}

/// Dossier temporaire neuf (documents intermédiaires d'une conversion).
#[tauri::command]
pub fn dossier_temporaire() -> Result<String, ErreurMoteur> {
    static COMPTEUR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let numero = COMPTEUR.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dossier =
        std::env::temp_dir().join(format!("automat-process-{}-{numero}", std::process::id()));
    std::fs::create_dir_all(&dossier).map_err(|e| {
        ErreurMoteur::simple(tr!(
            "Dossier temporaire impossible à créer : {e}",
            "The temporary folder cannot be created: {e}"
        ))
    })?;
    Ok(dossier.to_string_lossy().into_owned())
}

/// Supprime un dossier temporaire créé par l'application (rien en dehors du dossier temporaire du système).
#[tauri::command]
pub fn supprimer_temporaire(dossier: String) {
    let chemin = Path::new(&dossier);
    let temporaire = std::env::temp_dir();
    let nom = chemin
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    if chemin.parent() == Some(temporaire.as_path()) && nom.starts_with("automat-process-") {
        let _ = std::fs::remove_dir_all(chemin);
    }
}

/// Convertit des courriers Word en PDF dans le dossier `sous_dossier` de `dossier` ; les documents
/// Word sont supprimés ensuite quand ils n'étaient qu'intermédiaires.
#[tauri::command]
pub async fn convertir_courriers(
    documents: Vec<String>,
    dossier: String,
    sous_dossier: String,
    supprimer_sources: bool,
) -> Result<Conversion, ErreurMoteur> {
    en_arriere_plan(move || {
        let documents: Vec<std::path::PathBuf> = documents.iter().map(Into::into).collect();
        let conversion =
            conversion::en_pdf(&documents, &sous_dossier_de(&dossier, &sous_dossier)?)?;
        if supprimer_sources {
            for document in &documents {
                let _ = std::fs::remove_file(document);
            }
        }
        Ok(conversion)
    })
    .await
}

/// Aperçu fidèle d'un courrier : ses pages en SVG, le logiciel qui l'a mis en page et, si ce n'est pas
/// Word alors qu'il est installé, pourquoi.
#[derive(Serialize)]
pub struct ApercuCourrier {
    pages: Vec<String>,
    convertisseur: conversion::Convertisseur,
    remarque: Option<String>,
}

/// Aperçu fidèle d'un courrier : converti en PDF (Word ou LibreOffice), puis ses pages en SVG.
#[tauri::command]
pub async fn apercu_courrier(
    etat: State<'_, EtatMoteur>,
    modele: String,
    courrier: Courrier,
) -> Result<ApercuCourrier, ErreurMoteur> {
    executer(&etat, move |moteur| {
        let travail = std::path::PathBuf::from(dossier_temporaire()?);
        let resultat = (|| {
            let documents = word::ecrire(
                &fichiers::lire(&modele, Nature::Word)?,
                std::slice::from_ref(&courrier),
                &travail,
            )?;
            let conversion = conversion::en_pdf(&documents, &travail)?;
            let pdf = std::fs::read(&conversion.pdfs[0]).map_err(|e| {
                ErreurMoteur::simple(tr!("PDF illisible : {e}", "Unreadable PDF: {e}"))
            })?;
            Ok(ApercuCourrier {
                pages: outils_pdf::rendre_pages(moteur, pdf)?,
                convertisseur: conversion.convertisseur,
                remarque: conversion.remarque,
            })
        })();
        let _ = std::fs::remove_dir_all(&travail);
        resultat
    })
    .await
}

/// Imprimantes installées, pour l'impression directe des badges (sous Windows ; liste vide ailleurs).
#[tauri::command]
pub async fn imprimantes() -> Result<Vec<Imprimante>, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(impression::imprimantes)
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Recherche interrompue : {erreur}",
                "Search interrupted: {erreur}"
            ))
        })?
        .map_err(ErreurMoteur::simple)
}

/// Imprime directement les cartes des agents sur l'imprimante choisie ; `false` si l'utilisateur a
/// annulé (boîte « Enregistrer l'impression sous » d'une imprimante PDF ou XPS refermée).
#[tauri::command]
pub async fn imprimer_cartes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    agents: Vec<DonneesAgent>,
    imprimante: String,
    reglages: Reglages,
) -> Result<bool, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::imprimer(moteur, &projet, &agents, &imprimante, reglages)
    })
    .await
}

/// Contenu brut d'une liste choisie par l'utilisateur ; elle est décodée dans l'interface.
#[tauri::command]
pub async fn lire_liste(chemin: String) -> Result<Response, ErreurMoteur> {
    lire_fichier(chemin, Nature::Liste).await
}

/// Contenu brut d'un fichier choisi par l'utilisateur (liste, logo, signature existante).
#[tauri::command]
pub async fn lire_fichier(chemin: String, nature: Nature) -> Result<Response, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(move || fichiers::lire(&chemin, nature).map(Response::new))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Lecture interrompue : {erreur}",
                "Reading interrupted: {erreur}"
            ))
        })?
}

/// Enregistre un classeur Excel préparé par l'interface (liste vide à faire remplir) dans `chemin`,
/// qui doit finir par « .xlsx ».
#[tauri::command]
pub async fn enregistrer_classeur(chemin: String, octets: Vec<u8>) -> Result<(), ErreurMoteur> {
    en_arriere_plan(move || {
        if !chemin.to_lowercase().ends_with(".xlsx") {
            return Err(ErreurMoteur::simple(tr!(
                "Le classeur doit être enregistré au format Excel (.xlsx).",
                "The workbook must be saved in Excel format (.xlsx)."
            )));
        }
        std::fs::write(&chemin, octets).map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Impossible d'enregistrer « {chemin} » : {erreur}",
                "Cannot save “{chemin}”: {erreur}"
            ))
        })
    })
    .await
}

/// Écrit des fichiers (pages de signature…) dans un nouveau dossier ; renvoie son chemin.
#[tauri::command]
pub async fn ecrire_fichiers(
    dossier: String,
    sous_dossier: String,
    fichiers: Vec<FichierAEcrire>,
) -> Result<String, ErreurMoteur> {
    tauri::async_runtime::spawn_blocking(move || {
        fichiers::ecrire(&dossier, &sous_dossier, &fichiers)
    })
    .await
    .map_err(|erreur| {
        ErreurMoteur::simple(tr!(
            "Écriture interrompue : {erreur}",
            "Writing interrupted: {erreur}"
        ))
    })?
}

/// Couleur du visuel autour d'une zone : elle sert à effacer un texte incrusté sur un fond uni.
#[tauri::command]
pub async fn couleur_autour(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    zone: Zone,
) -> Result<String, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::couleur_autour(moteur, &projet, zone)
    })
    .await
}

/// Enregistre le modèle (carte ou signature), ses visuels et les correspondances dans un « .automat ».
#[tauri::command]
pub async fn enregistrer_projet(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    document: String,
    modele: serde_json::Value,
    correspondances: serde_json::Value,
    visuels: serde_json::Value,
) -> Result<(), ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || {
        projet_fichier::enregistrer(
            &chemin,
            &document,
            &modele,
            &correspondances,
            &visuels,
            &fonds,
        )
    })
    .await
    .map_err(|erreur| {
        ErreurMoteur::simple(tr!(
            "Enregistrement interrompu : {erreur}",
            "Saving interrupted: {erreur}"
        ))
    })?
}

#[tauri::command]
pub async fn ouvrir_projet(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
) -> Result<ProjetOuvert, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || projet_fichier::ouvrir(&chemin, &fonds))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Ouverture interrompue : {erreur}",
                "Opening interrupted: {erreur}"
            ))
        })?
}

/// Retire un texte d'exemple d'un visuel PDF ; l'interface en fait un champ au même endroit.
#[tauri::command]
pub async fn retirer_texte_pdf(
    fonds: State<'_, Arc<Fonds>>,
    chemin: String,
    id: usize,
) -> Result<TexteRetire, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || fonds.retirer_texte_pdf(&chemin, id))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Traitement interrompu : {erreur}",
                "Processing interrupted: {erreur}"
            ))
        })?
}

/// Empreinte du modèle tel qu'il s'imprime (mise à jour incrémentale : s'il change, toutes les cartes
/// sont à refaire).
#[tauri::command]
pub async fn empreinte_modele(
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
) -> Result<String, ErreurMoteur> {
    let fichiers = fonds.fichiers();
    tauri::async_runtime::spawn_blocking(move || cartes::empreinte_modele(&modele, &fichiers))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Calcul interrompu : {erreur}",
                "Calculation interrupted: {erreur}"
            ))
        })
}

/// Dossier de données de l'application (registres des exports).
fn dossier_donnees(app: &tauri::AppHandle) -> Result<std::path::PathBuf, ErreurMoteur> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|erreur| {
        ErreurMoteur::simple(tr!(
            "Dossier de données de l'application introuvable : {erreur}",
            "The application data folder cannot be found: {erreur}"
        ))
    })
}

/// Registre des exports d'un modèle (empreintes seulement), s'il existe.
#[tauri::command]
pub async fn lire_registre(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<serde_json::Value>, ErreurMoteur> {
    registres::lire(&dossier_donnees(&app)?, &id)
}

#[tauri::command]
pub async fn ecrire_registre(
    app: tauri::AppHandle,
    id: String,
    registre: serde_json::Value,
) -> Result<(), ErreurMoteur> {
    registres::ecrire(&dossier_donnees(&app)?, &id, &registre)
}

#[tauri::command]
pub async fn oublier_registre(app: tauri::AppHandle, id: String) -> Result<(), ErreurMoteur> {
    registres::oublier(&dossier_donnees(&app)?, &id)
}

/// Photos des agents (noms de fichiers ou chemins lus dans la liste), cherchées dans `dossier`,
/// réduites et gardées en mémoire ; le visage de chacune est repéré sous Windows.
#[tauri::command]
pub async fn charger_photos(
    fonds: State<'_, Arc<Fonds>>,
    photos: State<'_, Arc<Photos>>,
    dossier: String,
    noms: Vec<String>,
) -> Result<Vec<PhotoChargee>, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    let photos = Arc::clone(&photos);
    tauri::async_runtime::spawn_blocking(move || photos.charger(&fonds, &dossier, &noms))
        .await
        .map_err(|erreur| {
            ErreurMoteur::simple(tr!(
                "Chargement interrompu : {erreur}",
                "Loading interrupted: {erreur}"
            ))
        })
}

/// Textes d'exemple incrustés dans le visuel du recto, lus par la reconnaissance de caractères de Windows.
#[tauri::command]
pub async fn reconnaitre_textes(
    etat: State<'_, EtatMoteur>,
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
) -> Result<Vec<crate::ocr::TexteLu>, ErreurMoteur> {
    let projet = Projet {
        modele,
        fonds: fonds.fichiers(),
    };
    executer(&etat, move |moteur| {
        cartes::reconnaitre_textes(moteur, &projet)
    })
    .await
}

/// Effacement intelligent de zones du visuel du recto (une image) : la nouvelle image est gardée dans la
/// réserve des fonds sous un nouveau chemin, l'ancienne reste disponible (annulation).
#[tauri::command]
pub async fn effacer_texte(
    fonds: State<'_, Arc<Fonds>>,
    modele: serde_json::Value,
    zones: Vec<Zone>,
    nom_fichier: String,
) -> Result<FondImporte, ErreurMoteur> {
    let fonds = Arc::clone(&fonds);
    tauri::async_runtime::spawn_blocking(move || {
        let projet = Projet {
            modele,
            fonds: fonds.fichiers(),
        };
        let (octets, extension) = cartes::effacer_texte(&projet, &zones)?;
        fonds.ajouter(octets, extension, nom_fichier)
    })
    .await
    .map_err(|erreur| {
        ErreurMoteur::simple(tr!(
            "Effacement interrompu : {erreur}",
            "Erasing interrupted: {erreur}"
        ))
    })?
}

/// Langue de l'interface (« fr » ou « en ») : celle des messages du cœur et des documents produits.
#[tauri::command]
pub fn definir_langue(langue: String) {
    crate::langue::definir(&langue);
}
