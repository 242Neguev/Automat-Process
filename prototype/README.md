# Prototype de faisabilité (jetable)

Ce dossier valide les points techniques risqués **avant** de développer l'application. Ce n'est pas le code de l'application : il mélange volontairement Python, Node et Typst pour aller vite. Il pourra être supprimé une fois le vrai moteur en place.

Résultats et conclusions : [docs/analyse-faisabilite.md, § 6](../docs/analyse-faisabilite.md#6-prototype-de-validation).

## Contenu

| Fichier | Rôle |
|---|---|
| `creer_exemples.py` | Crée un Excel d'agents « réaliste » (numéros stockés comme nombres avec format, espaces parasites, casse incohérente) et un modèle SVG imitant un export Illustrator (styles CSS, noms PostScript, balise coupée en deux) |
| `verso.typ`, `modele-pdf.typ` | Simulent des exports PDF en CMJN d'un graphiste : un verso, et un modèle contenant des balises |
| `preparer.mjs` | Détecte les balises du SVG (position, police, taille, couleur), lit l'Excel tel qu'affiché, associe balises et colonnes, nettoie les données, génère les QR codes vCard |
| `cartes.typ` | Moteur de rendu : cartes unitaires ou planches imposées recto/verso avec traits de coupe ; réduction automatique, passage sur 2 lignes, lignes vides masquées, rapport de contrôle |
| `nettoyer_pdf_pdfium.py` | Retrait des balises d'un modèle PDF, méthode **naïve** : perd les couleurs CMJN, gardée pour démonstration |
| `nettoyer_pdf_cible.py` | Retrait des balises d'un modèle PDF, méthode **ciblée** : CMJN intact, c'est la méthode retenue |
| `comparer.typ` | Image comparant les deux méthodes de retrait |
| `verifier.py` | Contrôle des PDF produits : polices incorporées, couleurs CMJN, RVB ou gris, images pixellisées |
| `lancer.sh` | Rejoue tout le prototype, mesures de temps comprises |

## Lancer (macOS ou Linux)

Prérequis :

- Python 3.10 ou plus ;
- Node 20 ou plus ;
- [Typst 0.15](https://github.com/typst/typst/releases), installé avec `brew install typst` ou téléchargé depuis la page des versions.

```bash
cd prototype
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHON=.venv/bin/python ./lancer.sh
```

Les fichiers produits sont écrits dans `prototype/out/`. Le prototype utilise les polices du système (Arial).
