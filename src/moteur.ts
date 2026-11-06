// Accès typé aux commandes du cœur Rust (voir src-tauri/src/commandes.rs).
import { invoke } from "@tauri-apps/api/core";
import type { Transformation } from "./donnees/nettoyage";
import type { ChampsVCard } from "./donnees/vcard";

export type Face = "recto" | "verso";
export type Sortie = "cartes" | "planches";
export type Feuille = "A4" | "A3" | "SRA3";

export interface InfosMoteur {
  versionTypst: string;
  nbPolices: number;
}

export interface ErreurMoteur {
  message: string;
  details: string[];
}

/** Couleur d'un champ : hexadécimal pour l'écran, ou CMJN en % pour l'imprimeur. */
export type Couleur = { rgb: string } | { cmyk: [number, number, number, number] };

/** Positions et tailles en mm depuis le coin haut-gauche de la carte finie (hors fond perdu). */
export interface ChampTexte {
  id: string;
  type: "texte";
  /** Texte avec balises, ex. « Tél. {{Fixe}} ». */
  modele: string;
  /** Point d'ancrage, sur la ligne de base du texte. */
  x_mm: number;
  y_mm: number;
  police: string;
  graisse: number;
  taille_pt: number;
  couleur: Couleur;
  interlettrage_em: number;
  ancre: "start" | "middle" | "end";
  largeur_max_mm: number;
  taille_min_pt: number;
  lignes_max: number;
}

export interface ChampQr {
  id: string;
  type: "qr";
  x_mm: number;
  y_mm: number;
  taille_mm: number;
  couleur: Couleur;
  /** Contenu de la vCard : textes avec balises ou valeurs fixes, ex. { nom: "{{NOM}}", organisation: "EXEMPLE SA" }. */
  vcard?: Partial<Record<keyof ChampsVCard, string>>;
}

/** Zone effacée : un aplat posé sur le visuel (texte d'exemple incrusté dans une image). */
export interface ChampMasque {
  id: string;
  type: "masque";
  x_mm: number;
  y_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  couleur: Couleur;
}

/** Cadre de la photo de chaque agent : le fichier est donné par une colonne de la liste. */
export interface ChampPhoto {
  id: string;
  type: "photo";
  x_mm: number;
  y_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
  /** Balise de la colonne qui donne le fichier de la photo (nom, avec ou sans extension, ou chemin complet). */
  balise: string;
  forme: "rectangle" | "arrondi" | "cercle";
}

export type Champ = ChampTexte | ChampQr | ChampMasque | ChampPhoto;

/** Variante du modèle (filiale, langue…) : ses visuels remplacent ceux du modèle, face par face. */
export interface VarianteModele {
  /** Identifiant stable (v1, v2…), pour ranger ses visuels. */
  id: string;
  /** Valeur de la colonne qui désigne la variante, ex. « Douala » (sans tenir compte des accents ni de la casse). */
  valeur: string;
  fond_recto?: string | null;
  fond_verso?: string | null;
  fond_recto_avec_fond_perdu?: boolean;
  fond_verso_avec_fond_perdu?: boolean;
}

export interface ModeleCarte {
  /** Identifiant du modèle : le registre de ses exports (mise à jour incrémentale) est rangé sous ce nom. */
  id?: string;
  nom: string;
  /** `px` : format d'écran (fond Teams, bannière…), exporté à cette taille en pixels. */
  format: { largeur_mm: number; hauteur_mm: number; fond_perdu_mm: number; px?: { largeur: number; hauteur: number } };
  /** Chemins virtuels des visuels (« /fonds/1.pdf »), ou vide pour une carte blanche. */
  fond_recto: string | null;
  fond_verso: string | null;
  /** Le visuel contient-il déjà le fond perdu ? Sinon, le fond perdu est complété à partir de ses bords. */
  fond_recto_avec_fond_perdu?: boolean;
  fond_verso_avec_fond_perdu?: boolean;
  /** Versions écran (RVB) des visuels : elles remplacent celles de l'imprimeur dans les cartes numériques. */
  fond_recto_ecran?: string | null;
  fond_verso_ecran?: string | null;
  fond_recto_ecran_avec_fond_perdu?: boolean;
  fond_verso_ecran_avec_fond_perdu?: boolean;
  /** Calque de référence de l'éditeur : la maquette, posée en transparence ; jamais imprimée. */
  fond_calque?: string | null;
  fond_calque_avec_fond_perdu?: boolean;
  transformations?: Record<string, Transformation>;
  champs: Champ[];
  /** Mode opérateur : le modèle ne se modifie plus, le projet s'ouvre à l'étape Liste. */
  verrouille?: boolean;
  /** Variantes : le modèle décliné selon une colonne de la liste (balise), une valeur par variante. */
  variantes?: { balise: string; valeurs: VarianteModele[] };
}

/** Recadrage d'une photo : point visé (fractions depuis son coin haut-gauche), amené au centre du cadre, et zoom (1 : la photo couvre juste le cadre). */
export interface Recadrage {
  centre_x: number;
  centre_y: number;
  zoom: number;
}

/** Photo d'un agent dans un cadre de la carte. */
export interface PhotoAgent extends Recadrage {
  chemin: string;
  largeur_px: number;
  hauteur_px: number;
  /** Empreinte du nom de la photo : son recadrage fait à la main est rangé sous ce nom. */
  cle: string;
}

/** Un agent prêt à être rendu : texte final de chaque champ et vCard du QR code. */
export interface DonneesAgent {
  id: string;
  valeurs: Record<string, string>;
  vcard?: string;
  /** Cartes numériques : lien de certains champs (tel:, mailto:, https:), cliquable dans le PDF. */
  liens?: Record<string, string>;
  /** Nom de l'agent, affiché sur le bon à tirer. */
  libelle?: string;
  /** Rang de sa variante dans `modele.variantes.valeurs` ; aucune : les visuels du modèle. */
  variante?: number;
  /** Photo de chaque champ photo (par identifiant de champ). */
  photos?: Record<string, PhotoAgent>;
}

export interface OptionsNumerique {
  format: "png" | "jpg" | "pdf";
  /** Largeur des images, en pixels. */
  largeurPx: number;
  verso: boolean;
}

/** Ligne de texte d'un visuel (PDF ou SVG), en mm depuis le coin haut-gauche du visuel. */
export interface TexteVisuel {
  id: number;
  texte: string;
  /** Point d'ancrage, sur la ligne de base. */
  xMm: number;
  yMm: number;
  largeurMm: number;
  taillePt: number;
  /** Nom de police (famille, ou nom PostScript pour un PDF : « Arial-BoldMT »). */
  police: string;
  couleur: Couleur;
  graisse?: number;
  ancre?: "start" | "middle" | "end";
  interlettrageEm?: number;
}

/**
 * Mise en page réelle d'un texte sur la carte d'un agent (mm depuis le coin haut-gauche de la carte
 * finie) : taille retenue, nombre de lignes, débordement et encombrement de l'encre.
 */
export interface MesureTexte {
  agent: string;
  champ: string;
  taille: number;
  origine: number;
  lignes: number;
  deborde: boolean;
  gauche: number;
  droite: number;
  haut: number;
  bas: number;
  /** Ligne de base de la dernière ligne. */
  base: number;
}

/** Visuel importé : chemin virtuel à reprendre dans le modèle et ce qu'on sait de ses dimensions. */
export interface FondImporte {
  chemin: string;
  nomFichier: string;
  genre: "svg" | "pdf" | "image";
  largeurMm: number | null;
  hauteurMm: number | null;
  fondPerduMm: number | null;
  largeurPx: number | null;
  hauteurPx: number | null;
  texte: string | null;
  /** PDF : lignes à balises, déjà retirées du visuel. */
  champs: TexteVisuel[];
  /** PDF : textes restant dans le visuel. */
  textes: TexteVisuel[];
}

/** Zone de la carte finie, en mm. */
export interface Zone {
  x_mm: number;
  y_mm: number;
  largeur_mm: number;
  hauteur_mm: number;
}

/** Sorte de document d'un projet : chacune s'ouvre dans son module. */
export type Document = "carte" | "ecran" | "signature" | "word";

export interface ProjetOuvert {
  document: Document;
  /** Modèle de carte (ModeleCarte) ou de signature, selon `document`. */
  modele: unknown;
  correspondances: Record<string, string | null>;
  /** Visuels du modèle, par emplacement (recto, verso, recto_ecran, verso_ecran, calque). */
  visuels: Partial<Record<string, FondImporte & Record<string, unknown>>>;
}

export const infosMoteur = () => invoke<InfosMoteur>("infos_moteur");
/** Langue des messages du cœur et des documents qu'il produit (bon à tirer, planches). */
export const definirLangue = (langue: "fr" | "en") => invoke<void>("definir_langue", { langue });
export const famillesPolices = () => invoke<string[]>("familles_polices");
export const modeleDemo = () => invoke<ModeleCarte>("modele_demo");
export const importerFond = (chemin: string) => invoke<FondImporte>("importer_fond", { chemin });
export const remplacerFond = (chemin: string, svg: string) => invoke<void>("remplacer_fond", { chemin, svg });

/** Aperçu SVG d'une face de la carte d'un agent. */
export const apercuCarte = (modele: ModeleCarte, agent: DonneesAgent, face: Face) =>
  invoke<string>("apercu_carte", { modele, agent, face });

export const exporterCartes = (modele: ModeleCarte, agents: DonneesAgent[], sortie: Sortie, feuille: Feuille, chemin: string) =>
  invoke<void>("exporter_cartes", { modele, agents, sortie, feuille, chemin });

/** Bon à tirer des cartes données (une page A4 par carte), enregistré dans `chemin`. */
export const exporterBat = (modele: ModeleCarte, agents: DonneesAgent[], titre: string, date: string, chemin: string) =>
  invoke<void>("exporter_bat", { modele, agents, titre, date, chemin });

/**
 * Cartes numériques dans le nouveau dossier `sousDossier` de `dossier` (chemin renvoyé) : une image
 * ou un PDF cliquable par agent, nommé d'après `noms`, et sa fiche contact quand `fiches` la donne.
 */
export const exporterNumerique = (
  modele: ModeleCarte,
  agents: DonneesAgent[],
  noms: string[],
  fiches: string[],
  options: OptionsNumerique,
  dossier: string,
  sousDossier: string,
) => invoke<string>("exporter_numerique", { modele, agents, noms, fiches, options, dossier, sousDossier });

/** Mesures de mise en page de chaque texte de chaque agent, pour le rapport de contrôle. */
export const controlerCartes = (modele: ModeleCarte, agents: DonneesAgent[]) => invoke<MesureTexte[]>("controler_cartes", { modele, agents });

/** Vignettes JPEG du recto des agents (dans leur ordre), larges de `largeurPx` pixels. */
export async function vignettesCartes(modele: ModeleCarte, agents: DonneesAgent[], largeurPx: number): Promise<Blob[]> {
  const octets = new Uint8Array(await invoke<ArrayBuffer>("vignettes_cartes", { modele, agents, largeurPx }));
  // Chaque image est précédée de sa taille sur 4 octets (gros-boutiste).
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const images: Blob[] = [];
  for (let i = 0; i + 4 <= octets.length; ) {
    const taille = vue.getUint32(i);
    images.push(new Blob([octets.slice(i + 4, i + 4 + taille)], { type: "image/jpeg" }));
    i += 4 + taille;
  }
  return images;
}

/** Fusionne des PDF (les PDF des courriers), dans l'ordre donné, dans le fichier `sortie`. */
export const fusionnerPdf = (chemins: string[], sortie: string) => invoke<void>("fusionner_pdf", { chemins, sortie });

/** Parties XML à remplir d'un modèle Word (chemin dans l'archive → XML). */
export const lireModeleWord = (chemin: string) => invoke<Record<string, string>>("lire_modele_word", { chemin });

/** Un courrier à écrire : nom du fichier (sans extension) et parties remplies. */
export interface Courrier {
  nom: string;
  parties: Record<string, string>;
}

/** Courriers écrits : leur dossier et le chemin de chacun. */
export interface CourriersEcrits {
  dossier: string;
  fichiers: string[];
}

/** Écrit des courriers Word d'après le modèle, dans le dossier `sousDossier` de `dossier` (créé au besoin). */
export const ecrireCourriers = (modele: string, courriers: Courrier[], dossier: string, sousDossier: string) =>
  invoke<CourriersEcrits>("ecrire_courriers", { modele, courriers, dossier, sousDossier });

/** Logiciel qui convertit les courriers en PDF. */
export type Convertisseur = "word" | "libreoffice";

/** Conversion en PDF : logiciel utilisé et PDF créés, dans l'ordre des documents. */
export interface Conversion {
  convertisseur: Convertisseur;
  pdfs: string[];
  /** Pourquoi Word, pourtant installé, n'a pas fait la conversion (LibreOffice a pris le relais). */
  remarque: string | null;
}

/** Convertit des courriers Word en PDF (Word, sinon LibreOffice) dans le dossier `sousDossier` de `dossier`. */
export const convertirCourriers = (documents: string[], dossier: string, sousDossier: string, supprimerSources: boolean) =>
  invoke<Conversion>("convertir_courriers", { documents, dossier, sousDossier, supprimerSources });

/** Aperçu fidèle d'un courrier : ses pages en SVG, telles que Word (ou LibreOffice) les produit. */
export interface ApercuCourrier {
  pages: string[];
  convertisseur: Convertisseur;
  remarque: string | null;
}

export const apercuCourrier = (modele: string, courrier: Courrier) => invoke<ApercuCourrier>("apercu_courrier", { modele, courrier });

/** Dossier temporaire neuf, et sa suppression (documents intermédiaires). */
export const dossierTemporaire = () => invoke<string>("dossier_temporaire");
export const supprimerTemporaire = (dossier: string) => invoke<void>("supprimer_temporaire", { dossier });

/** Imprimante installée (impression directe, sous Windows). */
export interface Imprimante {
  nom: string;
  parDefaut: boolean;
  /** Le pilote sait imprimer recto verso. */
  rectoVerso: boolean;
}

export interface ReglagesImpression {
  rectoVerso: boolean;
  /** Le verso est tourné d'un demi-tour (selon le sens où l'imprimante retourne la carte). */
  retournerVerso: boolean;
  /** Exemplaires de chaque carte. */
  exemplaires: number;
}

export const imprimantes = () => invoke<Imprimante[]>("imprimantes");

/** Imprime les cartes ; `false` si l'utilisateur a annulé (boîte d'enregistrement d'une imprimante PDF ou XPS). */
export const imprimerCartes = (modele: ModeleCarte, agents: DonneesAgent[], imprimante: string, reglages: ReglagesImpression) =>
  invoke<boolean>("imprimer_cartes", { modele, agents, imprimante, reglages });

/** Texte lu dans le visuel du recto par la reconnaissance de caractères (mm de la carte finie). */
export interface TexteLu {
  id: number;
  texte: string;
  /** Début de sa ligne de base. */
  xMm: number;
  yMm: number;
  largeurMm: number;
  taillePt: number;
  /** Couleur mesurée du texte (#rrggbb). */
  couleur: string;
  /** Rectangle de l'encre : la zone à effacer. */
  zone: Zone;
}

/** Textes d'exemple incrustés dans le visuel du recto (reconnaissance de caractères de Windows, hors ligne). */
export const reconnaitreTextes = (modele: ModeleCarte) => invoke<TexteLu[]>("reconnaitre_textes", { modele });

/**
 * Effacement intelligent de zones du visuel du recto, quand c'est une image : le texte disparaît, le fond
 * est reconstruit autour. Renvoie la nouvelle image (l'ancienne reste disponible pour annuler).
 */
export const effacerTexte = (modele: ModeleCarte, zones: Zone[], nomFichier: string) => invoke<FondImporte>("effacer_texte", { modele, zones, nomFichier });

/** Couleur du visuel tout autour d'une zone : elle sert à effacer un texte incrusté. */
export const couleurAutour = (modele: ModeleCarte, zone: Zone) => invoke<string>("couleur_autour", { modele, zone });

/** Retire un texte d'exemple d'un visuel PDF ; renvoie la ligne retirée et les textes restants. */
export const retirerTextePdf = (chemin: string, id: number) =>
  invoke<{ texte: TexteVisuel; textes: TexteVisuel[] }>("retirer_texte_pdf", { chemin, id });

export const enregistrerProjet = (chemin: string, document: Document, modele: unknown, correspondances: Record<string, unknown>, visuels: unknown) =>
  invoke<void>("enregistrer_projet", { chemin, document, modele, correspondances, visuels });

export const ouvrirProjet = (chemin: string) => invoke<ProjetOuvert>("ouvrir_projet", { chemin });

/** Empreinte du modèle tel qu'il s'imprime (contenu des visuels compris) : s'il change, toutes les cartes sont à refaire. */
export const empreinteModele = (modele: ModeleCarte) => invoke<string>("empreinte_modele", { modele });

/** Registre des exports d'un modèle (mise à jour incrémentale) : des empreintes seulement, rangées avec les données de l'application. */
export const lireRegistre = (id: string) => invoke<unknown>("lire_registre", { id });
export const ecrireRegistre = (id: string, registre: unknown) => invoke<void>("ecrire_registre", { id, registre });
export const oublierRegistre = (id: string) => invoke<void>("oublier_registre", { id });

/** Photo demandée par l'interface, telle que le cœur a pu la charger. */
export interface PhotoChargee {
  /** Valeur de la colonne (nom du fichier ou chemin). */
  nom: string;
  /** Chemin virtuel de la photo réduite ; `null` si elle manque. */
  chemin: string | null;
  largeurPx: number;
  hauteurPx: number;
  /** Visage repéré (Windows) : centre et hauteur, en fractions de la photo. */
  visage: { x: number; y: number; hauteur: number } | null;
  /** « introuvable », ou la raison de l'échec de lecture. */
  erreur: string | null;
}

/** Charge les photos (cherchées dans `dossier` quand ce ne sont pas des chemins complets). */
export const chargerPhotos = (dossier: string, noms: string[]) => invoke<PhotoChargee[]>("charger_photos", { dossier, noms });

/** Contenu brut d'un fichier de liste choisi par l'utilisateur. */
export const lireListe = (chemin: string) => invoke<ArrayBuffer>("lire_liste", { chemin });

/** Contenu brut d'un fichier choisi par l'utilisateur, après contrôle de son format et de sa taille. */
export const lireFichier = (chemin: string, nature: "liste" | "image" | "signature") => invoke<ArrayBuffer>("lire_fichier", { chemin, nature });

/** Enregistre un classeur Excel (.xlsx) préparé par l'interface. */
export const enregistrerClasseur = (chemin: string, octets: Uint8Array) => invoke<void>("enregistrer_classeur", { chemin, octets: Array.from(octets) });

/** Fichier à créer : un texte (HTML) ou des octets (image). */
export type FichierAEcrire = { nom: string; texte: string } | { nom: string; octets: number[] };

/** Écrit des fichiers dans un nouveau dossier `sousDossier` de `dossier` ; renvoie son chemin. */
export const ecrireFichiers = (dossier: string, sousDossier: string, fichiers: FichierAEcrire[]) =>
  invoke<string>("ecrire_fichiers", { dossier, sousDossier, fichiers });

/** Ouvre un document créé par l'application (PDF, Word, Excel, image, page de signatures) dans l'application habituelle, ou un dossier. */
export const ouvrirFichier = (chemin: string) => invoke<void>("ouvrir_fichier", { chemin });

/** Affiche un fichier dans son dossier (Explorateur), sélectionné ; un dossier est simplement ouvert. */
export const montrerDansDossier = (chemin: string) => invoke<void>("montrer_dans_dossier", { chemin });

/** Ramène toute erreur (Rust ou JavaScript) au format affiché par l'interface. */
export function enErreurMoteur(erreur: unknown): ErreurMoteur {
  if (typeof erreur === "object" && erreur !== null && "message" in erreur) {
    const { message, details } = erreur as Partial<ErreurMoteur>;
    return { message: String(message), details: Array.isArray(details) ? details : [] };
  }
  return { message: String(erreur), details: [] };
}
