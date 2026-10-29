// Import d'une signature HTML existante (fichier .htm enregistré par Outlook, ou page HTML) : ses
// images locales (dossier « …_fichiers » d'Outlook) sont intégrées pour voyager avec la signature.
import { dirname, join } from "@tauri-apps/api/path";
import { decoderTexte } from "../donnees/liste";
import { lireFichier } from "../moteur";
import { recollerBalises } from "./html";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };

function enDataUrl(octets: ArrayBuffer, nom: string): Promise<string> {
  const type = TYPES[nom.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(new Blob([octets], { type }));
  });
}

export interface SignatureImportee {
  html: string;
  imagesManquantes: string[];
  /** Des balises semblent coupées par la mise en forme (« {{NO<b>M}} »). */
  balisesCoupees: boolean;
}

export async function importerSignature(chemin: string): Promise<SignatureImportee> {
  const source = decoderTexte(new Uint8Array(await lireFichier(chemin, "signature")));
  const doc = new DOMParser().parseFromString(source, "text/html");
  recollerBalises(doc.body);

  const dossier = await dirname(chemin);
  const imagesManquantes: string[] = [];
  for (const image of Array.from(doc.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|cid:)/i.test(src)) continue;
    try {
      const relatif = decodeURIComponent(src.replace(/^file:\/\/\/?/i, "")).replace(/\\/g, "/");
      image.setAttribute("src", await enDataUrl(await lireFichier(await join(dossier, relatif), "image"), relatif));
    } catch {
      imagesManquantes.push(src);
    }
  }
  // Une balise encore coupée se lit dans le texte de la signature, mais dans aucun de ses morceaux.
  const compter = (texte: string) => (texte.match(/\{\{[^{}]+\}\}/g) ?? []).length;
  const parcours = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let entieres = 0;
  for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) entieres += compter((noeud as Text).data);
  return { html: doc.documentElement.outerHTML, imagesManquantes, balisesCoupees: compter(doc.body.textContent ?? "") > entieres };
}
