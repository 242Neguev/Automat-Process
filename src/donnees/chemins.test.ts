import { describe, expect, it } from "vitest";
import { dossierDe, extensionDe, nomDe } from "./chemins";

describe("chemins", () => {
  it("sépare le nom et le dossier, sous Windows comme ailleurs", () => {
    expect(nomDe("C:\\Cartes\\Octobre\\cartes.pdf")).toBe("cartes.pdf");
    expect(dossierDe("C:\\Cartes\\Octobre\\cartes.pdf")).toBe("C:\\Cartes\\Octobre");
    expect(nomDe("/Users/aline/Documents/planches.pdf")).toBe("planches.pdf");
    expect(dossierDe("/Users/aline/Documents/planches.pdf")).toBe("/Users/aline/Documents");
  });

  it("garde la barre de la racine et ignore la barre finale d'un dossier", () => {
    expect(dossierDe("C:\\cartes.pdf")).toBe("C:\\");
    expect(dossierDe("/cartes.pdf")).toBe("/");
    expect(nomDe("C:\\Signatures\\Signatures - Direction\\")).toBe("Signatures - Direction");
    expect(dossierDe("C:\\Signatures\\Signatures - Direction\\")).toBe("C:\\Signatures");
  });

  it("donne l'extension en minuscules", () => {
    expect(extensionDe("D:\\RH\\Liste du personnel.XLSX")).toBe("xlsx");
    expect(extensionDe("modele.carte.automat")).toBe("automat");
    expect(extensionDe("C:\\dossier.v2\\sans extension")).toBe("");
    expect(extensionDe(".masque")).toBe("");
  });
});
