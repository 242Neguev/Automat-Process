import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NavLink,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronLeft, IconChevronRight, IconFileImport, IconFileTypeDocx, IconInfoCircle } from "@tabler/icons-react";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { remplir, valeursDeLigne } from "../../donnees/agents";
import type { Transformation } from "../../donnees/nettoyage";
import { nomsUniques } from "../../donnees/noms";
import { transformationsParDefaut } from "../../modele/champs";
import {
  convertirCourriers,
  dossierTemporaire,
  ecrireCourriers,
  fusionnerPdf,
  lireModeleWord,
  supprimerTemporaire,
  type Conversion,
  type Courrier,
} from "../../moteur";
import { textes } from "../../textes";
import { apercuTexte, fusionnerCorps, preparerModele, remplirModele, type ModelePrepare } from "../../word/docx";
import EtapeListe from "../commun/EtapeListe";
import { signalerErreur } from "../commun/signalerErreur";
import { useListe } from "../commun/useListe";
import ApercuFidele from "./ApercuFidele";
import ApercuTexte from "./ApercuTexte";

const t = textes.word;
const tChamp = textes.cartes.champ;
/** Courriers envoyés au cœur par lots, pour suivre l'avancement. */
const LOT = 20;

interface ModeleWord extends ModelePrepare {
  chemin: string;
  nomFichier: string;
  transformations: Record<string, Transformation>;
}

/** Assistant « Documents Word » : Modèle → Liste → Vérification → Destination. */
export default function AssistantWord() {
  const [etape, setEtape] = useState(0);
  const [modele, setModele] = useState<ModeleWord | null>(null);
  const [courant, setCourant] = useState(0);
  const [parPersonne, setParPersonne] = useState(true);
  const [fusion, setFusion] = useState(false);
  const [pdfParPersonne, setPdfParPersonne] = useState(false);
  const [pdfFusion, setPdfFusion] = useState(false);
  const [vue, setVue] = useState<"texte" | "fidele">("texte");
  const [nommage, setNommage] = useState("{{Prénom}} {{NOM}}");
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null);
  const balises = modele?.balises ?? [];
  const donnees = useListe(balises);
  const { liste, correspondances } = donnees;
  const destinataires = useMemo(
    () => (modele && liste ? liste.lignes.map((ligne) => ({ id: `ligne ${ligne.numero}`, valeurs: valeursDeLigne(modele, ligne, correspondances) })) : []),
    [modele, liste, correspondances],
  );
  const apercuModele = useMemo(() => (modele ? apercuTexte(modele.parties, null) : []), [modele]);
  const index = Math.min(courant, destinataires.length - 1);
  const apercuCourrier = useMemo(
    () => (modele && destinataires[index] ? apercuTexte(modele.parties, destinataires[index].valeurs) : []),
    [modele, destinataires, index],
  );
  const nomDe = (valeurs: Record<string, string>, numero: number) => remplir(nommage, valeurs) || `Courrier ${numero}`;

  async function importer() {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.modele.filtre, extensions: ["docx", "dotx"] }] });
    if (typeof chemin !== "string") return;
    try {
      const prepare = preparerModele(await lireModeleWord(chemin));
      setModele({ ...prepare, chemin, nomFichier: chemin.split(/[\\/]/).pop() ?? chemin, transformations: transformationsParDefaut(prepare.balises) });
    } catch (e) {
      signalerErreur(e);
    }
  }

  const changerTransformation = (balise: string, transformation: Transformation | null) =>
    setModele((m) => {
      if (!m) return m;
      const transformations = { ...m.transformations };
      if (transformation) transformations[balise] = transformation;
      else delete transformations[balise];
      return { ...m, transformations };
    });

  /**
   * Crée les documents demandés. Les courriers sont remplis et écrits par lots ; les .docx qui ne
   * servent qu'à produire les PDF passent par un dossier temporaire, supprimé à la fin.
   */
  async function creer() {
    if (!modele) return;
    const dossier = await open({ directory: true, multiple: false, title: t.destination.choisirDossier });
    if (typeof dossier !== "string") return;
    const sousDossier = t.destination.nomDossier(modele.nomFichier.replace(/\.(docx|dotx)$/i, ""));
    const noms = nomsUniques(destinataires.map((d, i) => nomDe(d.valeurs, i + 1)));
    const veutPdf = pdfParPersonne || pdfFusion;
    const temporaires: string[] = [];
    setAvancement({ fait: 0, total: destinataires.length });
    try {
      // Le dossier des résultats existe d'emblée (un PDF fusionné seul y est écrit à la fin).
      const final = (await ecrireCourriers(modele.chemin, [], dossier, sousDossier)).dossier;
      const docxTemporaires = veutPdf && !parPersonne ? await dossierTemporaire() : null;
      const pdfTemporaires = pdfFusion && !pdfParPersonne ? await dossierTemporaire() : null;
      temporaires.push(...[docxTemporaires, pdfTemporaires].filter((d): d is string => d !== null));
      const corps: string[] = [];
      const pdfs: string[] = [];
      let conversion: Conversion | null = null;
      // Parties du premier courrier : le document fusionné reprend ses en-têtes et pieds de page.
      const premier: { parties?: Record<string, string> } = {};
      for (let debut = 0; debut < destinataires.length; debut += LOT) {
        const lot: Courrier[] = destinataires.slice(debut, debut + LOT).map((d, i) => {
          const parties = remplirModele(modele.parties, d.valeurs);
          if (fusion) corps.push(parties["word/document.xml"]);
          premier.parties ??= parties;
          return { nom: noms[debut + i], parties };
        });
        if (parPersonne || veutPdf) {
          const ecrits = await ecrireCourriers(modele.chemin, lot, docxTemporaires ?? dossier, docxTemporaires ? "docx" : sousDossier);
          if (veutPdf) {
            conversion = await convertirCourriers(ecrits.fichiers, pdfTemporaires ?? dossier, pdfTemporaires ? "pdf" : sousDossier, docxTemporaires !== null);
            pdfs.push(...conversion.pdfs);
          }
        }
        setAvancement({ fait: Math.min(debut + LOT, destinataires.length), total: destinataires.length });
      }
      if (fusion && premier.parties) {
        const parties = { ...premier.parties, "word/document.xml": fusionnerCorps(corps) };
        await ecrireCourriers(modele.chemin, [{ nom: t.destination.fichierFusion, parties }], dossier, sousDossier);
      }
      if (pdfFusion) await fusionnerPdf(pdfs, await join(final, t.destination.pdfFusionne));
      const message = conversion ? `${final}\n${t.destination.conversion(t.destination.logiciels[conversion.convertisseur])}` : final;
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.destination.cree, message, autoClose: 10000 });
    } catch (e) {
      signalerErreur(e);
    } finally {
      temporaires.forEach((d) => void supprimerTemporaire(d));
      setAvancement(null);
    }
  }

  const etapePrete = [Boolean(modele) && balises.length > 0, destinataires.length > 0 && Object.values(correspondances).some(Boolean), destinataires.length > 0, false];

  return (
    <Stack gap="lg" maw={1240}>
      <div>
        <Title order={2}>{t.titre}</Title>
        <Text c="dimmed">{t.sousTitre}</Text>
      </div>

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
          <Group align="flex-start" gap="lg" wrap="nowrap">
            <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
              {modele ? (
                <>
                  <Title order={5}>{t.modele.apercu}</Title>
                  <Text size="xs" c="dimmed">
                    {t.modele.apercuAide}
                  </Text>
                  <ApercuTexte paragraphes={apercuModele} />
                </>
              ) : (
                <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                  {t.modele.aide}
                </Alert>
              )}
            </Stack>
            <Stack gap="md" w={400} style={{ flexShrink: 0 }}>
              <Paper withBorder p="md">
                <Stack gap="sm">
                  <Button leftSection={<IconFileImport size={18} />} variant={modele ? "light" : "filled"} onClick={importer}>
                    {modele ? t.modele.autre : t.modele.importer}
                  </Button>
                  {modele && (
                    <>
                      <Group gap="xs" wrap="nowrap">
                        <IconFileTypeDocx size={20} stroke={1.5} />
                        <Text size="sm" truncate>
                          {modele.nomFichier}
                        </Text>
                      </Group>
                      {modele.champsFusion > 0 && (
                        <Text size="sm" c="teal">
                          {t.modele.champsFusion(modele.champsFusion)}
                        </Text>
                      )}
                      {balises.length === 0 && <Alert color="orange">{t.modele.aucuneBalise}</Alert>}
                    </>
                  )}
                  {modele && <Text size="xs" c="dimmed">{t.modele.aide}</Text>}
                </Stack>
              </Paper>
              {balises.length > 0 && modele && (
                <Paper withBorder p="md">
                  <Stack gap="xs">
                    <Title order={5}>{t.modele.balises}</Title>
                    {balises.map((balise) => (
                      <Group key={balise} justify="space-between" wrap="nowrap">
                        <Badge variant="light" tt="none">
                          {balise}
                        </Badge>
                        <Select
                          size="xs"
                          w={180}
                          aria-label={tChamp.miseEnForme(balise)}
                          value={modele.transformations[balise] ?? "aucune"}
                          allowDeselect={false}
                          data={Object.entries(tChamp.transformations).map(([value, label]) => ({ value, label }))}
                          onChange={(v) => changerTransformation(balise, v && v !== "aucune" ? (v as Transformation) : null)}
                        />
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Group>
        </Stepper.Step>

        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            correspondances={correspondances}
            exemple={destinataires[0]?.valeurs ?? {}}
            anomalies={donnees.anomalies}
            onImporter={donnees.importer}
            onExemple={donnees.utiliserExemple}
            onFeuille={donnees.setFeuille}
            onCorrespondance={donnees.relier}
          />
        </Stepper.Step>

        <Stepper.Step label={t.etapes.verification.titre} description={t.etapes.verification.description}>
          {destinataires.length > 0 && (
            <Group align="flex-start" gap="lg" wrap="nowrap">
              <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
                <SegmentedControl
                  w="fit-content"
                  value={vue}
                  onChange={(valeur) => setVue(valeur as typeof vue)}
                  data={(["texte", "fidele"] as const).map((value) => ({ value, label: t.verification.vues[value] }))}
                />
                {vue === "texte" || !modele ? (
                  <ApercuTexte paragraphes={apercuCourrier} />
                ) : (
                  <ApercuFidele modele={modele.chemin} courrier={{ nom: "apercu", parties: remplirModele(modele.parties, destinataires[index].valeurs) }} />
                )}
                <Group gap="xs">
                  <ActionIcon variant="default" size="lg" aria-label={textes.cartes.verification.precedent} disabled={index <= 0} onClick={() => setCourant(index - 1)}>
                    <IconChevronLeft size={18} />
                  </ActionIcon>
                  <Text size="sm" w={150} ta="center">
                    {t.verification.courrier(index + 1, destinataires.length)}
                  </Text>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label={textes.cartes.verification.suivant}
                    disabled={index >= destinataires.length - 1}
                    onClick={() => setCourant(index + 1)}
                  >
                    <IconChevronRight size={18} />
                  </ActionIcon>
                </Group>
              </Stack>
              <Paper withBorder p="sm" w={320} style={{ flexShrink: 0 }}>
                <Title order={5} px="xs" pb="xs">
                  {t.verification.destinataires}
                </Title>
                <ScrollArea.Autosize mah={460} type="auto">
                  {destinataires.map((d, i) => (
                    <NavLink
                      key={d.id}
                      label={<span dir="auto">{nomDe(d.valeurs, i + 1)}</span>}
                      description={d.id}
                      active={i === index}
                      onClick={() => setCourant(i)}
                    />
                  ))}
                </ScrollArea.Autosize>
              </Paper>
            </Group>
          )}
        </Stepper.Step>

        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          <Paper withBorder p="lg" maw={520}>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={5}>{t.destination.titre}</Title>
                <Badge variant="light">{t.destination.resume(destinataires.length)}</Badge>
              </Group>
              <Switch label={t.destination.parPersonne} checked={parPersonne} onChange={(e) => setParPersonne(e.currentTarget.checked)} />
              <Switch label={t.destination.fusion} description={t.destination.fusionAide} checked={fusion} onChange={(e) => setFusion(e.currentTarget.checked)} />
              <Switch label={t.destination.pdfParPersonne} checked={pdfParPersonne} onChange={(e) => setPdfParPersonne(e.currentTarget.checked)} />
              <Switch label={t.destination.pdfFusion} checked={pdfFusion} onChange={(e) => setPdfFusion(e.currentTarget.checked)} />
              {(pdfParPersonne || pdfFusion) && (
                <Text size="xs" c="dimmed">
                  {t.destination.pdfAide}
                </Text>
              )}
              <TextInput label={t.destination.nommage} description={t.destination.nommageAide} value={nommage} onChange={(e) => setNommage(e.currentTarget.value)} />
              {avancement && (
                <Stack gap={4}>
                  <Progress value={(100 * avancement.fait) / Math.max(1, avancement.total)} animated />
                  <Text size="xs" c="dimmed">
                    {t.destination.progression(avancement.fait, avancement.total)}
                  </Text>
                </Stack>
              )}
              <Button
                leftSection={<IconFileTypeDocx size={18} />}
                loading={avancement !== null}
                disabled={!parPersonne && !fusion && !pdfParPersonne && !pdfFusion}
                onClick={creer}
              >
                {t.destination.creer}
              </Button>
            </Stack>
          </Paper>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="default" disabled={etape === 0} onClick={() => setEtape(etape - 1)}>
          {textes.cartes.precedent}
        </Button>
        {etape < 3 && (
          <Button disabled={!etapePrete[etape]} onClick={() => setEtape(etape + 1)}>
            {textes.cartes.suivant}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
