import { describe, expect, it } from "vitest";
import { genreDe, router } from "./fichiersDeposes";

describe("fichiers déposés", () => {
  it("reconnaît chaque sorte de fichier à son extension", () => {
    expect(genreDe("C:\\Projets\\Cartes Direction.automat")).toBe("projet");
    expect(genreDe("D:\\RH\\Liste du personnel.XLSX")).toBe("liste");
    expect(genreDe("agents.csv")).toBe("liste");
    expect(genreDe("Convocation.docx")).toBe("word");
    expect(genreDe("Carte recto.PDF")).toBe("visuel");
    expect(genreDe("fond Teams.jpeg")).toBe("visuel");
    expect(genreDe("installer.exe")).toBe("inconnu");
    expect(genreDe("sans extension")).toBe("inconnu");
  });

  it("ouvre un projet dans son module, avant tout le reste", () => {
    expect(router(["liste.xlsx", "C:\\Cartes.automat"], "word")).toEqual({ genre: "projet", chemin: "C:\\Cartes.automat" });
  });

  it("envoie un courrier Word au module Word, avec la liste déposée en même temps", () => {
    expect(router(["Courrier.docx", "liste.xlsx", "logo.png"], "cartes")).toEqual({ genre: "module", module: "word", chemins: ["Courrier.docx", "liste.xlsx"] });
  });

  it("donne un visuel au module affiché s'il en prend un, sinon demande lequel", () => {
    expect(router(["recto.pdf", "liste.xlsx"], "cartes")).toEqual({ genre: "module", module: "cartes", chemins: ["recto.pdf", "liste.xlsx"] });
    expect(router(["fond.png"], "numerique")).toEqual({ genre: "module", module: "numerique", chemins: ["fond.png"] });
    expect(router(["recto.pdf"], "signatures")).toEqual({ genre: "choix", modules: ["cartes", "numerique"], chemins: ["recto.pdf"] });
    expect(router(["recto.pdf"], "accueil")).toEqual({ genre: "choix", modules: ["cartes", "numerique"], chemins: ["recto.pdf"] });
  });

  it("donne une liste seule au module affiché ; depuis l'accueil, demande pour quel document", () => {
    expect(router(["liste.xlsx"], "signatures")).toEqual({ genre: "module", module: "signatures", chemins: ["liste.xlsx"] });
    expect(router(["liste.xlsx"], "accueil")).toEqual({ genre: "choix", modules: ["cartes", "signatures", "numerique", "word"], chemins: ["liste.xlsx"] });
  });

  it("laisse de côté ce qu'il ne sait pas lire", () => {
    expect(router(["setup.exe", "notes.zip"], "cartes")).toEqual({ genre: "inconnu" });
    expect(router(["setup.exe", "liste.csv"], "word")).toEqual({ genre: "module", module: "word", chemins: ["liste.csv"] });
  });
});
