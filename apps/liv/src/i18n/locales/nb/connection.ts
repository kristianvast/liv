import type { Catalog } from "../../core";
import type { connection as en } from "../en/connection";

export const connection: Catalog<typeof en> = {
  "title.unauthorized": "Liv avviste sikkerhetsnøkkelen",
  "title.connecting": "Kobler til Liv på denne gårds-PC-en…",
  "title.unreachable": "Liv-assistenten kan ikke nås akkurat nå",
  "title.stopped": "Liv har stoppet",
  "detail.stopped":
    "Liv-assistenten stoppet igjen etter omstart. Gårdsdataene dine er trygge på denne PC-en. Detaljer: {reason}",
  "detail.unauthorized": "Start Liv på nytt, så får den en ny lokal øktnøkkel.",
  "detail.waiting":
    "Venter på den lokale Liv-agenten på {url}. Gårdsdataene dine er trygge på denne PC-en og dukker opp av seg selv når tilkoblingen er på plass.",
  "state.connecting": "Kobler til",
  "state.reconnecting": "Kobler til på nytt",
  "state.closed": "Frakoblet",
  "state.unauthorized": "Ingen tilgang",
  "state.stopped": "Stoppet",
  retry: "Prøv å koble til igjen",
  restart: "Start Liv på nytt",
};
