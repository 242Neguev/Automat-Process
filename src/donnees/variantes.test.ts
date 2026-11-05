import { describe, expect, it } from "vitest";
import modeleDemo from "../../src-tauri/ressources/demo/projet.json";
import { nouvellePhoto, recadrageAuto } from "../modele/champs";
import { aUnVerso } from "../modele/visuels";
import type { ChampPhoto, ModeleCarte, PhotoChargee } from "../moteur";
import { agentBalises, balisesDuModele, cleRecadrage, construireAgent, varianteDe, type Photos } from "./agents";
import { associer } from "./correspondances";
import type { LigneListe } from "./liste";
import { empreinteCarte } from "./registre";

const demo = modeleDemo as ModeleCarte;
const photo: ChampPhoto = { id: "p1", type: "photo", x_mm: 5, y_mm: 10, largeur_mm: 24, hauteur_mm: 30, balise: "Photo", forme: "rectangle" };
const modele: ModeleCarte = {
  ...demo,
  champs: [...demo.champs, photo],
  variantes: {
    balise: "Filiale",
    valeurs: [
      { id: "v1", valeur: "Douala", fond_recto: "/fonds/2.png" },
      { id: "v2", valeur: "Côte d'Ivoire", fond_verso: "/fonds/3.png" },
    ],
  },
};
const ligne = (valeurs: Record<string, string>): LigneListe => ({ numero: 2, valeurs: { Prénom: "Aïssatou", NOM: "Diallo", ...valeurs } });
const correspondances = associer(balisesDuModele(modele), ["Prénom", "NOM", "Fonction", "Mobile", "Fixe", "E-mail", "Filiale", "Photo"]);

describe("variantes du modèle", () => {
  it("demandent leur colonne à l'étape Liste, comme la photo", () => {
    const balises = balisesDuModele(modele);
    expect(balises).toContain("Filiale");
    expect(balises).toContain("Photo");
    expect(correspondances.Filiale).toBe("Filiale");
    expect(correspondances.Photo).toBe("Photo");
  });

  it("choisissent la variante de chaque agent, sans tenir compte des accents ni de la casse", () => {
    expect(varianteDe(modele, ligne({ Filiale: "DOUALA" }), correspondances)).toBe(0);
    expect(varianteDe(modele, ligne({ Filiale: "cote d'ivoire" }), correspondances)).toBe(1);
    expect(varianteDe(modele, ligne({ Filiale: "Yaoundé" }), correspondances)).toBeUndefined();
    expect(varianteDe(modele, ligne({ Filiale: "" }), correspondances)).toBeUndefined();
    expect(varianteDe(demo, ligne({ Filiale: "Douala" }), correspondances)).toBeUndefined();
  });

  it("donnent un verso aux cartes dès qu'une variante en a un", () => {
    expect(aUnVerso({ ...modele, fond_verso: null })).toBe(true);
    expect(aUnVerso({ ...modele, fond_verso: null, variantes: undefined })).toBe(false);
  });

  it("se voient dans l'aperçu du modèle", () => {
    expect(agentBalises(modele, 1).variante).toBe(1);
    expect(agentBalises(modele)).not.toHaveProperty("variante");
  });
});

describe("photos des agents", () => {
  const chargee = (visage: PhotoChargee["visage"]): PhotoChargee => ({ nom: "adiallo", chemin: "/photos/1.jpg", largeurPx: 800, hauteurPx: 1000, visage, erreur: null });

  it("sont recadrées d'office sur le visage", () => {
    // Sans visage repéré : la photo couvre le cadre, centrée un peu au-dessus de son milieu.
    expect(recadrageAuto(photo, chargee(null))).toEqual({ centre_x: 0.5, centre_y: 0.4, zoom: 1 });
    // Petit visage, à droite : zoomé pour occuper la moitié du cadre, et centré sur lui.
    const r = recadrageAuto(photo, chargee({ x: 0.7, y: 0.3, hauteur: 0.2 }));
    expect(r.centre_x).toBe(0.7);
    expect(r.zoom).toBeGreaterThan(2);
    expect(r.centre_y).toBeGreaterThan(0.3);
    // Grand visage : jamais de zoom en deçà de 1 (la photo couvre toujours le cadre).
    expect(recadrageAuto(photo, chargee({ x: 0.5, y: 0.5, hauteur: 0.9 })).zoom).toBe(1);
  });

  it("accompagnent l'agent, avec le recadrage fait à la main s'il y en a un", () => {
    const photos: Photos = { chargees: new Map([["adiallo", chargee({ x: 0.5, y: 0.4, hauteur: 0.4 })]]), recadrages: {} };
    const agent = construireAgent(modele, ligne({ Photo: " adiallo ", Filiale: "Douala" }), correspondances, photos);
    expect(agent.variante).toBe(0);
    expect(agent.photos?.p1).toMatchObject({ chemin: "/photos/1.jpg", largeur_px: 800, hauteur_px: 1000, centre_x: 0.5 });
    const cle = cleRecadrage(photo, "adiallo");
    expect(agent.photos?.p1.cle).toBe(cle);
    // La clé du recadrage ne contient pas le nom de la photo.
    expect(cle).not.toContain("adiallo");
    const recadree = construireAgent(modele, ligne({ Photo: "adiallo" }), correspondances, { ...photos, recadrages: { [cle]: { centre_x: 0.2, centre_y: 0.6, zoom: 1.5 } } });
    expect(recadree.photos?.p1).toMatchObject({ centre_x: 0.2, centre_y: 0.6, zoom: 1.5 });
    // Photo absente de la liste, ou introuvable : pas de photo.
    expect(construireAgent(modele, ligne({ Photo: "" }), correspondances, photos).photos).toBeUndefined();
    expect(construireAgent(modele, ligne({ Photo: "inconnue" }), correspondances, photos).photos).toBeUndefined();
  });

  it("laissent intacte l'empreinte des cartes d'un modèle sans photo ni variante", () => {
    const sans = construireAgent(demo, ligne({}), correspondances);
    expect(sans).not.toHaveProperty("variante");
    expect(sans).not.toHaveProperty("photos");
    expect(empreinteCarte(construireAgent(demo, ligne({}), correspondances, { chargees: new Map(), recadrages: {} }))).toBe(empreinteCarte(sans));
  });

  it("ont un cadre aux proportions d'une photo d'identité", () => {
    const cadre = nouvellePhoto(demo);
    expect(cadre.type).toBe("photo");
    expect(cadre.largeur_mm / cadre.hauteur_mm).toBeCloseTo(0.8, 1);
    expect(cadre.y_mm + cadre.hauteur_mm).toBeLessThanOrEqual(demo.format.hauteur_mm);
  });
});
