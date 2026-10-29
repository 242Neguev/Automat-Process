import { useMemo, useState } from "react";
import { Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { valeursDeLigne } from "../../donnees/agents";
import { valeursExemple } from "../../signatures/agents";
import { balisesSignature, modeleParDefaut, type ModeleSignature } from "../../signatures/modele";
import { textes } from "../../textes";
import EtapeListe from "../commun/EtapeListe";
import { useListe } from "../commun/useListe";
import EtapeDestinationSignatures from "./EtapeDestinationSignatures";
import EtapeModeleSignature from "./EtapeModeleSignature";
import EtapeVerificationSignatures, { type AgentSignature } from "./EtapeVerificationSignatures";

const t = textes.signatures;

/** Assistant « Signatures e-mail » : Modèle → Liste → Vérification → Destination. */
export default function AssistantSignatures() {
  const [etape, setEtape] = useState(0);
  const [modele, setModele] = useState<ModeleSignature>(modeleParDefaut);
  const balises = useMemo(() => balisesSignature(modele), [modele]);
  const donnees = useListe(balises);
  const { liste, correspondances } = donnees;
  const agents = useMemo<AgentSignature[]>(
    () => (liste ? liste.lignes.map((ligne) => ({ id: `ligne ${ligne.numero}`, valeurs: valeursDeLigne(modele, ligne, correspondances) })) : []),
    [modele, liste, correspondances],
  );
  const apercu = agents[0]?.valeurs ?? valeursExemple(modele);
  const modelePret = modele.source === "html" ? Boolean(modele.html) && balises.length > 0 : balises.length > 0;
  const etapePrete = [modelePret, agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];

  return (
    <Stack gap="lg" maw={1240}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
          <EtapeModeleSignature modele={modele} onModele={setModele} valeurs={apercu} depuisListe={agents.length > 0} />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            correspondances={correspondances}
            exemple={agents[0]?.valeurs ?? {}}
            anomalies={donnees.anomalies}
            onImporter={donnees.importer}
            onExemple={donnees.utiliserExemple}
            onFeuille={donnees.setFeuille}
            onCorrespondance={donnees.relier}
          />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.verification.titre} description={t.etapes.verification.description}>
          <EtapeVerificationSignatures modele={modele} agents={agents} />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          <EtapeDestinationSignatures modele={modele} agents={agents} />
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="default" disabled={etape === 0} onClick={() => setEtape(etape - 1)}>
          {textes.cartes.precedent}
        </Button>
        {etape < 3 && (
          <Button disabled={!etapePrete[etape]} onClick={() => setEtape(etape + 1)}>
            {textes.cartes.suivant}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
