// Mise à jour incrémentale : registre des cartes déjà produites avec un modèle. Il ne garde que des
// empreintes (jamais les données des agents) : de quoi reconnaître, à l'export suivant, les cartes
// nouvelles, modifiées ou inchangées.
import type { DonneesAgent } from "../moteur";
import { nature, normaliser, type Nature } from "./correspondances";
import type { LigneListe } from "./liste";

/** Cartes imprimées (PDF de l'imprimeur, impression directe) ou numériques (images, PDF cliquables). */
export type Canal = "impression" | "numerique";

export interface RegistreCanal {
  /** Empreinte du modèle lors des exports : s'il change, toutes les cartes sont à refaire. */
  modele: string;
  /** Date du dernier export (ISO 8601). */
  date: string;
  /** Nombre de cartes du dernier export. */
  nombre: number;
  /** Empreinte de l'identité de chaque agent → empreinte de sa carte. */
  cartes: Record<string, string>;
}

export interface Registre {
  version: 1;
  canaux: Partial<Record<Canal, RegistreCanal>>;
}

export type EtatCarte = "nouvelle" | "modifiee" | "inchangee";

/** Hachage cyrb53 (53 bits), stable d'une version à l'autre de l'application. */
function cyrb53(texte: string, graine: number): number {
  let h1 = 0xdeadbeef ^ graine;
  let h2 = 0x41c6ce57 ^ graine;
  for (let i = 0; i < texte.length; i++) {
    const code = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Empreinte d'un texte (deux hachages de 53 bits) : on ne peut pas en retrouver le texte. */
export const empreinte = (texte: string) => cyrb53(texte, 1).toString(36) + "." + cyrb53(texte, 2).toString(36);

/** JSON aux clés triées : la même carte donne toujours la même empreinte. */
function jsonStable(valeur: unknown): string {
  if (Array.isArray(valeur)) return `[${valeur.map(jsonStable).join(",")}]`;
  if (valeur && typeof valeur === "object") {
    const entrees = Object.entries(valeur as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entrees.map(([cle, v]) => `${JSON.stringify(cle)}:${jsonStable(v)}`).join(",")}}`;
  }
  return JSON.stringify(valeur) ?? "null";
}

/**
 * Empreinte de ce que montre la carte d'un agent (textes, QR code, variante, photo…). Une photo compte
 * par son nom et son recadrage : son chemin en mémoire change à chaque session.
 */
export function empreinteCarte(agent: DonneesAgent): string {
  const { id: _id, libelle: _libelle, liens: _liens, photos, ...carte } = agent;
  const parNom =
    photos && Object.fromEntries(Object.entries(photos).map(([champ, p]) => [champ, { cle: p.cle, centre_x: p.centre_x, centre_y: p.centre_y, zoom: p.zoom }]));
  return empreinte(jsonStable(parNom ? { ...carte, photos: parNom } : carte));
}

// Ce qui identifie un agent d'une liste à la suivante, du plus sûr au moins sûr.
const IDENTITES: Nature[][] = [["matricule"], ["email"], ["prenom", "nom"]];

/**
 * Empreinte de l'identité de chaque agent : son matricule, sinon son e-mail, sinon son prénom et
 * son nom, sinon toute sa ligne. Deux agents de même identité sont distingués par leur rang.
 */
export function identites(lignes: LigneListe[], colonnes: string[]): string[] {
  const vues = new Map<string, number>();
  return lignes.map((ligne) => {
    const valeur = (cols: string[]) =>
      cols
        .map((c) => normaliser(ligne.valeurs[c] ?? ""))
        .filter(Boolean)
        .join("|");
    let cle = "";
    for (const natures of IDENTITES) {
      const v = valeur(colonnes.filter((c) => natures.includes(nature(c) as Nature)));
      if (v) {
        cle = `${natures.join("+")}:${v}`;
        break;
      }
    }
    if (!cle) cle = `ligne:${valeur(colonnes)}`;
    const rang = (vues.get(cle) ?? 0) + 1;
    vues.set(cle, rang);
    return empreinte(rang > 1 ? `${cle}#${rang}` : cle);
  });
}

/** État de chaque carte par rapport aux exports précédents du canal. */
export function etatsCartes(cles: string[], cartes: string[], canal: RegistreCanal | undefined, modele: string): EtatCarte[] {
  return cles.map((cle, i) => {
    const avant = canal?.cartes[cle];
    if (avant === undefined) return "nouvelle";
    return canal!.modele === modele && avant === cartes[i] ? "inchangee" : "modifiee";
  });
}

/**
 * Registre après un export. Si le modèle a changé, les cartes d'avant ne comptent plus : seules
 * restent celles qui viennent d'être produites avec le nouveau modèle.
 */
export function apresExport(registre: Registre | null, canal: Canal, modele: string, exportees: { cle: string; carte: string }[], date = new Date()): Registre {
  const actuel = registre?.canaux[canal];
  const cartes = actuel && actuel.modele === modele ? { ...actuel.cartes } : {};
  for (const { cle, carte } of exportees) cartes[cle] = carte;
  return { version: 1, canaux: { ...registre?.canaux, [canal]: { modele, date: date.toISOString(), nombre: exportees.length, cartes } } };
}

/** Lit un registre enregistré ; un fichier d'une autre version ou abîmé est ignoré. */
export function lireRegistre(brut: unknown): Registre | null {
  if (!brut || typeof brut !== "object") return null;
  const registre = brut as Partial<Registre>;
  return registre.version === 1 && registre.canaux && typeof registre.canaux === "object" ? (registre as Registre) : null;
}

/** Identifiant neuf pour un modèle (le registre de ses exports est rangé sous ce nom). */
export function nouvelIdentifiant(): string {
  const octets = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
}
