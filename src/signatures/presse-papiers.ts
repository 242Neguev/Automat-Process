// Copie d'une signature dans le presse-papiers, en HTML (mise en forme gardée au collage dans
// Outlook ou Gmail) et en texte brut.
import { textes } from "../textes";

export async function copierSignature(html: string, texte: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([texte], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  // Repli : sélection d'une copie invisible de la signature.
  const zone = document.createElement("div");
  zone.style.cssText = "position:fixed;left:-10000px;top:0";
  zone.innerHTML = html;
  document.body.appendChild(zone);
  const selection = window.getSelection();
  const plage = document.createRange();
  plage.selectNodeContents(zone);
  selection?.removeAllRanges();
  selection?.addRange(plage);
  try {
    if (!document.execCommand("copy")) throw new Error(textes.erreurs.copieRefusee);
  } finally {
    selection?.removeAllRanges();
    zone.remove();
  }
}
