// Pages remises aux agents : leur signature, des boutons pour la copier et le mode d'emploi de
// chaque messagerie. Une page récapitule tous les agents. Les pages sont autonomes (aucun fichier
// externe, aucune connexion) : on peut les envoyer par e-mail ou les déposer sur un partage.
import { nomsUniques } from "../donnees/noms";
import { textes } from "../textes";
import { echapper } from "./html";

const t = textes.pagesSignature;

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
  signaler(ok?${JSON.stringify(t.copiee)}:${JSON.stringify(t.copieImpossible)});
}
function copierTexte(id){
  var texte=document.getElementById(id).textContent;
  function repli(){var t=document.createElement('textarea');t.value=texte;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(texte):Promise.reject()).catch(repli).then(function(){signaler(${JSON.stringify(t.copie)});});
}
`;

const page = (titre: string, corps: string) =>
  `<!doctype html>\n<html lang="${t.langueHtml}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${echapper(titre)}</title><style>${STYLE}</style></head><body><main>${corps}` +
  `<footer>${t.piedDePage}</footer></main><script>${SCRIPT}</script></body></html>\n`;

function modeEmploi(p: PageAgent): string {
  return `${t.modeEmploi(Boolean(p.htmlGmail), p.fichierLogo ? echapper(p.fichierLogo) : null)}
<pre id="texte">${echapper(p.texte)}</pre><div class="boutons"><button class="second" onclick="copierTexte('texte')">${t.copierTexte}</button></div></details>`;
}

/** Page d'un agent : sa signature, les boutons de copie et le mode d'emploi. */
export function pageAgent(p: PageAgent): string {
  const gmail = p.htmlGmail ? `<div id="signature-gmail" class="hors-ecran" aria-hidden="true">${p.htmlGmail}</div>` : "";
  const boutonGmail = p.htmlGmail ? `<button class="second" onclick="copier('signature-gmail')">${t.copierGmail}</button>` : "";
  return page(
    t.titre(p.nom),
    `<h1>${t.votreSignature}</h1><p class="qui">${echapper(p.nom)}</p>
<div class="cadre"><div id="signature">${p.html}</div></div>${gmail}
<div class="boutons"><button onclick="copier('signature')">${t.copier}</button>${boutonGmail}<button class="second" onclick="copierTexte('code')">${t.copierCode}</button></div>
<p id="etat" class="etat" role="status"></p>
<pre id="code" class="hors-ecran" aria-hidden="true">${echapper(p.html)}</pre>
${modeEmploi(p)}`,
  );
}

/** Page récapitulative : un lien vers la page de chaque agent. */
export function pageRecapitulatif(nomModele: string, agents: { nom: string; fichier: string; email: string }[], fichierLogo: string | null): string {
  const r = t.recapitulatif;
  const lignes = agents
    .map((a) => `<tr><td>${echapper(a.nom)}</td><td>${echapper(a.email)}</td><td><a href="${encodeURI(a.fichier)}">${r.ouvrir}</a></td></tr>`)
    .join("\n");
  const logo = fichierLogo ? r.logo(echapper(fichierLogo)) : "";
  return page(
    r.titre(nomModele),
    `<h1>${r.entete}</h1><p class="qui">${echapper(nomModele)} · ${r.nbAgents(agents.length)}</p>
<p>${r.envoyez}${logo}</p>
<table class="liste"><thead><tr><th>${r.agent}</th><th>${r.email}</th><th></th></tr></thead><tbody>
${lignes}
</tbody></table>`,
  );
}

/** Nom de fichier de la page de chaque agent, unique dans le dossier. */
export const nomsDeFichiers = (noms: string[]) => nomsUniques(noms).map((nom) => `${nom}.html`);
