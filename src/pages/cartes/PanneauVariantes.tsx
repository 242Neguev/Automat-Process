import { ActionIcon, Button, Group, Paper, Stack, Switch, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { Visuels } from "../../modele/visuels";
import type { Face, ModeleCarte, VarianteModele } from "../../moteur";
import { libellesCartes } from "./libelles";

type Variantes = NonNullable<ModeleCarte["variantes"]>;

interface Props {
  variantes: ModeleCarte["variantes"];
  /** Faces proposées : le verso n'existe que pour les cartes. */
  faces: Face[];
  visuels: Visuels;
  onVariantes: (modification: (variantes: Variantes | undefined) => Variantes | undefined) => void;
  onImporter: (id: string, face: Face) => void;
  onRetirer: (id: string, face: Face) => void;
}

/** Identifiant libre suivant (v1, v2…). */
const nouvelId = (valeurs: VarianteModele[]) => `v${Math.max(0, ...valeurs.map((v) => Number(v.id.replace(/\D/g, "")) || 0)) + 1}`;

/**
 * Variantes du modèle : une colonne de la liste (filiale, langue…) choisit, pour chaque agent, les
 * visuels de sa variante ; ceux qu'une variante n'a pas sont ceux du modèle.
 */
export default function PanneauVariantes({ variantes, faces, visuels, onVariantes, onImporter, onRetirer }: Props) {
  const t = libellesCartes(faces.length === 1).modele.variantes;
  const modifier = (id: string, modification: Partial<VarianteModele>) =>
    onVariantes((v) => v && { ...v, valeurs: v.valeurs.map((valeur) => (valeur.id === id ? { ...valeur, ...modification } : valeur)) });

  return (
    <Paper withBorder p="md" data-variantes>
      <Stack gap="sm">
        <Title order={5}>{t.titre}</Title>
        <Text size="xs" c="dimmed">
          {t.aide}
        </Text>
        <Switch
          label={t.activer}
          checked={Boolean(variantes)}
          onChange={(e) => {
            const activer = e.currentTarget.checked;
            onVariantes(() => (activer ? { balise: t.baliseDefaut, valeurs: [{ id: "v1", valeur: "" }] } : undefined));
          }}
        />
        {variantes && (
          <>
            <TextInput
              label={t.balise}
              description={t.baliseAide}
              value={variantes.balise}
              onChange={(e) => {
                const balise = e.currentTarget.value;
                onVariantes((v) => v && { ...v, balise });
              }}
            />
            {variantes.valeurs.map((variante, rang) => (
              <Stack key={variante.id} gap={6} pl="sm" style={{ borderLeft: "2px solid var(--mantine-color-gray-3)" }} data-variante={variante.id}>
                <Group gap="xs" wrap="nowrap" align="flex-end">
                  <TextInput
                    style={{ flex: 1 }}
                    size="xs"
                    label={`${t.valeur} (${t.nommee(rang + 1)})`}
                    placeholder={t.valeurExemple}
                    value={variante.valeur}
                    onChange={(e) => modifier(variante.id, { valeur: e.currentTarget.value })}
                  />
                  <Tooltip label={t.supprimer}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t.supprimer}
                      onClick={() => {
                        for (const face of faces) if (variante[`fond_${face}`]) onRetirer(variante.id, face);
                        onVariantes((v) => v && { ...v, valeurs: v.valeurs.filter((valeur) => valeur.id !== variante.id) });
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                {faces.map((face) => {
                  const visuel = visuels[`variante-${variante.id}-${face}`];
                  return (
                    <Group key={face} gap={4} wrap="nowrap">
                      <Text size="xs" w={42}>
                        {face === "recto" ? libellesCartes(false).recto : libellesCartes(false).verso}
                      </Text>
                      <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                        {visuel?.nomFichier ?? t.commeModele}
                      </Text>
                      <Button size="compact-xs" variant="light" onClick={() => onImporter(variante.id, face)}>
                        {t.importer[face]}
                      </Button>
                      {visuel && (
                        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onRetirer(variante.id, face)}>
                          {t.retirer}
                        </Button>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            ))}
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              style={{ alignSelf: "flex-start" }}
              onClick={() => onVariantes((v) => v && { ...v, valeurs: [...v.valeurs, { id: nouvelId(v.valeurs), valeur: "" }] })}
            >
              {t.ajouter}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
