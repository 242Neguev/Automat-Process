// Construction des agents à rendre : chaque ligne de la liste donne le texte final de chaque champ du modèle.
import type { Champ, ChampQr, ChampTexte, DonneesAgent, ModeleCarte } from "../moteur";
import type { Correspondances } from "./correspondances";
import type { LigneListe } from "./liste";
import { nettoyer } from "./nettoyage";
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

/** Valeur nettoyée de chaque balise pour une ligne de la liste. */
export function valeursDeLigne(modele: ModeleCarte, ligne: LigneListe, correspondances: Correspondances) {
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
