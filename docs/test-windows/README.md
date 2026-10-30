# Fiche de test sous Windows

Tout ce qui ne peut pas être essayé sur Mac : la compilation, l'impression par le pilote Windows, la conversion des courriers par Word et les signatures dans Outlook. Le reste de l'application a été testé de bout en bout sur Mac, y compris avec la politique de sécurité de la version finale.

**Version à tester** : le commit `518e03d` ou plus récent (`git log -1` pour le vérifier).

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
3. À la fin, le dossier `src-tauri\target\release\bundle\nsis\` s'ouvre. Lancer `Automat-Process_0.1.0_x64-setup.exe`.
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
3. Windows demande où enregistrer le PDF. La fenêtre peut s'ouvrir **derrière** l'application : regarder la barre des tâches.

**Attendu** :
- le message « Cette imprimante n'imprime pas recto verso » s'affiche, et l'interrupteur Recto verso est grisé ;
- le PDF contient une page avec la carte, au centre et à sa taille réelle. Imprimer ce PDF sur papier en « Taille réelle » (sans « Ajuster ») et mesurer : 85 × 55 mm ;
- la carte est nette (pas de flou ni d'escalier sur les textes).

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

**Si rien ne se passe après 2 minutes** : regarder dans le Gestionnaire des tâches si « Microsoft Word » tourne. Ouvrir Word une fois à la main et fermer ses éventuelles fenêtres de premier lancement (activation, confidentialité), puis réessayer. Noter ce qui s'affichait.

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
   - *Fichier > Options > Courrier > Signatures…* : la signature est là, choisie par défaut, et ce choix peut encore être changé.

Pour aller plus loin : relancer le kit et choisir un autre agent. La signature doit être remplacée, sans doublon.

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

Les parties 1, 4, 5 et 7 sont les plus importantes : ce sont celles qui n'ont jamais pu être essayées.
