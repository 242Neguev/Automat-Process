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
import { IconBulb, IconChevronLeft, IconChevronRight, IconFileImport, IconFileTypeDocx, IconInfoCircle } from "@tabler/icons-react";
import { join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
// « no-inline » : le fichier reste à part (sinon Vite intègre un petit fichier au code en data:, que la politique de sécurité de l'application interdit de lire avec fetch).
import urlCourrierEn from "../../assets/courrier-exemple-en.docx?url&no-inline";
import urlCourrierFr from "../../assets/courrier-exemple.docx?url&no-inline";
import { remplir, valeursDeLigne } from "../../donnees/agents";
import { dossierDe, nomDe as nomDuFichier } from "../../donnees/chemins";
import { genreDe } from "../../donnees/fichiersDeposes";
import type { Transformation } from "../../donnees/nettoyage";
import { nomsUniques } from "../../donnees/noms";
import { transformationsParDefaut } from "../../modele/champs";
import {
  convertirCourriers,
  dossierTemporaire,
  ecrireCourriers,
  ecrireFichiers,
  fusionnerPdf,
  lireModeleWord,
  supprimerTemporaire,
  type Convertisseur,
  type Courrier,
  type ProjetOuvert,
} from "../../moteur";
import { langue, textes } from "../../textes";
import { apercuTexte, fusionnerCorps, preparerModele, remplirModele, type ModelePrepare } from "../../word/docx";
import BandeauExemple from "../commun/BandeauExemple";
import BarreEtapes from "../commun/BarreEtapes";
import { useCommande, type Commande } from "../commun/commande";
import EtapeListe from "../commun/EtapeListe";
import { BoutonsProjet, enregistrerSous, projetOuvert } from "../commun/projet";
import Resultat, { type Cree } from "../commun/Resultat";
import { signalerErreur } from "../commun/signalerErreur";
import { useListe } from "../commun/useListe";
import { BandeauVerrou, LectureSeule } from "../commun/verrou";
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

/** Ce qu'un projet garde d'un courrier Word (le modèle lui-même voyage dans le projet). */
interface ProjetWord {
  chemin: string;
  nomFichier: string;
  transformations: Record<string, Transformation>;
  nommage: string;
  sorties: { parPersonne: boolean; fusion: boolean; pdfParPersonne: boolean; pdfFusion: boolean };
  /** Mode opérateur : le modèle ne se modifie plus, le projet s'ouvre à l'étape Liste. */
  verrouille?: boolean;
}

/** Assistant « Documents Word » : Modèle → Liste → Vérification → Destination. */
export default function AssistantWord({ commande, onOuvrirProjet }: { commande?: Commande; onOuvrirProjet: () => void }) {
  const [etape, setEtape] = useState(0);
  // Dernier dossier de courriers créé : de quoi l'ouvrir, jusqu'à la création suivante.
  const [cree, setCree] = useState<Cree | null>(null);
  // Courrier d'exemple enregistré pour être ouvert dans Word.
  const [exempleCree, setExempleCree] = useState<Cree | null>(null);
  // Bandeau « Vous essayez avec l'exemple », affiché après « Essayer avec l'exemple ».
  const [essai, setEssai] = useState(false);
  const [modele, setModele] = useState<ModeleWord | null>(null);
  const [courant, setCourant] = useState(0);
  const [parPersonne, setParPersonne] = useState(true);
  const [fusion, setFusion] = useState(false);
  const [pdfParPersonne, setPdfParPersonne] = useState(false);
  const [pdfFusion, setPdfFusion] = useState(false);
  const [vue, setVue] = useState<"texte" | "fidele">("texte");
  const [nommage, setNommage] = useState("{{Prénom}} {{NOM}}");
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null);
  const [verrouille, setVerrouille] = useState(false);
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

  /** Lit le modèle Word et en fait le modèle des courriers. */
  async function chargerModele(chemin: string) {
    const prepare = preparerModele(await lireModeleWord(chemin));
    setModele({ ...prepare, chemin, nomFichier: nomDuFichier(chemin), transformations: transformationsParDefaut(prepare.balises) });
  }

  async function importer() {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.modele.filtre, extensions: ["docx", "dotx"] }] });
    if (typeof chemin !== "string") return;
    setEssai(false);
    try {
      await chargerModele(chemin);
    } catch (e) {
      signalerErreur(e);
    }
  }

  /** Octets du courrier d'exemple, dans la langue de l'interface (ses informations sont les colonnes de la liste d'exemple). */
  async function octetsExemple(): Promise<number[]> {
    const reponse = await fetch(langue === "en" ? urlCourrierEn : urlCourrierFr);
    return Array.from(new Uint8Array(await reponse.arrayBuffer()));
  }

  /** « Essayer avec l'exemple » : le courrier d'exemple (copié dans un dossier temporaire) et la liste d'exemple. */
  async function essayerExemple() {
    try {
      const dossier = await ecrireFichiers(await dossierTemporaire(), "exemple", [{ nom: t.modele.nomExemple, octets: await octetsExemple() }]);
      await chargerModele(await join(dossier, t.modele.nomExemple));
      await donnees.utiliserExemple();
      setEtape(0);
      setEssai(true);
    } catch (e) {
      signalerErreur(e);
    }
  }

  /** « Créer un courrier Word d'exemple… » : à ouvrir dans Word pour voir comment écrire les informations à remplir. */
  async function creerExemple() {
    const choisi = await save({ defaultPath: t.modele.nomExemple, filters: [{ name: t.modele.filtre, extensions: ["docx"] }] });
    if (!choisi) return;
    const chemin = /\.docx$/i.test(choisi) ? choisi : `${choisi}.docx`;
    const dossier = dossierDe(chemin);
    // Le cœur écrit dans un sous-dossier d'un dossier : ici, le dossier choisi lui-même (à la racine
    // d'un disque, dans un dossier « Automat-Process »).
    const racineDisque = /^[A-Za-z]:\\?$/.test(dossier);
    try {
      const ecrit = await ecrireFichiers(racineDisque ? dossier : dossierDe(dossier), racineDisque ? textes.application : nomDuFichier(dossier), [
        { nom: nomDuFichier(chemin), octets: await octetsExemple() },
      ]);
      setExempleCree({ titre: t.modele.exempleCree, chemin: await join(ecrit, nomDuFichier(chemin)), details: [t.modele.exempleEnsuite] });
    } catch (e) {
      signalerErreur(e);
    }
  }

  function enregistrer() {
    if (!modele) return;
    const projet: ProjetWord = {
      chemin: modele.chemin,
      nomFichier: modele.nomFichier,
      transformations: modele.transformations,
      nommage,
      sorties: { parPersonne, fusion, pdfParPersonne, pdfFusion },
      verrouille,
    };
    return enregistrerSous("word", modele.nomFichier.replace(/\.(docx|dotx)$/i, ""), projet, correspondances);
  }

  /** Projet rouvert (depuis l'accueil ou « Ouvrir un projet… ») : le modèle Word est relu à son emplacement. */
  async function appliquerProjet(projet: ProjetOuvert) {
    try {
      const enregistre = projet.modele as ProjetWord;
      const prepare = preparerModele(await lireModeleWord(enregistre.chemin));
      setModele({ ...prepare, chemin: enregistre.chemin, nomFichier: enregistre.nomFichier, transformations: enregistre.transformations ?? {} });
      if (enregistre.nommage) setNommage(enregistre.nommage);
      if (enregistre.sorties) {
        setParPersonne(enregistre.sorties.parPersonne);
        setFusion(enregistre.sorties.fusion);
        setPdfParPersonne(enregistre.sorties.pdfParPersonne);
        setPdfFusion(enregistre.sorties.pdfFusion);
      }
      donnees.restaurer(projet.correspondances, prepare.balises);
      setVerrouille(Boolean(enregistre.verrouille));
      // Modèle verrouillé (mode opérateur) : on commence par la liste.
      setEtape(enregistre.verrouille ? 1 : 0);
      projetOuvert(enregistre.nomFichier);
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
    setCree(null);
    try {
      // Le dossier des résultats existe d'emblée (un PDF fusionné seul y est écrit à la fin).
      const final = (await ecrireCourriers(modele.chemin, [], dossier, sousDossier)).dossier;
      const docxTemporaires = veutPdf && !parPersonne ? await dossierTemporaire() : null;
      const pdfTemporaires = pdfFusion && !pdfParPersonne ? await dossierTemporaire() : null;
      temporaires.push(...[docxTemporaires, pdfTemporaires].filter((d): d is string => d !== null));
      const corps: string[] = [];
      const pdfs: string[] = [];
      // Logiciels qui ont converti les lots, et pourquoi Word a été remplacé s'il l'a été.
      const convertisseurs = new Set<Convertisseur>();
      let remarque: string | null = null;
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
            const conversion = await convertirCourriers(ecrits.fichiers, pdfTemporaires ?? dossier, pdfTemporaires ? "pdf" : sousDossier, docxTemporaires !== null);
            convertisseurs.add(conversion.convertisseur);
            remarque ??= conversion.remarque;
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
      const details: string[] = [];
      if (convertisseurs.size > 0) details.push(t.destination.conversion([...convertisseurs].map((c) => t.destination.logiciels[c]).join(" et ")));
      if (remarque) details.push(remarque);
      // Une remarque (Word remplacé par LibreOffice) colore l'encadré en orange.
      setCree({ titre: t.destination.cree, chemin: final, dossier: true, details, attention: Boolean(remarque) });
    } catch (e) {
      signalerErreur(e);
    } finally {
      temporaires.forEach((d) => void supprimerTemporaire(d));
      setAvancement(null);
    }
  }

  /** Fichiers glissés dans la fenêtre : un courrier Word devient le modèle, une liste celle des destinataires. */
  async function recevoir(chemins: string[]) {
    const courrier = chemins.find((chemin) => genreDe(chemin) === "word");
    const fichierListe = chemins.find((chemin) => genreDe(chemin) === "liste");
    // Ses propres fichiers : l'essai avec l'exemple est fini.
    if (courrier || fichierListe) setEssai(false);
    try {
      if (courrier) {
        await chargerModele(courrier);
        setEtape(0);
      }
      if (fichierListe) {
        await donnees.importerChemin(fichierListe);
        if (!courrier && etapePrete[0]) setEtape(1);
      }
    } catch (e) {
      signalerErreur(e);
    }
  }

  useCommande(commande, (demande) => {
    if (demande.type === "exemple") void essayerExemple();
    else if (demande.type === "projet") void appliquerProjet(demande.projet);
    else void recevoir(demande.chemins);
  });

  const etapePrete = [Boolean(modele) && balises.length > 0, destinataires.length > 0 && Object.values(correspondances).some(Boolean), destinataires.length > 0, false];
  const n = textes.navigation.manque;
  // Ce qui manque pour passer à l'étape suivante, dit en clair à côté du bouton grisé.
  const manque = [modele ? n.balisesWord : n.modeleWord, liste ? n.colonnes : n.liste, n.liste, null];

  return (
    <Stack gap="lg" maw={1240}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{t.titre}</Title>
          <Text c="dimmed">{t.sousTitre}</Text>
        </div>
        <BoutonsProjet
          onOuvrir={onOuvrirProjet}
          onEnregistrer={enregistrer}
          enregistrable={Boolean(modele)}
          verrou={modele ? { verrouille, onChange: setVerrouille } : undefined}
        />
      </Group>

      <BandeauExemple message={essai ? textes.exemple.word : null} onFermer={() => setEssai(false)} />

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
              {verrouille && <BandeauVerrou onDeverrouiller={() => setVerrouille(false)} />}
              <LectureSeule active={verrouille}>
                <Stack gap="md">
                  <Paper withBorder p="md">
                    <Stack gap="sm">
                      <Button leftSection={<IconFileImport size={18} />} variant={modele ? "light" : "filled"} onClick={importer}>
                        {modele ? t.modele.autre : t.modele.importer}
                      </Button>
                      {!modele && (
                        <>
                          <Button variant="light" leftSection={<IconBulb size={18} />} onClick={() => void essayerExemple()}>
                            {t.modele.essayer}
                          </Button>
                          <Button variant="subtle" leftSection={<IconFileTypeDocx size={18} />} onClick={() => void creerExemple()}>
                            {t.modele.creerExemple}
                          </Button>
                        </>
                      )}
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
                  <Resultat cree={exempleCree} onFermer={() => setExempleCree(null)} />
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
              </LectureSeule>
            </Stack>
          </Group>
        </Stepper.Step>

        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            nomModele={modele?.nomFichier.replace(/\.(docx|dotx)$/i, "") ?? ""}
            correspondances={correspondances}
            exemple={destinataires[0]?.valeurs ?? {}}
            anomalies={donnees.anomalies}
            onImporter={() => {
              setEssai(false);
              void donnees.importer();
            }}
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
          <Stack gap="md" maw={640}>
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
          <Resultat cree={cree} onFermer={() => setCree(null)} />
          </Stack>
        </Stepper.Step>
      </Stepper>

      <BarreEtapes
        etape={etape}
        titres={[t.etapes.modele.titre, t.etapes.liste.titre, t.etapes.verification.titre, t.etapes.destination.titre]}
        prete={etapePrete[etape]}
        manque={manque[etape]}
        onEtape={setEtape}
      />
    </Stack>
  );
}
