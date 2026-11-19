import type { Catalog } from "../../core";
import type { localUi as en } from "../en/localUi";

export const localUi: Catalog<typeof en> = {
  title: "Din Liv",
  "badge.none": "Original",
  "badge.ready": "Din versjon",
  "badge.broken": "Sikker modus",
  "badge.unknown": "Ukjent",
  "none.body":
    "Du bruker den originale appen. Be Liv om å endre et skjermbilde, så bygger den din egen versjon; du kan alltid komme tilbake hit.",
  "ready.body": "Din egen versjon av appen er klar. Liv åpner den hver gang den starter.",
  "broken.body":
    "Din egen versjon startet ikke sist, så Liv åpnet den originale appen. Be Liv om å fikse den, eller åpne den igjen.",
  "local.body": "Du bruker din egen versjon av appen, laget av Liv på denne PC-en.",
  "local.noReturn": "Start Liv på nytt for å åpne den originale appen.",
  builtAt: "Bygget {time}",
  open: "Åpne din Liv",
  useOriginal: "Bruk original Liv",
  failed: "Kunne ikke bytte",
};
