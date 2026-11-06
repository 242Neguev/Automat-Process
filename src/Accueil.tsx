import { Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowRight, IconBulb, IconFileUpload, IconFolderOpen, IconShieldCheck } from "@tabler/icons-react";
import { MODULES, type Module } from "./modules";
import { textes } from "./textes";

const t = textes.accueil;

interface Props {
  onCommencer: (module: Module) => void;
  onEssayer: (module: Module) => void;
  onReprendre: () => void;
}

/**
 * Accueil : « Que voulez-vous créer ? ». Chaque document en grand, avec ce qu'il faut pour le faire,
 * de quoi l'essayer sans ses propres fichiers, et les quatre étapes communes à tous.
 */
export default function Accueil({ onCommencer, onEssayer, onReprendre }: Props) {
  return (
    <Stack gap="lg" maw={1100} data-accueil>
      <Stack gap={6}>
        <Title order={2}>{t.question}</Title>
        <Text>{t.intro}</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing="md">
        {MODULES.map(({ cle, icone: Icone, exemple }) => (
          <Paper key={cle} withBorder p="lg" data-tuile={cle}>
            <Stack gap="sm" h="100%">
              <Group gap="md" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" size={52} radius="md" style={{ flexShrink: 0 }}>
                  <Icone size={30} stroke={1.5} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Title order={3} fz="h4">
                    {textes.modules[cle].titre}
                  </Title>
                  <Text size="sm">{t.resultats[cle]}</Text>
                </Stack>
              </Group>
              <Text size="sm" c="dimmed">
                <Text span fw={600} inherit>
                  {t.ilFaut}
                </Text>{" "}
                {t.besoins[cle]}
              </Text>
              <Group gap="xs" mt="auto" pt={4}>
                <Button rightSection={<IconArrowRight size={16} />} onClick={() => onCommencer(cle)}>
                  {t.commencer}
                </Button>
                {exemple && (
                  <Button variant="light" leftSection={<IconBulb size={16} />} onClick={() => onEssayer(cle)}>
                    {t.essayer}
                  </Button>
                )}
              </Group>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>

      <Paper withBorder p="md" bg="var(--mantine-color-eau-0)">
        <Stack gap="xs">
          <Text fw={600}>{t.etapesTitre}</Text>
          <Group gap="lg">
            {t.etapes.map((etape, i) => (
              <Group key={etape} gap={8} wrap="nowrap">
                <ThemeIcon size={26} radius="xl">
                  <Text size="sm" fw={700} c="white">
                    {i + 1}
                  </Text>
                </ThemeIcon>
                <Text size="sm">{etape}</Text>
              </Group>
            ))}
          </Group>
        </Stack>
      </Paper>

      <Group gap="md" wrap="nowrap">
        <Button variant="default" leftSection={<IconFolderOpen size={18} />} onClick={onReprendre} style={{ flexShrink: 0 }}>
          {t.reprendre}
        </Button>
        <Text size="sm" c="dimmed">
          {t.reprendreAide}
        </Text>
      </Group>

      <Group gap={6} wrap="nowrap">
        <IconFileUpload size={18} color="var(--mantine-color-eau-6)" style={{ flexShrink: 0 }} />
        <Text size="sm" c="dimmed">
          {t.deposer}
        </Text>
      </Group>

      <Group gap={6} wrap="nowrap">
        <IconShieldCheck size={18} color="var(--mantine-color-teal-7)" style={{ flexShrink: 0 }} />
        <Text size="sm" c="dimmed">
          {t.rassurer}
        </Text>
      </Group>
    </Stack>
  );
}
