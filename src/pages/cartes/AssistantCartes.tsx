import { useEffect, useMemo, useState } from "react";
import { Button, Group, Loader, Stack, Stepper, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkBook } from "xlsx";
import urlListeExemple from "../../assets/exemple-agents.xlsx?url";
import { balisesDuModele, construireAgent, valeursDeLigne } from "../../donnees/agents";
import { associer, type Correspondances } from "../../donnees/correspondances";
import { lireFeuille, ouvrirClasseur } from "../../donnees/liste";
import { enErreurMoteur, lireListe, modeleDemo, type ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import EtapeDestination from "./EtapeDestination";
import EtapeListe from "./EtapeListe";
import EtapeModele from "./EtapeModele";
import EtapeVerification from "./EtapeVerification";

const t = textes.cartes;
const EXTENSIONS_LISTE = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"];

function signalerErreur(e: unknown) {
  const { message, details } = enErreurMoteur(e);
  notifications.show({ color: "red", icon: <IconAlertTriangle size={18} />, title: textes.erreur, message: [message, ...details].join("\n") });
}

/** Assistant « Cartes de visite » : Modèle → Liste → Vérification → Destination. */
export default function AssistantCartes() {
  const [etape, setEtape] = useState(0);
  const [modele, setModele] = useState<ModeleCarte | null>(null);
  const [classeur, setClasseur] = useState<{ nomFichier: string; contenu: WorkBook } | null>(null);
  const [feuille, setFeuille] = useState<string | null>(null);
  const [correspondances, setCorrespondances] = useState<Correspondances>({});

  useEffect(() => {
    modeleDemo().then(setModele, signalerErreur);
  }, []);

  const balises = useMemo(() => (modele ? balisesDuModele(modele) : []), [modele]);
  const liste = useMemo(
    () => (classeur && feuille ? lireFeuille(classeur.contenu, classeur.nomFichier, feuille) : null),
    [classeur, feuille],
  );
  // Chaque nouvelle liste (ou feuille) est associée automatiquement aux balises du modèle.
  useEffect(() => {
    if (liste) setCorrespondances(associer(balises, liste.colonnes));
  }, [liste, balises]);

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

  if (!modele) {
    return <Loader />;
  }

  const etapePrete = [true, agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];

  return (
    <Stack gap="lg" maw={1180}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
          <EtapeModele modele={modele} />
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
          <EtapeVerification agents={agents} />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          <EtapeDestination agents={agents} />
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
