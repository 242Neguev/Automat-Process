import { useMemo, useState } from "react";
import { Badge, Button, Group, List, Loader, Modal, Paper, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconFileTypePdf } from "@tabler/icons-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { compter, graviteCarte, regrouper } from "../../controle/cartes";
import { libelleAgent } from "../../donnees/agents";
import { nomsUniques } from "../../donnees/noms";
import { repeter } from "../../donnees/quantite";
import {
  exporterBat,
  exporterCartes,
  exporterNumerique,
  imprimerCartes,
  type DonneesAgent,
  type Feuille,
  type ModeleCarte,
  type OptionsNumerique,
  type ReglagesImpression,
  type Sortie,
} from "../../moteur";
import IconeGravite from "../commun/IconeGravite";
import { signalerErreur } from "../commun/signalerErreur";
import ExportBat from "./ExportBat";
import ExportNumerique from "./ExportNumerique";
import ImpressionDirecte from "./ImpressionDirecte";
import { locale } from "../../textes";
import { libellesCartes } from "./libelles";
import type { Controle } from "./useControle";
import { useMiseAJour } from "./useMiseAJour";

const FEUILLES: Feuille[] = ["A4", "A3", "SRA3"];
type Mode = "pdf" | "impression" | "numerique" | "bat";

/** Ce qu'il faut en plus pour les cartes numériques : liens cliquables et fiche contact de chaque agent. */
export interface Numerique {
  liens: Record<string, string>;
  fiche: string;
}

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  /** Empreinte de l'identité de chaque agent (même ordre) : mise à jour incrémentale. */
  cles: string[];
  /** Nombre de cartes de chaque agent (même ordre), pour le PDF de l'imprimeur et l'impression directe. */
  quantites: number[];
  /** Colonne d'où viennent les quantités, s'il y en a une. */
  colonneQuantite: string | null;
  /** Pour chaque agent (même ordre), ses liens et sa fiche contact. */
  numeriques: Numerique[];
  controle: Controle;
  /** Retour à la vérification, sur les cartes à corriger. */
  onVoirCartes: () => void;
}

/** Date d'un export, lisible : « 4 novembre 2026 à 18:30 ». */
const dateLisible = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });

export default function EtapeDestination({ modele, agents, cles, quantites, colonneQuantite, numeriques, controle, onVoirCartes }: Props) {
  // Un badge PVC (sans fond perdu) s'imprime en général directement ; une carte de visite part chez l'imprimeur.
  const ecran = Boolean(modele.format.px);
  const { destination: t, controle: tc } = libellesCartes(ecran);
  const [mode, setMode] = useState<Mode>(ecran ? "numerique" : modele.format.fond_perdu_mm === 0 ? "impression" : "pdf");
  const [sortie, setSortie] = useState<Sortie>("planches");
  const [feuille, setFeuille] = useState<Feuille>("A4");
  const [enCours, setEnCours] = useState(false);
  const [aConfirmer, setAConfirmer] = useState<{ cartes: DonneesAgent[]; action: () => void } | null>(null);
  const { rapport } = controle;
  const nombres = rapport ? compter(rapport) : null;

  // Mise à jour incrémentale : les cartes imprimées et les cartes numériques ont chacune leur registre.
  const imprimees = mode === "pdf" || mode === "impression";
  const maj = useMiseAJour(modele, agents, cles, mode === "numerique" ? "numerique" : "impression");
  const tm = t.miseAJour;
  const [toutes, setToutes] = useState(false);
  const incremental = mode !== "bat" && maj.canal !== undefined;
  const etatsPrets = maj.etats.length === agents.length;
  const seulementNouvelles = incremental && !toutes;
  const choisis = useMemo(
    () => (seulementNouvelles && etatsPrets ? agents.filter((_, i) => maj.etats[i] !== "inchangee") : agents),
    [seulementNouvelles, etatsPrets, agents, maj.etats],
  );
  const compte = (etat: string) => maj.etats.filter((e) => e === etat).length;
  // Quantités : chaque carte imprimée est répétée autant de fois que demandé (0 : aucune).
  const quantiteDe = useMemo(() => new Map(agents.map((agent, i) => [agent, quantites[i] ?? 1])), [agents, quantites]);
  const avecQuantites = (cartes: DonneesAgent[]) => repeter(cartes, cartes.map((agent) => quantiteDe.get(agent) ?? 1));
  const produites = (cartes: DonneesAgent[]) => cartes.filter((agent) => (quantiteDe.get(agent) ?? 1) > 0);
  const nbCartes = imprimees ? avecQuantites(choisis).length : choisis.length;
  // Le registre n'est pas encore comparé, ou il n'y a rien à refaire.
  const rienAExporter = (incremental && !etatsPrets) || nbCartes === 0;

  /** Les cartes qui ont un problème grave sont signalées avant l'export ou l'impression. */
  function avecConfirmation(cartes: DonneesAgent[], action: () => void) {
    const graves = rapport ? cartes.filter((agent) => graviteCarte(rapport.get(agent.id)) === "erreur") : [];
    if (graves.length > 0) setAConfirmer({ cartes: graves, action });
    else action();
  }

  async function exporter() {
    const chemin = await save({ defaultPath: t.nomFichier[sortie], filters: [{ name: t.filtrePdf, extensions: ["pdf"] }] });
    if (!chemin) return;
    setEnCours(true);
    try {
      await exporterCartes(modele, avecQuantites(choisis), sortie, feuille, chemin);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.enregistre, message: chemin });
      await maj.enregistrer(produites(choisis));
    } catch (e) {
      signalerErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  async function imprimer(imprimante: string, cartes: DonneesAgent[], reglages: ReglagesImpression) {
    setEnCours(true);
    try {
      const aImprimer = avecQuantites(cartes);
      if (await imprimerCartes(modele, aImprimer, imprimante, reglages)) {
        notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.impression.envoyee(imprimante), message: t.impression.nbCartes(aImprimer.length) });
        await maj.enregistrer(produites(cartes));
      } else {
        notifications.show({ color: "gray", title: t.impression.annulee, message: t.impression.annuleeDetail });
      }
    } catch (e) {
      signalerErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  async function exporterNumeriques(options: OptionsNumerique, avecFiches: boolean) {
    const dossier = await open({ directory: true, multiple: false, title: t.numerique.choisirDossier });
    if (typeof dossier !== "string") return;
    setEnCours(true);
    try {
      const rang = new Map(agents.map((agent, i) => [agent, i]));
      const numerique = (agent: DonneesAgent) => numeriques[rang.get(agent) ?? -1];
      const avecLiens = choisis.map((agent) => ({ ...agent, liens: numerique(agent)?.liens ?? {} }));
      const fiches = avecFiches ? choisis.map((agent) => numerique(agent)?.fiche ?? "") : [];
      const noms = nomsUniques(choisis.map(libelleAgent));
      const chemin = await exporterNumerique(modele, avecLiens, noms, fiches, options, dossier, t.numerique.nomDossier(modele.nom));
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.numerique.cree, message: chemin, autoClose: 10000 });
      await maj.enregistrer(choisis);
    } catch (e) {
      signalerErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  /** Bon à tirer : pas de confirmation, il sert justement à faire vérifier les cartes. */
  async function exporterBon(cartes: DonneesAgent[]) {
    const chemin = await save({ defaultPath: t.bat.nomFichier(modele.nom), filters: [{ name: t.filtrePdf, extensions: ["pdf"] }] });
    if (!chemin) return;
    setEnCours(true);
    try {
      const date = new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
      await exporterBat(modele, cartes.map((agent) => ({ ...agent, libelle: libelleAgent(agent) })), modele.nom, date, chemin);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.bat.cree, message: chemin });
    } catch (e) {
      signalerErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  const groupesGraves =
    rapport && aConfirmer
      ? regrouper(rapport)
          .filter((g) => g.gravite === "erreur")
          .map((g) => ({ ...g, agents: g.agents.filter((id) => aConfirmer.cartes.some((agent) => agent.id === id)) }))
          .filter((g) => g.agents.length > 0)
      : [];

  return (
    <Paper withBorder p="lg" maw={480}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={5}>{t.titre}</Title>
          <Badge variant="light">{t.resume(mode === "bat" ? agents.length : nbCartes)}</Badge>
        </Group>
        {imprimees && colonneQuantite && (
          <Text size="xs" c="dimmed" mt={-8}>
            {t.quantites(choisis.length, colonneQuantite)}
          </Text>
        )}
        {controle.enCours ? (
          <Group gap="xs">
            <Loader size={14} />
            <Text size="sm">{tc.calcul}</Text>
          </Group>
        ) : (
          nombres && (
            <Group gap="xs" wrap="nowrap">
              <IconeGravite gravite={nombres.erreur > 0 ? "erreur" : nombres.attention > 0 ? "attention" : null} taille={18} />
              <Text size="sm">
                {nombres.erreur + nombres.attention === 0
                  ? tc.toutesCorrectes
                  : [nombres.erreur > 0 && tc.aCorriger(nombres.erreur), nombres.attention > 0 && tc.aVerifier(nombres.attention)].filter(Boolean).join(" · ")}
              </Text>
            </Group>
          )
        )}
        {incremental && maj.canal && (
          <Stack gap={6} data-mise-a-jour>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="sm" fw={500}>
                {tm.titre}
              </Text>
              <Button variant="subtle" size="compact-xs" onClick={maj.oublier}>
                {tm.oublier}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {tm.dernier(dateLisible(maj.canal.date), maj.canal.nombre)} {tm.aide}
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={seulementNouvelles ? "nouvelles" : "toutes"}
              onChange={(valeur) => setToutes(valeur === "toutes")}
              data={[
                { value: "nouvelles", label: tm.nouvelles(etatsPrets ? compte("nouvelle") + compte("modifiee") : 0) },
                { value: "toutes", label: tm.toutes(agents.length) },
              ]}
            />
            {etatsPrets && (
              <Text size="xs" c="dimmed">
                {maj.modeleChange ? tm.modeleChange : tm.detail(compte("nouvelle"), compte("modifiee"), compte("inchangee"))}
              </Text>
            )}
            {seulementNouvelles && etatsPrets && choisis.length === 0 && <Text size="sm">{tm.rien}</Text>}
          </Stack>
        )}
        {!ecran && (
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(valeur) => setMode(valeur as Mode)}
            data={(["pdf", "impression", "numerique", "bat"] as const).map((value) => ({ value, label: t.modes[value] }))}
          />
        )}

        {mode === "pdf" ? (
          <>
            <SegmentedControl
              orientation="vertical"
              fullWidth
              value={sortie}
              onChange={(valeur) => setSortie(valeur as Sortie)}
              data={[
                { value: "planches", label: t.planches },
                { value: "cartes", label: t.uneCarteParPage },
              ]}
            />
            {sortie === "planches" && (
              <Select
                label={t.feuille}
                value={feuille}
                allowDeselect={false}
                onChange={(valeur) => valeur && setFeuille(valeur as Feuille)}
                data={FEUILLES.map((f) => ({ value: f, label: t.feuilles[f] }))}
              />
            )}
            <Text size="sm" c="dimmed">
              {sortie === "planches" ? t.detailPlanches : t.detailCartes}
            </Text>
            <Button leftSection={<IconFileTypePdf size={18} />} loading={enCours} disabled={controle.enCours || rienAExporter} onClick={() => avecConfirmation(choisis, exporter)}>
              {t.enregistrer}
            </Button>
          </>
        ) : mode === "bat" ? (
          <ExportBat modele={modele} agents={agents} mesures={controle.mesures} enCours={enCours || controle.enCours} onCreer={exporterBon} />
        ) : mode === "numerique" ? (
          <ExportNumerique
            modele={modele}
            enCours={enCours || controle.enCours || rienAExporter}
            onExporter={(options, fiches) => avecConfirmation(choisis, () => exporterNumeriques(options, fiches))}
          />
        ) : (
          <ImpressionDirecte
            modele={modele}
            agents={choisis}
            enCours={enCours || controle.enCours || rienAExporter}
            onImprimer={(imprimante, cartes, reglages) => avecConfirmation(cartes, () => imprimer(imprimante, cartes, reglages))}
          />
        )}
      </Stack>

      <Modal opened={aConfirmer !== null} onClose={() => setAConfirmer(null)} title={t.confirmation.titre[mode === "impression" ? "impression" : "pdf"]} centered>
        <Stack gap="sm">
          <Text>{t.confirmation.message(aConfirmer?.cartes.length ?? 0)}</Text>
          <List spacing={4} size="sm" center>
            {groupesGraves.map((g) => (
              <List.Item key={g.cle} icon={<IconeGravite gravite="erreur" taille={16} />}>
                {g.resume} ({tc.nbCartes(g.agents.length)})
              </List.Item>
            ))}
          </List>
          <Text size="sm" c="dimmed">
            {t.confirmation.conseil}
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => {
                setAConfirmer(null);
                onVoirCartes();
              }}
            >
              {t.confirmation.voir}
            </Button>
            <Button
              color="red"
              onClick={() => {
                aConfirmer?.action();
                setAConfirmer(null);
              }}
            >
              {mode === "impression" ? t.confirmation.imprimer : t.confirmation.exporter}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
