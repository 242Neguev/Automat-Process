import { useEffect, useState } from "react";
import { Alert, Image, Loader, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { apercuCourrier, enErreurMoteur, type ApercuCourrier, type Courrier, type ErreurMoteur } from "../../moteur";
import { textes } from "../../textes";

const t = textes.word.verification;
/** Attente avant de lancer la conversion : parcourir les courriers ne déclenche pas une conversion par clic. */
const PAUSE_MS = 400;

/** Le courrier tel que Word l'imprime : converti en PDF, puis ses pages affichées. */
export default function ApercuFidele({ modele, courrier }: { modele: string; courrier: Courrier }) {
  const [apercu, setApercu] = useState<{ cle: string; urls: string[]; infos: Omit<ApercuCourrier, "pages"> } | null>(null);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  const cle = JSON.stringify(courrier.parties["word/document.xml"]);

  useEffect(() => {
    let actuel = true;
    let urls: string[] = [];
    setErreur(null);
    const minuterie = window.setTimeout(() => {
      apercuCourrier(modele, courrier)
        .then(({ pages, ...infos }) => {
          if (!actuel) return;
          urls = pages.map((svg) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })));
          setApercu({ cle, urls, infos });
        })
        .catch((e) => actuel && setErreur(enErreurMoteur(e)));
    }, PAUSE_MS);
    return () => {
      actuel = false;
      window.clearTimeout(minuterie);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [modele, cle]); // `cle` résume le courrier

  if (erreur) {
    return (
      <Alert color="orange" icon={<IconAlertTriangle size={18} />} style={{ whiteSpace: "pre-line" }}>
        {[erreur.message, ...erreur.details].join("\n")}
      </Alert>
    );
  }
  if (apercu?.cle !== cle) {
    return (
      <Stack align="center" py="xl" gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t.calculFidele}
        </Text>
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t.fideleAide[apercu.infos.convertisseur]}
      </Text>
      {apercu.infos.remarque && (
        <Alert color="orange" variant="light" icon={<IconInfoCircle size={18} />} p="xs">
          <Text size="xs">{apercu.infos.remarque}</Text>
        </Alert>
      )}
      <ScrollArea.Autosize mah={620} type="auto">
        <Stack gap="md">
          {apercu.urls.map((url, i) => (
            <Paper key={url} withBorder shadow="xs" radius={0}>
              <Image src={url} alt={`Page ${i + 1}`} />
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
