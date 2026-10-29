import { useEffect, useMemo, useState } from "react";
import { analyser } from "../../controle/cartes";
import { controlerCartes, enErreurMoteur, type DonneesAgent, type ErreurMoteur, type MesureTexte, type ModeleCarte } from "../../moteur";

/**
 * Contrôle des cartes : mesures de mise en page calculées par le moteur, puis rapport. Il n'est
 * calculé que lorsqu'il est `actif` (étapes Vérification et Destination), à chaque changement du
 * modèle ou de la liste.
 */
export function useControle(modele: ModeleCarte | null, agents: DonneesAgent[], actif: boolean) {
  const [resultat, setResultat] = useState<{ cle: string; mesures: MesureTexte[] | null; erreur: ErreurMoteur | null } | null>(null);
  const cle = actif && modele && agents.length > 0 ? JSON.stringify([modele, agents]) : "";

  useEffect(() => {
    if (!cle || resultat?.cle === cle) return;
    let actuel = true;
    controlerCartes(modele!, agents).then(
      (mesures) => actuel && setResultat({ cle, mesures, erreur: null }),
      (e) => actuel && setResultat({ cle, mesures: null, erreur: enErreurMoteur(e) }),
    );
    return () => {
      actuel = false;
    };
  }, [cle]); // `cle` résume modele et agents

  const aJour = resultat !== null && resultat.cle === cle;
  const mesures = aJour ? resultat.mesures : null;
  const rapport = useMemo(() => (mesures && modele ? analyser(modele, agents, mesures) : null), [mesures]);
  return { mesures, rapport, erreur: aJour ? resultat.erreur : null, enCours: Boolean(cle) && !aJour };
}

export type Controle = ReturnType<typeof useControle>;
