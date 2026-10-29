import { useState } from "react";
import { Badge, Button, Group, Paper, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconFileTypePdf } from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { enErreurMoteur, exporterCartes, type DonneesAgent, type Feuille, type Sortie } from "../../moteur";
import { textes } from "../../textes";

const t = textes.cartes.destination;
const FEUILLES: Feuille[] = ["A4", "A3", "SRA3"];

export default function EtapeDestination({ agents }: { agents: DonneesAgent[] }) {
  const [sortie, setSortie] = useState<Sortie>("planches");
  const [feuille, setFeuille] = useState<Feuille>("A4");
  const [enCours, setEnCours] = useState(false);

  async function exporter() {
    const chemin = await save({ defaultPath: t.nomFichier[sortie], filters: [{ name: t.filtrePdf, extensions: ["pdf"] }] });
    if (!chemin) return;
    setEnCours(true);
    try {
      await exporterCartes(agents, sortie, feuille, chemin);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.enregistre, message: chemin });
    } catch (e) {
      const { message, details } = enErreurMoteur(e);
      notifications.show({ color: "red", icon: <IconAlertTriangle size={18} />, title: textes.erreur, message: [message, ...details].join("\n") });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Paper withBorder p="lg" maw={460}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={5}>{t.titre}</Title>
          <Badge variant="light">{t.resume(agents.length)}</Badge>
        </Group>
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
        <Button leftSection={<IconFileTypePdf size={18} />} loading={enCours} onClick={exporter}>
          {t.enregistrer}
        </Button>
      </Stack>
    </Paper>
  );
}
