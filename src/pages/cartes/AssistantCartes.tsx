import { useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { balisesDuModele, construireAgent, ficheContact, liensAgent, valeursDeLigne } from "../../donnees/agents";
import { quantitesDe } from "../../donnees/quantite";
import { identites, nouvelIdentifiant } from "../../donnees/registre";
import { FORMATS, FORMATS_ECRAN } from "../../modele/formats";
import { pourEnregistrer, preparerVisuel, type Emplacement, type Visuels } from "../../modele/visuels";
import { famillesPolices, modeleDemo, type ModeleCarte } from "../../moteur";
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
import { usePhotos } from "./usePhotos";

const t = textes.cartes;

/** Modèle vierge : carte de visite, ou fond d'écran pour les visuels numériques. */
function modeleVierge(ecran: boolean): ModeleCarte {
  const { largeur_mm, hauteur_mm, fond_perdu_mm, px } = ecran ? FORMATS_ECRAN[0] : FORMATS[0];
  return {
    id: nouvelIdentifiant(),
    nom: ecran ? textes.ecran.nomModele : t.modele.nomPerso,
    format: { largeur_mm, hauteur_mm, fond_perdu_mm, px },
    fond_recto: null,
    fond_verso: null,
    transformations: {},
    champs: [],
  };
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
  const [visuels, setVisuels] = useState<Visuels>({});
  const [polices, setPolices] = useState<string[]>([]);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  // Change à chaque projet ouvert : l'étape Modèle repart d'un état neuf (outil, sélection).
  const [ouvertures, setOuvertures] = useState(0);
  const modele = modeles[source];
  const verrouille = Boolean(modele?.verrouille);
  const verrouiller = (verrou: boolean) =>
    setModeles((m) => {
      const actuel = m[source];
      return actuel ? { ...m, [source]: { ...actuel, verrouille: verrou } } : m;
    });

  useEffect(() => {
    famillesPolices().then(setPolices, signalerErreur);
  }, []);
  useEffect(() => {
    if (source === "demo" && !modeles.demo) modeleDemo().then((demo) => setModeles((m) => ({ ...m, demo: { ...demo, id: "demo" } })), signalerErreur);
  }, [source, modeles.demo]);

  const balises = useMemo(() => (modele ? balisesDuModele(modele) : []), [modele]);
  const donnees = useListe(balises);
  const { liste, correspondances } = donnees;

  // Photos des agents (cadres photo du modèle) : chargées depuis le dossier choisi à l'étape Liste.
  const photos = usePhotos(modele, liste, correspondances);
  const agents = useMemo(
    () => (modele && liste ? liste.lignes.map((ligne) => construireAgent(modele, ligne, correspondances, photos.contexte)) : []),
    [modele, liste, correspondances, photos.contexte],
  );
  // Mise à jour incrémentale : identité de chaque agent d'une liste à la suivante (empreintes).
  const cles = useMemo(() => (liste ? identites(liste.lignes, liste.colonnes) : []), [liste]);
  // Nombre de cartes de chaque agent (colonne « Quantité »), pour les cartes imprimées seulement.
  const colonneQuantite = ecran ? null : donnees.colonneQuantite;
  const quantites = useMemo(() => (liste ? quantitesDe(liste.lignes, colonneQuantite) : []), [liste, colonneQuantite]);
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
    const infos = Object.fromEntries(Object.entries(source === "perso" ? visuels : {}).flatMap(([face, visuel]) => (visuel ? [[face, pourEnregistrer(visuel)]] : [])));
    // Avec les correspondances : le dossier des photos et leurs recadrages (jamais les photos elles-mêmes).
    const reglages = photos.actives ? { "@photos": photos.aEnregistrer() } : {};
    return enregistrerSous(ecran ? "ecran" : "carte", modele.nom, modele, { ...donnees.aEnregistrer(), ...reglages }, infos);
  }

  async function ouvrirFichierProjet() {
    const projet = await choisirProjet(ecran ? "ecran" : "carte");
    if (!projet) return;
    const modeleOuvert = projet.modele as ModeleCarte;
    // Tous les visuels : ceux du modèle et ceux de ses variantes (« variante-v1-recto »…).
    const ouverts: Visuels = {};
    for (const [emplacement, fond] of Object.entries(projet.visuels)) {
      if (fond) ouverts[emplacement as Emplacement] = preparerVisuel(fond, polices).visuel;
    }
    setModeles((m) => ({ ...m, perso: modeleOuvert }));
    setVisuels(ouverts);
    donnees.restaurer(projet.correspondances, balisesDuModele(modeleOuvert));
    const reglagesPhotos = (projet.correspondances as Record<string, unknown>)["@photos"];
    if (reglagesPhotos && typeof reglagesPhotos === "object") photos.restaurer(reglagesPhotos);
    setSource("perso");
    // Modèle verrouillé (mode opérateur) : on commence par la liste.
    setEtape(modeleOuvert.verrouille ? 1 : 0);
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
        <BoutonsProjet
          onOuvrir={ouvrirFichierProjet}
          onEnregistrer={enregistrer}
          enregistrable={Boolean(modele)}
          verrou={modele ? { verrouille, onChange: verrouiller } : undefined}
        />
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
              verrouille={verrouille}
              onDeverrouiller={() => verrouiller(false)}
            />
          )}
        </Stepper.Step>
        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            nomModele={modele?.nom ?? ""}
            correspondances={correspondances}
            exemple={exemple}
            anomalies={donnees.anomalies}
            onImporter={donnees.importer}
            onExemple={donnees.utiliserExemple}
            onFeuille={donnees.setFeuille}
            onCorrespondance={donnees.relier}
            quantite={ecran ? undefined : { colonne: donnees.colonneQuantite, onChange: donnees.choisirQuantite }}
            photos={photos.actives ? photos : undefined}
          />
        </Stepper.Step>
        <Stepper.Step label={libelles.etapes.verification.titre} description={libelles.etapes.verification.description}>
          {modele && (
            <EtapeVerification
              modele={modele}
              agents={agents}
              controle={controle}
              filtre={filtre}
              onFiltre={setFiltre}
              onRecadrer={photos.actives ? photos.recadrer : undefined}
            />
          )}
        </Stepper.Step>
        <Stepper.Step label={libelles.etapes.destination.titre} description={libelles.etapes.destination.description}>
          {modele && (
            <EtapeDestination
              modele={modele}
              agents={agents}
              cles={cles}
              quantites={quantites}
              colonneQuantite={colonneQuantite}
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
