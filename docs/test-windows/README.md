# Fiche de test sous Windows

Tout ce qui ne peut pas être essayé sur Mac : la compilation, l'impression par le pilote Windows, la conversion des courriers par Word et les signatures dans Outlook. Le reste de l'application a été testé de bout en bout sur Mac, y compris avec la politique de sécurité de la version finale.

Une première campagne a eu lieu le 4 novembre 2026 sur un PC sous Windows 11 : voir les [résultats](#résultats-du-4-novembre-2026). L'installateur a été produit, installé et essayé. Il reste surtout à essayer une **imprimante à badges** (partie 4b) et **Outlook avec un compte de messagerie** (parties 6 et 7).

**Version à tester** : celle du 4 novembre 2026 ou plus récente (`git log -1` pour le vérifier).

## Avant de commencer

- Un PC sous Windows 10 ou 11, avec Internet : la première compilation télécharge plusieurs Go.
- Microsoft Word (partie 5) et Outlook classique (parties 6 et 7). Le nouvel Outlook, s'il est installé, est un plus.
- Une imprimante : l'imprimante virtuelle **Microsoft Print to PDF**, présente sur tous les PC, suffit. L'imprimante à badges, si vous en avez une, en plus.
- Environ 1 h 30 la première fois, dont 30 à 60 minutes de compilation.
- Créer un dossier d'essai dont le nom contient un espace et un accent, par exemple `Documents\Essai Automat été` : tous les fichiers produits iront dedans.

**Fichiers d'essai** (fictifs) dans [`fichiers/`](fichiers) :

| Fichier | Sert à |
|---|---|
| `Convocation formation.docx` | modèle Word avec balises, un champ de publipostage et un tableau (partie 5) |
| `liste-essai.csv` | liste à compléter avec **votre** adresse Outlook (parties 6 et 7) |
| `fond-teams.png` | fond d'écran Teams de 1920 × 1080 px (partie 8) |

**En cas de problème** : faire une capture d'écran (touches `Windows + Maj + S`), recopier le message exact et noter l'action qui l'a provoqué. Puis passer à la suite : les parties sont indépendantes, sauf la 1.

## 1. Compiler et installer

1. Récupérer la dernière version : `git pull`, ou télécharger à nouveau le ZIP depuis GitHub.
2. Double-cliquer sur `scripts\compiler-windows.cmd`, **sans** l'option `-Msi` pour l'instant.
   - Accepter les installations proposées : Node.js, outils C++ de Visual Studio, Rust.
   - Si le script demande de fermer la fenêtre et de le relancer (après une installation), le faire.
   - S'il s'arrête sur **ÉCHEC**, faire une capture des 30 dernières lignes de la fenêtre.
   - Avec 8 Go de mémoire, fermer navigateur et messagerie pendant la compilation : l'étape finale demande à elle seule environ 3 Go. Après un échec faute de mémoire (`memory allocation of … bytes failed`, code `0xC0000409`), il suffit de relancer le script : la compilation reprend là où elle s'était arrêtée.
3. À la fin, le dossier de l'installateur s'ouvre : `src-tauri\target\release\bundle\nsis\`, ou `%LOCALAPPDATA%\Automat-Process-compilation\release\bundle\nsis\` si le projet est dans OneDrive (la compilation se fait alors hors de OneDrive). Lancer `Automat-Process_0.1.0_x64-setup.exe`.
   - « Windows a protégé votre ordinateur » : cliquer sur **Informations complémentaires**, puis sur **Exécuter quand même**.
   - L'installation se fait pour l'utilisateur courant, sans droits d'administrateur.

**Attendu** : l'application démarre. En bas à gauche, « Moteur Typst 0.15.1 · N polices », avec N supérieur à 100. Le bouton ⓘ, en haut à droite, affiche Eau sèche et ses coordonnées. Les quatre modules du menu sont disponibles.

À noter aussi : le temps de compilation, et si l'antivirus a réagi.

## 2. Affichage

1. Agrandir, réduire, puis mettre la fenêtre en plein écran.
2. Si possible, passer l'échelle de Windows à 125 % puis à 150 % (*Paramètres > Système > Écran*).

**Attendu** : textes nets, rien de coupé, aperçus des cartes nets.

## 3. Cartes de visite : PDF pour l'imprimeur

1. Module **Cartes de visite** : choisir **Modèle de démonstration**, puis **Suivant**.
2. **Utiliser la liste d'exemple**, puis **Suivant** deux fois.
3. Destination **Imprimeur**, **Planches à découper**, feuille A4 : **Enregistrer le PDF…** dans le dossier d'essai. Si une confirmation apparaît, cliquer sur **Exporter quand même**.

**Attendu** : le PDF s'ouvre, avec 6 cartes, les traits de coupe et les accents corrects (Aïssatou, Éloïse).

## 4. Impression directe

### 4a. Avec Microsoft Print to PDF

1. Même carte, destination **Impression directe**. Imprimante : **Microsoft Print to PDF**.
2. Cartes à imprimer : **Jean-Baptiste NKOULOU MBARGA (ligne 2)** seulement. Cliquer sur **Imprimer**.
3. Windows demande où enregistrer le PDF (fenêtre « Enregistrer l'impression sous »). Si elle n'apparaît pas, regarder la barre des tâches.

**Attendu** :
- le message « Cette imprimante n'imprime pas recto verso » s'affiche, et l'interrupteur Recto verso est grisé ;
- le PDF contient une page avec la carte, au centre et à sa taille réelle. Imprimer ce PDF sur papier en « Taille réelle » (sans « Ajuster ») et mesurer : 85 × 55 mm ;
- la carte est nette (pas de flou ni d'escalier sur les textes) ;
- si l'on clique sur **Annuler** dans la fenêtre d'enregistrement, l'application affiche « Impression annulée ».

### 4b. Avec l'imprimante à badges (si disponible)

1. **Mon modèle**, format **Badge PVC CR80 85,6 × 54 mm**, un visuel de badge (recto et verso), et au moins « Prénom NOM ».
2. Liste d'exemple, puis **Impression directe**. L'imprimante doit être proposée d'office, avec la mention « imprimante à cartes ».
3. Imprimer **une** carte, recto verso, puis 2 exemplaires d'une autre.

**Attendu** : carte bien cadrée, verso à l'endroit. Si le verso sort à l'envers, cocher **Retourner le verso** et recommencer. Noter quel réglage convient à cette imprimante, avec sa marque et son modèle.

## 5. Courriers Word en PDF (avec Word)

1. Module **Documents Word** : **Importer un modèle Word (.docx)…**, puis choisir `fichiers\Convocation formation.docx`.
   **Attendu** : « 2 champs de publipostage Word convertis en balises ».
2. **Suivant**, **Utiliser la liste d'exemple**, **Suivant**, puis l'onglet **Aperçu fidèle (PDF)**.
   **Attendu** : la page du courrier apparaît en quelques secondes (jusqu'à 20 s la première fois), sans que Word s'affiche à l'écran.
3. **Suivant**. Garder **Un document Word (.docx) par personne** et cocher **Un PDF par personne** et **Un PDF fusionné**. Cliquer sur **Créer les documents…** et choisir le dossier d'essai.
   **Attendu** : notification « Documents créés », qui précise « Conversion en PDF : Microsoft Word ». Le dossier contient 6 `.docx`, 6 PDF et `_Tous les courriers.pdf`. Un PDF ouvert à côté du `.docx` correspondant dans Word montre la même mise en page (polices, marges, tableau).
4. Recommencer l'étape 3 **avec Word déjà ouvert** sur un autre document.
   **Attendu** : ce document reste ouvert et intact.
5. Après les conversions, ouvrir le Gestionnaire des tâches (`Ctrl + Maj + Échap`).
   **Attendu** : aucun « Microsoft Word » ne reste en arrière-plan, à part celui ouvert à la main.

**Si Word ne répond pas** (fenêtre invisible d'activation ou de premier lancement…) : au bout d'1 min 30, l'application l'arrête et LibreOffice, s'il est installé, prend le relais ; la notification et l'aperçu l'expliquent. Ouvrir alors Word une fois à la main, fermer ses fenêtres (activation, confidentialité), relancer Automat-Process et réessayer. Noter ce qui s'affichait.

## 6. Signatures : copier-coller dans Outlook

1. Ouvrir `fichiers\liste-essai.csv` avec le Bloc-notes. Sur la 2e ligne, remplacer « Prénom », « VOTRE NOM » et `votre.adresse@entreprise.com` par **votre** nom et l'adresse de **votre** compte Outlook. Enregistrer.
2. Module **Signatures e-mail** : **Mise en page prête**, **Choisir le logo…** (le logo d'Eau sèche, par exemple). Puis **Suivant**.
3. **Importer un fichier Excel ou CSV…** : `liste-essai.csv`. **Suivant**, **Suivant**.
4. **Créer les pages…** dans le dossier d'essai. Ouvrir `_Toutes les signatures.html` dans Edge ou Chrome, puis votre page.
5. **Copier la signature**. Dans Outlook classique : *Fichier > Options > Courrier > Signatures… > Nouveau*. Coller (`Ctrl + V`), puis valider.
6. Écrire un nouveau message, insérer la signature et l'envoyer à vous-même et, si possible, à une adresse Gmail.

**Attendu** : le logo est visible dans l'éditeur de signatures, dans le message envoyé et chez le destinataire. Couleurs et mise en page conformes à l'aperçu.

**Nouvel Outlook** (s'il est installé) : *Paramètres > Comptes > Signatures*, coller. Noter le résultat.

## 7. Kit Outlook

1. Toujours dans les signatures, destination : **Créer le kit Outlook…**. L'idéal est de le créer sur une clé USB ou sur un partage réseau.
2. **Fermer Outlook.** Dans le dossier `Kit Outlook - …`, double-cliquer sur **Installer ma signature.cmd**. Si Windows avertit : **Informations complémentaires**, puis **Exécuter quand même**.
3. **Attendu** : la fenêtre noire propose « Vous etes *votre nom* (*votre adresse*) ? [O/n] » (messages volontairement sans accents), car votre adresse est dans la liste et dans Outlook. Appuyer sur Entrée. Sinon, noter ce qui s'affiche, puis taper `1`.
4. **Attendu** : « Signature de … installee. » Rouvrir Outlook :
   - nouveau message : la signature est insérée, avec le logo ;
   - réponse à un message : la signature est insérée ;
   - *Fichier > Options > Courrier > Signatures…* : la signature est là, choisie par défaut pour votre compte, et ce choix peut encore être changé.

Pour aller plus loin :
- relancer le kit et choisir un autre agent : la signature doit être remplacée, sans doublon ;
- dans un terminal, dans le dossier du kit : `powershell -ExecutionPolicy Bypass -File installer.ps1 -Choix 1 -Imposer`. Rouvrir Outlook : le choix de la signature par défaut est grisé. Relancer la même commande sans `-Imposer` : il redevient modifiable.

## 8. Visuels numériques : fond Teams

1. Module **Visuels numériques** : **Choisir l'image de fond…**, puis `fichiers\fond-teams.png`.
   **Attendu** : « Image de 1920 × 1080 px : assez grande pour ce format ».
2. Ajouter « Prénom NOM » et « Fonction ». Les passer en blanc (le fond est sombre) et les placer à gauche de la zone cachée par la personne.
3. Liste d'exemple, **Suivant** deux fois, **Image PNG**, puis **Créer les fichiers…**.
4. Dans Teams : *Effets d'arrière-plan > Ajouter*. Dans Zoom : *Paramètres > Arrière-plan et effets > +*. Choisir une des images.

**Attendu** : le texte est lisible et n'est pas caché par vous. Dans votre propre aperçu, le texte apparaît inversé : c'est normal. Un collègue le voit à l'endroit.

## 9. Projets et dossiers

1. Dans **Cartes de visite**, **Enregistrer le projet…** dans le dossier d'essai. Fermer l'application, la rouvrir, puis **Ouvrir un projet…**.
   **Attendu** : modèle, visuels et correspondances retrouvés.
2. Dans **Cartes de visite**, essayer d'ouvrir un projet enregistré depuis **Visuels numériques**.
   **Attendu** : refus, avec un message qui indique le bon module.
3. Si vous en utilisez : refaire un export vers un dossier OneDrive et vers un partage réseau (`\\serveur\partage`).

## 10. Version Pro : textes d'une image, photos, variantes, mise à jour, anglais

La reconnaissance de caractères et la détection des visages sont celles de Windows : elles ne fonctionnent que sous Windows, hors ligne.

1. **Textes d'une image** : dans **Cartes de visite**, **Mon modèle**, choisir comme recto une **image** (PNG ou JPG) qui contient un nom et une fonction d'exemple, par exemple un design exporté de Canva.
   **Attendu** : les textes sont lus d'office et entourés d'orange ; cliquer sur le nom, puis **Prénom NOM** : le nom disparaît de l'image (le fond est reconstruit) et l'information prend sa place, à sa taille et dans sa couleur. **Annuler le dernier effacement** remet l'image d'avant. Sans le module « Reconnaissance optique de caractères » de la langue de Windows, un message l'indique.
2. **Photos** : ajouter **Photo de l'agent**, le placer, puis à l'étape **Liste** relier « Photo » à une colonne qui contient le nom du fichier de chaque photo et **Choisir le dossier des photos…**.
   **Attendu** : « N photos trouvées » ; à l'étape **Vérification**, chaque visage est centré dans son cadre ; zoom et position se règlent carte par carte.
3. **Variantes** : sous les visuels, **Décliner le modèle selon une colonne**, information « Filiale », deux valeurs (par exemple « Douala » et « Abidjan ») avec chacune son recto. Relier « Filiale » à une colonne de la liste.
   **Attendu** : chaque agent a le recto de sa filiale ; un agent d'une autre filiale garde celui du modèle.
4. **Mise à jour et quantités** : exporter le PDF de l'imprimeur, modifier un agent et en ajouter un dans le fichier Excel, le réimporter, revenir à **Destination**.
   **Attendu** : « Nouvelles et modifiées (2) » est proposé et n'exporte que ces deux cartes. Une colonne « Quantité » (par exemple 3) multiplie les cartes de l'agent sur les planches.
5. **Anglais** : bouton ⓘ, **Langue** › **English**, confirmer.
   **Attendu** : l'application redémarre en anglais : écrans, messages, bon à tirer (« PROOF »), pages de signature et kit Outlook (« Install my signature.cmd »). Revenir au français de la même façon.

## Résultats à renvoyer

| Partie | Résultat (✅ / ❌) | Remarques, messages, captures |
|---|---|---|
| 1. Compilation et installation | | |
| 2. Affichage | | |
| 3. PDF pour l'imprimeur | | |
| 4a. Impression, Microsoft Print to PDF | | |
| 4b. Impression, imprimante à badges | | |
| 5. Courriers Word en PDF | | |
| 6. Signatures copiées dans Outlook | | |
| 7. Kit Outlook | | |
| 8. Fond Teams | | |
| 9. Projets et dossiers | | |
| 10. Version Pro | | |

Les parties 1, 4b, 6 et 7 sont désormais les plus importantes : ce sont celles qui n'ont pas pu être essayées jusqu'au bout (voir ci-dessous).

## Résultats du 4 novembre 2026

PC portable sous Windows 11 (Core i5, 8 Go de mémoire, écran à 125 %), Office 2019 (licence expirée : Word en lecture seule, ce qui n'empêche pas la conversion en PDF), LibreOffice 7.6, Rust 1.99, Visual Studio 2022. Les parties 2 à 9 ont été menées dans l'application réelle, pilotée par Playwright ; les boîtes de dialogue de fichiers étaient simulées, celle du pilote d'impression était bien réelle.

| Partie | Résultat | Remarques |
|---|---|---|
| 1. Compilation et installation | ✅ | Compilation de développement, tests et lints : ✅. Avec 8 compilations simultanées, la mémoire saturait et le compilateur s'arrêtait (code 0xC0000409) : le script en lance désormais moins quand la mémoire est faible, et compile hors de OneDrive quand le projet y est. **Corrigé** : le script échouait sur `npm ci` (« Unknown command: "pm" ») ; il compilait dans le dossier même où s'installe l'application. **Installateur** : `Automat-Process_0.1.0_x64-setup.exe`, 15,2 Mo, en 1 h 45 de compilation cumulée, une compilation à la fois, sur un PC partagé avec d'autres compilations. Interrompue quatre fois faute de mémoire, elle a chaque fois repris là où elle s'était arrêtée ; l'étape finale demande à elle seule 3,1 Go (`typst-library` : 2,5 Go). **Installation** pour l'utilisateur courant, sans droits d'administrateur, en 16 s : « Automat-Process 0.1.0 » d'« Eau sèche » dans les programmes installés, raccourci dans le menu Démarrer. L'application installée affiche « Moteur Typst 0.15.1 · 328 polices », les quatre modules, et ⓘ montre le logo et les coordonnées d'Eau sèche. Vrai PDF des planches enregistré par la boîte « Enregistrer sous » de Windows (au premier plan) dans un dossier accentué : 2 pages A4, polices incorporées. Defender : aucune détection. « Windows a protégé votre ordinateur » non vu : l'installateur a été copié sur le PC, pas téléchargé. |
| 2. Affichage | ✅ | Échelle de 125 % : textes et aperçus nets, rien de coupé. 150 % non essayé. |
| 3. PDF pour l'imprimeur | ✅ | Planche A4 : 6 cartes, traits de coupe, accents corrects (Aïssatou, Éloïse, Kouamé), polices incorporées, dossier au nom accentué. |
| 4a. Microsoft Print to PDF | ✅ | Recto verso grisé avec son message. Carte de 85,0 × 55,0 mm, centrée au dixième de millimètre, rendue à 600 dpi. La fenêtre « Enregistrer l'impression sous » s'ouvre au premier plan. **Corrigé** : l'annuler affichait « L'impression n'a pas pu démarrer » ; c'est maintenant « Impression annulée ». |
| 4b. Imprimante à badges | — | Pas d'imprimante à badges sur ce poste. |
| 5. Courriers Word en PDF | ✅ | « 2 champs de publipostage » convertis ; aperçu fidèle par Word en 35 s la première fois ; 6 `.docx`, 6 PDF et `_Tous les courriers.pdf` en 24 s ; aucun Word résiduel ; un Word déjà ouvert reste intact. **Ajouté** : un Word qui ne répond plus est arrêté et LibreOffice prend le relais (lors d'un premier essai, mémoire saturée, Word était resté bloqué 4 minutes). |
| 6. Signatures copiées dans Outlook | ◐ | Pages créées ; dans Edge, « Copier la signature » met bien le HTML dans le presse-papiers. Outlook classique n'a pas de compte sur ce poste : collage non essayé. |
| 7. Kit Outlook | ◐ | Kit créé par l'application, script essayé avec Windows PowerShell 5.1 sur une copie factice du registre d'Outlook. **Corrigé** : `-Choix` et la saisie d'un numéro ne trouvaient jamais l'agent (sous PowerShell 5.1) ; le script bouclait sans fin lancé sans clavier ; la signature par défaut était imposée (choix grisé dans Outlook) ; le chemin du logo contenait des caractères encodés. À essayer dans Outlook avec un compte. |
| 8. Fond Teams | ✅ | « Image de 1920 × 1080 px : assez grande pour ce format » ; 6 images de 1920 × 1080 px, texte en blanc lisible. Pas essayé dans Teams. |
| 9. Projets et dossiers | ✅ | Projet rouvert après redémarrage (visuel et informations retrouvés) ; refus dans le mauvais module, avec le bon message. OneDrive et partage réseau non essayés. |
