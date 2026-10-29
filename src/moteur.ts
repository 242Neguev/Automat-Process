// Accès typé aux commandes du cœur Rust (voir src-tauri/src/commandes.rs).
import { invoke } from "@tauri-apps/api/core";
import type { Transformation } from "./donnees/nettoyage";
import type { ChampsVCard } from "./donnees/vcard";

export type Face = "recto" | "verso";
export type Sortie = "cartes" | "planches";
export type Feuille = "A4" | "A3" | "SRA3";

export interface InfosMoteur {
  versionTypst: string;
  nbPolices: number;
}

export interface ErreurMoteur {
  message: string;
  details: string[];
}

/** Couleur d'un champ : hexadécimal pour l'écran, ou CMJN en % pour l'imprimeur. */
export type Couleur = { rgb: string } | { cmyk: [number, number, number, number] };

/** Positions et tailles en mm depuis le coin haut-gauche de la carte finie (hors fond perdu). */
export interface ChampTexte {
  id: string;
  type: "texte";
  /** Texte avec balises, ex. « Tél. {{Fixe}} ». */
  modele: string;
  /** Point d'ancrage, sur la ligne de base du texte. */
  x_mm: number;
  y_mm: number;
  police: string;
  graisse: number;
  taille_pt: number;
  couleur: Couleur;
  interlettrage_em: number;
  ancre: "start" | "middle" | "end";
  largeur_max_mm: number;
  taille_min_pt: number;
  lignes_max: number;
}

export interface ChampQr {
  id: string;
  type: "qr";
  x_mm: number;
  y_mm: number;
  taille_mm: number;
  couleur: Couleur;
  /** Contenu de la vCard : textes avec balises ou valeurs fixes, ex. { nom: "{{NOM}}", organisation: "EXEMPLE SA" }. */
  vcard?: Partial<Record<keyof ChampsVCard, string>>;
}

/** Zone effacée : un aplat posé sur le visuel (texte d'exemple incrusté dans une image). */
export interface ChampMasque {
  id: string;
  type: "masque";
  x_mm: number;
  y_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  couleur: Couleur;
}

export type Champ = ChampTexte | ChampQr | ChampMasque;

export interface ModeleCarte {
  nom: string;
  /** `px` : format d'écran (fond Teams, bannière…), exporté à cette taille en pixels. */
  format: { largeur_mm: number; hauteur_mm: number; fond_perdu_mm: number; px?: { largeur: number; hauteur: number } };
  /** Chemins virtuels des visuels (« /fonds/1.pdf »), ou vide pour une carte blanche. */
  fond_recto: string | null;
  fond_verso: string | null;
  /** Le visuel contient-il déjà le fond perdu ? Sinon, le fond perdu est complété à partir de ses bords. */
  fond_recto_avec_fond_perdu?: boolean;
  fond_verso_avec_fond_perdu?: boolean;
  transformations?: Record<string, Transformation>;
  champs: Champ[];
}

/** Un agent prêt à être rendu : texte final de chaque champ et vCard du QR code. */
export interface DonneesAgent {
  id: string;
  valeurs: Record<string, string>;
  vcard?: string;
  /** Cartes numériques : lien de certains champs (tel:, mailto:, https:), cliquable dans le PDF. */
  liens?: Record<string, string>;
  /** Nom de l'agent, affiché sur le bon à tirer. */
  libelle?: string;
}

export interface OptionsNumerique {
  format: "png" | "jpg" | "pdf";
  /** Largeur des images, en pixels. */
  largeurPx: number;
  verso: boolean;
}

/** Ligne de texte d'un visuel (PDF ou SVG), en mm depuis le coin haut-gauche du visuel. */
export interface TexteVisuel {
  id: number;
  texte: string;
  /** Point d'ancrage, sur la ligne de base. */
  xMm: number;
  yMm: number;
  largeurMm: number;
  taillePt: number;
  /** Nom de police (famille, ou nom PostScript pour un PDF : « Arial-BoldMT »). */
  police: string;
  couleur: Couleur;
  graisse?: number;
  ancre?: "start" | "middle" | "end";
  interlettrageEm?: number;
}

/**
 * Mise en page réelle d'un texte sur la carte d'un agent (mm depuis le coin haut-gauche de la carte
 * finie) : taille retenue, nombre de lignes, débordement et encombrement de l'encre.
 */
export interface MesureTexte {
  agent: string;
  champ: string;
  taille: number;
  origine: number;
  lignes: number;
  deborde: boolean;
  gauche: number;
  droite: number;
  haut: number;
  bas: number;
  /** Ligne de base de la dernière ligne. */
  base: number;
}

/** Visuel importé : chemin virtuel à reprendre dans le modèle et ce qu'on sait de ses dimensions. */
export interface FondImporte {
  chemin: string;
  nomFichier: string;
  genre: "svg" | "pdf" | "image";
  largeurMm: number | null;
  hauteurMm: number | null;
  fondPerduMm: number | null;
  largeurPx: number | null;
  hauteurPx: number | null;
  texte: string | null;
  /** PDF : lignes à balises, déjà retirées du visuel. */
  champs: TexteVisuel[];
  /** PDF : textes restant dans le visuel. */
  textes: TexteVisuel[];
}

/** Zone de la carte finie, en mm. */
export interface Zone {
  x_mm: number;
  y_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
}

/** Sorte de document d'un projet : chacune s'ouvre dans son module. */
export type Document = "carte" | "ecran" | "signature" | "word";

export interface ProjetOuvert {
  document: Document;
  /** Modèle de carte (ModeleCarte) ou de signature, selon `document`. */
  modele: unknown;
  correspondances: Record<string, string | null>;
  visuels: Partial<Record<Face, FondImporte & Record<string, unknown>>>;
}

export const infosMoteur = () => invoke<InfosMoteur>("infos_moteur");
export const famillesPolices = () => invoke<string[]>("familles_polices");
export const modeleDemo = () => invoke<ModeleCarte>("modele_demo");
export const importerFond = (chemin: string) => invoke<FondImporte>("importer_fond", { chemin });
export const remplacerFond = (chemin: string, svg: string) => invoke<void>("remplacer_fond", { chemin, svg });

/** Aperçu SVG d'une face de la carte d'un agent. */
export const apercuCarte = (modele: ModeleCarte, agent: DonneesAgent, face: Face) =>
  invoke<string>("apercu_carte", { modele, agent, face });

export const exporterCartes = (modele: ModeleCarte, agents: DonneesAgent[], sortie: Sortie, feuille: Feuille, chemin: string) =>
  invoke<void>("exporter_cartes", { modele, agents, sortie, feuille, chemin });

/** Bon à tirer des cartes données (une page A4 par carte), enregistré dans `chemin`. */
export const exporterBat = (modele: ModeleCarte, agents: DonneesAgent[], titre: string, date: string, chemin: string) =>
  invoke<void>("exporter_bat", { modele, agents, titre, date, chemin });

/**
 * Cartes numériques dans le nouveau dossier `sousDossier` de `dossier` (chemin renvoyé) : une image
 * ou un PDF cliquable par agent, nommé d'après `noms`, et sa fiche contact quand `fiches` la donne.
 */
export const exporterNumerique = (
  modele: ModeleCarte,
  agents: DonneesAgent[],
  noms: string[],
  fiches: string[],
  options: OptionsNumerique,
  dossier: string,
  sousDossier: string,
) => invoke<string>("exporter_numerique", { modele, agents, noms, fiches, options, dossier, sousDossier });

/** Mesures de mise en page de chaque texte de chaque agent, pour le rapport de contrôle. */
export const controlerCartes = (modele: ModeleCarte, agents: DonneesAgent[]) => invoke<MesureTexte[]>("controler_cartes", { modele, agents });

/** Vignettes JPEG du recto des agents (dans leur ordre), larges de `largeurPx` pixels. */
export async function vignettesCartes(modele: ModeleCarte, agents: DonneesAgent[], largeurPx: number): Promise<Blob[]> {
  const octets = new Uint8Array(await invoke<ArrayBuffer>("vignettes_cartes", { modele, agents, largeurPx }));
  // Chaque image est précédée de sa taille sur 4 octets (gros-boutiste).
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const images: Blob[] = [];
  for (let i = 0; i + 4 <= octets.length; ) {
    const taille = vue.getUint32(i);
    images.push(new Blob([octets.slice(i + 4, i + 4 + taille)], { type: "image/jpeg" }));
    i += 4 + taille;
  }
  return images;
}

/** Nombre de pages d'un PDF. */
export const infosPdf = (chemin: string) => invoke<number>("infos_pdf", { chemin });

/** Fusionne des PDF, dans l'ordre donné, dans le fichier `sortie`. */
export const fusionnerPdf = (chemins: string[], sortie: string) => invoke<void>("fusionner_pdf", { chemins, sortie });

/** Sépare un PDF en fichiers de `pagesParFichier` pages, nommés d'après `noms` ; renvoie le dossier créé. */
export const separerPdf = (chemin: string, pagesParFichier: number, noms: string[], dossier: string, sousDossier: string) =>
  invoke<string>("separer_pdf", { chemin, pagesParFichier, noms, dossier, sousDossier });

/** Parties XML à remplir d'un modèle Word (chemin dans l'archive → XML). */
export const lireModeleWord = (chemin: string) => invoke<Record<string, string>>("lire_modele_word", { chemin });

/** Un courrier à écrire : nom du fichier (sans extension) et parties remplies. */
export interface Courrier {
  nom: string;
  parties: Record<string, string>;
}

/** Courriers écrits : leur dossier et le chemin de chacun. */
export interface CourriersEcrits {
  dossier: string;
  fichiers: string[];
}

/** Écrit des courriers Word d'après le modèle, dans le dossier `sousDossier` de `dossier` (créé au besoin). */
export const ecrireCourriers = (modele: string, courriers: Courrier[], dossier: string, sousDossier: string) =>
  invoke<CourriersEcrits>("ecrire_courriers", { modele, courriers, dossier, sousDossier });

/** Conversion en PDF : logiciel utilisé et PDF créés, dans l'ordre des documents. */
export interface Conversion {
  convertisseur: "word" | "libreoffice";
  pdfs: string[];
}

/** Convertit des courriers Word en PDF (Word, sinon LibreOffice) dans le dossier `sousDossier` de `dossier`. */
export const convertirCourriers = (documents: string[], dossier: string, sousDossier: string, supprimerSources: boolean) =>
  invoke<Conversion>("convertir_courriers", { documents, dossier, sousDossier, supprimerSources });

/** Aperçu fidèle d'un courrier : ses pages en SVG, telles que Word les produit. */
export const apercuCourrier = (modele: string, courrier: Courrier) => invoke<string[]>("apercu_courrier", { modele, courrier });

/** Dossier temporaire neuf, et sa suppression (documents intermédiaires). */
export const dossierTemporaire = () => invoke<string>("dossier_temporaire");
export const supprimerTemporaire = (dossier: string) => invoke<void>("supprimer_temporaire", { dossier });

/** Imprimante installée (impression directe, sous Windows). */
export interface Imprimante {
  nom: string;
  parDefaut: boolean;
  /** Le pilote sait imprimer recto verso. */
  rectoVerso: boolean;
}

export interface ReglagesImpression {
  rectoVerso: boolean;
  /** Le verso est tourné d'un demi-tour (selon le sens où l'imprimante retourne la carte). */
  retournerVerso: boolean;
  /** Exemplaires de chaque carte. */
  exemplaires: number;
}

export const imprimantes = () => invoke<Imprimante[]>("imprimantes");

export const imprimerCartes = (modele: ModeleCarte, agents: DonneesAgent[], imprimante: string, reglages: ReglagesImpression) =>
  invoke<void>("imprimer_cartes", { modele, agents, imprimante, reglages });

/** Couleur du visuel tout autour d'une zone : elle sert à effacer un texte incrusté. */
export const couleurAutour = (modele: ModeleCarte, zone: Zone) => invoke<string>("couleur_autour", { modele, zone });

/** Retire un texte d'exemple d'un visuel PDF ; renvoie la ligne retirée et les textes restants. */
export const retirerTextePdf = (chemin: string, id: number) =>
  invoke<{ texte: TexteVisuel; textes: TexteVisuel[] }>("retirer_texte_pdf", { chemin, id });

export const enregistrerProjet = (chemin: string, document: Document, modele: unknown, correspondances: Record<string, string | null>, visuels: unknown) =>
  invoke<void>("enregistrer_projet", { chemin, document, modele, correspondances, visuels });

export const ouvrirProjet = (chemin: string) => invoke<ProjetOuvert>("ouvrir_projet", { chemin });

/** Contenu brut d'un fichier de liste choisi par l'utilisateur. */
export const lireListe = (chemin: string) => invoke<ArrayBuffer>("lire_liste", { chemin });

/** Contenu brut d'un fichier choisi par l'utilisateur, après contrôle de son format et de sa taille. */
export const lireFichier = (chemin: string, nature: "liste" | "image" | "signature") => invoke<ArrayBuffer>("lire_fichier", { chemin, nature });

/** Fichier à créer : un texte (HTML) ou des octets (image). */
export type FichierAEcrire = { nom: string; texte: string } | { nom: string; octets: number[] };

/** Écrit des fichiers dans un nouveau dossier `sousDossier` de `dossier` ; renvoie son chemin. */
export const ecrireFichiers = (dossier: string, sousDossier: string, fichiers: FichierAEcrire[]) =>
  invoke<string>("ecrire_fichiers", { dossier, sousDossier, fichiers });

/** Ramène toute erreur (Rust ou JavaScript) au format affiché par l'interface. */
export function enErreurMoteur(erreur: unknown): ErreurMoteur {
  if (typeof erreur === "object" && erreur !== null && "message" in erreur) {
    const { message, details } = erreur as Partial<ErreurMoteur>;
    return { message: String(message), details: Array.isArray(details) ? details : [] };
  }
  return { message: String(erreur), details: [] };
}
