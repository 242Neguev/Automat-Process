// Repères magnétiques de l'éditeur : une information que l'on fait glisser s'aligne d'elle-même sur les
// autres (bords, centres, lignes de base), sur le centre de la carte et sur la zone de sécurité.
import type { Champ } from "../moteur";
import { boiteChamp } from "./champs";
import { MARGE_SECURITE_MM, type Format } from "./formats";

/** Distance d'attraction, en pixels à l'écran (convertie en mm selon le zoom de l'éditeur). */
export const SEUIL_PX = 6;

/** Repère à afficher : une ligne verticale (axe x) ou horizontale (axe y), en mm sur la carte finie. */
export interface Repere {
  axe: "x" | "y";
  position: number;
}

/**
 * Lignes d'un champ qui peuvent s'aligner : bords et centre. Pour un texte, verticalement, sa ligne de
 * base et le haut de ses capitales : le bas de sa boîte (jambages), trop proche de la ligne de base,
 * créerait des alignements parasites.
 */
function lignes(champ: Champ): { x: number[]; y: number[] } {
  const b = boiteChamp(champ);
  const x = [b.x, b.x + b.largeur / 2, b.x + b.largeur];
  const y = champ.type === "texte" ? [champ.y_mm, b.y] : [b.y, b.y + b.hauteur / 2, b.y + b.hauteur];
  return { x, y };
}

/** Lignes qui attirent : centre de la carte, zone de sécurité (impression) et lignes des autres champs. */
function cibles(autres: Champ[], format: Format): { x: number[]; y: number[] } {
  const { largeur_mm: largeur, hauteur_mm: hauteur } = format;
  const x = [largeur / 2];
  const y = [hauteur / 2];
  if (!format.px) {
    x.push(MARGE_SECURITE_MM, largeur - MARGE_SECURITE_MM);
    y.push(MARGE_SECURITE_MM, hauteur - MARGE_SECURITE_MM);
  }
  for (const autre of autres) {
    const l = lignes(autre);
    x.push(...l.x);
    y.push(...l.y);
  }
  return { x, y };
}

/** Plus petit écart (au-dessous du seuil) entre une ligne du champ et une ligne qui attire. */
function attraction(propres: number[], attirantes: number[], seuil: number): { ecart: number; position: number } | null {
  let meilleure: { ecart: number; position: number } | null = null;
  for (const propre of propres) {
    for (const position of attirantes) {
      const ecart = position - propre;
      if (Math.abs(ecart) <= seuil && (!meilleure || Math.abs(ecart) < Math.abs(meilleure.ecart))) meilleure = { ecart, position };
    }
  }
  return meilleure;
}

/**
 * Déplacement (dx, dy en mm) d'un champ corrigé par les repères magnétiques, et les repères à afficher.
 * Chaque axe s'aligne au plus sur une ligne : la plus proche, à moins de `seuil` mm.
 */
export function aimanter(champ: Champ, dx: number, dy: number, autres: Champ[], format: Format, seuil: number): { dx: number; dy: number; reperes: Repere[] } {
  const propres = lignes({ ...champ, x_mm: champ.x_mm + dx, y_mm: champ.y_mm + dy });
  const attirantes = cibles(autres, format);
  const enX = attraction(propres.x, attirantes.x, seuil);
  const enY = attraction(propres.y, attirantes.y, seuil);
  const reperes: Repere[] = [];
  if (enX) reperes.push({ axe: "x", position: enX.position });
  if (enY) reperes.push({ axe: "y", position: enY.position });
  return { dx: dx + (enX?.ecart ?? 0), dy: dy + (enY?.ecart ?? 0), reperes };
}
