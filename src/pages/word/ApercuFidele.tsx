import { useEffect, useState } from "react";
import { Alert, Image, Loader, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { apercuCourrier, enErreurMoteur, type Courrier, type ErreurMoteur } from "../../moteur";
import { textes } from "../../textes";

const t = textes.word.verification;

/** Le courrier tel que Word l'imprime : converti en PDF, puis ses pages affichées. */
export default function ApercuFidele({ modele, courrier }: { modele: string; courrier: Courrier }) {
  const [pages, setPages] = useState<{ cle: string; urls: string[] } | null>(null);
  const [erreur, setErreur] = useState<ErreurMoteur | null>(null);
  const cle = JSON.stringify(courrier.parties["word/document.xml"]);

  useEffect(() => {
    let actuel = true;
    let urls: string[] = [];
    setErreur(null);
    apercuCourrier(modele, courrier)
      .then((svgs) => {
        urls = svgs.map((svg) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })));
        if (actuel) setPages({ cle, urls });
      })
      .catch((e) => actuel && setErreur(enErreurMoteur(e)));
    return () => {
      actuel = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [modele, cle]); // `cle` résume le courrier

  if (erreur) {
    return (
      <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
        {[erreur.message, ...erreur.details].join("\n")}
      </Alert>
    );
  }
  if (pages?.cle !== cle) {
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
        {t.fideleAide}
      </Text>
      <ScrollArea.Autosize mah={620} type="auto">
        <Stack gap="md">
          {pages.urls.map((url, i) => (
            <Paper key={url} withBorder shadow="xs" radius={0}>
              <Image src={url} alt={`Page ${i + 1}`} />
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
