# Automat-Process

*Une solution développée par **Eau sèche**.*

Application de bureau (Windows) qui produit en série des **documents personnalisés** à partir d'un **modèle** et d'une **liste Excel**. Le premier module, ce sont les cartes de visite imprimées et numériques. Viendront ensuite les signatures e-mail, les visuels numériques, les documents Word et les outils PDF.

- 📄 [Analyse de faisabilité, décisions et feuille de route](docs/analyse-faisabilite.md)
- 🧪 [Prototype de validation](prototype/README.md)

## État actuel : phase 0 (socle)

| Fonction | État |
|---|---|
| Application Tauri 2 + React + TypeScript (interface Mantine, en français) | ✅ |
| Moteur de rendu **Typst** intégré au cœur Rust : PDF vectoriel, CMJN, polices incorporées, zone de coupe (TrimBox), PNG, SVG | ✅ |
| Carte de démonstration : aperçu agent par agent (recto/verso), export PDF en cartes unitaires ou en planches A4/A3/SRA3 avec traits de coupe | ✅ |
| Vérifications automatiques sous Windows et construction de l'installateur `.exe`/`.msi` par GitHub Actions | ✅ |
| Import de vos modèles et de vos fichiers Excel, placement manuel des textes, signatures e-mail | Phase 1 (MVP) |

## Développer (Mac ou Windows)

Prérequis :

- [Node.js LTS](https://nodejs.org) ;
- [Rust stable](https://rustup.rs) ;
- **sur Mac** : les outils en ligne de commande Xcode (`xcode-select --install`) ;
- **sur Windows** : les *Build Tools* C++ de Visual Studio (voir plus bas).

```bash
npm install            # dépendances de l'interface
npm run tauri dev      # lance l'application en mode développement (rechargement automatique)
npm run verifier       # TypeScript, mise en forme et lints Rust, tests du cœur (comme sur GitHub)
```

La première compilation Rust est longue (plusieurs minutes) ; les suivantes sont rapides.

## Obtenir l'installateur Windows

### Option 1 : GitHub Actions (rien à installer)

> ⚠️ **Bloquée pour l'instant** : GitHub ne lance pas les builds du dépôt privé tant que la facturation du compte n'est pas régularisée (*Settings > Billing and plans*). Une fois réglée, il suffit de relancer les exécutions depuis l'onglet **Actions**.

1. Ouvrir le dépôt sur GitHub.
2. Ouvrir l'onglet **Actions**, choisir **Installateur Windows**, puis **Run workflow**.
3. À la fin de l'exécution (environ 20 à 30 minutes), télécharger les **artefacts** : l'installateur `.exe` (NSIS) et le `.msi`.

Pour publier une version, il suffit d'envoyer un tag : `git tag v0.1.0 && git push origin v0.1.0`. Une **publication GitHub en brouillon** est alors créée avec les installateurs attachés.

> Les vérifications tournent sur Windows à chaque envoi sur `main`. Sur un dépôt **privé**, GitHub décompte les minutes Windows double. Pour les économiser, l'installateur n'est construit qu'à la demande ou sur un tag.

### Option 2 : compiler sur un PC Windows (un double-clic)

1. **Récupérer le projet** de l'une de ces deux façons :
   - sur la page GitHub du dépôt, cliquer sur **Code**, puis sur **Download ZIP**, et décompresser l'archive ;
   - ou, avec Git (`winget install --id Git.Git`), lancer `git clone https://github.com/242Neguev/Automat-Process.git`.
2. **Double-cliquer** sur `scripts\compiler-windows.cmd`. Lors de la première utilisation, le script installe ce qui manque :
   - Node.js LTS ;
   - les outils C++ de Visual Studio (plusieurs Go) ;
   - Rust.

   Windows peut demander d'autoriser ces installations. Compter de 30 à 60 minutes la première fois, quelques minutes ensuite.
3. À la fin, le dossier contenant l'installateur `.exe` s'ouvre tout seul (`src-tauri\target\release\bundle\nsis\`).

Pour produire aussi un `.msi`, lancer `scripts\compiler-windows.cmd -Msi` dans un terminal.

> L'exécutable n'est pas encore signé : Windows affiche l'avertissement « Windows a protégé votre ordinateur ». Il faut cliquer sur **Informations complémentaires**, puis sur **Exécuter quand même**. La signature de code est prévue avant la commercialisation.

## Organisation du code

```
src/                     Interface React + TypeScript
  textes.ts              Tous les textes de l'interface (traduction future)
  moteur.ts              Accès typé aux commandes du cœur
  pages/                 Écrans
src-tauri/               Cœur Rust (Tauri)
  src/moteur/            Moteur de rendu Typst : compilation, fichiers virtuels, exports PDF/PNG/SVG
  src/commandes.rs       Commandes appelées par l'interface
  src/demo.rs            Carte de démonstration embarquée
  gabarits/carte.typ     Gabarit graphique des cartes (aperçu, cartes unitaires, planches)
  ressources/demo/       Données et fonds de la démonstration
docs/                    Analyse de faisabilité, images, PDF d'exemple
exemples-reels/          Vrais fichiers de test (contenu exclu de Git, voir son README)
scripts/                 compiler-windows.cmd : compile l'installateur sur un PC Windows
prototype/               Prototype de validation (jetable)
.github/workflows/       Vérifications et installateur Windows
```

Toutes les dépendances sont sous licences permissives (MIT, Apache-2.0, BSD), ce qui permet la commercialisation.
