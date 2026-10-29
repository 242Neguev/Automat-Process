import { useEffect, useState } from "react";
import { ActionIcon, AppShell, Badge, Box, Group, Loader, NavLink, Stack, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCpu, IconDeviceMobile, IconFiles, IconFileTypeDocx, IconId, IconInfoCircle, IconMail } from "@tabler/icons-react";
import APropos from "./APropos";
import AssistantCartes from "./pages/cartes/AssistantCartes";
import OutilsPdf from "./pages/pdf/OutilsPdf";
import AssistantWord from "./pages/word/AssistantWord";
import AssistantSignatures from "./pages/signatures/AssistantSignatures";
import { infosMoteur, type InfosMoteur } from "./moteur";
import { textes } from "./textes";
import { COULEURS } from "./theme";

const MODULES = [
  { cle: "cartes", icone: IconId, disponible: true },
  { cle: "signatures", icone: IconMail, disponible: true },
  { cle: "numerique", icone: IconDeviceMobile, disponible: false },
  { cle: "word", icone: IconFileTypeDocx, disponible: true },
  { cle: "pdf", icone: IconFiles, disponible: true },
] as const;
type Module = (typeof MODULES)[number]["cle"];

export default function App() {
  const [infos, setInfos] = useState<InfosMoteur | null>(null);
  const [aProposOuvert, aPropos] = useDisclosure(false);
  const [module, setModule] = useState<Module>("cartes");

  useEffect(() => {
    infosMoteur().then(setInfos, () => setInfos(null));
  }, []);

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 300, breakpoint: 0 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" color={COULEURS.encre}>
              <Text fw={800} size="sm" c={COULEURS.sec}>
                AP
              </Text>
            </ThemeIcon>
            <Title order={4}>{textes.application}</Title>
          </Group>
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
          {MODULES.map(({ cle, icone: Icone, disponible }) => (
            <NavLink
              key={cle}
              label={textes.modules[cle].titre}
              description={textes.modules[cle].description}
              leftSection={<Icone size={20} stroke={1.6} />}
              rightSection={
                disponible ? null : (
                  <Badge size="xs" variant="light" color="gray">
                    {textes.modules.bientot}
                  </Badge>
                )
              }
              active={cle === module}
              disabled={!disponible}
              onClick={() => setModule(cle)}
            />
          ))}
        </Stack>
        <Group gap="xs" px="xs" py="sm" wrap="nowrap">
          {infos ? <IconCpu size={16} stroke={1.6} /> : <Loader size={14} />}
          <Text size="xs" c="dimmed">
            {infos ? textes.moteur.pret(infos.versionTypst, infos.nbPolices) : textes.moteur.preparation}
          </Text>
        </Group>
      </AppShell.Navbar>

      {/* Les assistants restent montés : on retrouve son travail en changeant de module. */}
      <AppShell.Main>
        <Box display={module === "cartes" ? undefined : "none"}>
          <AssistantCartes />
        </Box>
        <Box display={module === "signatures" ? undefined : "none"}>
          <AssistantSignatures />
        </Box>
        <Box display={module === "word" ? undefined : "none"}>
          <AssistantWord />
        </Box>
        <Box display={module === "pdf" ? undefined : "none"}>
          <OutilsPdf />
        </Box>
      </AppShell.Main>

      <APropos ouvert={aProposOuvert} fermer={aPropos.close} versionTypst={infos?.versionTypst} />
    </AppShell>
  );
}
