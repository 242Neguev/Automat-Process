import { describe, expect, it } from "vitest";
import type { ChampTexte, TexteLu } from "../moteur";
import { baliseLue, champDepuisTexteLu } from "./champs";

const format = { largeur_mm: 85, hauteur_mm: 55, fond_perdu_mm: 3 };
const lu: TexteLu = {
  id: 0,
  texte: "Jean DUPONT",
  xMm: 8.2,
  yMm: 24.6,
  largeurMm: 30.4,
  taillePt: 10.96,
  couleur: "#1d3557",
  zone: { x_mm: 8.2, y_mm: 21.8, largeur_mm: 30.4, hauteur_mm: 2.9 },
};

describe("textes lus dans une image", () => {
  it("reconnaissent les balises, même mal espacées par la lecture", () => {
    expect(baliseLue("{{NOM}}")).toBe("NOM");
    expect(baliseLue(" { {Prénom} } ")).toBe("Prénom");
    expect(baliseLue("{{ E-mail }}")).toBe("E-mail");
    expect(baliseLue("Tél. {{Fixe}}")).toBeNull();
    expect(baliseLue("NOM")).toBeNull();
  });

  it("deviennent une information au même endroit, à la même taille et dans la même couleur", () => {
    const champ = champDepuisTexteLu(lu, "{{Prénom}} {{NOM}}", format, [], ["Arial", "Calibri"]);
    expect(champ).toMatchObject({ type: "texte", modele: "{{Prénom}} {{NOM}}", x_mm: 8.2, y_mm: 24.6, taille_pt: 11, police: "Arial", ancre: "start" });
    expect(champ.couleur).toEqual({ rgb: "#1d3557" });
    // Toute la place jusqu'au bord droit (moins 4 mm), et une taille minimale pour les noms longs.
    expect(champ.largeur_max_mm).toBeCloseTo(72.8, 1);
    expect(champ.taille_min_pt).toBe(8.5);
  });

  it("prennent la police des informations déjà placées", () => {
    const existant = { ...champDepuisTexteLu(lu, "{{Fonction}}", format, [], []), police: "Montserrat", graisse: 600 } as ChampTexte;
    const champ = champDepuisTexteLu(lu, "{{NOM}}", format, [existant], ["Arial"]);
    expect(champ.police).toBe("Montserrat");
    expect(champ.graisse).toBe(600);
    expect(champ.id).not.toBe(existant.id);
  });
});
