import { useState } from "react";
import { Button, Select, Stack, Text } from "@mantine/core";
import { IconFileCertificate } from "@tabler/icons-react";
import { cartesDuBat, type ChoixBat } from "../../controle/cartes";
import type { DonneesAgent, MesureTexte, ModeleCarte } from "../../moteur";
import { textes } from "../../textes";

const t = textes.cartes.destination.bat;
type Choix = ChoixBat;

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  /** Mesures du contrôle des cartes, pour trouver les cas les plus longs. */
  mesures: MesureTexte[] | null;
  enCours: boolean;
  onCreer: (cartes: DonneesAgent[]) => void;
}

export default function ExportBat({ modele, agents, mesures, enCours, onCreer }: Props) {
  const [choix, setChoix] = useState<Choix>("cas");
  const cartes = cartesDuBat(choix, modele, agents, mesures);
  return (
    <Stack gap="sm" data-export-bat>
      <Text size="sm" c="dimmed">
        {t.detail}
      </Text>
      <Select
        label={t.cartes}
        value={choix}
        allowDeselect={false}
        data={(Object.keys(t.choix) as Choix[]).map((value) => ({ value, label: t.choix[value] }))}
        onChange={(valeur) => valeur && setChoix(valeur as Choix)}
      />
      <Text size="sm">{t.nombre(cartes.length)}</Text>
      <Button leftSection={<IconFileCertificate size={18} />} loading={enCours} disabled={cartes.length === 0} onClick={() => onCreer(cartes)}>
        {t.creer}
      </Button>
    </Stack>
  );
}
