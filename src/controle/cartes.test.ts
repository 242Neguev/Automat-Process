import { describe, expect, it } from "vitest";
import type { ChampTexte, DonneesAgent, MesureTexte, ModeleCarte } from "../moteur";
import { analyser, cartesDuBat, casLesPlusLongs, compter, libelleChamp, regrouper } from "./cartes";

const texte = (id: string, modele: string, y_mm: number): ChampTexte => ({
  id,
  type: "texte",
  modele,
  x_mm: 8,
  y_mm,
  police: "Arial",
  graisse: 400,
  taille_pt: 11,
  couleur: { rgb: "#000000" },
  interlettrage_em: 0,
  ancre: "start",
  largeur_max_mm: 50,
  taille_min_pt: 8,
  lignes_max: 2,
});

const modele: ModeleCarte = {
  nom: "Test",
  format: { largeur_mm: 85, hauteur_mm: 55, fond_perdu_mm: 3 },
  fond_recto: null,
  fond_verso: null,
  champs: [
    texte("c1", "{{Prénom}} {{NOM}}", 20),
    texte("c2", "{{Fonction}}", 25),
    texte("c3", "{{Email}}", 30),
    { id: "qr", type: "qr", x_mm: 60, y_mm: 10, taille_mm: 18, couleur: { rgb: "#000000" } },
  ],
};

const agent = (id: string, avecQr: boolean): DonneesAgent => ({ id, valeurs: {}, vcard: avecQr ? "BEGIN:VCARD" : undefined });

/** Mesure d'un texte bien placé, à modifier au besoin. */
const mesure = (agent: string, champ: string, base: number, autres: Partial<MesureTexte> = {}): MesureTexte => ({
  agent,
  champ,
  taille: 11,
  origine: 11,
  lignes: 1,
  deborde: false,
  gauche: 8,
  droite: 40,
  haut: base - 3,
  bas: base + 1,
  base,
  ...autres,
});

const agents = [agent("a1", true), agent("a2", true), agent("a3", false)];
const mesures = [
  // a1 : tout va bien.
  mesure("a1", "c1", 20),
  mesure("a1", "c2", 25),
  mesure("a1", "c3", 30),
  // a2 : nom trop long qui passe sous le QR code ; fonction sur 2 lignes qui touche le nom ; e-mail repoussé
  // hors de la zone de sécurité.
  mesure("a2", "c1", 20, { taille: 8, deborde: true, droite: 62 }),
  mesure("a2", "c2", 29, { lignes: 2, haut: 20.5 }),
  mesure("a2", "c3", 51, { bas: 52.5 }),
  // a3 : même nom sous la zone du QR code, mais a3 n'a pas de fiche contact ; seulement réduit.
  mesure("a3", "c1", 20, { taille: 9, droite: 62 }),
];

describe("rapport de contrôle des cartes", () => {
  const rapport = analyser(modele, agents, mesures);

  it("nomme les informations par leurs balises", () => {
    expect(libelleChamp(texte("x", "{{Prénom}} {{NOM}}", 0))).toBe("Prénom NOM");
    expect(libelleChamp(texte("x", "Mob. {{Mobile}}", 0))).toBe("Mobile");
    expect(libelleChamp(texte("x", "EAU SÈCHE", 0))).toBe("EAU SÈCHE");
  });

  it("ne signale rien sur une carte correcte", () => {
    expect(rapport.get("a1")).toEqual([]);
  });

  it("classe les problèmes du plus grave au moins grave", () => {
    const problemes = rapport.get("a2")!;
    expect(problemes.map((p) => p.type)).toEqual(["deborde", "chevauche-qr", "hors-zone", "chevauche", "descend", "lignes"]);
    expect(problemes[0].message).toBe("« Prénom NOM » est trop long : il dépasse même réduit à 8 pt.");
    expect(problemes.find((p) => p.type === "descend")!.message).toContain("21 mm plus bas que prévu");
  });

  it("ne parle pas de zone de sécurité pour un visuel d'écran, qui n'est pas coupé", () => {
    const ecran = { ...modele, format: { ...modele.format, fond_perdu_mm: 0, px: { largeur: 321, hauteur: 208 } } };
    const types = analyser(ecran, agents, mesures).get("a2")!.map((p) => p.type);
    expect(types).not.toContain("hors-zone");
    expect(types).toContain("deborde");
  });

  it("ne tient compte du QR code que si l'agent en a un", () => {
    expect(rapport.get("a3")!.map((p) => p.message)).toEqual(["« Prénom NOM » est réduit à 9 pt (au lieu de 11 pt) pour tenir."]);
  });

  it("résume par gravité et par problème", () => {
    expect(compter(rapport)).toEqual({ erreur: 1, attention: 0, info: 1 });
    const groupes = regrouper(rapport);
    expect(groupes[0]).toMatchObject({ type: "deborde", resume: "« Prénom NOM » trop long, même réduit", agents: ["a2"] });
    expect(groupes[groupes.length - 1].gravite).toBe("info");
  });

  it("trouve le cas le plus long de chaque information", () => {
    expect(casLesPlusLongs(modele, mesures)).toEqual([
      { champ: "c1", libelle: "Prénom NOM", agent: "a2" },
      { champ: "c2", libelle: "Fonction", agent: "a2" },
      { champ: "c3", libelle: "Email", agent: "a1" },
    ]);
  });

  it("choisit les cartes du bon à tirer", () => {
    const ids = (choix: "cas" | "premiere" | "toutes", m = mesures) => cartesDuBat(choix, modele, agents, m).map((a) => a.id);
    expect(ids("cas")).toEqual(["a1", "a2"]); // la première, et a2 qui a les cas les plus longs
    expect(ids("premiere")).toEqual(["a1"]);
    expect(ids("toutes")).toEqual(["a1", "a2", "a3"]);
    expect(ids("cas", null as never)).toEqual(["a1"]); // sans contrôle : la première seulement
  });
});
