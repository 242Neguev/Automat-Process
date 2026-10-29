import { useState } from "react";
import { Badge, Button, Group, List, Loader, Modal, Paper, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconFileTypePdf } from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { compter, regrouper } from "../../controle/cartes";
import { enErreurMoteur, exporterCartes, type DonneesAgent, type Feuille, type ModeleCarte, type Sortie } from "../../moteur";
import { textes } from "../../textes";
import IconeGravite from "./IconeGravite";
import type { Controle } from "./useControle";

const t = textes.cartes.destination;
const tc = textes.cartes.controle;
const FEUILLES: Feuille[] = ["A4", "A3", "SRA3"];

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  controle: Controle;
  /** Retour à la vérification, sur les cartes à corriger. */
  onVoirCartes: () => void;
}

export default function EtapeDestination({ modele, agents, controle, onVoirCartes }: Props) {
  const [sortie, setSortie] = useState<Sortie>("planches");
  const [feuille, setFeuille] = useState<Feuille>("A4");
  const [enCours, setEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const nombres = controle.rapport ? compter(controle.rapport) : null;
  const graves = controle.rapport ? regrouper(controle.rapport).filter((g) => g.gravite === "erreur") : [];

  /** Les problèmes graves sont signalés avant l'export ; l'utilisateur peut exporter quand même. */
  function demanderExport() {
    if (nombres && nombres.erreur > 0) setConfirmation(true);
    else exporter();
  }

  async function exporter() {
    const chemin = await save({ defaultPath: t.nomFichier[sortie], filters: [{ name: t.filtrePdf, extensions: ["pdf"] }] });
    if (!chemin) return;
    setEnCours(true);
    try {
      await exporterCartes(modele, agents, sortie, feuille, chemin);
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
        {controle.enCours ? (
          <Group gap="xs">
            <Loader size={14} />
            <Text size="sm">{tc.calcul}</Text>
          </Group>
        ) : (
          nombres && (
            <Group gap="xs" wrap="nowrap">
              <IconeGravite gravite={nombres.erreur > 0 ? "erreur" : nombres.attention > 0 ? "attention" : null} taille={18} />
              <Text size="sm">
                {nombres.erreur + nombres.attention === 0
                  ? tc.toutesCorrectes
                  : [nombres.erreur > 0 && tc.aCorriger(nombres.erreur), nombres.attention > 0 && tc.aVerifier(nombres.attention)].filter(Boolean).join(" · ")}
              </Text>
            </Group>
          )
        )}
        <Button leftSection={<IconFileTypePdf size={18} />} loading={enCours} disabled={controle.enCours} onClick={demanderExport}>
          {t.enregistrer}
        </Button>
      </Stack>

      <Modal opened={confirmation} onClose={() => setConfirmation(false)} title={t.confirmation.titre} centered>
        <Stack gap="sm">
          <Text>{t.confirmation.message(nombres?.erreur ?? 0)}</Text>
          <List spacing={4} size="sm" center>
            {graves.map((g) => (
              <List.Item key={g.cle} icon={<IconeGravite gravite="erreur" taille={16} />}>
                {g.resume} ({tc.nbCartes(g.agents.length)})
              </List.Item>
            ))}
          </List>
          <Text size="sm" c="dimmed">
            {t.confirmation.conseil}
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => {
                setConfirmation(false);
                onVoirCartes();
              }}
            >
              {t.confirmation.voir}
            </Button>
            <Button
              color="red"
              onClick={() => {
                setConfirmation(false);
                exporter();
              }}
            >
              {t.confirmation.exporter}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
