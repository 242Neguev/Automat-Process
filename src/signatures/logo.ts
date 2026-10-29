// Logo intégré aux signatures : l'image choisie est réduite à la taille affichée (deux fois plus de
// pixels pour les écrans haute définition), pour garder une signature légère.
import type { LogoSignature } from "./modele";

/** Largeur maximale de l'image gardée comme source (px) : de quoi agrandir le logo sans perte. */
const SOURCE_MAX = 800;

function charger(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cette image est illisible."));
    image.src = url;
  });
}

/** Image redessinée en PNG à la largeur demandée (les proportions sont gardées). */
async function redessiner(url: string, largeur: number): Promise<{ donnees: string; largeur: number; hauteur: number }> {
  const image = await charger(url);
  const ratio = image.naturalHeight / image.naturalWidth || 1;
  const toile = document.createElement("canvas");
  toile.width = Math.max(1, Math.round(largeur));
  toile.height = Math.max(1, Math.round(largeur * ratio));
  const contexte = toile.getContext("2d");
  if (!contexte) throw new Error("Impossible de préparer le logo.");
  contexte.imageSmoothingQuality = "high";
  contexte.drawImage(image, 0, 0, toile.width, toile.height);
  return { donnees: toile.toDataURL("image/png"), largeur: toile.width, hauteur: toile.height };
}

/** Image d'origine (octets d'un PNG, JPG, GIF ou SVG) ramenée à une source raisonnable. */
export async function sourceDuLogo(octets: ArrayBuffer, nomFichier: string): Promise<string> {
  const type = /\.svg$/i.test(nomFichier) ? "image/svg+xml" : /\.jpe?g$/i.test(nomFichier) ? "image/jpeg" : /\.gif$/i.test(nomFichier) ? "image/gif" : "image/png";
  const url = URL.createObjectURL(new Blob([octets], { type }));
  try {
    const image = await charger(url);
    return (await redessiner(url, Math.min(SOURCE_MAX, image.naturalWidth || SOURCE_MAX))).donnees;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Logo à intégrer, affiché à `largeur` pixels. */
export async function preparerLogo(source: string, largeur: number, nomFichier: string): Promise<LogoSignature & { source: string }> {
  const nette = await redessiner(source, largeur * 2);
  return { donnees: nette.donnees, largeur, hauteur: Math.round(nette.hauteur / 2), nomFichier, source };
}
