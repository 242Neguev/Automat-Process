import { notifications } from "@mantine/notifications";
import { IconCheck } from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { classeurVide } from "../../donnees/listeVide";
import { enregistrerClasseur } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "./signalerErreur";

const t = textes.liste.listeVide;

/** Crée le classeur Excel à faire remplir pour ce modèle : une colonne par information. */
export async function creerListeVide(balises: string[], nomModele: string) {
  const propre = nomModele.replace(/[\\/:*?"<>|]/g, "-").trim() || t.nomParDefaut;
  const choisi = await save({ defaultPath: t.nomFichier(propre), filters: [{ name: t.filtre, extensions: ["xlsx"] }] });
  if (!choisi) return;
  const chemin = /\.xlsx$/i.test(choisi) ? choisi : `${choisi}.xlsx`;
  try {
    await enregistrerClasseur(chemin, classeurVide(balises, t.modeEmploi(nomModele || t.nomParDefaut)));
    notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.cree, message: chemin, autoClose: 10000 });
  } catch (e) {
    signalerErreur(e);
  }
}
