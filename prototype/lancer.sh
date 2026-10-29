#!/usr/bin/env bash
# Rejoue tout le prototype. Prérequis : Python 3 (+ requirements.txt), Node 20+, Typst 0.15 (commande « typst »).
set -euo pipefail
cd "$(dirname "$0")"
TYPST="${TYPST:-typst}"
PY="${PYTHON:-python3}"

[ -d node_modules ] || npm install --no-fund --no-audit
mkdir -p build out

echo "== 1. Exemples : Excel d'agents, modèle SVG façon Illustrator, verso et modèle PDF en CMJN"
"$PY" creer_exemples.py assets
"$TYPST" compile verso.typ build/verso.pdf
"$TYPST" compile modele-pdf.typ build/modele.pdf

echo "== 2. Analyse du modèle, lecture de l'Excel, correspondances, QR codes"
node preparer.mjs assets build 1

echo "== 3. Rendu : cartes unitaires (PDF + PNG 300 dpi) et planches recto/verso A4 et SRA3"
"$TYPST" compile cartes.typ out/cartes.pdf --input mode=cartes
"$TYPST" compile cartes.typ "out/carte-{0p}.png" --input mode=cartes --ppi 300
"$TYPST" compile cartes.typ out/planches-A4.pdf --input mode=planches --input feuille=A4
"$TYPST" compile cartes.typ out/planches-SRA3.pdf --input mode=planches --input feuille=SRA3

echo "== 4. Rapport de contrôle (textes réduits, passés sur 2 lignes ou qui débordent)"
"$TYPST" eval 'query(<controle>).map(it => it.value).filter(c => c.taille < c.origine or c.lignes > 1 or c.deborde)' \
  --in cartes.typ --input mode=cartes

echo "== 5. Modèle PDF : retrait des balises, méthode naïve (PDFium) puis méthode ciblée"
"$PY" nettoyer_pdf_pdfium.py build/modele.pdf build/modele-fond-pdfium.pdf
"$PY" nettoyer_pdf_cible.py build/modele.pdf build/modele-fond-cible.pdf
"$TYPST" compile comparer.typ out/modele-pdf-avant-apres.png --ppi 110

echo "== 6. Contrôle technique des PDF"
"$PY" verifier.py build/verso.pdf out/cartes.pdf out/planches-A4.pdf build/modele.pdf build/modele-fond-pdfium.pdf build/modele-fond-cible.pdf

echo "== 7. Volume : 300 agents"
node preparer.mjs assets build 50 > /dev/null
TIMEFORMAT='   %R s'
echo " - 300 cartes en PDF :"; time "$TYPST" compile cartes.typ out/volume-cartes.pdf --input mode=cartes
echo " - planches SRA3 recto/verso :"; time "$TYPST" compile cartes.typ out/volume-planches-SRA3.pdf --input mode=planches --input feuille=SRA3
mkdir -p out/volume-png
echo " - 300 PNG à 300 dpi :"; time "$TYPST" compile cartes.typ "out/volume-png/carte-{0p}.png" --input mode=cartes --ppi 300
node preparer.mjs assets build 1 > /dev/null
echo "Terminé : voir prototype/out/"
