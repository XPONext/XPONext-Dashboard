/* Supabase-Client und Zugangsschutz.
   Der Anon-Key ist oeffentlich; der eigentliche Schutz sind RLS-Policies, die
   auf den Header x-app-secret pruefen. Das Team-Passwort liegt nur im
   localStorage des jeweiligen Rechners. */

import { SUPABASE_URL, SUPABASE_ANON_KEY, SECRET_STORAGE_KEY } from "./config.js";

/* Live-Binding: importierende Module sehen die Zuweisung aus ensureAuthorized().
   Nur dieses Modul darf db zuweisen. */
export let db;

function buildClient(secret){
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { "x-app-secret": secret } }
  });
}

/* Vergisst das gespeicherte Passwort. Aufrufen, wenn Supabase 401/403 meldet —
   sonst sieht man nach einem serverseitigen Secret-Wechsel nur noch Fehler
   statt der Passwortabfrage. */
export function forgetSecret(){
  localStorage.removeItem(SECRET_STORAGE_KEY);
}

export async function ensureAuthorized(){
  let secret = localStorage.getItem(SECRET_STORAGE_KEY);
  while(true){
    if(!secret){
      secret = window.prompt("Team-Passwort für den KPI-Tracker eingeben:");
      if(secret === null){
        document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif;'>Ohne Passwort kein Zugriff auf den Tracker.</p>";
        throw new Error("Kein Passwort eingegeben");
      }
    }
    db = buildClient(secret);

    // Der Test muss ein SCHREIBvorgang sein: Bei falschem Secret greift die
    // RLS-Policy und ein SELECT liefert eine leere Liste OHNE Fehler — damit
    // wuerde jedes Passwort durchgehen. Nur der Verstoss gegen "with check"
    // erzeugt einen echten Fehler.
    //
    // Preis dafuer ist eine Geisterzeile in daily_team mit dem Datum
    // 2000-01-01. Sauber loesen wir das in Schritt 2 (Kunden-SQL) mit einer
    // kleinen RPC-Funktion, die nur "ok" zurueckgibt und deren Ausfuehrungs-
    // recht am selben Secret haengt.
    const { error } = await db.from("daily_team").upsert({ date: "2000-01-01", termine_gebucht: 0 });
    if(!error){
      localStorage.setItem(SECRET_STORAGE_KEY, secret);
      return;
    }
    alert("Falsches Passwort, bitte erneut versuchen.");
    secret = null;
  }
}
