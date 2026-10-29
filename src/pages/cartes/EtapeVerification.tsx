import { useState } from "react";
import { ActionIcon, Group, NavLink, Paper, ScrollArea, SegmentedControl, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { DonneesAgent, Face, ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import ApercuCarte from "./ApercuCarte";

const t = textes.cartes.verification;

/** Libellé d'un agent dans la liste : le premier texte non vide de sa carte (en général son nom). */
const libelle = (agent: DonneesAgent) => Object.values(agent.valeurs).find(Boolean) ?? t.sansNom;

export default function EtapeVerification({ modele, agents }: { modele: ModeleCarte; agents: DonneesAgent[] }) {
  const [index, setIndex] = useState(0);
  const [face, setFace] = useState<Face>("recto");
  const courant = Math.min(index, agents.length - 1);

  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <ApercuCarte modele={modele} agent={agents[courant] ?? null} face={modele.fond_verso ? face : "recto"} />
        <Group justify="space-between">
          <Group gap="xs">
            <Tooltip label={t.precedent}>
              <ActionIcon variant="default" size="lg" aria-label={t.precedent} disabled={courant <= 0} onClick={() => setIndex(courant - 1)}>
                <IconChevronLeft size={18} />
              </ActionIcon>
            </Tooltip>
            <Text size="sm" w={130} ta="center">
              {t.agent(courant + 1, agents.length)}
            </Text>
            <Tooltip label={t.suivant}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t.suivant}
                disabled={courant >= agents.length - 1}
                onClick={() => setIndex(courant + 1)}
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {modele.fond_verso && (
            <SegmentedControl
              value={face}
              onChange={(valeur) => setFace(valeur as Face)}
              data={[
                { value: "recto", label: textes.cartes.recto },
                { value: "verso", label: textes.cartes.verso },
              ]}
            />
          )}
        </Group>
      </Stack>

      <Paper withBorder p="sm" w={320} style={{ flexShrink: 0 }}>
        <Title order={5} px="xs" pb="xs">
          {t.agents}
        </Title>
        <ScrollArea.Autosize mah={460} type="auto">
          {agents.map((agent, i) => (
            <NavLink
              key={agent.id}
              label={<span dir="auto">{libelle(agent)}</span>}
              description={agent.id}
              active={i === courant}
              onClick={() => setIndex(i)}
            />
          ))}
        </ScrollArea.Autosize>
      </Paper>
    </Group>
  );
}
