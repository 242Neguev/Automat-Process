import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { balisesDuModele, construireAgent, ficheContact, liensAgent, photosManquantes, valeursDeLigne } from "../../donnees/agents";
import { genreDe } from "../../donnees/fichiersDeposes";
import { quantitesDe } from "../../donnees/quantite";
import { identites, nouvelIdentifiant } from "../../donnees/registre";
import { FORMATS, FORMATS_ECRAN } from "../../modele/formats";
import { pourEnregistrer, preparerVisuel, type Emplacement, type Visuels } from "../../modele/visuels";
import { famillesPolices, modeleDemo, type ModeleCarte, type ProjetOuvert } from "../../moteur";
import { textes } from "../../textes";
import BandeauExemple from "../commun/BandeauExemple";
import BarreEtapes from "../commun/BarreEtapes";
import { useCommande, type Commande } from "../commun/commande";
import EtapeListe from "../commun/EtapeListe";
import { BoutonsProjet, enregistrerSous, projetOuvert } from "../commun/projet";
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

interface Props {
  variante?: "cartes" | "ecran";
  /** Demande de l'accueil : essayer l'exemple, rouvrir un projet, prendre des fichiers glissés. */
  commande?: Commande;
  /** « Ouvrir un projet… » : l'application l'ouvre dans le module auquel il appartient. */
  onOuvrirProjet: () => void;
}

/**
 * Assistant « Cartes de visite » : Modèle → Liste → Vérification → Destination. La variante « écran »
 * (module Visuels numériques) part d'un fond d'écran Teams et n'exporte que des images.
 */
export default function AssistantCartes({ variante = "cartes", commande, onOuvrirProjet }: Props) {
  const ecran = variante === "ecran";
  const libelles = libellesCartes(ecran);
  const [etape, setEtape] = useState(0);
  // Bandeau « Vous essayez avec l'exemple », affiché après « Essayer avec l'exemple » de l'accueil.
  const [essai, setEssai] = useState(false);
  // Visuel glissé dans la fenêtre, transmis à l'étape Modèle (le numéro change à chaque dépôt).
  const [visuelDepose, setVisuelDepose] = useState<{ id: number; chemin: string } | null>(null);
  const depots = useRef(0);
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
    if (source === "demo" && !modeles.demo) modeleDemo().then((demo) => setModeles((m) => ({ ...m, demo: { ...demo, id: "demo", nom: t.modele.nomDemo } })), signalerErreur);
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
  // Photos demandées par la liste mais introuvables (une fois le chargement fini) : signalées au contrôle.
  const manquantes = useMemo(
    () => (modele && liste && !photos.progression ? photosManquantes(modele, liste.lignes, correspondances, agents) : undefined),
    [modele, liste, correspondances, agents, photos.progression],
  );
  // Le contrôle des cartes sert à la vérification et à l'export.
  const controle = useControle(modele, agents, etape >= 2, manquantes);
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

  /** Projet rouvert (depuis l'accueil ou « Ouvrir un projet… ») : modèle, visuels et réglages de la liste. */
  function appliquerProjet(projet: ProjetOuvert) {
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
    setEssai(false);
    projetOuvert(modeleOuvert.nom);
  }

  /** « Essayer avec l'exemple » : la carte de démonstration et la liste d'exemple, à parcourir depuis le début. */
  function essayerExemple() {
    setSource("demo");
    void donnees.utiliserExemple();
    setEtape(0);
    setEssai(true);
  }

  /** Fichiers glissés dans la fenêtre : un visuel habille la carte, une liste devient celle des agents. */
  function recevoir(chemins: string[]) {
    const visuel = chemins.find((chemin) => genreDe(chemin) === "visuel");
    const fichierListe = chemins.find((chemin) => genreDe(chemin) === "liste");
    // Ses propres fichiers : l'essai avec l'exemple est fini.
    if (visuel || fichierListe) setEssai(false);
    if (visuel) {
      depots.current += 1;
      setSource("perso");
      setVisuelDepose({ id: depots.current, chemin: visuel });
      setEtape(0);
    }
    if (fichierListe) {
      void donnees.importerChemin(fichierListe);
      // Le modèle est prêt : on montre la liste reçue.
      if (!visuel && etapePrete[0]) setEtape(1);
    }
  }

  useCommande(commande, (demande) => {
    if (demande.type === "exemple") essayerExemple();
    else if (demande.type === "projet") appliquerProjet(demande.projet);
    else recevoir(demande.chemins);
  });

  // Une zone effacée seule ne suffit pas : il faut au moins une information ou un QR code.
  const etapePrete = [modele !== null && modele.champs.some((champ) => champ.type !== "masque"), agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];
  const n = textes.navigation.manque;
  // Ce qui manque pour passer à l'étape suivante, dit en clair sous le bouton grisé.
  const manque = [
    modele?.fond_recto ? (ecran ? n.informationEcran : n.informationCarte) : ecran ? n.visuelEcran : n.visuelCarte,
    liste ? n.colonnes : n.liste,
    n.liste,
    null,
  ];

  return (
    <Stack gap="lg" maw={1240}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{libelles.titre}</Title>
          <Text c="dimmed">{libelles.sousTitre}</Text>
        </div>
        <BoutonsProjet
          onOuvrir={onOuvrirProjet}
          onEnregistrer={enregistrer}
          enregistrable={Boolean(modele)}
          verrou={modele ? { verrouille, onChange: verrouiller } : undefined}
        />
      </Group>

      <BandeauExemple message={essai ? textes.exemple.cartes : null} onFermer={() => setEssai(false)} />

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={libelles.etapes.modele.titre} description={libelles.etapes.modele.description}>
          {modele && (
            <EtapeModele
              key={ouvertures}
              source={source}
              onSource={(choisie) => {
                setSource(choisie);
                // Passer à son propre modèle, c'est quitter l'exemple : le bandeau n'a plus lieu d'être.
                if (choisie === "perso") setEssai(false);
              }}
              modele={modele}
              onModele={(modification) => setModeles((m) => ({ ...m, [source]: m[source] ? modification(m[source]) : m[source] }))}
              visuels={source === "perso" ? visuels : {}}
              onVisuels={setVisuels}
              polices={polices}
              avecDemo={!ecran}
              verrouille={verrouille}
              onDeverrouiller={() => verrouiller(false)}
              visuelDepose={visuelDepose}
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
            onImporter={() => {
              setEssai(false);
              void donnees.importer();
            }}
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

      <BarreEtapes
        etape={etape}
        titres={[libelles.etapes.modele.titre, t.etapes.liste.titre, libelles.etapes.verification.titre, libelles.etapes.destination.titre]}
        prete={etapePrete[etape]}
        manque={manque[etape]}
        onEtape={setEtape}
      />
    </Stack>
  );
}
