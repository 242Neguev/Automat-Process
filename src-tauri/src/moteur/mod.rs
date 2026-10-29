//! Moteur de rendu graphique : compile un gabarit Typst avec des fichiers virtuels
//! (données JSON, fonds SVG/PDF/PNG…) puis exporte le résultat en PDF, PNG ou SVG.

mod monde;

use std::collections::HashMap;
use std::fmt;

use serde::Serialize;
use typst::diag::{Severity, SourceDiagnostic};
use typst::foundations::{Bytes, Dict, Str, Value};
use typst::utils::{LazyHash, Scalar};
use typst::{Library, LibraryExt, World, WorldExt};
use typst_kit::fonts::{self, FontStore};
use typst_layout::{Page, PagedDocument};

use monde::Monde;

/// Version de Typst intégrée (doit suivre celle fixée dans Cargo.toml).
pub const VERSION_TYPST: &str = "0.15.1";

/// Fichiers mis à disposition d'un gabarit, indexés par chemin virtuel (ex. « /projet.json »).
pub type Fichiers = HashMap<String, Bytes>;

/// Moteur partagé par toute l'application : les polices ne sont recensées qu'une fois.
pub struct Moteur {
    polices: FontStore,
}

impl Moteur {
    /// Recense les polices intégrées à Typst puis celles installées sur le système.
    pub fn nouveau() -> Self {
        let mut polices = FontStore::new();
        polices.extend(fonts::embedded());
        polices.extend(fonts::system());
        Self { polices }
    }

    /// Familles de polices disponibles, triées par ordre alphabétique.
    pub fn familles(&self) -> Vec<String> {
        let mut familles: Vec<String> = self
            .polices
            .book()
            .families()
            .map(|(nom, _)| nom.to_string())
            .collect();
        familles.sort_by_key(|famille| famille.to_lowercase());
        familles.dedup();
        familles
    }

    /// Compile `source` ; les `entrees` sont lisibles dans le gabarit via `sys.inputs`.
    pub fn compiler(
        &self,
        source: &str,
        fichiers: &Fichiers,
        entrees: &[(&str, &str)],
    ) -> Result<Document, ErreurMoteur> {
        let mut dict = Dict::new();
        for (cle, valeur) in entrees {
            dict.insert(Str::from(*cle), Value::Str(Str::from(*valeur)));
        }
        let bibliotheque = LazyHash::new(Library::builder().with_inputs(dict).build());
        let monde = Monde::nouveau(&bibliotheque, &self.polices, source, fichiers);
        typst::compile::<PagedDocument>(&monde)
            .output
            .map(Document)
            .map_err(|diagnostics| ErreurMoteur::depuis_diagnostics(&diagnostics, Some(&monde)))
    }
}

/// Document compilé, prêt à être exporté.
pub struct Document(PagedDocument);

impl Document {
    pub fn nb_pages(&self) -> usize {
        self.0.pages().len()
    }

    /// PDF vectoriel ; les pages avec fond perdu reçoivent une TrimBox (zone de coupe).
    pub fn pdf(&self) -> Result<Vec<u8>, ErreurMoteur> {
        typst_pdf::pdf(&self.0, &typst_pdf::PdfOptions::default())
            .map_err(|diagnostics| ErreurMoteur::depuis_diagnostics(&diagnostics, None))
    }

    /// Image PNG d'une page, sans le fond perdu. `pixels_par_point` = 2 donne 144 dpi.
    pub fn png(&self, index: usize, pixels_par_point: f64) -> Result<Vec<u8>, ErreurMoteur> {
        let options = typst_render::RenderOptions {
            pixel_per_pt: Scalar::new(pixels_par_point),
            render_bleed: false,
        };
        typst_render::render(self.page(index)?, &options)
            .encode_png()
            .map_err(|erreur| ErreurMoteur::simple(format!("Encodage PNG impossible : {erreur}")))
    }

    /// SVG d'une page, sans le fond perdu : net à tous les niveaux de zoom, idéal pour l'aperçu.
    pub fn svg(&self, index: usize) -> Result<String, ErreurMoteur> {
        Ok(typst_svg::svg(
            self.page(index)?,
            &typst_svg::SvgOptions::default(),
        ))
    }

    fn page(&self, index: usize) -> Result<&Page, ErreurMoteur> {
        self.0
            .pages()
            .get(index)
            .ok_or_else(|| ErreurMoteur::simple(format!("La page {} n'existe pas.", index + 1)))
    }
}

/// Erreur de compilation ou d'export, transmise telle quelle à l'interface.
#[derive(Debug, Serialize)]
pub struct ErreurMoteur {
    pub message: String,
    /// Une ligne par problème, avec sa position dans le gabarit quand elle est connue.
    pub details: Vec<String>,
}

impl ErreurMoteur {
    pub fn simple(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            details: Vec::new(),
        }
    }

    fn depuis_diagnostics(diagnostics: &[SourceDiagnostic], monde: Option<&Monde>) -> Self {
        let details = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity == Severity::Error)
            .map(|diagnostic| {
                let mut ligne = String::new();
                if let Some(monde) = monde
                    && let Some(position) = position(monde, diagnostic)
                {
                    ligne.push_str(&position);
                    ligne.push_str(" : ");
                }
                ligne.push_str(&diagnostic.message);
                for indice in &diagnostic.hints {
                    ligne.push_str(&format!(" (indice : {})", indice.v));
                }
                ligne
            })
            .collect();
        Self {
            message: "Le document n'a pas pu être généré.".into(),
            details,
        }
    }
}

/// « fichier:ligne » d'un diagnostic, quand il pointe dans un source connu.
fn position(monde: &Monde, diagnostic: &SourceDiagnostic) -> Option<String> {
    let id = diagnostic.span.id()?;
    let source = monde.source(id).ok()?;
    let ligne = source
        .lines()
        .byte_to_line(monde.range(diagnostic.span)?.start)?;
    Some(format!("{}:{}", id.vpath().get_without_slash(), ligne + 1))
}

impl fmt::Display for ErreurMoteur {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.message)?;
        for detail in &self.details {
            write!(f, "\n- {detail}")?;
        }
        Ok(())
    }
}

impl std::error::Error for ErreurMoteur {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_et_exporte_les_trois_formats() {
        let moteur = Moteur::nouveau();
        let source = "#set page(width: 85mm, height: 55mm, bleed: 3mm)\n#text(fill: cmyk(0%, 0%, 0%, 100%))[Bonjour #sys.inputs.nom]";
        let document = moteur
            .compiler(source, &Fichiers::new(), &[("nom", "Aïssatou")])
            .unwrap();
        assert_eq!(document.nb_pages(), 1);
        assert!(document.pdf().unwrap().starts_with(b"%PDF"));
        assert!(document.png(0, 1.0).unwrap().starts_with(b"\x89PNG"));
        assert!(document.svg(0).unwrap().starts_with("<svg"));
    }

    #[test]
    fn lit_les_fichiers_virtuels() {
        let moteur = Moteur::nouveau();
        let fichiers = Fichiers::from([(
            "/donnees/agent.json".to_string(),
            Bytes::new(br#"{"nom": "DIALLO"}"#.to_vec()),
        )]);
        let document = moteur
            .compiler(r#"#json("/donnees/agent.json").nom"#, &fichiers, &[])
            .unwrap();
        assert_eq!(document.nb_pages(), 1);
    }

    #[test]
    fn signale_les_erreurs_avec_leur_position() {
        let moteur = Moteur::nouveau();
        let erreur = moteur
            .compiler("Ligne 1\n#variable-inconnue", &Fichiers::new(), &[])
            .err()
            .unwrap();
        assert_eq!(erreur.details.len(), 1);
        assert!(
            erreur.details[0].starts_with("principal.typ:2 : "),
            "{}",
            erreur.details[0]
        );
    }

    #[test]
    fn signale_un_fichier_manquant() {
        let moteur = Moteur::nouveau();
        let erreur = moteur
            .compiler(r#"#image("/absent.png")"#, &Fichiers::new(), &[])
            .err()
            .unwrap();
        assert!(
            erreur.details[0].contains("absent.png"),
            "{}",
            erreur.details[0]
        );
    }

    #[test]
    fn recense_des_polices() {
        assert!(
            Moteur::nouveau()
                .familles()
                .iter()
                .any(|famille| famille == "Libertinus Serif")
        );
    }
}
