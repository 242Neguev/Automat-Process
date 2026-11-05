// Colonne « Quantité » : le nombre de cartes à produire pour chaque agent (planches, impression directe).
import { normaliser } from "./correspondances";
import type { LigneListe } from "./liste";

/** Au-delà, une valeur est sans doute une erreur de saisie (un numéro, un code…). */
export const QUANTITE_MAX = 1000;

const NOMS = new Set([
  "quantite",
  "quantites",
  "qte",
  "qty",
  "quantity",
  "nombre",
  "nombredecartes",
  "nbcartes",
  "nbdecartes",
  "cartes",
  "exemplaires",
  "nbexemplaires",
  "nombredexemplaires",
  "copies",
]);

/** Colonne des quantités, reconnue à son intitulé (« Quantité », « Qté », « Nb cartes »…). */
export const colonneQuantite = (colonnes: string[]) => colonnes.find((colonne) => NOMS.has(normaliser(colonne))) ?? null;

/**
 * Quantité lue dans une cellule : un entier de 0 à QUANTITE_MAX (« 200 », « 200 cartes »,
 * « 1 000 »). `null` si la cellule est vide ou illisible : on fait alors une seule carte.
 */
export function quantiteDe(valeur: string | undefined): number | null {
  const texte = (valeur ?? "").replace(/[\s  ]/g, "");
  const nombre = texte.match(/^\d+/)?.[0];
  if (!nombre) return null;
  const quantite = Number(nombre);
  return quantite <= QUANTITE_MAX ? quantite : null;
}

/** Quantité de chaque ligne (1 sans colonne, ou si la cellule est vide ou illisible). */
export const quantitesDe = (lignes: LigneListe[], colonne: string | null) => lignes.map((ligne) => (colonne ? (quantiteDe(ligne.valeurs[colonne]) ?? 1) : 1));

/** Lignes dont la quantité est illisible ou hors limites (une seule carte leur sera faite). */
export const quantitesIllisibles = (lignes: LigneListe[], colonne: string) =>
  lignes.filter((ligne) => (ligne.valeurs[colonne] ?? "").trim() !== "" && quantiteDe(ligne.valeurs[colonne]) === null).map((ligne) => ligne.numero);

/** Chaque élément répété autant de fois que sa quantité (0 : retiré). */
export const repeter = <T>(elements: T[], quantites: number[]) => elements.flatMap((element, i) => Array<T>(quantites[i] ?? 1).fill(element));
