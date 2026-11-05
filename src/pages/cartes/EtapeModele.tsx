import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Group, Paper, ScrollArea, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowBackUp, IconArrowsMove, IconEraser, IconPlus, IconQrcode, IconReplace, IconScan, IconSparkles, IconUser } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { agentBalises, balisesDuModele } from "../../donnees/agents";
import type { Transformation } from "../../donnees/nettoyage";
import {
  baliseLue,
  boiteTexteVisuel,
  champDepuisTexte,
  champDepuisTexteLu,
  INFORMATIONS,
  nouveauChampTexte,
  nouveauQr,
  nouvellePhoto,
  nouvelId,
  reserverPlaceQr,
  transformationsParDefaut,
  type PlacementVisuel,
} from "../../modele/champs";
import { contientFondPerdu, FORMATS, FORMATS_ECRAN } from "../../modele/formats";
import { analyserSvg, retirerTexteSvg } from "../../modele/svg";
import { aUnVerso, preparerVisuel, type Visuel, type Visuels } from "../../modele/visuels";
import {
  couleurAutour,
  effacerTexte,
  importerFond,
  reconnaitreTextes,
  remplacerFond,
  retirerTextePdf,
  type Champ,
  type ChampMasque,
  type ChampQr,
  type ChampTexte,
  type Face,
  type ModeleCarte,
  type TexteLu,
  type TexteVisuel,
  type Zone,
} from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "../commun/signalerErreur";
import { BandeauVerrou } from "../commun/verrou";
import ApercuCarte, { CalqueReference } from "./ApercuCarte";
import CoucheEdition, { type Outil, type TexteCliquable } from "./CoucheEdition";
import { libellesCartes } from "./libelles";
import PanneauVariantes from "./PanneauVariantes";
import PanneauVisuels from "./PanneauVisuels";
import ProprietesChamp from "./ProprietesChamp";

export type Source = "demo" | "perso";
type Information = (typeof INFORMATIONS)[number];
/** Visuels secondaires : versions écran des faces et calque de référence. */
export type Secondaire = "recto_ecran" | "verso_ecran" | "calque";
/** Texte d'exemple choisi pour être remplacé : un texte du visuel (PDF, SVG) ou un texte lu dans une image. */
type Choix = { genre: "visuel"; texte: TexteVisuel } | { genre: "lu"; texte: TexteLu };
/** Choix « visuels du modèle » de l'aperçu des variantes. */
const MODELE = "\u0000modele";

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
  /** Mode opérateur : le modèle s'affiche sans pouvoir être modifié. */
  verrouille?: boolean;
  onDeverrouiller?: () => void;
}

/** Le modèle d'un coup d'œil, en mode opérateur : format, informations à fournir et visuels. */
function RecapitulatifModele({ modele, visuels }: { modele: ModeleCarte; visuels: Visuels }) {
  const t = libellesCartes(Boolean(modele.format.px)).modele;
  const { largeur_mm, hauteur_mm, fond_perdu_mm, px } = modele.format;
  const predefini = (px ? FORMATS_ECRAN : FORMATS).find((f) => f.largeur_mm === largeur_mm && f.hauteur_mm === hauteur_mm && f.fond_perdu_mm === fond_perdu_mm);
  const balises = balisesDuModele(modele);
  const noms = (["recto", "verso"] as Face[]).map((f) => visuels[f]?.nomFichier).filter(Boolean);
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={5}>{modele.nom}</Title>
        <Text size="sm">
          <Text span fw={500}>
            {textes.verrou.format} :{" "}
          </Text>
          {predefini?.libelle ?? t.format(largeur_mm, hauteur_mm, fond_perdu_mm)}
        </Text>
        {noms.length > 0 && (
          <Text size="sm">
            <Text span fw={500}>
              {textes.verrou.visuels} :{" "}
            </Text>
            {noms.join(", ")}
          </Text>
        )}
        {modele.variantes && modele.variantes.valeurs.length > 0 && (
          <Text size="sm" data-recapitulatif-variantes>
            <Text span fw={500}>
              {t.variantes.titre} ({modele.variantes.balise}) :{" "}
            </Text>
            {modele.variantes.valeurs.map((v, rang) => v.valeur.trim() || t.variantes.nommee(rang + 1)).join(", ")}
          </Text>
        )}
        {balises.length > 0 && (
          <>
            <Text size="sm" fw={500}>
              {t.balises}
            </Text>
            <Group gap={6}>
              {balises.map((balise) => (
                <Badge key={balise} variant="light" tt="none">
                  {balise}
                </Badge>
              ))}
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
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

export default function EtapeModele({ source, onSource, modele, onModele, visuels, onVisuels, polices, avecDemo = true, verrouille = false, onDeverrouiller }: Props) {
  const t = libellesCartes(Boolean(modele.format.px)).modele;
  const [face, setFace] = useState<Face>("recto");
  const [selection, setSelection] = useState<string | null>(null);
  const [outil, setOutil] = useState<Outil>("edition");
  const [texteChoisi, setTexteChoisi] = useState<Choix | null>(null);
  const [occupe, setOccupe] = useState(false);
  // Textes lus dans le visuel du recto (reconnaissance de caractères) : `null` tant qu'ils ne l'ont pas été.
  const [textesLus, setTextesLus] = useState<TexteLu[] | null>(null);
  const [lecture, setLecture] = useState(false);
  // Lecture automatique des textes d'un visuel qui vient d'être importé.
  const [aLire, setALire] = useState(false);
  // Effacements intelligents : les visuels d'avant, pour annuler.
  const [historique, setHistorique] = useState<Visuel[]>([]);
  // Calque de référence : posé sur la carte, à demi transparent (réglages de la session).
  const [calqueVisible, setCalqueVisible] = useState(true);
  const [opaciteCalque, setOpaciteCalque] = useState(50);
  // Dernière version du modèle, pour les actions qui attendent une réponse du cœur.
  const modeleRecent = useRef(modele);
  useEffect(() => {
    modeleRecent.current = modele;
  }, [modele]);
  const visuelsRecents = useRef(visuels);
  useEffect(() => {
    visuelsRecents.current = visuels;
  }, [visuels]);
  useEffect(() => {
    if (aLire && modele.fond_recto) {
      setALire(false);
      void lireTextes(true);
    }
  }, [aLire, modele.fond_recto]); // `lireTextes` lit le modèle le plus récent

  // Variantes : l'aperçu montre les visuels de la variante choisie (ou ceux du modèle).
  const [varianteApercu, setVarianteApercu] = useState<string>(MODELE);
  const rangApercu = modele.variantes?.valeurs.findIndex((v) => v.id === varianteApercu) ?? -1;
  const agent = useMemo(() => agentBalises(modele, rangApercu >= 0 ? rangApercu : undefined), [modele, rangApercu]);
  const choisi = modele.champs.find((champ) => champ.id === selection) ?? null;
  const faceAffichee = aUnVerso(modele) ? face : "recto";
  const avecOutils = faceAffichee === "recto" && Boolean(modele.fond_recto);
  const outilActif: Outil = avecOutils ? outil : "edition";
  const recto = visuels.recto;
  const placementRecto = placement(recto, modele.fond_recto_avec_fond_perdu);
  // Textes d'un PDF ou d'un SVG, et textes lus dans une image (numérotés à part, en négatif).
  const textesCliquables: TexteCliquable[] = [
    ...(recto && placementRecto
      ? recto.textes.map((texte) => ({ id: texte.id, texte: texte.texte, boite: boiteTexteVisuel(texte, placementRecto, modele.format) }))
      : []),
    ...(textesLus ?? []).map((texte) => ({
      id: -1 - texte.id,
      texte: texte.texte,
      boite: { x: texte.zone.x_mm, y: texte.zone.y_mm, largeur: texte.zone.largeur_mm, hauteur: texte.zone.hauteur_mm },
    })),
  ];
  const image = recto?.genre === "image";
  const aide = verrouille
    ? ""
    : faceAffichee === "verso"
      ? t.versoSansChamps
      : outilActif === "remplacer"
        ? lecture
          ? t.lectureTextes
          : (textesLus?.length ?? 0) > 0
            ? t.textesLus(textesLus!.length)
            : textesCliquables.length > 0
              ? t.aideRemplacer
              : textesLus
                ? t.aucunTexteLu
                : t.aucunTexte
        : outilActif === "effacer"
          ? image
            ? t.aideEffacerImage
            : t.aideEffacer
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

  function ajouterPhoto() {
    const photo = nouvellePhoto(modele);
    onModele((m) => ({ ...m, champs: [...m.champs, photo] }));
    setSelection(photo.id);
  }

  /** Visuel propre à une variante, pour une face ; ses balises éventuelles sont retirées comme ailleurs. */
  async function importerVariante(id: string, faceVisuel: Face) {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.filtreVisuels, extensions: ["pdf", "svg", "png", "jpg", "jpeg"] }] });
    if (typeof chemin !== "string") return;
    try {
      const { visuel, svgNettoye } = preparerVisuel(await importerFond(chemin), polices);
      if (svgNettoye) await remplacerFond(visuel.chemin, svgNettoye);
      const avecFondPerdu = contientFondPerdu(visuel, modele.format);
      onVisuels((v) => ({ ...v, [`variante-${id}-${faceVisuel}`]: visuel }));
      onModele((m) => ({
        ...m,
        variantes: m.variantes && {
          ...m.variantes,
          valeurs: m.variantes.valeurs.map((v) =>
            v.id === id ? { ...v, [`fond_${faceVisuel}`]: visuel.chemin, [`fond_${faceVisuel}_avec_fond_perdu`]: avecFondPerdu } : v,
          ),
        },
      }));
      setVarianteApercu(id);
      setFace(faceVisuel);
    } catch (e) {
      signalerErreur(e);
    }
  }

  function retirerVariante(id: string, faceVisuel: Face) {
    onVisuels((v) => {
      const reste = { ...v };
      delete reste[`variante-${id}-${faceVisuel}`];
      return reste;
    });
    onModele((m) => ({
      ...m,
      variantes: m.variantes && { ...m.variantes, valeurs: m.variantes.valeurs.map((v) => (v.id === id ? { ...v, [`fond_${faceVisuel}`]: null } : v)) },
    }));
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
      if (faceVisuel === "recto") {
        setTextesLus(null);
        setHistorique([]);
        // Un visuel sans texte lisible (image, PDF aplati, SVG aux textes vectorisés) : on lit ses textes.
        if (balises.length === 0 && visuel.textes.length === 0) setALire(true);
      }
    } catch (e) {
      signalerErreur(e);
    }
  }

  function retirer(faceVisuel: Face) {
    onVisuels((v) => {
      const reste = { ...v };
      delete reste[faceVisuel];
      delete reste[`${faceVisuel}_ecran`];
      return reste;
    });
    onModele((m) => ({
      ...m,
      [`fond_${faceVisuel}`]: null,
      // Sa version écran part avec lui.
      [`fond_${faceVisuel}_ecran`]: null,
      // Les zones effacées n'avaient de sens que sur ce visuel.
      champs: faceVisuel === "recto" ? m.champs.filter((c) => c.type !== "masque") : m.champs,
    }));
    setFace("recto");
    changerOutil("edition");
    if (faceVisuel === "recto") {
      setTextesLus(null);
      setHistorique([]);
    }
  }

  /** Version écran d'une face, ou calque de référence : ni informations à placer, ni textes à remplacer. */
  async function importerSecondaire(emplacement: Secondaire) {
    const chemin = await open({ multiple: false, directory: false, filters: [{ name: t.filtreVisuels, extensions: ["pdf", "svg", "png", "jpg", "jpeg"] }] });
    if (typeof chemin !== "string") return;
    try {
      const { visuel, svgNettoye } = preparerVisuel(await importerFond(chemin), polices);
      // Tirée du même fichier que celle de l'imprimeur, une version écran porte les mêmes balises :
      // elles sont retirées (celles d'un PDF le sont déjà par le cœur).
      if (svgNettoye) await remplacerFond(visuel.chemin, svgNettoye);
      onVisuels((v) => ({ ...v, [emplacement]: visuel }));
      onModele((m) => ({ ...m, [`fond_${emplacement}`]: visuel.chemin, [`fond_${emplacement}_avec_fond_perdu`]: contientFondPerdu(visuel, m.format) }));
      if (emplacement === "calque") {
        setCalqueVisible(true);
        setFace("recto");
      }
    } catch (e) {
      signalerErreur(e);
    }
  }

  function retirerSecondaire(emplacement: Secondaire) {
    onVisuels((v) => {
      const reste = { ...v };
      delete reste[emplacement];
      return reste;
    });
    onModele((m) => ({ ...m, [`fond_${emplacement}`]: null }));
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
      if (restants.length === 0 && !textesLus?.length) changerOutil("edition");
    });

  /**
   * Efface des zones du visuel du recto. Une image est reconstruite autour du texte (effacement
   * intelligent, annulable) ; un visuel vectoriel reçoit un aplat de la couleur qui entoure chaque zone.
   * Renvoie les aplats créés.
   */
  async function effacerZones(zones: Zone[]): Promise<ChampMasque[]> {
    const visuel = visuelsRecents.current.recto;
    if (visuel?.genre === "image") {
      const nouveau = await effacerTexte(modeleRecent.current, zones, visuel.nomFichier);
      setHistorique((h) => [...h, visuel]);
      onVisuels((v) => (v.recto ? { ...v, recto: { ...v.recto, chemin: nouveau.chemin, largeurPx: nouveau.largeurPx, hauteurPx: nouveau.hauteurPx } } : v));
      onModele((m) => ({ ...m, fond_recto: nouveau.chemin }));
      return [];
    }
    const masques: ChampMasque[] = [];
    for (const zone of zones) {
      const couleur = await couleurAutour(modeleRecent.current, zone);
      masques.push({ id: nouvelId([...modeleRecent.current.champs, ...masques]), type: "masque", ...zone, couleur: { rgb: couleur } });
    }
    onModele((m) => ({ ...m, champs: [...m.champs, ...masques] }));
    return masques;
  }

  /** Efface la zone tracée à la souris (outil « Effacer une zone »). */
  const effacer = (zone: Zone) =>
    uneSeuleFois(async () => {
      const [masque] = await effacerZones([zone]);
      if (masque) setSelection(masque.id);
    });

  /** Annule le dernier effacement intelligent : le visuel d'avant revient (les informations restent). */
  function annulerEffacement() {
    const precedent = historique[historique.length - 1];
    if (!precedent) return;
    setHistorique((h) => h.slice(0, -1));
    onVisuels((v) => ({ ...v, recto: precedent }));
    onModele((m) => ({ ...m, fond_recto: precedent.chemin }));
  }

  /** Un texte lu dans le visuel devient une information au même endroit ; le texte est effacé. */
  const remplacerLu = (texte: TexteLu, information: Information) =>
    uneSeuleFois(async () => {
      await effacerZones([texte.zone]);
      onModele((m) => {
        const champ = champDepuisTexteLu(texte, information.modele, m.format, m.champs, polices);
        return avecChamps(m, [{ ...champ, lignes_max: information.lignes_max ?? 1 }], information.transformations);
      });
      setTexteChoisi(null);
      const restants = (textesLus ?? []).filter((lu) => lu.id !== texte.id);
      setTextesLus(restants);
      if (restants.length === 0 && (recto?.textes.length ?? 0) === 0) changerOutil("edition");
    });

  const remplacer = (choix: Choix, information: Information) => (choix.genre === "lu" ? remplacerLu(choix.texte, information) : remplacerTexte(choix.texte, information));

  /**
   * Lit les textes du visuel du recto (reconnaissance de caractères de Windows). Les balises {{…}}
   * écrites dans l'image deviennent aussitôt des informations ; les autres textes sont proposés au
   * remplacement. Une lecture automatique échoue en silence (hors de Windows, langue sans module).
   */
  async function lireTextes(automatique = false) {
    if (occupe) return;
    setOccupe(true);
    setLecture(true);
    try {
      const lus = await reconnaitreTextes(modeleRecent.current);
      const balises = lus.flatMap((texte) => {
        const nom = baliseLue(texte.texte);
        return nom ? [{ texte, nom }] : [];
      });
      if (balises.length > 0) {
        await effacerZones(balises.map(({ texte }) => texte.zone));
        onModele((m) => {
          const nouveaux: ChampTexte[] = [];
          for (const { texte, nom } of balises) nouveaux.push(champDepuisTexteLu(texte, `{{${nom}}}`, m.format, [...m.champs, ...nouveaux], polices));
          return avecChamps(m, nouveaux);
        });
        notifications.show({ color: "teal", icon: <IconSparkles size={18} />, title: visuelsRecents.current.recto?.nomFichier, message: t.balisesDetectees(balises.length) });
      }
      const exemples = lus.filter((texte) => !baliseLue(texte.texte));
      setTextesLus(exemples);
      if (exemples.length > 0) {
        setOutil("remplacer");
        setTexteChoisi(null);
        setSelection(null);
      }
    } catch (e) {
      if (!automatique) signalerErreur(e);
    } finally {
      setLecture(false);
      setOccupe(false);
    }
  }

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
      {avecDemo && !verrouille && (
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
          {avecOutils && !verrouille && (
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
          {modele.variantes && modele.variantes.valeurs.length > 0 && (
            <Select
              size="xs"
              w={320}
              label={t.variantes.apercu}
              value={rangApercu >= 0 ? varianteApercu : MODELE}
              allowDeselect={false}
              data={[
                { value: MODELE, label: t.variantes.modele },
                ...modele.variantes.valeurs.map((v, rang) => ({ value: v.id, label: v.valeur.trim() || t.variantes.nommee(rang + 1) })),
              ]}
              onChange={(valeur) => valeur && setVarianteApercu(valeur)}
            />
          )}
          <ApercuCarte modele={modele} agent={agent} face={faceAffichee}>
            {faceAffichee === "recto" && !verrouille && modele.fond_calque && calqueVisible && <CalqueReference modele={modele} opacite={opaciteCalque} />}
            {faceAffichee === "recto" && !verrouille && (
              <CoucheEdition
                modele={modele}
                selection={selection}
                outil={outilActif}
                textesVisuel={textesCliquables}
                onSelection={setSelection}
                onChamp={modifierChamp}
                onSupprimer={supprimerChamp}
                onZone={effacer}
                onTexteVisuel={(id) => {
                  const lu = id < 0 ? textesLus?.find((texte) => texte.id === -1 - id) : undefined;
                  const duVisuel = id >= 0 ? recto?.textes.find((texte) => texte.id === id) : undefined;
                  setTexteChoisi(lu ? { genre: "lu", texte: lu } : duVisuel ? { genre: "visuel", texte: duVisuel } : null);
                }}
              />
            )}
          </ApercuCarte>
          {!verrouille && faceAffichee === "recto" && modele.fond_recto && (historique.length > 0 || (outilActif === "remplacer" && textesLus === null && !recto?.textes.length)) && (
            <Group gap="xs">
              {outilActif === "remplacer" && textesLus === null && !recto?.textes.length && (
                <Button size="compact-xs" variant="light" leftSection={<IconScan size={14} />} loading={lecture} onClick={() => lireTextes()}>
                  {t.lireTextes}
                </Button>
              )}
              {historique.length > 0 && (
                <Button size="compact-xs" variant="subtle" leftSection={<IconArrowBackUp size={14} />} disabled={occupe} onClick={annulerEffacement}>
                  {t.annulerEffacement}
                </Button>
              )}
            </Group>
          )}
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {aide}
            </Text>
            {aUnVerso(modele) && (
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
          {verrouille ? (
            <Stack gap="md">
              <BandeauVerrou onDeverrouiller={() => onDeverrouiller?.()} />
              <RecapitulatifModele modele={modele} visuels={visuels} />
            </Stack>
          ) : (
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
                    <Button size="compact-sm" variant="light" leftSection={<IconUser size={14} />} onClick={ajouterPhoto}>
                      {t.ajouterPhoto}
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
                    <Title order={5}>{t.remplacerPar(texteChoisi.texte.texte)}</Title>
                    <Group gap={6}>
                      {INFORMATIONS.map((information) => (
                        <Button key={information.libelle} size="compact-sm" variant="light" disabled={occupe} onClick={() => remplacer(texteChoisi, information)}>
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
                  <>
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
                    onImporterSecondaire={importerSecondaire}
                    onRetirerSecondaire={retirerSecondaire}
                    calque={{ visible: calqueVisible, opacite: opaciteCalque, onVisible: setCalqueVisible, onOpacite: setOpaciteCalque }}
                  />
                  <PanneauVariantes
                    variantes={modele.variantes}
                    faces={modele.format.px ? ["recto"] : ["recto", "verso"]}
                    visuels={visuels}
                    onVariantes={(modification) => onModele((m) => ({ ...m, variantes: modification(m.variantes) }))}
                    onImporter={importerVariante}
                    onRetirer={retirerVariante}
                  />
                  </>
                )
              )}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Group>
    </Stack>
  );
}
