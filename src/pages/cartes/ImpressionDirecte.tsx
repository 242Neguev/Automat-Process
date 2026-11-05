import { useEffect, useState } from "react";
import { ActionIcon, Alert, Button, Group, Loader, NumberInput, Select, Stack, Switch, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle, IconPrinter, IconRefresh } from "@tabler/icons-react";
import { libelleAgent } from "../../donnees/agents";
import { aUnVerso } from "../../modele/visuels";
import { enErreurMoteur, imprimantes, type DonneesAgent, type Imprimante, type ModeleCarte, type ReglagesImpression } from "../../moteur";
import { textes } from "../../textes";

const t = textes.cartes.destination.impression;
const TOUTES = "toutes";
/** Marques et modèles d'imprimantes à cartes PVC courants, pour les proposer d'office. */
const IMPRIMANTE_A_CARTES = /evolis|primacy|zenius|badgy|zebra|zxp|zc[13]\d\d|magicard|fargo|hid|datacard|entrust|idp|smart-?\d|matica|nisca|dnp|hiti/i;
const SOUS_WINDOWS = navigator.userAgent.includes("Windows");

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  enCours: boolean;
  onImprimer: (imprimante: string, agents: DonneesAgent[], reglages: ReglagesImpression) => void;
}

/** Imprimante proposée d'office : une imprimante à cartes, sinon celle par défaut. */
function choisirParDefaut(liste: Imprimante[]): string | null {
  return (liste.find((i) => IMPRIMANTE_A_CARTES.test(i.nom)) ?? liste.find((i) => i.parDefaut) ?? liste[0])?.nom ?? null;
}

/** Impression directe sur une imprimante installée (badges PVC sur Evolis, Zebra… ou toute autre). */
export default function ImpressionDirecte({ modele, agents, enCours, onImprimer }: Props) {
  const [liste, setListe] = useState<Imprimante[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const [quelles, setQuelles] = useState(TOUTES);
  const [rectoVerso, setRectoVerso] = useState(true);
  const [retournerVerso, setRetournerVerso] = useState(false);
  const [exemplaires, setExemplaires] = useState(1);

  function chercher() {
    setListe(null);
    setErreur(null);
    imprimantes().then(
      (trouvees) => {
        setListe(trouvees);
        setNom((actuel) => (actuel && trouvees.some((i) => i.nom === actuel) ? actuel : choisirParDefaut(trouvees)));
      },
      (e) => setErreur(enErreurMoteur(e).message),
    );
  }
  useEffect(chercher, []);

  const choisie = liste?.find((i) => i.nom === nom) ?? null;
  const avecVerso = aUnVerso(modele);
  const dosPossible = avecVerso && (choisie?.rectoVerso ?? true);
  const { largeur_mm, hauteur_mm } = modele.format;
  const cr80 = Math.abs(largeur_mm - 85.6) < 0.2 && Math.abs(hauteur_mm - 54) < 0.2;
  const aImprimer = quelles === TOUTES ? agents : agents.filter((agent) => agent.id === quelles);

  if (!SOUS_WINDOWS && liste?.length === 0) {
    return (
      <Alert color="gray" icon={<IconInfoCircle size={18} />}>
        {t.indisponible}
      </Alert>
    );
  }
  return (
    <Stack gap="sm" data-impression-directe>
      {erreur && <Alert color="red">{erreur}</Alert>}
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Select
          style={{ flex: 1 }}
          label={t.imprimante}
          placeholder={liste ? undefined : t.recherche}
          rightSection={liste ? undefined : <Loader size={14} />}
          value={nom}
          allowDeselect={false}
          data={(liste ?? []).map((i) => ({
            value: i.nom,
            label: [i.nom, IMPRIMANTE_A_CARTES.test(i.nom) ? `· ${t.aCartes}` : "", i.parDefaut ? `(${t.parDefaut})` : ""].filter(Boolean).join(" "),
          }))}
          onChange={setNom}
        />
        <Tooltip label={t.actualiser}>
          <ActionIcon variant="default" size={36} aria-label={t.actualiser} onClick={chercher}>
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {liste?.length === 0 && <Alert color="orange">{t.aucune}</Alert>}
      <Select
        label={t.cartes}
        searchable
        value={quelles}
        allowDeselect={false}
        data={[{ value: TOUTES, label: t.toutes(agents.length) }, ...agents.map((agent) => ({ value: agent.id, label: `${libelleAgent(agent)} (${agent.id})` }))]}
        onChange={(valeur) => valeur && setQuelles(valeur)}
      />
      {avecVerso && (
        <Switch
          label={t.rectoVerso}
          description={dosPossible ? undefined : t.sansRectoVerso}
          checked={rectoVerso && dosPossible}
          disabled={!dosPossible}
          onChange={(e) => setRectoVerso(e.currentTarget.checked)}
        />
      )}
      {avecVerso && rectoVerso && dosPossible && (
        <Switch label={t.retourner} description={t.retournerAide} checked={retournerVerso} onChange={(e) => setRetournerVerso(e.currentTarget.checked)} />
      )}
      <NumberInput
        label={t.exemplaires}
        min={1}
        max={20}
        value={exemplaires}
        onChange={(valeur) => typeof valeur === "number" && setExemplaires(Math.max(1, Math.round(valeur)))}
      />
      <Text size="sm" c="dimmed">
        {cr80 ? t.detail : t.format(largeur_mm, hauteur_mm)}
      </Text>
      <Button
        leftSection={<IconPrinter size={18} />}
        loading={enCours}
        disabled={!nom || aImprimer.length === 0}
        onClick={() => nom && onImprimer(nom, aImprimer, { rectoVerso: rectoVerso && dosPossible, retournerVerso, exemplaires })}
      >
        {t.imprimer}
      </Button>
    </Stack>
  );
}
