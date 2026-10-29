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

export interface ChampTexte {
  id: string;
  type: "texte";
  /** Texte avec balises, ex. « Tél. {{Fixe}} ». */
  modele: string;
}

export interface ChampQr {
  id: string;
  type: "qr";
  /** Contenu de la vCard : textes avec balises ou valeurs fixes, ex. { nom: "{{NOM}}", organisation: "EXEMPLE SA" }. */
  vcard?: Partial<Record<keyof ChampsVCard, string>>;
}

export interface ModeleCarte {
  nom: string;
  format: { largeur_mm: number; hauteur_mm: number; fond_perdu_mm: number };
  transformations?: Record<string, Transformation>;
  champs: (ChampTexte | ChampQr)[];
}

/** Un agent prêt à être rendu : texte final de chaque champ et vCard du QR code. */
export interface DonneesAgent {
  id: string;
  valeurs: Record<string, string>;
  vcard?: string;
}

export const infosMoteur = () => invoke<InfosMoteur>("infos_moteur");
export const modeleDemo = () => invoke<ModeleCarte>("modele_demo");

/** Aperçu SVG d'une face de la carte d'un agent. */
export const apercuCarte = (agent: DonneesAgent, face: Face) => invoke<string>("apercu_carte", { agent, face });

export const exporterCartes = (agents: DonneesAgent[], sortie: Sortie, feuille: Feuille, chemin: string) =>
  invoke<void>("exporter_cartes", { agents, sortie, feuille, chemin });

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
