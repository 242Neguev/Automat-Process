import { Box, Button, Group, Text } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconInfoCircle } from "@tabler/icons-react";
import { textes } from "../../textes";

const t = textes.navigation;

interface Props {
  etape: number;
  /** Titre de chaque étape, dans l'ordre (« Modèle », « Liste »…). */
  titres: string[];
  /** L'étape en cours est faite : on peut passer à la suivante. */
  prete: boolean;
  /** Ce qu'il manque pour continuer, dit en clair à côté du bouton grisé. */
  manque?: string | null;
  onEtape: (etape: number) => void;
}

/**
 * « Précédent » et « Suivant », toujours visibles en bas de la fenêtre. Quand on ne peut pas
 * avancer, la barre dit ce qu'il manque au lieu de laisser un bouton grisé sans explication.
 */
export default function BarreEtapes({ etape, titres, prete, manque, onEtape }: Props) {
  const derniere = etape >= titres.length - 1;
  return (
    <Box
      data-barre-etapes
      py="sm"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 20,
        background: "var(--mantine-color-body)",
        borderTop: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} disabled={etape === 0} onClick={() => onEtape(etape - 1)}>
          {t.precedent}
        </Button>
        {!derniere && (
          <Group gap="sm" wrap="nowrap" justify="flex-end" style={{ minWidth: 0 }}>
            {!prete && manque && (
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }} data-manque>
                <IconInfoCircle size={18} color="var(--mantine-color-orange-7)" style={{ flexShrink: 0 }} />
                <Text size="sm" c="orange.9" ta="right">
                  {manque}
                </Text>
              </Group>
            )}
            <Button rightSection={<IconArrowRight size={16} />} disabled={!prete} onClick={() => onEtape(etape + 1)} style={{ flexShrink: 0 }}>
              {t.suivant(titres[etape + 1])}
            </Button>
          </Group>
        )}
      </Group>
    </Box>
  );
}
