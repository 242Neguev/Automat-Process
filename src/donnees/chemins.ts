// Chemins de fichiers, sous Windows (« \ ») comme ailleurs (« / »).

/** Nom du fichier ou du dossier, sans son dossier : « C:\Cartes\cartes.pdf » → « cartes.pdf ». */
export function nomDe(chemin: string): string {
  const morceaux = chemin.replace(/[\\/]+$/, "").split(/[\\/]/);
  return morceaux[morceaux.length - 1] || chemin;
}

/** Dossier qui contient le fichier : « C:\Cartes\cartes.pdf » → « C:\Cartes ». */
export function dossierDe(chemin: string): string {
  const propre = chemin.replace(/[\\/]+$/, "");
  const fin = Math.max(propre.lastIndexOf("\\"), propre.lastIndexOf("/"));
  if (fin < 0) return propre;
  // La racine d'un disque garde sa barre : « C:\cartes.pdf » → « C:\ ».
  return /^[A-Za-z]:$/.test(propre.slice(0, fin)) || fin === 0 ? propre.slice(0, fin + 1) : propre.slice(0, fin);
}

/** Extension en minuscules, sans le point : « Liste.XLSX » → « xlsx » ; « » s'il n'y en a pas. */
export function extensionDe(chemin: string): string {
  const nom = nomDe(chemin);
  const point = nom.lastIndexOf(".");
  return point > 0 ? nom.slice(point + 1).toLowerCase() : "";
}
