"""Retrait « chirurgical » des balises d'un modèle PDF : PDFium localise les balises, puis on supprime
uniquement les opérateurs d'affichage de texte concernés dans le flux de contenu (le reste est intact,
CMJN compris)."""
import ctypes
import re
import sys

import pypdfium2 as pdfium
import pypdfium2.raw as raw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream

src, dst = sys.argv[1:3]

# 1. Localisation des balises avec PDFium
doc = pdfium.PdfDocument(src)
page = doc[0]
textpage = page.get_textpage()
zones = []
for obj in page.get_objects():
    if obj.type != raw.FPDF_PAGEOBJ_TEXT:
        continue
    n = raw.FPDFTextObj_GetText(obj.raw, textpage.raw, None, 0)
    buf = ctypes.create_string_buffer(n)
    raw.FPDFTextObj_GetText(obj.raw, textpage.raw, ctypes.cast(buf, ctypes.POINTER(ctypes.c_ushort)), n)
    if re.search(r"\{\{[^}]+\}\}", buf.raw[: n - 2].decode("utf-16-le")):
        zones.append(obj.get_bounds())  # (gauche, bas, droite, haut) en pt


def mult(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2],
            a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


# 2. Suppression ciblée des opérateurs Tj/TJ dont l'origine tombe dans une zone de balise
lecteur = PdfReader(src)
p = lecteur.pages[0]
flux = ContentStream(p.get_contents(), lecteur)
I = [1, 0, 0, 1, 0, 0]
ctm, pile, tm, tlm, interligne = I, [], I, I, 0
gardees, retirees = [], 0
for operandes, op in flux.operations:
    v = [float(x) for x in operandes] if op in (b"cm", b"Tm", b"Td", b"TD", b"TL") else None
    if op == b"q":
        pile.append(ctm)
    elif op == b"Q":
        ctm = pile.pop()
    elif op == b"cm":
        ctm = mult(v, ctm)
    elif op == b"BT":
        tm = tlm = I
    elif op == b"Tm":
        tm = tlm = v
    elif op in (b"Td", b"TD"):
        if op == b"TD":
            interligne = -v[1]
        tm = tlm = mult([1, 0, 0, 1, v[0], v[1]], tlm)
    elif op == b"TL":
        interligne = v[0]
    elif op == b"T*":
        tm = tlm = mult([1, 0, 0, 1, 0, -interligne], tlm)
    elif op in (b"Tj", b"TJ"):
        m = mult(tm, ctm)
        if any(g - 1 <= m[4] <= d + 1 and b - 1 <= m[5] <= h + 1 for g, b, d, h in zones):
            retirees += 1
            continue
    gardees.append((operandes, op))
flux.operations = gardees
ecrivain = PdfWriter(clone_from=lecteur)
ecrivain.pages[0].replace_contents(flux)
ecrivain.write(dst)
print(f"  {len(zones)} balises localisées, {retirees} opérateurs de texte retirés -> {dst}")
