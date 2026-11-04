import { useEffect, useMemo, useState } from "react";
import { apresExport, empreinteCarte, etatsCartes, lireRegistre, type Canal, type EtatCarte, type Registre, type RegistreCanal } from "../../donnees/registre";
import { ecrireRegistre, empreinteModele, lireRegistre as lireRegistreEnregistre, oublierRegistre, type DonneesAgent, type ModeleCarte } from "../../moteur";
import { signalerErreur } from "../commun/signalerErreur";

export interface MiseAJour {
  /** Exports précédents de ce modèle sur ce canal (cartes imprimées ou numériques), s'il y en a. */
  canal: RegistreCanal | undefined;
  /** État de chaque agent (même ordre) ; vide pendant le calcul. */
  etats: EtatCarte[];
  /** Le modèle a changé depuis ces exports : toutes les cartes sont à refaire. */
  modeleChange: boolean;
  /** Note les cartes qui viennent d'être produites. */
  enregistrer: (exportes: DonneesAgent[]) => Promise<void>;
  /** Oublie les exports précédents du modèle (tous canaux). */
  oublier: () => Promise<void>;
}

/**
 * Mise à jour incrémentale : compare les cartes à celles déjà produites avec ce modèle. `cles` donne
 * l'empreinte de l'identité de chaque agent (même ordre que `agents`).
 */
export function useMiseAJour(modele: ModeleCarte, agents: DonneesAgent[], cles: string[], canal: Canal): MiseAJour {
  const [empreinte, setEmpreinte] = useState<string | null>(null);
  const [registre, setRegistre] = useState<Registre | null>(null);
  // Un modèle sans identifiant (projet d'une version précédente) est reconnu à son empreinte.
  const id = modele.id ?? (empreinte ? `m${empreinte}` : null);

  useEffect(() => {
    let actuel = true;
    empreinteModele(modele).then((e) => actuel && setEmpreinte(e), signalerErreur);
    return () => {
      actuel = false;
    };
  }, [modele]);
  useEffect(() => {
    if (!id) return;
    let actuel = true;
    lireRegistreEnregistre(id).then((brut) => actuel && setRegistre(lireRegistre(brut)), signalerErreur);
    return () => {
      actuel = false;
    };
  }, [id]);

  const cartes = useMemo(() => agents.map(empreinteCarte), [agents]);
  const exports = registre?.canaux[canal];
  const etats = useMemo(() => (empreinte ? etatsCartes(cles, cartes, exports, empreinte) : []), [cles, cartes, exports, empreinte]);

  async function enregistrer(exportes: DonneesAgent[]) {
    if (!id || !empreinte) return;
    const rangs = new Map(agents.map((agent, i) => [agent, i]));
    const indices = [...new Set(exportes.map((agent) => rangs.get(agent)).filter((i): i is number => i !== undefined))];
    const nouveau = apresExport(
      registre,
      canal,
      empreinte,
      indices.map((i) => ({ cle: cles[i], carte: cartes[i] })),
    );
    try {
      await ecrireRegistre(id, nouveau);
      setRegistre(nouveau);
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function oublier() {
    if (!id) return;
    try {
      await oublierRegistre(id);
      setRegistre(null);
    } catch (e) {
      signalerErreur(e);
    }
  }

  return { canal: exports, etats, modeleChange: Boolean(exports && empreinte && exports.modele !== empreinte), enregistrer, oublier };
}
