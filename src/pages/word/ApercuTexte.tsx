import { Mark, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import type { Segment } from "../../word/docx";

/** Texte d'un document Word : balises du modèle en orange, valeurs d'une personne surlignées. */
export default function ApercuTexte({ paragraphes, hauteur = 480 }: { paragraphes: Segment[][]; hauteur?: number }) {
  return (
    <Paper withBorder p="lg" data-apercu-word>
      <ScrollArea.Autosize mah={hauteur} type="auto">
        <Stack gap={6}>
          {paragraphes.map((segments, i) => (
            <Text key={i} size="sm" mih={20} style={{ whiteSpace: "pre-wrap" }} dir="auto">
              {segments.map((segment, j) =>
                segment.sorte === "texte" ? (
                  <span key={j}>{segment.texte}</span>
                ) : (
                  <Mark key={j} color={segment.sorte === "balise" ? "orange" : "teal"} px={2}>
                    {segment.texte}
                  </Mark>
                ),
              )}
            </Text>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  );
}
