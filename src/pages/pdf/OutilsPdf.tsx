import { Stack, Tabs, Text, Title } from "@mantine/core";
import { IconFiles, IconScissors } from "@tabler/icons-react";
import { textes } from "../../textes";
import FusionPdf from "./FusionPdf";
import SeparationPdf from "./SeparationPdf";

const t = textes.pdf;

/** Module « Outils PDF » : fusionner, séparer. */
export default function OutilsPdf() {
  return (
    <Stack gap="lg" maw={1240}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>
      <Tabs defaultValue="fusionner" keepMounted>
        <Tabs.List mb="md">
          <Tabs.Tab value="fusionner" leftSection={<IconFiles size={16} />}>
            {t.onglets.fusionner}
          </Tabs.Tab>
          <Tabs.Tab value="separer" leftSection={<IconScissors size={16} />}>
            {t.onglets.separer}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="fusionner">
          <FusionPdf />
        </Tabs.Panel>
        <Tabs.Panel value="separer">
          <SeparationPdf />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
