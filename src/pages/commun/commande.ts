import { useEffect, useRef } from "react";
import type { ProjetOuvert } from "../../moteur";

/**
 * Ce que l'accueil (ou la fenêtre) demande à un assistant : essayer l'exemple, rouvrir un projet,
 * ou prendre des fichiers glissés dans la fenêtre.
 */
export type Demande = { type: "exemple" } | { type: "projet"; projet: ProjetOuvert } | { type: "fichiers"; chemins: string[] };

/** Une demande transmise à un assistant ; son numéro change à chaque envoi. */
export type Commande = Demande & { id: number };

/** Exécute chaque commande reçue une seule fois, avec la version à jour de `executer`. */
export function useCommande(commande: Commande | undefined, executer: (commande: Commande) => void) {
  const derniere = useRef(0);
  const aJour = useRef(executer);
  useEffect(() => {
    aJour.current = executer;
  });
  useEffect(() => {
    if (!commande || commande.id === derniere.current) return;
    derniere.current = commande.id;
    aJour.current(commande);
  }, [commande]);
}
