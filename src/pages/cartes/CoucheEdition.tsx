import { useRef, type KeyboardEvent, type PointerEvent as PointerEventReact } from "react";
import { Box } from "@mantine/core";
import { arrondir, boiteChamp } from "../../modele/champs";
import type { Champ, ModeleCarte } from "../../moteur";
import { COULEURS } from "../../theme";

type Geste = "deplacer" | "largeur" | "taille";

interface Props {
  modele: ModeleCarte;
  selection: string | null;
  onSelection: (id: string | null) => void;
  onChamp: (id: string, modifications: Partial<Champ>) => void;
  onSupprimer: (id: string) => void;
}

/** Marge de sécurité : les textes restent à 3 mm au moins du bord de coupe. */
const MARGE_SECURITE = 3;

/** Nouvelle géométrie d'un champ après un geste de (dx, dy) mm depuis son état de départ. */
function appliquerGeste(champ: Champ, geste: Geste, dx: number, dy: number, largeurCarte: number): Partial<Champ> {
  if (geste === "deplacer") {
    const deplace = { x_mm: arrondir(champ.x_mm + dx), y_mm: arrondir(champ.y_mm + dy) };
    // Un texte aligné à gauche que l'on rapproche du bord droit voit sa largeur se resserrer.
    if (champ.type !== "texte" || champ.ancre !== "start") return deplace;
    const disponible = largeurCarte - MARGE_SECURITE - deplace.x_mm;
    return { ...deplace, largeur_max_mm: arrondir(Math.max(10, Math.min(champ.largeur_max_mm, disponible))) };
  }
  if (champ.type === "qr") return { taille_mm: arrondir(Math.max(8, champ.taille_mm + Math.max(dx, dy))) };
  // La poignée suit le bord droit : un texte centré s'élargit des deux côtés, un texte aligné à droite se décale.
  if (champ.ancre === "end") return { largeur_max_mm: arrondir(Math.max(10, champ.largeur_max_mm + dx)), x_mm: arrondir(champ.x_mm + dx) };
  const facteur = champ.ancre === "middle" ? 2 : 1;
  return { largeur_max_mm: arrondir(Math.max(10, champ.largeur_max_mm + dx * facteur)) };
}

const PAS_CLAVIER: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Couche posée sur l'aperçu : chaque information est un cadre que l'on déplace à la souris. */
export default function CoucheEdition({ modele, selection, onSelection, onChamp, onSupprimer }: Props) {
  const couche = useRef<HTMLDivElement>(null);
  const { largeur_mm, hauteur_mm } = modele.format;

  function commencer(evenement: PointerEventReact, champ: Champ, geste: Geste) {
    evenement.preventDefault();
    evenement.stopPropagation();
    onSelection(champ.id);
    couche.current?.focus();
    const mmParPx = largeur_mm / (couche.current?.getBoundingClientRect().width || 1);
    const depart = { x: evenement.clientX, y: evenement.clientY };
    const bouger = (e: PointerEvent) =>
      onChamp(champ.id, appliquerGeste(champ, geste, (e.clientX - depart.x) * mmParPx, (e.clientY - depart.y) * mmParPx, largeur_mm));
    const finir = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", finir);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", finir);
  }

  function clavier(evenement: KeyboardEvent) {
    const champ = modele.champs.find((c) => c.id === selection);
    if (!champ) return;
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
    <Box ref={couche} tabIndex={0} onKeyDown={clavier} onPointerDown={() => onSelection(null)} pos="absolute" inset={0} style={{ outline: "none", touchAction: "none" }}>
      {modele.champs.map((champ) => {
        const boite = boiteChamp(champ);
        const choisi = champ.id === selection;
        return (
          <Box
            key={champ.id}
            data-champ={champ.id}
            onPointerDown={(e) => commencer(e, champ, "deplacer")}
            pos="absolute"
            style={{
              left: `${(boite.x / largeur_mm) * 100}%`,
              top: `${(boite.y / hauteur_mm) * 100}%`,
              width: `${(boite.largeur / largeur_mm) * 100}%`,
              height: `${(boite.hauteur / hauteur_mm) * 100}%`,
              border: choisi ? `1.5px solid ${COULEURS.eau}` : "1px dashed rgba(30, 110, 114, 0.6)",
              background: choisi ? "rgba(30, 110, 114, 0.08)" : "transparent",
              borderRadius: 2,
              cursor: "move",
            }}
          >
            {choisi && (
              <Box
                data-poignee
                onPointerDown={(e) => commencer(e, champ, champ.type === "qr" ? "taille" : "largeur")}
                pos="absolute"
                style={{
                  right: -6,
                  ...(champ.type === "qr" ? { bottom: -6 } : { top: "50%", marginTop: -6 }),
                  width: 12,
                  height: 12,
                  background: COULEURS.eau,
                  border: "2px solid white",
                  borderRadius: 3,
                  cursor: champ.type === "qr" ? "nwse-resize" : "ew-resize",
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
