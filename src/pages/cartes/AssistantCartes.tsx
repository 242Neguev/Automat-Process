import { useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconDeviceFloppy, IconFolderOpen } from "@tabler/icons-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { WorkBook } from "xlsx";
import urlListeExemple from "../../assets/exemple-agents.xlsx?url";
import { balisesDuModele, construireAgent, valeursDeLigne } from "../../donnees/agents";
import { controlerListe } from "../../donnees/controle";
import { fusionner, type Correspondances } from "../../donnees/correspondances";
import { lireFeuille, ouvrirClasseur } from "../../donnees/liste";
import { FORMATS } from "../../modele/formats";
import { pourEnregistrer, preparerVisuel, type Visuel } from "../../modele/visuels";
import { enErreurMoteur, enregistrerProjet, famillesPolices, lireListe, modeleDemo, ouvrirProjet, type Face, type ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import EtapeDestination from "./EtapeDestination";
import EtapeListe from "./EtapeListe";
import EtapeModele, { type Source } from "./EtapeModele";
import EtapeVerification, { type Filtre } from "./EtapeVerification";
import { useControle } from "./useControle";

const t = textes.cartes;
const EXTENSIONS_LISTE = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"];
const FILTRE_PROJET = [{ name: t.projet.filtre, extensions: ["automat"] }];

const { largeur_mm, hauteur_mm, fond_perdu_mm } = FORMATS[0];
const MODELE_VIERGE: ModeleCarte = { nom: t.modele.nomPerso, format: { largeur_mm, hauteur_mm, fond_perdu_mm }, fond_recto: null, fond_verso: null, transformations: {}, champs: [] };

function signalerErreur(e: unknown) {
  const { message, details } = enErreurMoteur(e);
  notifications.show({ color: "red", icon: <IconAlertTriangle size={18} />, title: textes.erreur, message: [message, ...details].join("\n") });
}

/** Assistant « Cartes de visite » : Modèle → Liste → Vérification → Destination. */
export default function AssistantCartes() {
  const [etape, setEtape] = useState(0);
  const [source, setSource] = useState<Source>("perso");
  const [modeles, setModeles] = useState<Record<Source, ModeleCarte | null>>({ perso: MODELE_VIERGE, demo: null });
  const [visuels, setVisuels] = useState<Partial<Record<Face, Visuel>>>({});
  const [polices, setPolices] = useState<string[]>([]);
  const [classeur, setClasseur] = useState<{ nomFichier: string; contenu: WorkBook } | null>(null);
  const [feuille, setFeuille] = useState<string | null>(null);
  const [correspondances, setCorrespondances] = useState<Correspondances>({});
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
  const cleBalises = balises.join("\u0000");
  const liste = useMemo(
    () => (classeur && feuille ? lireFeuille(classeur.contenu, classeur.nomFichier, feuille) : null),
    [classeur, feuille],
  );
  // Associe automatiquement les balises aux colonnes, en gardant les choix faits à la main.
  useEffect(() => {
    if (liste) setCorrespondances((precedentes) => fusionner(balises, liste.colonnes, precedentes));
  }, [liste, cleBalises]); // `cleBalises` résume `balises`

  const agents = useMemo(
    () => (modele && liste ? liste.lignes.map((ligne) => construireAgent(modele, ligne, correspondances)) : []),
    [modele, liste, correspondances],
  );
  const anomalies = useMemo(() => (liste ? controlerListe(liste, balises, correspondances) : []), [liste, balises, correspondances]);
  // Le contrôle des cartes sert à la vérification et à l'export.
  const controle = useControle(modele, agents, etape >= 2);
  const exemple = useMemo(
    () => (modele && liste?.lignes[0] ? valeursDeLigne(modele, liste.lignes[0], correspondances) : {}),
    [modele, liste, correspondances],
  );

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
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.liste.filtre, extensions: EXTENSIONS_LISTE }] });
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

  /** Enregistre le modèle, ses visuels et les correspondances (jamais les données des agents). */
  async function enregistrer() {
    if (!modele) return;
    const nom = modele.nom.replace(/[\\/:*?"<>|]/g, "-").trim() || t.projet.nomParDefaut;
    const chemin = await save({ defaultPath: `${nom}.automat`, filters: FILTRE_PROJET });
    if (!chemin) return;
    try {
      const infos = Object.fromEntries(Object.entries(source === "perso" ? visuels : {}).map(([face, visuel]) => [face, pourEnregistrer(visuel)]));
      await enregistrerProjet(chemin, modele, correspondances, infos);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.projet.enregistre, message: chemin });
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function ouvrirFichierProjet() {
    const chemin = await open({ multiple: false, directory: false, filters: FILTRE_PROJET });
    if (typeof chemin !== "string") return;
    try {
      const projet = await ouvrirProjet(chemin);
      const ouverts: Partial<Record<Face, Visuel>> = {};
      for (const face of ["recto", "verso"] as Face[]) {
        const fond = projet.visuels[face];
        if (fond) ouverts[face] = preparerVisuel(fond, polices).visuel;
      }
      setModeles((m) => ({ ...m, perso: projet.modele }));
      setVisuels(ouverts);
      setCorrespondances(liste ? fusionner(balisesDuModele(projet.modele), liste.colonnes, projet.correspondances) : projet.correspondances);
      setSource("perso");
      setEtape(0);
      setOuvertures((n) => n + 1);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.projet.ouvert, message: projet.modele.nom });
    } catch (e) {
      signalerErreur(e);
    }
  }

  // Une zone effacée seule ne suffit pas : il faut au moins une information ou un QR code.
  const etapePrete = [modele !== null && modele.champs.some((champ) => champ.type !== "masque"), agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];

  return (
    <Stack gap="lg" maw={1240}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{t.titre}</Title>
          <Text c="dimmed">{t.sousTitre}</Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={ouvrirFichierProjet}>
            {t.projet.ouvrir}
          </Button>
          <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} disabled={!modele} onClick={enregistrer}>
            {t.projet.enregistrer}
          </Button>
        </Group>
      </Group>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
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
            />
          )}
        </Stepper.Step>
        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={classeur?.contenu.SheetNames ?? []}
            balises={balises}
            correspondances={correspondances}
            exemple={exemple}
            anomalies={anomalies}
            onImporter={importer}
            onExemple={utiliserExemple}
            onFeuille={setFeuille}
            onCorrespondance={(balise, colonne) => setCorrespondances((actuelles) => ({ ...actuelles, [balise]: colonne }))}
          />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.verification.titre} description={t.etapes.verification.description}>
          {modele && <EtapeVerification modele={modele} agents={agents} controle={controle} filtre={filtre} onFiltre={setFiltre} />}
        </Stepper.Step>
        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          {modele && (
            <EtapeDestination
              modele={modele}
              agents={agents}
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
