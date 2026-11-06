import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { enErreurMoteur } from "../../moteur";
import { textes } from "../../textes";

/** Affiche une erreur (du cœur ou de l'interface) dans une notification. */
export function signalerErreur(e: unknown) {
  const { message, details } = enErreurMoteur(e);
  // Quinze secondes : le temps de lire le message, même long (les autres notifications partent plus vite).
  notifications.show({ color: "red", icon: <IconAlertTriangle size={18} />, title: textes.erreur, message: [message, ...details].join("\n"), autoClose: 15000 });
}
