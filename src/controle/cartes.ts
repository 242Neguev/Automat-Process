// Rapport de contrôle des cartes : les mesures de mise en page renvoyées par le moteur deviennent des
// problèmes compréhensibles, carte par carte, rangés du plus grave au moins grave.
import { MARGE_SECURITE_MM } from "../modele/formats";
import type { ChampQr, ChampTexte, DonneesAgent, MesureTexte, ModeleCarte } from "../moteur";
import { textes } from "../textes";

const t = textes.cartes.controle;

/** « erreur » : la carte est fausse ; « attention » : à regarder ; « info » : ajustement automatique. */
export type Gravite = "erreur" | "attention" | "info";
export type TypeProbleme = keyof typeof t.resumes;

export interface Probleme {
  agent: string;
  type: TypeProbleme;
  gravite: Gravite;
  /** Champs concernés : un seul, ou deux pour un chevauchement. */
  champs: string[];
  libelles: string[];
  message: string;
}

/** Problèmes communs à plusieurs cartes, pour le résumé. */
export interface Groupe {
  cle: string;
  type: TypeProbleme;
  gravite: Gravite;
  resume: string;
  agents: string[];
}

const GRAVITES: Record<TypeProbleme, Gravite> = {
  deborde: "erreur",
  "chevauche-qr": "erreur",
  chevauche: "attention",
  "hors-zone": "attention",
  descend: "attention",
  reduit: "info",
  lignes: "info",
};
export const ORDRE_GRAVITES: Gravite[] = ["erreur", "attention", "info"];

/** En deçà de ces écarts (mm), la différence ne se voit pas à l'impression. */
const TOLERANCE = 0.2;
const DESCENTE_MAX = 0.5;

/** Nom d'une information pour l'utilisateur : ses balises (« Prénom NOM »), sinon son texte. */
export function libelleChamp(champ: ChampTexte): string {
  const balises = [...champ.modele.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
  return balises.length > 0 ? balises.join(" ") : champ.modele;
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

type Boite = { gauche: number; droite: number; haut: number; bas: number };
const chevauchent = (a: Boite, b: Boite) =>
  a.gauche < b.droite - TOLERANCE && b.gauche < a.droite - TOLERANCE && a.haut < b.bas - TOLERANCE && b.haut < a.bas - TOLERANCE;

/** Problèmes de chaque carte (par identifiant d'agent), du plus grave au moins grave. */
export function analyser(modele: ModeleCarte, agents: DonneesAgent[], mesures: MesureTexte[]): Map<string, Probleme[]> {
  const champsTexte = new Map(modele.champs.filter((c): c is ChampTexte => c.type === "texte").map((c) => [c.id, c]));
  const qr = modele.champs.find((c): c is ChampQr => c.type === "qr");
  const zoneQr = qr && { gauche: qr.x_mm, droite: qr.x_mm + qr.taille_mm, haut: qr.y_mm, bas: qr.y_mm + qr.taille_mm };
  const { largeur_mm, hauteur_mm } = modele.format;
  // Limite basse du bloc de texte : la ligne de base la plus basse prévue par le modèle.
  const basePrevue = Math.max(...[...champsTexte.values()].map((c) => c.y_mm));
  const parAgent = new Map<string, MesureTexte[]>();
  for (const m of mesures) if (champsTexte.has(m.champ)) parAgent.set(m.agent, [...(parAgent.get(m.agent) ?? []), m]);

  const rapport = new Map<string, Probleme[]>();
  for (const agent of agents) {
    const problemes: Probleme[] = [];
    const signaler = (type: TypeProbleme, siens: MesureTexte[], message: (...libelles: string[]) => string) => {
      const libelles = siens.map((m) => libelleChamp(champsTexte.get(m.champ)!));
      problemes.push({ agent: agent.id, type, gravite: GRAVITES[type], champs: siens.map((m) => m.champ), libelles, message: message(...libelles) });
    };
    const siennes = parAgent.get(agent.id) ?? [];
    for (const m of siennes) {
      if (m.deborde) signaler("deborde", [m], (l) => t.problemes.deborde(l, nombre(m.taille)));
      else if (m.taille < m.origine - 0.05) signaler("reduit", [m], (l) => t.problemes.reduit(l, nombre(m.taille), nombre(m.origine)));
      if (m.lignes > 1 && !m.deborde) signaler("lignes", [m], (l) => t.problemes.lignes(l, m.lignes));
      // Le QR code n'est imprimé que pour les agents qui ont une fiche contact.
      if (zoneQr && agent.vcard && chevauchent(m, zoneQr)) signaler("chevauche-qr", [m], (l) => t.problemes["chevauche-qr"](l));
      const marge = MARGE_SECURITE_MM - TOLERANCE;
      if (m.gauche < marge || m.haut < marge || m.droite > largeur_mm - marge || m.bas > hauteur_mm - marge) {
        signaler("hors-zone", [m], (l) => t.problemes["hors-zone"](l, MARGE_SECURITE_MM));
      }
    }
    siennes.forEach((a, i) =>
      siennes.slice(i + 1).forEach((b) => chevauchent(a, b) && signaler("chevauche", [a, b], (la, lb) => t.problemes.chevauche(la, lb))),
    );
    const plusBasse = siennes.reduce<MesureTexte | null>((bas, m) => (!bas || m.base > bas.base ? m : bas), null);
    if (plusBasse && plusBasse.base - basePrevue > DESCENTE_MAX) {
      signaler("descend", [plusBasse], () => t.problemes.descend(nombre(plusBasse.base - basePrevue)));
    }
    problemes.sort((a, b) => ORDRE_GRAVITES.indexOf(a.gravite) - ORDRE_GRAVITES.indexOf(b.gravite));
    rapport.set(agent.id, problemes);
  }
  return rapport;
}

/** Gravité d'une carte : celle de son problème le plus grave (null : rien à signaler). */
export const graviteCarte = (problemes: Probleme[] | undefined): Gravite | null => problemes?.[0]?.gravite ?? null;

/** Problèmes regroupés par type et par information, les plus graves et les plus fréquents d'abord. */
export function regrouper(rapport: Map<string, Probleme[]>): Groupe[] {
  const groupes = new Map<string, Groupe>();
  for (const problemes of rapport.values()) {
    for (const p of problemes) {
      const cle = `${p.type}:${p.champs.join("+")}`;
      const groupe = groupes.get(cle) ?? { cle, type: p.type, gravite: p.gravite, resume: t.resumes[p.type](p.libelles), agents: [] };
      if (!groupe.agents.includes(p.agent)) groupe.agents.push(p.agent);
      groupes.set(cle, groupe);
    }
  }
  return [...groupes.values()].sort(
    (a, b) => ORDRE_GRAVITES.indexOf(a.gravite) - ORDRE_GRAVITES.indexOf(b.gravite) || b.agents.length - a.agents.length,
  );
}

/** Nombre de cartes par gravité (chaque carte comptée une fois, à sa gravité la plus haute). */
export function compter(rapport: Map<string, Probleme[]>): Record<Gravite, number> {
  const nombres: Record<Gravite, number> = { erreur: 0, attention: 0, info: 0 };
  for (const problemes of rapport.values()) {
    const gravite = graviteCarte(problemes);
    if (gravite) nombres[gravite] += 1;
  }
  return nombres;
}

/**
 * « Cas le plus long » : pour chaque information, l'agent dont le texte est le plus difficile à
 * loger (il déborde, puis il prend le plus de lignes, puis il est le plus réduit, puis le plus large).
 */
export function casLesPlusLongs(modele: ModeleCarte, mesures: MesureTexte[]): { champ: string; libelle: string; agent: string }[] {
  const difficulte = (m: MesureTexte) => [m.deborde ? 1 : 0, m.lignes, -m.taille, m.droite - m.gauche];
  const plusDifficile = (a: MesureTexte, b: MesureTexte) => {
    const [da, db] = [difficulte(a), difficulte(b)];
    const i = da.findIndex((v, k) => v !== db[k]);
    return i >= 0 && db[i] > da[i] ? b : a;
  };
  return modele.champs
    .filter((c): c is ChampTexte => c.type === "texte")
    .flatMap((champ) => {
      const siennes = mesures.filter((m) => m.champ === champ.id);
      if (siennes.length === 0) return [];
      return [{ champ: champ.id, libelle: libelleChamp(champ), agent: siennes.reduce(plusDifficile).agent }];
    });
}
