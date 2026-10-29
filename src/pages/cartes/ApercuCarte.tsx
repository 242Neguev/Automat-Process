import { useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Loader, LoadingOverlay, Paper, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { apercuCarte, enErreurMoteur, type DonneesAgent, type ErreurMoteur, type Face, type ModeleCarte } from "../../moteur";
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

/**
 * Aperçu calculé par le moteur de rendu (identique à l'export). Le calcul attend une courte pause
 * dans les modifications, pour que le déplacement d'un champ à la souris reste fluide.
 */
export function useApercu(modele: ModeleCarte | null, agent: DonneesAgent | null, face: Face, delaiMs = 120) {
  const [svg, setSvg] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  // Modèle et agents sont recalculés à chaque réglage : on ne relance le rendu que si leur contenu change.
  const cle = modele && agent ? JSON.stringify([modele, agent, face]) : "";

  useEffect(() => {
    if (!modele || !agent) return;
    let actuel = true; // ignore les réponses d'aperçus déjà dépassés
    setChargement(true);
    const minuterie = setTimeout(() => {
      apercuCarte(modele, agent, face)
        .then((resultat) => {
          if (!actuel) return;
          setSvg(resultat);
          setErreur(null);
        })
        .catch((e) => actuel && setErreur(enErreurMoteur(e)))
        .finally(() => actuel && setChargement(false));
    }, delaiMs);
    return () => {
      actuel = false;
      clearTimeout(minuterie);
    };
  }, [cle]); // `cle` résume modele, agent et face

  return { url: useUrlSvg(svg), chargement, erreur };
}

interface Props {
  modele: ModeleCarte;
  agent: DonneesAgent | null;
  face: Face;
  /** Couche posée sur la carte (éditeur de champs), aux mêmes dimensions que l'image. */
  children?: ReactNode;
}

export default function ApercuCarte({ modele, agent, face, children }: Props) {
  const { url, chargement, erreur } = useApercu(modele, agent, face);
  const { largeur_mm, hauteur_mm } = modele.format;

  return (
    <>
      <Paper withBorder p="xl" bg={COULEURS.sec} pos="relative">
        <LoadingOverlay visible={chargement && !children} overlayProps={{ blur: 1, backgroundOpacity: 0.3 }} />
        <Box
          mx="auto"
          maw={680}
          bg="white"
          pos="relative"
          style={{ aspectRatio: `${largeur_mm} / ${hauteur_mm}`, boxShadow: "0 6px 24px rgba(15, 23, 42, 0.18)" }}
        >
          {url && <img src={url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%" }} />}
          {children}
          {/* Dans l'éditeur, l'ancien rendu reste visible pendant le calcul : un discret indicateur suffit. */}
          {children && chargement && <Loader size="xs" pos="absolute" top={8} right={8} />}
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
