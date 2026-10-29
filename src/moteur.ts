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

export type Champ = ChampTexte | ChampQr;

export interface ModeleCarte {
  nom: string;
  format: { largeur_mm: number; hauteur_mm: number; fond_perdu_mm: number };
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

/** Contenu brut d'un fichier de liste choisi par l'utilisateur. */
export const lireListe = (chemin: string) => invoke<ArrayBuffer>("lire_liste", { chemin });

/** Ramène toute erreur (Rust ou JavaScript) au format affiché par l'interface. */
export function enErreurMoteur(erreur: unknown): ErreurMoteur {
  if (typeof erreur === "object" && erreur !== null && "message" in erreur) {
    const { message, details } = erreur as Partial<ErreurMoteur>;
    return { message: String(message), details: Array.isArray(details) ? details : [] };
  }
  return { message: String(erreur), details: [] };
}
