import { useMemo, useState } from "react";
import { Alert, Badge, Group, Paper, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { agentBalises, balisesDuModele } from "../../donnees/agents";
import type { Face, ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import ApercuCarte from "./ApercuCarte";

const t = textes.cartes;

export default function EtapeModele({ modele }: { modele: ModeleCarte }) {
  const [face, setFace] = useState<Face>("recto");
  const agent = useMemo(() => agentBalises(modele), [modele]);
  const { largeur_mm, hauteur_mm, fond_perdu_mm } = modele.format;

  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <ApercuCarte agent={agent} face={face} />
        <Group justify="flex-end">
          <SegmentedControl
            value={face}
            onChange={(valeur) => setFace(valeur as Face)}
            data={[
              { value: "recto", label: t.recto },
              { value: "verso", label: t.verso },
            ]}
          />
        </Group>
      </Stack>
      <Paper withBorder p="lg" w={320} style={{ flexShrink: 0 }}>
        <Stack gap="md">
          <div>
            <Title order={5}>{modele.nom}</Title>
            <Text size="sm" c="dimmed">
              {t.modele.format(largeur_mm, hauteur_mm, fond_perdu_mm)}
            </Text>
          </div>
          <div>
            <Text size="sm" fw={500} mb={6}>
              {t.modele.balises}
            </Text>
            <Group gap={6}>
              {balisesDuModele(modele).map((balise) => (
                <Badge key={balise} variant="light" tt="none">
                  {balise}
                </Badge>
              ))}
            </Group>
          </div>
          <Alert variant="light" color="gray" icon={<IconInfoCircle />}>
            <Text size="sm">{t.modele.aVenir}</Text>
          </Alert>
        </Stack>
      </Paper>
    </Group>
  );
}
