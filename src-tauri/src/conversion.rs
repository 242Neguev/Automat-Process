//! Conversion des courriers Word en PDF : avec Microsoft Word (Windows, piloté sans l'afficher, pour
//! un rendu identique), sinon avec LibreOffice s'il est installé.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::moteur::ErreurMoteur;

/// Logiciel qui a fait la conversion.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Convertisseur {
    Word,
    LibreOffice,
}

/// Résultat d'une conversion : les PDF créés (dans l'ordre des documents) et le logiciel utilisé.
#[derive(Debug, Serialize)]
pub struct Conversion {
    pub convertisseur: Convertisseur,
    pub pdfs: Vec<String>,
}

const AUCUN: &str = "Ni Microsoft Word ni LibreOffice n'ont été trouvés sur cet ordinateur : les courriers ne peuvent pas être convertis en PDF (les documents Word restent disponibles).";

/// Chemin du PDF d'un document, dans `dossier`.
fn pdf_de(document: &Path, dossier: &Path) -> PathBuf {
    let nom = document
        .file_stem()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    dossier.join(format!("{nom}.pdf"))
}

fn echec(contexte: &str) -> impl Fn(std::io::Error) -> ErreurMoteur + '_ {
    move |erreur| ErreurMoteur::simple(format!("{contexte} : {erreur}"))
}

/// Convertit chaque document en PDF dans `dossier` (même nom, extension .pdf).
pub fn en_pdf(documents: &[PathBuf], dossier: &Path) -> Result<Conversion, ErreurMoteur> {
    std::fs::create_dir_all(dossier).map_err(echec("Dossier des PDF impossible à créer"))?;
    let pdfs: Vec<PathBuf> = documents
        .iter()
        .map(|document| pdf_de(document, dossier))
        .collect();
    let convertisseur = if avec_word(documents, &pdfs)? {
        Convertisseur::Word
    } else if let Some(soffice) = libreoffice() {
        avec_libreoffice(&soffice, documents, dossier)?;
        Convertisseur::LibreOffice
    } else {
        return Err(ErreurMoteur::simple(AUCUN));
    };
    if let Some(manquant) = pdfs.iter().find(|pdf| !pdf.exists()) {
        return Err(ErreurMoteur::simple(format!(
            "La conversion n'a pas produit « {} ».",
            manquant.display()
        )));
    }
    Ok(Conversion {
        convertisseur,
        pdfs: pdfs
            .iter()
            .map(|pdf| pdf.to_string_lossy().into_owned())
            .collect(),
    })
}

/// Word, par un script PowerShell : `Ok(false)` quand Word n'est pas installé.
#[cfg(windows)]
fn avec_word(documents: &[PathBuf], pdfs: &[PathBuf]) -> Result<bool, ErreurMoteur> {
    use std::os::windows::process::CommandExt;
    const SCRIPT: &str = include_str!("../scripts/word-en-pdf.ps1");
    const SANS_FENETRE: u32 = 0x0800_0000;

    let travail = std::env::temp_dir().join(format!("automat-process-word-{}", std::process::id()));
    std::fs::create_dir_all(&travail).map_err(echec("Dossier de travail impossible à créer"))?;
    let script = travail.join("word-en-pdf.ps1");
    let liste = travail.join("conversions.txt");
    std::fs::write(&script, SCRIPT).map_err(echec("Script de conversion impossible à écrire"))?;
    let lignes: Vec<String> = documents
        .iter()
        .zip(pdfs)
        .map(|(document, pdf)| format!("{}\t{}", document.display(), pdf.display()))
        .collect();
    std::fs::write(&liste, lignes.join("\r\n"))
        .map_err(echec("Liste des conversions impossible à écrire"))?;
    let sortie = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&script)
        .arg("-Liste")
        .arg(&liste)
        .creation_flags(SANS_FENETRE)
        .output()
        .map_err(echec("PowerShell n'a pas pu être lancé"))?;
    let _ = std::fs::remove_dir_all(&travail);
    match sortie.status.code() {
        Some(0) => Ok(true),
        Some(3) => Ok(false),
        _ => Err(ErreurMoteur::simple(format!(
            "Word n'a pas pu convertir les courriers : {}",
            String::from_utf8_lossy(&sortie.stderr).trim()
        ))),
    }
}

#[cfg(not(windows))]
fn avec_word(_: &[PathBuf], _: &[PathBuf]) -> Result<bool, ErreurMoteur> {
    Ok(false)
}

/// LibreOffice installé à son emplacement habituel (ou présent dans le PATH).
fn libreoffice() -> Option<PathBuf> {
    let candidats: &[&str] = if cfg!(windows) {
        &[
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ]
    } else if cfg!(target_os = "macos") {
        &["/Applications/LibreOffice.app/Contents/MacOS/soffice"]
    } else {
        &["/usr/bin/soffice", "/usr/local/bin/soffice"]
    };
    candidats
        .iter()
        .map(PathBuf::from)
        .find(|chemin| chemin.exists())
}

fn avec_libreoffice(
    soffice: &Path,
    documents: &[PathBuf],
    dossier: &Path,
) -> Result<(), ErreurMoteur> {
    // Profil à part : la conversion fonctionne même si LibreOffice est déjà ouvert.
    let profil = std::env::temp_dir().join("automat-process-libreoffice");
    let profil = format!(
        "-env:UserInstallation=file:///{}",
        profil
            .to_string_lossy()
            .replace('\\', "/")
            .trim_start_matches('/')
    );
    let sortie = Command::new(soffice)
        .args([
            profil.as_str(),
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
        ])
        .arg(dossier)
        .args(documents)
        .output()
        .map_err(echec("LibreOffice n'a pas pu être lancé"))?;
    if sortie.status.success() {
        Ok(())
    } else {
        Err(ErreurMoteur::simple(format!(
            "LibreOffice n'a pas pu convertir les courriers : {}",
            String::from_utf8_lossy(&sortie.stderr).trim()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nomme_les_pdf_d_apres_les_documents() {
        let pdf = pdf_de(
            Path::new("/tmp/Courriers/Aïssatou DIALLO.docx"),
            Path::new("/tmp/PDF"),
        );
        assert_eq!(pdf, PathBuf::from("/tmp/PDF/Aïssatou DIALLO.pdf"));
    }

    #[test]
    fn explique_quand_aucun_convertisseur_n_est_installe() {
        if libreoffice().is_some() || cfg!(windows) {
            return; // poste équipé : la conversion serait réellement lancée
        }
        let erreur = en_pdf(&[PathBuf::from("/tmp/x.docx")], &std::env::temp_dir()).unwrap_err();
        assert!(erreur.message.contains("Ni Microsoft Word ni LibreOffice"));
    }
}
