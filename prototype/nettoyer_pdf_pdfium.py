"""Méthode NAÏVE, gardée pour démonstration : PDFium détecte bien les balises, mais en réécrivant la page
il perd les couleurs CMJN (voir nettoyer_pdf_cible.py pour la méthode retenue)."""
import ctypes
import re
import sys

import pypdfium2 as pdfium
import pypdfium2.raw as raw

src, dst = sys.argv[1:3]
pdf = pdfium.PdfDocument(src)
page = pdf[0]
textpage = page.get_textpage()
H = page.get_height()
a_retirer = []
for obj in page.get_objects():
    if obj.type != raw.FPDF_PAGEOBJ_TEXT:
        continue
    n = raw.FPDFTextObj_GetText(obj.raw, textpage.raw, None, 0)
    buf = ctypes.create_string_buffer(n)
    raw.FPDFTextObj_GetText(obj.raw, textpage.raw, ctypes.cast(buf, ctypes.POINTER(ctypes.c_ushort)), n)
    texte = buf.raw[: n - 2].decode("utf-16-le")
    if not re.search(r"\{\{[^}]+\}\}", texte):
        continue
    gauche, bas, droite, haut = obj.get_bounds()
    police = raw.FPDFTextObj_GetFont(obj.raw)
    nb = raw.FPDFFont_GetBaseFontName(police, None, 0)
    nom = ctypes.create_string_buffer(nb)
    raw.FPDFFont_GetBaseFontName(police, ctypes.cast(nom, ctypes.POINTER(ctypes.c_char)), nb)
    r, g, b, a = (ctypes.c_uint() for _ in range(4))
    raw.FPDFPageObj_GetFillColor(obj.raw, r, g, b, a)
    mm = 25.4 / 72
    print(f"  balise « {texte} » : x={gauche * mm:.1f} mm, haut={(H - haut) * mm:.1f} mm, police={nom.value.decode().split('+')[-1]}, "
          f"taille={obj.get_font_size():.1f} pt, couleur≈#{r.value:02x}{g.value:02x}{b.value:02x}")
    a_retirer.append(obj)
for obj in a_retirer:
    page.remove_obj(obj)
page.gen_content()
pdf.save(dst)
print(f"  {len(a_retirer)} balises retirées -> {dst}")
