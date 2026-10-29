import { Accordion, ActionIcon, Button, ColorInput, Group, NumberInput, Paper, SegmentedControl, Select, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconColorPicker, IconTrash, IconX } from "@tabler/icons-react";
import type { Transformation } from "../../donnees/nettoyage";
import type { ChampsVCard } from "../../donnees/vcard";
import { changerAncre } from "../../modele/champs";
import type { Champ, ChampMasque, ChampQr, ChampTexte, Couleur, ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import { COULEURS } from "../../theme";

const t = textes.cartes.champ;
const CLES_VCARD = Object.keys(t.vcard) as (keyof ChampsVCard)[];
const BALISE = /\{\{([^}]+)\}\}/g;

/** Couleur affichable à l'écran (une couleur CMJN est convertie approximativement). */
export function enHexa(couleur: Couleur): string {
  if ("rgb" in couleur) return couleur.rgb;
  const [c, m, j, n] = couleur.cmyk.map((v) => v / 100);
  const canal = (v: number) => Math.round(255 * (1 - v) * (1 - n)).toString(16).padStart(2, "0");
  return `#${canal(c)}${canal(m)}${canal(j)}`;
}

interface Props {
  champ: Champ;
  modele: ModeleCarte;
  polices: string[];
  onChamp: (id: string, modifications: Partial<Champ>) => void;
  onTransformation: (balise: string, transformation: Transformation | null) => void;
  onSupprimer: (id: string) => void;
  onFermer: () => void;
  /** Mesure la couleur du visuel autour d'une zone effacée. */
  onMesurerCouleur: (id: string) => void;
}

export default function ProprietesChamp({ champ, modele, polices, onChamp, onTransformation, onSupprimer, onFermer, onMesurerCouleur }: Props) {
  const couleursModele = [...new Set(modele.champs.map((c) => enHexa(c.couleur)))];
  const nuancier = [...new Set([COULEURS.encre, COULEURS.eau, "#000000", "#ffffff", ...couleursModele])];
  const couleur = (
    <ColorInput
      label={t.couleur}
      format="hex"
      swatches={nuancier}
      value={enHexa(champ.couleur)}
      onChange={(hexa) => /^#[0-9a-f]{6}$/i.test(hexa) && onChamp(champ.id, { couleur: { rgb: hexa } })}
    />
  );
  const entete = (titre: string) => (
    <Group justify="space-between" wrap="nowrap">
      <Title order={5}>{titre}</Title>
      <Tooltip label={t.fermer}>
        <ActionIcon variant="subtle" color="gray" aria-label={t.fermer} onClick={onFermer}>
          <IconX size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
  const supprimer = (
    <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={() => onSupprimer(champ.id)}>
      {t.supprimer}
    </Button>
  );

  if (champ.type === "qr") {
    const qr: ChampQr = champ;
    return (
      <Paper withBorder p="md">
        <Stack gap="sm">
          {entete(t.titreQr)}
          <NumberInput label={t.tailleQr} min={8} max={60} step={0.5} decimalScale={1} value={qr.taille_mm} onChange={(v) => typeof v === "number" && onChamp(qr.id, { taille_mm: v })} />
          {couleur}
          <Text size="sm" fw={500}>
            {t.vcardTitre}
          </Text>
          {CLES_VCARD.map((cle) => (
            <TextInput
              key={cle}
              size="xs"
              label={t.vcard[cle]}
              value={qr.vcard?.[cle] ?? ""}
              onChange={(e) => onChamp(qr.id, { vcard: { ...qr.vcard, [cle]: e.currentTarget.value } })}
            />
          ))}
          {supprimer}
        </Stack>
      </Paper>
    );
  }

  if (champ.type === "masque") {
    const masque: ChampMasque = champ;
    const dimension = (cle: "largeur_mm" | "hauteur_mm") => (v: string | number) => typeof v === "number" && v > 0 && onChamp(masque.id, { [cle]: v });
    return (
      <Paper withBorder p="md">
        <Stack gap="sm">
          {entete(t.titreMasque)}
          <Text size="xs" c="dimmed">
            {t.masqueAide}
          </Text>
          {couleur}
          <Button variant="light" leftSection={<IconColorPicker size={16} />} onClick={() => onMesurerCouleur(masque.id)}>
            {t.mesurerCouleur}
          </Button>
          <Group grow>
            <NumberInput label={t.largeurMasque} min={0.5} step={0.5} decimalScale={1} value={masque.largeur_mm} onChange={dimension("largeur_mm")} />
            <NumberInput label={t.hauteurMasque} min={0.5} step={0.5} decimalScale={1} value={masque.hauteur_mm} onChange={dimension("hauteur_mm")} />
          </Group>
          {supprimer}
        </Stack>
      </Paper>
    );
  }

  const texte: ChampTexte = champ;
  const balises = [...new Set([...texte.modele.matchAll(BALISE)].map((m) => m[1].trim()))];
  const nombre = (cle: keyof ChampTexte) => (valeur: string | number) => typeof valeur === "number" && onChamp(texte.id, { [cle]: valeur });

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        {entete(t.titre)}
        <TextInput label={t.contenu} description={t.contenuAide} value={texte.modele} onChange={(e) => onChamp(texte.id, { modele: e.currentTarget.value })} />
        <Select
          label={t.police}
          searchable
          limit={60}
          data={polices.includes(texte.police) ? polices : [texte.police, ...polices]}
          value={texte.police}
          allowDeselect={false}
          onChange={(police) => police && onChamp(texte.id, { police })}
        />
        <Group grow>
          <NumberInput label={t.taille} min={4} max={72} step={0.5} decimalScale={1} value={texte.taille_pt} onChange={nombre("taille_pt")} />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t.style}
            </Text>
            <SegmentedControl
              fullWidth
              value={texte.graisse >= 600 ? "gras" : "normal"}
              onChange={(v) => onChamp(texte.id, { graisse: v === "gras" ? 700 : 400 })}
              data={[
                { value: "normal", label: t.normal },
                { value: "gras", label: t.gras },
              ]}
            />
          </div>
        </Group>
        {couleur}
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t.alignement}
          </Text>
          <SegmentedControl
            fullWidth
            value={texte.ancre}
            onChange={(ancre) => onChamp(texte.id, changerAncre(texte, ancre as ChampTexte["ancre"]))}
            data={[
              { value: "start", label: t.gauche },
              { value: "middle", label: t.centre },
              { value: "end", label: t.droite },
            ]}
          />
        </div>
        {balises.map((balise) => (
          <Select
            key={balise}
            label={t.miseEnForme(balise)}
            value={modele.transformations?.[balise] ?? "aucune"}
            allowDeselect={false}
            data={Object.entries(t.transformations).map(([value, label]) => ({ value, label }))}
            onChange={(v) => onTransformation(balise, v && v !== "aucune" ? (v as Transformation) : null)}
          />
        ))}
        <Accordion variant="contained">
          <Accordion.Item value="avance">
            <Accordion.Control>{t.avance}</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <NumberInput label={t.largeurMax} min={5} step={0.5} decimalScale={1} value={texte.largeur_max_mm} onChange={nombre("largeur_max_mm")} />
                <NumberInput label={t.tailleMin} description={t.tailleMinAide} min={3} step={0.5} decimalScale={1} value={texte.taille_min_pt} onChange={nombre("taille_min_pt")} />
                <NumberInput label={t.lignesMax} min={1} max={4} value={texte.lignes_max} onChange={nombre("lignes_max")} />
                <NumberInput label={t.interlettrage} min={-0.1} max={0.5} step={0.01} decimalScale={2} value={texte.interlettrage_em} onChange={nombre("interlettrage_em")} />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        {supprimer}
      </Stack>
    </Paper>
  );
}
