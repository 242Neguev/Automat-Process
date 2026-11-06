import { useEffect, useRef } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconExternalLink, IconFolder, IconFolderOpen } from "@tabler/icons-react";
import { dossierDe, nomDe } from "../../donnees/chemins";
import { montrerDansDossier, ouvrirFichier } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "./signalerErreur";

const t = textes.resultat;

/** Ce qui vient d'être créé : un fichier, ou un dossier de fichiers. */
export interface Cree {
  titre: string;
  chemin: string;
  /** `chemin` est un dossier (pages de signatures, courriers, images). */
  dossier?: boolean;
  /** Ce qu'il faut savoir en plus (logiciel qui a converti les courriers…). */
  details?: string[];
  /** Les détails appellent à vérifier (encadré orange). */
  attention?: boolean;
}

/**
 * Le travail est fait : où se trouve le résultat, et de quoi l'ouvrir ou l'afficher dans son
 * dossier. L'encadré reste jusqu'au travail suivant : on ne perd pas son fichier (comme dans Automat-PDF).
 */
export default function Resultat({ cree, onFermer }: { cree: Cree | null; onFermer: () => void }) {
  const encadre = useRef<HTMLDivElement>(null);
  // L'encadré vient sous le bouton : on le fait défiler jusqu'à être vu (au-dessus de la barre des étapes).
  useEffect(() => {
    if (cree) encadre.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [cree]);
  if (!cree) return null;
  const ouvrir = () => void ouvrirFichier(cree.chemin).catch(signalerErreur);
  const montrer = () => void montrerDansDossier(cree.chemin).catch(signalerErreur);
  return (
    <Alert
      color={cree.attention ? "orange" : "teal"}
      icon={cree.attention ? <IconAlertTriangle size={22} /> : <IconCircleCheck size={22} />}
      title={cree.titre}
      withCloseButton
      closeButtonLabel={t.fermer}
      onClose={onFermer}
      ref={encadre}
      style={{ scrollMarginBottom: 96 }}
      data-resultat
    >
      <Stack gap="xs">
        {cree.details?.map((ligne) => (
          <Text key={ligne} size="sm">
            {ligne}
          </Text>
        ))}
        <Text size="sm" style={{ overflowWrap: "anywhere" }}>
          {cree.dossier ? t.dossier(cree.chemin) : t.fichier(nomDe(cree.chemin), dossierDe(cree.chemin))}
        </Text>
        <Group gap="xs">
          {cree.dossier ? (
            <Button leftSection={<IconFolderOpen size={18} />} onClick={ouvrir}>
              {t.ouvrirDossier}
            </Button>
          ) : (
            <>
              <Button leftSection={<IconExternalLink size={18} />} onClick={ouvrir}>
                {t.ouvrir}
              </Button>
              <Button variant="default" leftSection={<IconFolder size={18} />} onClick={montrer}>
                {t.montrer}
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}
