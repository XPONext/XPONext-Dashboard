/* Aufrufe an die Generatoren (Vertrag, Angebot).

   Lokal ist VERTRAG_API leer, dann sind die Pfade relativ und serve.py
   antwortet. Gehostet zeigt es auf den Railway-Service; dort prüft der Server
   dasselbe Team-Passwort, das für Supabase ohnehin im localStorage liegt.

   Liegt hier statt in den Reitern, weil beide dieselbe Adresse, denselben
   Header und dieselbe Fehlerbehandlung brauchen. */

import { VERTRAG_API, SECRET_STORAGE_KEY } from "../config.js";

export async function hole(weg, optionen = {}){
  const kopf = { ...(optionen.headers || {}) };
  const secret = localStorage.getItem(SECRET_STORAGE_KEY);
  if(secret) kopf["x-app-secret"] = secret;
  const antwort = await fetch(VERTRAG_API + weg, { ...optionen, headers: kopf });
  const inhalt = await antwort.json().catch(()=>({}));
  if(!antwort.ok){
    // FastAPI verpackt Fehler in "detail", serve.py in "fehler".
    throw new Error(inhalt.detail || inhalt.fehler || ("HTTP " + antwort.status));
  }
  return inhalt;
}

export function sende(weg, daten){
  return hole(weg, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(daten),
  });
}

export function base64ZuBlob(b64, typ){
  const roh = atob(b64);
  const bytes = new Uint8Array(roh.length);
  for(let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return new Blob([bytes], { type: typ });
}

export function ladeKnopf(beschriftung, blob, dateiname){
  const a = document.createElement("a");
  a.className = "auftrag-download";
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  a.textContent = beschriftung;
  return a;
}

export const IST_LOKAL = !VERTRAG_API;
