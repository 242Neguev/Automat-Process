import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  List,
  Loader,
  Menu,
  NavLink,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconChevronDown, IconChevronLeft, IconChevronRight, IconRulerMeasure } from "@tabler/icons-react";
import { casLesPlusLongs, compter, graviteCarte, regrouper, type Groupe } from "../../controle/cartes";
import { libelleAgent } from "../../donnees/agents";
import { aUnVerso } from "../../modele/visuels";
import type { ChampPhoto, DonneesAgent, Face, ModeleCarte, Recadrage } from "../../moteur";
import { textes } from "../../textes";
import ApercuCarte from "./ApercuCarte";
import IconeGravite from "../commun/IconeGravite";
import { libellesCartes } from "./libelles";
import MosaiqueCartes from "./MosaiqueCartes";
import type { Controle } from "./useControle";


/** « toutes », « a-verifier » (erreurs et points d'attention) ou la clé d'un groupe de problèmes. */
export type Filtre = string;
type Vue = "carte" | "mosaique";

interface Props {
  modele: ModeleCarte;
  agents: DonneesAgent[];
  controle: Controle;
  filtre: Filtre;
  onFiltre: (filtre: Filtre) => void;
  /** Recadrage d'une photo à la main (`null` : retour au recadrage automatique). */
  onRecadrer?: (cle: string, recadrage: Recadrage | null) => void;
}

/** Recadrage des photos de l'agent affiché : zoom et position, ou retour au recadrage automatique. */
function RecadragePhotos({ modele, agent, onRecadrer }: { modele: ModeleCarte; agent: DonneesAgent; onRecadrer: (cle: string, recadrage: Recadrage | null) => void }) {
  const t = libellesCartes(Boolean(modele.format.px)).verification.recadrage;
  const cadres = modele.champs.filter((c): c is ChampPhoto => c.type === "photo");
  return (
    <Paper withBorder p="sm" data-recadrage>
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t.titre}
        </Text>
        {cadres.map((cadre) => {
          const photo = agent.photos?.[cadre.id];
          if (!photo) {
            return (
              <Text key={cadre.id} size="sm" c="dimmed">
                {t.sansPhoto}
              </Text>
            );
          }
          const actuel: Recadrage = { centre_x: photo.centre_x, centre_y: photo.centre_y, zoom: photo.zoom };
          const changer = (modification: Partial<Recadrage>) => onRecadrer(photo.cle, { ...actuel, ...modification });
          // Réglé à la souris, appliqué au relâchement : l'aperçu n'est recalculé qu'une fois.
          const reglage = (libelle: string, cle: keyof Recadrage, min: number, max: number, pas: number, format: (v: number) => string) => (
            <div>
              <Text size="xs" mb={2}>
                {libelle}
              </Text>
              <Slider
                key={`${agent.id}:${photo.cle}:${actuel[cle]}`}
                aria-label={libelle}
                min={min}
                max={max}
                step={pas}
                defaultValue={actuel[cle]}
                label={format}
                onChangeEnd={(valeur) => changer({ [cle]: valeur })}
              />
            </div>
          );
          return (
            <Stack key={cadre.id} gap={6}>
              {reglage(t.zoom, "zoom", 1, 3, 0.05, (v) => `${Math.round(v * 100)} %`)}
              {reglage(t.horizontal, "centre_x", 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}
              {reglage(t.vertical, "centre_y", 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}
              <Button size="compact-xs" variant="subtle" style={{ alignSelf: "flex-start" }} onClick={() => onRecadrer(photo.cle, null)}>
                {t.auto}
              </Button>
            </Stack>
          );
        })}
        <Text size="xs" c="dimmed">
          {t.aide}
        </Text>
      </Stack>
    </Paper>
  );
}

/** Résumé du contrôle : nombre de cartes à corriger ou à vérifier, et problèmes cliquables (filtre). */
function Resume({ ecran, controle, groupes, filtre, onFiltre }: { ecran: boolean; controle: Controle; groupes: Groupe[]; filtre: Filtre; onFiltre: (filtre: Filtre) => void }) {
  const { verification: t, controle: tc } = libellesCartes(ecran);
  if (controle.enCours) {
    return (
      <Alert color="gray" icon={<Loader size={16} />}>
        {tc.calcul}
      </Alert>
    );
  }
  if (controle.erreur) {
    return (
      <Alert color="orange" icon={<IconAlertTriangle size={18} />} title={t.controleImpossible}>
        {[controle.erreur.message, ...controle.erreur.details].join("\n")}
      </Alert>
    );
  }
  if (!controle.rapport) return null;
  const nombres = compter(controle.rapport);
  const ajustees = new Set(groupes.filter((g) => g.gravite === "info").flatMap((g) => g.agents)).size;
  const titre =
    nombres.erreur + nombres.attention === 0
      ? tc.toutesCorrectes
      : [nombres.erreur > 0 && tc.aCorriger(nombres.erreur), nombres.attention > 0 && tc.aVerifier(nombres.attention)].filter(Boolean).join(" · ");
  const gravite = nombres.erreur > 0 ? "erreur" : nombres.attention > 0 ? "attention" : null;
  return (
    <Alert color={gravite === "erreur" ? "red" : gravite === "attention" ? "orange" : "teal"} icon={<IconeGravite gravite={gravite} taille={22} />} title={titre}>
      <Stack gap={6}>
        {groupes
          .filter((g) => g.gravite !== "info")
          .map((g) => (
            <UnstyledButton key={g.cle} onClick={() => onFiltre(filtre === g.cle ? "toutes" : g.cle)} data-groupe={g.cle}>
              <Group gap="xs" wrap="nowrap">
                <IconeGravite gravite={g.gravite} taille={16} />
                <Text size="sm" fw={filtre === g.cle ? 700 : 400} td={filtre === g.cle ? undefined : "underline dotted"}>
                  {g.resume}
                </Text>
                <Badge size="sm" variant="light" color="gray">
                  {tc.nbCartes(g.agents.length)}
                </Badge>
              </Group>
            </UnstyledButton>
          ))}
        {ajustees > 0 && (
          <Text size="sm" c="dimmed">
            {tc.ajustees(ajustees)}
          </Text>
        )}
      </Stack>
    </Alert>
  );
}

export default function EtapeVerification({ modele, agents, controle, filtre, onFiltre, onRecadrer }: Props) {
  const ecran = Boolean(modele.format.px);
  const t = libellesCartes(ecran).verification;
  const [choisi, setChoisi] = useState<string | null>(null);
  const [face, setFace] = useState<Face>("recto");
  const [vue, setVue] = useState<Vue>("carte");
  const { rapport, mesures } = controle;
  const groupes = rapport ? regrouper(rapport) : [];

  const visibles = agents.filter((agent) => {
    if (!rapport || filtre === "toutes") return true;
    const gravite = graviteCarte(rapport.get(agent.id));
    if (filtre === "a-verifier") return gravite === "erreur" || gravite === "attention";
    return groupes.find((g) => g.cle === filtre)?.agents.includes(agent.id) ?? true;
  });
  const index = Math.max(0, visibles.findIndex((agent) => agent.id === choisi));
  const courant = visibles[index] ?? null;
  const problemes = courant && rapport ? (rapport.get(courant.id) ?? []) : [];
  const casLongs = mesures ? casLesPlusLongs(modele, mesures) : [];
  const ouvrir = (agent: string) => {
    setChoisi(agent);
    setVue("carte");
  };
  // Les filtres prédéfinis, plus le problème choisi dans le résumé.
  const filtres = [
    ...(["toutes", "a-verifier"] as const).map((value) => ({ value, label: t.filtres[value] })),
    ...groupes.filter((g) => g.cle === filtre).map((g) => ({ value: g.cle, label: g.resume })),
  ];

  return (
    <Stack gap="md">
      <Resume ecran={ecran} controle={controle} groupes={groupes} filtre={filtre} onFiltre={onFiltre} />

      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <SegmentedControl
            value={vue}
            onChange={(valeur) => setVue(valeur as Vue)}
            data={(["carte", "mosaique"] as const).map((value) => ({ value, label: t.vues[value] }))}
          />
          <Select w={280} value={filtre} allowDeselect={false} data={filtres} onChange={(valeur) => valeur && onFiltre(valeur)} aria-label={t.filtres.toutes} />
        </Group>
        <Menu position="bottom-end" width={360} disabled={casLongs.length === 0}>
          <Menu.Target>
            <Button variant="default" leftSection={<IconRulerMeasure size={16} />} rightSection={<IconChevronDown size={14} />} disabled={casLongs.length === 0}>
              {t.casLePlusLong}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t.casAide}</Menu.Label>
            {casLongs.map(({ champ, libelle, agent }) => {
              const valeur = agents.find((a) => a.id === agent)?.valeurs[champ] ?? "";
              return (
                <Menu.Item
                  key={champ}
                  onClick={() => {
                    onFiltre("toutes");
                    ouvrir(agent);
                  }}
                >
                  <Text size="sm" fw={500}>
                    {libelle}
                  </Text>
                  <Text size="xs" c="dimmed" truncate dir="auto">
                    {valeur}
                  </Text>
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {visibles.length === 0 ? (
        <Text c="dimmed">{t.aucuneCarte}</Text>
      ) : vue === "mosaique" ? (
        <MosaiqueCartes modele={modele} agents={visibles} rapport={rapport} onChoisir={ouvrir} />
      ) : (
        <Group align="flex-start" gap="lg" wrap="nowrap">
          <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <ApercuCarte modele={modele} agent={courant} face={aUnVerso(modele) ? face : "recto"} />
            <Group justify="space-between">
              <Group gap="xs">
                <Tooltip label={t.precedent}>
                  <ActionIcon variant="default" size="lg" aria-label={t.precedent} disabled={index <= 0} onClick={() => setChoisi(visibles[index - 1].id)}>
                    <IconChevronLeft size={18} />
                  </ActionIcon>
                </Tooltip>
                <Text size="sm" w={130} ta="center">
                  {t.agent(index + 1, visibles.length)}
                </Text>
                <Tooltip label={t.suivant}>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label={t.suivant}
                    disabled={index >= visibles.length - 1}
                    onClick={() => setChoisi(visibles[index + 1].id)}
                  >
                    <IconChevronRight size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              {aUnVerso(modele) && (
                <SegmentedControl
                  value={face}
                  onChange={(valeur) => setFace(valeur as Face)}
                  data={[
                    { value: "recto", label: textes.cartes.recto },
                    { value: "verso", label: textes.cartes.verso },
                  ]}
                />
              )}
            </Group>
            {rapport && (
              <List spacing={6} size="sm" center data-problemes>
                {problemes.length === 0 ? (
                  <List.Item icon={<IconeGravite gravite={null} />}>{t.rienASignaler}</List.Item>
                ) : (
                  problemes.map((probleme) => (
                    <List.Item key={probleme.type + probleme.champs.join("+")} icon={<IconeGravite gravite={probleme.gravite} />}>
                      {probleme.message}
                    </List.Item>
                  ))
                )}
              </List>
            )}
            {onRecadrer && courant && <RecadragePhotos modele={modele} agent={courant} onRecadrer={onRecadrer} />}
          </Stack>

          <Paper withBorder p="sm" w={320} style={{ flexShrink: 0 }}>
            <Title order={5} px="xs" pb="xs">
              {t.agents}
            </Title>
            <ScrollArea.Autosize mah={460} type="auto">
              {visibles.map((agent, i) => (
                <NavLink
                  key={agent.id}
                  label={<span dir="auto">{libelleAgent(agent)}</span>}
                  description={agent.id}
                  active={i === index}
                  leftSection={rapport && <IconeGravite gravite={graviteCarte(rapport.get(agent.id))} taille={16} />}
                  onClick={() => setChoisi(agent.id)}
                />
              ))}
            </ScrollArea.Autosize>
          </Paper>
        </Group>
      )}
    </Stack>
  );
}
