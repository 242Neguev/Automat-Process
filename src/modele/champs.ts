// Création des champs d'un modèle et géométrie utilisée par l'éditeur.
import type { Transformation } from "../donnees/nettoyage";
import type { Champ, ChampPhoto, ChampQr, ChampTexte, ModeleCarte, PhotoChargee, Recadrage, TexteLu, TexteVisuel } from "../moteur";
import { textes } from "../textes";
import { versCarte, type Format } from "./formats";
import { choisirPolice, graisseDuNom } from "./svg";

const MM_PAR_POINT = 25.4 / 72;

/** Informations proposées dans l'éditeur ; leurs balises sont reliées aux colonnes à l'étape Liste. */
export const INFORMATIONS = textes.informations;

/** Identifiant libre suivant (c1, c2…). */
export function nouvelId(champs: Champ[]): string {
  const numeros = champs.map((champ) => Number(champ.id.replace(/\D/g, "")) || 0);
  return `c${Math.max(0, ...numeros) + 1}`;
}

/** Nouveau champ texte, placé sous les textes existants (ou en haut à gauche de la carte). */
export function nouveauChampTexte(modele: ModeleCarte, information: (typeof INFORMATIONS)[number]): ChampTexte {
  const { largeur_mm, hauteur_mm } = modele.format;
  // Tailles prévues pour une carte de visite (85 mm) : proportionnelles sur un grand format (fond Teams…).
  const facteur = Math.max(1, largeur_mm / 85);
  const textes = modele.champs.filter((c): c is ChampTexte => c.type === "texte");
  const dernier = textes.reduce<ChampTexte | null>((bas, c) => (!bas || c.y_mm > bas.y_mm ? c : bas), null);
  const taille = Math.round((information.taille_pt ?? 8) * facteur * 2) / 2;
  const x = dernier?.x_mm ?? 6 * facteur;
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
    largeur_max_mm: arrondir(Math.max(20 * facteur, largeur_mm - x - 6 * facteur)),
    taille_min_pt: Math.round(taille * 0.75 * 2) / 2,
    lignes_max: information.lignes_max ?? 1,
  };
}

/** QR code vCard, en haut à droite, relié aux informations courantes. */
export function nouveauQr(modele: ModeleCarte): ChampQr {
  const facteur = Math.max(1, modele.format.largeur_mm / 85);
  const taille = arrondir(Math.min(18 * facteur, modele.format.hauteur_mm * 0.3));
  return {
    id: nouvelId(modele.champs),
    type: "qr",
    x_mm: arrondir(modele.format.largeur_mm - taille - 5 * facteur),
    y_mm: arrondir(5 * facteur),
    taille_mm: taille,
    couleur: { rgb: "#22252a" },
    vcard: { ...textes.qrVcard },
  };
}

/** Cadre photo, à gauche de la carte, aux proportions d'une photo d'identité. */
export function nouvellePhoto(modele: ModeleCarte): ChampPhoto {
  const facteur = Math.max(1, modele.format.largeur_mm / 85);
  const hauteur = arrondir(Math.min(modele.format.hauteur_mm * 0.55, 30 * facteur));
  return {
    id: nouvelId(modele.champs),
    type: "photo",
    x_mm: arrondir(5 * facteur),
    y_mm: arrondir((modele.format.hauteur_mm - hauteur) / 2),
    largeur_mm: arrondir(hauteur * 0.8),
    hauteur_mm: hauteur,
    balise: "Photo",
    forme: "rectangle",
  };
}

/**
 * Recadrage d'office d'une photo : centré sur le visage (repéré sous Windows), assez grand pour que
 * le visage occupe la moitié du cadre, un peu au-dessus de son centre ; sans visage repéré, la photo
 * couvre le cadre, centrée un peu au-dessus de son milieu (portraits).
 */
export function recadrageAuto(champ: ChampPhoto, photo: Pick<PhotoChargee, "largeurPx" | "hauteurPx" | "visage">): Recadrage {
  if (!photo.visage || photo.hauteurPx <= 0 || photo.largeurPx <= 0) return { centre_x: 0.5, centre_y: 0.4, zoom: 1 };
  const proportions = photo.largeurPx / photo.hauteurPx;
  const cadre = champ.largeur_mm / champ.hauteur_mm;
  // Hauteur de la photo dans le cadre, rapportée à celle du cadre, quand elle le couvre juste.
  const couverte = proportions > cadre ? 1 : cadre / proportions;
  const zoom = Math.min(3, Math.max(1, 0.5 / (photo.visage.hauteur * couverte)));
  const centre_y = Math.min(1, photo.visage.y + 0.08 / (couverte * zoom));
  return { centre_x: photo.visage.x, centre_y: Math.round(centre_y * 1000) / 1000, zoom: Math.round(zoom * 100) / 100 };
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
  if (champ.type === "masque" || champ.type === "photo") {
    return { x: champ.x_mm, y: champ.y_mm, largeur: champ.largeur_mm, hauteur: champ.hauteur_mm };
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
    else if (/^(prenom|first ?name|given ?name)/.test(simple)) resultat[balise] = "nom-propre";
    else if (balise.length > 1 && balise === balise.toLocaleUpperCase("fr") && /\p{L}/u.test(balise)) resultat[balise] = "majuscules";
  }
  return resultat;
}

/** Où se trouve le visuel par rapport à la carte : dimensions (mm) et fond perdu inclus ou non. */
export interface PlacementVisuel {
  largeur: number;
  hauteur: number;
  avecFondPerdu: boolean;
}

/**
 * Champ créé à partir d'un texte du visuel (balise détectée, ou texte d'exemple remplacé par une
 * information) : même position, même police, même taille et même couleur.
 */
export function champDepuisTexte(
  texte: TexteVisuel,
  contenu: string,
  visuel: PlacementVisuel,
  format: Format,
  existants: Champ[],
  polices: string[],
): ChampTexte {
  const { x, y, echelle } = versCarte({ x: texte.xMm, y: texte.yMm }, visuel, format, visuel.avecFondPerdu);
  const ancre = texte.ancre ?? "start";
  const marge = 4;
  const largeur = ancre === "middle" ? 2 * Math.min(x, format.largeur_mm - x) - 2 * marge : ancre === "end" ? x - marge : format.largeur_mm - x - marge;
  const taille = Math.round(texte.taillePt * echelle * 10) / 10;
  return {
    id: nouvelId(existants),
    type: "texte",
    modele: contenu,
    x_mm: arrondir(x),
    y_mm: arrondir(y),
    police: choisirPolice(texte.police, polices),
    graisse: texte.graisse ?? graisseDuNom(texte.police),
    taille_pt: taille,
    couleur: texte.couleur,
    interlettrage_em: texte.interlettrageEm ?? 0,
    ancre,
    largeur_max_mm: arrondir(Math.max(15, largeur)),
    taille_min_pt: Math.round(taille * 0.75 * 2) / 2,
    lignes_max: 1,
  };
}

/**
 * Champ créé à partir d'un texte lu dans une image (reconnaissance de caractères) : même position,
 * même taille et même couleur ; la police est celle des autres informations, sinon Arial.
 */
export function champDepuisTexteLu(texte: TexteLu, contenu: string, format: Format, existants: Champ[], polices: string[]): ChampTexte {
  const textes = existants.filter((c): c is ChampTexte => c.type === "texte");
  const police = textes[0]?.police ?? (polices.includes("Arial") || polices.length === 0 ? "Arial" : polices[0]);
  const taille = Math.round(texte.taillePt * 10) / 10;
  return {
    id: nouvelId(existants),
    type: "texte",
    modele: contenu,
    x_mm: arrondir(texte.xMm),
    y_mm: arrondir(texte.yMm),
    police,
    graisse: textes[0]?.graisse ?? 400,
    taille_pt: taille,
    couleur: { rgb: texte.couleur },
    interlettrage_em: 0,
    ancre: "start",
    largeur_max_mm: arrondir(Math.max(15, texte.largeurMm, format.largeur_mm - texte.xMm - 4)),
    taille_min_pt: Math.round(taille * 0.75 * 2) / 2,
    lignes_max: 1,
  };
}

/** Balise écrite dans une image et lue par la reconnaissance (« {{NOM}} », parfois « { {NOM} } ») : son nom. */
export function baliseLue(texte: string): string | null {
  const nom = texte.match(/^\s*\{\s*\{\s*([^{}]+?)\s*\}\s*\}\s*$/)?.[1];
  return nom ? nom.trim() : null;
}

/** Cadre d'un texte du visuel sur la carte finie (mm), pour le désigner d'un clic. */
export function boiteTexteVisuel(texte: TexteVisuel, visuel: PlacementVisuel, format: Format) {
  const { x, y, echelle } = versCarte({ x: texte.xMm, y: texte.yMm }, visuel, format, visuel.avecFondPerdu);
  const corps = texte.taillePt * echelle * MM_PAR_POINT;
  const largeur = Math.max(texte.largeurMm * echelle, corps);
  const gauche = texte.ancre === "middle" ? x - largeur / 2 : texte.ancre === "end" ? x - largeur : x;
  return { x: gauche, y: y - corps * 0.8, largeur, hauteur: corps * 1.05 };
}
