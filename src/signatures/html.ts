// Signature HTML pour les messageries. Outlook classique affiche le HTML avec le moteur de Word :
// mise en page en tableaux, styles écrits dans chaque balise, polices sûres, liens tel: et mailto:.
import { remplir } from "../donnees/agents";
import { POLICES_WEB, type LigneSignature, type LogoSignature, type ModeleSignature, type Role } from "./modele";

export interface OptionsRendu {
  /** Sans le logo intégré : la version pour Gmail, qui refuse les images intégrées. */
  sansLogo?: boolean;
}

export interface LigneRendue {
  role: Role;
  texte: string;
  lien: string | null;
}

const BALISE = /\{\{([^}]+)\}\}/g;
const CONTIENT_BALISE = /\{\{[^}]+\}\}/;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const TABLE = 'cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"';

export const echapper = (texte: string) => texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texte échappé ; un texte en arabe ou en hébreu s'écrit de droite à gauche. */
const texteHtml = (texte: string) => (RTL.test(texte) ? `<span dir="rtl">${echapper(texte)}</span>` : echapper(texte));

/** Lien d'une ligne, d'après la valeur de ses balises (ou son texte, pour une ligne fixe). */
function lien(ligne: LigneSignature, texte: string, valeurs: Record<string, string>): string | null {
  const valeur = ([...ligne.modele.matchAll(BALISE)].map((m) => valeurs[m[1].trim()] ?? "").find(Boolean) ?? texte).trim();
  switch (ligne.role) {
    case "telephone": {
      const numero = valeur.replace(/[^\d+]/g, "");
      return numero.replace(/\D/g, "").length >= 6 ? `tel:${numero}` : null;
    }
    case "email": {
      const adresse = valeur.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
      return adresse ? `mailto:${adresse}` : null;
    }
    case "site": {
      const adresse = valeur.match(/(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?/i)?.[0];
      return adresse ? (/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`) : null;
    }
    default:
      return null;
  }
}

/** Lignes d'un agent : balises remplacées, lignes vides retirées, lien de chaque ligne. */
export function lignesRendues(lignes: LigneSignature[], valeurs: Record<string, string>): LigneRendue[] {
  return lignes.flatMap((ligne) => {
    const texte = ligne.modele.trim() ? remplir(ligne.modele, valeurs) : "";
    return texte ? [{ role: ligne.role, texte, lien: lien(ligne, texte, valeurs) }] : [];
  });
}

function styles(modele: ModeleSignature) {
  const police = POLICES_WEB[modele.police] ?? POLICES_WEB.Arial;
  const { principale, texte, discrete } = modele.couleurs;
  const t = modele.taille;
  const style = (taille: number, couleur: string, extra = "") =>
    `font-family:${police};font-size:${taille}px;line-height:${Math.round(taille * 1.4)}px;color:${couleur};${extra}`;
  return {
    nom: style(t + 3, principale, "font-weight:bold;"),
    fonction: style(t, discrete),
    societe: style(t, texte, "font-weight:bold;"),
    contact: style(Math.max(11, t - 1), texte),
    mention: style(10, discrete),
    bandeau: style(Math.max(11, t - 1), "#ffffff", "font-weight:bold;"),
  };
}

const ROLE_IDENTITE: Role[] = ["nom", "fonction", "societe"];

/** Contenu d'une ligne : son texte, dans un lien s'il en a un (styles répétés pour Outlook). */
function contenu(ligne: LigneRendue, style: string): string {
  const texte = texteHtml(ligne.texte);
  return ligne.lien ? `<a href="${echapper(ligne.lien)}" style="${style}text-decoration:none;">${texte}</a>` : texte;
}

const rangee = (html: string, style: string, padding = "0") => `<tr><td style="padding:${padding};${style}">${html}</td></tr>`;

function image(logo: LogoSignature, alt: string) {
  return `<img src="${logo.donnees}" width="${logo.largeur}" height="${logo.hauteur}" alt="${echapper(alt)}" style="display:block;border:0;outline:none;width:${logo.largeur}px;height:${logo.hauteur}px;">`;
}

/** Signature HTML d'un agent ; `valeurs` donne la valeur (nettoyée) de chaque balise. */
export function genererSignature(modele: ModeleSignature, valeurs: Record<string, string>, options: OptionsRendu = {}): string {
  if (modele.source === "html") return remplirHtml(modele.html ?? "", valeurs, options);
  const s = styles(modele);
  const lignes = lignesRendues(modele.lignes, valeurs);
  const logo = options.sansLogo ? null : modele.logo;
  const alt = lignes.find((l) => l.role === "societe")?.texte ?? modele.nom;
  const styleDe = (ligne: LigneRendue) =>
    ligne.role === "nom" ? s.nom : ligne.role === "fonction" ? s.fonction : ligne.role === "societe" ? s.societe : s.contact;
  const ligneHtml = (ligne: LigneRendue) => rangee(contenu(ligne, styleDe(ligne)), styleDe(ligne), ligne.role === "nom" ? "0 0 2px 0" : "0");
  const mentions = lignes.filter((l) => l.role === "mention").map((l) => rangee(contenu(l, s.mention), s.mention, "10px 0 0 0"));
  const corps = lignes.filter((l) => l.role !== "mention");
  const { principale } = modele.couleurs;

  if (modele.miseEnPage === "logo-gauche") {
    const texte = `<table ${TABLE}>${corps.map(ligneHtml).join("")}</table>`;
    const colonnes = logo
      ? `<td valign="middle" style="padding:0 14px 0 0;border-right:2px solid ${principale};">${image(logo, alt)}</td>` +
        `<td valign="middle" style="padding:0 0 0 14px;">${texte}</td>`
      : `<td valign="middle" style="padding:0 0 0 12px;border-left:2px solid ${principale};">${texte}</td>`;
    const bas = mentions.map((m) => m.replace("<td ", `<td colspan="${logo ? 2 : 1}" `)).join("");
    return `<table ${TABLE}><tr>${colonnes}</tr>${bas}</table>`;
  }

  if (modele.miseEnPage === "bandeau") {
    const dansBandeau = corps.filter((l) => l.role === "societe" || l.role === "site");
    const haut = logo ? rangee(image(logo, alt), "", "0 0 8px 0") : "";
    const bandeau =
      dansBandeau.length > 0
        ? `<tr><td bgcolor="${principale}" style="padding:6px 10px;background-color:${principale};${s.bandeau}">${dansBandeau
            .map((l) => contenu(l, s.bandeau))
            .join(" &nbsp;·&nbsp; ")}</td></tr>`
        : "";
    const espace = bandeau ? `<tr><td style="padding:0;font-size:0;line-height:0;height:8px;">&nbsp;</td></tr>` : "";
    return `<table ${TABLE}>${haut}${corps.filter((l) => !dansBandeau.includes(l)).map(ligneHtml).join("")}${espace}${bandeau}${mentions.join("")}</table>`;
  }

  // Classique : identité, filet de couleur, coordonnées, logo, mention.
  const identite = corps.filter((l) => ROLE_IDENTITE.includes(l.role));
  const coordonnees = corps.filter((l) => !ROLE_IDENTITE.includes(l.role));
  const filet =
    identite.length > 0 && coordonnees.length > 0
      ? `<tr><td style="padding:8px 0;"><table ${TABLE}><tr><td width="36" style="width:36px;border-top:2px solid ${principale};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`
      : "";
  const bas = logo ? rangee(image(logo, alt), "", "10px 0 0 0") : "";
  return `<table ${TABLE}>${identite.map(ligneHtml).join("")}${filet}${coordonnees.map(ligneHtml).join("")}${bas}${mentions.join("")}</table>`;
}

/** Version texte de la signature (presse-papiers, messageries en texte brut). */
export function texteSignature(modele: ModeleSignature, valeurs: Record<string, string>): string {
  if (modele.source === "html") {
    const doc = new DOMParser().parseFromString(remplirHtml(modele.html ?? "", valeurs, { sansLogo: true }), "text/html");
    doc.querySelectorAll("style").forEach((style) => style.remove());
    // Un document non affiché n'a pas de retours à la ligne : on les remet après chaque ligne.
    doc.querySelectorAll("br, p, div, tr, li, h1, h2, h3, h4, h5, h6").forEach((element) => element.after("\n"));
    return (doc.body.textContent ?? "")
      .split("\n")
      .map((ligne) => ligne.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  return lignesRendues(modele.lignes, valeurs)
    .map((ligne) => ligne.texte)
    .join("\n");
}

/** Textes d'un élément, dans l'ordre du document. */
function textesDe(racine: Node): Text[] {
  const parcours = racine.ownerDocument!.createTreeWalker(racine, 4 /* NodeFilter.SHOW_TEXT */);
  const textes: Text[] = [];
  for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) textes.push(noeud as Text);
  return textes;
}

/**
 * Prépare une signature venue de Word ou d'Outlook : les mots soulignés par le correcteur
 * (<span class=SpellE>) sont recollés, et une balise coupée par une mise en forme
 * (« {{NO<b>M}}</b> ») est ramenée dans un seul texte.
 */
export function recollerBalises(racine: HTMLElement) {
  racine.querySelectorAll("span.SpellE, span.GramE").forEach((span) => span.replaceWith(...Array.from(span.childNodes)));
  racine.normalize();
  const textes = textesDe(racine);
  for (let i = 0; i < textes.length; i++) {
    const texte = textes[i];
    while (/\{\{[^}]*$/.test(texte.data) && i + 1 < textes.length) {
      const suivant = textes[i + 1];
      const fin = suivant.data.indexOf("}}");
      if (fin === -1) {
        texte.data += suivant.data;
        suivant.data = "";
        textes.splice(i + 1, 1);
      } else {
        texte.data += suivant.data.slice(0, fin + 2);
        suivant.data = suivant.data.slice(fin + 2);
        break;
      }
    }
  }
}

/**
 * Signature HTML existante : balises remplacées dans les textes et les liens ; une ligne (paragraphe,
 * rangée…) dont toutes les balises sont vides disparaît, comme sur les cartes.
 */
export function remplirHtml(source: string, valeurs: Record<string, string>, options: OptionsRendu = {}): string {
  const doc = new DOMParser().parseFromString(source, "text/html");
  recollerBalises(doc.body);

  const avecBalises = (texte: string) => [...texte.matchAll(BALISE)].map((m) => m[1].trim());
  const textes = textesDe(doc.body);
  for (const texte of textes) {
    if (avecBalises(texte.data).length === 0) continue;
    const bloc = texte.parentElement?.closest("p, div, li, tr, h1, h2, h3, h4, h5, h6");
    if (bloc && bloc !== doc.body && avecBalises(bloc.textContent ?? "").every((balise) => !valeurs[balise])) bloc.remove();
  }
  for (const texte of textes) {
    if (texte.isConnected) texte.data = texte.data.replace(BALISE, (_, balise: string) => valeurs[balise.trim()] ?? "");
  }
  doc.body.querySelectorAll("*").forEach((element) => {
    for (const attribut of Array.from(element.attributes)) {
      if (CONTIENT_BALISE.test(attribut.value)) {
        element.setAttribute(attribut.name, attribut.value.replace(BALISE, (_, balise: string) => valeurs[balise.trim()] ?? ""));
      }
    }
  });
  if (options.sansLogo) doc.body.querySelectorAll("img").forEach((img) => !/^https?:/i.test(img.getAttribute("src") ?? "") && img.remove());
  // Les styles de la signature (Word les met dans l'en-tête) l'accompagnent.
  const stylesEnTete = Array.from(doc.head.querySelectorAll("style"))
    .map((style) => style.outerHTML)
    .join("");
  return stylesEnTete + doc.body.innerHTML.trim();
}
