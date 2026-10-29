# Automat-Process

*Une solution développée par **Eau sèche**. Contact : +242 06 853 26 77 · gneguev@gmail.com*

Application de bureau (Windows) qui produit en série des **documents personnalisés** à partir d'un **modèle** et d'une **liste Excel**. Le premier module, ce sont les cartes de visite imprimées et numériques. Viendront ensuite les signatures e-mail, les visuels numériques, les documents Word et les outils PDF.

- 📄 [Analyse de faisabilité, décisions et feuille de route](docs/analyse-faisabilite.md)
- 🧪 [Prototype de validation](prototype/README.md)

## État actuel : phase 1 en cours

| Fonction | État |
|---|---|
| **Socle (phase 0)** : application Tauri 2 + React + TypeScript (interface Mantine aux couleurs d'Eau sèche) ; moteur **Typst** intégré (PDF vectoriel, CMJN, polices incorporées, zone de coupe, PNG, SVG) ; vérifications et installateur Windows par GitHub Actions | ✅ |
| **Assistant « Cartes de visite »** en 4 étapes : Modèle, Liste, Vérification, Destination | ✅ |
| **Import des listes** Excel, CSV ou ODS : valeurs telles qu'Excel les affiche, en-tête trouvé sous un éventuel titre, CSV français (point-virgule, accents) | ✅ |
| **Correspondances automatiques** entre balises et colonnes, y compris les synonymes (Courriel, GSM, Poste…), modifiables à la main | ✅ |
| **Nettoyage** (espaces, MAJUSCULES, Nom Propre, minuscules), lignes vides masquées, **QR code vCard** pour chaque agent, écriture de droite à gauche (arabe) | ✅ |
| Export PDF : cartes unitaires, ou planches A4/A3/SRA3 recto/verso avec traits de coupe | ✅ |
| **Vos modèles** : visuel PDF, SVG, PNG ou JPG pour le recto et le verso ; format (dont badge PVC) et fond perdu ; diagnostic du visuel (fond perdu, résolution, proportions) | ✅ |
| **Balises `{{…}}` d'un SVG** (Illustrator, CorelDRAW, Inkscape…) détectées et placées automatiquement, avec leur police, taille et couleur | ✅ |
| **Éditeur de placement manuel** : ajouter des informations, les déplacer à la souris ou au clavier, régler police, taille, couleur, alignement et mise en forme ; QR code vCard qui réserve sa place | ✅ |
| **Fond perdu complété** pour un visuel livré au format fini : il est posé tel quel et ses bords sont prolongés, rien n'est rogné | ✅ |
| **Balises `{{…}}` d'un PDF** détectées, retirées du visuel et placées automatiquement, avec leur police, taille et couleur (CMJN conservé) | ✅ |
| **Textes d'exemple remplacés d'un clic** (PDF, SVG) : le texte quitte le visuel et devient une information, au même endroit et au même style | ✅ |
| **Zones effacées** pour un texte incrusté dans une image (Canva, Photoshop…) : un aplat de la couleur mesurée tout autour le recouvre | ✅ |
| **Projets `.automat`** (cartes et signatures) : le modèle, ses visuels et les correspondances dans un seul fichier, à rouvrir avec la liste suivante (les données des agents n'y sont jamais copiées) | ✅ |
| **Contrôle des cartes** après mise en page : texte trop long même réduit, texte sur le QR code, hors de la zone de sécurité (affichée dans l'éditeur), textes qui se chevauchent ou descendent plus bas que prévu ; résumé cliquable, filtre « cartes à vérifier », confirmation avant export | ✅ |
| **Mosaïque** de toutes les cartes et bouton **« cas le plus long »** (la carte où chaque information est la plus difficile à loger) | ✅ |
| **Contrôle des données de la liste** : e-mails et numéros mal formés, agents en double, informations vides, colonne vide, avec les lignes à corriger dans le fichier | ✅ |
| **Cartes numériques** : une image PNG ou JPG par agent (WhatsApp, LinkedIn, e-mail), ou un PDF par agent avec téléphone, e-mail et site cliquables ; fiche contact .vcf de chacun | ✅ |
| **Impression directe** (badges PVC sur Evolis, Zebra, Magicard… ou toute imprimante installée) : choix de l'imprimante, d'une carte ou de toutes, recto verso, verso retourné, exemplaires ; carte rendue à la résolution de l'imprimante, à sa taille réelle | ✅ (à tester sous Windows) |
| **Outils PDF** : fusionner plusieurs PDF dans l'ordre voulu ; séparer un PDF par page ou toutes les N pages, fichiers nommés d'après une liste (`{{Prénom}} {{NOM}}`) ; pages recopiées telles quelles, CMJN compris | ✅ |
| Courriers Word personnalisés (`.docx` par personne, document fusionné, PDF via Word) | Phase 2, en cours |
| **Signatures e-mail** : trois mises en page compatibles Outlook et Gmail (classique, logo à gauche, bandeau) ou **signature existante** avec balises (fichier .htm d'Outlook, images locales intégrées) ; police sûre, couleurs, logo intégré ; aperçu clair et sombre ; taille contrôlée (limite de Gmail) | ✅ |
| **Pages à envoyer aux agents** : sa signature à copier (version Gmail sans logo, code HTML pour Thunderbird, texte pour le téléphone) et le mode d'emploi d'Outlook et de Gmail ; une page récapitule tout le monde | ✅ (collage à essayer dans Outlook) |

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
  controle/              Rapport de contrôle des cartes (à partir des mesures du moteur)
  signatures/            Signatures e-mail : modèle, HTML compatible Outlook, import, pages des agents
  donnees/               Listes, correspondances, nettoyage, vCard, agents à rendre
  modele/                Formats, champs, analyse des SVG, visuels
  pages/                 Écrans (cartes/, signatures/, pdf/, et commun/ : étape Liste partagée)
src-tauri/               Cœur Rust (Tauri)
  src/moteur/            Moteur de rendu Typst : compilation, fichiers virtuels, exports PDF/PNG/SVG
  src/commandes.rs       Commandes appelées par l'interface
  src/cartes.rs          Cartes : aperçu, export, couleur autour d'une zone, démonstration embarquée
  src/fonds.rs           Visuels importés (recto, verso), gardés en mémoire
  src/pdf_textes.rs      Lignes de texte d'un PDF : lecture, retrait ciblé
  src/projet_fichier.rs  Fichiers de projet « .automat »
  src/impression.rs      Impression directe par le pilote Windows (badges PVC)
  src/fichiers.rs        Lecture contrôlée des fichiers choisis, écriture des dossiers de résultats
  src/outils_pdf.rs      Fusion et séparation de PDF (pages recopiées telles quelles)
  gabarits/carte.typ     Gabarit graphique des cartes (aperçu, cartes unitaires, planches)
  ressources/demo/       Données et fonds de la démonstration
docs/                    Analyse de faisabilité, images, PDF d'exemple
exemples-reels/          Vrais fichiers de test (contenu exclu de Git, voir son README)
scripts/                 compiler-windows.cmd : compile l'installateur sur un PC Windows
prototype/               Prototype de validation (jetable)
.github/workflows/       Vérifications et installateur Windows
```

Toutes les dépendances sont sous licences permissives (MIT, Apache-2.0, BSD), ce qui permet la commercialisation.
