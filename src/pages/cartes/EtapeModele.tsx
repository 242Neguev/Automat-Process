import { useMemo, useState } from "react";
import { Badge, Button, Group, Paper, ScrollArea, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPlus, IconQrcode, IconSparkles } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { agentBalises, balisesDuModele } from "../../donnees/agents";
import type { Transformation } from "../../donnees/nettoyage";
import { arrondir, INFORMATIONS, nouveauChampTexte, nouveauQr, nouvelId, reserverPlaceQr, transformationsParDefaut } from "../../modele/champs";
import { contientFondPerdu, versCarte, type Format } from "../../modele/formats";
import { analyserSvg } from "../../modele/svg";
import { enErreurMoteur, importerFond, remplacerFond, type Champ, type ChampQr, type ChampTexte, type Face, type ModeleCarte } from "../../moteur";
import { textes } from "../../textes";
import ApercuCarte from "./ApercuCarte";
import CoucheEdition from "./CoucheEdition";
import PanneauVisuels, { type Visuel } from "./PanneauVisuels";
import ProprietesChamp from "./ProprietesChamp";

const t = textes.cartes.modele;
export type Source = "demo" | "perso";

interface Props {
  source: Source;
  onSource: (source: Source) => void;
  modele: ModeleCarte;
  /** Modifie le modèle à partir de sa version la plus récente (gestes rapides à la souris). */
  onModele: (modification: (modele: ModeleCarte) => ModeleCarte) => void;
  visuels: Partial<Record<Face, Visuel>>;
  onVisuels: (visuels: Partial<Record<Face, Visuel>>) => void;
  polices: string[];
}

function signalerErreur(e: unknown) {
  const { message, details } = enErreurMoteur(e);
  notifications.show({ color: "red", icon: <IconAlertTriangle size={18} />, title: textes.erreur, message: [message, ...details].join("\n") });
}

/** Champs détectés dans un SVG, ramenés sur la carte finie (position, taille, largeur disponible). */
function champsDetectes(svg: ReturnType<typeof analyserSvg>, format: Format, avecFondPerdu: boolean, existants: Champ[]): ChampTexte[] {
  const champs: ChampTexte[] = [];
  for (const detecte of svg.champs) {
    const visuel = { largeur: svg.largeurMm, hauteur: svg.hauteurMm };
    const { x, y, echelle } = versCarte({ x: detecte.x_mm, y: detecte.y_mm }, visuel, format, avecFondPerdu);
    const marge = 4;
    const largeur =
      detecte.ancre === "middle" ? 2 * Math.min(x, format.largeur_mm - x) - 2 * marge : detecte.ancre === "end" ? x - marge : format.largeur_mm - x - marge;
    const taille = Math.round(detecte.taille_pt * echelle * 10) / 10;
    champs.push({
      ...detecte,
      id: nouvelId([...existants, ...champs]),
      x_mm: arrondir(x),
      y_mm: arrondir(y),
      taille_pt: taille,
      largeur_max_mm: arrondir(Math.max(15, largeur)),
      taille_min_pt: Math.round(taille * 0.75 * 2) / 2,
      lignes_max: 1,
    });
  }
  return champs;
}

export default function EtapeModele({ source, onSource, modele, onModele, visuels, onVisuels, polices }: Props) {
  const [face, setFace] = useState<Face>("recto");
  const [selection, setSelection] = useState<string | null>(null);
  const agent = useMemo(() => agentBalises(modele), [modele]);
  const choisi = modele.champs.find((champ) => champ.id === selection) ?? null;
  const faceAffichee = modele.fond_verso ? face : "recto";

  const modifierChamp = (id: string, modifications: Partial<Champ>) =>
    onModele((m) => ({ ...m, champs: m.champs.map((c) => (c.id === id ? ({ ...c, ...modifications } as Champ) : c)) }));
  const supprimerChamp = (id: string) => {
    setSelection(null);
    onModele((m) => ({ ...m, champs: m.champs.filter((c) => c.id !== id) }));
  };
  const changerTransformation = (balise: string, transformation: Transformation | null) =>
    onModele((m) => {
      const transformations = { ...m.transformations };
      if (transformation) transformations[balise] = transformation;
      else delete transformations[balise];
      return { ...m, transformations };
    });

  function ajouter(information: (typeof INFORMATIONS)[number]) {
    const champ = nouveauChampTexte(modele, information);
    onModele((m) => ({ ...m, champs: [...m.champs, champ], transformations: { ...information.transformations, ...m.transformations } }));
    setSelection(champ.id);
  }

  function ajouterQr() {
    const existant = modele.champs.find((champ) => champ.type === "qr");
    if (existant) return setSelection(existant.id);
    const qr = nouveauQr(modele);
    onModele((m) => ({ ...m, champs: [...reserverPlaceQr(m.champs, qr), qr] }));
    setSelection(qr.id);
  }

  async function importer(faceVisuel: Face) {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.filtreVisuels, extensions: ["pdf", "svg", "png", "jpg", "jpeg"] }] });
    if (typeof chemin !== "string") return;
    try {
      const fond = await importerFond(chemin);
      let visuel: Visuel = fond;
      const analyse = fond.genre === "svg" && fond.texte ? analyserSvg(fond.texte, polices) : null;
      if (analyse) visuel = { ...fond, texte: null, largeurMm: analyse.largeurMm, hauteurMm: analyse.hauteurMm };
      const avecFondPerdu = contientFondPerdu(visuel, modele.format);
      let nouveaux: ChampTexte[] = [];
      if (analyse && faceVisuel === "recto" && analyse.champs.length > 0) {
        await remplacerFond(fond.chemin, analyse.svgNettoye);
        nouveaux = champsDetectes(analyse, modele.format, avecFondPerdu, modele.champs);
      }
      onVisuels({ ...visuels, [faceVisuel]: visuel });
      onModele((m) => {
        const qr = m.champs.find((c): c is ChampQr => c.type === "qr");
        const champs = [...m.champs, ...(qr ? reserverPlaceQr(nouveaux, qr) : nouveaux)];
        const defaut = transformationsParDefaut(balisesDuModele({ ...m, champs }));
        return {
          ...m,
          [`fond_${faceVisuel}`]: fond.chemin,
          [`fond_${faceVisuel}_avec_fond_perdu`]: avecFondPerdu,
          champs,
          transformations: { ...defaut, ...m.transformations },
        };
      });
      if (nouveaux.length > 0) {
        notifications.show({ color: "teal", icon: <IconSparkles size={18} />, title: fond.nomFichier, message: t.balisesDetectees(nouveaux.length) });
      }
      setFace(faceVisuel);
    } catch (e) {
      signalerErreur(e);
    }
  }

  function retirer(faceVisuel: Face) {
    const reste = { ...visuels };
    delete reste[faceVisuel];
    onVisuels(reste);
    onModele((m) => ({ ...m, [faceVisuel === "recto" ? "fond_recto" : "fond_verso"]: null }));
    setFace("recto");
  }

  return (
    <Stack gap="md">
      <SegmentedControl
        w={360}
        value={source}
        onChange={(valeur) => {
          setSelection(null);
          onSource(valeur as Source);
        }}
        data={[
          { value: "perso", label: t.source.perso },
          { value: "demo", label: t.source.demo },
        ]}
      />
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ApercuCarte modele={modele} agent={agent} face={faceAffichee}>
            {faceAffichee === "recto" && (
              <CoucheEdition modele={modele} selection={selection} onSelection={setSelection} onChamp={modifierChamp} onSupprimer={supprimerChamp} />
            )}
          </ApercuCarte>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {faceAffichee === "recto" ? t.aideEditeur : t.versoSansChamps}
            </Text>
            {modele.fond_verso && (
              <SegmentedControl
                value={faceAffichee}
                onChange={(valeur) => setFace(valeur as Face)}
                data={[
                  { value: "recto", label: textes.cartes.recto },
                  { value: "verso", label: textes.cartes.verso },
                ]}
              />
            )}
          </Group>
        </Stack>

        {/* Colonne de réglages : l'ajout d'informations reste toujours en haut ; en dessous, les réglages
            de l'information sélectionnée, sinon le format et les visuels. */}
        <ScrollArea.Autosize mah="calc(100vh - 280px)" w={380} type="auto" scrollbars="y" offsetScrollbars style={{ flexShrink: 0 }}>
          <Stack gap="md">
            <Paper withBorder p="md">
              <Stack gap="sm">
                <div>
                  <Title order={5}>{t.ajouterTitre}</Title>
                  <Text size="xs" c="dimmed">
                    {t.ajouterAide}
                  </Text>
                </div>
                <Group gap={6}>
                  {INFORMATIONS.map((information) => (
                    <Button key={information.libelle} size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} onClick={() => ajouter(information)}>
                      {information.libelle}
                    </Button>
                  ))}
                  <Button size="compact-sm" variant="light" leftSection={<IconQrcode size={14} />} onClick={ajouterQr}>
                    {t.ajouterQr}
                  </Button>
                </Group>
                {balisesDuModele(modele).length > 0 && (
                  <>
                    <Text size="sm" fw={500} mt="xs">
                      {t.balises}
                    </Text>
                    <Group gap={6}>
                      {balisesDuModele(modele).map((balise) => (
                        <Badge key={balise} variant="light" tt="none">
                          {balise}
                        </Badge>
                      ))}
                    </Group>
                  </>
                )}
              </Stack>
            </Paper>
            {choisi ? (
              <ProprietesChamp
                champ={choisi}
                modele={modele}
                polices={polices}
                onChamp={modifierChamp}
                onTransformation={changerTransformation}
                onSupprimer={supprimerChamp}
                onFermer={() => setSelection(null)}
              />
            ) : (
              source === "perso" && (
                <PanneauVisuels
                  format={modele.format}
                  visuels={visuels}
                  avecFondPerdu={{ recto: modele.fond_recto_avec_fond_perdu ?? true, verso: modele.fond_verso_avec_fond_perdu ?? true }}
                  onFormat={(format) => onModele((m) => ({ ...m, format }))}
                  onFondPerdu={(faceVisuel, avec) => onModele((m) => ({ ...m, [`fond_${faceVisuel}_avec_fond_perdu`]: avec }))}
                  onImporter={importer}
                  onRetirer={retirer}
                />
              )
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Group>
    </Stack>
  );
}
