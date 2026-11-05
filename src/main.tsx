import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import { theme } from "./theme";
import { definirLangue } from "./moteur";
import { langue } from "./textes";

// Le cœur produit ses messages et ses documents (bon à tirer, planches) dans la langue de l'interface.
document.documentElement.lang = langue;
definirLangue(langue).catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="bottom-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
