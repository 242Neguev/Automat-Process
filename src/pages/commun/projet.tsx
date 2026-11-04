import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconDeviceFloppy, IconFolderOpen } from "@tabler/icons-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { enregistrerProjet, ouvrirProjet, type Document, type ProjetOuvert } from "../../moteur";
import { textes } from "../../textes";
import { signalerErreur } from "./signalerErreur";
import { BoutonVerrou } from "./verrou";

const t = textes.projet;
const FILTRE = [{ name: t.filtre, extensions: ["automat"] }];

/** Enregistre un projet sous le nom de son modèle ; les données des agents n'y sont jamais copiées. */
export async function enregistrerSous(document: Document, nom: string, modele: unknown, correspondances: Record<string, string | null>, visuels: unknown = {}) {
  const propre = nom.replace(/[\\/:*?"<>|]/g, "-").trim() || t.nomParDefaut[document];
  const chemin = await save({ defaultPath: `${propre}.automat`, filters: FILTRE });
  if (!chemin) return;
  try {
    await enregistrerProjet(chemin, document, modele, correspondances, visuels);
    notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.enregistre, message: chemin });
  } catch (e) {
    signalerErreur(e);
  }
}

/** Ouvre un projet de la sorte attendue (un projet d'un autre module est refusé avec un message clair). */
export async function choisirProjet(document: Document): Promise<ProjetOuvert | null> {
  const chemin = await open({ multiple: false, directory: false, filters: FILTRE });
  if (typeof chemin !== "string") return null;
  try {
    const projet = await ouvrirProjet(chemin);
    if (projet.document !== document) throw new Error(t.autreModule[projet.document] ?? t.autreModule.carte);
    return projet;
  } catch (e) {
    signalerErreur(e);
    return null;
  }
}

export const projetOuvert = (nom: string) =>
  notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.ouvert, message: nom });

/**
 * Boutons de l'en-tête d'un assistant : « Ouvrir un projet… », « Enregistrer le projet… » et, si
 * `verrou` est donné, le verrou du modèle (mode opérateur).
 */
export function BoutonsProjet({
  onOuvrir,
  onEnregistrer,
  enregistrable = true,
  verrou,
}: {
  onOuvrir: () => void;
  onEnregistrer: () => void;
  enregistrable?: boolean;
  verrou?: { verrouille: boolean; onChange: (verrouille: boolean) => void };
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      {verrou && <BoutonVerrou verrouille={verrou.verrouille} onChange={verrou.onChange} />}
      <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={onOuvrir}>
        {t.ouvrir}
      </Button>
      <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} disabled={!enregistrable} onClick={onEnregistrer}>
        {t.enregistrer}
      </Button>
    </Group>
  );
}
