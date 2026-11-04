// Modèle de signature e-mail : mise en page, couleurs, police, logo et lignes de texte avec balises
// (« Mob. {{Mobile}} »), ou signature HTML existante dans laquelle on a placé des balises.
import type { Transformation } from "../donnees/nettoyage";
import { COULEURS } from "../theme";

export type MiseEnPage = "classique" | "logo-gauche" | "bandeau";

/** Rôle d'une ligne : il décide de sa mise en forme et de son lien (téléphone, e-mail, site). */
export type Role = "nom" | "fonction" | "societe" | "telephone" | "email" | "site" | "texte" | "mention";

export interface LigneSignature {
  id: string;
  role: Role;
  /** Texte avec balises ; une ligne dont toutes les balises sont vides disparaît, une ligne vide est ignorée. */
  modele: string;
}

export interface LogoSignature {
  /** Image intégrée à la signature (data:image/png;base64,…), déjà réduite. */
  donnees: string;
  /** Taille affichée, en pixels. */
  largeur: number;
  hauteur: number;
  nomFichier: string;
  /** Image d'origine (réduite à 800 px), pour changer la taille du logo sans perte. */
  source?: string;
}

export interface ModeleSignature {
  nom: string;
  /** Mise en page proposée par l'application, ou signature HTML existante importée. */
  source: "mise-en-page" | "html";
  miseEnPage: MiseEnPage;
  /** Police « sûre », installée partout (voir POLICES_WEB). */
  police: string;
  /** Taille du texte courant, en pixels. */
  taille: number;
  couleurs: { principale: string; texte: string; discrete: string };
  logo: LogoSignature | null;
  lignes: LigneSignature[];
  /** Signature HTML existante (source « html »), balises comprises. */
  html: string | null;
  transformations?: Record<string, Transformation>;
  /** Mode opérateur : le modèle ne se modifie plus, le projet s'ouvre à l'étape Liste. */
  verrouille?: boolean;
}

/** Polices disponibles sur tous les ordinateurs et dans les messageries, avec leurs polices de repli. */
export const POLICES_WEB: Record<string, string> = {
  Arial: "Arial, Helvetica, sans-serif",
  Calibri: "Calibri, Carlito, Arial, sans-serif",
  "Segoe UI": "'Segoe UI', Arial, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  Tahoma: "Tahoma, Verdana, sans-serif",
  "Trebuchet MS": "'Trebuchet MS', Helvetica, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  "Times New Roman": "'Times New Roman', Times, serif",
};

/** Limite de Gmail pour une signature, en caractères de code HTML. */
export const LIMITE_GMAIL = 10_000;

const BALISE = /\{\{([^}]+)\}\}/g;

let compteur = 0;
/** Identifiant de ligne unique dans la session. */
export const nouvelIdLigne = () => `l${Date.now().toString(36)}${(compteur++).toString(36)}`;

export function modeleParDefaut(): ModeleSignature {
  const ligne = (role: Role, modele = "") => ({ id: nouvelIdLigne(), role, modele });
  return {
    nom: "Ma signature",
    source: "mise-en-page",
    miseEnPage: "classique",
    police: "Arial",
    taille: 13,
    couleurs: { principale: COULEURS.eau.toLowerCase(), texte: COULEURS.encre.toLowerCase(), discrete: "#6b7075" },
    logo: null,
    lignes: [
      ligne("nom", "{{Prénom}} {{NOM}}"),
      ligne("fonction", "{{Fonction}}"),
      ligne("societe"),
      ligne("telephone", "Mob. {{Mobile}}"),
      ligne("telephone", "Tél. {{Fixe}}"),
      ligne("email", "{{Email}}"),
      ligne("site"),
      ligne("texte"),
      ligne("mention"),
    ],
    html: null,
    transformations: { Prénom: "nom-propre", NOM: "majuscules", Email: "minuscules" },
  };
}

/** Balises utilisées par le modèle, dans l'ordre d'apparition. */
export function balisesSignature(modele: ModeleSignature): string[] {
  const textes = modele.source === "html" ? [modele.html ?? ""] : modele.lignes.map((ligne) => ligne.modele);
  return [...new Set(textes.flatMap((texte) => [...texte.matchAll(BALISE)].map((m) => m[1].trim())))];
}
