//! Textes d'un modèle PDF (première page) : décodage, regroupement en lignes, puis retrait ciblé.
//! Seules les instructions d'affichage du texte concerné sont supprimées du flux de contenu : les
//! couleurs (CMJN, tons directs), les tracés et les images restent intacts. Une réécriture complète
//! de la page, elle, peut détruire les couleurs (constaté avec PDFium dans le prototype).

use std::collections::{BTreeMap, HashSet};

use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Encoding, Object, ObjectId};
use serde::Serialize;
use serde_json::{Value, json};

use crate::moteur::ErreurMoteur;
use crate::tr;

const MM_PAR_POINT: f64 = 25.4 / 72.0;
const IDENTITE: Matrice = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

type Matrice = [f64; 6];

/// Une ligne de texte du modèle, avec ce qu'il faut pour en faire un champ.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextePdf {
    pub id: usize,
    pub texte: String,
    /// Origine de la ligne (sur la ligne de base), en mm depuis le coin haut-gauche de la zone visible.
    pub x_mm: f64,
    pub y_mm: f64,
    pub largeur_mm: f64,
    pub taille_pt: f64,
    /// Nom PostScript de la police, sans préfixe de sous-ensemble (« Arial-BoldMT »).
    pub police: String,
    /// `{"cmyk": [c, m, j, n]}` en %, ou `{"rgb": "#rrggbb"}`.
    pub couleur: Value,
}

fn erreur_pdf(erreur: lopdf::Error) -> ErreurMoteur {
    ErreurMoteur::simple(tr!(
        "Ce PDF n'a pas pu être lu : {erreur}",
        "This PDF could not be read: {erreur}"
    ))
}

fn multiplier(a: &Matrice, b: &Matrice) -> Matrice {
    [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]
}

fn translation(x: f64, y: f64) -> Matrice {
    [1.0, 0.0, 0.0, 1.0, x, y]
}

fn nombres(operation: &Operation) -> Vec<f64> {
    operation
        .operands
        .iter()
        .filter_map(|o| o.as_float().ok().map(f64::from))
        .collect()
}

/// Largeurs des glyphes d'une police, en millièmes de cadratin.
enum Largeurs {
    Simples {
        premier: i64,
        valeurs: Vec<f64>,
    },
    Cid {
        defaut: f64,
        table: BTreeMap<i64, f64>,
    },
}

struct Police<'a> {
    nom: String,
    encodage: Option<Encoding<'a>>,
    /// Les polices composites (Type0, Identity-H) codent chaque glyphe sur deux octets.
    deux_octets: bool,
    largeurs: Largeurs,
}

impl<'a> Police<'a> {
    fn lire(document: &'a Document, police: &'a Dictionary) -> Self {
        let nom_de = |dict: &Dictionary| {
            dict.get(b"BaseFont")
                .and_then(Object::as_name)
                .map(|nom| String::from_utf8_lossy(nom).into_owned())
                .unwrap_or_default()
        };
        // Préfixe de sous-ensemble ajouté à l'incorporation : « ABCDEF+Arial-BoldMT ».
        let nom = nom_de(police)
            .split_once('+')
            .map(|(_, reste)| reste.to_owned())
            .unwrap_or_else(|| nom_de(police));
        let deux_octets = police
            .get(b"Subtype")
            .and_then(Object::as_name)
            .is_ok_and(|t| t == b"Type0");
        let tableau = |dict: &Dictionary, cle: &[u8]| {
            dict.get_deref(cle, document)
                .and_then(Object::as_array)
                .cloned()
                .unwrap_or_default()
        };
        let largeurs = if deux_octets {
            let descendante = police
                .get_deref(b"DescendantFonts", document)
                .and_then(Object::as_array)
                .ok()
                .and_then(|polices| polices.first())
                .and_then(|o| document.dereference(o).ok())
                .and_then(|(_, o)| o.as_dict().ok());
            let mut table = BTreeMap::new();
            let mut defaut = 1000.0;
            if let Some(cid) = descendante {
                defaut = cid
                    .get(b"DW")
                    .and_then(Object::as_float)
                    .map_or(1000.0, f64::from);
                // W : « c [l1 l2 …] » ou « c_premier c_dernier l ».
                let w = tableau(cid, b"W");
                let mut i = 0;
                while i + 1 < w.len() {
                    let premier = w[i].as_i64().unwrap_or(0);
                    if let Ok(valeurs) = w[i + 1].as_array() {
                        for (decalage, valeur) in valeurs.iter().enumerate() {
                            let largeur = valeur.as_float().map_or(defaut, f64::from);
                            table.insert(premier + decalage as i64, largeur);
                        }
                        i += 2;
                    } else if i + 2 < w.len() {
                        let dernier = w[i + 1].as_i64().unwrap_or(premier);
                        let largeur = w[i + 2].as_float().map_or(defaut, f64::from);
                        for code in premier..=dernier.min(premier + 65_535) {
                            table.insert(code, largeur);
                        }
                        i += 3;
                    } else {
                        break;
                    }
                }
            }
            Largeurs::Cid { defaut, table }
        } else {
            Largeurs::Simples {
                premier: police
                    .get(b"FirstChar")
                    .and_then(Object::as_i64)
                    .unwrap_or(0),
                valeurs: tableau(police, b"Widths")
                    .iter()
                    .map(|v| v.as_float().map_or(500.0, f64::from))
                    .collect(),
            }
        };
        Police {
            nom,
            encodage: police.get_font_encoding(document).ok(),
            deux_octets,
            largeurs,
        }
    }

    fn largeur(&self, code: i64) -> f64 {
        match &self.largeurs {
            Largeurs::Simples { premier, valeurs } => usize::try_from(code - premier)
                .ok()
                .and_then(|i| valeurs.get(i).copied())
                .unwrap_or(500.0),
            Largeurs::Cid { defaut, table } => table.get(&code).copied().unwrap_or(*defaut),
        }
    }

    fn codes(&self, octets: &[u8]) -> Vec<i64> {
        if self.deux_octets {
            octets
                .chunks(2)
                .map(|c| (i64::from(c[0]) << 8) | i64::from(*c.get(1).unwrap_or(&0)))
                .collect()
        } else {
            octets.iter().map(|&o| i64::from(o)).collect()
        }
    }

    fn decoder(&self, octets: &[u8]) -> String {
        self.encodage
            .as_ref()
            .and_then(|e| e.bytes_to_string(octets).ok())
            .unwrap_or_default()
    }
}

/// Un morceau de texte affiché par une seule instruction (Tj, TJ, ' ou ").
struct Morceau {
    operation: usize,
    texte: String,
    x: f64,
    y: f64,
    fin_x: f64,
    taille: f64,
    police: String,
    couleur: Value,
}

#[derive(Clone)]
struct EtatGraphique {
    ctm: Matrice,
    couleur: Value,
    police: Option<Vec<u8>>,
    taille: f64,
    espacement_lettres: f64,
    espacement_mots: f64,
    echelle_horizontale: f64,
    interligne: f64,
}

fn couleur_gris(valeur: f64) -> Value {
    let v = (valeur.clamp(0.0, 1.0) * 255.0).round() as u8;
    json!({ "rgb": format!("#{v:02x}{v:02x}{v:02x}") })
}

fn couleur_rvb(r: f64, v: f64, b: f64) -> Value {
    let c = |x: f64| (x.clamp(0.0, 1.0) * 255.0).round() as u8;
    json!({ "rgb": format!("#{:02x}{:02x}{:02x}", c(r), c(v), c(b)) })
}

/// CMJN en pourcentages entiers, comme les saisissent les graphistes (certains PDF stockent les
/// couleurs sur 8 bits : 30 % y devient 30,2 %).
fn couleur_cmjn(valeurs: &[f64]) -> Value {
    let pourcents: Vec<f64> = valeurs
        .iter()
        .map(|v| (v.clamp(0.0, 1.0) * 100.0).round())
        .collect();
    json!({ "cmyk": pourcents })
}

/// Zone visible de la première page (CropBox, sinon MediaBox), éventuellement héritée.
fn zone_visible(document: &Document, page: ObjectId) -> [f64; 4] {
    let mut noeud = document.get_dictionary(page).ok();
    for cle in [&b"CropBox"[..], b"MediaBox"] {
        let mut courant = noeud;
        while let Some(dict) = courant {
            if let Ok(rect) = dict.get_deref(cle, document).and_then(Object::as_array) {
                let v: Vec<f64> = rect
                    .iter()
                    .filter_map(|o| o.as_float().ok().map(f64::from))
                    .collect();
                if v.len() == 4 {
                    return [
                        v[0].min(v[2]),
                        v[1].min(v[3]),
                        v[0].max(v[2]),
                        v[1].max(v[3]),
                    ];
                }
            }
            courant = dict
                .get(b"Parent")
                .and_then(Object::as_reference)
                .and_then(|id| document.get_dictionary(id))
                .ok();
        }
        noeud = document.get_dictionary(page).ok();
    }
    [0.0, 0.0, 595.0, 842.0]
}

/// Première page analysée : son flux de contenu et ses lignes de texte.
struct AnalysePage {
    page: ObjectId,
    operations: Vec<Operation>,
    /// Chaque ligne, avec les index des instructions qui l'affichent.
    lignes: Vec<(TextePdf, Vec<usize>)>,
}

/// Lignes de texte de la première page, avec les instructions qui les affichent.
fn analyser(document: &Document) -> Result<AnalysePage, ErreurMoteur> {
    let page = *document.get_pages().get(&1).ok_or_else(|| {
        ErreurMoteur::simple(tr!(
            "Ce PDF ne contient aucune page.",
            "This PDF has no pages."
        ))
    })?;
    let polices: BTreeMap<Vec<u8>, Police> = document
        .get_page_fonts(page)
        .map_err(erreur_pdf)?
        .into_iter()
        .map(|(nom, dict)| (nom, Police::lire(document, dict)))
        .collect();
    let operations = Content::decode(&document.get_page_content(page))
        .map_err(erreur_pdf)?
        .operations;

    let mut etat = EtatGraphique {
        ctm: IDENTITE,
        couleur: couleur_gris(0.0),
        police: None,
        taille: 0.0,
        espacement_lettres: 0.0,
        espacement_mots: 0.0,
        echelle_horizontale: 1.0,
        interligne: 0.0,
    };
    let mut pile = Vec::new();
    let (mut tm, mut tlm) = (IDENTITE, IDENTITE);
    let mut morceaux = Vec::new();

    for (index, operation) in operations.iter().enumerate() {
        let n = nombres(operation);
        let ligne_suivante =
            |tlm: &Matrice, interligne: f64| multiplier(&translation(0.0, -interligne), tlm);
        match operation.operator.as_str() {
            "q" => pile.push(etat.clone()),
            "Q" => etat = pile.pop().unwrap_or(etat),
            "cm" if n.len() == 6 => {
                etat.ctm = multiplier(&[n[0], n[1], n[2], n[3], n[4], n[5]], &etat.ctm)
            }
            "BT" => (tm, tlm) = (IDENTITE, IDENTITE),
            "Tf" => {
                etat.police = operation
                    .operands
                    .first()
                    .and_then(|o| o.as_name().ok())
                    .map(<[u8]>::to_vec);
                etat.taille = n.first().copied().unwrap_or(etat.taille);
            }
            "Tc" => etat.espacement_lettres = n.first().copied().unwrap_or(0.0),
            "Tw" => etat.espacement_mots = n.first().copied().unwrap_or(0.0),
            "Tz" => etat.echelle_horizontale = n.first().copied().unwrap_or(100.0) / 100.0,
            "TL" => etat.interligne = n.first().copied().unwrap_or(0.0),
            "Td" | "TD" if n.len() == 2 => {
                if operation.operator == "TD" {
                    etat.interligne = -n[1];
                }
                tlm = multiplier(&translation(n[0], n[1]), &tlm);
                tm = tlm;
            }
            "Tm" if n.len() == 6 => {
                tlm = [n[0], n[1], n[2], n[3], n[4], n[5]];
                tm = tlm;
            }
            "T*" => {
                tlm = ligne_suivante(&tlm, etat.interligne);
                tm = tlm;
            }
            "g" if n.len() == 1 => etat.couleur = couleur_gris(n[0]),
            "rg" if n.len() == 3 => etat.couleur = couleur_rvb(n[0], n[1], n[2]),
            "k" if n.len() == 4 => etat.couleur = couleur_cmjn(&n),
            // Le nombre de composantes indique l'espace : 1 gris, 3 RVB, 4 CMJN (motifs ignorés).
            "sc" | "scn" => match n.len() {
                1 => etat.couleur = couleur_gris(n[0]),
                3 => etat.couleur = couleur_rvb(n[0], n[1], n[2]),
                4 => etat.couleur = couleur_cmjn(&n),
                _ => {}
            },
            "Tj" | "TJ" | "'" | "\"" => {
                if operation.operator != "Tj" && operation.operator != "TJ" {
                    tlm = ligne_suivante(&tlm, etat.interligne);
                    tm = tlm;
                    if operation.operator == "\"" && n.len() >= 2 {
                        etat.espacement_mots = n[0];
                        etat.espacement_lettres = n[1];
                    }
                }
                let Some(police) = etat.police.as_ref().and_then(|nom| polices.get(nom)) else {
                    continue;
                };
                let debut = multiplier(&tm, &etat.ctm);
                let echelle = (debut[0] * debut[3] - debut[1] * debut[2]).abs().sqrt();
                let elements: Vec<&Object> = match operation.operator.as_str() {
                    "TJ" => operation
                        .operands
                        .first()
                        .and_then(|o| o.as_array().ok())
                        .map(|a| a.iter().collect())
                        .unwrap_or_default(),
                    _ => operation.operands.last().into_iter().collect(),
                };
                let mut octets = Vec::new();
                for element in elements {
                    if let Ok(chaine) = element.as_str() {
                        for code in police.codes(chaine) {
                            let espace = if !police.deux_octets && code == 32 {
                                etat.espacement_mots
                            } else {
                                0.0
                            };
                            let avance = (police.largeur(code) / 1000.0 * etat.taille
                                + etat.espacement_lettres
                                + espace)
                                * etat.echelle_horizontale;
                            tm = multiplier(&translation(avance, 0.0), &tm);
                        }
                        octets.extend_from_slice(chaine);
                    } else if let Ok(decalage) = element.as_float() {
                        let avance =
                            -f64::from(decalage) / 1000.0 * etat.taille * etat.echelle_horizontale;
                        tm = multiplier(&translation(avance, 0.0), &tm);
                    }
                }
                let fin = multiplier(&tm, &etat.ctm);
                morceaux.push(Morceau {
                    operation: index,
                    texte: police.decoder(&octets),
                    x: debut[4],
                    y: debut[5],
                    fin_x: fin[4],
                    taille: etat.taille * echelle,
                    police: police.nom.clone(),
                    couleur: etat.couleur.clone(),
                });
            }
            _ => {}
        }
    }

    // Regroupement en lignes : même ligne de base, morceaux qui se suivent de près.
    let visible = zone_visible(document, page);
    let mut lignes: Vec<(Morceau, Vec<usize>)> = Vec::new();
    for morceau in morceaux {
        if let Some((ligne, operations)) = lignes.last_mut() {
            let ecart = morceau.x - ligne.fin_x;
            let meme_base = (morceau.y - ligne.y).abs() < 0.4 * ligne.taille.max(1.0);
            if meme_base && ecart > -0.5 * ligne.taille && ecart < 1.5 * ligne.taille {
                if ecart > 0.2 * ligne.taille
                    && !ligne.texte.ends_with(' ')
                    && !morceau.texte.starts_with(' ')
                {
                    ligne.texte.push(' ');
                }
                ligne.texte.push_str(&morceau.texte);
                ligne.fin_x = ligne.fin_x.max(morceau.fin_x);
                operations.push(morceau.operation);
                continue;
            }
        }
        let operation = morceau.operation;
        lignes.push((morceau, vec![operation]));
    }
    let lignes = lignes
        .into_iter()
        .filter(|(ligne, _)| !ligne.texte.trim().is_empty())
        .enumerate()
        .map(|(id, (ligne, operations))| {
            let texte = TextePdf {
                id,
                texte: ligne.texte.split_whitespace().collect::<Vec<_>>().join(" "),
                x_mm: (ligne.x - visible[0]) * MM_PAR_POINT,
                y_mm: (visible[3] - ligne.y) * MM_PAR_POINT,
                largeur_mm: (ligne.fin_x - ligne.x).max(0.0) * MM_PAR_POINT,
                taille_pt: (ligne.taille * 10.0).round() / 10.0,
                police: ligne.police,
                couleur: ligne.couleur,
            };
            (texte, operations)
        })
        .collect();
    Ok(AnalysePage {
        page,
        operations,
        lignes,
    })
}

/// Lignes de texte de la première page.
pub fn lister(pdf: &[u8]) -> Result<Vec<TextePdf>, ErreurMoteur> {
    let document = Document::load_mem(pdf).map_err(erreur_pdf)?;
    Ok(analyser(&document)?
        .lignes
        .into_iter()
        .map(|(texte, _)| texte)
        .collect())
}

/// Le même PDF sans les lignes indiquées : seules leurs instructions de texte sont retirées.
pub fn retirer(pdf: &[u8], ids: &[usize]) -> Result<Vec<u8>, ErreurMoteur> {
    let mut document = Document::load_mem(pdf).map_err(erreur_pdf)?;
    let AnalysePage {
        page,
        operations,
        lignes,
    } = analyser(&document)?;
    let a_retirer: HashSet<usize> = lignes
        .iter()
        .filter(|(texte, _)| ids.contains(&texte.id))
        .flat_map(|(_, operations)| operations.iter().copied())
        .collect();
    let operations: Vec<Operation> = operations
        .into_iter()
        .enumerate()
        .filter(|(index, _)| !a_retirer.contains(index))
        .map(|(_, operation)| operation)
        .collect();
    let contenu = Content { operations }.encode().map_err(erreur_pdf)?;
    document
        .change_page_content(page, contenu)
        .map_err(erreur_pdf)?;
    document.compress();
    let mut sortie = Vec::new();
    document.save_to(&mut sortie).map_err(|e| {
        ErreurMoteur::simple(tr!(
            "Le PDF nettoyé n'a pas pu être écrit : {e}",
            "The cleaned PDF could not be written: {e}"
        ))
    })?;
    Ok(sortie)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::moteur::{Fichiers, Moteur};

    /// Modèle PDF en CMJN, comme l'exporterait un graphiste : visuel, texte fixe et balises.
    fn modele_pdf() -> Vec<u8> {
        let source = r#"
#set page(width: 91mm, height: 61mm, margin: 0pt)
#set text(font: ("Arial", "Libertinus Serif"))
#let bleu = cmyk(100%, 80%, 30%, 25%)
#place(bottom, rect(width: 100%, height: 12mm, fill: bleu))
#place(dx: 11mm, dy: 9mm, text(weight: "bold", size: 9pt, fill: bleu)[EXEMPLE SA])
#place(dx: 11mm, dy: 24mm, text(weight: "bold", size: 11pt, fill: bleu)[{{Prénom}} {{NOM}}])
#place(dx: 11mm, dy: 35mm, text(size: 7pt, fill: cmyk(0%, 0%, 0%, 80%))[Mob. {{Mobile}}])
"#;
        Moteur::nouveau()
            .compiler(source, &Fichiers::new(), &[])
            .unwrap()
            .pdf()
            .unwrap()
    }

    #[test]
    fn lit_les_lignes_avec_position_taille_et_couleur_cmjn() {
        let textes = lister(&modele_pdf()).unwrap();
        let contenus: Vec<&str> = textes.iter().map(|t| t.texte.as_str()).collect();
        assert_eq!(
            contenus,
            ["EXEMPLE SA", "{{Prénom}} {{NOM}}", "Mob. {{Mobile}}"]
        );
        let nom = &textes[1];
        assert!((nom.x_mm - 11.0).abs() < 0.2, "x = {}", nom.x_mm);
        assert!(nom.y_mm > 24.0 && nom.y_mm < 29.0, "y = {}", nom.y_mm);
        assert!((nom.taille_pt - 11.0).abs() < 0.1);
        assert!(nom.largeur_mm > 20.0);
        assert_eq!(nom.couleur, json!({ "cmyk": [100.0, 80.0, 30.0, 25.0] }));
    }

    #[test]
    fn retire_les_balises_sans_toucher_au_reste() {
        let pdf = modele_pdf();
        let balises: Vec<usize> = lister(&pdf)
            .unwrap()
            .into_iter()
            .filter(|t| t.texte.contains("{{"))
            .map(|t| t.id)
            .collect();
        let nettoye = retirer(&pdf, &balises).unwrap();
        let restants: Vec<String> = lister(&nettoye)
            .unwrap()
            .into_iter()
            .map(|t| t.texte)
            .collect();
        assert_eq!(restants, ["EXEMPLE SA"]);
        // Le bandeau CMJN est toujours peint en CMJN (opérateur « k ») : rien n'a été converti.
        let document = Document::load_mem(&nettoye).unwrap();
        let page = document.get_pages()[&1];
        let operations = Content::decode(&document.get_page_content(page))
            .unwrap()
            .operations;
        assert!(operations.iter().any(|o| o.operator == "k"));
        assert!(!operations.iter().any(|o| o.operator == "rg"));
    }
}
