import { useMemo, useState } from "react";
import { Group, Stack, Stepper, Text, Title } from "@mantine/core";
import { valeursDeLigne } from "../../donnees/agents";
import { genreDe } from "../../donnees/fichiersDeposes";
import type { ProjetOuvert } from "../../moteur";
import { valeursExemple } from "../../signatures/agents";
import { balisesSignature, modeleParDefaut, type ModeleSignature } from "../../signatures/modele";
import { textes } from "../../textes";
import BandeauExemple from "../commun/BandeauExemple";
import BarreEtapes from "../commun/BarreEtapes";
import { useCommande, type Commande } from "../commun/commande";
import EtapeListe from "../commun/EtapeListe";
import { BoutonsProjet, enregistrerSous, projetOuvert } from "../commun/projet";
import { useListe } from "../commun/useListe";
import EtapeDestinationSignatures from "./EtapeDestinationSignatures";
import EtapeModeleSignature from "./EtapeModeleSignature";
import EtapeVerificationSignatures, { type AgentSignature } from "./EtapeVerificationSignatures";

const t = textes.signatures;

/** Assistant « Signatures e-mail » : Modèle → Liste → Vérification → Destination. */
export default function AssistantSignatures({ commande, onOuvrirProjet }: { commande?: Commande; onOuvrirProjet: () => void }) {
  const [etape, setEtape] = useState(0);
  // Bandeau « Vous essayez avec l'exemple », affiché après « Essayer avec l'exemple » de l'accueil.
  const [essai, setEssai] = useState(false);
  const [modele, setModele] = useState<ModeleSignature>(modeleParDefaut);
  // Change à chaque projet ouvert : l'étape Modèle repart d'un état neuf.
  const [ouvertures, setOuvertures] = useState(0);
  const balises = useMemo(() => balisesSignature(modele), [modele]);
  const donnees = useListe(balises);
  const { liste, correspondances } = donnees;
  const agents = useMemo<AgentSignature[]>(
    () => (liste ? liste.lignes.map((ligne) => ({ id: `ligne ${ligne.numero}`, valeurs: valeursDeLigne(modele, ligne, correspondances) })) : []),
    [modele, liste, correspondances],
  );
  const apercu = agents[0]?.valeurs ?? valeursExemple(modele);
  const modelePret = modele.source === "html" ? Boolean(modele.html) && balises.length > 0 : balises.length > 0;
  const verrouille = Boolean(modele.verrouille);
  const verrouiller = (verrou: boolean) => setModele((m) => ({ ...m, verrouille: verrou }));

  /** Projet rouvert (depuis l'accueil ou « Ouvrir un projet… »). */
  function appliquerProjet(projet: ProjetOuvert) {
    // Un projet enregistré par une version précédente reçoit les réglages ajoutés depuis.
    const ouvert: ModeleSignature = { ...modeleParDefaut(), ...(projet.modele as Partial<ModeleSignature>) };
    setModele(ouvert);
    donnees.restaurer(projet.correspondances, balisesSignature(ouvert));
    // Modèle verrouillé (mode opérateur) : on commence par la liste.
    setEtape(ouvert.verrouille ? 1 : 0);
    setOuvertures((n) => n + 1);
    setEssai(false);
    projetOuvert(ouvert.nom);
  }

  useCommande(commande, (demande) => {
    if (demande.type === "exemple") {
      // Le modèle proposé d'office suffit : seule la liste d'exemple manque.
      void donnees.utiliserExemple();
      setEtape(0);
      setEssai(true);
    } else if (demande.type === "projet") appliquerProjet(demande.projet);
    else {
      // Une liste glissée dans la fenêtre devient celle des agents.
      const fichierListe = demande.chemins.find((chemin) => genreDe(chemin) === "liste");
      if (fichierListe) {
        setEssai(false);
        void donnees.importerChemin(fichierListe);
        if (modelePret) setEtape(1);
      }
    }
  });

  const etapePrete = [modelePret, agents.length > 0 && Object.values(correspondances).some(Boolean), agents.length > 0, false];
  const n = textes.navigation.manque;
  // Ce qui manque pour passer à l'étape suivante, dit en clair à côté du bouton grisé.
  const manque = [modele.source === "html" ? n.signatureHtml : n.signature, liste ? n.colonnes : n.liste, n.liste, null];

  return (
    <Stack gap="lg" maw={1240}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{t.titre}</Title>
          <Text c="dimmed">{t.sousTitre}</Text>
        </div>
        <BoutonsProjet
          onOuvrir={onOuvrirProjet}
          onEnregistrer={() => enregistrerSous("signature", modele.nom, modele, correspondances)}
          verrou={{ verrouille, onChange: verrouiller }}
        />
      </Group>

      <BandeauExemple message={essai ? textes.exemple.signatures : null} onFermer={() => setEssai(false)} />

      <Stepper active={etape} onStepClick={setEtape} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t.etapes.modele.titre} description={t.etapes.modele.description}>
          <EtapeModeleSignature
            key={ouvertures}
            modele={modele}
            onModele={setModele}
            valeurs={apercu}
            depuisListe={agents.length > 0}
            verrouille={verrouille}
            onDeverrouiller={() => verrouiller(false)}
          />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.liste.titre} description={t.etapes.liste.description}>
          <EtapeListe
            liste={liste}
            feuilles={donnees.feuilles}
            balises={balises}
            nomModele={modele.nom}
            correspondances={correspondances}
            exemple={agents[0]?.valeurs ?? {}}
            anomalies={donnees.anomalies}
            onImporter={() => {
              setEssai(false);
              void donnees.importer();
            }}
            onExemple={donnees.utiliserExemple}
            onFeuille={donnees.setFeuille}
            onCorrespondance={donnees.relier}
          />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.verification.titre} description={t.etapes.verification.description}>
          <EtapeVerificationSignatures modele={modele} agents={agents} />
        </Stepper.Step>
        <Stepper.Step label={t.etapes.destination.titre} description={t.etapes.destination.description}>
          <EtapeDestinationSignatures modele={modele} agents={agents} />
        </Stepper.Step>
      </Stepper>

      <BarreEtapes
        etape={etape}
        titres={[t.etapes.modele.titre, t.etapes.liste.titre, t.etapes.verification.titre, t.etapes.destination.titre]}
        prete={etapePrete[etape]}
        manque={manque[etape]}
        onEtape={setEtape}
      />
    </Stack>
  );
}
