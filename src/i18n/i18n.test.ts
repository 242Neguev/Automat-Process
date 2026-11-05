import { describe, expect, it } from "vitest";
import { traduireScript } from "../signatures/kit";
import scriptInstallation from "../signatures/kit/installer.ps1?raw";
import { en } from "./en";
import { fr } from "./fr";

/** Chemins de toutes les feuilles d'un dictionnaire, avec leur sorte (texte, fonction, liste…). */
function feuilles(valeur: unknown, chemin = ""): string[] {
  if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) {
    return Object.entries(valeur).flatMap(([cle, v]) => feuilles(v, chemin ? `${chemin}.${cle}` : cle));
  }
  // Un texte facultatif (null en français : rien à traduire) compte comme un texte.
  const sorte = Array.isArray(valeur) ? `liste de ${valeur.length}` : valeur === null ? "string" : typeof valeur;
  return [`${chemin} : ${sorte}`];
}

/** Tous les textes d'un dictionnaire, fonctions appelées avec des valeurs d'exemple. */
function tousLesTextes(valeur: unknown): string[] {
  if (typeof valeur === "string") return [valeur];
  if (typeof valeur === "function") {
    for (const exemple of [[2, 2, 2], ["X", 2, 2], [["X", "Y"]], [true, "logo.png"]]) {
      try {
        return tousLesTextes((valeur as (...args: unknown[]) => unknown)(...exemple));
      } catch {
        // Autres arguments.
      }
    }
    return [];
  }
  if (Array.isArray(valeur)) return valeur.flatMap(tousLesTextes);
  if (valeur && typeof valeur === "object") return Object.values(valeur).flatMap(tousLesTextes);
  return [];
}

// Noms propres et valeurs d'exemple qui restent tels quels dans les deux langues.
const PERMIS = /Eau sèche|Aïssatou|Français/;
const FRANCAIS = /[éèêàùçœ]|\b(le|la|les|des|du|une|est|sont|pour|avec|sans|cliquez|choisissez|modèle|carte|fichier)\b/i;

describe("traduction anglaise", () => {
  it("a exactement les mêmes textes que le français", () => {
    expect(feuilles(en)).toEqual(feuilles(fr));
  });

  it("ne laisse aucun texte en français", () => {
    const restes = tousLesTextes(en).filter((texte) => FRANCAIS.test(texte.replace(PERMIS, "")));
    expect(restes).toEqual([]);
  });

  it("traduit les messages du script du kit Outlook, sans toucher au reste", () => {
    const anglais = traduireScript(scriptInstallation, en.kit.textesScript);
    expect(anglais).toContain("Installing the signature '{0}' in Outlook");
    expect(anglais).not.toContain("Installation de la signature");
    expect(anglais).toContain("# --- Fin des textes ---");
    expect(anglais).toContain("Set-SignatureCompte");
    expect(traduireScript(scriptInstallation, fr.kit.textesScript)).toBe(scriptInstallation);
  });
});
