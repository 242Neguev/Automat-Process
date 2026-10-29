// Les agents vus par le module Signatures : valeurs d'exemple pour l'aperçu, nom et e-mail de chacun.
import { nature, type Nature } from "../donnees/correspondances";
import { lignesRendues } from "./html";
import { balisesSignature, type ModeleSignature } from "./modele";

const EXEMPLES: Partial<Record<Nature, string>> = {
  prenom: "Aïssatou",
  nom: "DIALLO",
  fonction: "Responsable Communication",
  email: "a.diallo@exemple.com",
  mobile: "+237 612 34 56 78",
  fixe: "+237 222 33 44 55",
  telephone: "+237 222 33 44 55",
  direction: "Direction de la Communication",
  site: "Douala",
  matricule: "B102",
};

/** Valeurs d'exemple pour l'aperçu du modèle, avant d'avoir chargé une liste. */
export function valeursExemple(modele: ModeleSignature): Record<string, string> {
  return Object.fromEntries(balisesSignature(modele).map((balise) => [balise, EXEMPLES[nature(balise) ?? "matricule"] ?? balise]));
}

const deNature = (valeurs: Record<string, string>, natures: Nature[]) =>
  Object.entries(valeurs)
    .filter(([balise, valeur]) => valeur && natures.includes(nature(balise) as Nature))
    .map(([, valeur]) => valeur);

/** Nom d'un agent (listes, noms des pages) : sa ligne « Nom », sinon ses prénom et nom. */
export function nomAgent(modele: ModeleSignature, valeurs: Record<string, string>): string {
  const ligneNom = modele.source === "mise-en-page" ? lignesRendues(modele.lignes.filter((l) => l.role === "nom"), valeurs)[0]?.texte : undefined;
  return ligneNom || deNature(valeurs, ["prenom", "nom"]).join(" ") || Object.values(valeurs).find(Boolean) || "Agent";
}

export const emailAgent = (valeurs: Record<string, string>) => deNature(valeurs, ["email"])[0] ?? "";
