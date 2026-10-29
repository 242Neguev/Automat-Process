# Vrais fichiers de test

Ce dossier reçoit les **vrais fichiers** qui servent à tester Automat-Process. Son contenu est **exclu de Git** (voir `.gitignore`) : rien de ce que tu y déposes n'est envoyé sur GitHub. Seul ce README l'est.

## Ce qui est utile

Tu peux les ranger dans des sous-dossiers, mais ce n'est pas obligatoire.

| Dossier conseillé | Contenu | Pourquoi |
|---|---|---|
| `modeles-cartes/` | 2 ou 3 modèles de cartes **tels qu'exportés** par les graphistes (PDF, SVG, PNG/JPG) depuis Illustrator, CorelDRAW, Photoshop, Canva, GIMP… Avec et sans balises `{{Nom}}`, et si possible un visuel qui contient un exemple (« Jean DUPONT ») | Vérifier la détection des balises, le placement manuel et le retrait du texte d'exemple |
| `listes/` | Un fichier Excel d'agents **anonymisé** (noms inventés), avec la mise en forme d'origine : numéros, colonnes, cases vides, accents | Vérifier la lecture des valeurs « telles qu'affichées » et l'association des colonnes |
| `signatures/` | Une signature e-mail existante (fichier `.htm` d'Outlook, ou copie de la page) | Préparer le module signatures |
| `word/` | Un modèle de courrier Word (`.docx`), avec ou sans champs de publipostage | Préparer le module Word |
| `polices/` | Les polices utilisées par les modèles, si elles ne sont pas des polices courantes | Rendre les cartes à l'identique |

Indique-moi quand les fichiers sont déposés : je les testerai et je te ferai un compte rendu.
