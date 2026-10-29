//! Outils PDF : fusionner plusieurs PDF, séparer un PDF en fichiers de N pages. Les pages sont
//! recopiées telles quelles (contenu, polices, images, couleurs CMJN) : rien n'est recalculé.

use std::collections::BTreeMap;

use lopdf::{Dictionary, Document, Object, ObjectId, dictionary};

use typst::foundations::Bytes;

use crate::moteur::{ErreurMoteur, Fichiers, Moteur};

/// Attributs qu'une page peut hériter de ses parents dans l'arbre des pages.
const HERITES: [&[u8]; 4] = [b"Resources", b"MediaBox", b"CropBox", b"Rotate"];

/// Charge un PDF ; un PDF chiffré sans mot de passe d'ouverture est déchiffré.
fn charger(octets: &[u8], nom: &str) -> Result<Document, ErreurMoteur> {
    let mut document = Document::load_mem(octets).map_err(|erreur| {
        ErreurMoteur::simple(format!("« {nom} » n'a pas pu être lu : {erreur}"))
    })?;
    if document.is_encrypted() {
        document.decrypt("").map_err(|_| {
            ErreurMoteur::simple(format!("« {nom} » est protégé par un mot de passe."))
        })?;
    }
    aplatir_heritage(&mut document);
    Ok(document)
}

/// Recopie dans chaque page les attributs hérités de ses parents : la page peut changer d'arbre.
fn aplatir_heritage(document: &mut Document) {
    for page in document.get_pages().into_values() {
        let mut ajouts = Vec::new();
        let Ok(dictionnaire) = document.get_dictionary(page) else {
            continue;
        };
        for cle in HERITES {
            if dictionnaire.has(cle) {
                continue;
            }
            let mut parent = dictionnaire
                .get(b"Parent")
                .and_then(Object::as_reference)
                .ok();
            while let Some(id) = parent {
                let Ok(noeud) = document.get_dictionary(id) else {
                    break;
                };
                if let Ok(valeur) = noeud.get(cle) {
                    ajouts.push((cle, valeur.clone()));
                    break;
                }
                parent = noeud.get(b"Parent").and_then(Object::as_reference).ok();
            }
        }
        if let Ok(dictionnaire) = document.get_dictionary_mut(page) {
            for (cle, valeur) in ajouts {
                dictionnaire.set(cle, valeur);
            }
        }
    }
}

/// Nouveau PDF fait des `pages` (dans l'ordre) prises parmi `objets` ; les objets que plus rien
/// n'utilise (anciens arbres de pages, ressources des pages écartées) sont retirés.
fn assembler(
    objets: BTreeMap<ObjectId, Object>,
    pages: &[ObjectId],
    max_id: u32,
) -> Result<Vec<u8>, ErreurMoteur> {
    let mut document = Document::with_version("1.7");
    document.objects = objets;
    document.max_id = max_id;
    let arbre = document.new_object_id();
    for page in pages {
        if let Ok(dictionnaire) = document.get_dictionary_mut(*page) {
            dictionnaire.set("Parent", arbre);
        }
    }
    let enfants: Vec<Object> = pages.iter().map(|page| Object::Reference(*page)).collect();
    document.objects.insert(
        arbre,
        Object::Dictionary(
            dictionary! { "Type" => "Pages", "Kids" => enfants, "Count" => pages.len() as i64 },
        ),
    );
    let catalogue = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => arbre });
    document.trailer = Dictionary::new();
    document.trailer.set("Root", catalogue);
    document.prune_objects();
    document.renumber_objects();
    document.compress();
    let mut octets = Vec::new();
    document.save_to(&mut octets).map_err(|erreur| {
        ErreurMoteur::simple(format!("Le PDF n'a pas pu être écrit : {erreur}"))
    })?;
    Ok(octets)
}

/// Pages d'un PDF en SVG, pour les afficher (aperçu fidèle d'un courrier) : le moteur de rendu
/// lit le PDF comme une image, page par page, polices incorporées comprises.
pub fn rendre_pages(moteur: &Moteur, pdf: Vec<u8>) -> Result<Vec<String>, ErreurMoteur> {
    let pages = nombre_de_pages(&pdf, "aperçu")?;
    let source: String = (1..=pages)
        .map(|page| format!("#page(width: auto, height: auto, margin: 0pt, image(\"/apercu.pdf\", page: {page}))\n"))
        .collect();
    let fichiers = Fichiers::from([("/apercu.pdf".to_string(), Bytes::new(pdf))]);
    let document = moteur.compiler(&source, &fichiers, &[])?;
    (0..document.nb_pages())
        .map(|page| document.svg(page))
        .collect()
}

/// Nombre de pages d'un PDF.
pub fn nombre_de_pages(octets: &[u8], nom: &str) -> Result<usize, ErreurMoteur> {
    Ok(charger(octets, nom)?.get_pages().len())
}

/// Un seul PDF fait de tous les PDF donnés (nom, contenu), dans l'ordre.
pub fn fusionner(sources: &[(String, Vec<u8>)]) -> Result<Vec<u8>, ErreurMoteur> {
    if sources.is_empty() {
        return Err(ErreurMoteur::simple("Aucun PDF à fusionner."));
    }
    let mut objets = BTreeMap::new();
    let mut pages = Vec::new();
    let mut max_id = 1;
    for (nom, octets) in sources {
        let mut document = charger(octets, nom)?;
        // Numéros d'objets distincts d'un fichier à l'autre.
        document.renumber_objects_with(max_id);
        max_id = document.max_id + 1;
        pages.extend(document.get_pages().into_values());
        objets.extend(document.objects);
    }
    assembler(objets, &pages, max_id)
}

/// Un PDF par groupe de `pages_par_fichier` pages (le dernier peut être plus court).
pub fn separer(
    octets: &[u8],
    nom: &str,
    pages_par_fichier: usize,
) -> Result<Vec<Vec<u8>>, ErreurMoteur> {
    let document = charger(octets, nom)?;
    let pages: Vec<ObjectId> = document.get_pages().into_values().collect();
    pages
        .chunks(pages_par_fichier.max(1))
        .map(|groupe| assembler(document.objects.clone(), groupe, document.max_id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// PDF de `n` pages dont la taille et les ressources sont héritées de l'arbre des pages.
    fn pdf_herite(n: usize, texte: &str) -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let arbre = document.new_object_id();
        let police = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
        });
        let mut enfants = Vec::new();
        for page in 0..n {
            let contenu = format!("BT /F1 24 Tf 72 720 Td ({texte} {}) Tj ET", page + 1);
            let flux =
                document.add_object(lopdf::Stream::new(dictionary! {}, contenu.into_bytes()));
            let page = document.add_object(
                dictionary! { "Type" => "Page", "Parent" => arbre, "Contents" => flux },
            );
            enfants.push(Object::Reference(page));
        }
        document.objects.insert(
            arbre,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => enfants, "Count" => n as i64,
                "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => police } },
            }),
        );
        let catalogue = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => arbre });
        document.trailer.set("Root", catalogue);
        let mut octets = Vec::new();
        document.save_to(&mut octets).unwrap();
        octets
    }

    fn pages_et_textes(octets: &[u8]) -> (usize, Vec<String>) {
        let document = Document::load_mem(octets).unwrap();
        let pages = document.get_pages();
        let textes = pages
            .keys()
            .map(|numero| {
                document
                    .extract_text(&[*numero])
                    .unwrap()
                    .trim()
                    .to_string()
            })
            .collect();
        for page in pages.values() {
            // Taille et ressources recopiées dans chaque page.
            let dictionnaire = document.get_dictionary(*page).unwrap();
            assert!(dictionnaire.has(b"MediaBox") && dictionnaire.has(b"Resources"));
        }
        (pages.len(), textes)
    }

    #[test]
    fn fusionne_dans_l_ordre() {
        let sources = [
            ("a.pdf".to_string(), pdf_herite(2, "A")),
            ("b.pdf".to_string(), pdf_herite(3, "B")),
        ];
        let fusion = fusionner(&sources).unwrap();
        assert_eq!(
            pages_et_textes(&fusion),
            (
                5,
                vec![
                    "A 1".into(),
                    "A 2".into(),
                    "B 1".into(),
                    "B 2".into(),
                    "B 3".into()
                ]
            )
        );
        assert_eq!(nombre_de_pages(&fusion, "fusion.pdf").unwrap(), 5);
    }

    #[test]
    fn separe_par_groupes_de_pages() {
        let parties = separer(&pdf_herite(5, "P"), "p.pdf", 2).unwrap();
        let resultats: Vec<_> = parties
            .iter()
            .map(|partie| pages_et_textes(partie))
            .collect();
        assert_eq!(resultats[0], (2, vec!["P 1".into(), "P 2".into()]));
        assert_eq!(resultats[2], (1, vec!["P 5".into()]));
        assert_eq!(resultats.len(), 3);
        // Une partie ne garde pas les pages des autres.
        assert!(parties[2].len() < parties[0].len());
    }

    #[test]
    fn rend_chaque_page_pour_l_apercu() {
        let pages = rendre_pages(&Moteur::nouveau(), pdf_herite(2, "Courrier")).unwrap();
        assert_eq!(pages.len(), 2);
        assert!(pages.iter().all(|svg| svg.starts_with("<svg")));
    }

    #[test]
    fn refuse_un_fichier_qui_n_est_pas_un_pdf() {
        let erreur = nombre_de_pages(b"pas un PDF", "faux.pdf").unwrap_err();
        assert!(erreur.message.contains("faux.pdf"));
    }
}
