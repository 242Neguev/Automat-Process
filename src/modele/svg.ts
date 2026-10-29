// Textes d'un visuel SVG. Le moteur SVG du navigateur intégré calcule les styles (classes CSS,
// héritage) et la position exacte de chaque texte. Les textes à balises {{…}} deviennent des champs
// et sont retirés du visuel ; les autres sont des textes d'exemple que l'on peut remplacer d'un clic.
import type { TexteVisuel } from "../moteur";
import { tailleSvg } from "./formats";

const MM_PAR_POINT = 25.4 / 72;
const BALISE = /\{\{[^}]+\}\}/;

export interface AnalyseSvg {
  largeurMm: number;
  hauteurMm: number;
  /** Textes à balises, retirés du visuel. */
  balises: TexteVisuel[];
  /** Autres textes, numérotés dans l'ordre du SVG nettoyé. */
  textes: TexteVisuel[];
  /** Le SVG sans les textes à balises : c'est le fond de la carte. */
  svgNettoye: string;
}

/** « rgb(29, 53, 87) » → « #1d3557 ». */
function enHexa(couleur: string): string {
  const m = couleur.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return "#" + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

/** Clé de comparaison des noms de police : « Times New Roman » et « TimesNewRoman » se rejoignent. */
const clePolice = (nom: string) => nom.toLowerCase().replace(/[\s_-]/g, "");

/** Nom PostScript ramené à sa famille : « Arial-BoldMT » → « Arial », « TimesNewRomanPSMT » → « TimesNewRoman ». */
const famillePostScript = (nom: string) => nom.replace(/[-_][^-_]*$/, "").replace(/(PS)?MT$|PS$/, "");

/**
 * Famille de police à utiliser : la première famille demandée qui est installée. Les noms
 * « techniques » d'Illustrator ou des PDF (« Montserrat-SemiBold », « AvenirNext-Bold ») sont
 * ramenés à leur famille (« Montserrat », « Avenir Next »).
 */
export function choisirPolice(familleCss: string, installees: string[]): string {
  const demandees = familleCss.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const index = new Map(installees.map((f) => [clePolice(f), f]));
  for (const nom of demandees) {
    const trouvee = index.get(clePolice(nom)) ?? index.get(clePolice(famillePostScript(nom)));
    if (trouvee) return trouvee;
  }
  // Police absente de l'ordinateur : on garde son nom de famille lisible (« OpenSans-Bold » → « Open Sans »).
  const derniere = demandees[demandees.length - 1];
  return derniere ? famillePostScript(derniere).replace(/([a-z])([A-Z])/g, "$1 $2") : "Arial";
}

/** Graisse déduite d'un nom de police PostScript (« Arial-BoldMT » → 700). */
export function graisseDuNom(nom: string): number {
  const style = nom.split(/[-_,]/).slice(1).join(" ").toLowerCase();
  if (/black|heavy/.test(style)) return 900;
  if (/extrabold|ultrabold/.test(style)) return 800;
  if (/semibold|demibold|demi/.test(style)) return 600;
  if (/bold/.test(style)) return 700;
  if (/medium/.test(style)) return 500;
  if (/light/.test(style)) return 300;
  return 400;
}

/** Analyse un SVG ; il est mesuré dans la page, invisible, car un SVG détaché n'a ni styles ni géométrie. */
export function analyserSvg(source: string, policesInstallees: string[]): AnalyseSvg {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Ce SVG est mal formé.");
  const racine = doc.documentElement;
  const viewBox = racine.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? null;
  const taille = tailleSvg(racine.getAttribute("width"), racine.getAttribute("height"), viewBox?.length === 4 ? viewBox : null);
  if (!taille) throw new Error("Impossible de connaître les dimensions de ce SVG (ni largeur, ni hauteur, ni viewBox).");

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

  const balises: TexteVisuel[] = [];
  const textes: TexteVisuel[] = [];
  // Rang parmi les textes non vides qui restent dans le SVG nettoyé : c'est le numéro attendu par
  // retirerTexteSvg (un texte non affiché, dans <defs> par exemple, compte sans être proposé).
  let rang = 0;
  try {
    const elements = Array.from(clone.querySelectorAll("text"));
    const originaux = Array.from(racine.getElementsByTagName("text"));
    elements.forEach((element, i) => {
      // textContent recolle les balises coupées en plusieurs <tspan> à l'export.
      const contenu = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!contenu) return;
      if (element.getNumberOfChars() === 0) {
        rang++;
        return;
      }
      const style = getComputedStyle(element);
      const matrice = element.getCTM() ?? new DOMMatrix();
      const debut = element.getStartPositionOfChar(0);
      const longueur = element.getComputedTextLength();
      const ancre = style.textAnchor === "middle" ? "middle" : style.textAnchor === "end" ? "end" : "start";
      const xAncre = debut.x + (ancre === "middle" ? longueur / 2 : ancre === "end" ? longueur : 0);
      const point = new DOMPoint(xAncre, debut.y).matrixTransform(matrice);
      const echelle = Math.sqrt(Math.abs(matrice.a * matrice.d - matrice.b * matrice.c));
      const corpsPx = parseFloat(style.fontSize) || 10;
      const interlettrage = parseFloat(style.letterSpacing);
      const texte: TexteVisuel = {
        id: 0,
        texte: contenu,
        xMm: point.x * taille.mmParUniteDessin,
        yMm: point.y * taille.mmParUniteDessin,
        largeurMm: longueur * echelle * taille.mmParUniteDessin,
        taillePt: (corpsPx * echelle * taille.mmParUniteDessin) / MM_PAR_POINT,
        police: choisirPolice(style.fontFamily, policesInstallees),
        graisse: Number(style.fontWeight) || (style.fontWeight === "bold" ? 700 : 400),
        couleur: { rgb: enHexa(style.fill) },
        ancre,
        interlettrageEm: Number.isFinite(interlettrage) ? interlettrage / corpsPx : 0,
      };
      if (BALISE.test(contenu)) {
        balises.push({ ...texte, id: balises.length });
        originaux[i]?.remove();
      } else {
        textes.push({ ...texte, id: rang++ });
      }
    });
  } finally {
    hote.remove();
  }
  return { largeurMm: taille.largeurMm, hauteurMm: taille.hauteurMm, balises, textes, svgNettoye: new XMLSerializer().serializeToString(doc) };
}

/** Le SVG sans son n-ième texte (numérotation des textes d'exemple d'analyserSvg). */
export function retirerTexteSvg(source: string, id: number): string {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const nonVides = Array.from(doc.getElementsByTagName("text")).filter((t) => (t.textContent ?? "").trim() !== "");
  nonVides[id]?.remove();
  return new XMLSerializer().serializeToString(doc);
}
