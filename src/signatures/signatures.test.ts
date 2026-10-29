// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { genererSignature, lignesRendues, remplirHtml, texteSignature } from "./html";
import { balisesSignature, modeleParDefaut, type ModeleSignature } from "./modele";
import { nomsDeFichiers, pageAgent, pageRecapitulatif } from "./pages";

const valeurs = {
  Prénom: "Aïssatou",
  NOM: "DIALLO",
  Fonction: "Responsable Communication",
  Mobile: "+237 612 34 56 78",
  Fixe: "",
  Email: "a.diallo@exemple.com",
};

function modele(modifications: Partial<ModeleSignature> = {}): ModeleSignature {
  const m = modeleParDefaut();
  const lignes = m.lignes.map((ligne) =>
    ligne.role === "societe" ? { ...ligne, modele: "EAU SÈCHE" } : ligne.role === "site" ? { ...ligne, modele: "www.exemple.com" } : ligne,
  );
  return { ...m, lignes, ...modifications };
}

const LOGO = { donnees: "data:image/png;base64,iVBORw0KGgo=", largeur: 120, hauteur: 40, nomFichier: "logo.png" };

describe("signatures e-mail", () => {
  it("liste les balises du modèle", () => {
    expect(balisesSignature(modeleParDefaut())).toEqual(["Prénom", "NOM", "Fonction", "Mobile", "Fixe", "Email"]);
  });

  it("retire les lignes vides et crée les liens", () => {
    const lignes = lignesRendues(modele().lignes, valeurs);
    expect(lignes.map((l) => l.texte)).toEqual([
      "Aïssatou DIALLO",
      "Responsable Communication",
      "EAU SÈCHE",
      "Mob. +237 612 34 56 78",
      "a.diallo@exemple.com",
      "www.exemple.com",
    ]);
    expect(lignes.map((l) => l.lien).filter(Boolean)).toEqual(["tel:+237612345678", "mailto:a.diallo@exemple.com", "https://www.exemple.com"]);
  });

  it("produit un HTML compatible Outlook (tableaux, styles en ligne)", () => {
    const html = genererSignature(modele(), valeurs);
    expect(html.startsWith("<table cellpadding=\"0\"")).toBe(true);
    expect(html).toContain('<a href="tel:+237612345678" style="font-family:Arial, Helvetica, sans-serif;');
    expect(html).toContain("border-top:2px solid #1e6e72"); // filet de la mise en page classique
    expect(html).not.toContain("Tél.");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/class=|<style/);
  });

  it("intègre le logo, sauf dans la version pour Gmail", () => {
    const avecLogo = modele({ logo: LOGO });
    expect(genererSignature(avecLogo, valeurs)).toContain('<img src="data:image/png;base64,iVBORw0KGgo=" width="120" height="40" alt="EAU SÈCHE"');
    expect(genererSignature(avecLogo, valeurs, { sansLogo: true })).not.toContain("<img");
  });

  it("échappe les valeurs et gère l'arabe", () => {
    const html = genererSignature(modele(), { ...valeurs, NOM: "<b>DIALLO</b>", Fonction: "مديرة المشاريع" });
    expect(html).toContain("Aïssatou &lt;b&gt;DIALLO&lt;/b&gt;");
    expect(html).toContain('<span dir="rtl">مديرة المشاريع</span>');
  });

  it("propose trois mises en page", () => {
    const gauche = genererSignature(modele({ miseEnPage: "logo-gauche", logo: LOGO }), valeurs);
    expect(gauche).toContain("border-right:2px solid #1e6e72");
    const bandeau = genererSignature(modele({ miseEnPage: "bandeau" }), valeurs);
    expect(bandeau).toMatch(/<td bgcolor="#1e6e72"[^>]*>.*EAU SÈCHE.*·.*www\.exemple\.com/);
  });

  it("reprend une signature HTML existante", () => {
    const existante = `<html><head><style>p.MsoNormal{margin:0}</style></head><body>
      <p class=MsoNormal><b>{{<span class=SpellE>Prénom</span>}} {{NO</b><i>M}}</i></p>
      <p class=MsoNormal>Tél. {{Fixe}}</p>
      <p class=MsoNormal><a href="mailto:{{Email}}">{{Email}}</a></p>
      <p><img src="data:image/png;base64,AAAA"><img src="https://exemple.com/logo.png"></p>
    </body></html>`;
    const html = remplirHtml(existante, valeurs);
    expect(html.startsWith("<style>")).toBe(true);
    expect(html).toContain("<b>Aïssatou DIALLO</b>");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("Tél.");
    expect(html).toContain('<a href="mailto:a.diallo@exemple.com">a.diallo@exemple.com</a>');
    const gmail = remplirHtml(existante, valeurs, { sansLogo: true });
    expect(gmail).not.toContain("data:image");
    expect(gmail).toContain("https://exemple.com/logo.png");
    const source = modele({ source: "html", html: existante });
    expect(texteSignature(source, valeurs)).toBe("Aïssatou DIALLO\na.diallo@exemple.com");
  });

  it("donne une version texte", () => {
    expect(texteSignature(modele(), valeurs)).toBe(
      "Aïssatou DIALLO\nResponsable Communication\nEAU SÈCHE\nMob. +237 612 34 56 78\na.diallo@exemple.com\nwww.exemple.com",
    );
  });

  it("prépare les pages remises aux agents", () => {
    const html = genererSignature(modele({ logo: LOGO }), valeurs);
    const page = pageAgent({ nom: "Aïssatou DIALLO", html, htmlGmail: "<p>sans logo</p>", texte: "Aïssatou DIALLO", fichierLogo: "logo.png" });
    expect(page).toContain(`<div id="signature">${html}</div>`);
    expect(page).toContain("Copier pour Gmail (sans le logo)");
    expect(page).toContain("choisissez le fichier <b>logo.png</b>");
    const sansLogo = pageAgent({ nom: "X", html: "<p>x</p>", htmlGmail: null, texte: "x", fichierLogo: null });
    expect(sansLogo).not.toContain("Copier pour Gmail");
    expect(pageRecapitulatif("Équipe", [{ nom: "Aïssatou DIALLO", fichier: "Aïssatou DIALLO.html", email: "a@b.cm" }], null)).toContain(
      'href="A%C3%AFssatou%20DIALLO.html"',
    );
    expect(nomsDeFichiers(["Aïssatou DIALLO", "aïssatou diallo", "A/B"])).toEqual(["Aïssatou DIALLO.html", "aïssatou diallo (2).html", "A-B.html"]);
  });
});
