import { useEffect, useRef, useState } from "react";
import { ActionIcon, AppShell, Box, Button, Divider, Group, Loader, Modal, NavLink, Paper, Stack, Text, ThemeIcon, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileUpload, IconHome, IconInfoCircle } from "@tabler/icons-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import Accueil from "./Accueil";
import APropos from "./APropos";
import { nomDe } from "./donnees/chemins";
import { router } from "./donnees/fichiersDeposes";
import { MODULE_DU_DOCUMENT, MODULES, type Module } from "./modules";
import AssistantCartes from "./pages/cartes/AssistantCartes";
import type { Commande, Demande } from "./pages/commun/commande";
import { choisirProjet } from "./pages/commun/projet";
import AssistantSignatures from "./pages/signatures/AssistantSignatures";
import AssistantWord from "./pages/word/AssistantWord";
import { infosMoteur, type InfosMoteur } from "./moteur";
import { textes } from "./textes";
import { COULEURS } from "./theme";

/** Ce qui est affiché : l'accueil, ou un module. */
type Vue = Module | "accueil";

export default function App() {
  const [infos, setInfos] = useState<InfosMoteur | null>(null);
  const [pret, setPret] = useState(false);
  const [aProposOuvert, aPropos] = useDisclosure(false);
  const [vue, setVue] = useState<Vue>("accueil");
  // Dernière demande faite à chaque module (essayer l'exemple, rouvrir un projet…).
  const [commandes, setCommandes] = useState<Partial<Record<Module, Commande>>>({});
  const numero = useRef(0);
  // Un fichier survole la fenêtre ; fichiers déposés dont il faut demander à quel document ils servent.
  const [survol, setSurvol] = useState(false);
  const [aRepartir, setARepartir] = useState<{ modules: Module[]; chemins: string[] } | null>(null);
  // La vue affichée, lue par l'écoute des dépôts (installée une seule fois).
  const vueActuelle = useRef<Vue>("accueil");
  useEffect(() => {
    vueActuelle.current = vue;
  }, [vue]);

  useEffect(() => {
    infosMoteur().then(
      (lues) => {
        setInfos(lues);
        setPret(true);
      },
      () => setPret(true),
    );
  }, []);

  /** Affiche le module et lui confie la demande. */
  function confier(module: Module, demande: Demande) {
    numero.current += 1;
    const commande: Commande = { ...demande, id: numero.current };
    setCommandes((actuelles) => ({ ...actuelles, [module]: commande }));
    setVue(module);
  }

  /** Un projet s'ouvre toujours dans son module, d'où qu'on le choisisse (ou qu'on le dépose). */
  async function ouvrirProjet(chemin?: string) {
    const projet = await choisirProjet(chemin);
    if (projet) confier(MODULE_DU_DOCUMENT[projet.document], { type: "projet", projet });
  }

  /** Fichiers glissés dans la fenêtre : chacun va au module qui sait s'en servir. */
  const recevoir = useRef<(chemins: string[]) => void>(() => undefined);
  useEffect(() => {
    recevoir.current = (chemins: string[]) => {
      const routage = router(chemins, vueActuelle.current);
      if (routage.genre === "projet") void ouvrirProjet(routage.chemin);
      else if (routage.genre === "module") confier(routage.module, { type: "fichiers", chemins: routage.chemins });
      else if (routage.genre === "choix") setARepartir({ modules: routage.modules, chemins: routage.chemins });
      else notifications.show({ color: "orange", title: textes.depot.inconnuTitre, message: textes.depot.inconnu, autoClose: 15000 });
    };
  });

  useEffect(() => {
    const arret = getCurrentWebview().onDragDropEvent((evenement) => {
      const { type } = evenement.payload;
      if (type === "enter" || type === "over") setSurvol(true);
      else if (type === "leave") setSurvol(false);
      else {
        setSurvol(false);
        if (evenement.payload.paths.length > 0) recevoir.current(evenement.payload.paths);
      }
    });
    return () => {
      void arret.then((arreter) => arreter());
    };
  }, []);

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 300, breakpoint: 0 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <UnstyledButton onClick={() => setVue("accueil")} aria-label={textes.accueil.titre}>
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color={COULEURS.encre}>
                <Text fw={800} size="sm" c={COULEURS.sec}>
                  AP
                </Text>
              </ThemeIcon>
              <Title order={4}>{textes.application}</Title>
            </Group>
          </UnstyledButton>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {textes.parEditeur}
            </Text>
            <Tooltip label={textes.aPropos.bouton}>
              <ActionIcon variant="subtle" color="gray" aria-label={textes.aPropos.bouton} onClick={aPropos.open}>
                <IconInfoCircle size={20} stroke={1.6} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Stack gap={4} style={{ flex: 1 }}>
          <NavLink
            label={textes.accueil.titre}
            leftSection={<IconHome size={20} stroke={1.6} />}
            active={vue === "accueil"}
            onClick={() => setVue("accueil")}
          />
          <Divider my={4} />
          {MODULES.map(({ cle, icone: Icone }) => (
            <NavLink
              key={cle}
              label={textes.modules[cle].titre}
              description={textes.modules[cle].description}
              leftSection={<Icone size={20} stroke={1.6} />}
              active={cle === vue}
              onClick={() => setVue(cle)}
            />
          ))}
        </Stack>
        {!pret && (
          <Group gap="xs" px="xs" py="sm" wrap="nowrap">
            <Loader size={14} />
            <Text size="xs" c="dimmed">
              {textes.moteur.preparation}
            </Text>
          </Group>
        )}
      </AppShell.Navbar>

      {/* Les assistants restent montés : on retrouve son travail en changeant de module. */}
      <AppShell.Main>
        <Box display={vue === "accueil" ? undefined : "none"}>
          <Accueil onCommencer={setVue} onEssayer={(module) => confier(module, { type: "exemple" })} onReprendre={() => void ouvrirProjet()} />
        </Box>
        <Box display={vue === "cartes" ? undefined : "none"}>
          <AssistantCartes commande={commandes.cartes} onOuvrirProjet={() => void ouvrirProjet()} />
        </Box>
        <Box display={vue === "numerique" ? undefined : "none"}>
          <AssistantCartes variante="ecran" commande={commandes.numerique} onOuvrirProjet={() => void ouvrirProjet()} />
        </Box>
        <Box display={vue === "signatures" ? undefined : "none"}>
          <AssistantSignatures commande={commandes.signatures} onOuvrirProjet={() => void ouvrirProjet()} />
        </Box>
        <Box display={vue === "word" ? undefined : "none"}>
          <AssistantWord commande={commandes.word} onOuvrirProjet={() => void ouvrirProjet()} />
        </Box>
      </AppShell.Main>

      {/* Voile pendant qu'un fichier survole la fenêtre : on sait qu'on peut le lâcher. */}
      {survol && (
        <Box
          data-voile-depot
          style={{ position: "fixed", inset: 0, zIndex: 400, pointerEvents: "none", background: "rgba(30, 110, 114, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Paper p="xl" withBorder shadow="md" style={{ borderStyle: "dashed", borderWidth: 2, borderColor: "var(--mantine-color-eau-6)" }}>
            <Stack align="center" gap="xs" maw={420}>
              <IconFileUpload size={40} stroke={1.5} color="var(--mantine-color-eau-6)" />
              <Title order={3}>{textes.depot.invite}</Title>
              <Text size="sm" ta="center">
                {textes.depot.detail}
              </Text>
            </Stack>
          </Paper>
        </Box>
      )}

      <Modal opened={aRepartir !== null} onClose={() => setARepartir(null)} title={textes.depot.choixTitre} centered>
        <Stack gap="sm">
          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
            {aRepartir ? textes.depot.choix(aRepartir.chemins.map(nomDe).join(", ")) : ""}
          </Text>
          {aRepartir?.modules.map((cle) => {
            const Icone = MODULES.find((module) => module.cle === cle)?.icone ?? IconHome;
            return (
              <Button
                key={cle}
                variant="light"
                justify="flex-start"
                leftSection={<Icone size={18} />}
                onClick={() => {
                  confier(cle, { type: "fichiers", chemins: aRepartir.chemins });
                  setARepartir(null);
                }}
              >
                {textes.modules[cle].titre}
              </Button>
            );
          })}
          <Button variant="default" onClick={() => setARepartir(null)}>
            {textes.depot.annuler}
          </Button>
        </Stack>
      </Modal>

      <APropos ouvert={aProposOuvert} fermer={aPropos.close} versionTypst={infos?.versionTypst} />
    </AppShell>
  );
}
