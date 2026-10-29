// Accès typé aux commandes du cœur Rust (voir src-tauri/src/commandes.rs).
import { invoke } from "@tauri-apps/api/core";

export type Face = "recto" | "verso";
export type Sortie = "cartes" | "planches";
export type Feuille = "A4" | "A3" | "SRA3";

export interface InfosMoteur {
  versionTypst: string;
  nbPolices: number;
  nbAgentsDemo: number;
}

export interface ErreurMoteur {
  message: string;
  details: string[];
}

export const infosMoteur = () => invoke<InfosMoteur>("infos_moteur");

/** Aperçu SVG d'une face de la carte de démonstration. */
export const apercuDemo = (agent: number, face: Face) => invoke<string>("apercu_demo", { agent, face });

export const exporterDemo = (sortie: Sortie, feuille: Feuille, chemin: string) =>
  invoke<void>("exporter_demo", { sortie, feuille, chemin });

/** Ramène toute erreur (Rust ou JavaScript) au format affiché par l'interface. */
export function enErreurMoteur(erreur: unknown): ErreurMoteur {
  if (typeof erreur === "object" && erreur !== null && "message" in erreur) {
    const { message, details } = erreur as Partial<ErreurMoteur>;
    return { message: String(message), details: Array.isArray(details) ? details : [] };
  }
  return { message: String(erreur), details: [] };
}
