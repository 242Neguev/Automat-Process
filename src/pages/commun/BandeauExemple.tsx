import { Alert } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { textes } from "../../textes";

/** Rappelle qu'on essaie l'exemple, et comment le parcourir. Se ferme d'un clic. */
export default function BandeauExemple({ message, onFermer }: { message: string | null; onFermer: () => void }) {
  if (!message) return null;
  return (
    <Alert
      color="eau"
      variant="light"
      icon={<IconBulb size={20} />}
      title={textes.exemple.titre}
      withCloseButton
      closeButtonLabel={textes.exemple.fermer}
      onClose={onFermer}
      data-bandeau-exemple
    >
      {message}
    </Alert>
  );
}
