import { describe, expect, it } from "vitest";
import { construireKit, dossierImages, extraireImages } from "./kit";

const LOGO = "data:image/png;base64,iVBORw0KGgo=";
const agent = (nom: string, email: string) => ({ nom, email, html: `<table><tr><td>${nom}</td></tr><tr><td><img src="${LOGO}" width="120"></td></tr></table>`, texte: `${nom}\n${email}` });

describe("kit Outlook", () => {
  it("transforme les images intégrées en fichiers, une seule fois chacune", () => {
    const { html, images } = extraireImages(`<img src="${LOGO}"><img src="${LOGO}"><img src="data:image/jpeg;base64,/9j/4AAQ">`, "Ma%20signature_fichiers/");
    expect(html).toBe('<img src="Ma%20signature_fichiers/image001.png"><img src="Ma%20signature_fichiers/image001.png"><img src="Ma%20signature_fichiers/image002.jpg">');
    expect(images.map((i) => i.nom)).toEqual(["image001.png", "image002.jpg"]);
    expect(images[0].octets.slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]); // en-tête PNG
  });

  it("prépare un kit commun : signatures, script, lanceur et mode d'emploi", () => {
    const fichiers = construireKit("Signature : Eau sèche", [agent("Aïssatou DIALLO", "a.diallo@exemple.com"), agent("Jean DUPONT", "j.dupont@exemple.com")]);
    const noms = fichiers.map((f) => f.nom);
    expect(noms).toEqual([
      "signatures/001/signature.htm",
      "signatures/001/signature.txt",
      "signatures/001/images/image001.png",
      "signatures/002/signature.htm",
      "signatures/002/signature.txt",
      "signatures/002/images/image001.png",
      "kit.json",
      "installer.ps1",
      "Installer ma signature.cmd",
      "LISEZMOI.txt",
    ]);
    const texte = (nom: string) => (fichiers.find((f) => f.nom === nom) as { texte: string }).texte;
    // Le nom de la signature devient un nom de fichier valide sous Windows ; celui du dossier des images
    // ne garde que des lettres ASCII.
    expect(JSON.parse(texte("kit.json"))).toEqual({
      signature: "Signature - Eau sèche",
      images: "Signature-Eau-seche_fichiers",
      agents: [
        { numero: 1, nom: "Aïssatou DIALLO", email: "a.diallo@exemple.com", dossier: "001" },
        { numero: 2, nom: "Jean DUPONT", email: "j.dupont@exemple.com", dossier: "002" },
      ],
    });
    expect(texte("signatures/001/signature.htm")).toContain('src="Signature-Eau-seche_fichiers/image001.png"');
    expect(texte("installer.ps1").startsWith("﻿")).toBe(true);
    expect(texte("installer.ps1")).toContain("\r\n");
    expect(texte("Installer ma signature.cmd")).toContain('-File "%~dp0installer.ps1"');
    const txt = (fichiers.find((f) => f.nom === "signatures/001/signature.txt") as { octets: number[] }).octets;
    expect(txt.slice(0, 4)).toEqual([0xff, 0xfe, 0x41, 0x00]); // UTF-16 : marque, puis « A »
  });

  it("nomme le dossier des images sans accents ni caractères spéciaux", () => {
    expect(dossierImages("Société Générale – Siège")).toBe("Societe-Generale-Siege_fichiers");
    expect(dossierImages("توقيع")).toBe("signature_fichiers"); // aucun caractère latin
  });
});
