import { useEffect, useState } from "react";
import { Alert, AspectRatio, Box, Group, Pagination, Paper, SimpleGrid, Skeleton, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { graviteCarte, type Probleme } from "../../controle/cartes";
import { libelleAgent } from "../../donnees/agents";
import { enErreurMoteur, vignettesCartes, type DonneesAgent, type ErreurMoteur, type ModeleCarte } from "../../moteur";
import IconeGravite from "./IconeGravite";

const PAR_PAGE = 24;
const LARGEUR_VIGNETTE = 260; // px à l'écran

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  rapport: Map<string, Probleme[]> | null;
  onChoisir: (agent: string) => void;
}

/** Toutes les cartes (recto) en vignettes, par pages de 24 ; un clic ouvre la carte. */
export default function MosaiqueCartes({ modele, agents, rapport, onChoisir }: Props) {
  const [page, setPage] = useState(1);
  const [images, setImages] = useState<{ cle: string; urls: string[] } | null>(null);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  const pages = Math.max(1, Math.ceil(agents.length / PAR_PAGE));
  const pageActive = Math.min(page, pages);
  const lot = agents.slice((pageActive - 1) * PAR_PAGE, pageActive * PAR_PAGE);
  const largeurPx = Math.round(LARGEUR_VIGNETTE * Math.min(2, window.devicePixelRatio || 1));
  const cle = JSON.stringify([modele, lot, largeurPx]);

  useEffect(() => {
    let actuel = true;
    let urls: string[] = [];
    setErreur(null);
    vignettesCartes(modele, lot, largeurPx)
      .then((blobs) => {
        urls = blobs.map((blob) => URL.createObjectURL(blob));
        if (actuel) setImages({ cle, urls });
      })
      .catch((e) => actuel && setErreur(enErreurMoteur(e)));
    return () => {
      actuel = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cle]); // `cle` résume modele, lot et largeurPx

  if (erreur) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={18} />} title={erreur.message}>
        {erreur.details.join("\n")}
      </Alert>
    );
  }
  const urls = images?.cle === cle ? images.urls : null;
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 3, xl: 4 }} spacing="md" verticalSpacing="md">
        {lot.map((agent, i) => (
          <UnstyledButton key={agent.id} onClick={() => onChoisir(agent.id)} data-vignette={agent.id}>
            <Paper withBorder radius="sm" pos="relative" style={{ overflow: "hidden" }}>
              <AspectRatio ratio={modele.format.largeur_mm / modele.format.hauteur_mm}>
                {urls?.[i] ? <img src={urls[i]} alt="" style={{ display: "block", width: "100%" }} /> : <Skeleton radius={0} />}
              </AspectRatio>
              {rapport && (
                <Box pos="absolute" top={6} right={6}>
                  <IconeGravite gravite={graviteCarte(rapport.get(agent.id))} />
                </Box>
              )}
            </Paper>
            <Text size="xs" mt={4} truncate dir="auto">
              {libelleAgent(agent)}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      {pages > 1 && (
        <Group justify="center">
          <Pagination total={pages} value={pageActive} onChange={setPage} />
        </Group>
      )}
    </Stack>
  );
}
