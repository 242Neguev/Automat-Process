import { useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkBook } from "xlsx";
import urlListeExemple from "../../assets/exemple-agents.xlsx?url";
import { balisesDuModele, construireAgent, valeursDeLigne } from "../../donnees/agents";
import { associer, type Correspondances } from "../../donnees/correspondances";
import { lireFeuille, ouvrirClasseur } from "../../donnees/liste";
import { FORMATS } from "../../modele/formats";
import { enErreurMoteur, famillesPolices, lireListe, modeleDemo, type Face, type ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import EtapeDestination from "./EtapeDestination";
import EtapeListe from "./EtapeListe";
import EtapeModele, { type Source } from "./EtapeModele";
import EtapeVerification from "./EtapeVerification";
import type { Visuel } from "./PanneauVisuels";

const t = textes.cartes;
const EXTENSIONS_LISTE = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"];

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
    if (!liste) return;
    setCorrespondances((precedentes) => {
      const resultat = associer(balises, liste.colonnes);
      for (const balise of balises) {
        const choisie = precedentes[balise];
        if (choisie !== undefined && (choisie === null || liste.colonnes.includes(choisie))) resultat[balise] = choisie;
      }
      return resultat;
    });
  }, [liste, cleBalises]); // `cleBalises` résume `balises`

  const agents = useMemo(
    () => (modele && liste ? liste.lignes.map((ligne) => construireAgent(modele, ligne, correspondances)) : []),
    [modele, liste, correspondances],
  );
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

  const etapePrete = [modele !== null && modele.champs.length > 0, agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];

  return (
    <Stack gap="lg" maw={1240}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
          {modele && (
            <EtapeModele
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
            onImporter={importer}
            onExemple={utiliserExemple}
            onFeuille={setFeuille}
            onCorrespondance={(balise, colonne) => setCorrespondances((actuelles) => ({ ...actuelles, [balise]: colonne }))}
          />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.verification.titre} description={t.etapes.verification.description}>
          {modele && <EtapeVerification modele={modele} agents={agents} />}
        </Stepper.Step>
        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          {modele && <EtapeDestination modele={modele} agents={agents} />}
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
