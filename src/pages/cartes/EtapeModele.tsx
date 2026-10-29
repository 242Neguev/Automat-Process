import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Group, Paper, ScrollArea, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowsMove, IconEraser, IconPlus, IconQrcode, IconReplace, IconSparkles } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { agentBalises, balisesDuModele } from "../../donnees/agents";
import type { Transformation } from "../../donnees/nettoyage";
import {
  boiteTexteVisuel,
  champDepuisTexte,
  INFORMATIONS,
  nouveauChampTexte,
  nouveauQr,
  nouvelId,
  reserverPlaceQr,
  transformationsParDefaut,
  type PlacementVisuel,
} from "../../modele/champs";
import { contientFondPerdu } from "../../modele/formats";
import { analyserSvg, retirerTexteSvg } from "../../modele/svg";
import { preparerVisuel, type Visuel } from "../../modele/visuels";
import {
  couleurAutour,
  importerFond,
  remplacerFond,
  retirerTextePdf,
  type Champ,
  type ChampMasque,
  type ChampQr,
  type ChampTexte,
  type Face,
  type ModeleCarte,
  type TexteVisuel,
  type Zone,
} from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "../commun/signalerErreur";
import ApercuCarte from "./ApercuCarte";
import CoucheEdition, { type Outil, type TexteCliquable } from "./CoucheEdition";
import { libellesCartes } from "./libelles";
import PanneauVisuels from "./PanneauVisuels";
import ProprietesChamp from "./ProprietesChamp";

export type Source = "demo" | "perso";
type Information = (typeof INFORMATIONS)[number];
type Visuels = Partial<Record<Face, Visuel>>;

const ICONES_OUTILS: Record<Outil, typeof IconArrowsMove> = { edition: IconArrowsMove, remplacer: IconReplace, effacer: IconEraser };

interface Props {
  source: Source;
  onSource: (source: Source) => void;
  modele: ModeleCarte;
  /** Modifie le modèle à partir de sa version la plus récente (gestes rapides à la souris). */
  onModele: (modification: (modele: ModeleCarte) => ModeleCarte) => void;
  visuels: Visuels;
  onVisuels: (modification: (visuels: Visuels) => Visuels) => void;
  polices: string[];
  /** Le modèle de démonstration (une carte de visite) n'est proposé que pour les cartes. */
  avecDemo?: boolean;
}

/** Où le visuel apparaît sur la carte ; rien pour une image, dont on ne lit pas les textes. */
function placement(visuel: Visuel | undefined, avecFondPerdu: boolean | undefined): PlacementVisuel | null {
  if (!visuel?.largeurMm || !visuel.hauteurMm) return null;
  return { largeur: visuel.largeurMm, hauteur: visuel.hauteurMm, avecFondPerdu: avecFondPerdu ?? true };
}

/** Ajoute des informations au modèle : elles laissent sa place au QR code et reçoivent les mises en forme courantes. */
function avecChamps(m: ModeleCarte, nouveaux: ChampTexte[], transformations?: Record<string, Transformation>): ModeleCarte {
  const qr = m.champs.find((c): c is ChampQr => c.type === "qr");
  const champs = [...m.champs, ...(qr ? reserverPlaceQr(nouveaux, qr) : nouveaux)];
  const defaut = transformationsParDefaut(balisesDuModele({ ...m, champs }));
  return { ...m, champs, transformations: { ...defaut, ...transformations, ...m.transformations } };
}

export default function EtapeModele({ source, onSource, modele, onModele, visuels, onVisuels, polices, avecDemo = true }: Props) {
  const t = libellesCartes(Boolean(modele.format.px)).modele;
  const [face, setFace] = useState<Face>("recto");
  const [selection, setSelection] = useState<string | null>(null);
  const [outil, setOutil] = useState<Outil>("edition");
  const [texteChoisi, setTexteChoisi] = useState<TexteVisuel | null>(null);
  const [occupe, setOccupe] = useState(false);
  // Dernière version du modèle, pour les actions qui attendent une réponse du cœur.
  const modeleRecent = useRef(modele);
  useEffect(() => {
    modeleRecent.current = modele;
  }, [modele]);

  const agent = useMemo(() => agentBalises(modele), [modele]);
  const choisi = modele.champs.find((champ) => champ.id === selection) ?? null;
  const faceAffichee = modele.fond_verso ? face : "recto";
  const avecOutils = faceAffichee === "recto" && Boolean(modele.fond_recto);
  const outilActif: Outil = avecOutils ? outil : "edition";
  const recto = visuels.recto;
  const placementRecto = placement(recto, modele.fond_recto_avec_fond_perdu);
  const textesCliquables: TexteCliquable[] =
    recto && placementRecto
      ? recto.textes.map((texte) => ({ id: texte.id, texte: texte.texte, boite: boiteTexteVisuel(texte, placementRecto, modele.format) }))
      : [];
  const aide =
    faceAffichee === "verso"
      ? t.versoSansChamps
      : outilActif === "remplacer"
        ? textesCliquables.length > 0
          ? t.aideRemplacer
          : t.aucunTexte
        : outilActif === "effacer"
          ? t.aideEffacer
          : t.aideEditeur;

  /**
   * Une seule opération du cœur à la fois : les numéros des textes changent après chaque retrait,
   * un double-clic ne doit donc pas retirer deux textes.
   */
  async function uneSeuleFois(operation: () => Promise<void>) {
    if (occupe) return;
    setOccupe(true);
    try {
      await operation();
    } catch (e) {
      signalerErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  function changerOutil(nouvel: Outil) {
    setOutil(nouvel);
    setTexteChoisi(null);
    setSelection(null);
  }

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

  function ajouter(information: Information) {
    const champ = nouveauChampTexte(modele, information);
    onModele((m) => avecChamps(m, [champ], information.transformations));
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
      const { visuel, balises, svgNettoye } = preparerVisuel(await importerFond(chemin), polices);
      // Les balises sont retirées du visuel quelle que soit la face : elles ne doivent jamais s'imprimer.
      if (svgNettoye) await remplacerFond(visuel.chemin, svgNettoye);
      const avecFondPerdu = contientFondPerdu(visuel, modele.format);
      const ou = placement(visuel, avecFondPerdu);
      const detectes = faceVisuel === "recto" && ou ? balises : [];
      onVisuels((v) => ({ ...v, [faceVisuel]: visuel }));
      onModele((m) => {
        const nouveaux: ChampTexte[] = [];
        for (const texte of detectes) nouveaux.push(champDepuisTexte(texte, texte.texte, ou!, m.format, [...m.champs, ...nouveaux], polices));
        return avecChamps({ ...m, [`fond_${faceVisuel}`]: visuel.chemin, [`fond_${faceVisuel}_avec_fond_perdu`]: avecFondPerdu }, nouveaux);
      });
      if (detectes.length > 0) {
        notifications.show({ color: "teal", icon: <IconSparkles size={18} />, title: visuel.nomFichier, message: t.balisesDetectees(detectes.length) });
      } else if (balises.length > 0) {
        notifications.show({ color: "orange", icon: <IconAlertTriangle size={18} />, title: visuel.nomFichier, message: t.versoBalises });
      }
      setFace(faceVisuel);
      // Des textes d'exemple dans le visuel du recto : on propose aussitôt de les remplacer.
      changerOutil(faceVisuel === "recto" && detectes.length === 0 && visuel.textes.length > 0 ? "remplacer" : "edition");
    } catch (e) {
      signalerErreur(e);
    }
  }

  function retirer(faceVisuel: Face) {
    onVisuels((v) => {
      const reste = { ...v };
      delete reste[faceVisuel];
      return reste;
    });
    onModele((m) => ({
      ...m,
      [`fond_${faceVisuel}`]: null,
      // Les zones effacées n'avaient de sens que sur ce visuel.
      champs: faceVisuel === "recto" ? m.champs.filter((c) => c.type !== "masque") : m.champs,
    }));
    setFace("recto");
    changerOutil("edition");
  }

  /** Le texte d'exemple quitte le visuel et devient une information, au même endroit et au même style. */
  const remplacerTexte = (texte: TexteVisuel, information: Information) =>
    uneSeuleFois(async () => {
      if (!recto || !placementRecto) return;
      let retire = texte;
      let restants: TexteVisuel[];
      let svgSource = recto.svgSource;
      if (recto.genre === "pdf") {
        ({ texte: retire, textes: restants } = await retirerTextePdf(recto.chemin, texte.id));
      } else if (svgSource) {
        svgSource = retirerTexteSvg(svgSource, texte.id);
        await remplacerFond(recto.chemin, svgSource);
        restants = analyserSvg(svgSource, polices).textes;
      } else {
        return;
      }
      onVisuels((v) => (v.recto ? { ...v, recto: { ...v.recto, textes: restants, svgSource } } : v));
      onModele((m) => {
        const champ = champDepuisTexte(retire, information.modele, placementRecto, m.format, m.champs, polices);
        return avecChamps(m, [{ ...champ, lignes_max: information.lignes_max ?? 1 }], information.transformations);
      });
      setTexteChoisi(null);
      if (restants.length === 0) changerOutil("edition");
    });

  /** Recouvre une zone du visuel d'un aplat de la couleur qui l'entoure. */
  const effacer = (zone: Zone) =>
    uneSeuleFois(async () => {
      const couleur = await couleurAutour(modeleRecent.current, zone);
      const masque: ChampMasque = { id: nouvelId(modeleRecent.current.champs), type: "masque", ...zone, couleur: { rgb: couleur } };
      onModele((m) => ({ ...m, champs: [...m.champs, masque] }));
      setSelection(masque.id);
    });

  const mesurerCouleur = (id: string) =>
    uneSeuleFois(async () => {
      const masque = modele.champs.find((c): c is ChampMasque => c.id === id && c.type === "masque");
      if (!masque) return;
      const { x_mm, y_mm, largeur_mm, hauteur_mm } = masque;
      const couleur = await couleurAutour(modele, { x_mm, y_mm, largeur_mm, hauteur_mm });
      modifierChamp(id, { couleur: { rgb: couleur } });
    });

  return (
    <Stack gap="md">
      {avecDemo && (
        <SegmentedControl
          w={360}
          value={source}
          onChange={(valeur) => {
            changerOutil("edition");
            onSource(valeur as Source);
          }}
          data={[
            { value: "perso", label: t.source.perso },
            { value: "demo", label: t.source.demo },
          ]}
        />
      )}
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {avecOutils && (
            <SegmentedControl
              size="xs"
              value={outilActif}
              onChange={(valeur) => changerOutil(valeur as Outil)}
              data={(Object.keys(ICONES_OUTILS) as Outil[]).map((valeur) => {
                const Icone = ICONES_OUTILS[valeur];
                return {
                  value: valeur,
                  label: (
                    <Group gap={6} wrap="nowrap" justify="center">
                      <Icone size={14} />
                      <span>{t.outils[valeur]}</span>
                    </Group>
                  ),
                };
              })}
            />
          )}
          <ApercuCarte modele={modele} agent={agent} face={faceAffichee}>
            {faceAffichee === "recto" && (
              <CoucheEdition
                modele={modele}
                selection={selection}
                outil={outilActif}
                textesVisuel={textesCliquables}
                onSelection={setSelection}
                onChamp={modifierChamp}
                onSupprimer={supprimerChamp}
                onZone={effacer}
                onTexteVisuel={(id) => setTexteChoisi(recto?.textes.find((texte) => texte.id === id) ?? null)}
              />
            )}
          </ApercuCarte>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {aide}
            </Text>
            {modele.fond_verso && (
              <SegmentedControl
                style={{ flexShrink: 0 }}
                value={faceAffichee}
                onChange={(valeur) => {
                  setTexteChoisi(null);
                  setFace(valeur as Face);
                }}
                data={[
                  { value: "recto", label: textes.cartes.recto },
                  { value: "verso", label: textes.cartes.verso },
                ]}
              />
            )}
          </Group>
        </Stack>

        {/* Colonne de réglages : l'ajout d'informations reste toujours en haut ; en dessous, le texte
            d'exemple à remplacer, sinon les réglages de l'information sélectionnée, sinon le format et les visuels. */}
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
            {texteChoisi ? (
              <Paper withBorder p="md" style={{ borderColor: "#e8590c" }}>
                <Stack gap="sm">
                  <Title order={5}>{t.remplacerPar(texteChoisi.texte)}</Title>
                  <Group gap={6}>
                    {INFORMATIONS.map((information) => (
                      <Button key={information.libelle} size="compact-sm" variant="light" disabled={occupe} onClick={() => remplacerTexte(texteChoisi, information)}>
                        {information.libelle}
                      </Button>
                    ))}
                  </Group>
                  <Button variant="default" onClick={() => setTexteChoisi(null)}>
                    {t.annuler}
                  </Button>
                </Stack>
              </Paper>
            ) : choisi ? (
              <ProprietesChamp
                champ={choisi}
                modele={modele}
                polices={polices}
                onChamp={modifierChamp}
                onTransformation={changerTransformation}
                onSupprimer={supprimerChamp}
                onFermer={() => setSelection(null)}
                onMesurerCouleur={mesurerCouleur}
              />
            ) : (
              source === "perso" && (
                <PanneauVisuels
                  nom={modele.nom}
                  onNom={(nom) => onModele((m) => ({ ...m, nom }))}
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
