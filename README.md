# Automat-Process

*Une solution développée par **Eau sèche**. Contact : +242 06 853 26 77 · gneguev@gmail.com*

Application de bureau (Windows) qui produit en série des **documents personnalisés** à partir d'un **modèle** et d'une **liste Excel**. Quatre modules : cartes de visite imprimées et numériques, signatures e-mail, visuels numériques (fonds Teams et Zoom, bannières) et courriers Word.

Les outils PDF (fusionner, séparer, organiser, protéger, diffuser) forment depuis le 30 octobre 2026 une application séparée, [Automat-PDF](https://github.com/242Neguev/Automat-PDF), car ils servent un autre usage.

- 📄 [Analyse de faisabilité, décisions et feuille de route](docs/analyse-faisabilite.md)
- 🧪 [Prototype de validation](prototype/README.md)
- 🪟 [Fiche de test sous Windows](docs/test-windows/README.md)

## État actuel

Les quatre modules sont disponibles. L'application a été compilée et essayée sous Windows 11 le 4 novembre 2026 ([résultats](docs/test-windows/README.md#résultats-du-4-novembre-2026)) : il reste à produire et installer l'installateur final, et à essayer une imprimante à badges et Outlook avec un compte de messagerie.

| Fonction | État |
|---|---|
| **Socle (phase 0)** : application Tauri 2 + React + TypeScript (interface Mantine aux couleurs d'Eau sèche) ; moteur **Typst** intégré (PDF vectoriel, CMJN, polices incorporées, zone de coupe, PNG, SVG) ; vérifications et installateur Windows par GitHub Actions | ✅ |
| **Assistant « Cartes de visite »** en 4 étapes : Modèle, Liste, Vérification, Destination | ✅ |
| **Import des listes** Excel, CSV ou ODS : valeurs telles qu'Excel les affiche, en-tête trouvé sous un éventuel titre, CSV français (point-virgule, accents) | ✅ |
| **Liste vide à faire remplir** : un fichier Excel avec une colonne par information du modèle (cellules au format texte, pour garder les zéros des numéros) et son mode d'emploi, à envoyer aux ressources humaines puis à importer tel quel | ✅ |
| **Correspondances automatiques** entre balises et colonnes, y compris les synonymes (Courriel, GSM, Poste…), modifiables à la main | ✅ |
| **Nettoyage** (espaces, MAJUSCULES, Nom Propre, minuscules), lignes vides masquées, **QR code vCard** pour chaque agent, écriture de droite à gauche (arabe) | ✅ |
| Export PDF : cartes unitaires, ou planches A4/A3/SRA3 recto/verso avec traits de coupe | ✅ |
| **Vos modèles** : visuel PDF, SVG, PNG ou JPG pour le recto et le verso ; format (dont badge PVC) et fond perdu ; diagnostic du visuel (fond perdu, résolution, proportions) | ✅ |
| **Balises `{{…}}` d'un SVG** (Illustrator, CorelDRAW, Inkscape…) détectées et placées automatiquement, avec leur police, taille et couleur | ✅ |
| **Éditeur de placement manuel** : ajouter des informations, les déplacer à la souris ou au clavier, régler police, taille, couleur, alignement et mise en forme ; QR code vCard qui réserve sa place | ✅ |
| **Aides au placement** : repères magnétiques (alignement sur les autres informations, le centre et la zone de sécurité ; touche Alt pour placer librement), **calque de référence** (la maquette du graphiste posée en transparence, jamais imprimée), pipette du choix de couleur (une couleur prise sur le visuel) | ✅ |
| **Deux visuels par face** : la version de l'imprimeur (PDF CMJN…) et une version écran facultative (RVB), utilisée d'office pour les cartes numériques | ✅ |
| **Mode opérateur** : le graphiste verrouille le modèle et enregistre le projet ; l'opérateur le rouvre directement à l'étape Liste, sans pouvoir modifier le modèle par mégarde (cartes, visuels, signatures, courriers) | ✅ |
| **Fond perdu complété** pour un visuel livré au format fini : il est posé tel quel et ses bords sont prolongés, rien n'est rogné | ✅ |
| **Balises `{{…}}` d'un PDF** détectées, retirées du visuel et placées automatiquement, avec leur police, taille et couleur (CMJN conservé) | ✅ |
| **Textes d'exemple remplacés d'un clic** (PDF, SVG) : le texte quitte le visuel et devient une information, au même endroit et au même style | ✅ |
| **Zones effacées** pour un texte incrusté dans une image (Canva, Photoshop…) : un aplat de la couleur mesurée tout autour le recouvre | ✅ |
| **Projets `.automat`** (cartes, visuels numériques, signatures et courriers Word, modèle Word inclus) : le modèle, ses visuels et les correspondances dans un seul fichier, à rouvrir avec la liste suivante (les données des agents n'y sont jamais copiées) | ✅ |
| **Contrôle des cartes** après mise en page : texte trop long même réduit, texte sur le QR code, hors de la zone de sécurité (affichée dans l'éditeur), textes qui se chevauchent ou descendent plus bas que prévu ; résumé cliquable, filtre « cartes à vérifier », confirmation avant export | ✅ |
| **Mosaïque** de toutes les cartes et bouton **« cas le plus long »** (la carte où chaque information est la plus difficile à loger) | ✅ |
| **Contrôle des données de la liste** : e-mails et numéros mal formés, agents en double, informations vides, colonne vide, avec les lignes à corriger dans le fichier | ✅ |
| **Bon à tirer (BAT)** : une page A4 par carte à faire valider (la première et les cas les plus longs, ou toutes), recto et verso en taille réelle avec fond perdu et ligne de coupe, recto agrandi, filigrane « BON À TIRER » et encadré à signer | ✅ |
| **Cartes numériques** : une image PNG ou JPG par agent (WhatsApp, LinkedIn, e-mail), ou un PDF par agent avec téléphone, e-mail et site cliquables ; fiche contact .vcf de chacun | ✅ |
| **Visuels numériques** : fond d'écran Teams ou Zoom (1920 × 1080 px), bannière LinkedIn ou image carrée, avec les informations de chacun ; zone cachée par la personne affichée dans l'éditeur ; une image PNG ou JPG par agent, à la taille exacte du format | ✅ |
| **Impression directe** (badges PVC sur Evolis, Zebra, Magicard… ou toute imprimante installée) : choix de l'imprimante, d'une carte ou de toutes, recto verso, verso retourné, exemplaires ; carte rendue à la résolution de l'imprimante, à sa taille réelle | ✅ (essayée sous Windows avec Microsoft Print to PDF ; reste une imprimante à badges) |
| **Courriers Word** : modèle `.docx` ou `.dotx` avec balises `{{…}}` ou **champs de publipostage existants** (convertis), balises coupées par Word recollées ; aperçu du texte de chaque courrier ; un `.docx` par personne et un **document fusionné** (une section par courrier, pages numérotées à partir de 1) ; lignes vides retirées, valeurs sur plusieurs lignes gardées | ✅ |
| **PDF des courriers** : un PDF par personne et un PDF fusionné, produits par Microsoft Word piloté sans s'afficher (sinon LibreOffice) ; un Word qui ne répond plus (fenêtre d'activation…) est arrêté et LibreOffice prend le relais, en le signalant ; **aperçu fidèle** du courrier affiché | ✅ (essayé avec Word sous Windows) |
| **Signatures e-mail** : trois mises en page compatibles Outlook et Gmail (classique, logo à gauche, bandeau) ou **signature existante** avec balises (fichier .htm d'Outlook, images locales intégrées) ; police sûre, couleurs, logo intégré ; aperçu clair et sombre ; taille contrôlée (limite de Gmail) | ✅ |
| **Pages à envoyer aux agents** : sa signature à copier (version Gmail sans logo, code HTML pour Thunderbird, texte pour le téléphone) et le mode d'emploi d'Outlook et de Gmail ; une page récapitule tout le monde | ✅ (collage à essayer dans Outlook) |
| **Kit Outlook** : un seul dossier pour tous (partage réseau, clé USB) ; chaque agent lance « Installer ma signature.cmd », choisit son nom (proposé d'office d'après ses comptes Outlook) et sa signature devient celle des nouveaux messages et des réponses de son compte, qu'il peut encore changer ; pour le service informatique, installation sans question (`-Choix`) et signature verrouillée si besoin (`-Imposer`) | ✅ (script essayé sous Windows ; reste à l'essayer dans Outlook avec un compte) |

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

> **Projet dans OneDrive ?** Les fichiers compilés pèsent plusieurs Go : placez-les hors de OneDrive, par exemple `$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Automat-Process-compilation"` dans PowerShell avant les commandes ci-dessus (le script de compilation Windows le fait de lui-même). **8 Go de mémoire ou moins ?** Limitez les compilations simultanées (`$env:CARGO_BUILD_JOBS = "2"`), sinon le compilateur peut s'arrêter avec le code `0xC0000409`.

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

   Windows peut demander d'autoriser ces installations. Compter de 30 à 60 minutes la première fois (davantage sur un PC de 8 Go de mémoire, où le script lance moins de compilations à la fois), quelques minutes ensuite. Avec 8 Go, mieux vaut fermer navigateur et messagerie pendant la compilation : l'étape finale demande à elle seule environ 3 Go. Si le script s'arrête faute de mémoire (code `0xC0000409`), il suffit de le relancer : la compilation reprend là où elle s'était arrêtée.
3. À la fin, le dossier contenant l'installateur `.exe` s'ouvre tout seul (`src-tauri\target\release\bundle\nsis\`, ou `%LOCALAPPDATA%\Automat-Process-compilation\release\bundle\nsis\` si le projet est dans OneDrive : la compilation se fait alors hors de OneDrive).

Pour produire aussi un `.msi`, lancer `scripts\compiler-windows.cmd -Msi` dans un terminal.

> L'exécutable n'est pas encore signé : Windows affiche l'avertissement « Windows a protégé votre ordinateur ». Il faut cliquer sur **Informations complémentaires**, puis sur **Exécuter quand même**. La signature de code est prévue avant la commercialisation.

## Organisation du code

```
src/                     Interface React + TypeScript
  textes.ts              Tous les textes de l'interface (traduction future)
  moteur.ts              Accès typé aux commandes du cœur
  controle/              Rapport de contrôle des cartes (à partir des mesures du moteur)
  signatures/            Signatures e-mail : modèle, HTML compatible Outlook, import, pages des agents
  word/                  Courriers Word : préparation du modèle, remplissage, document fusionné
  donnees/               Listes, correspondances, nettoyage, vCard, agents à rendre
  modele/                Formats, champs, analyse des SVG, visuels
  pages/                 Écrans (cartes/, qui sert aussi aux visuels numériques, signatures/, word/, et commun/ : étape Liste partagée)
src-tauri/               Cœur Rust (Tauri)
  src/moteur/            Moteur de rendu Typst : compilation, fichiers virtuels, exports PDF/PNG/SVG
  src/commandes.rs       Commandes appelées par l'interface
  src/cartes.rs          Cartes : aperçu, export, couleur autour d'une zone, démonstration embarquée
  src/fonds.rs           Visuels importés (recto, verso), gardés en mémoire
  src/pdf_textes.rs      Lignes de texte d'un PDF : lecture, retrait ciblé
  src/projet_fichier.rs  Fichiers de projet « .automat »
  src/impression.rs      Impression directe par le pilote Windows (badges PVC)
  src/fichiers.rs        Lecture contrôlée des fichiers choisis, écriture des dossiers de résultats
  src/outils_pdf.rs      PDF des courriers : fusion (pages recopiées telles quelles) et aperçu fidèle
  src/word.rs            Modèles Word : lecture des parties à remplir, écriture des courriers
  src/conversion.rs      Courriers en PDF : Microsoft Word (script PowerShell), sinon LibreOffice
  scripts/word-en-pdf.ps1  Pilotage de Word pour la conversion en PDF
  gabarits/carte.typ     Gabarit graphique des cartes (aperçu, cartes unitaires, planches)
  ressources/demo/       Données et fonds de la démonstration
docs/                    Analyse de faisabilité, images, PDF d'exemple
exemples-reels/          Vrais fichiers de test (contenu exclu de Git, voir son README)
scripts/                 compiler-windows.cmd : compile l'installateur sur un PC Windows
prototype/               Prototype de validation (jetable)
.github/workflows/       Vérifications et installateur Windows
```

Toutes les dépendances sont sous licences permissives (MIT, Apache-2.0, BSD), ce qui permet la commercialisation.
