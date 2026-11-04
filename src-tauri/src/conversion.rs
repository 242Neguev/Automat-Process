//! Conversion des courriers Word en PDF : avec Microsoft Word (Windows, piloté sans l'afficher, pour
//! un rendu identique), sinon avec LibreOffice s'il est installé.
//!
//! Chaque conversion est surveillée : un logiciel qui ne donne plus signe de vie est arrêté. Un Word
//! bloqué (fenêtre invisible d'activation d'Office ou de premier lancement…) est remplacé par
//! LibreOffice, puis laissé de côté jusqu'au prochain lancement de l'application.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, PoisonError, mpsc};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::moteur::ErreurMoteur;

/// Logiciel qui a fait la conversion.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Convertisseur {
    Word,
    LibreOffice,
}

/// Résultat d'une conversion : les PDF créés (dans l'ordre des documents), le logiciel utilisé et,
/// quand Word est installé mais n'a pas fait la conversion, pourquoi (LibreOffice a pris le relais).
#[derive(Debug, Serialize)]
pub struct Conversion {
    pub convertisseur: Convertisseur,
    pub pdfs: Vec<String>,
    pub remarque: Option<String>,
}

const AUCUN: &str = "Ni Microsoft Word ni LibreOffice n'ont été trouvés sur cet ordinateur : les courriers ne peuvent pas être convertis en PDF (les documents Word restent disponibles).";
#[cfg_attr(not(windows), allow(dead_code))]
const WORD_BLOQUE: &str = "Microsoft Word ne répond pas : une fenêtre invisible le bloque sans doute (activation d'Office, premier lancement…). Ouvrez Word une fois à la main et fermez ses fenêtres (s'il propose le mode sans échec, répondez Non), puis relancez Automat-Process.";
const LIBREOFFICE_BLOQUE: &str = "LibreOffice ne répond plus : la conversion a été arrêtée. Fermez LibreOffice s'il est ouvert, puis réessayez.";

/// Délais sans signe de vie au-delà desquels un logiciel est considéré comme bloqué. Le premier
/// document de LibreOffice comprend son démarrage, long la première fois (création de son profil).
#[cfg_attr(not(windows), allow(dead_code))]
const DEMARRAGE_WORD: Duration = Duration::from_secs(90);
#[cfg_attr(not(windows), allow(dead_code))]
const DOCUMENT_WORD: Duration = Duration::from_secs(120);
const PREMIER_DOCUMENT_LIBREOFFICE: Duration = Duration::from_secs(300);
const DOCUMENT_LIBREOFFICE: Duration = Duration::from_secs(120);

/// Une conversion à la fois : Word et LibreOffice ne se pilotent pas deux fois en parallèle (aperçu
/// fidèle demandé pendant la création des documents, par exemple).
static UNE_A_LA_FOIS: Mutex<()> = Mutex::new(());

/// Pourquoi Word, bloqué, est laissé de côté jusqu'au prochain lancement de l'application.
static WORD_ECARTE: Mutex<Option<String>> = Mutex::new(None);

/// Ce qu'a donné Word.
#[cfg_attr(not(windows), allow(dead_code))]
enum ResultatWord {
    /// Word n'est pas installé.
    Absent,
    Fait,
    /// Word est installé mais n'a pas converti les documents ; `bloque` : il ne répondait plus.
    Echec {
        message: String,
        bloque: bool,
    },
}

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
    let _une_a_la_fois = UNE_A_LA_FOIS.lock().unwrap_or_else(PoisonError::into_inner);
    std::fs::create_dir_all(dossier).map_err(echec("Dossier des PDF impossible à créer"))?;
    let pdfs: Vec<PathBuf> = documents
        .iter()
        .map(|document| pdf_de(document, dossier))
        .collect();
    let ecarte = WORD_ECARTE
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone();
    let remarque = match ecarte {
        Some(raison) => Some(raison),
        None => match avec_word(documents, &pdfs) {
            ResultatWord::Fait => return resultat(Convertisseur::Word, &pdfs, None),
            ResultatWord::Absent => None,
            ResultatWord::Echec { message, bloque } => {
                if bloque {
                    *WORD_ECARTE.lock().unwrap_or_else(PoisonError::into_inner) =
                        Some(message.clone());
                }
                Some(message)
            }
        },
    };
    let Some(soffice) = libreoffice() else {
        // Sans LibreOffice pour prendre le relais, l'échec de Word est l'erreur à montrer.
        return Err(ErreurMoteur::simple(
            remarque.unwrap_or_else(|| AUCUN.into()),
        ));
    };
    avec_libreoffice(&soffice, documents, dossier)?;
    resultat(Convertisseur::LibreOffice, &pdfs, remarque)
}

/// Résultat d'une conversion, après avoir vérifié que chaque PDF a bien été créé.
fn resultat(
    convertisseur: Convertisseur,
    pdfs: &[PathBuf],
    remarque: Option<String>,
) -> Result<Conversion, ErreurMoteur> {
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
        remarque,
    })
}

/// Word, piloté par un script PowerShell qui signale chaque étape : « pret » quand Word a démarré,
/// puis « fait » après chaque document.
#[cfg(windows)]
fn avec_word(documents: &[PathBuf], pdfs: &[PathBuf]) -> ResultatWord {
    const SCRIPT: &str = include_str!("../scripts/word-en-pdf.ps1");
    let en_echec = |message: String| ResultatWord::Echec {
        message,
        bloque: false,
    };
    let travail = std::env::temp_dir().join(format!("automat-process-word-{}", std::process::id()));
    let script = travail.join("word-en-pdf.ps1");
    let liste = travail.join("conversions.txt");
    let lignes: Vec<String> = documents
        .iter()
        .zip(pdfs)
        .map(|(document, pdf)| format!("{}\t{}", document.display(), pdf.display()))
        .collect();
    let preparation = std::fs::create_dir_all(&travail)
        .and_then(|()| std::fs::write(&script, SCRIPT))
        .and_then(|()| std::fs::write(&liste, lignes.join("\r\n")));
    if let Err(erreur) = preparation {
        return en_echec(format!(
            "La conversion par Word n'a pas pu être préparée : {erreur}"
        ));
    }
    let lancement = std::time::SystemTime::now();
    let mut commande = Command::new("powershell.exe");
    commande
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&script)
        .arg("-Liste")
        .arg(&liste);
    let surveillance = surveiller(&mut commande, |signes| {
        if signes == 0 {
            DEMARRAGE_WORD
        } else {
            DOCUMENT_WORD
        }
    });
    let _ = std::fs::remove_dir_all(&travail);
    match surveillance {
        Ok(fin) => match fin.code {
            Some(0) => ResultatWord::Fait,
            Some(3) => ResultatWord::Absent,
            _ => en_echec(format!(
                "Microsoft Word n'a pas pu convertir les courriers : {}",
                fin.erreurs
            )),
        },
        Err(Interruption::Erreur(erreur)) => {
            en_echec(format!("PowerShell n'a pas pu être lancé : {erreur}"))
        }
        Err(Interruption::Bloque) => {
            arreter_word_lance_depuis(lancement);
            ResultatWord::Echec {
                message: WORD_BLOQUE.into(),
                bloque: true,
            }
        }
    }
}

#[cfg(not(windows))]
fn avec_word(_: &[PathBuf], _: &[PathBuf]) -> ResultatWord {
    ResultatWord::Absent
}

/// Arrête les instances de Word lancées par automatisation depuis `debut` : celle qui ne répond plus.
/// Windows, et non PowerShell, démarre Word : on le retrouve à sa ligne de commande et à son heure de
/// lancement. Un Word ouvert par l'utilisateur n'est jamais touché.
#[cfg(windows)]
fn arreter_word_lance_depuis(debut: std::time::SystemTime) {
    // Date au format FILETIME de Windows : centaines de nanosecondes depuis 1601.
    let filetime = debut
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duree| duree.as_nanos() / 100 + 116_444_736_000_000_000);
    let script = format!(
        "$debut = [DateTime]::FromFileTimeUtc({filetime}); \
         Get-CimInstance Win32_Process -Filter 'Name=''WINWORD.EXE''' | \
         Where-Object {{ $_.CommandLine -like '*/Automation*' -and $_.CreationDate.ToUniversalTime() -ge $debut }} | \
         ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
    );
    let mut commande = Command::new("powershell.exe");
    commande.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    let _ = surveiller(&mut commande, |_| Duration::from_secs(60));
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
    let mut commande = Command::new(soffice);
    commande
        .args([
            profil.as_str(),
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
        ])
        .arg(dossier)
        .args(documents);
    // LibreOffice écrit une ligne par document converti.
    let delai = |signes| {
        if signes == 0 {
            PREMIER_DOCUMENT_LIBREOFFICE
        } else {
            DOCUMENT_LIBREOFFICE
        }
    };
    match surveiller(&mut commande, delai) {
        Ok(fin) if fin.code == Some(0) => Ok(()),
        Ok(fin) => Err(ErreurMoteur::simple(format!(
            "LibreOffice n'a pas pu convertir les courriers : {}",
            fin.erreurs
        ))),
        Err(Interruption::Erreur(erreur)) => Err(ErreurMoteur::simple(format!(
            "LibreOffice n'a pas pu être lancé : {erreur}"
        ))),
        Err(Interruption::Bloque) => Err(ErreurMoteur::simple(LIBREOFFICE_BLOQUE)),
    }
}

/// Fin d'un programme surveillé : son code de sortie et ses messages d'erreur.
#[derive(Debug)]
struct Fin {
    code: Option<i32>,
    erreurs: String,
}

#[derive(Debug)]
enum Interruption {
    /// Le programme n'a pas pu être lancé ou attendu.
    Erreur(std::io::Error),
    /// Le programme ne donnait plus signe de vie : il a été arrêté.
    Bloque,
}

/// Lance `commande` sans fenêtre et attend sa fin en surveillant sa sortie standard : chaque ligne
/// écrite est un signe de vie. Muet plus de `delai(signes déjà reçus)`, le programme est arrêté, avec
/// les programmes qu'il a lancés.
fn surveiller(
    commande: &mut Command,
    delai: impl Fn(usize) -> Duration,
) -> Result<Fin, Interruption> {
    sans_fenetre(commande);
    let mut programme = commande
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(Interruption::Erreur)?;
    let (signe, signes) = mpsc::channel();
    if let Some(sortie) = programme.stdout.take() {
        std::thread::spawn(move || {
            let mut lecteur = BufReader::new(sortie);
            let mut ligne = Vec::new();
            while lecteur
                .read_until(b'\n', &mut ligne)
                .is_ok_and(|lus| lus > 0)
            {
                ligne.clear();
                if signe.send(()).is_err() {
                    break;
                }
            }
        });
    }
    // Messages d'erreur lus à part : un programme bavard ne doit pas rester bloqué sur un tuyau plein.
    let (texte, erreurs) = mpsc::channel();
    if let Some(mut flux) = programme.stderr.take() {
        std::thread::spawn(move || {
            let mut octets = Vec::new();
            let _ = flux.read_to_end(&mut octets);
            let _ = texte.send(String::from_utf8_lossy(&octets).trim().to_string());
        });
    }
    let mut recus = 0;
    loop {
        match signes.recv_timeout(delai(recus)) {
            Ok(()) => recus += 1,
            // Sortie standard fermée : le programme se termine.
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                arreter(&mut programme);
                return Err(Interruption::Bloque);
            }
        }
    }
    let limite = Instant::now() + delai(recus);
    let statut = loop {
        match programme.try_wait() {
            Ok(Some(statut)) => break statut,
            Ok(None) if Instant::now() < limite => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                arreter(&mut programme);
                return Err(Interruption::Bloque);
            }
            Err(erreur) => return Err(Interruption::Erreur(erreur)),
        }
    };
    Ok(Fin {
        code: statut.code(),
        erreurs: erreurs
            .recv_timeout(Duration::from_secs(5))
            .unwrap_or_default(),
    })
}

/// Arrête un programme et ceux qu'il a lancés (LibreOffice : soffice.exe lance soffice.bin).
fn arreter(programme: &mut Child) {
    #[cfg(windows)]
    {
        let mut taskkill = Command::new("taskkill");
        taskkill
            .args(["/PID", &programme.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        sans_fenetre(&mut taskkill);
        let _ = taskkill.status();
    }
    let _ = programme.kill();
    let _ = programme.wait();
}

/// Aucune fenêtre de console pour les programmes lancés (PowerShell, taskkill…).
#[cfg(windows)]
fn sans_fenetre(commande: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    commande.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn sans_fenetre(_: &mut Command) {}

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

    /// Commande du système qui exécute `script` (cmd sous Windows, sh ailleurs).
    fn shell(script: &str) -> Command {
        if cfg!(windows) {
            let mut commande = Command::new("cmd");
            commande.args(["/D", "/C", script]);
            commande
        } else {
            let mut commande = Command::new("sh");
            commande.args(["-c", script]);
            commande
        }
    }

    #[test]
    fn compte_les_signes_de_vie_et_rend_le_code_de_sortie() {
        let script = if cfg!(windows) {
            "echo un& echo deux& echo souci 1>&2& exit 4"
        } else {
            "echo un; echo deux; echo souci >&2; exit 4"
        };
        let delais = std::cell::RefCell::new(Vec::new());
        let fin = surveiller(&mut shell(script), |signes| {
            delais.borrow_mut().push(signes);
            Duration::from_secs(30)
        })
        .expect("le programme se termine normalement");
        assert_eq!(fin.code, Some(4));
        assert_eq!(fin.erreurs, "souci");
        // Un délai pour attendre chaque ligne, puis la fin de la sortie, puis la fin du programme.
        assert_eq!(*delais.borrow(), [0, 1, 2, 2]);
    }

    /// Un Word piloté qui ne rend plus la main est arrêté ; un Word ouvert par l'utilisateur ne l'est
    /// pas. Lance Microsoft Word : `cargo test -- --ignored arrete_le_word` sur un poste équipé.
    #[cfg(windows)]
    #[test]
    #[ignore = "lance Microsoft Word"]
    fn arrete_le_word_lance_par_automatisation() {
        let instances = || {
            let sortie = Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq WINWORD.EXE", "/FO", "CSV", "/NH"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&sortie.stdout)
                .matches("WINWORD.EXE")
                .count()
        };
        let avant = instances();
        let debut = std::time::SystemTime::now();
        // Comme un Word bloqué par une fenêtre invisible : piloté, il ne rend jamais la main.
        let mut pilote = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                "$w = New-Object -ComObject Word.Application; Start-Sleep -Seconds 300",
            ])
            .spawn()
            .unwrap();
        let limite = Instant::now() + Duration::from_secs(90);
        while instances() <= avant && Instant::now() < limite {
            std::thread::sleep(Duration::from_millis(500));
        }
        assert!(instances() > avant, "Word n'a pas démarré");
        arreter_word_lance_depuis(debut);
        let _ = pilote.kill();
        let _ = pilote.wait();
        std::thread::sleep(Duration::from_secs(2));
        assert_eq!(instances(), avant);
    }

    #[test]
    fn arrete_un_programme_muet() {
        // Programme qui ne dit rien pendant 30 s : arrêté au bout d'une demi-seconde.
        let script = if cfg!(windows) {
            "ping -n 31 127.0.0.1 > nul"
        } else {
            "sleep 30"
        };
        let debut = Instant::now();
        let resultat = surveiller(&mut shell(script), |_| Duration::from_millis(500));
        assert!(matches!(resultat, Err(Interruption::Bloque)));
        assert!(debut.elapsed() < Duration::from_secs(20));
    }
}
