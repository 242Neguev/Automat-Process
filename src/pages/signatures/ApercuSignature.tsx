import { useRef, useState } from "react";

/**
 * Aperçu d'une signature dans un cadre isolé (ses styles ne touchent pas l'application), sur fond
 * clair ou sombre pour vérifier la lisibilité du logo et des couleurs.
 */
export default function ApercuSignature({ html, sombre, titre }: { html: string; sombre: boolean; titre: string }) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const [hauteur, setHauteur] = useState(160);
  const page =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{margin:20px;background:${sombre ? "#1f1f1f" : "#ffffff"};color:${sombre ? "#e8e8e8" : "#22252a"};font-family:Arial,sans-serif}` +
    `</style></head><body>${html}</body></html>`;
  return (
    <iframe
      ref={cadre}
      title={titre}
      srcDoc={page}
      sandbox="allow-same-origin"
      onLoad={() => {
        const corps = cadre.current?.contentDocument?.body;
        if (corps) setHauteur(Math.max(120, corps.scrollHeight + 40));
      }}
      style={{ display: "block", width: "100%", height: hauteur, border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}
    />
  );
}
