import { IconDeviceMobile, IconFileTypeDocx, IconId, IconMail } from "@tabler/icons-react";
import type { Document } from "./moteur";

/** Les modules de l'application, dans l'ordre du menu ; `exemple` : on peut l'essayer sans ses propres fichiers. */
export const MODULES = [
  { cle: "cartes", icone: IconId, exemple: true },
  { cle: "signatures", icone: IconMail, exemple: true },
  { cle: "numerique", icone: IconDeviceMobile, exemple: false },
  { cle: "word", icone: IconFileTypeDocx, exemple: true },
] as const;

export type Module = (typeof MODULES)[number]["cle"];

/** Module qui ouvre chaque sorte de projet enregistré. */
export const MODULE_DU_DOCUMENT: Record<Document, Module> = { carte: "cartes", ecran: "numerique", signature: "signatures", word: "word" };
