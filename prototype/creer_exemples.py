"""Crée les fichiers d'exemple du prototype : un Excel « réaliste » et un modèle SVG façon Illustrator."""
import pathlib
import sys

from openpyxl import Workbook

out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)

# --- Excel : numéros stockés comme nombres + format personnalisé, espaces parasites, casse incohérente
wb = Workbook()
ws = wb.active
ws.title = "Agents"
ws.append(["Matricule", "Prénom", "NOM", "Fonction", "Mobile", "Fixe", "E-mail"])
rows = [
    ("A001", "Jean-Baptiste", "Nkoulou Mbarga", "Directeur Adjoint des Ressources Humaines et de la Formation", 699123456, 222334455, "jb.nkoulou@exemple.com"),
    ("A002", " Aïssatou ", "DIALLO", "Responsable Communication", 612345678, None, "A.DIALLO@EXEMPLE.COM"),
    ("A003", "Éloïse", "martin", "Chargée de clientèle", 698765432, 222110099, "eloise.martin@exemple.com"),
    ("A004", "Kouamé", "Koffi", "Comptable", 677001122, None, "k.koffi@exemple.com"),
    ("A005", "Marie-Claire", "Nguema Ondo", "Assistante de Direction", 655443322, 222556677, "mc.nguema@exemple.com"),
    ("A006", "Ahmed", "Benali", "Technicien Réseaux & Télécoms", "06 90 90 90 90", None, "a.benali@exemple.com"),
]
for r in rows:
    ws.append(list(r))
for (mobile, fixe) in ws.iter_rows(min_row=2, min_col=5, max_col=6):
    mobile.number_format = '"+237 "000 00 00 00'
    fixe.number_format = "0000000000"
wb.save(out / "agents.xlsx")

# --- Modèle SVG imitant un export Illustrator : unités en pt, styles CSS, noms PostScript,
#     et une balise coupée en deux <tspan> (crénage), cas réel fréquent.
W, H = 257.953, 172.913  # 91 x 61 mm (85 x 55 + 3 mm de fond perdu) en points
svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg id="Calque_1" data-name="Calque 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <defs>
    <style>
      .cls-1{{fill:#fff;}}
      .cls-2{{fill:#1d3557;}}
      .cls-3{{fill:#e76f51;}}
      .cls-4{{font-size:11px;font-family:Arial-BoldMT, Arial;font-weight:700;fill:#1d3557;}}
      .cls-5{{font-size:7.5px;font-family:ArialMT, Arial;fill:#e76f51;}}
      .cls-6{{letter-spacing:-.01em;}}
      .cls-7{{font-size:7px;font-family:ArialMT, Arial;fill:#333;}}
      .cls-8{{font-size:6px;font-family:Arial-BoldMT, Arial;font-weight:700;fill:#fff;letter-spacing:.08em;}}
      .cls-9{{font-size:9px;font-family:Arial-BoldMT, Arial;font-weight:700;fill:#1d3557;letter-spacing:.05em;}}
    </style>
  </defs>
  <rect class="cls-1" width="{W}" height="{H}"/>
  <rect class="cls-2" y="{H - 34}" width="{W}" height="34"/>
  <rect class="cls-3" x="31.2" y="{H - 37}" width="60" height="3"/>
  <circle class="cls-2" cx="40" cy="37" r="9"/>
  <circle class="cls-3" cx="44" cy="33" r="4"/>
  <text class="cls-9" transform="translate(54 40.3)">EXEMPLE SA</text>
  <text class="cls-4" transform="translate(31.2 76)">{{{{Prénom}}}} {{{{NOM}}}}</text>
  <text class="cls-5" transform="translate(31.2 88)"><tspan x="0" y="0">{{{{Fon</tspan><tspan class="cls-6" x="17.6" y="0">ction}}}}</tspan></text>
  <text class="cls-7" transform="translate(31.2 104)">Mob. {{{{Mobile}}}}</text>
  <text class="cls-7" transform="translate(31.2 113)">Tél. {{{{Fixe}}}}</text>
  <text class="cls-7" transform="translate(31.2 122)">{{{{Email}}}}</text>
  <text class="cls-8" transform="translate(31.2 {H - 16})">WWW.EXEMPLE.COM  ·  YAOUNDÉ · DOUALA · ABIDJAN</text>
</svg>
"""
(out / "recto.svg").write_text(svg, encoding="utf-8")
print("ok", out)
