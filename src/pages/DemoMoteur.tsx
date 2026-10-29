import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFileTypePdf,
  IconInfoCircle,
} from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { apercuDemo, enErreurMoteur, exporterDemo, type ErreurMoteur, type Face, type Feuille, type Sortie } from "../moteur";
import { textes } from "../textes";
import { COULEURS } from "../theme";

const t = textes.demo;
const FEUILLES: Feuille[] = ["A4", "A3", "SRA3"];

/** URL d'objet pour afficher un SVG dans une balise <img>, libérée dès que le SVG change. */
function useUrlSvg(svg: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) return;
    const nouvelle = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(nouvelle);
    return () => URL.revokeObjectURL(nouvelle);
  }, [svg]);
  return url;
}

export default function DemoMoteur({ nbAgents }: { nbAgents: number }) {
  const [agent, setAgent] = useState(0);
  const [face, setFace] = useState<Face>("recto");
  const [svg, setSvg] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  const [sortie, setSortie] = useState<Sortie>("planches");
  const [feuille, setFeuille] = useState<Feuille>("A4");
  const [exportEnCours, setExportEnCours] = useState(false);
  const urlApercu = useUrlSvg(svg);

  useEffect(() => {
    let actuel = true; // ignore les réponses d'aperçus déjà dépassés
    setChargement(true);
    apercuDemo(agent, face)
      .then((resultat) => {
        if (!actuel) return;
        setSvg(resultat);
        setErreur(null);
      })
      .catch((e) => actuel && setErreur(enErreurMoteur(e)))
      .finally(() => actuel && setChargement(false));
    return () => {
      actuel = false;
    };
  }, [agent, face]);

  async function exporter() {
    const chemin = await save({
      defaultPath: t.nomFichier[sortie],
      filters: [{ name: t.filtrePdf, extensions: ["pdf"] }],
    });
    if (!chemin) return;
    setExportEnCours(true);
    try {
      await exporterDemo(sortie, feuille, chemin);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.enregistre, message: chemin });
    } catch (e) {
      const { message, details } = enErreurMoteur(e);
      notifications.show({
        color: "red",
        icon: <IconAlertTriangle size={18} />,
        title: textes.erreur,
        message: [message, ...details].join("\n"),
      });
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <Stack gap="lg" maw={1100}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>

      <Alert variant="light" icon={<IconInfoCircle />}>
        {t.explication}
      </Alert>

      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Paper withBorder p="xl" bg={COULEURS.sec} pos="relative">
            <LoadingOverlay visible={chargement} overlayProps={{ blur: 1, backgroundOpacity: 0.3 }} />
            <Box
              mx="auto"
              maw={640}
              bg="white"
              style={{ aspectRatio: "85 / 55", boxShadow: "0 6px 24px rgba(15, 23, 42, 0.18)" }}
            >
              {urlApercu && (
                <img src={urlApercu} alt="" style={{ display: "block", width: "100%", height: "100%" }} />
              )}
            </Box>
          </Paper>

          {erreur && (
            <Alert color="red" icon={<IconAlertTriangle />} title={erreur.message}>
              {erreur.details.map((detail) => (
                <Text key={detail} size="sm" ff="monospace">
                  {detail}
                </Text>
              ))}
            </Alert>
          )}

          <Group justify="space-between">
            <Group gap="xs">
              <Tooltip label={t.precedent}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  aria-label={t.precedent}
                  disabled={agent === 0}
                  onClick={() => setAgent((a) => a - 1)}
                >
                  <IconChevronLeft size={18} />
                </ActionIcon>
              </Tooltip>
              <Text size="sm" w={130} ta="center">
                {nbAgents > 0 ? t.agent(agent + 1, nbAgents) : "…"}
              </Text>
              <Tooltip label={t.suivant}>
                <ActionIcon
                  variant="default"
                  size="lg"
                  aria-label={t.suivant}
                  disabled={agent >= nbAgents - 1}
                  onClick={() => setAgent((a) => a + 1)}
                >
                  <IconChevronRight size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
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
            <Title order={5}>{t.exporterTitre}</Title>
            <SegmentedControl
              orientation="vertical"
              fullWidth
              value={sortie}
              onChange={(valeur) => setSortie(valeur as Sortie)}
              data={[
                { value: "planches", label: t.planches },
                { value: "cartes", label: t.uneCarteParPage },
              ]}
            />
            {sortie === "planches" && (
              <Select
                label={t.feuille}
                value={feuille}
                allowDeselect={false}
                onChange={(valeur) => valeur && setFeuille(valeur as Feuille)}
                data={FEUILLES.map((f) => ({ value: f, label: t.feuilles[f] }))}
              />
            )}
            <Text size="sm" c="dimmed">
              {sortie === "planches" ? t.detailPlanches : t.detailCartes}
            </Text>
            <Button leftSection={<IconFileTypePdf size={18} />} loading={exportEnCours} onClick={exporter}>
              {t.enregistrer}
            </Button>
          </Stack>
        </Paper>
      </Group>
    </Stack>
  );
}
