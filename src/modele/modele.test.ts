import { describe, expect, it } from "vitest";
import type { ChampTexte, ModeleCarte } from "../moteur";
import { boiteChamp, changerAncre, INFORMATIONS, nouveauChampTexte, nouveauQr, reserverPlaceQr, transformationsParDefaut } from "./champs";
import { contientFondPerdu, diagnostiquer, FORMATS, placementVisuel, tailleSvg, versCarte } from "./formats";
import { choisirPolice } from "./svg";

const format = FORMATS[0]; // 85 × 55 mm, fond perdu de 3 mm

describe("taille physique d'un SVG", () => {
  it("lit les unités absolues", () => {
    expect(tailleSvg("91mm", "61mm", [0, 0, 257.95, 172.91])?.largeurMm).toBeCloseTo(91);
    expect(tailleSvg("3.5in", "2in", null)?.hauteurMm).toBeCloseTo(50.8);
  });

  it("reconnaît un export Illustrator (sans unité, en points)", () => {
    const taille = tailleSvg(null, null, [0, 0, 257.953, 172.913])!;
    expect(taille.largeurMm).toBeCloseTo(91, 1);
    expect(taille.mmParUniteDessin).toBeCloseTo(25.4 / 72);
  });

  it("reconnaît un export en pixels CSS (Figma, Inkscape)", () => {
    expect(tailleSvg("344px", "231px", [0, 0, 344, 231])?.largeurMm).toBeCloseTo(91, 0);
  });
});

describe("placement d'un visuel sur la carte", () => {
  it("devine si le visuel contient le fond perdu", () => {
    expect(contientFondPerdu({ largeurMm: 91, hauteurMm: 61 }, format)).toBe(true);
    expect(contientFondPerdu({ largeurMm: 85, hauteurMm: 55 }, format)).toBe(false);
    expect(contientFondPerdu({ largeurPx: 1075, hauteurPx: 720 }, format)).toBe(true); // 91 × 61 mm à 300 dpi
    expect(contientFondPerdu({ largeurPx: 1004, hauteurPx: 650 }, format)).toBe(false); // 85 × 55 mm à 300 dpi
  });

  it("un visuel avec fond perdu couvre exactement la carte", () => {
    expect(placementVisuel({ largeur: 91, hauteur: 61 }, format)).toEqual({ echelle: 1, decalageX: -3, decalageY: -3 });
    expect(versCarte({ x: 11, y: 26.8 }, { largeur: 91, hauteur: 61 }, format)).toMatchObject({ x: 8, y: 23.8 });
  });

  it("un visuel au format fini est posé tel quel dans la zone de coupe", () => {
    expect(placementVisuel({ largeur: 85, hauteur: 55 }, format, false)).toEqual({ echelle: 1, decalageX: 0, decalageY: 0 });
    expect(versCarte({ x: 10, y: 20 }, { largeur: 85, hauteur: 55 }, format, false)).toMatchObject({ x: 10, y: 20 });
  });
});

describe("diagnostic du visuel", () => {
  it("signale le fond perdu et la résolution", () => {
    expect(diagnostiquer({ largeurMm: 91, hauteurMm: 61 }, format)[0].niveau).toBe("ok");
    expect(diagnostiquer({ largeurMm: 85, hauteurMm: 55 }, format)[0].message).toContain("complété à partir de ses bords");
    expect(diagnostiquer({ largeurPx: 1075, hauteurPx: 720 }, format)[0].niveau).toBe("ok");
    expect(diagnostiquer({ largeurPx: 430, hauteurPx: 288 }, format)[0].niveau).toBe("attention");
  });
});

describe("champs de l'éditeur", () => {
  const vide: ModeleCarte = { nom: "Mon modèle", format, fond_recto: null, fond_verso: null, champs: [] };

  it("empile les nouveaux textes sous les précédents", () => {
    const nom = nouveauChampTexte(vide, INFORMATIONS[0]);
    const fonction = nouveauChampTexte({ ...vide, champs: [nom] }, INFORMATIONS[1]);
    expect(nom.id).toBe("c1");
    expect(fonction.id).toBe("c2");
    expect(fonction.y_mm).toBeGreaterThan(nom.y_mm);
    expect(fonction.lignes_max).toBe(2);
  });

  it("garde le bloc en place quand on change l'alignement", () => {
    const champ = nouveauChampTexte(vide, INFORMATIONS[2]);
    const centre = changerAncre(champ, "middle");
    expect(boiteChamp(centre).x).toBeCloseTo(boiteChamp(champ).x);
    expect(centre.x_mm).toBeCloseTo(champ.x_mm + champ.largeur_max_mm / 2);
  });

  it("place le QR code en haut à droite", () => {
    const qr = nouveauQr(vide);
    expect(qr.x_mm + qr.taille_mm).toBeLessThan(format.largeur_mm);
    expect(qr.vcard?.nom).toBe("{{NOM}}");
  });

  it("raccourcit les textes que le QR code chevaucherait, et seulement eux", () => {
    const nom = { ...nouveauChampTexte(vide, INFORMATIONS[0]), y_mm: 12 };
    const email = { ...nouveauChampTexte(vide, INFORMATIONS[4]), id: "c2", y_mm: 45 };
    const qr = nouveauQr({ ...vide, champs: [nom, email] });
    const [nomReduit, emailIntact] = reserverPlaceQr([nom, email], qr) as ChampTexte[];
    expect(nomReduit.x_mm + nomReduit.largeur_max_mm).toBeCloseTo(qr.x_mm - 2);
    expect(emailIntact.largeur_max_mm).toBe(email.largeur_max_mm);
  });
});

describe("polices et mises en forme par défaut", () => {
  it("retrouve la famille installée derrière un nom technique d'Illustrator", () => {
    expect(choisirPolice('"Arial-BoldMT", Arial', ["Arial", "Georgia"])).toBe("Arial");
    expect(choisirPolice("Montserrat-SemiBold", ["montserrat"])).toBe("montserrat");
    expect(choisirPolice("Inconnue-Bold", ["Arial"])).toBe("Inconnue");
  });

  it("propose MAJUSCULES, Nom Propre et minuscules selon la balise", () => {
    expect(transformationsParDefaut(["NOM", "Prénom", "E-mail", "Fonction"])).toEqual({ NOM: "majuscules", Prénom: "nom-propre", "E-mail": "minuscules" });
  });
});
