import { useRef, useState, type KeyboardEvent, type PointerEvent as PointerEventReact } from "react";
import { Box, Tooltip } from "@mantine/core";
import { arrondir, boiteChamp } from "../../modele/champs";
import { MARGE_SECURITE_MM, zonePersonne } from "../../modele/formats";
import { aimanter, SEUIL_PX, type Repere } from "../../modele/reperes";
import type { Champ, ModeleCarte, Zone } from "../../moteur";
import { textes } from "../../textes";
import { COULEURS } from "../../theme";

type Geste = "deplacer" | "largeur" | "taille";

/** Édition des champs, tracé d'une zone à effacer, ou choix d'un texte d'exemple à remplacer. */
export type Outil = "edition" | "effacer" | "remplacer";

/** Texte du visuel que l'on peut remplacer, avec son cadre sur la carte finie (mm). */
export interface TexteCliquable {
  id: number;
  texte: string;
  boite: { x: number; y: number; largeur: number; hauteur: number };
}

interface Props {
  modele: ModeleCarte;
  selection: string | null;
  outil: Outil;
  textesVisuel: TexteCliquable[];
  onSelection: (id: string | null) => void;
  onChamp: (id: string, modifications: Partial<Champ>) => void;
  onSupprimer: (id: string) => void;
  onZone: (zone: Zone) => void;
  onTexteVisuel: (id: number) => void;
}

/** Nouvelle géométrie d'un champ après un geste de (dx, dy) mm depuis son état de départ. */
function appliquerGeste(champ: Champ, geste: Geste, dx: number, dy: number, largeurCarte: number): Partial<Champ> {
  if (geste === "deplacer") {
    const deplace = { x_mm: arrondir(champ.x_mm + dx), y_mm: arrondir(champ.y_mm + dy) };
    // Un texte aligné à gauche que l'on rapproche du bord droit voit sa largeur se resserrer.
    if (champ.type !== "texte" || champ.ancre !== "start") return deplace;
    const disponible = largeurCarte - MARGE_SECURITE_MM - deplace.x_mm;
    return { ...deplace, largeur_max_mm: arrondir(Math.max(10, Math.min(champ.largeur_max_mm, disponible))) };
  }
  if (champ.type === "qr") return { taille_mm: arrondir(Math.max(8, champ.taille_mm + Math.max(dx, dy))) };
  if (champ.type === "masque") return { largeur_mm: arrondir(Math.max(1, champ.largeur_mm + dx)), hauteur_mm: arrondir(Math.max(1, champ.hauteur_mm + dy)) };
  // La poignée suit le bord droit : un texte centré s'élargit des deux côtés, un texte aligné à droite se décale.
  if (champ.ancre === "end") return { largeur_max_mm: arrondir(Math.max(10, champ.largeur_max_mm + dx)), x_mm: arrondir(champ.x_mm + dx) };
  const facteur = champ.ancre === "middle" ? 2 : 1;
  return { largeur_max_mm: arrondir(Math.max(10, champ.largeur_max_mm + dx * facteur)) };
}

const PAS_CLAVIER: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** Couleur des repères magnétiques : bien visible sur la plupart des visuels. */
const COULEUR_REPERE = "#d6336c";

const enPourcents = (boite: { x: number; y: number; largeur: number; hauteur: number }, largeur: number, hauteur: number) => ({
  left: `${(boite.x / largeur) * 100}%`,
  top: `${(boite.y / hauteur) * 100}%`,
  width: `${(boite.largeur / largeur) * 100}%`,
  height: `${(boite.hauteur / hauteur) * 100}%`,
});

/** Couche posée sur l'aperçu : on y déplace les informations, on y trace les zones à effacer. */
export default function CoucheEdition({ modele, selection, outil, textesVisuel, onSelection, onChamp, onSupprimer, onZone, onTexteVisuel }: Props) {
  const couche = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState<Zone | null>(null);
  const [reperes, setReperes] = useState<Repere[]>([]);
  const { largeur_mm, hauteur_mm } = modele.format;
  const zone = zonePersonne(modele.format);
  // Les zones effacées passent dessous : une information posée par-dessus reste facile à attraper.
  const champs = [...modele.champs.filter((c) => c.type === "masque"), ...modele.champs.filter((c) => c.type !== "masque")];
  const mmParPx = () => largeur_mm / (couche.current?.getBoundingClientRect().width || 1);
  const enMm = (e: { clientX: number; clientY: number }) => {
    const rect = couche.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * mmParPx(), y: (e.clientY - rect.top) * mmParPx() };
  };

  function commencer(evenement: PointerEventReact, champ: Champ, geste: Geste) {
    evenement.preventDefault();
    evenement.stopPropagation();
    onSelection(champ.id);
    couche.current?.focus();
    const echelle = mmParPx();
    const depart = { x: evenement.clientX, y: evenement.clientY };
    const autres = modele.champs.filter((c) => c.id !== champ.id);
    const bouger = (e: PointerEvent) => {
      let dx = (e.clientX - depart.x) * echelle;
      let dy = (e.clientY - depart.y) * echelle;
      // Repères magnétiques pendant un déplacement ; la touche Alt permet de placer librement.
      if (geste === "deplacer" && !e.altKey) {
        const aimante = aimanter(champ, dx, dy, autres, modele.format, SEUIL_PX * echelle);
        ({ dx, dy } = aimante);
        setReperes(aimante.reperes);
      } else {
        setReperes([]);
      }
      onChamp(champ.id, appliquerGeste(champ, geste, dx, dy, largeur_mm));
    };
    const finir = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", finir);
      setReperes([]);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", finir);
  }

  /** Outil « effacer » : on trace à la souris le rectangle à recouvrir. */
  function tracer(evenement: PointerEventReact) {
    evenement.preventDefault();
    const depart = enMm(evenement);
    const zone = (e: PointerEvent) => {
      const point = enMm(e);
      return {
        x_mm: arrondir(Math.min(depart.x, point.x)),
        y_mm: arrondir(Math.min(depart.y, point.y)),
        largeur_mm: arrondir(Math.abs(point.x - depart.x)),
        hauteur_mm: arrondir(Math.abs(point.y - depart.y)),
      };
    };
    const bouger = (e: PointerEvent) => setTrace(zone(e));
    const finir = (e: PointerEvent) => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", finir);
      setTrace(null);
      const finale = zone(e);
      if (finale.largeur_mm >= 0.5 && finale.hauteur_mm >= 0.5) onZone(finale);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", finir);
  }

  function clavier(evenement: KeyboardEvent) {
    const champ = modele.champs.find((c) => c.id === selection);
    if (!champ || outil !== "edition") return;
    if (evenement.key === "Delete" || evenement.key === "Backspace") {
      evenement.preventDefault();
      onSupprimer(champ.id);
      return;
    }
    const pas = PAS_CLAVIER[evenement.key];
    if (!pas) return;
    evenement.preventDefault();
    const longueur = evenement.shiftKey ? 1 : 0.2; // mm
    onChamp(champ.id, { x_mm: arrondir(champ.x_mm + pas[0] * longueur), y_mm: arrondir(champ.y_mm + pas[1] * longueur) });
  }

  return (
    <Box
      ref={couche}
      data-couche
      tabIndex={0}
      onKeyDown={clavier}
      onPointerDown={outil === "effacer" ? tracer : () => onSelection(null)}
      pos="absolute"
      inset={0}
      style={{ outline: "none", touchAction: "none", cursor: outil === "effacer" ? "crosshair" : "default" }}
    >
      {/* Zone de sécurité : les textes restent à l'intérieur, la coupe n'est jamais parfaite (pas à l'écran). */}
      {!modele.format.px && (
        <Box
          data-zone-securite
          pos="absolute"
          style={{
            ...enPourcents(
              { x: MARGE_SECURITE_MM, y: MARGE_SECURITE_MM, largeur: largeur_mm - 2 * MARGE_SECURITE_MM, hauteur: hauteur_mm - 2 * MARGE_SECURITE_MM },
              largeur_mm,
              hauteur_mm,
            ),
            border: "1px dashed rgba(34, 37, 42, 0.35)",
            pointerEvents: "none",
          }}
        />
      )}
      {/* Fond Teams ou Zoom : la personne cache le centre de l'image. */}
      {zone && (
        <Box
          data-zone-personne
          pos="absolute"
          style={{
            ...enPourcents(zone, largeur_mm, hauteur_mm),
            border: "1.5px dashed rgba(201, 42, 42, 0.5)",
            background: "rgba(201, 42, 42, 0.06)",
            borderRadius: "40% 40% 0 0",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(201, 42, 42, 0.8)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {textes.ecran.zonePersonne}
        </Box>
      )}
      {champs.map((champ) => {
        const choisi = champ.id === selection && outil === "edition";
        return (
          <Box
            key={champ.id}
            data-champ={champ.id}
            onPointerDown={(e) => commencer(e, champ, "deplacer")}
            pos="absolute"
            style={{
              ...enPourcents(boiteChamp(champ), largeur_mm, hauteur_mm),
              border: choisi ? `1.5px solid ${COULEURS.eau}` : "1px dashed rgba(30, 110, 114, 0.6)",
              background: choisi ? "rgba(30, 110, 114, 0.08)" : "transparent",
              borderRadius: 2,
              cursor: "move",
              // Pendant le tracé d'une zone ou le choix d'un texte, les champs ne captent pas la souris.
              pointerEvents: outil === "edition" ? "auto" : "none",
              opacity: outil === "edition" ? 1 : 0.4,
            }}
          >
            {choisi && (
              <Box
                data-poignee
                onPointerDown={(e) => commencer(e, champ, champ.type === "texte" ? "largeur" : "taille")}
                pos="absolute"
                style={{
                  right: -6,
                  ...(champ.type === "texte" ? { top: "50%", marginTop: -6 } : { bottom: -6 }),
                  width: 12,
                  height: 12,
                  background: COULEURS.eau,
                  border: "2px solid white",
                  borderRadius: 3,
                  cursor: champ.type === "texte" ? "ew-resize" : "nwse-resize",
                }}
              />
            )}
          </Box>
        );
      })}

      {outil === "remplacer" &&
        textesVisuel.map((texte) => (
          <Tooltip key={texte.id} label={texte.texte} withArrow>
            <Box
              data-texte-visuel={texte.id}
              role="button"
              aria-label={texte.texte}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTexteVisuel(texte.id);
              }}
              pos="absolute"
              style={{
                ...enPourcents(texte.boite, largeur_mm, hauteur_mm),
                border: "1.5px dashed #e8590c",
                background: "rgba(232, 89, 12, 0.08)",
                borderRadius: 2,
                cursor: "pointer",
              }}
            />
          </Tooltip>
        ))}

      {trace && (
        <Box
          pos="absolute"
          style={{
            ...enPourcents({ x: trace.x_mm, y: trace.y_mm, largeur: trace.largeur_mm, hauteur: trace.hauteur_mm }, largeur_mm, hauteur_mm),
            border: "1.5px dashed #c92a2a",
            background: "rgba(201, 42, 42, 0.12)",
          }}
        />
      )}

      {/* Repères magnétiques : la ligne sur laquelle l'information vient de s'aligner. */}
      {reperes.map((repere) => (
        <Box
          key={`${repere.axe}:${repere.position}`}
          data-repere={repere.axe}
          pos="absolute"
          style={{
            ...(repere.axe === "x"
              ? { left: `${(repere.position / largeur_mm) * 100}%`, top: 0, bottom: 0, borderLeft: `1px solid ${COULEUR_REPERE}` }
              : { top: `${(repere.position / hauteur_mm) * 100}%`, left: 0, right: 0, borderTop: `1px solid ${COULEUR_REPERE}` }),
            pointerEvents: "none",
          }}
        />
      ))}
    </Box>
  );
}
