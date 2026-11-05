import { useState } from "react";
import { ActionIcon, Alert, Anchor, Button, CopyButton, Divider, Group, Image, Modal, SegmentedControl, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconBrandGithub, IconCheck, IconCopy, IconLanguage, IconMail, IconPhone } from "@tabler/icons-react";
import nomEauSeche from "./assets/eau-seche/nom.png";
import symboleEauSeche from "./assets/eau-seche/symbole.png";
import { version } from "../package.json";
import { en } from "./i18n/en";
import { fr } from "./i18n/fr";
import { changerLangue, langue, textes, type Langue } from "./textes";

const t = textes.aPropos;

/** Coordonnée de l'éditeur, avec un bouton pour la copier. */
function Coordonnee({ icone: Icone, valeur }: { icone: typeof IconPhone; valeur: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Icone size={16} stroke={1.5} />
      <Text size="sm">{valeur}</Text>
      <CopyButton value={valeur} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? t.copie : t.copier(valeur)} withArrow>
            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} size="sm" aria-label={t.copier(valeur)} onClick={copy}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

/** Choix de la langue : l'interface redémarre, après confirmation (un projet non enregistré serait perdu). */
function ChoixLangue() {
  const [demandee, setDemandee] = useState<Langue | null>(null);
  const tl = textes.langue;
  return (
    <Stack gap="xs" data-langue>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <IconLanguage size={16} stroke={1.5} />
          <Text size="sm" fw={500}>
            {tl.titre}
          </Text>
        </Group>
        <SegmentedControl
          size="xs"
          value={demandee ?? langue}
          onChange={(valeur) => setDemandee(valeur === langue ? null : (valeur as Langue))}
          data={(["fr", "en"] as const).map((value) => ({ value, label: tl.choix[value] }))}
        />
      </Group>
      {demandee && (
        <Alert color="orange" title={tl.confirmationTitre}>
          <Text size="sm">{tl.confirmation}</Text>
          <Group justify="flex-end" gap="xs" mt="sm">
            <Button variant="default" size="xs" onClick={() => setDemandee(null)}>
              {tl.annuler}
            </Button>
            {/* Dans la langue demandée : « Restart in English ». */}
            <Button size="xs" onClick={() => changerLangue(demandee)}>
              {(demandee === "en" ? en : fr).langue.confirmer}
            </Button>
          </Group>
        </Alert>
      )}
    </Stack>
  );
}

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
        <Group gap="lg" justify="center">
          <Coordonnee icone={IconPhone} valeur={t.telephone} />
          <Coordonnee icone={IconMail} valeur={t.email} />
        </Group>
        <Divider />
        <ChoixLangue />
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
        <Group justify="center">
          <Coordonnee icone={IconBrandGithub} valeur={t.codeSource} />
        </Group>
      </Stack>
    </Modal>
  );
}
