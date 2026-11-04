// Kit Outlook : un dossier commun à déposer sur un partage réseau ou une clé USB. Chaque agent lance
// « Installer ma signature.cmd » et choisit son nom ; le script installe sa signature dans Outlook
// classique (fichiers dans %APPDATA%\Microsoft\Signatures, signature par défaut).
import { nomsUniques } from "../donnees/noms";
import type { FichierAEcrire } from "../moteur";
import { echapper } from "./html";
import scriptInstallation from "./kit/installer.ps1?raw";

export interface AgentKit {
  nom: string;
  email: string;
  html: string;
  texte: string;
}

const BOM = "﻿";
const crlf = (texte: string) => texte.replace(/\r?\n/g, "\r\n");

const LANCEUR = crlf(`@echo off
rem Installe votre signature e-mail dans Outlook (Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1"
echo.
pause
`);

function base64EnOctets(base64: string): number[] {
  const binaire = atob(base64);
  return Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}

/** Texte en UTF-16 avec sa marque d'ordre des octets : l'encodage des signatures texte d'Outlook. */
function utf16(texte: string): number[] {
  const octets = [0xff, 0xfe];
  const avecRetours = crlf(texte);
  for (let i = 0; i < avecRetours.length; i++) {
    const unite = avecRetours.charCodeAt(i);
    octets.push(unite & 0xff, unite >> 8);
  }
  return octets;
}

/**
 * Outlook classique n'affiche pas les images intégrées (data:) d'une signature : elles deviennent des
 * fichiers du dossier d'images, que le HTML désigne par `prefixe` (une même image n'est écrite qu'une fois).
 */
export function extraireImages(html: string, prefixe: string): { html: string; images: { nom: string; octets: number[] }[] } {
  const images: { nom: string; octets: number[] }[] = [];
  const dejaVues = new Map<string, string>();
  const nouveau = html.replace(/src="data:image\/(png|jpe?g|gif);base64,([^"]+)"/g, (_, type: string, donnees: string) => {
    let nom = dejaVues.get(donnees);
    if (!nom) {
      nom = `image${String(images.length + 1).padStart(3, "0")}.${type === "jpeg" ? "jpg" : type}`;
      dejaVues.set(donnees, nom);
      images.push({ nom, octets: base64EnOctets(donnees) });
    }
    return `src="${prefixe}${nom}"`;
  });
  return { html: nouveau, images };
}

/** Fichier .htm d'une signature Outlook (UTF-8 déclaré). */
const pageOutlook = (nom: string, html: string) =>
  `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${echapper(nom)}</title></head><body>${html}</body></html>\r\n`;

function lisezMoi(signature: string): string {
  return `Kit Outlook : signature « ${signature} »

Pour chaque agent (Outlook classique sous Windows)
1. Fermez Outlook.
2. Double-cliquez sur « Installer ma signature.cmd ».
3. Confirmez votre nom, ou tapez votre numéro ou une partie de votre nom.
4. Rouvrez Outlook : la signature est ajoutée aux nouveaux messages et aux réponses de votre
   compte. Vous pouvez toujours en choisir une autre (Fichier > Options > Courrier > Signatures).

Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur « Informations
complémentaires », puis sur « Exécuter quand même ».

Pour le service informatique (installation sans question, par exemple au démarrage de session)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File installer.ps1 -Choix prenom.nom@exemple.com
-Choix accepte aussi le numéro ou le nom de l'agent.
-Imposer verrouille la signature sur tous les comptes : l'agent ne peut plus la changer dans Outlook
(relancer le kit sans -Imposer la déverrouille).
-SansRegistre installe seulement les fichiers de la signature, sans toucher aux réglages d'Outlook.

Le nouvel Outlook, Outlook sur le web et Gmail gardent leurs signatures en ligne : pour eux, utilisez
la page de signature de chaque agent (copier-coller).

Kit créé avec Automat-Process, une solution Eau sèche.
`;
}

/**
 * Dossier des images d'une signature, en lettres ASCII seulement (« Signature-Eau-seche_fichiers ») :
 * le HTML le désigne sans aucun caractère encodé, que toutes les versions d'Outlook lisent de la même façon.
 */
export function dossierImages(signature: string): string {
  const ascii = signature
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${ascii || "signature"}_fichiers`;
}

/** Fichiers du kit Outlook pour tous les agents (chemins relatifs au dossier du kit). */
export function construireKit(nomSignature: string, agents: AgentKit[]): FichierAEcrire[] {
  const signature = nomsUniques([nomSignature])[0];
  const images = dossierImages(signature);
  const prefixe = `${images}/`;
  const fichiers: FichierAEcrire[] = [];
  const config = { signature, images, agents: [] as { numero: number; nom: string; email: string; dossier: string }[] };
  agents.forEach((agent, i) => {
    const dossier = String(i + 1).padStart(3, "0");
    const { html, images } = extraireImages(agent.html, prefixe);
    fichiers.push({ nom: `signatures/${dossier}/signature.htm`, texte: pageOutlook(signature, html) });
    fichiers.push({ nom: `signatures/${dossier}/signature.txt`, octets: utf16(agent.texte) });
    for (const image of images) fichiers.push({ nom: `signatures/${dossier}/images/${image.nom}`, octets: image.octets });
    config.agents.push({ numero: i + 1, nom: agent.nom, email: agent.email, dossier });
  });
  fichiers.push({ nom: "kit.json", texte: JSON.stringify(config, null, 2) });
  fichiers.push({ nom: "installer.ps1", texte: BOM + crlf(scriptInstallation.replace(/^﻿/, "")) });
  fichiers.push({ nom: "Installer ma signature.cmd", texte: LANCEUR });
  fichiers.push({ nom: "LISEZMOI.txt", texte: BOM + crlf(lisezMoi(signature)) });
  return fichiers;
}
