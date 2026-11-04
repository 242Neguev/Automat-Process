import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  ColorInput,
  Group,
  Image,
  Menu,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowDown, IconArrowUp, IconFileImport, IconMoon, IconPhoto, IconPlus, IconSun, IconTrash } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Transformation } from "../../donnees/nettoyage";
import { lireFichier } from "../../moteur";
import { genererSignature } from "../../signatures/html";
import { importerSignature, type SignatureImportee } from "../../signatures/importer";
import { preparerLogo, sourceDuLogo } from "../../signatures/logo";
import { balisesSignature, nouvelIdLigne, POLICES_WEB, type MiseEnPage, type ModeleSignature, type Role } from "../../signatures/modele";
import { textes } from "../../textes";
import { COULEURS } from "../../theme";
import { signalerErreur } from "../commun/signalerErreur";
import { BandeauVerrou, LectureSeule } from "../commun/verrou";
import ApercuSignature from "./ApercuSignature";

const t = textes.signatures.modele;
const tChamp = textes.cartes.champ;
const ROLES = Object.keys(t.roles) as Role[];

interface Props {
  modele: ModeleSignature;
  onModele: (modification: (modele: ModeleSignature) => ModeleSignature) => void;
  /** Valeurs de l'aperçu : premier agent de la liste, ou agent d'exemple. */
  valeurs: Record<string, string>;
  depuisListe: boolean;
  /** Mode opérateur : les réglages s'affichent sans pouvoir être modifiés. */
  verrouille?: boolean;
  onDeverrouiller?: () => void;
}

export default function EtapeModeleSignature({ modele, onModele, valeurs, depuisListe, verrouille = false, onDeverrouiller }: Props) {
  const [sombre, setSombre] = useState(false);
  const [importee, setImportee] = useState<(SignatureImportee & { nomFichier: string }) | null>(null);
  const html = genererSignature(modele, valeurs);
  const balises = balisesSignature(modele);
  const changer = (modifications: Partial<ModeleSignature>) => onModele((m) => ({ ...m, ...modifications }));
  const changerLigne = (id: string, modifications: { role?: Role; modele?: string }) =>
    onModele((m) => ({ ...m, lignes: m.lignes.map((l) => (l.id === id ? { ...l, ...modifications } : l)) }));
  const deplacerLigne = (index: number, sens: -1 | 1) =>
    onModele((m) => {
      const lignes = [...m.lignes];
      [lignes[index], lignes[index + sens]] = [lignes[index + sens], lignes[index]];
      return { ...m, lignes };
    });

  async function choisirLogo() {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.filtreImages, extensions: ["png", "jpg", "jpeg", "gif", "svg"] }] });
    if (typeof chemin !== "string") return;
    try {
      const nomFichier = chemin.split(/[\\/]/).pop() ?? "logo.png";
      const source = await sourceDuLogo(await lireFichier(chemin, "image"), nomFichier);
      const largeur = modele.logo?.largeur ?? (modele.miseEnPage === "logo-gauche" ? 90 : 120);
      const logo = await preparerLogo(source, largeur, nomFichier);
      changer({ logo });
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function redimensionnerLogo(largeur: number) {
    const logo = modele.logo;
    if (!logo?.source) return;
    try {
      changer({ logo: await preparerLogo(logo.source, largeur, logo.nomFichier) });
    } catch (e) {
      signalerErreur(e);
    }
  }

  async function importerHtml() {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.filtreHtml, extensions: ["htm", "html"] }] });
    if (typeof chemin !== "string") return;
    try {
      const resultat = await importerSignature(chemin);
      setImportee({ ...resultat, nomFichier: chemin.split(/[\\/]/).pop() ?? chemin });
      changer({ html: resultat.html });
    } catch (e) {
      signalerErreur(e);
    }
  }

  const changerTransformation = (balise: string, transformation: Transformation | null) =>
    onModele((m) => {
      const transformations = { ...m.transformations };
      if (transformation) transformations[balise] = transformation;
      else delete transformations[balise];
      return { ...m, transformations };
    });

  return (
    <Stack gap="md">
      <SegmentedControl
        w={420}
        disabled={verrouille}
        value={modele.source}
        onChange={(source) => changer({ source: source as ModeleSignature["source"] })}
        data={(["mise-en-page", "html"] as const).map((value) => ({ value, label: t.sources[value] }))}
      />
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ApercuSignature html={html} sombre={sombre} titre={modele.nom} />
          {sombre && (
            <Text size="xs" c="dimmed">
              {t.aideSombre}
            </Text>
          )}
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {depuisListe ? t.exempleListe : t.exemple}
            </Text>
            <SegmentedControl
              size="xs"
              style={{ flexShrink: 0 }}
              value={sombre ? "sombre" : "clair"}
              onChange={(valeur) => setSombre(valeur === "sombre")}
              data={[
                { value: "clair", label: <Group gap={4} wrap="nowrap"><IconSun size={14} /><span>{t.apercuClair}</span></Group> },
                { value: "sombre", label: <Group gap={4} wrap="nowrap"><IconMoon size={14} /><span>{t.apercuSombre}</span></Group> },
              ]}
            />
          </Group>
        </Stack>

        <ScrollArea.Autosize mah="calc(100vh - 280px)" w={420} type="auto" scrollbars="y" offsetScrollbars style={{ flexShrink: 0 }}>
          {verrouille && (
            <Box mb="md">
              <BandeauVerrou onDeverrouiller={() => onDeverrouiller?.()} />
            </Box>
          )}
          <LectureSeule active={verrouille}>
            <Stack gap="md">
              <TextInput label={t.nom} value={modele.nom} onChange={(e) => changer({ nom: e.currentTarget.value })} />

              {modele.source === "html" ? (
                <Paper withBorder p="md">
                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                      {t.htmlAide}
                    </Text>
                    <Button leftSection={<IconFileImport size={16} />} variant={modele.html ? "light" : "filled"} onClick={importerHtml}>
                      {modele.html ? t.remplacerHtml : t.importerHtml}
                    </Button>
                    {importee && <Text size="sm">{t.htmlImporte(importee.nomFichier)}</Text>}
                    {importee?.balisesCoupees && (
                      <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
                        {t.balisesCoupees}
                      </Alert>
                    )}
                    {importee && importee.imagesManquantes.length > 0 && (
                      <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
                        {t.imagesManquantes(importee.imagesManquantes.length)}
                      </Alert>
                    )}
                    {modele.html &&
                      (balises.length > 0 ? (
                        <>
                          <Text size="sm" fw={500}>
                            {t.balisesTrouvees}
                          </Text>
                          <Group gap={6}>
                            {balises.map((balise) => (
                              <Badge key={balise} variant="light" tt="none">
                                {balise}
                              </Badge>
                            ))}
                          </Group>
                        </>
                      ) : (
                        <Alert color="orange">{t.aucuneBalise}</Alert>
                      ))}
                  </Stack>
                </Paper>
              ) : (
                <>
                  <Paper withBorder p="md">
                    <Stack gap="sm">
                      <Title order={5}>{t.miseEnPageTitre}</Title>
                      <SegmentedControl
                        fullWidth
                        value={modele.miseEnPage}
                        onChange={(valeur) => changer({ miseEnPage: valeur as MiseEnPage })}
                        data={(Object.keys(t.misesEnPage) as MiseEnPage[]).map((value) => ({ value, label: t.misesEnPage[value] }))}
                      />
                    </Stack>
                  </Paper>

                  <Paper withBorder p="md">
                    <Stack gap="sm">
                      <Title order={5}>{t.styleTitre}</Title>
                      <Group grow align="flex-start">
                        <Select
                          label={t.police}
                          value={modele.police}
                          allowDeselect={false}
                          data={Object.keys(POLICES_WEB)}
                          onChange={(police) => police && changer({ police })}
                        />
                        <NumberInput
                          label={t.taille}
                          min={10}
                          max={18}
                          value={modele.taille}
                          onChange={(taille) => typeof taille === "number" && changer({ taille })}
                        />
                      </Group>
                      <Text size="xs" c="dimmed">
                        {t.policeAide}
                      </Text>
                      {(["principale", "texte", "discrete"] as const).map((cle) => (
                        <ColorInput
                          key={cle}
                          label={t.couleurs[cle]}
                          format="hex"
                          swatches={[COULEURS.encre, COULEURS.eau, "#000000", "#6b7075"]}
                          value={modele.couleurs[cle]}
                          onChange={(couleur) => /^#[0-9a-f]{6}$/i.test(couleur) && changer({ couleurs: { ...modele.couleurs, [cle]: couleur.toLowerCase() } })}
                        />
                      ))}
                    </Stack>
                  </Paper>

                  <Paper withBorder p="md">
                    <Stack gap="sm">
                      <Title order={5}>{t.logoTitre}</Title>
                      <Text size="xs" c="dimmed">
                        {t.logoAide}
                      </Text>
                      {modele.logo ? (
                        <>
                          <Group gap="sm" wrap="nowrap">
                            <Image src={modele.logo.donnees} alt="" w={Math.min(160, modele.logo.largeur)} fit="contain" />
                            <Text size="sm" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
                              {modele.logo.nomFichier}
                            </Text>
                          </Group>
                          <Text size="sm">{t.largeurLogo}</Text>
                          <Slider
                            min={40}
                            max={300}
                            step={5}
                            defaultValue={modele.logo.largeur}
                            key={modele.logo.nomFichier}
                            onChangeEnd={redimensionnerLogo}
                            marks={[{ value: 60 }, { value: 120 }, { value: 180 }, { value: 240 }]}
                          />
                          <Group gap="xs" mt="xs">
                            <Button size="compact-sm" variant="light" onClick={choisirLogo}>
                              {t.remplacerLogo}
                            </Button>
                            <Button size="compact-sm" variant="subtle" color="gray" onClick={() => changer({ logo: null })}>
                              {t.retirerLogo}
                            </Button>
                          </Group>
                        </>
                      ) : (
                        <Button variant="light" leftSection={<IconPhoto size={16} />} onClick={choisirLogo}>
                          {t.choisirLogo}
                        </Button>
                      )}
                    </Stack>
                  </Paper>

                  <Paper withBorder p="md">
                    <Stack gap="xs">
                      <Title order={5}>{t.lignesTitre}</Title>
                      <Text size="xs" c="dimmed">
                        {t.lignesAide}
                      </Text>
                      {modele.lignes.map((ligne, index) => (
                        <Group key={ligne.id} gap={4} wrap="nowrap" data-ligne={ligne.role}>
                          <Select
                            w={124}
                            size="xs"
                            aria-label={t.roles[ligne.role]}
                            value={ligne.role}
                            allowDeselect={false}
                            data={ROLES.map((role) => ({ value: role, label: t.roles[role] }))}
                            onChange={(role) => role && changerLigne(ligne.id, { role: role as Role })}
                          />
                          <TextInput
                            size="xs"
                            style={{ flex: 1 }}
                            aria-label={`${t.roles[ligne.role]} : texte`}
                            placeholder={t.exemples[ligne.role]}
                            value={ligne.modele}
                            onChange={(e) => changerLigne(ligne.id, { modele: e.currentTarget.value })}
                          />
                          <Tooltip label={t.monter}>
                            <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t.monter} disabled={index === 0} onClick={() => deplacerLigne(index, -1)}>
                              <IconArrowUp size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t.descendre}>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              aria-label={t.descendre}
                              disabled={index === modele.lignes.length - 1}
                              onClick={() => deplacerLigne(index, 1)}
                            >
                              <IconArrowDown size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t.supprimer}>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              aria-label={t.supprimer}
                              onClick={() => onModele((m) => ({ ...m, lignes: m.lignes.filter((l) => l.id !== ligne.id) }))}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ))}
                      <Menu position="bottom-start">
                        <Menu.Target>
                          <Button size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} w="fit-content">
                            {t.ajouterLigne}
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {ROLES.map((role) => (
                            <Menu.Item key={role} onClick={() => onModele((m) => ({ ...m, lignes: [...m.lignes, { id: nouvelIdLigne(), role, modele: "" }] }))}>
                              {t.roles[role]}
                            </Menu.Item>
                          ))}
                        </Menu.Dropdown>
                      </Menu>
                    </Stack>
                  </Paper>
                </>
              )}

              {balises.length > 0 && (
                <Paper withBorder p="md">
                  <Stack gap="xs">
                    <Title order={5}>{t.miseEnFormeTitre}</Title>
                    {balises.map((balise) => (
                      <Group key={balise} justify="space-between" wrap="nowrap">
                        <Badge variant="light" tt="none">
                          {balise}
                        </Badge>
                        <Select
                          size="xs"
                          w={180}
                          aria-label={tChamp.miseEnForme(balise)}
                          value={modele.transformations?.[balise] ?? "aucune"}
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
        </ScrollArea.Autosize>
      </Group>
    </Stack>
  );
}
