// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { apercuTexte, fusionnerCorps, lireXml, nomDuChamp, preparerModele, remplirModele, W } from "./docx";

const document = (corps: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:cols w:space="708"/></w:sectPr></w:body></w:document>`;

const run = (texte: string, gras = false) => `<w:r>${gras ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${texte}</w:t></w:r>`;
const champComplexe = (nom: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MERGEFIELD "${nom}" </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>«${nom}»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

const modele = {
  "[Content_Types].xml": `<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"/></Types>`,
  "word/document.xml": document(
    // Balise coupée par le correcteur de Word, puis NOM entier.
    `<w:p>${run("Madame {{Pré", true)}<w:proofErr w:type="spellStart"/>${run("nom")}${run("}} {{NOM}}")}</w:p>` +
      `<w:p><w:fldSimple w:instr=" MERGEFIELD Fonction \\* MERGEFORMAT ">${run("«Fonction»")}</w:fldSimple></w:p>` +
      `<w:p>${champComplexe("Adresse 2")}</w:p>` +
      `<w:p>${run("Page ")}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("1")}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
      `<w:tbl><w:tr><w:tc><w:p>${run("{{Adresse 2}}")}</w:p></w:tc></w:tr></w:tbl>` +
      `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Logo"/></wp:inline></w:drawing></w:r></w:p>`,
  ),
  "word/settings.xml": `<w:settings xmlns:w="${W}"><w:mailMerge><w:mainDocumentType w:val="formLetters"/></w:mailMerge><w:zoom w:percent="100"/></w:settings>`,
  "word/styles.xml": "<w:styles/>",
};

describe("courriers Word", () => {
  const prepare = preparerModele(modele);
  const valeurs = { Prénom: "Aïssatou", NOM: "DIALLO & Fils", Fonction: "Chef\nde projet", "Adresse 2": "" };

  it("reconnaît les champs de publipostage", () => {
    expect(nomDuChamp(' MERGEFIELD "Prénom" \\* MERGEFORMAT ')).toBe("Prénom");
    expect(nomDuChamp(" MERGEFIELD NOM ")).toBe("NOM");
    expect(nomDuChamp(" PAGE ")).toBeNull();
  });

  it("prépare le modèle : champs convertis, balises recollées, publipostage et modèle .dotx retirés", () => {
    expect(prepare.champsFusion).toBe(2);
    expect(prepare.balises).toEqual(["Prénom", "NOM", "Fonction", "Adresse 2"]);
    const doc = lireXml(prepare.parties["word/document.xml"]);
    const textes = Array.from(doc.getElementsByTagName("w:t")).map((t) => t.textContent);
    expect(textes.slice(0, 5)).toEqual(["Madame {{Prénom}}", "", " {{NOM}}", "{{Fonction}}", "{{Adresse 2}}"]);
    // Le champ PAGE est gardé.
    expect(prepare.parties["word/document.xml"]).toContain("PAGE");
    expect(prepare.parties["word/settings.xml"]).not.toContain("mailMerge");
    expect(prepare.parties["[Content_Types].xml"]).toContain("wordprocessingml.document.main+xml");
  });

  it("remplit un courrier : valeurs échappées, retours à la ligne, lignes vides retirées", () => {
    const xml = remplirModele(prepare.parties, valeurs)["word/document.xml"];
    expect(xml).toContain("Madame Aïssatou");
    expect(xml).toContain("DIALLO &amp; Fils");
    expect(xml).toMatch(/Chef<\/w:t><w:br\/><w:t xml:space="preserve">de projet/);
    expect(xml).not.toContain("{{");
    const doc = lireXml(xml);
    // Le paragraphe « Adresse 2 » disparaît ; celui de la cellule de tableau reste (il en faut un).
    expect(doc.getElementsByTagName("w:p").length).toBe(5);
    expect(doc.getElementsByTagName("w:tc")[0].getElementsByTagName("w:p").length).toBe(1);
    expect(lireXml(xml).documentElement.tagName).toBe("w:document");
  });

  it("donne un aperçu en texte", () => {
    expect(apercuTexte(prepare.parties, null)[0]).toEqual([
      { texte: "Madame ", sorte: "texte" },
      { texte: "{{Prénom}}", sorte: "balise" },
      { texte: " ", sorte: "texte" },
      { texte: "{{NOM}}", sorte: "balise" },
    ]);
    const lignes = apercuTexte(prepare.parties, valeurs).map((segments) => segments.map((s) => s.texte).join(""));
    // Les lignes dont les balises sont vides n'apparaissent pas (la dernière ne porte qu'une image).
    expect(lignes).toEqual(["Madame Aïssatou DIALLO & Fils", "Chef\nde projet", "Page 1", ""]);
  });

  it("fusionne les courriers, un par section numérotée à partir de 1", () => {
    const corps = [valeurs, { ...valeurs, Prénom: "Jean" }].map((v) => remplirModele(prepare.parties, v)["word/document.xml"]);
    const doc = lireXml(fusionnerCorps(corps));
    const textes = Array.from(doc.getElementsByTagName("w:t")).map((t) => t.textContent ?? "");
    expect(textes.filter((t) => t.startsWith("Madame"))).toEqual(["Madame Aïssatou", "Madame Jean"]);
    const sections = Array.from(doc.getElementsByTagName("w:sectPr"));
    expect(sections.length).toBe(2);
    expect(sections.every((s) => s.getElementsByTagName("w:pgNumType")[0]?.getAttribute("w:start") === "1")).toBe(true);
    // La numérotation est placée avant les colonnes (ordre imposé par Word).
    expect(Array.from(sections[1].children).map((e) => e.tagName)).toEqual(["w:pgSz", "w:pgNumType", "w:cols"]);
    expect(Array.from(doc.getElementsByTagName("wp:docPr")).map((e) => e.getAttribute("id"))).toEqual(["1", "10001"]);
  });
});
