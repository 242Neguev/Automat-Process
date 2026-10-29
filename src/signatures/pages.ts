// Pages remises aux agents : leur signature, des boutons pour la copier et le mode d'emploi de
// chaque messagerie. Une page récapitule tous les agents. Les pages sont autonomes (aucun fichier
// externe, aucune connexion) : on peut les envoyer par e-mail ou les déposer sur un partage.
import { echapper } from "./html";

export interface PageAgent {
  /** Nom de l'agent (titre de la page). */
  nom: string;
  html: string;
  /** Version sans le logo, pour Gmail ; null quand la signature n'a pas de logo intégré. */
  htmlGmail: string | null;
  texte: string;
  /** Nom du fichier du logo, fourni à côté de la page (pour l'ajouter dans Gmail). */
  fichierLogo: string | null;
}

const STYLE = `
body{margin:0;background:#efede8;color:#22252a;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5}
main{max-width:760px;margin:0 auto;padding:32px 20px 48px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.qui{color:#6b7075;margin:0 0 20px}
.cadre{background:#fff;border:1px solid #d8d5ce;border-radius:8px;padding:24px;margin-bottom:16px;overflow:auto}
.boutons{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
button{font:inherit;font-size:14px;border:1px solid #1e6e72;background:#1e6e72;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer}
button.second{background:#fff;color:#1e6e72}
.etat{color:#1e6e72;font-weight:600;min-height:22px}
details{background:#fff;border:1px solid #d8d5ce;border-radius:8px;margin:8px 0;padding:10px 16px}
summary{cursor:pointer;font-weight:600}
li{margin:4px 0}kbd{background:#efede8;border-radius:4px;padding:1px 5px;font-size:13px}
pre{white-space:pre-wrap;background:#fff;border:1px solid #d8d5ce;border-radius:8px;padding:12px;font-size:13px}
.hors-ecran{position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden}
table.liste{border-collapse:collapse;width:100%;background:#fff;border-radius:8px}
table.liste td,table.liste th{border-bottom:1px solid #e4e1da;padding:8px 12px;text-align:left}
footer{color:#8a8e93;font-size:12px;margin-top:32px}
`;

/** Copie riche (comme une sélection à la souris), ou copie de texte. */
const SCRIPT = `
function signaler(message){var e=document.getElementById('etat');e.textContent=message;setTimeout(function(){e.textContent='';},6000);}
function copier(id){
  var zone=document.getElementById(id),s=window.getSelection(),r=document.createRange();
  r.selectNodeContents(zone);s.removeAllRanges();s.addRange(r);
  var ok=false;try{ok=document.execCommand('copy');}catch(e){}
  s.removeAllRanges();
  signaler(ok?'Copiée ! Collez-la maintenant dans votre messagerie (Ctrl+V).':'Copie impossible : sélectionnez la signature à la souris, puis Ctrl+C.');
}
function copierTexte(id){
  var texte=document.getElementById(id).textContent;
  function repli(){var t=document.createElement('textarea');t.value=texte;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(texte):Promise.reject()).catch(repli).then(function(){signaler('Copié !');});
}
`;

const page = (titre: string, corps: string) =>
  `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${echapper(titre)}</title><style>${STYLE}</style></head><body><main>${corps}` +
  `<footer>Créée avec Automat-Process, une solution Eau sèche.</footer></main><script>${SCRIPT}</script></body></html>\n`;

function modeEmploi(p: PageAgent): string {
  const logoGmail = p.fichierLogo
    ? `<li>Pour ajouter le logo : dans l'éditeur de signature, bouton <b>Insérer une image</b> › <b>Importer</b>, puis choisissez le fichier <b>${echapper(p.fichierLogo)}</b> fourni avec cette page.</li>`
    : "";
  return `
<h2>Installer la signature</h2>
<details open><summary>Outlook sur Windows (version classique)</summary><ol>
<li>Cliquez sur <b>Copier la signature</b>.</li>
<li>Dans Outlook : <b>Fichier</b> › <b>Options</b> › <b>Courrier</b> › <b>Signatures…</b></li>
<li><b>Nouveau</b> : donnez un nom (par exemple « Signature »), puis collez dans la zone du bas (<kbd>Ctrl</kbd>+<kbd>V</kbd>).</li>
<li>À droite, choisissez cette signature pour les <b>nouveaux messages</b> et pour les <b>réponses</b>, puis <b>OK</b>.</li></ol></details>
<details><summary>Nouvel Outlook et Outlook sur le web</summary><ol>
<li>Cliquez sur <b>Copier la signature</b>.</li>
<li>Ouvrez les <b>Paramètres</b> (roue dentée) › <b>Comptes</b> › <b>Signatures</b>.</li>
<li><b>Nouvelle signature</b> : donnez-lui un nom, collez (<kbd>Ctrl</kbd>+<kbd>V</kbd>), puis <b>Enregistrer</b>.</li>
<li>Choisissez-la comme signature par défaut pour les nouveaux messages et les réponses, puis <b>Enregistrer</b>.</li></ol></details>
<details><summary>Gmail</summary><ol>
<li>Cliquez sur <b>${p.htmlGmail ? "Copier pour Gmail" : "Copier la signature"}</b>.</li>
<li>Dans Gmail : <b>Paramètres</b> (roue dentée) › <b>Voir tous les paramètres</b> › onglet <b>Général</b> › <b>Signature</b> › <b>Créer</b>.</li>
<li>Collez (<kbd>Ctrl</kbd>+<kbd>V</kbd>).</li>${logoGmail}
<li>Choisissez la signature par défaut, puis <b>Enregistrer les modifications</b> en bas de la page.</li></ol></details>
<details><summary>Thunderbird</summary><ol>
<li>Cliquez sur <b>Copier le code HTML</b>.</li>
<li><b>Paramètres des comptes</b> › votre adresse : cochez <b>Utiliser HTML</b>, puis collez le code dans <b>Texte de signature</b>.</li></ol></details>
<details><summary>Sur téléphone</summary>
<p>Les applications de messagerie des téléphones n'acceptent qu'une signature en texte. Copiez-la, puis collez-la dans les réglages de l'application (Outlook : <b>Paramètres › Signature</b> ; Gmail : <b>Paramètres › votre compte › Signature mobile</b>).</p>
<pre id="texte">${echapper(p.texte)}</pre><div class="boutons"><button class="second" onclick="copierTexte('texte')">Copier le texte</button></div></details>`;
}

/** Page d'un agent : sa signature, les boutons de copie et le mode d'emploi. */
export function pageAgent(p: PageAgent): string {
  const gmail = p.htmlGmail ? `<div id="signature-gmail" class="hors-ecran" aria-hidden="true">${p.htmlGmail}</div>` : "";
  const boutonGmail = p.htmlGmail ? `<button class="second" onclick="copier('signature-gmail')">Copier pour Gmail (sans le logo)</button>` : "";
  return page(
    `Signature e-mail de ${p.nom}`,
    `<h1>Votre signature e-mail</h1><p class="qui">${echapper(p.nom)}</p>
<div class="cadre"><div id="signature">${p.html}</div></div>${gmail}
<div class="boutons"><button onclick="copier('signature')">Copier la signature</button>${boutonGmail}<button class="second" onclick="copierTexte('code')">Copier le code HTML</button></div>
<p id="etat" class="etat" role="status"></p>
<pre id="code" class="hors-ecran" aria-hidden="true">${echapper(p.html)}</pre>
${modeEmploi(p)}`,
  );
}

/** Page récapitulative : un lien vers la page de chaque agent. */
export function pageRecapitulatif(nomModele: string, agents: { nom: string; fichier: string; email: string }[], fichierLogo: string | null): string {
  const lignes = agents
    .map((a) => `<tr><td>${echapper(a.nom)}</td><td>${echapper(a.email)}</td><td><a href="${encodeURI(a.fichier)}">Ouvrir sa page</a></td></tr>`)
    .join("\n");
  const logo = fichierLogo ? ` Joignez aussi le fichier <b>${echapper(fichierLogo)}</b> pour ceux qui utilisent Gmail.` : "";
  return page(
    `Signatures e-mail : ${nomModele}`,
    `<h1>Signatures e-mail</h1><p class="qui">${echapper(nomModele)} · ${agents.length} agent${agents.length > 1 ? "s" : ""}</p>
<p>Envoyez à chaque agent sa page : il l'ouvre dans son navigateur, copie sa signature et suit le mode d'emploi.${logo}</p>
<table class="liste"><thead><tr><th>Agent</th><th>E-mail</th><th></th></tr></thead><tbody>
${lignes}
</tbody></table>`,
  );
}

/** Nom de fichier de la page d'un agent, unique dans le dossier. */
export function nomsDeFichiers(noms: string[]): string[] {
  const deja = new Map<string, number>();
  return noms.map((nom) => {
    const base = nom.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Agent";
    const n = (deja.get(base.toLowerCase()) ?? 0) + 1;
    deja.set(base.toLowerCase(), n);
    return n === 1 ? `${base}.html` : `${base} (${n}).html`;
  });
}
