import { useState } from "react";
import { Badge, Button, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconFolderPlus } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { ecrireFichiers, type FichierAEcrire } from "../../moteur";
import { emailAgent, nomAgent } from "../../signatures/agents";
import { genererSignature, texteSignature } from "../../signatures/html";
import { preparerLogo } from "../../signatures/logo";
import type { ModeleSignature } from "../../signatures/modele";
import { nomsDeFichiers, pageAgent, pageRecapitulatif } from "../../signatures/pages";
import { textes } from "../../textes";
import { signalerErreur } from "../commun/signalerErreur";
import type { AgentSignature } from "./EtapeVerificationSignatures";

const t = textes.signatures.destination;
const FICHIER_LOGO = "logo.png";

/** Octets d'une image intégrée (data:image/png;base64,…). */
function octetsDe(dataUrl: string): number[] {
  const binaire = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}

export default function EtapeDestinationSignatures({ modele, agents }: { modele: ModeleSignature; agents: AgentSignature[] }) {
  const [enCours, setEnCours] = useState(false);
  const logo = modele.source === "mise-en-page" ? modele.logo : null;

  async function creer() {
    const dossier = await open({ directory: true, multiple: false, title: t.choisirDossier });
    if (typeof dossier !== "string") return;
    setEnCours(true);
    try {
      const noms = agents.map((agent) => nomAgent(modele, agent.valeurs));
      const pages = nomsDeFichiers(noms);
      const fichiers: FichierAEcrire[] = agents.map((agent, i) => {
        const html = genererSignature(modele, agent.valeurs);
        const gmail = genererSignature(modele, agent.valeurs, { sansLogo: true });
        return {
          nom: pages[i],
          texte: pageAgent({
            nom: noms[i],
            html,
            htmlGmail: gmail !== html ? gmail : null,
            texte: texteSignature(modele, agent.valeurs),
            fichierLogo: logo ? FICHIER_LOGO : null,
          }),
        };
      });
      const recapitulatif = agents.map((agent, i) => ({ nom: noms[i], fichier: pages[i], email: emailAgent(agent.valeurs) }));
      fichiers.push({ nom: t.recapitulatif, texte: pageRecapitulatif(modele.nom, recapitulatif, logo ? FICHIER_LOGO : null) });
      if (logo) {
        // Pour Gmail, le logo à sa taille d'affichage (Gmail montre l'image à sa taille réelle).
        const simple = await preparerLogo(logo.source ?? logo.donnees, logo.largeur / 2, logo.nomFichier);
        fichiers.push({ nom: FICHIER_LOGO, octets: octetsDe(simple.donnees) });
      }
      const chemin = await ecrireFichiers(dossier, t.nomDossier(modele.nom), fichiers);
      notifications.show({ color: "teal", icon: <IconCheck size={18} />, title: t.cree, message: chemin, autoClose: 10000 });
    } catch (e) {
      signalerErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Paper withBorder p="lg" maw={520}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={5}>{t.titre}</Title>
          <Badge variant="light">{t.resume(agents.length)}</Badge>
        </Group>
        <Text size="sm">{t.detail}</Text>
        <List size="sm" spacing={4}>
          <List.Item>{t.nomDossier(modele.nom)}/</List.Item>
          <List.Item ml="md">{t.recapitulatif}</List.Item>
          <List.Item ml="md">{nomsDeFichiers([nomAgent(modele, agents[0]?.valeurs ?? {})])[0]} …</List.Item>
          {logo && <List.Item ml="md">{FICHIER_LOGO}</List.Item>}
        </List>
        {logo && (
          <Text size="sm" c="dimmed">
            {t.logo}
          </Text>
        )}
        <Button leftSection={<IconFolderPlus size={18} />} loading={enCours} disabled={agents.length === 0} onClick={creer}>
          {t.creer}
        </Button>
      </Stack>
    </Paper>
  );
}
