// Détection des balises {{…}} dans un visuel SVG. Le moteur SVG du navigateur intégré calcule
// les styles (classes CSS, héritage) et la position exacte de chaque texte ; les textes à balises
// deviennent des champs et sont retirés du visuel.
import type { ChampTexte } from "../moteur";
import { tailleSvg } from "./formats";

const MM_PAR_POINT = 25.4 / 72;
const BALISE = /\{\{[^}]+\}\}/;

/** Champ détecté, positionné en mm depuis le coin haut-gauche du visuel. */
export type ChampDetecte = Omit<ChampTexte, "id" | "largeur_max_mm" | "taille_min_pt" | "lignes_max">;

export interface AnalyseSvg {
  largeurMm: number;
  hauteurMm: number;
  champs: ChampDetecte[];
  /** Le SVG sans les textes à balises : c'est le fond de la carte. */
  svgNettoye: string;
}

/** « rgb(29, 53, 87) » → « #1d3557 ». */
function enHexa(couleur: string): string {
  const m = couleur.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return "#" + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

/**
 * Famille de police à utiliser : la première famille demandée qui est installée. Les noms
 * « techniques » d'Illustrator (« Montserrat-SemiBold ») sont ramenés à leur famille.
 */
export function choisirPolice(familleCss: string, installees: string[]): string {
  const demandees = familleCss.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const index = new Map(installees.map((f) => [f.toLowerCase(), f]));
  for (const nom of demandees) {
    const trouvee = index.get(nom.toLowerCase()) ?? index.get(nom.replace(/[-_]\w+$/, "").replace(/MT$/, "").toLowerCase());
    if (trouvee) return trouvee;
  }
  return demandees[demandees.length - 1]?.replace(/[-_]\w+$/, "") ?? "Arial";
}

export function analyserSvg(source: string, policesInstallees: string[]): AnalyseSvg {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Ce SVG est mal formé.");
  const racine = doc.documentElement;
  const viewBox = racine.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? null;
  const taille = tailleSvg(racine.getAttribute("width"), racine.getAttribute("height"), viewBox?.length === 4 ? viewBox : null);
  if (!taille) throw new Error("Impossible de connaître les dimensions de ce SVG (ni largeur, ni hauteur, ni viewBox).");

  // Un SVG détaché n'a ni styles calculés ni géométrie : on le mesure dans la page, invisible.
  const hote = document.createElement("div");
  hote.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const clone = document.importNode(racine, true) as unknown as SVGSVGElement;
  if (viewBox?.length === 4) {
    // 1 unité du dessin = 1 px : les mesures sont directement en unités du dessin.
    clone.setAttribute("width", String(viewBox[2]));
    clone.setAttribute("height", String(viewBox[3]));
  }
  hote.appendChild(clone);
  document.body.appendChild(hote);

  const champs: ChampDetecte[] = [];
  try {
    const textes = Array.from(clone.querySelectorAll("text"));
    const originaux = Array.from(racine.getElementsByTagName("text"));
    textes.forEach((texte, i) => {
      // textContent recolle les balises coupées en plusieurs <tspan> à l'export.
      const contenu = (texte.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!BALISE.test(contenu) || texte.getNumberOfChars() === 0) return;
      const style = getComputedStyle(texte);
      const matrice = texte.getCTM() ?? new DOMMatrix();
      const debut = texte.getStartPositionOfChar(0);
      const longueur = texte.getComputedTextLength();
      const ancre = style.textAnchor === "middle" ? "middle" : style.textAnchor === "end" ? "end" : "start";
      const xAncre = debut.x + (ancre === "middle" ? longueur / 2 : ancre === "end" ? longueur : 0);
      const point = new DOMPoint(xAncre, debut.y).matrixTransform(matrice);
      const echelle = Math.sqrt(Math.abs(matrice.a * matrice.d - matrice.b * matrice.c));
      const corpsPx = parseFloat(style.fontSize) || 10;
      const interlettrage = parseFloat(style.letterSpacing);
      champs.push({
        type: "texte",
        modele: contenu,
        x_mm: point.x * taille.mmParUniteDessin,
        y_mm: point.y * taille.mmParUniteDessin,
        police: choisirPolice(style.fontFamily, policesInstallees),
        graisse: Number(style.fontWeight) || (style.fontWeight === "bold" ? 700 : 400),
        taille_pt: (corpsPx * echelle * taille.mmParUniteDessin) / MM_PAR_POINT,
        couleur: { rgb: enHexa(style.fill) },
        interlettrage_em: Number.isFinite(interlettrage) ? interlettrage / corpsPx : 0,
        ancre,
      });
      originaux[i]?.remove();
    });
  } finally {
    hote.remove();
  }
  return { largeurMm: taille.largeurMm, hauteurMm: taille.hauteurMm, champs, svgNettoye: new XMLSerializer().serializeToString(doc) };
}
