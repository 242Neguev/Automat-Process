// Fichiers glissés dans la fenêtre : ce qu'ils sont, et quel module les prend.
import type { Module } from "../modules";
import { extensionDe } from "./chemins";

export type Genre = "projet" | "liste" | "word" | "visuel" | "inconnu";

const GENRES: Record<string, Genre> = {
  automat: "projet",
  xlsx: "liste",
  xlsm: "liste",
  xls: "liste",
  ods: "liste",
  csv: "liste",
  tsv: "liste",
  txt: "liste",
  docx: "word",
  dotx: "word",
  pdf: "visuel",
  svg: "visuel",
  png: "visuel",
  jpg: "visuel",
  jpeg: "visuel",
};

/** Ce qu'est un fichier, d'après son extension. */
export const genreDe = (chemin: string): Genre => GENRES[extensionDe(chemin)] ?? "inconnu";

/** Où vont les fichiers déposés. */
export type Routage =
  | { genre: "projet"; chemin: string }
  | { genre: "module"; module: Module; chemins: string[] }
  | { genre: "choix"; modules: Module[]; chemins: string[] }
  | { genre: "inconnu" };

/** Les modules qui prennent un visuel (carte, image de fond). */
const POUR_VISUEL: Module[] = ["cartes", "numerique"];
const TOUS: Module[] = ["cartes", "signatures", "numerique", "word"];

/**
 * Un projet s'ouvre dans son module ; un courrier Word va au module Word ; un visuel va au module
 * affiché s'il en prend un, sinon on demande lequel ; une liste seule va au module affiché, ou on
 * demande depuis l'accueil. Les fichiers qu'on ne sait pas lire sont laissés de côté.
 */
export function router(chemins: string[], vue: Module | "accueil"): Routage {
  const projet = chemins.find((chemin) => genreDe(chemin) === "projet");
  if (projet) return { genre: "projet", chemin: projet };
  const utiles = chemins.filter((chemin) => genreDe(chemin) !== "inconnu");
  if (utiles.length === 0) return { genre: "inconnu" };
  const genres = new Set(utiles.map(genreDe));
  if (genres.has("word")) return { genre: "module", module: "word", chemins: utiles.filter((chemin) => genreDe(chemin) !== "visuel") };
  if (genres.has("visuel")) {
    return vue !== "accueil" && POUR_VISUEL.includes(vue) ? { genre: "module", module: vue, chemins: utiles } : { genre: "choix", modules: POUR_VISUEL, chemins: utiles };
  }
  return vue !== "accueil" ? { genre: "module", module: vue, chemins: utiles } : { genre: "choix", modules: TOUS, chemins: utiles };
}
