import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkBook } from "xlsx";
import urlListeExemple from "../../assets/exemple-agents.xlsx?url";
import { controlerListe } from "../../donnees/controle";
import { fusionner, type Correspondances } from "../../donnees/correspondances";
import { lireFeuille, ouvrirClasseur } from "../../donnees/liste";
import { lireListe } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "./signalerErreur";

const EXTENSIONS_LISTE = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"];

/**
 * Liste des agents (fichier Excel, CSV ou ODS) et association de ses colonnes aux balises du
 * modèle : automatique, en gardant les choix faits à la main. Partagée par tous les assistants.
 */
export function useListe(balises: string[]) {
  const [classeur, setClasseur] = useState<{ nomFichier: string; contenu: WorkBook } | null>(null);
  const [feuille, setFeuille] = useState<string | null>(null);
  const [correspondances, setCorrespondances] = useState<Correspondances>({});
  const cleBalises = balises.join("\u0000");
  const liste = useMemo(
    () => (classeur && feuille ? lireFeuille(classeur.contenu, classeur.nomFichier, feuille) : null),
    [classeur, feuille],
  );
  useEffect(() => {
    if (liste) setCorrespondances((precedentes) => fusionner(balises, liste.colonnes, precedentes));
  }, [liste, cleBalises]); // `cleBalises` résume `balises`
  const anomalies = useMemo(() => (liste ? controlerListe(liste, balises, correspondances) : []), [liste, cleBalises, correspondances]);

  function ouvrir(contenu: ArrayBuffer, nomFichier: string) {
    try {
      const nouveau = ouvrirClasseur(contenu, nomFichier);
      setClasseur({ nomFichier, contenu: nouveau });
      setFeuille(nouveau.SheetNames[0] ?? null);
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function importer() {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: textes.liste.filtre, extensions: EXTENSIONS_LISTE }] });
    if (typeof chemin !== "string") return;
    try {
      ouvrir(await lireListe(chemin), chemin.split(/[\\/]/).pop() ?? chemin);
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function utiliserExemple() {
    try {
      const reponse = await fetch(urlListeExemple);
      ouvrir(await reponse.arrayBuffer(), "exemple-agents.xlsx");
    } catch (e) {
      signalerErreur(e);
    }
  }

  return {
    liste,
    feuilles: classeur?.contenu.SheetNames ?? [],
    setFeuille,
    correspondances,
    relier: (balise: string, colonne: string | null) => setCorrespondances((actuelles) => ({ ...actuelles, [balise]: colonne })),
    /** Correspondances d'un projet rouvert, accordées à la liste déjà chargée. */
    restaurer: (enregistrees: Correspondances, balisesDuProjet: string[]) =>
      setCorrespondances(liste ? fusionner(balisesDuProjet, liste.colonnes, enregistrees) : enregistrees),
    anomalies,
    importer,
    utiliserExemple,
  };
}
