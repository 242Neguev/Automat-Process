// Fiche contact vCard 3.0, lue par les téléphones (iPhone, Android) en scannant le QR code.

export interface ChampsVCard {
  prenom?: string;
  nom?: string;
  fonction?: string;
  organisation?: string;
  mobile?: string;
  fixe?: string;
  email?: string;
  site?: string;
}

const echapper = (texte: string) => texte.replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const telephone = (texte: string) => texte.replace(/[^\d+]/g, "");

/** Texte de la vCard ; vide quand il n'y a aucune donnée de contact (pas de QR code). */
export function vcard(champs: ChampsVCard): string {
  const nomComplet = [champs.prenom, champs.nom].filter(Boolean).join(" ");
  if (!nomComplet && !champs.mobile && !champs.fixe && !champs.email) return "";
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${echapper(champs.nom ?? "")};${echapper(champs.prenom ?? "")};;;`,
    `FN:${echapper(nomComplet)}`,
    champs.organisation && `ORG:${echapper(champs.organisation)}`,
    champs.fonction && `TITLE:${echapper(champs.fonction)}`,
    champs.mobile && `TEL;TYPE=CELL:${telephone(champs.mobile)}`,
    champs.fixe && `TEL;TYPE=WORK,VOICE:${telephone(champs.fixe)}`,
    champs.email && `EMAIL;TYPE=INTERNET:${champs.email}`,
    champs.site && `URL:${champs.site}`,
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
}
