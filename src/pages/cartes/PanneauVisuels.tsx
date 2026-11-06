import { useState, type ReactNode } from "react";
import { Button, Collapse, Group, List, NumberInput, Paper, Select, Slider, Stack, Switch, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconDeviceDesktop, IconInfoSmall, IconPhoto, IconStack2 } from "@tabler/icons-react";
import { diagnostiquer, diagnostiquerEcran, diagnostiquerVersionEcran, FORMATS, FORMATS_ECRAN, type Format, type Niveau } from "../../modele/formats";
import type { Visuel, Visuels } from "../../modele/visuels";
import type { Face } from "../../moteur";
import type { Secondaire } from "./EtapeModele";
import { libellesCartes } from "./libelles";

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
  visuels: Visuels;
  avecFondPerdu: Record<Face, boolean>;
  onFormat: (format: Format) => void;
  onFondPerdu: (face: Face, avec: boolean) => void;
  onImporter: (face: Face) => void;
  onRetirer: (face: Face) => void;
  /** Versions écran des faces (cartes) et calque de référence. */
  onImporterSecondaire: (emplacement: Secondaire) => void;
  onRetirerSecondaire: (emplacement: Secondaire) => void;
  calque: { visible: boolean; opacite: number; onVisible: (visible: boolean) => void; onOpacite: (opacite: number) => void };
  /** Autres réglages avancés, à la suite (les variantes du modèle). */
  complements?: ReactNode;
  /** Le modèle se sert déjà de réglages avancés (variantes…) : ils s'affichent d'emblée. */
  avancesUtilises?: boolean;
}

/** Diagnostics d'un visuel, avec leur icône. */
function Diagnostics({ messages }: { messages: { niveau: Niveau; message: string }[] }) {
  if (messages.length === 0) return null;
  return (
    <List spacing={4} size="xs" center>
      {messages.map(({ niveau, message }) => {
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
  );
}

/** Nom d'un visuel secondaire déjà choisi, avec « Remplacer… » et « Retirer ». */
function VisuelChoisi({ visuel, onRemplacer, onRetirer, remplacer, retirer }: { visuel: Visuel; onRemplacer: () => void; onRetirer: () => void; remplacer: string; retirer: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
        {visuel.nomFichier}
      </Text>
      <Button size="compact-sm" variant="light" onClick={onRemplacer}>
        {remplacer}
      </Button>
      <Button size="compact-sm" variant="subtle" color="gray" onClick={onRetirer}>
        {retirer}
      </Button>
    </Group>
  );
}

export default function PanneauVisuels({
  nom,
  onNom,
  format,
  visuels,
  avecFondPerdu,
  onFormat,
  onFondPerdu,
  onImporter,
  onRetirer,
  onImporterSecondaire,
  onRetirerSecondaire,
  calque,
  complements,
  avancesUtilises = false,
}: Props) {
  // Format d'écran (Visuels numériques) : formats en pixels seulement, sans fond perdu ni verso.
  const ecran = Boolean(format.px);
  const t = libellesCartes(ecran).modele;
  const formats = ecran ? FORMATS_ECRAN : FORMATS;
  const predefini = formats.find(
    (f) => f.largeur_mm === format.largeur_mm && f.hauteur_mm === format.hauteur_mm && f.fond_perdu_mm === format.fond_perdu_mm,
  );
  const dimension = (cle: keyof Format) => (valeur: string | number) =>
    typeof valeur === "number" && valeur >= 0 && onFormat({ ...format, [cle]: valeur });
  // Réglages avancés : ouverts d'emblée si le modèle s'en sert déjà (format personnalisé, calque, version écran, variantes).
  const [avances, setAvances] = useState(
    () => avancesUtilises || (!predefini && !ecran) || Boolean(visuels.calque || visuels.recto_ecran || visuels.verso_ecran),
  );

  // Le format d'un visuel d'écran (fond Teams, bannière…) fixe la taille des images : il reste en vue.
  const blocFormat = (
    <>
      <Title order={5}>{t.formatTitre}</Title>
      <Select
        value={predefini?.id ?? PERSONNALISE}
        allowDeselect={false}
        data={[...formats.map((f) => ({ value: f.id, label: f.libelle })), ...(ecran ? [] : [{ value: PERSONNALISE, label: t.formatPersonnalise }])]}
        onChange={(id) => {
          const choisi = formats.find((f) => f.id === id);
          if (choisi) onFormat({ largeur_mm: choisi.largeur_mm, hauteur_mm: choisi.hauteur_mm, fond_perdu_mm: choisi.fond_perdu_mm, px: choisi.px });
        }}
      />
      {!predefini && (
        <Group grow>
          <NumberInput label={t.largeur} min={20} max={300} decimalScale={1} value={format.largeur_mm} onChange={dimension("largeur_mm")} />
          <NumberInput label={t.hauteur} min={20} max={300} decimalScale={1} value={format.hauteur_mm} onChange={dimension("hauteur_mm")} />
        </Group>
      )}
    </>
  );
  const faces = ecran ? (["recto"] as Face[]) : (["recto", "verso"] as Face[]);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={5}>{t.visuelsTitre}</Title>
        {faces.map((face) => {
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
              {visuel && <Diagnostics messages={ecran ? diagnostiquerEcran(visuel, format) : diagnostiquer(visuel, format, avecFondPerdu[face])} />}
              {!visuel && face === "recto" && (
                <Text size="xs" c="dimmed">
                  {t.aucunVisuel}
                </Text>
              )}
            </Stack>
          );
        })}

        <TextInput label={t.nomModele} description={t.nomModeleAide} value={nom} onChange={(e) => onNom(e.currentTarget.value)} />
        {ecran && blocFormat}

        {/* Réglages de spécialiste (imprimeur, graphiste) : repliés tant qu'on ne s'en sert pas. */}
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          justify="space-between"
          rightSection={<IconChevronDown size={16} style={{ transform: avances ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />}
          onClick={() => setAvances((ouvert) => !ouvert)}
          aria-expanded={avances}
          data-reglages-avances
          mt="xs"
        >
          {t.avances}
        </Button>
        <Collapse expanded={avances}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              {ecran ? t.avancesAideEcran : t.avancesAide}
            </Text>
            {!ecran && blocFormat}
            {!ecran && (
              <NumberInput label={t.fondPerdu} description={t.fondPerduAide} min={0} max={10} step={0.5} decimalScale={1} value={format.fond_perdu_mm} onChange={dimension("fond_perdu_mm")} />
            )}
            {!ecran &&
              faces.map((face) => {
                const visuel = visuels[face];
                if (!visuel) return null;
                return (
                  <Stack key={face} gap={6}>
                    {format.fond_perdu_mm > 0 && (
                      <Switch
                        size="xs"
                        label={t.contientFondPerduFace(face === "recto" ? t.recto : t.verso)}
                        checked={avecFondPerdu[face]}
                        onChange={(e) => onFondPerdu(face, e.currentTarget.checked)}
                      />
                    )}
                    {/* Cartes : une version écran (RVB) facultative, pour les cartes numériques. */}
                    <VersionEcran face={face} visuels={visuels} format={format} onImporterSecondaire={onImporterSecondaire} onRetirerSecondaire={onRetirerSecondaire} />
                  </Stack>
                );
              })}

            <Title order={5} mt="xs">
              {t.calqueTitre}
            </Title>
            <Text size="xs" c="dimmed">
              {t.calqueAide}
            </Text>
            {visuels.calque ? (
              <>
                <VisuelChoisi
                  visuel={visuels.calque}
                  onRemplacer={() => onImporterSecondaire("calque")}
                  onRetirer={() => onRetirerSecondaire("calque")}
                  remplacer={t.remplacer}
                  retirer={t.retirer}
                />
                <Switch size="xs" label={t.afficherCalque} checked={calque.visible} onChange={(e) => calque.onVisible(e.currentTarget.checked)} />
                <div>
                  <Text size="xs" mb={4}>
                    {t.opaciteCalque}
                  </Text>
                  <Slider
                    aria-label={t.opaciteCalque}
                    min={10}
                    max={90}
                    step={5}
                    value={calque.opacite}
                    label={(valeur) => `${valeur} %`}
                    disabled={!calque.visible}
                    onChange={calque.onOpacite}
                  />
                </div>
              </>
            ) : (
              <Button variant="light" leftSection={<IconStack2 size={16} />} onClick={() => onImporterSecondaire("calque")}>
                {t.choisirCalque}
              </Button>
            )}
            {complements}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}

/** Version écran d'une face : facultative, elle remplace celle de l'imprimeur dans les cartes numériques. */
function VersionEcran({
  face,
  visuels,
  format,
  onImporterSecondaire,
  onRetirerSecondaire,
}: {
  face: Face;
  visuels: Visuels;
  format: Format;
  onImporterSecondaire: (emplacement: Secondaire) => void;
  onRetirerSecondaire: (emplacement: Secondaire) => void;
}) {
  const t = libellesCartes(false).modele;
  const emplacement: Secondaire = face === "recto" ? "recto_ecran" : "verso_ecran";
  const version = visuels[emplacement];
  return (
    <Stack gap={4} pl="sm" style={{ borderLeft: "2px solid var(--mantine-color-gray-3)" }} data-version-ecran={face}>
      <Group gap={6} wrap="nowrap">
        <IconDeviceDesktop size={15} stroke={1.5} />
        <Text size="xs" fw={500}>
          {t.versionEcran}
        </Text>
      </Group>
      {version ? (
        <>
          <VisuelChoisi
            visuel={version}
            onRemplacer={() => onImporterSecondaire(emplacement)}
            onRetirer={() => onRetirerSecondaire(emplacement)}
            remplacer={t.remplacer}
            retirer={t.retirer}
          />
          <Diagnostics messages={diagnostiquerVersionEcran(version, format)} />
        </>
      ) : (
        <>
          <Button size="compact-sm" variant="subtle" style={{ alignSelf: "flex-start" }} onClick={() => onImporterSecondaire(emplacement)}>
            {t.ajouterVersionEcran}
          </Button>
          <Text size="xs" c="dimmed">
            {t.versionEcranAide}
          </Text>
        </>
      )}
    </Stack>
  );
}
