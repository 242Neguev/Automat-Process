import { describe, expect, it } from "vitest";
import type { ChampQr, ChampTexte } from "../moteur";
import { aimanter } from "./reperes";

const carte = { largeur_mm: 85, hauteur_mm: 55, fond_perdu_mm: 3 };
const fondTeams = { largeur_mm: 508, hauteur_mm: 285.75, fond_perdu_mm: 0, px: { largeur: 1920, hauteur: 1080 } };
const SEUIL = 0.8;

const texte = (id: string, x: number, y: number): ChampTexte => ({
  id,
  type: "texte",
  modele: "{{NOM}}",
  x_mm: x,
  y_mm: y,
  police: "Arial",
  graisse: 400,
  taille_pt: 10,
  couleur: { rgb: "#22252a" },
  interlettrage_em: 0,
  ancre: "start",
  largeur_max_mm: 30,
  taille_min_pt: 8,
  lignes_max: 1,
});
const qr = (x: number, y: number): ChampQr => ({ id: "q", type: "qr", x_mm: x, y_mm: y, taille_mm: 18, couleur: { rgb: "#22252a" } });

describe("repères magnétiques", () => {
  it("aligne le bord gauche sur celui d'une autre information", () => {
    const resultat = aimanter(texte("c2", 10, 40), 0.5, 0, [texte("c1", 10.3, 20)], carte, SEUIL);
    expect(resultat.dx).toBeCloseTo(0.3);
    expect(resultat.dy).toBe(0);
    expect(resultat.reperes).toEqual([{ axe: "x", position: 10.3 }]);
  });

  it("aligne les lignes de base de deux textes", () => {
    const resultat = aimanter(texte("c2", 50, 20.5), 0, 0, [texte("c1", 10, 20)], carte, SEUIL);
    expect(resultat.dy).toBeCloseTo(-0.5);
    expect(resultat.reperes).toEqual([{ axe: "y", position: 20 }]);
  });

  it("centre un QR code sur la carte", () => {
    const resultat = aimanter(qr(33.6, 5), 0, 0, [], carte, SEUIL);
    expect(resultat.dx).toBeCloseTo(-0.1);
    expect(resultat.reperes).toEqual([{ axe: "x", position: 42.5 }]);
  });

  it("n'attire pas au-delà du seuil", () => {
    // Bords à 14, 29 et 44 mm : à plus de 0,8 mm de ceux de l'autre texte et du centre (42,5 mm).
    const resultat = aimanter(texte("c2", 14, 40), 0, 0, [texte("c1", 10, 20)], carte, SEUIL);
    expect(resultat).toEqual({ dx: 0, dy: 0, reperes: [] });
  });

  it("s'aligne sur la zone de sécurité d'une carte, pas sur les bords d'un fond d'écran", () => {
    expect(aimanter(texte("c1", 3.5, 40), 0, 0, [], carte, SEUIL).dx).toBeCloseTo(-0.5);
    expect(aimanter(texte("c1", 3.5, 100), 0, 0, [], fondTeams, SEUIL).reperes).toEqual([]);
  });
});
