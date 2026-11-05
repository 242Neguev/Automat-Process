// Textes de l'interface (et des documents qu'elle produit), en français ou en anglais au choix de
// l'utilisateur (fenêtre « À propos »). Le choix est gardé ; changer de langue redémarre l'interface.
import { en } from "./i18n/en";
import { fr, type Textes } from "./i18n/fr";

export type Langue = "fr" | "en";
const CLE = "automat-process.langue";

function langueChoisie(): Langue {
  try {
    return localStorage.getItem(CLE) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

/** Langue de l'interface : le français, sauf si l'utilisateur a choisi l'anglais. */
export const langue: Langue = langueChoisie();
export const textes: Textes = langue === "en" ? en : fr;
/** Pour les dates et les nombres : « 4 novembre 2026 », « 4 November 2026 ». */
export const locale = langue === "en" ? "en-GB" : "fr-FR";

/** Change de langue : le choix est gardé, puis l'interface redémarre pour relire ses textes. */
export function changerLangue(nouvelle: Langue) {
  try {
    localStorage.setItem(CLE, nouvelle);
  } catch {
    // Stockage indisponible : la langue ne changera pas.
  }
  window.location.reload();
}
