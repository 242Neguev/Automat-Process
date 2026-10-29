//! Le « monde » vu par Typst pendant une compilation : le source principal, les fichiers
//! virtuels fournis par l'application, les polices et la date du jour. Aucun accès au disque
//! ni au réseau : tout ce dont un gabarit a besoin lui est passé explicitement.

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, World};
use typst_kit::datetime::Time;
use typst_kit::fonts::FontStore;

use super::Fichiers;

/// Chemin virtuel du source principal (apparaît dans les messages d'erreur).
const CHEMIN_PRINCIPAL: &str = "/principal.typ";

pub(super) struct Monde<'a> {
    bibliotheque: &'a LazyHash<Library>,
    polices: &'a FontStore,
    principal: Source,
    fichiers: &'a Fichiers,
    temps: Time,
}

impl<'a> Monde<'a> {
    pub(super) fn nouveau(
        bibliotheque: &'a LazyHash<Library>,
        polices: &'a FontStore,
        source: &str,
        fichiers: &'a Fichiers,
    ) -> Self {
        let chemin = VirtualPath::new(CHEMIN_PRINCIPAL).expect("chemin virtuel valide");
        let id = FileId::new(RootedPath::new(VirtualRoot::Project, chemin));
        Self {
            bibliotheque,
            polices,
            principal: Source::new(id, source.to_string()),
            fichiers,
            temps: Time::system(),
        }
    }
}

impl World for Monde<'_> {
    fn library(&self) -> &LazyHash<Library> {
        self.bibliotheque
    }

    fn book(&self) -> &LazyHash<FontBook> {
        self.polices.book()
    }

    fn main(&self) -> FileId {
        self.principal.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.principal.id() {
            return Ok(self.principal.clone());
        }
        let octets = self.file(id)?;
        let texte = std::str::from_utf8(&octets).map_err(|_| FileError::InvalidUtf8)?;
        Ok(Source::new(id, texte.to_string()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        let chemin = id.vpath().get_with_slash();
        if !matches!(id.root(), VirtualRoot::Project) {
            return Err(FileError::Other(Some(
                "les paquets Typst externes ne sont pas disponibles hors ligne".into(),
            )));
        }
        self.fichiers
            .get(chemin)
            .cloned()
            .ok_or_else(|| FileError::NotFound(chemin.into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.polices.font(index)
    }

    fn today(&self, decalage: Option<Duration>) -> Option<Datetime> {
        self.temps.today(decalage)
    }
}
