import { useState } from "react";
import { Button, SegmentedControl, Select, Stack, Switch, Text } from "@mantine/core";
import { IconDeviceMobile } from "@tabler/icons-react";
import type { ModeleCarte, OptionsNumerique } from "../../moteur";
import { textes } from "../../textes";

const t = textes.cartes.destination.numerique;
type Format = OptionsNumerique["format"];

interface Props {
  modele: ModeleCarte;
  enCours: boolean;
  onExporter: (options: OptionsNumerique, avecFiches: boolean) => void;
}

/** Cartes numériques : image ou PDF cliquable par agent, et sa fiche contact. */
export default function ExportNumerique({ modele, enCours, onExporter }: Props) {
  const [format, setFormat] = useState<Format>("png");
  const [largeur, setLargeur] = useState("1200");
  const [verso, setVerso] = useState(true);
  const [fiches, setFiches] = useState(true);

  return (
    <Stack gap="sm" data-export-numerique>
      <SegmentedControl
        fullWidth
        value={format}
        onChange={(valeur) => setFormat(valeur as Format)}
        data={(["png", "jpg", "pdf"] as const).map((value) => ({ value, label: t.formats[value] }))}
      />
      <Text size="sm" c="dimmed">
        {t.details[format]}
      </Text>
      {format !== "pdf" && (
        <Select
          label={t.taille}
          value={largeur}
          allowDeselect={false}
          data={Object.entries(t.tailles).map(([value, label]) => ({ value, label }))}
          onChange={(valeur) => valeur && setLargeur(valeur)}
        />
      )}
      {modele.fond_verso && <Switch label={t.verso} checked={verso} onChange={(e) => setVerso(e.currentTarget.checked)} />}
      <Switch label={t.fiches} description={t.fichesAide} checked={fiches} onChange={(e) => setFiches(e.currentTarget.checked)} />
      <Button
        leftSection={<IconDeviceMobile size={18} />}
        loading={enCours}
        onClick={() => onExporter({ format, largeurPx: Number(largeur), verso: verso && Boolean(modele.fond_verso) }, fiches)}
      >
        {t.creer}
      </Button>
    </Stack>
  );
}
