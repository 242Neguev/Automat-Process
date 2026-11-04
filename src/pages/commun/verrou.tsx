// Mode opérateur : un modèle verrouillé ne se modifie pas par mégarde. Le graphiste le règle une fois,
// le verrouille et enregistre le projet ; l'opérateur rouvre le projet et ne change que la liste.
import { useState, type ReactNode } from "react";
import { Alert, Button, Group, Modal, Stack, Text, Tooltip } from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { textes } from "../../textes";

const t = textes.verrou;

/** Confirmation du déverrouillage. */
function useDeverrouillage(onDeverrouiller: () => void) {
  const [ouverte, setOuverte] = useState(false);
  const fenetre = (
    <Modal opened={ouverte} onClose={() => setOuverte(false)} title={t.confirmationTitre} centered>
      <Stack gap="md">
        <Text size="sm">{t.confirmation}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setOuverte(false)}>
            {t.annuler}
          </Button>
          <Button
            color="orange"
            leftSection={<IconLockOpen size={16} />}
            onClick={() => {
              setOuverte(false);
              onDeverrouiller();
            }}
          >
            {t.confirmer}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
  return { demander: () => setOuverte(true), fenetre };
}

/** Bouton de l'en-tête d'un assistant : verrouiller le modèle, ou le déverrouiller après confirmation. */
export function BoutonVerrou({ verrouille, onChange }: { verrouille: boolean; onChange: (verrouille: boolean) => void }) {
  const { demander, fenetre } = useDeverrouillage(() => onChange(false));
  return (
    <>
      <Tooltip label={verrouille ? t.deverrouillerAide : t.verrouillerAide} multiline w={300} withArrow>
        <Button
          variant={verrouille ? "light" : "default"}
          color={verrouille ? "orange" : undefined}
          leftSection={verrouille ? <IconLock size={16} /> : <IconLockOpen size={16} />}
          onClick={() => (verrouille ? demander() : onChange(true))}
        >
          {verrouille ? t.verrouille : t.verrouiller}
        </Button>
      </Tooltip>
      {fenetre}
    </>
  );
}

/** Bandeau de l'étape Modèle quand le modèle est verrouillé. */
export function BandeauVerrou({ onDeverrouiller }: { onDeverrouiller: () => void }) {
  const { demander, fenetre } = useDeverrouillage(onDeverrouiller);
  return (
    <Alert color="orange" variant="light" icon={<IconLock size={18} />} title={t.bandeauTitre} data-modele-verrouille>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{t.bandeau}</Text>
        <Button size="compact-sm" variant="subtle" color="orange" leftSection={<IconLockOpen size={14} />} onClick={demander}>
          {t.deverrouiller}
        </Button>
      </Stack>
      {fenetre}
    </Alert>
  );
}

/**
 * Réglages en lecture seule : un <fieldset> désactivé rend inactifs tous les champs et boutons qu'il
 * contient, sans toucher à leur mise en forme.
 */
export function LectureSeule({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={active} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}
