// Association automatique des balises du modèle ({{NOM}}, {{Email}}…) aux colonnes de la liste.

/** Balise → colonne de la liste (null : à choisir par l'utilisateur). */
export type Correspondances = Record<string, string | null>;

/** Compare sans tenir compte des accents, de la casse, des espaces ni de la ponctuation. */
export const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Chaque groupe réunit des intitulés courants qui désignent la même information.
const SYNONYMES = [
  ["prenom", "prenoms", "firstname", "givenname"],
  ["nom", "noms", "nomdefamille", "lastname", "surname", "familyname"],
  ["fonction", "poste", "titre", "intitule", "intituledeposte", "jobtitle", "title"],
  ["email", "mail", "courriel", "adressemail", "adresseemail", "emailprofessionnel", "mailprofessionnel"],
  ["mobile", "portable", "gsm", "cellulaire", "telmobile", "telephonemobile", "telportable", "cell"],
  ["fixe", "telfixe", "telephonefixe", "bureau", "telbureau", "telephonebureau", "lignedirecte"],
  ["telephone", "tel", "phone", "numerodetelephone"],
  ["matricule", "identifiant", "numeroagent", "numerodagent", "id"],
  ["direction", "departement", "service", "division", "pole"],
  ["site", "ville", "localisation", "agence", "implantation"],
];

const groupe = (nom: string) => SYNONYMES.find((g) => g.includes(nom)) ?? [nom];

/**
 * Associe chaque balise à une colonne : d'abord le même nom (au format près), puis un synonyme.
 * Une colonne n'est jamais associée à deux balises.
 */
export function associer(balises: string[], colonnes: string[]): Correspondances {
  const resultat: Correspondances = Object.fromEntries(balises.map((balise) => [balise, null]));
  const libres = new Set(colonnes);
  const essayer = (correspond: (balise: string, colonne: string) => boolean) => {
    for (const balise of balises) {
      if (resultat[balise]) continue;
      const colonne = colonnes.find((c) => libres.has(c) && correspond(normaliser(balise), normaliser(c)));
      if (colonne) {
        resultat[balise] = colonne;
        libres.delete(colonne);
      }
    }
  };
  essayer((balise, colonne) => balise === colonne);
  essayer((balise, colonne) => groupe(balise).includes(colonne));
  return resultat;
}
