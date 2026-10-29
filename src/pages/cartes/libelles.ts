import { textes } from "../../textes";

/**
 * Textes de l'assistant des cartes. Pour un visuel d'écran (module Visuels numériques), ceux qui
 * parlent de cartes parlent d'images.
 */
export function libellesCartes(ecran: boolean) {
  const c = textes.cartes;
  if (!ecran) return c;
  const e = textes.ecran;
  return {
    ...c,
    titre: e.titre,
    sousTitre: e.sousTitre,
    etapes: { ...c.etapes, ...e.etapes },
    modele: { ...c.modele, ...e.modele },
    controle: { ...c.controle, ...e.controle },
    verification: { ...c.verification, ...e.verification },
    destination: {
      ...c.destination,
      ...e.destination,
      confirmation: { ...c.destination.confirmation, ...e.confirmation },
      numerique: { ...c.destination.numerique, ...e.numerique },
    },
  };
}
