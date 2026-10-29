// Formats de carte (et d'écran), et mise en correspondance d'un visuel importé avec la carte.

export interface Format {
  largeur_mm: number;
  hauteur_mm: number;
  fond_perdu_mm: number;
  /** Format d'écran (fond Teams, bannière…) : taille en pixels ; le document mesure 1 px = 1/96 de pouce. */
  px?: { largeur: number; hauteur: number };
}

export interface FormatPredefini extends Format {
  id: string;
  libelle: string;
}

export const FORMATS: FormatPredefini[] = [
  { id: "85x55", libelle: "Carte de visite 85 × 55 mm", largeur_mm: 85, hauteur_mm: 55, fond_perdu_mm: 3 },
  { id: "90x50", libelle: "Carte de visite 90 × 50 mm", largeur_mm: 90, hauteur_mm: 50, fond_perdu_mm: 3 },
  { id: "us", libelle: "Carte américaine 88,9 × 50,8 mm", largeur_mm: 88.9, hauteur_mm: 50.8, fond_perdu_mm: 3 },
  // Les imprimantes à cartes PVC impriment bord à bord : pas de fond perdu.
  { id: "cr80", libelle: "Badge PVC CR80 85,6 × 54 mm", largeur_mm: 85.6, hauteur_mm: 54, fond_perdu_mm: 0 },
];

const MM_PAR_PX = 25.4 / 96;
const ecran = (id: string, libelle: string, largeur: number, hauteur: number): FormatPredefini => ({
  id,
  libelle,
  largeur_mm: Math.round(largeur * MM_PAR_PX * 1000) / 1000,
  hauteur_mm: Math.round(hauteur * MM_PAR_PX * 1000) / 1000,
  fond_perdu_mm: 0,
  px: { largeur, hauteur },
});

/** Formats d'écran du module « Visuels numériques ». */
export const FORMATS_ECRAN: FormatPredefini[] = [
  ecran("teams", "Fond d'écran Teams / Zoom 1920 × 1080 px", 1920, 1080),
  ecran("linkedin", "Bannière LinkedIn 1584 × 396 px", 1584, 396),
  ecran("carre", "Image carrée 1080 × 1080 px", 1080, 1080),
];

/**
 * Fond Teams ou Zoom : zone que la personne cache, au centre et en bas de l'image (mm). Les
 * informations se placent autour.
 */
export function zonePersonne(format: Format) {
  if (format.px?.largeur !== 1920 || format.px.hauteur !== 1080) return null;
  return { x: format.largeur_mm * 0.3, y: format.hauteur_mm * 0.22, largeur: format.largeur_mm * 0.4, hauteur: format.hauteur_mm * 0.78 };
}

/** Les textes doivent rester à cette distance du bord de coupe (mm) : la coupe n'est jamais parfaite. */
export const MARGE_SECURITE_MM = 3;

const MM_PAR_UNITE: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };

/** Tailles « attendues » d'un visuel de carte, avec et sans fond perdu, dans les deux orientations. */
function taillesAttendues(): [number, number][] {
  return FORMATS.flatMap((f) =>
    [0, 3].flatMap((fp) => {
      const l = f.largeur_mm + 2 * fp;
      const h = f.hauteur_mm + 2 * fp;
      return [
        [l, h],
        [h, l],
      ] as [number, number][];
    }),
  );
}

/**
 * Taille physique d'un SVG (mm) et taille d'une unité du dessin (mm). Les dimensions sans unité
 * sont ambiguës : Illustrator compte en points (72 par pouce), Figma et Inkscape en pixels CSS
 * (96 par pouce). On retient l'interprétation qui tombe sur un format de carte connu.
 */
export function tailleSvg(largeur: string | null, hauteur: string | null, viewBox: number[] | null) {
  const lire = (valeur: string | null) => {
    const m = valeur?.trim().match(/^([\d.]+)\s*([a-z%]*)$/i);
    return m ? { nombre: Number(m[1]), unite: m[2].toLowerCase() } : null;
  };
  const l = lire(largeur);
  const h = lire(hauteur);
  let largeurMm: number;
  let hauteurMm: number;
  if (l && h && l.unite in MM_PAR_UNITE && l.unite !== "px" && h.unite in MM_PAR_UNITE && h.unite !== "px") {
    largeurMm = l.nombre * MM_PAR_UNITE[l.unite];
    hauteurMm = h.nombre * MM_PAR_UNITE[h.unite];
  } else {
    const base = l && h && (l.unite === "" || l.unite === "px") ? [l.nombre, h.nombre] : viewBox ? [viewBox[2], viewBox[3]] : null;
    if (!base) return null;
    const candidats = [25.4 / 96, 25.4 / 72].map((mmParPx) => [base[0] * mmParPx, base[1] * mmParPx]);
    const ecart = ([cl, ch]: number[]) => Math.min(...taillesAttendues().map(([al, ah]) => Math.abs(cl - al) + Math.abs(ch - ah)));
    [largeurMm, hauteurMm] = ecart(candidats[1]) < ecart(candidats[0]) ? candidats[1] : candidats[0];
  }
  const mmParUniteDessin = viewBox ? largeurMm / viewBox[2] : MM_PAR_UNITE.px;
  return { largeurMm, hauteurMm, mmParUniteDessin };
}

/**
 * Le visuel contient-il déjà le fond perdu ? On compare ses dimensions (ou, pour une image, ses
 * proportions) à la carte avec et sans fond perdu.
 */
export function contientFondPerdu(
  visuel: { largeurMm?: number | null; hauteurMm?: number | null; largeurPx?: number | null; hauteurPx?: number | null },
  format: Format,
): boolean {
  if (format.fond_perdu_mm === 0) return true;
  const cw = format.largeur_mm + 2 * format.fond_perdu_mm;
  const ch = format.hauteur_mm + 2 * format.fond_perdu_mm;
  if (visuel.largeurMm && visuel.hauteurMm) {
    const ecart = (l: number, h: number) => Math.abs(visuel.largeurMm! - l) + Math.abs(visuel.hauteurMm! - h);
    return ecart(cw, ch) <= ecart(format.largeur_mm, format.hauteur_mm);
  }
  if (visuel.largeurPx && visuel.hauteurPx) {
    const proportions = visuel.largeurPx / visuel.hauteurPx;
    return Math.abs(proportions - cw / ch) < Math.abs(proportions - format.largeur_mm / format.hauteur_mm);
  }
  return true;
}

/**
 * Où le visuel apparaît sur la carte finie (mm, hors fond perdu), sans déformation et centré, comme
 * dans le gabarit : il couvre toute la carte s'il contient le fond perdu, sinon la zone de coupe.
 */
export function placementVisuel(visuel: { largeur: number; hauteur: number }, format: Format, avecFondPerdu = true) {
  const marge = avecFondPerdu ? format.fond_perdu_mm : 0;
  const zoneL = format.largeur_mm + 2 * marge;
  const zoneH = format.hauteur_mm + 2 * marge;
  const echelle = Math.max(zoneL / visuel.largeur, zoneH / visuel.hauteur);
  return {
    echelle,
    decalageX: (zoneL - visuel.largeur * echelle) / 2 - marge,
    decalageY: (zoneH - visuel.hauteur * echelle) / 2 - marge,
  };
}

/** Point du visuel (mm depuis son coin haut-gauche) → point de la carte finie (mm, hors fond perdu). */
export function versCarte(point: { x: number; y: number }, visuel: { largeur: number; hauteur: number }, format: Format, avecFondPerdu = true) {
  const { echelle, decalageX, decalageY } = placementVisuel(visuel, format, avecFondPerdu);
  return { x: decalageX + point.x * echelle, y: decalageY + point.y * echelle, echelle };
}

export type Niveau = "ok" | "info" | "attention";

/** Messages pour l'utilisateur sur l'adéquation entre le visuel et le format choisi. */
export function diagnostiquer(
  visuel: { largeurMm?: number | null; hauteurMm?: number | null; largeurPx?: number | null; hauteurPx?: number | null },
  format: Format,
  avecFondPerdu = contientFondPerdu(visuel, format),
): { niveau: Niveau; message: string }[] {
  const messages: { niveau: Niveau; message: string }[] = [];
  const marge = avecFondPerdu ? format.fond_perdu_mm : 0;
  const zoneL = format.largeur_mm + 2 * marge;
  const zoneH = format.hauteur_mm + 2 * marge;
  const { largeurMm: vl, hauteurMm: vh, largeurPx, hauteurPx } = visuel;
  const recadre = (proportions: number) => Math.abs(proportions - zoneL / zoneH) / (zoneL / zoneH) > 0.03;
  if (vl && vh) {
    const taille = `${vl.toFixed(1)} × ${vh.toFixed(1)} mm`;
    if (format.fond_perdu_mm === 0) messages.push({ niveau: "ok", message: `Le visuel (${taille}) est imprimé bord à bord.` });
    else if (avecFondPerdu) messages.push({ niveau: "ok", message: `Le visuel (${taille}) contient le fond perdu.` });
    else messages.push({ niveau: "info", message: `Le visuel (${taille}) est au format fini : le fond perdu est complété à partir de ses bords.` });
    if (recadre(vl / vh)) messages.push({ niveau: "attention", message: "Les proportions du visuel diffèrent de la carte : il est recadré." });
  }
  if (largeurPx && hauteurPx) {
    const dpi = Math.round(Math.min(largeurPx / (zoneL / 25.4), hauteurPx / (zoneH / 25.4)));
    const pixels = `${largeurPx} × ${hauteurPx} px`;
    if (dpi >= 280) messages.push({ niveau: "ok", message: `Image de ${pixels} : environ ${dpi} dpi, parfait pour l'impression.` });
    else if (dpi >= 200) messages.push({ niveau: "info", message: `Image de ${pixels} : environ ${dpi} dpi, correct pour une imprimante de bureau.` });
    else messages.push({ niveau: "attention", message: `Image de ${pixels} : environ ${dpi} dpi, trop faible pour l'impression (300 dpi conseillés).` });
    if (format.fond_perdu_mm > 0 && !avecFondPerdu) messages.push({ niveau: "info", message: "Image au format fini : le fond perdu est complété à partir de ses bords." });
    if (recadre(largeurPx / hauteurPx)) messages.push({ niveau: "attention", message: "Les proportions de l'image diffèrent de la carte : elle est recadrée." });
  }
  return messages;
}

/** Messages sur un visuel destiné à l'écran : taille en pixels et proportions. */
export function diagnostiquerEcran(
  visuel: { largeurMm?: number | null; hauteurMm?: number | null; largeurPx?: number | null; hauteurPx?: number | null },
  format: Format,
): { niveau: Niveau; message: string }[] {
  const cible = format.px;
  if (!cible) return [];
  const messages: { niveau: Niveau; message: string }[] = [];
  const { largeurPx, hauteurPx, largeurMm, hauteurMm } = visuel;
  const recadre = (proportions: number) => Math.abs(proportions - cible.largeur / cible.hauteur) / (cible.largeur / cible.hauteur) > 0.03;
  if (largeurPx && hauteurPx) {
    const taille = `${largeurPx} × ${hauteurPx} px`;
    if (largeurPx >= cible.largeur && hauteurPx >= cible.hauteur) messages.push({ niveau: "ok", message: `Image de ${taille} : assez grande pour ce format.` });
    else messages.push({ niveau: "attention", message: `Image de ${taille}, plus petite que le format (${cible.largeur} × ${cible.hauteur} px) : elle sera agrandie, donc moins nette.` });
    if (recadre(largeurPx / hauteurPx)) messages.push({ niveau: "attention", message: "Les proportions de l'image diffèrent du format : elle est recadrée." });
  } else if (largeurMm && hauteurMm) {
    messages.push({ niveau: "ok", message: "Visuel vectoriel : net à toutes les tailles." });
    if (recadre(largeurMm / hauteurMm)) messages.push({ niveau: "attention", message: "Les proportions du visuel diffèrent du format : il est recadré." });
  }
  return messages;
}
