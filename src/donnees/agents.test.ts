import { describe, expect, it } from "vitest";
import modeleDemo from "../../src-tauri/ressources/demo/projet.json";
import type { ModeleCarte } from "../moteur";
import { agentBalises, balisesDuModele, construireAgent, ficheContact, liensAgent, remplir } from "./agents";
import { associer } from "./correspondances";
import { nettoyer } from "./nettoyage";
import { vcard } from "./vcard";

const modele = modeleDemo as ModeleCarte;

describe("nettoyage des valeurs", () => {
  it("met en forme noms et e-mails", () => {
    expect(nettoyer("  jean-baptiste ", "nom-propre")).toBe("Jean-Baptiste");
    expect(nettoyer("ÉLOÏSE", "nom-propre")).toBe("Éloïse");
    expect(nettoyer("Nkoulou   Mbarga", "majuscules")).toBe("NKOULOU MBARGA");
    expect(nettoyer("A.DIALLO@EXEMPLE.COM", "minuscules")).toBe("a.diallo@exemple.com");
    expect(nettoyer(undefined)).toBe("");
  });
});

describe("remplissage des textes", () => {
  it("efface la ligne entière quand ses balises sont vides", () => {
    expect(remplir("Tél. {{Fixe}}", { Fixe: "" })).toBe("");
    expect(remplir("Tél. {{Fixe}}", { Fixe: "0222334455" })).toBe("Tél. 0222334455");
  });

  it("ne laisse pas d'espace parasite quand une partie manque", () => {
    expect(remplir("{{Prénom}} {{NOM}}", { Prénom: "", NOM: "DIALLO" })).toBe("DIALLO");
  });
});

describe("construction d'un agent avec le modèle de démonstration", () => {
  const balises = balisesDuModele(modele);
  const colonnes = ["Matricule", "Prénom", "NOM", "Fonction", "Mobile", "Fixe", "E-mail"];
  const correspondances = associer(balises, colonnes);
  const agent = construireAgent(
    modele,
    {
      numero: 3,
      valeurs: {
        Matricule: "A002",
        Prénom: " aïssatou ",
        NOM: "Diallo",
        Fonction: "Responsable Communication",
        Mobile: "+237 612 34 56 78",
        Fixe: "",
        "E-mail": "A.DIALLO@EXEMPLE.COM",
      },
    },
    correspondances,
  );

  it("connaît les balises du modèle", () => {
    expect(balises).toEqual(["Prénom", "NOM", "Fonction", "Mobile", "Fixe", "Email"]);
    expect(correspondances.Email).toBe("E-mail");
  });

  it("produit le texte final de chaque champ", () => {
    expect(agent.id).toBe("ligne 3");
    expect(agent.valeurs).toEqual({
      c1: "Aïssatou DIALLO",
      c2: "Responsable Communication",
      c3: "Mob. +237 612 34 56 78",
      c4: "",
      c5: "a.diallo@exemple.com",
    });
  });

  it("prépare la vCard du QR code sans le téléphone fixe absent", () => {
    expect(agent.vcard).toContain("FN:Aïssatou DIALLO");
    expect(agent.vcard).toContain("TEL;TYPE=CELL:+237612345678");
    expect(agent.vcard).toContain("ORG:EXEMPLE SA");
    expect(agent.vcard).not.toContain("TYPE=WORK");
  });

  it("présente le modèle avec ses balises", () => {
    expect(agentBalises(modele).valeurs.c4).toBe("Tél. {{Fixe}}");
  });
});

describe("vCard", () => {
  it("échappe les caractères réservés et reste vide sans donnée de contact", () => {
    expect(vcard({ nom: "Dupont, Jean" })).toContain("FN:Dupont\\, Jean");
    expect(vcard({ organisation: "EXEMPLE SA" })).toBe("");
  });
});

describe("cartes numériques", () => {
  const valeurs = { Prénom: "Aïssatou", NOM: "DIALLO", Fonction: "Comptable", Mobile: "+237 612 34 56 78", Fixe: "", Email: "a.diallo@exemple.com" };

  it("rend cliquables le téléphone, l'e-mail et un site écrit en dur", () => {
    const avecSite: ModeleCarte = {
      ...modele,
      champs: [...modele.champs, { ...(modele.champs[0] as Extract<ModeleCarte["champs"][number], { type: "texte" }>), id: "site", modele: "www.exemple.cm" }],
    };
    expect(liensAgent(avecSite, valeurs)).toEqual({ c3: "tel:+237612345678", c5: "mailto:a.diallo@exemple.com", site: "https://www.exemple.cm" });
  });

  it("donne une fiche contact, même sans QR code dans le modèle", () => {
    const fiche = ficheContact({ ...modele, champs: modele.champs.filter((c) => c.type !== "qr") }, valeurs);
    expect(fiche).toContain("FN:Aïssatou DIALLO");
    expect(fiche).toContain("TITLE:Comptable");
    expect(fiche).toContain("TEL;TYPE=CELL:+237612345678");
    expect(ficheContact(modele, { Prénom: "", NOM: "" })).toBe("");
  });
});
