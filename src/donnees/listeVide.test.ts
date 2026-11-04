import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { associer } from "./correspondances";
import { lireFeuille, ouvrirClasseur } from "./liste";
import { classeurVide, FEUILLE_AIDE, FEUILLE_LISTE, LIGNES_PREPAREES } from "./listeVide";

describe("liste vide à remplir", () => {
  const colonnes = ["Prénom", "NOM", "Fonction", "Mobile", "Email"];
  const octets = classeurVide(colonnes, ["Mode d'emploi", "Une ligne par personne."]);

  it("a une colonne par information, sans ligne de données, et se relie d'office au modèle", () => {
    const classeur = ouvrirClasseur(octets.slice().buffer, "liste.xlsx");
    expect(classeur.SheetNames).toEqual([FEUILLE_LISTE, FEUILLE_AIDE]);
    const liste = lireFeuille(classeur, "liste.xlsx", FEUILLE_LISTE);
    expect(liste.colonnes).toEqual(colonnes);
    expect(liste.lignes).toEqual([]);
    expect(associer(colonnes, liste.colonnes)).toEqual(Object.fromEntries(colonnes.map((c) => [c, c])));
  });

  it("prépare des cellules au format texte : un numéro saisi garde ses zéros", () => {
    const classeur = XLSX.read(octets, { type: "array", cellNF: true, sheetStubs: true });
    const feuille = classeur.Sheets[FEUILLE_LISTE];
    expect(feuille.D2.z).toBe("@");
    expect(feuille[XLSX.utils.encode_cell({ r: LIGNES_PREPAREES, c: colonnes.length - 1 })].z).toBe("@");
  });

  it("accepte un modèle à une seule information", () => {
    const liste = lireFeuille(ouvrirClasseur(classeurVide(["NOM"], []).slice().buffer, "l.xlsx"), "l.xlsx", FEUILLE_LISTE);
    expect(liste.colonnes).toEqual(["NOM"]);
  });
});
