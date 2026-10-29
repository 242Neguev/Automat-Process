import { useEffect, useState } from "react";
import { Alert, Box, LoadingOverlay, Paper, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { apercuCarte, enErreurMoteur, type DonneesAgent, type ErreurMoteur, type Face } from "../../moteur";
import { COULEURS } from "../../theme";

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

/** Aperçu d'une face de carte, calculé par le moteur de rendu (identique à l'export). */
export default function ApercuCarte({ agent, face }: { agent: DonneesAgent | null; face: Face }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  const url = useUrlSvg(svg);
  // Les agents sont recalculés à chaque réglage : on ne relance l'aperçu que si leur contenu change.
  const cle = agent ? JSON.stringify(agent) : "";

  useEffect(() => {
    if (!agent) return;
    let actuel = true; // ignore les réponses d'aperçus déjà dépassés
    setChargement(true);
    apercuCarte(agent, face)
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
  }, [cle, face]); // `cle` résume `agent`

  return (
    <>
      <Paper withBorder p="xl" bg={COULEURS.sec} pos="relative">
        <LoadingOverlay visible={chargement} overlayProps={{ blur: 1, backgroundOpacity: 0.3 }} />
        <Box mx="auto" maw={640} bg="white" style={{ aspectRatio: "85 / 55", boxShadow: "0 6px 24px rgba(15, 23, 42, 0.18)" }}>
          {url && <img src={url} alt="" style={{ display: "block", width: "100%", height: "100%" }} />}
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
    </>
  );
}
