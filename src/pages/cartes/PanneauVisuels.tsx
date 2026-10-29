import { Button, Group, List, NumberInput, Paper, Select, Stack, Switch, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconInfoSmall, IconPhoto } from "@tabler/icons-react";
import { diagnostiquer, FORMATS, type Format, type Niveau } from "../../modele/formats";
import type { Visuel } from "../../modele/visuels";
import type { Face } from "../../moteur";
import { textes } from "../../textes";

const t = textes.cartes.modele;
const PERSONNALISE = "personnalise";
const ICONES: Record<Niveau, { couleur: string; icone: typeof IconCheck }> = {
  ok: { couleur: "teal", icone: IconCheck },
  info: { couleur: "blue", icone: IconInfoSmall },
  attention: { couleur: "orange", icone: IconAlertTriangle },
};

interface Props {
  nom: string;
  onNom: (nom: string) => void;
  format: Format;
  visuels: Partial<Record<Face, Visuel>>;
  avecFondPerdu: Record<Face, boolean>;
  onFormat: (format: Format) => void;
  onFondPerdu: (face: Face, avec: boolean) => void;
  onImporter: (face: Face) => void;
  onRetirer: (face: Face) => void;
}

export default function PanneauVisuels({ nom, onNom, format, visuels, avecFondPerdu, onFormat, onFondPerdu, onImporter, onRetirer }: Props) {
  const predefini = FORMATS.find(
    (f) => f.largeur_mm === format.largeur_mm && f.hauteur_mm === format.hauteur_mm && f.fond_perdu_mm === format.fond_perdu_mm,
  );
  const dimension = (cle: keyof Format) => (valeur: string | number) =>
    typeof valeur === "number" && valeur >= 0 && onFormat({ ...format, [cle]: valeur });

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <TextInput label={t.nomModele} value={nom} onChange={(e) => onNom(e.currentTarget.value)} />
        <Title order={5}>{t.formatTitre}</Title>
        <Select
          value={predefini?.id ?? PERSONNALISE}
          allowDeselect={false}
          data={[...FORMATS.map((f) => ({ value: f.id, label: f.libelle })), { value: PERSONNALISE, label: t.formatPersonnalise }]}
          onChange={(id) => {
            const choisi = FORMATS.find((f) => f.id === id);
            if (choisi) onFormat({ largeur_mm: choisi.largeur_mm, hauteur_mm: choisi.hauteur_mm, fond_perdu_mm: choisi.fond_perdu_mm });
          }}
        />
        {!predefini && (
          <Group grow>
            <NumberInput label={t.largeur} min={20} max={300} decimalScale={1} value={format.largeur_mm} onChange={dimension("largeur_mm")} />
            <NumberInput label={t.hauteur} min={20} max={300} decimalScale={1} value={format.hauteur_mm} onChange={dimension("hauteur_mm")} />
          </Group>
        )}
        <NumberInput label={t.fondPerdu} description={t.fondPerduAide} min={0} max={10} step={0.5} decimalScale={1} value={format.fond_perdu_mm} onChange={dimension("fond_perdu_mm")} />

        <Title order={5} mt="xs">
          {t.visuelsTitre}
        </Title>
        {(["recto", "verso"] as Face[]).map((face) => {
          const visuel = visuels[face];
          return (
            <Stack key={face} gap={6}>
              <Group gap="xs" wrap="nowrap">
                <IconPhoto size={18} stroke={1.5} />
                <Text size="sm" fw={500}>
                  {face === "recto" ? t.recto : t.verso}
                </Text>
              </Group>
              {visuel ? (
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                    {visuel.nomFichier}
                  </Text>
                  <Button size="compact-sm" variant="light" onClick={() => onImporter(face)}>
                    {t.remplacer}
                  </Button>
                  <Button size="compact-sm" variant="subtle" color="gray" onClick={() => onRetirer(face)}>
                    {t.retirer}
                  </Button>
                </Group>
              ) : (
                <Button variant={face === "recto" ? "filled" : "light"} onClick={() => onImporter(face)}>
                  {face === "recto" ? t.choisirRecto : t.choisirVerso}
                </Button>
              )}
              {visuel ? (
                <List spacing={4} size="xs" center>
                  {diagnostiquer(visuel, format, avecFondPerdu[face]).map(({ niveau, message }) => {
                    const { couleur, icone: Icone } = ICONES[niveau];
                    return (
                      <List.Item
                        key={message}
                        icon={
                          <ThemeIcon color={couleur} size={16} radius="xl" variant="light">
                            <Icone size={12} />
                          </ThemeIcon>
                        }
                      >
                        {message}
                      </List.Item>
                    );
                  })}
                </List>
              ) : null}
              {visuel && format.fond_perdu_mm > 0 && (
                <Switch
                  size="xs"
                  label={t.contientFondPerdu}
                  checked={avecFondPerdu[face]}
                  onChange={(e) => onFondPerdu(face, e.currentTarget.checked)}
                />
              )}
              {!visuel && face === "recto" && (
                <Text size="xs" c="dimmed">
                  {t.aucunVisuel}
                </Text>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
