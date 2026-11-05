import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { nomPhoto, type Photos } from "../../donnees/agents";
import type { Correspondances } from "../../donnees/correspondances";
import type { Liste } from "../../donnees/liste";
import { chargerPhotos, type ChampPhoto, type ModeleCarte, type PhotoChargee, type Recadrage } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "../commun/signalerErreur";

/** Photos chargées par lots : la progression s'affiche, la fenêtre ne se fige pas. */
const LOT = 8;
const CHEMIN_COMPLET = /^([a-zA-Z]:[\\/]|\\\\|\/)/;

export interface EtatPhotos {
  /** Le modèle a des cadres photo. */
  actives: boolean;
  dossier: string | null;
  choisirDossier: () => Promise<void>;
  /** Pendant le chargement : photos chargées sur le total à charger. */
  progression: { fait: number; total: number } | null;
  /** Noms (tels qu'écrits dans la liste) des photos trouvées, et de celles qui manquent. */
  trouvees: string[];
  manquantes: PhotoChargee[];
  /** Agents sans photo dans la liste (cellule vide). */
  sansPhoto: number;
  /** Photos et recadrages, pour construire les agents. */
  contexte: Photos;
  /** Recadrage fait à la main (ou `null` : retour au recadrage automatique). */
  recadrer: (cle: string, recadrage: Recadrage | null) => void;
  /** Réglages enregistrés avec le projet (dossier et recadrages : jamais les photos). */
  aEnregistrer: () => { dossier: string | null; recadrages: Record<string, Recadrage> };
  restaurer: (reglages: { dossier?: unknown; recadrages?: unknown }) => void;
}

/**
 * Photos des agents : les noms lus dans la liste (une colonne par cadre photo) sont cherchés dans le
 * dossier choisi, chargés par le cœur (réduites, redressées, visage repéré sous Windows) et gardés
 * pour la session.
 */
export function usePhotos(modele: ModeleCarte | null, liste: Liste | null, correspondances: Correspondances): EtatPhotos {
  const [dossier, setDossier] = useState<string | null>(null);
  const [chargees, setChargees] = useState<Map<string, PhotoChargee>>(() => new Map());
  const [recadrages, setRecadrages] = useState<Record<string, Recadrage>>({});
  const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null);
  const cadres = useMemo(() => modele?.champs.filter((c): c is ChampPhoto => c.type === "photo") ?? [], [modele]);

  // Noms demandés par la liste, et nombre d'agents sans photo.
  const { noms, sansPhoto } = useMemo(() => {
    const tous = new Set<string>();
    let vides = 0;
    for (const ligne of liste?.lignes ?? []) {
      const deLigne = cadres.map((cadre) => nomPhoto(cadre, ligne, correspondances));
      if (deLigne.every((nom) => !nom)) vides += 1;
      for (const nom of deLigne) if (nom) tous.add(nom);
    }
    return { noms: [...tous], sansPhoto: cadres.length > 0 ? vides : 0 };
  }, [liste, cadres, correspondances]);

  useEffect(() => {
    // Sans dossier, seuls les chemins complets peuvent être trouvés.
    const aCharger = noms.filter((nom) => !chargees.has(nom) && (dossier || CHEMIN_COMPLET.test(nom)));
    if (aCharger.length === 0) return;
    let actuel = true;
    (async () => {
      const nouvelles = new Map(chargees);
      setProgression({ fait: 0, total: aCharger.length });
      for (let i = 0; i < aCharger.length; i += LOT) {
        const lot = await chargerPhotos(dossier ?? "", aCharger.slice(i, i + LOT));
        if (!actuel) return;
        for (const photo of lot) nouvelles.set(photo.nom, photo);
        setChargees(new Map(nouvelles));
        setProgression({ fait: Math.min(i + LOT, aCharger.length), total: aCharger.length });
      }
      setProgression(null);
    })().catch((e) => {
      setProgression(null);
      signalerErreur(e);
    });
    return () => {
      actuel = false;
    };
  }, [noms, dossier]); // `chargees` : lu au lancement, complété au fil du chargement

  async function choisirDossier() {
    const choisi = await open({ directory: true, multiple: false, title: textes.liste.photos.choisirTitre });
    if (typeof choisi !== "string") return;
    // Les photos introuvables dans l'ancien dossier sont cherchées dans le nouveau.
    setChargees(new Map());
    setDossier(choisi);
  }

  const contexte = useMemo(() => ({ chargees, recadrages }), [chargees, recadrages]);
  const demandees = noms.map((nom) => chargees.get(nom)).filter((p): p is PhotoChargee => Boolean(p));
  return {
    actives: cadres.length > 0,
    dossier,
    choisirDossier,
    progression,
    trouvees: demandees.filter((p) => p.chemin).map((p) => p.nom),
    manquantes: demandees.filter((p) => !p.chemin),
    sansPhoto,
    contexte,
    recadrer: (cle, recadrage) =>
      setRecadrages((actuels) => {
        const suivants = { ...actuels };
        if (recadrage) suivants[cle] = recadrage;
        else delete suivants[cle];
        return suivants;
      }),
    aEnregistrer: () => ({ dossier, recadrages }),
    restaurer: (reglages) => {
      if (typeof reglages.dossier === "string") {
        setChargees(new Map());
        setDossier(reglages.dossier);
      }
      if (reglages.recadrages && typeof reglages.recadrages === "object") setRecadrages(reglages.recadrages as Record<string, Recadrage>);
    },
  };
}
