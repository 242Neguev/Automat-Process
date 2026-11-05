// Liste vide à faire remplir (par les ressources humaines…) : un classeur Excel avec une colonne par
// information du modèle. Rempli puis importé à l'étape Liste, il est relié d'office au modèle.
import * as XLSX from "xlsx";
import { textes } from "../textes";

/** Lignes préparées au format texte, sous les titres. */
export const LIGNES_PREPAREES = 500;
export const FEUILLE_LISTE = textes.liste.listeVide.feuilles.liste;
export const FEUILLE_AIDE = textes.liste.listeVide.feuilles.aide;

/**
 * Classeur Excel vide : les titres des colonnes sont les informations du modèle, et les cellules en
 * dessous sont au format texte, pour qu'un numéro saisi garde ses zéros et sa présentation
 * (« 0612345678 », « +237 6 12 34 56 78 ») au lieu de devenir un nombre.
 */
export function classeurVide(colonnes: string[], aide: string[]): Uint8Array {
  const liste = XLSX.utils.aoa_to_sheet([colonnes]);
  for (let ligne = 1; ligne <= LIGNES_PREPAREES; ligne++) {
    for (let colonne = 0; colonne < colonnes.length; colonne++) {
      liste[XLSX.utils.encode_cell({ r: ligne, c: colonne })] = { t: "z", z: "@" };
    }
  }
  liste["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: LIGNES_PREPAREES, c: Math.max(0, colonnes.length - 1) } });
  liste["!cols"] = colonnes.map((titre) => ({ wch: Math.min(40, Math.max(16, titre.length + 6)) }));
  const modeEmploi = XLSX.utils.aoa_to_sheet(aide.map((ligne) => [ligne]));
  modeEmploi["!cols"] = [{ wch: 110 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, liste, FEUILLE_LISTE);
  XLSX.utils.book_append_sheet(classeur, modeEmploi, FEUILLE_AIDE);
  return new Uint8Array(XLSX.write(classeur, { type: "array", bookType: "xlsx", sheetStubs: true }));
}
