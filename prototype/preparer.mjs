// Étape « analyse du modèle + données » du prototype (ce que ferait l'interface de l'app).
// Usage : node preparer.mjs <dossier-assets> <dossier-build> [facteur-de-duplication]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const [, , assets, build, facteurTxt = '1'] = process.argv;
fs.mkdirSync(build, { recursive: true });

// ---------------------------------------------------------------- 1. Analyse du modèle SVG
const doc = new DOMParser().parseFromString(fs.readFileSync(path.join(assets, 'recto.svg'), 'utf8'), 'image/svg+xml');
const UNITE_MM = 25.4 / 72; // export Illustrator : 1 unité = 1 pt (l'app le fera confirmer)

const classes = {};
for (const style of Array.from(doc.getElementsByTagName('style'))) {
  for (const [, selecteurs, corps] of style.textContent.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decl = Object.fromEntries(corps.split(';').filter((d) => d.includes(':'))
      .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
    for (const sel of selecteurs.split(',')) {
      const m = sel.trim().match(/^\.([\w-]+)$/);
      if (m) classes[m[1]] = { ...classes[m[1]], ...decl };
    }
  }
}
const styleDe = (el) => {
  const s = {};
  for (const c of (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)) Object.assign(s, classes[c]);
  for (const a of ['font-size', 'font-family', 'font-weight', 'fill', 'letter-spacing', 'text-anchor']) {
    if (el.getAttribute(a)) s[a] = el.getAttribute(a);
  }
  return s;
};

const champs = [];
for (const t of Array.from(doc.getElementsByTagName('text'))) {
  const contenu = t.textContent.replace(/\s+/g, ' ').trim(); // recolle les balises coupées en plusieurs <tspan>
  if (!/\{\{[^}]+\}\}/.test(contenu)) continue;
  const st = styleDe(t);
  const tr = (t.getAttribute('transform') || '').match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
  const tspan = t.getElementsByTagName('tspan')[0];
  const x = (tr ? +tr[1] : 0) + Number(t.getAttribute('x') || tspan?.getAttribute('x') || 0);
  const y = (tr ? +tr[2] : 0) + Number(t.getAttribute('y') || tspan?.getAttribute('y') || 0);
  const taille = parseFloat(st['font-size'] || '10');
  const ls = st['letter-spacing'] || '0';
  const familles = (st['font-family'] || 'Arial').split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
  champs.push({
    id: `c${champs.length + 1}`, type: 'texte', modele: contenu,
    x_mm: x * UNITE_MM, y_mm: y * UNITE_MM,
    police: familles.at(-1), // « Arial-BoldMT, Arial » -> « Arial »
    graisse: Number(st['font-weight'] || 400),
    taille_pt: taille,
    couleur: { rgb: st.fill || '#000000' },
    interlettrage_em: ls.endsWith('em') ? parseFloat(ls) : parseFloat(ls) / taille || 0,
    ancre: st['text-anchor'] || 'start',
    largeur_max_mm: 52, taille_min_pt: taille * 0.75, lignes_max: 1, groupe: null,
  });
  t.parentNode.removeChild(t);
}
fs.writeFileSync(path.join(build, 'recto-fond.svg'), new XMLSerializer().serializeToString(doc));

// Réglages qu'un utilisateur ferait dans l'éditeur
const reglages = {
  '{{Prénom}} {{NOM}}': { couleur: { cmyk: [100, 80, 30, 25] }, taille_min_pt: 8 },
  '{{Fonction}}': { lignes_max: 2, taille_min_pt: 6 },
  'Mob. {{Mobile}}': { groupe: 'contacts' },
  'Tél. {{Fixe}}': { groupe: 'contacts' },
  '{{Email}}': { groupe: 'contacts', taille_min_pt: 5.5 },
};
for (const c of champs) Object.assign(c, reglages[c.modele]);
champs.push({ id: 'qr', type: 'qr', x_mm: 66, y_mm: 15.5, taille_mm: 19, couleur: { cmyk: [100, 80, 30, 25] } });
const transformations = { 'Prénom': 'nom-propre', 'NOM': 'majuscules', 'Email': 'minuscules' };

// ---------------------------------------------------------------- 2. Lecture Excel
const wb = XLSX.readFile(path.join(assets, 'agents.xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const lignes = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' }); // valeurs telles qu'affichées dans Excel
const brut = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
console.log(`Excel : ${lignes.length} lignes · Mobile brut = ${brut[1].Mobile} -> affiché = « ${lignes[1].Mobile} » · Fixe brut = ${brut[0].Fixe} -> « ${lignes[0].Fixe} »`);

// ---------------------------------------------------------------- 3. Correspondance automatique balises <-> colonnes
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const SYNONYMES = [['email', 'mail', 'courriel', 'adressemail'], ['mobile', 'portable', 'gsm', 'cellulaire', 'telmobile'],
  ['fonction', 'poste', 'titre', 'intitule'], ['fixe', 'telfixe', 'bureau', 'telephonefixe'], ['prenom', 'prenoms', 'firstname']];
const colonnes = Object.keys(lignes[0]);
const groupeDe = (n) => SYNONYMES.find((g) => g.includes(n)) || [n];
const balises = [...new Set(champs.filter((c) => c.modele).flatMap((c) => [...c.modele.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1])))];
const correspondance = Object.fromEntries(balises.map((b) => [b, colonnes.find((col) => groupeDe(norm(b)).includes(norm(col)))]));
console.log('Correspondances :', Object.entries(correspondance).map(([b, c]) => `{{${b}}} -> ${c ? `« ${c} »` : '??'}`).join(' · '));

// ---------------------------------------------------------------- 4. Nettoyage, contrôle, QR vCard
const nomPropre = (s) => s.toLocaleLowerCase('fr').replace(/(^|[\s'-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('fr'));
const appliquer = (b, v) => {
  v = String(v ?? '').replace(/\s+/g, ' ').trim();
  return ({ 'nom-propre': nomPropre, majuscules: (s) => s.toLocaleUpperCase('fr'), minuscules: (s) => s.toLocaleLowerCase('fr') }[transformations[b]] || ((s) => s))(v);
};
const echapVcf = (s) => s.replace(/([,;\\])/g, '\\$1');
const alertes = [];
const facteur = Number(facteurTxt);
const agents = [];
for (let k = 0; k < facteur; k++) {
  for (const ligne of lignes) {
    const val = Object.fromEntries(balises.map((b) => [b, appliquer(b, ligne[correspondance[b]])]));
    const id = facteur > 1 ? `${ligne.Matricule}-${k + 1}` : ligne.Matricule;
    if (k === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(val.Email)) alertes.push(`${id} : e-mail invalide`);
      if (!val.Mobile) alertes.push(`${id} : mobile manquant`);
    }
    const valeurs = Object.fromEntries(champs.filter((c) => c.modele).map((c) => {
      const noms = [...c.modele.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
      const vide = noms.every((n) => !val[n]);
      return [c.id, vide ? '' : c.modele.replace(/\{\{([^}]+)\}\}/g, (_, n) => val[n])];
    }));
    const tel = (s) => s.replace(/[^\d+]/g, '');
    const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `N:${echapVcf(val.NOM)};${echapVcf(val['Prénom'])};;;`,
      `FN:${echapVcf(`${val['Prénom']} ${val.NOM}`)}`, 'ORG:EXEMPLE SA', `TITLE:${echapVcf(val.Fonction)}`,
      val.Mobile && `TEL;TYPE=CELL:${tel(val.Mobile)}`, val.Fixe && `TEL;TYPE=WORK:${tel(val.Fixe)}`,
      `EMAIL;TYPE=INTERNET:${val.Email}`, 'URL:https://www.exemple.com', 'END:VCARD'].filter(Boolean).join('\r\n');
    const qr = QRCode.create(vcard, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const runs = []; // modules sombres regroupés par segments horizontaux -> un seul tracé vectoriel
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!qr.modules.get(y, x)) continue;
        let l = 1;
        while (x + l < n && qr.modules.get(y, x + l)) l++;
        runs.push([x, y, l]);
        x += l;
      }
    }
    if (k === 0) {
      const module = champs.find((c) => c.type === 'qr').taille_mm / n;
      if (module < 0.25) alertes.push(`${id} : QR trop dense (module ${module.toFixed(2)} mm < 0,25 mm)`);
    }
    agents.push({ id, valeurs, qr: { n, runs } });
  }
}
fs.writeFileSync(path.join(build, 'agents.json'), JSON.stringify(agents));
fs.writeFileSync(path.join(build, 'projet.json'), JSON.stringify({
  format: { largeur_mm: 85, hauteur_mm: 55, fond_perdu_mm: 3 },
  fond_recto: 'build/recto-fond.svg', fond_verso: 'build/verso.pdf', champs,
}, null, 1));
console.log(`Champs détectés : ${champs.filter((c) => c.modele).map((c) => `« ${c.modele} » (${c.police} ${c.graisse} ${c.taille_pt}pt @ ${c.x_mm.toFixed(1)};${c.y_mm.toFixed(1)} mm)`).join(' · ')}`);
console.log(`Agents préparés : ${agents.length} · Alertes données : ${alertes.length ? alertes.join(' | ') : 'aucune'}`);
