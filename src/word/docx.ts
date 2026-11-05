// Courriers Word. Le modèle .docx est préparé une fois : ses champs de publipostage (« Nom ») deviennent
// des balises {{Nom}}, et les balises que Word a coupées en morceaux sont recollées. Il est ensuite
// rempli pour chaque personne. Les parties d'un .docx sont du XML WordprocessingML (préfixe « w: »).
import { textes } from "../textes";

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const BALISE = /\{\{([^}]+)\}\}/g;
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

/** Parties d'un .docx (chemin dans l'archive → XML). */
export type Parties = Record<string, string>;

/** Parties qui contiennent du texte : corps, en-têtes, pieds de page, notes. */
export const estPartieTexte = (chemin: string) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(chemin);
const estRelations = (chemin: string) => /^word\/_rels\/[^/]+\.rels$/.test(chemin);

export function lireXml(xml: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error(textes.erreurs.wordIllisible);
  return doc;
}

export function ecrireXml(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith("<?xml") ? xml : DECLARATION + xml;
}

// Recherche par nom qualifié (« w:t ») : fiable dans tous les navigateurs pour du XML Word.
const tous = (racine: Document | Element, nom: string) => Array.from(racine.getElementsByTagName(nom));
const enfants = (parent: Element, nom: string) => Array.from(parent.children).filter((e) => e.tagName === nom);

function ancetre(element: Element, nom: string): Element | null {
  for (let e = element.parentElement; e; e = e.parentElement) if (e.tagName === nom) return e;
  return null;
}

/** Textes (w:t) d'un paragraphe, sans ceux des paragraphes imbriqués (zones de texte). */
const textesDe = (paragraphe: Element) => tous(paragraphe, "w:t").filter((t) => ancetre(t, "w:p") === paragraphe);

const balisesDe = (texte: string) => [...texte.matchAll(BALISE)].map((m) => m[1].trim());

/** Un w:t garde ses espaces de début et de fin. */
function avecEspaces(t: Element) {
  t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
}

/** Remplace le contenu d'un run par un seul texte (sa mise en forme, w:rPr, est gardée). */
function definirTexte(run: Element, texte: string) {
  for (const enfant of Array.from(run.children)) if (enfant.tagName !== "w:rPr") enfant.remove();
  const t = run.ownerDocument.createElementNS(W, "w:t");
  t.textContent = texte;
  avecEspaces(t);
  run.appendChild(t);
}

/** Nom du champ d'une instruction « MERGEFIELD Nom \* MERGEFORMAT » (ou « MERGEFIELD "Prénom" »). */
export function nomDuChamp(instruction: string): string | null {
  const m = instruction.match(/^\s*MERGEFIELD\s+(?:"([^"]+)"|([^\s\\]+))/i);
  return m ? (m[1] ?? m[2]).trim() : null;
}

const typeDe = (run: Element) => enfants(run, "w:fldChar")[0]?.getAttribute("w:fldCharType") ?? null;

/** Champs de publipostage → balises. Renvoie le nombre de champs convertis. */
function convertirChamps(doc: Document): number {
  let convertis = 0;
  // Champs simples : <w:fldSimple w:instr=" MERGEFIELD Nom "><w:r>…«Nom»…</w:r></w:fldSimple>
  for (const champ of tous(doc, "w:fldSimple")) {
    const nom = nomDuChamp(champ.getAttribute("w:instr") ?? "");
    if (!nom) continue;
    const runs = enfants(champ, "w:r");
    const porteur = runs[0] ?? doc.createElementNS(W, "w:r");
    definirTexte(porteur, `{{${nom}}}`);
    runs.slice(1).forEach((run) => run.remove());
    champ.replaceWith(porteur);
    convertis++;
  }
  // Champs complexes : début, instruction, séparation, résultat (« «Nom» »), fin, sur plusieurs runs.
  const runs = tous(doc, "w:r");
  for (let i = 0; i < runs.length; i++) {
    if (typeDe(runs[i]) !== "begin") continue;
    let profondeur = 1;
    let instruction = "";
    let separation = -1;
    let fin = -1;
    for (let j = i + 1; j < runs.length && fin < 0; j++) {
      const type = typeDe(runs[j]);
      if (type === "begin") profondeur++;
      else if (type === "end" && --profondeur === 0) fin = j;
      else if (type === "separate" && profondeur === 1) separation = j;
      else if (profondeur === 1 && separation < 0) instruction += enfants(runs[j], "w:instrText").map((e) => e.textContent).join("");
    }
    const nom = nomDuChamp(instruction);
    if (fin < 0 || !nom) {
      // Autre champ (DATE, PAGE, IF…) : gardé tel quel.
      if (fin > 0) i = fin;
      continue;
    }
    const resultat = separation >= 0 ? runs.slice(separation + 1, fin).filter((run) => enfants(run, "w:t").length > 0) : [];
    const porteur = resultat[0] ?? (runs[i].cloneNode(true) as Element);
    definirTexte(porteur, `{{${nom}}}`);
    if (!porteur.isConnected) runs[i].before(porteur);
    for (let j = i; j <= fin; j++) if (runs[j] !== porteur) runs[j].remove();
    convertis++;
    i = fin;
  }
  return convertis;
}

/** Une balise coupée en plusieurs runs (« {{No » + « m}} ») est ramenée dans le premier. */
function recoller(doc: Document) {
  for (const paragraphe of tous(doc, "w:p")) {
    const textes = textesDe(paragraphe);
    for (let i = 0; i < textes.length; i++) {
      const t = textes[i];
      while (/\{\{[^}]*$/.test(t.textContent ?? "") && i + 1 < textes.length) {
        const suivant = textes[i + 1];
        const contenu = suivant.textContent ?? "";
        const fermeture = contenu.indexOf("}}");
        if (fermeture === -1) {
          t.textContent += contenu;
          suivant.textContent = "";
          textes.splice(i + 1, 1);
        } else {
          t.textContent += contenu.slice(0, fermeture + 2);
          suivant.textContent = contenu.slice(fermeture + 2);
          break;
        }
      }
      if (t.textContent?.includes("{{")) avecEspaces(t);
    }
  }
}

export interface ModelePrepare {
  parties: Parties;
  balises: string[];
  /** Nombre de champs de publipostage Word convertis en balises. */
  champsFusion: number;
}

/** Prépare un modèle .docx (parties lues dans l'archive) pour le remplir. */
export function preparerModele(parties: Parties): ModelePrepare {
  const preparees: Parties = {};
  let champsFusion = 0;
  const balises: string[] = [];
  for (const [chemin, xml] of Object.entries(parties)) {
    if (estPartieTexte(chemin)) {
      const doc = lireXml(xml);
      champsFusion += convertirChamps(doc);
      recoller(doc);
      tous(doc, "w:t").forEach((t) => balises.push(...balisesDe(t.textContent ?? "")));
      preparees[chemin] = ecrireXml(doc);
    } else if (chemin === "[Content_Types].xml") {
      // Un modèle Word (.dotx) devient un document ordinaire (.docx).
      preparees[chemin] = xml.replace("wordprocessingml.template.main+xml", "wordprocessingml.document.main+xml");
    } else if (chemin === "word/settings.xml") {
      // Sans le lien vers la source de publipostage, Word ouvre les courriers sans rien demander.
      const doc = lireXml(xml);
      tous(doc, "w:mailMerge").forEach((e) => e.remove());
      preparees[chemin] = ecrireXml(doc);
    } else {
      if (estRelations(chemin)) balises.push(...balisesDe(xml));
      preparees[chemin] = xml;
    }
  }
  return { parties: preparees, balises: [...new Set(balises)], champsFusion };
}

/** Un paragraphe peut-il disparaître ? Il faut garder la marque de section et le dernier paragraphe d'une cellule. */
function retirable(paragraphe: Element): boolean {
  const parent = paragraphe.parentElement;
  if (!parent || tous(paragraphe, "w:sectPr").length > 0) return false;
  if (enfants(parent, "w:p").length < 2) return false;
  return !(parent.tagName === "w:tc" && parent.lastElementChild === paragraphe);
}

/** Texte remplacé ; une valeur sur plusieurs lignes (cellule Excel avec retours) garde ses retours. */
function remplirTexte(t: Element, valeurs: Record<string, string>) {
  const texte = (t.textContent ?? "").replace(BALISE, (_, balise: string) => valeurs[balise.trim()] ?? "");
  const lignes = texte.split(/\r?\n/);
  t.textContent = lignes[0];
  let precedent = t;
  for (const ligne of lignes.slice(1)) {
    const retour = t.ownerDocument.createElementNS(W, "w:br");
    const suite = t.ownerDocument.createElementNS(W, "w:t");
    suite.textContent = ligne;
    avecEspaces(suite);
    precedent.after(retour, suite);
    precedent = suite;
  }
}

/** Courrier d'une personne : balises remplacées, paragraphes dont toutes les balises sont vides retirés. */
export function remplirModele(parties: Parties, valeurs: Record<string, string>): Parties {
  const remplies: Parties = {};
  for (const [chemin, xml] of Object.entries(parties)) {
    if (estPartieTexte(chemin)) {
      const doc = lireXml(xml);
      for (const paragraphe of tous(doc, "w:p")) {
        const balises = balisesDe(textesDe(paragraphe).map((t) => t.textContent).join(""));
        if (balises.length > 0 && balises.every((b) => !valeurs[b]) && retirable(paragraphe)) paragraphe.remove();
      }
      for (const t of tous(doc, "w:t")) if (t.textContent?.includes("{{")) remplirTexte(t, valeurs);
      remplies[chemin] = ecrireXml(doc);
    } else if (estRelations(chemin) && xml.includes("{{")) {
      const doc = lireXml(xml);
      for (const relation of tous(doc, "Relationship")) {
        const cible = relation.getAttribute("Target") ?? "";
        if (cible.includes("{{")) relation.setAttribute("Target", cible.replace(BALISE, (_, b: string) => valeurs[b.trim()] ?? ""));
      }
      remplies[chemin] = ecrireXml(doc);
    } else {
      remplies[chemin] = xml;
    }
  }
  return remplies;
}

/** Morceau de texte de l'aperçu : texte du modèle, balise (modèle seul) ou valeur d'une personne. */
export interface Segment {
  texte: string;
  sorte: "texte" | "balise" | "valeur";
}

/**
 * Aperçu en texte du corps du document : un tableau de segments par paragraphe. Avec `valeurs`,
 * les balises sont remplacées et les paragraphes dont toutes les balises sont vides n'apparaissent pas.
 */
export function apercuTexte(parties: Parties, valeurs: Record<string, string> | null): Segment[][] {
  const corps = parties["word/document.xml"];
  if (!corps) return [];
  return tous(lireXml(corps), "w:p").flatMap((paragraphe) => {
    // Word double le contenu des zones de texte (version de secours pour les anciens logiciels).
    if (ancetre(paragraphe, "mc:Fallback")) return [];
    const texte = textesDe(paragraphe)
      .map((t) => t.textContent)
      .join("");
    const balises = balisesDe(texte);
    if (valeurs && balises.length > 0 && balises.every((b) => !valeurs[b])) return [];
    const segments: Segment[] = [];
    let position = 0;
    for (const m of texte.matchAll(BALISE)) {
      if (m.index > position) segments.push({ texte: texte.slice(position, m.index), sorte: "texte" });
      segments.push(valeurs ? { texte: valeurs[m[1].trim()] ?? "", sorte: "valeur" } : { texte: m[0], sorte: "balise" });
      position = m.index + m[0].length;
    }
    if (position < texte.length) segments.push({ texte: texte.slice(position), sorte: "texte" });
    return [segments];
  });
}

/** Ordre des éléments d'une section (schéma WordprocessingML) qui suivent la numérotation des pages. */
const APRES_NUMEROTATION = ["w:cols", "w:formProt", "w:vAlign", "w:noEndnote", "w:titlePg", "w:textDirection", "w:bidi", "w:rtlGutter", "w:docGrid", "w:printerSettings", "w:sectPrChange"];

/** XML d'une copie de la section dont la numérotation des pages repart à 1. */
function sectionNumeroteeDepuisUn(section: Element): string {
  // Relue dans un document neuf : la copie garde ses préfixes (w:, r:) dans tous les navigateurs.
  const copie = lireXml(new XMLSerializer().serializeToString(section)).documentElement;
  let numerotation = enfants(copie, "w:pgNumType")[0];
  if (!numerotation) {
    numerotation = copie.ownerDocument.createElementNS(W, "w:pgNumType");
    const suivant = Array.from(copie.children).find((e) => APRES_NUMEROTATION.includes(e.tagName));
    if (suivant) suivant.before(numerotation);
    else copie.appendChild(numerotation);
  }
  numerotation.setAttributeNS(W, "w:start", "1");
  return new XMLSerializer().serializeToString(copie);
}

/**
 * Document fusionné : les courriers (document.xml de chaque personne) bout à bout, un par section ;
 * chacun commence sur une nouvelle page et sa numérotation repart à 1. Les courriers sont assemblés
 * sous forme de texte XML dans le corps du premier (tous viennent du même modèle et partagent ses
 * espaces de noms, ses styles et ses images).
 */
export function fusionnerCorps(documents: string[]): string {
  const docs = documents.map(lireXml);
  const premier = docs[0];
  const corpsPremier = tous(premier, "w:body")[0];
  const sectionFinale = enfants(corpsPremier, "w:sectPr")[0] ?? premier.createElementNS(W, "w:sectPr");
  const serialiseur = new XMLSerializer();
  const fin = sectionNumeroteeDepuisUn(sectionFinale);
  const morceaux = docs.map((doc, index) => {
    // Identifiants des images et des signets rendus uniques d'un courrier à l'autre.
    for (const image of tous(doc, "wp:docPr")) image.setAttribute("id", String(Number(image.getAttribute("id") ?? 0) + index * 10000));
    for (const signet of [...tous(doc, "w:bookmarkStart"), ...tous(doc, "w:bookmarkEnd")]) {
      signet.setAttributeNS(W, "w:id", String(Number(signet.getAttribute("w:id") ?? 0) + index * 10000));
    }
    const corps = tous(doc, "w:body")[0];
    const contenu = Array.from(corps.children)
      .filter((e) => !(e.tagName === "w:sectPr" && e === corps.lastElementChild))
      .map((e) => serialiseur.serializeToString(e))
      .join("");
    // Fin de section : le paragraphe porte une copie de la mise en page, numérotée à partir de 1.
    return index < docs.length - 1 ? `${contenu}<w:p><w:pPr>${fin}</w:pPr></w:p>` : contenu;
  });
  corpsPremier.replaceChildren(premier.createComment("CORPS"));
  return ecrireXml(premier).replace("<!--CORPS-->", morceaux.join("") + fin);
}
