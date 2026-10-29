"""Contrôle technique d'un PDF produit : format, polices incorporées, couleurs (CMJN/RVB/gris), images matricielles."""
import sys
from collections import Counter

from pypdf import PdfReader
from pypdf.generic import ContentStream

NOMS = {1: "gris", 3: "RVB", 4: "CMJN"}

for chemin in sys.argv[1:]:
    pdf = PdfReader(chemin)
    polices, non_incorporees, couleurs, images, vus = set(), set(), Counter(), 0, set()

    def espace(ressources, nom):
        cs = (ressources.get("/ColorSpace") or {}).get(nom)
        if cs is None:
            return {"/DeviceCMYK": "CMJN", "/DeviceRGB": "RVB", "/DeviceGray": "gris"}.get(str(nom), str(nom))
        cs = cs.get_object()
        return NOMS.get(cs[1].get_object()["/N"], "?") if str(cs[0]) == "/ICCBased" else str(cs[0])

    def explorer(objet, ressources):
        global images
        ressources = (ressources or {})
        for f in (ressources.get("/Font") or {}).values():
            f = f.get_object()
            desc = f.get("/FontDescriptor") or (f["/DescendantFonts"][0].get_object().get("/FontDescriptor") if "/DescendantFonts" in f else None)
            desc = desc.get_object() if desc else {}
            (polices if any(k in desc for k in ("/FontFile", "/FontFile2", "/FontFile3")) else non_incorporees).add(str(f.get("/BaseFont")))
        courant = {"f": "gris", "s": "gris"}
        for operandes, op in ContentStream(objet, pdf).operations:
            if op in (b"k", b"K"):
                couleurs["CMJN"] += 1
            elif op in (b"rg", b"RG"):
                couleurs["RVB"] += 1
            elif op in (b"g", b"G"):
                couleurs["gris"] += 1
            elif op in (b"cs", b"CS"):
                courant["f" if op == b"cs" else "s"] = espace(ressources, operandes[0])
            elif op in (b"sc", b"scn", b"SC", b"SCN"):
                couleurs[courant["f" if op in (b"sc", b"scn") else "s"]] += 1
        for x in (ressources.get("/XObject") or {}).values():
            x = x.get_object()
            if id(x) in vus:
                continue
            vus.add(id(x))
            if x["/Subtype"] == "/Image":
                images += 1
            else:
                explorer(x, x.get("/Resources"))

    for page in pdf.pages:
        explorer(page.get_contents(), page.get("/Resources"))
    p = pdf.pages[0].mediabox
    print(f"{chemin}: {len(pdf.pages)} p. · {float(p.width) * 25.4 / 72:.0f}×{float(p.height) * 25.4 / 72:.0f} mm · "
          f"polices incorporées {len(polices)} (non incorporées : {len(non_incorporees)}) · "
          f"couleurs {dict(couleurs)} · images matricielles {images}")
