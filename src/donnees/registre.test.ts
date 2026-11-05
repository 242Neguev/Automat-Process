import { describe, expect, it } from "vitest";
import type { DonneesAgent } from "../moteur";
import type { LigneListe } from "./liste";
import { colonneQuantite, quantiteDe, quantitesDe, quantitesIllisibles, repeter } from "./quantite";
import { apresExport, empreinte, empreinteCarte, etatsCartes, identites, lireRegistre, nouvelIdentifiant } from "./registre";

const ligne = (numero: number, valeurs: Record<string, string>): LigneListe => ({ numero, valeurs });
const agent = (valeurs: Record<string, string>, vcard?: string): DonneesAgent => ({ id: "ligne 2", valeurs, vcard });

describe("empreintes", () => {
  it("sont stables, distinctes et ne contiennent pas le texte", () => {
    expect(empreinte("Aïssatou DIALLO")).toBe(empreinte("Aïssatou DIALLO"));
    expect(empreinte("Aïssatou DIALLO")).not.toBe(empreinte("Aissatou DIALLO"));
    expect(empreinte("Aïssatou DIALLO")).not.toContain("DIALLO");
  });

  it("d'une carte : seul compte ce qu'elle montre", () => {
    const carte = agent({ c1: "Aïssatou DIALLO", c2: "Comptable" }, "BEGIN:VCARD");
    // Ni l'ordre des clés, ni le numéro de ligne, ni les liens ne changent la carte.
    const memeCarte = { ...agent({ c2: "Comptable", c1: "Aïssatou DIALLO" }, "BEGIN:VCARD"), id: "ligne 9", liens: { c1: "tel:1" } };
    expect(empreinteCarte(memeCarte)).toBe(empreinteCarte(carte));
    expect(empreinteCarte(agent({ c1: "Aïssatou DIALLO", c2: "Directrice" }, "BEGIN:VCARD"))).not.toBe(empreinteCarte(carte));
    expect(empreinteCarte(agent({ c1: "Aïssatou DIALLO", c2: "Comptable" }))).not.toBe(empreinteCarte(carte));
  });

  it("d'une carte avec photo : le nom et le recadrage comptent, pas le chemin en mémoire", () => {
    const photo = (chemin: string, zoom = 1) => ({ chemin, largeur_px: 800, hauteur_px: 1000, cle: "p1:abc", centre_x: 0.5, centre_y: 0.4, zoom });
    const carte = (chemin: string, zoom?: number) => ({ ...agent({ c1: "Aïssatou DIALLO" }), photos: { p1: photo(chemin, zoom) } });
    expect(empreinteCarte(carte("/photos/3.jpg"))).toBe(empreinteCarte(carte("/photos/41.jpg")));
    expect(empreinteCarte(carte("/photos/3.jpg", 1.5))).not.toBe(empreinteCarte(carte("/photos/3.jpg")));
  });
});

describe("identité des agents d'une liste à l'autre", () => {
  it("par le matricule, sinon l'e-mail, sinon le nom", () => {
    const colonnes = ["Matricule", "Prénom", "NOM", "E-mail"];
    const [a, b] = identites([ligne(2, { Matricule: "A-12", Prénom: "Jean", NOM: "Dupont", "E-mail": "j@x.cm" })], colonnes).concat(
      identites([ligne(7, { Matricule: "a12", Prénom: "Jean-Marc", NOM: "DUPONT", "E-mail": "jm@x.cm" })], colonnes),
    );
    // Même matricule (au format près) : même agent, même si son nom a changé.
    expect(a).toBe(b);
    const sansMatricule = ["Prénom", "NOM", "Courriel"];
    const [c, d] = identites(
      [ligne(2, { Prénom: "Jean", NOM: "Dupont", Courriel: "J@X.CM" }), ligne(3, { Prénom: "Marie", NOM: "Dupont", Courriel: "" })],
      sansMatricule,
    );
    expect(c).toBe(identites([ligne(5, { Prénom: "Jean", NOM: "DUPONT", Courriel: "j@x.cm" })], sansMatricule)[0]);
    expect(d).toBe(identites([ligne(4, { Prénom: "MARIE", NOM: "dupont", Courriel: "" })], sansMatricule)[0]);
  });

  it("distingue deux homonymes par leur rang", () => {
    const [a, b] = identites([ligne(2, { NOM: "DIALLO" }), ligne(3, { NOM: "DIALLO" })], ["NOM"]);
    expect(a).not.toBe(b);
  });
});

describe("état des cartes et registre", () => {
  const cles = ["a", "b", "c"];
  const cartes = ["1", "2", "3"];

  it("tout est nouveau sans export précédent", () => {
    expect(etatsCartes(cles, cartes, undefined, "M")).toEqual(["nouvelle", "nouvelle", "nouvelle"]);
  });

  it("reconnaît les cartes nouvelles, modifiées et inchangées", () => {
    const registre = apresExport(null, "impression", "M", [
      { cle: "a", carte: "1" },
      { cle: "b", carte: "ancienne" },
    ]);
    const canal = registre.canaux.impression;
    expect(canal?.nombre).toBe(2);
    expect(etatsCartes(cles, cartes, canal, "M")).toEqual(["inchangee", "modifiee", "nouvelle"]);
    // Les cartes numériques ont leur propre registre.
    expect(registre.canaux.numerique).toBeUndefined();
  });

  it("refait toutes les cartes quand le modèle a changé", () => {
    const registre = apresExport(null, "impression", "M", [{ cle: "a", carte: "1" }]);
    expect(etatsCartes(cles, cartes, registre.canaux.impression, "M2")).toEqual(["modifiee", "nouvelle", "nouvelle"]);
    // Après un export avec le nouveau modèle, les cartes d'avant ne comptent plus.
    const ensuite = apresExport(registre, "impression", "M2", [{ cle: "b", carte: "2" }]);
    expect(ensuite.canaux.impression?.cartes).toEqual({ b: "2" });
  });

  it("complète le registre à chaque export", () => {
    const premier = apresExport(null, "numerique", "M", [{ cle: "a", carte: "1" }], new Date("2026-11-04T10:00:00Z"));
    const second = apresExport(premier, "numerique", "M", [{ cle: "b", carte: "2" }]);
    expect(second.canaux.numerique?.cartes).toEqual({ a: "1", b: "2" });
    expect(second.canaux.numerique?.nombre).toBe(1);
  });

  it("ignore un registre illisible", () => {
    expect(lireRegistre(null)).toBeNull();
    expect(lireRegistre({ version: 2, canaux: {} })).toBeNull();
    expect(lireRegistre(apresExport(null, "impression", "M", []))).not.toBeNull();
  });

  it("donne des identifiants de modèle uniques", () => {
    expect(nouvelIdentifiant()).toMatch(/^[0-9a-f]{24}$/);
    expect(nouvelIdentifiant()).not.toBe(nouvelIdentifiant());
  });
});

describe("quantités", () => {
  it("reconnaît la colonne à son intitulé", () => {
    expect(colonneQuantite(["NOM", "Qté", "Fonction"])).toBe("Qté");
    expect(colonneQuantite(["NOM", "Nb cartes"])).toBe("Nb cartes");
    expect(colonneQuantite(["NOM", "Fonction"])).toBeNull();
  });

  it("lit les quantités saisies dans Excel", () => {
    expect(quantiteDe("200")).toBe(200);
    expect(quantiteDe(" 1 000 ")).toBe(1000);
    expect(quantiteDe("100 cartes")).toBe(100);
    expect(quantiteDe("0")).toBe(0);
    expect(quantiteDe("")).toBeNull();
    expect(quantiteDe("beaucoup")).toBeNull();
    expect(quantiteDe("5000")).toBeNull();
  });

  it("fait une carte par défaut et répète chaque agent", () => {
    const lignes = [ligne(2, { Qté: "3" }), ligne(3, { Qté: "" }), ligne(4, { Qté: "0" }), ligne(5, { Qté: "?" })];
    expect(quantitesDe(lignes, null)).toEqual([1, 1, 1, 1]);
    const quantites = quantitesDe(lignes, "Qté");
    expect(quantites).toEqual([3, 1, 0, 1]);
    expect(repeter(["a", "b", "c", "d"], quantites)).toEqual(["a", "a", "a", "b", "d"]);
    expect(quantitesIllisibles(lignes, "Qté")).toEqual([5]);
  });
});
