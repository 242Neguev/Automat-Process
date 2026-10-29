import { describe, expect, it } from "vitest";
import { associer, normaliser } from "./correspondances";

describe("association des balises aux colonnes", () => {
  it("compare sans accents, casse ni ponctuation", () => {
    expect(normaliser("E-mail Professionnel")).toBe("emailprofessionnel");
    expect(normaliser("Prénom")).toBe(normaliser("PRENOM"));
  });

  it("associe par nom puis par synonyme", () => {
    const balises = ["Prénom", "NOM", "Email", "Mobile", "Fixe", "Fonction"];
    const colonnes = ["Matricule", "PRENOM", "Nom", "Courriel", "GSM", "Tél. bureau", "Poste"];
    expect(associer(balises, colonnes)).toEqual({
      Prénom: "PRENOM",
      NOM: "Nom",
      Email: "Courriel",
      Mobile: "GSM",
      Fixe: "Tél. bureau",
      Fonction: "Poste",
    });
  });

  it("n'associe jamais une colonne à deux balises et laisse l'inconnu à choisir", () => {
    expect(associer(["Email", "Mail", "Signature"], ["E-mail"])).toEqual({ Email: "E-mail", Mail: null, Signature: null });
  });
});
