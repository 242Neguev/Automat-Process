import { Anchor, Divider, Group, Image, Modal, Stack, Text, Title } from "@mantine/core";
import nomEauSeche from "./assets/eau-seche/nom.png";
import symboleEauSeche from "./assets/eau-seche/symbole.png";
import { version } from "../package.json";
import { textes } from "./textes";

const t = textes.aPropos;

export default function APropos({ ouvert, fermer, versionTypst }: { ouvert: boolean; fermer: () => void; versionTypst?: string }) {
  return (
    <Modal opened={ouvert} onClose={fermer} title={t.titre} centered size="md">
      <Stack gap="md">
        <div>
          <Title order={3}>{textes.application}</Title>
          <Text c="dimmed" size="sm">
            {t.version(version)}
          </Text>
          <Text mt="xs">{t.description}</Text>
        </div>
        <Divider label={t.editeur} labelPosition="left" />
        {/* La charte Eau sèche impose une zone de protection autour du symbole : on le laisse respirer. */}
        <Group gap="xl" py="sm" justify="center">
          <Image src={symboleEauSeche} alt="" h={64} w="auto" fit="contain" />
          <Image src={nomEauSeche} alt="Eau sèche" h={30} w="auto" fit="contain" />
        </Group>
        <Divider />
        <Text size="xs" c="dimmed">
          {t.moteur(versionTypst ?? "…")}{" "}
          <Anchor href="https://typst.app" target="_blank" size="xs">
            typst.app
          </Anchor>
        </Text>
        <Text size="xs" c="dimmed">
          {t.droits}
        </Text>
      </Stack>
    </Modal>
  );
}
