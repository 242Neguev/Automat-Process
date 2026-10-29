// Création des champs d'un modèle et géométrie utilisée par l'éditeur.
import type { Transformation } from "../donnees/nettoyage";
import type { Champ, ChampQr, ChampTexte, ModeleCarte } from "../moteur";

const MM_PAR_POINT = 25.4 / 72;

/** Informations proposées dans l'éditeur ; leurs balises sont reliées aux colonnes à l'étape Liste. */
export const INFORMATIONS: { libelle: string; modele: string; taille_pt?: number; graisse?: number; lignes_max?: number; transformations?: Record<string, Transformation> }[] = [
  { libelle: "Prénom NOM", modele: "{{Prénom}} {{NOM}}", taille_pt: 11, graisse: 700, transformations: { Prénom: "nom-propre", NOM: "majuscules" } },
  { libelle: "Fonction", modele: "{{Fonction}}", taille_pt: 8, lignes_max: 2 },
  { libelle: "Mobile", modele: "Mob. {{Mobile}}" },
  { libelle: "Téléphone fixe", modele: "Tél. {{Fixe}}" },
  { libelle: "E-mail", modele: "{{Email}}", transformations: { Email: "minuscules" } },
  { libelle: "Adresse", modele: "{{Adresse}}", lignes_max: 2 },
  { libelle: "Site web", modele: "{{Site}}" },
  { libelle: "Autre information", modele: "{{Information}}" },
];

/** Identifiant libre suivant (c1, c2…). */
export function nouvelId(champs: Champ[]): string {
  const numeros = champs.map((champ) => Number(champ.id.replace(/\D/g, "")) || 0);
  return `c${Math.max(0, ...numeros) + 1}`;
}

/** Nouveau champ texte, placé sous les textes existants (ou en haut à gauche de la carte). */
export function nouveauChampTexte(modele: ModeleCarte, information: (typeof INFORMATIONS)[number]): ChampTexte {
  const { largeur_mm, hauteur_mm } = modele.format;
  const textes = modele.champs.filter((c): c is ChampTexte => c.type === "texte");
  const dernier = textes.reduce<ChampTexte | null>((bas, c) => (!bas || c.y_mm > bas.y_mm ? c : bas), null);
  const taille = information.taille_pt ?? 8;
  const x = dernier?.x_mm ?? 6;
  const y = dernier ? dernier.y_mm + Math.max(dernier.taille_pt, taille) * MM_PAR_POINT * 1.6 : hauteur_mm * 0.35;
  return {
    id: nouvelId(modele.champs),
    type: "texte",
    modele: information.modele,
    x_mm: arrondir(x),
    y_mm: arrondir(Math.min(y, hauteur_mm - 4)),
    police: dernier?.police ?? "Arial",
    graisse: information.graisse ?? 400,
    taille_pt: taille,
    couleur: dernier?.couleur ?? { rgb: "#22252a" },
    interlettrage_em: 0,
    ancre: "start",
    largeur_max_mm: arrondir(Math.max(20, largeur_mm - x - 6)),
    taille_min_pt: Math.round(taille * 0.75 * 2) / 2,
    lignes_max: information.lignes_max ?? 1,
  };
}

/** QR code vCard, en haut à droite, relié aux informations courantes. */
export function nouveauQr(modele: ModeleCarte): ChampQr {
  const taille = 18;
  return {
    id: nouvelId(modele.champs),
    type: "qr",
    x_mm: arrondir(modele.format.largeur_mm - taille - 5),
    y_mm: 5,
    taille_mm: taille,
    couleur: { rgb: "#22252a" },
    vcard: {
      prenom: "{{Prénom}}",
      nom: "{{NOM}}",
      fonction: "{{Fonction}}",
      organisation: "",
      mobile: "{{Mobile}}",
      fixe: "{{Fixe}}",
      email: "{{Email}}",
      site: "",
    },
  };
}

/**
 * Le QR code réserve sa place : les textes alignés à gauche qu'il chevaucherait sont raccourcis
 * pour s'arrêter 2 mm avant lui (un nom long sera réduit au lieu de passer sous le QR code).
 */
export function reserverPlaceQr(champs: Champ[], qr: ChampQr): Champ[] {
  return champs.map((champ) => {
    if (champ.type !== "texte" || champ.ancre !== "start" || champ.x_mm >= qr.x_mm) return champ;
    const boite = boiteChamp(champ);
    const chevauche = boite.y < qr.y_mm + qr.taille_mm && boite.y + boite.hauteur > qr.y_mm && boite.x + boite.largeur > qr.x_mm - 2;
    return chevauche ? { ...champ, largeur_max_mm: arrondir(Math.max(10, qr.x_mm - 2 - champ.x_mm)) } : champ;
  });
}

/** Rectangle occupé par un champ sur la carte finie (mm), pour le dessiner dans l'éditeur. */
export function boiteChamp(champ: Champ) {
  if (champ.type === "qr") {
    return { x: champ.x_mm, y: champ.y_mm, largeur: champ.taille_mm, hauteur: champ.taille_mm };
  }
  const corps = champ.taille_pt * MM_PAR_POINT;
  const decalage = champ.ancre === "middle" ? champ.largeur_max_mm / 2 : champ.ancre === "end" ? champ.largeur_max_mm : 0;
  return {
    x: champ.x_mm - decalage,
    // De la hauteur des capitales au-dessus de la ligne de base jusqu'aux jambages de la dernière ligne.
    y: champ.y_mm - corps * 0.8,
    largeur: champ.largeur_max_mm,
    hauteur: corps * (1 + 1.2 * (champ.lignes_max - 1)),
  };
}

/** Change l'alignement sans déplacer le bloc : seul le point d'ancrage bouge. */
export function changerAncre(champ: ChampTexte, ancre: ChampTexte["ancre"]): ChampTexte {
  const gauche = boiteChamp(champ).x;
  const decalage = ancre === "middle" ? champ.largeur_max_mm / 2 : ancre === "end" ? champ.largeur_max_mm : 0;
  return { ...champ, ancre, x_mm: arrondir(gauche + decalage) };
}

export const arrondir = (valeur: number) => Math.round(valeur * 10) / 10;

/**
 * Mises en forme proposées d'office pour les balises courantes, que le graphiste n'a pas
 * réglées : une balise écrite en capitales (« NOM ») passe en MAJUSCULES, un prénom en
 * Nom Propre, un e-mail en minuscules.
 */
export function transformationsParDefaut(balises: string[]): Record<string, Transformation> {
  const resultat: Record<string, Transformation> = {};
  for (const balise of balises) {
    const simple = balise.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (/^(e-?mail|mail|courriel)/.test(simple)) resultat[balise] = "minuscules";
    else if (/^prenom/.test(simple)) resultat[balise] = "nom-propre";
    else if (balise.length > 1 && balise === balise.toLocaleUpperCase("fr") && /\p{L}/u.test(balise)) resultat[balise] = "majuscules";
  }
  return resultat;
}
