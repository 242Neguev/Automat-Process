import { useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { balisesDuModele, construireAgent, ficheContact, liensAgent, valeursDeLigne } from "../../donnees/agents";
import { FORMATS, FORMATS_ECRAN } from "../../modele/formats";
import { pourEnregistrer, preparerVisuel, type Visuel } from "../../modele/visuels";
import { famillesPolices, modeleDemo, type Face, type ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import EtapeListe from "../commun/EtapeListe";
import { BoutonsProjet, choisirProjet, enregistrerSous, projetOuvert } from "../commun/projet";
import { signalerErreur } from "../commun/signalerErreur";
import { useListe } from "../commun/useListe";
import EtapeDestination from "./EtapeDestination";
import EtapeModele, { type Source } from "./EtapeModele";
import EtapeVerification, { type Filtre } from "./EtapeVerification";
import { libellesCartes } from "./libelles";
import { useControle } from "./useControle";

const t = textes.cartes;

/** Modèle vierge : carte de visite, ou fond d'écran pour les visuels numériques. */
function modeleVierge(ecran: boolean): ModeleCarte {
  const { largeur_mm, hauteur_mm, fond_perdu_mm, px } = ecran ? FORMATS_ECRAN[0] : FORMATS[0];
  return { nom: ecran ? textes.ecran.nomModele : t.modele.nomPerso, format: { largeur_mm, hauteur_mm, fond_perdu_mm, px }, fond_recto: null, fond_verso: null, transformations: {}, champs: [] };
}

/**
 * Assistant « Cartes de visite » : Modèle → Liste → Vérification → Destination. La variante « écran »
 * (module Visuels numériques) part d'un fond d'écran Teams et n'exporte que des images.
 */
export default function AssistantCartes({ variante = "cartes" }: { variante?: "cartes" | "ecran" }) {
  const ecran = variante === "ecran";
  const libelles = libellesCartes(ecran);
  const [etape, setEtape] = useState(0);
  const [source, setSource] = useState<Source>("perso");
  const [modeles, setModeles] = useState<Record<Source, ModeleCarte | null>>({ perso: modeleVierge(ecran), demo: null });
  const [visuels, setVisuels] = useState<Partial<Record<Face, Visuel>>>({});
  const [polices, setPolices] = useState<string[]>([]);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  // Change à chaque projet ouvert : l'étape Modèle repart d'un état neuf (outil, sélection).
  const [ouvertures, setOuvertures] = useState(0);
  const modele = modeles[source];

  useEffect(() => {
    famillesPolices().then(setPolices, signalerErreur);
  }, []);
  useEffect(() => {
    if (source === "demo" && !modeles.demo) modeleDemo().then((demo) => setModeles((m) => ({ ...m, demo })), signalerErreur);
  }, [source, modeles.demo]);

  const balises = useMemo(() => (modele ? balisesDuModele(modele) : []), [modele]);
  const donnees = useListe(balises);
  const { liste, correspondances } = donnees;

  const agents = useMemo(
    () => (modele && liste ? liste.lignes.map((ligne) => construireAgent(modele, ligne, correspondances)) : []),
    [modele, liste, correspondances],
  );
  // Cartes numériques : liens cliquables et fiche contact, calculés seulement à l'étape Destination.
  const numeriques = useMemo(() => {
    if (etape < 3 || !modele || !liste) return [];
    return liste.lignes.map((ligne) => {
      const valeurs = valeursDeLigne(modele, ligne, correspondances);
      return { liens: liensAgent(modele, valeurs), fiche: ficheContact(modele, valeurs) };
    });
  }, [etape, modele, liste, correspondances]);
  // Le contrôle des cartes sert à la vérification et à l'export.
  const controle = useControle(modele, agents, etape >= 2);
  const exemple = useMemo(
    () => (modele && liste?.lignes[0] ? valeursDeLigne(modele, liste.lignes[0], correspondances) : {}),
    [modele, liste, correspondances],
  );

  /** Enregistre le modèle, ses visuels et les correspondances (jamais les données des agents). */
  function enregistrer() {
    if (!modele) return;
    const infos = Object.fromEntries(Object.entries(source === "perso" ? visuels : {}).map(([face, visuel]) => [face, pourEnregistrer(visuel)]));
    return enregistrerSous(ecran ? "ecran" : "carte", modele.nom, modele, correspondances, infos);
  }

  async function ouvrirFichierProjet() {
    const projet = await choisirProjet(ecran ? "ecran" : "carte");
    if (!projet) return;
    const modeleOuvert = projet.modele as ModeleCarte;
    const ouverts: Partial<Record<Face, Visuel>> = {};
    for (const face of ["recto", "verso"] as Face[]) {
      const fond = projet.visuels[face];
      if (fond) ouverts[face] = preparerVisuel(fond, polices).visuel;
    }
    setModeles((m) => ({ ...m, perso: modeleOuvert }));
    setVisuels(ouverts);
    donnees.restaurer(projet.correspondances, balisesDuModele(modeleOuvert));
    setSource("perso");
    setEtape(0);
    setOuvertures((n) => n + 1);
    projetOuvert(modeleOuvert.nom);
  }

  // Une zone effacée seule ne suffit pas : il faut au moins une information ou un QR code.
  const etapePrete = [modele !== null && modele.champs.some((champ) => champ.type !== "masque"), agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];

  return (
    <Stack gap="lg" maw={1240}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{libelles.titre}</Title>
          <Text c="dimmed">{libelles.sousTitre}</Text>
        </div>
        <BoutonsProjet onOuvrir={ouvrirFichierProjet} onEnregistrer={enregistrer} enregistrable={Boolean(modele)} />
      </Group>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={libelles.etapes.modele.titre} description={libelles.etapes.modele.description}>
          {modele && (
            <EtapeModele
              key={ouvertures}
              source={source}
              onSource={setSource}
              modele={modele}
              onModele={(modification) => setModeles((m) => ({ ...m, [source]: m[source] ? modification(m[source]) : m[source] }))}
              visuels={source === "perso" ? visuels : {}}
              onVisuels={setVisuels}
              polices={polices}
              avecDemo={!ecran}
            />
          )}
        </Stepper.Step>
        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            correspondances={correspondances}
            exemple={exemple}
            anomalies={donnees.anomalies}
            onImporter={donnees.importer}
            onExemple={donnees.utiliserExemple}
            onFeuille={donnees.setFeuille}
            onCorrespondance={donnees.relier}
          />
        </Stepper.Step>
        <Stepper.Step label={libelles.etapes.verification.titre} description={libelles.etapes.verification.description}>
          {modele && <EtapeVerification modele={modele} agents={agents} controle={controle} filtre={filtre} onFiltre={setFiltre} />}
        </Stepper.Step>
        <Stepper.Step label={libelles.etapes.destination.titre} description={libelles.etapes.destination.description}>
          {modele && (
            <EtapeDestination
              modele={modele}
              agents={agents}
              numeriques={numeriques}
              controle={controle}
              onVoirCartes={() => {
                setFiltre("a-verifier");
                setEtape(2);
              }}
            />
          )}
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="default" disabled={etape === 0} onClick={() => setEtape(etape - 1)}>
          {t.precedent}
        </Button>
        {etape < 3 && (
          <Button disabled={!etapePrete[etape]} onClick={() => setEtape(etape + 1)}>
            {t.suivant}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
