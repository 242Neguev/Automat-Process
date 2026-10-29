// Visuels tels que l'éditeur les utilise : dimensions, textes d'exemple et, pour un SVG, sa source
// actuelle (balises et textes déjà remplacés en moins).
import type { FondImporte, TexteVisuel } from "../moteur";
import { analyserSvg } from "./svg";

export type Visuel = FondImporte & { svgSource?: string };

/**
 * Prépare un visuel importé, ou rouvert avec un projet. Un SVG est analysé ici : ses textes à
 * balises sont renvoyés à part, avec le SVG nettoyé qui doit remplacer le fichier importé.
 * Pour un PDF, le cœur a déjà fait ce travail.
 */
export function preparerVisuel(fond: FondImporte, polices: string[]): { visuel: Visuel; balises: TexteVisuel[]; svgNettoye: string | null } {
  if (fond.genre !== "svg" || !fond.texte) return { visuel: fond, balises: fond.champs, svgNettoye: null };
  const analyse = analyserSvg(fond.texte, polices);
  return {
    visuel: {
      ...fond,
      texte: null,
      largeurMm: analyse.largeurMm,
      hauteurMm: analyse.hauteurMm,
      champs: [],
      textes: analyse.textes,
      svgSource: analyse.svgNettoye,
    },
    balises: analyse.balises,
    svgNettoye: analyse.balises.length > 0 ? analyse.svgNettoye : null,
  };
}

/** Ce qu'un projet enregistre d'un visuel : les textes et la source d'un SVG sont recalculés à l'ouverture. */
export function pourEnregistrer(visuel: Visuel) {
  const { svgSource: _source, ...infos } = visuel;
  return { ...infos, texte: null, champs: [], textes: [] };
}
