// Construction des agents à rendre : chaque ligne de la liste donne le texte final de chaque champ du modèle.
import { recadrageAuto } from "../modele/champs";
import type { Champ, ChampPhoto, ChampQr, ChampTexte, DonneesAgent, ModeleCarte, PhotoAgent, PhotoChargee, Recadrage } from "../moteur";
import { textes } from "../textes";
import { nature, normaliser, type Correspondances, type Nature } from "./correspondances";
import type { LigneListe } from "./liste";
import { nettoyer, type Transformation } from "./nettoyage";
import { empreinte } from "./registre";
import { vcard, type ChampsVCard } from "./vcard";

const BALISE = /\{\{([^}]+)\}\}/g;

const balisesDe = (texte: string) => [...texte.matchAll(BALISE)].map((m) => m[1].trim());
const estTexte = (champ: Champ): champ is ChampTexte => champ.type === "texte";
const estQr = (champ: Champ): champ is ChampQr => champ.type === "qr";
const estPhoto = (champ: Champ): champ is ChampPhoto => champ.type === "photo";

/** Balises utilisées par le modèle (textes, vCard, photos, variantes), dans l'ordre d'apparition. */
export function balisesDuModele(modele: ModeleCarte): string[] {
  const textes = modele.champs.flatMap((champ): string[] =>
    estTexte(champ)
      ? [champ.modele]
      : estQr(champ)
        ? Object.values(champ.vcard ?? {}).filter((t): t is string => Boolean(t))
        : estPhoto(champ) && champ.balise.trim()
          ? [`{{${champ.balise}}}`]
          : [],
  );
  if (modele.variantes?.balise.trim()) textes.push(`{{${modele.variantes.balise}}}`);
  return [...new Set(textes.flatMap(balisesDe))];
}

/** Rang de la variante d'une ligne : celle dont la valeur est celle de sa colonne (sans tenir compte des accents ni de la casse). */
export function varianteDe(modele: ModeleCarte, ligne: LigneListe, correspondances: Correspondances): number | undefined {
  const variantes = modele.variantes;
  const colonne = variantes ? correspondances[variantes.balise.trim()] : null;
  const valeur = colonne ? normaliser(ligne.valeurs[colonne] ?? "") : "";
  if (!variantes || !valeur) return undefined;
  const rang = variantes.valeurs.findIndex((v) => normaliser(v.valeur) === valeur);
  return rang >= 0 ? rang : undefined;
}

/** Photos chargées (par nom, tel qu'écrit dans la liste) et recadrages faits à la main (par cadre et photo). */
export interface Photos {
  chargees: Map<string, PhotoChargee>;
  recadrages: Record<string, Recadrage>;
}

/** Nom de la photo d'une ligne pour un cadre : la valeur brute de sa colonne (nom de fichier ou chemin). */
export const nomPhoto = (champ: ChampPhoto, ligne: LigneListe, correspondances: Correspondances) => {
  const colonne = correspondances[champ.balise.trim()];
  return colonne ? (ligne.valeurs[colonne] ?? "").trim() : "";
};

/** Clé du recadrage d'une photo dans un cadre (le nom de la photo n'y figure que par son empreinte). */
export const cleRecadrage = (champ: ChampPhoto, nom: string) => `${champ.id}:${empreinte(nom)}`;

function photosDeLigne(modele: ModeleCarte, ligne: LigneListe, correspondances: Correspondances, photos: Photos): Record<string, PhotoAgent> | undefined {
  const resultat: Record<string, PhotoAgent> = {};
  for (const champ of modele.champs.filter(estPhoto)) {
    const nom = nomPhoto(champ, ligne, correspondances);
    const chargee = nom ? photos.chargees.get(nom) : undefined;
    if (!chargee?.chemin) continue;
    const cle = cleRecadrage(champ, nom);
    const recadrage = photos.recadrages[cle] ?? recadrageAuto(champ, chargee);
    resultat[champ.id] = { chemin: chargee.chemin, largeur_px: chargee.largeurPx, hauteur_px: chargee.hauteurPx, cle, ...recadrage };
  }
  return Object.keys(resultat).length > 0 ? resultat : undefined;
}

/**
 * Remplace les balises d'un texte. Si toutes ses balises sont vides, le texte entier est vide :
 * « Tél. {{Fixe}} » disparaît quand l'agent n'a pas de téléphone fixe.
 */
export function remplir(texte: string, valeurs: Record<string, string>): string {
  const balises = balisesDe(texte);
  if (balises.length > 0 && balises.every((balise) => !valeurs[balise])) return "";
  return texte
    .replace(BALISE, (_, balise: string) => valeurs[balise.trim()] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Valeur nettoyée de chaque balise pour une ligne de la liste (modèle de carte ou de signature). */
export function valeursDeLigne(modele: { transformations?: Record<string, Transformation> }, ligne: LigneListe, correspondances: Correspondances) {
  return Object.fromEntries(
    Object.entries(correspondances).map(([balise, colonne]) => [
      balise,
      nettoyer(colonne ? ligne.valeurs[colonne] : "", modele.transformations?.[balise]),
    ]),
  );
}

export function construireAgent(modele: ModeleCarte, ligne: LigneListe, correspondances: Correspondances, photos?: Photos): DonneesAgent {
  const valeurs = valeursDeLigne(modele, ligne, correspondances);
  const champsQr = modele.champs.filter(estQr).find((champ) => champ.vcard);
  const contact =
    champsQr?.vcard &&
    (Object.fromEntries(Object.entries(champsQr.vcard).map(([cle, texte]) => [cle, remplir(texte ?? "", valeurs)])) as ChampsVCard);
  const variante = varianteDe(modele, ligne, correspondances);
  const photosAgent = photos ? photosDeLigne(modele, ligne, correspondances, photos) : undefined;
  return {
    id: `ligne ${ligne.numero}`,
    valeurs: Object.fromEntries(modele.champs.filter(estTexte).map((champ) => [champ.id, remplir(champ.modele, valeurs)])),
    vcard: contact ? vcard(contact) : undefined,
    // Absents quand le modèle n'en a pas : la carte d'un agent garde la même empreinte qu'avant.
    ...(variante !== undefined && { variante }),
    ...(photosAgent && { photos: photosAgent }),
  };
}

/**
 * Exemple d'agent montrant les balises elles-mêmes (et un QR code d'exemple), pour présenter le
 * modèle, avec les visuels de la variante `variante` s'il y a lieu.
 */
export function agentBalises(modele: ModeleCarte, variante?: number): DonneesAgent {
  return {
    id: "modèle",
    valeurs: Object.fromEntries(modele.champs.filter(estTexte).map((champ) => [champ.id, champ.modele])),
    vcard: modele.champs.some(estQr) ? vcard(textes.exempleQr) : undefined,
    ...(variante !== undefined && { variante }),
  };
}

/** Nom d'un agent pour les listes : le premier texte non vide de sa carte (en général son nom). */
export const libelleAgent = (agent: DonneesAgent) => Object.values(agent.valeurs).find(Boolean) ?? textes.cartes.verification.sansNom;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEPHONES: Nature[] = ["mobile", "fixe", "telephone"];
const versUrl = (adresse: string) => (/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`);

/**
 * Lien de chaque champ texte d'une carte numérique, d'après ses balises : tel: pour un numéro,
 * mailto: pour un e-mail, https: pour un site (aussi pour un texte fixe « www.exemple.com »).
 */
export function liensAgent(modele: ModeleCarte, valeurs: Record<string, string>): Record<string, string> {
  const liens: Record<string, string> = {};
  for (const champ of modele.champs.filter(estTexte)) {
    const balises = balisesDe(champ.modele);
    for (const balise of balises) {
      const valeur = (valeurs[balise] ?? "").trim();
      const genre = nature(balise);
      const numero = valeur.replace(/[^\d+]/g, "");
      if (!valeur) continue;
      if (genre === "email" || EMAIL.test(valeur)) liens[champ.id] = `mailto:${valeur}`;
      else if (TELEPHONES.includes(genre as Nature) && numero.replace(/\D/g, "").length >= 6) liens[champ.id] = `tel:${numero}`;
      else if (/^(https?:\/\/|www\.)/i.test(valeur)) liens[champ.id] = versUrl(valeur);
      if (liens[champ.id]) break;
    }
    const adresse = balises.length === 0 ? champ.modele.match(/(https?:\/\/|www\.)\S+/i)?.[0] : undefined;
    if (adresse) liens[champ.id] = versUrl(adresse);
  }
  return liens;
}

/**
 * Fiche contact (vCard) d'un agent : celle du QR code du modèle s'il en a un, sinon d'après la
 * nature des balises (prénom, nom, fonction, téléphones, e-mail). Vide sans coordonnées.
 */
export function ficheContact(modele: ModeleCarte, valeurs: Record<string, string>): string {
  const qr = modele.champs.filter(estQr).find((champ) => champ.vcard);
  if (qr?.vcard) {
    return vcard(Object.fromEntries(Object.entries(qr.vcard).map(([cle, texte]) => [cle, remplir(texte ?? "", valeurs)])) as ChampsVCard);
  }
  const premiere = (natures: Nature[]) => Object.entries(valeurs).find(([balise, valeur]) => valeur && natures.includes(nature(balise) as Nature))?.[1];
  return vcard({
    prenom: premiere(["prenom"]),
    nom: premiere(["nom"]),
    fonction: premiere(["fonction"]),
    mobile: premiere(["mobile"]),
    fixe: premiere(["fixe", "telephone"]),
    email: premiere(["email"]),
  });
}
