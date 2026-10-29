// Construction des agents à rendre : chaque ligne de la liste donne le texte final de chaque champ du modèle.
import type { Champ, ChampQr, ChampTexte, DonneesAgent, ModeleCarte } from "../moteur";
import { textes } from "../textes";
import { nature, type Correspondances, type Nature } from "./correspondances";
import type { LigneListe } from "./liste";
import { nettoyer, type Transformation } from "./nettoyage";
import { vcard, type ChampsVCard } from "./vcard";

const BALISE = /\{\{([^}]+)\}\}/g;

const balisesDe = (texte: string) => [...texte.matchAll(BALISE)].map((m) => m[1].trim());
const estTexte = (champ: Champ): champ is ChampTexte => champ.type === "texte";
const estQr = (champ: Champ): champ is ChampQr => champ.type === "qr";

/** Balises utilisées par le modèle (textes et vCard), dans l'ordre d'apparition. */
export function balisesDuModele(modele: ModeleCarte): string[] {
  const textes = modele.champs.flatMap((champ): string[] =>
    estTexte(champ) ? [champ.modele] : estQr(champ) ? Object.values(champ.vcard ?? {}).filter((t): t is string => Boolean(t)) : [],
  );
  return [...new Set(textes.flatMap(balisesDe))];
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

export function construireAgent(modele: ModeleCarte, ligne: LigneListe, correspondances: Correspondances): DonneesAgent {
  const valeurs = valeursDeLigne(modele, ligne, correspondances);
  const champsQr = modele.champs.filter(estQr).find((champ) => champ.vcard);
  const contact =
    champsQr?.vcard &&
    (Object.fromEntries(Object.entries(champsQr.vcard).map(([cle, texte]) => [cle, remplir(texte ?? "", valeurs)])) as ChampsVCard);
  return {
    id: `ligne ${ligne.numero}`,
    valeurs: Object.fromEntries(modele.champs.filter(estTexte).map((champ) => [champ.id, remplir(champ.modele, valeurs)])),
    vcard: contact ? vcard(contact) : undefined,
  };
}

/** Exemple d'agent montrant les balises elles-mêmes (et un QR code d'exemple), pour présenter le modèle. */
export function agentBalises(modele: ModeleCarte): DonneesAgent {
  return {
    id: "modèle",
    valeurs: Object.fromEntries(modele.champs.filter(estTexte).map((champ) => [champ.id, champ.modele])),
    vcard: modele.champs.some(estQr) ? vcard({ prenom: "Prénom", nom: "NOM", email: "prenom.nom@exemple.com" }) : undefined,
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
