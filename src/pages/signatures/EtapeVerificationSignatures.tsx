import { useState } from "react";
import { ActionIcon, Button, Group, NavLink, Paper, ScrollArea, SegmentedControl, Stack, Text, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconCopy, IconMoon, IconSun } from "@tabler/icons-react";
import { nomAgent } from "../../signatures/agents";
import { genererSignature, texteSignature } from "../../signatures/html";
import { LIMITE_GMAIL, type ModeleSignature } from "../../signatures/modele";
import { copierSignature } from "../../signatures/presse-papiers";
import { textes } from "../../textes";
import { signalerErreur } from "../commun/signalerErreur";
import ApercuSignature from "./ApercuSignature";

const t = textes.signatures.verification;
const tm = textes.signatures.modele;

export interface AgentSignature {
  id: string;
  /** Valeur nettoyée de chaque balise. */
  valeurs: Record<string, string>;
}

export default function EtapeVerificationSignatures({ modele, agents }: { modele: ModeleSignature; agents: AgentSignature[] }) {
  const [index, setIndex] = useState(0);
  const [sombre, setSombre] = useState(false);
  const courant = Math.min(index, agents.length - 1);
  const agent = agents[courant];
  if (!agent) return null;
  const html = genererSignature(modele, agent.valeurs);
  const gmail = genererSignature(modele, agent.valeurs, { sansLogo: true });
  const texte = texteSignature(modele, agent.valeurs);

  async function copier(code: string) {
    try {
      await copierSignature(code, texte);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, message: t.copiee });
    } catch (e) {
      signalerErreur(e);
    }
  }

  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <ApercuSignature html={html} sombre={sombre} titre={nomAgent(modele, agent.valeurs)} />
        {sombre && (
          <Text size="xs" c="dimmed">
            {tm.aideSombre}
          </Text>
        )}
        <Group justify="space-between">
          <Group gap="xs">
            <Tooltip label={textes.cartes.verification.precedent}>
              <ActionIcon variant="default" size="lg" aria-label={textes.cartes.verification.precedent} disabled={courant <= 0} onClick={() => setIndex(courant - 1)}>
                <IconChevronLeft size={18} />
              </ActionIcon>
            </Tooltip>
            <Text size="sm" w={130} ta="center">
              {t.agent(courant + 1, agents.length)}
            </Text>
            <Tooltip label={textes.cartes.verification.suivant}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={textes.cartes.verification.suivant}
                disabled={courant >= agents.length - 1}
                onClick={() => setIndex(courant + 1)}
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <SegmentedControl
            size="xs"
            value={sombre ? "sombre" : "clair"}
            onChange={(valeur) => setSombre(valeur === "sombre")}
            data={[
              { value: "clair", label: <Group gap={4} wrap="nowrap"><IconSun size={14} /><span>{tm.apercuClair}</span></Group> },
              { value: "sombre", label: <Group gap={4} wrap="nowrap"><IconMoon size={14} /><span>{tm.apercuSombre}</span></Group> },
            ]}
          />
        </Group>
        <Group gap="xs">
          <Button leftSection={<IconCopy size={16} />} onClick={() => copier(html)}>
            {t.copier}
          </Button>
          {gmail !== html && (
            <Button variant="light" leftSection={<IconCopy size={16} />} onClick={() => copier(gmail)}>
              {t.copierGmail}
            </Button>
          )}
        </Group>
        {/* La taille du code ne regarde l'utilisateur que si Gmail risque de refuser la signature. */}
        {gmail.length > 0.8 * LIMITE_GMAIL && (
          <Text size="xs" c="dimmed" data-tailles>
            {t.taille(html.length)}
            {" · "}
            <Text span size="xs" c={gmail.length > LIMITE_GMAIL ? "red" : "dimmed"}>
              {gmail.length > LIMITE_GMAIL && <IconAlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />}
              {t.tailleGmail(gmail.length, LIMITE_GMAIL)}
            </Text>
          </Text>
        )}
      </Stack>

      <Paper withBorder p="sm" w={320} style={{ flexShrink: 0 }}>
        <Title order={5} px="xs" pb="xs">
          {t.agents}
        </Title>
        <ScrollArea.Autosize mah={460} type="auto">
          {agents.map((a, i) => (
            <NavLink
              key={a.id}
              label={<span dir="auto">{nomAgent(modele, a.valeurs)}</span>}
              description={a.id}
              active={i === courant}
              onClick={() => setIndex(i)}
            />
          ))}
        </ScrollArea.Autosize>
      </Paper>
    </Group>
  );
}
