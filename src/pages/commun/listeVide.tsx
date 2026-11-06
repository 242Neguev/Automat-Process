import { save } from "@tauri-apps/plugin-dialog";
import { classeurVide } from "../../donnees/listeVide";
import { enregistrerClasseur } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "./signalerErreur";

const t = textes.liste.listeVide;

/** Crée le classeur Excel à faire remplir pour ce modèle : une colonne par information. Renvoie son chemin. */
export async function creerListeVide(balises: string[], nomModele: string): Promise<string | null> {
  const propre = nomModele.replace(/[\\/:*?"<>|]/g, "-").trim() || t.nomParDefaut;
  const choisi = await save({ defaultPath: t.nomFichier(propre), filters: [{ name: t.filtre, extensions: ["xlsx"] }] });
  if (!choisi) return null;
  const chemin = /\.xlsx$/i.test(choisi) ? choisi : `${choisi}.xlsx`;
  try {
    await enregistrerClasseur(chemin, classeurVide(balises, t.modeEmploi(nomModele || t.nomParDefaut)));
    return chemin;
  } catch (e) {
    signalerErreur(e);
    return null;
  }
}
