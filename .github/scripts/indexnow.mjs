#!/usr/bin/env node
// .github/scripts/indexnow.mjs v1.0 - 24/11/2026
//
// Segnala a IndexNow (Bing, Yandex, Seznam, Naver) gli URL del sito, subito
// dopo che Vercel ha concluso un deploy di produzione.
//
// Perche' gira su deployment_status e non nel build: IndexNow fa crawlare in
// tempi brevi, quindi segnalare durante la build farebbe leggere la versione
// ancora online, cioe' quella vecchia.
//
// Cosa segnala: la sitemap LIVE del sito appena deployato, non quella del
// repo, cosi' l'elenco e' sempre quello realmente pubblicato (su alcuni repo
// la sitemap viene rigenerata in build e il file versionato resta indietro).
//
// Quando NON segnala: se il commit deployato non ha toccato contenuto. Un
// commit che cambia solo README, workflow o documentazione non produce
// nessuna chiamata. IndexNow e' per i contenuti nuovi o modificati, e
// ripetere l'invio a ogni deploy e' il modo per prendersi un 429.
//
// Variabili d'ambiente attese:
//   SITE_URL   origine del sito di produzione, senza slash finale
//   BASE_SHA   commit precedente (vuoto alla prima esecuzione)
//   HEAD_SHA   commit deployato
//   FORCE      "true" per segnalare comunque, saltando il controllo sul diff

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const BASE_SHA = process.env.BASE_SHA || "";
const HEAD_SHA = process.env.HEAD_SHA || "HEAD";
const FORCE = process.env.FORCE === "true";

if (!SITE_URL) {
  console.error("SITE_URL non impostata nel workflow.");
  process.exit(1);
}

// La chiave non e' un segreto: e' pubblicata come <chiave>.txt alla root del
// sito, e' il protocollo a richiederlo. Viene letta da li' invece che scritta
// nel workflow, cosi' esiste in un posto solo.
function leggiChiave() {
  const candidati = readdirSync("public").filter((f) => /^[a-f0-9]{8,128}\.txt$/i.test(f));
  if (candidati.length !== 1) {
    throw new Error(
      `attesa una sola chiave IndexNow in public/, trovate ${candidati.length}: ${candidati.join(", ") || "nessuna"}`
    );
  }
  const nome = candidati[0];
  const chiave = readFileSync(`public/${nome}`, "utf8").trim();
  if (`${chiave}.txt` !== nome) {
    throw new Error(`il contenuto di public/${nome} non coincide con il nome del file`);
  }
  return chiave;
}

// Un commit tocca contenuto se cambia il markup, il React o un file servito
// da public/ che non sia un binario. Asset e documentazione non contano.
const RE_CONTENUTO = /^(src\/|index.*\.html$|public\/)/i;
const RE_IGNORA = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|pdf|mp4)$/i;

function contenutoCambiato() {
  if (!BASE_SHA) {
    console.log("nessun commit precedente disponibile, procedo come se il contenuto fosse cambiato");
    return true;
  }
  const out = execSync(`git diff --name-only ${BASE_SHA} ${HEAD_SHA}`, { encoding: "utf8" });
  const file = out.split("\n").map((s) => s.trim()).filter(Boolean);
  const rilevanti = file.filter((f) => RE_CONTENUTO.test(f) && !RE_IGNORA.test(f));
  console.log(`file cambiati: ${file.length}, di cui rilevanti per IndexNow: ${rilevanti.length}`);
  if (rilevanti.length > 0) console.log(rilevanti.map((f) => `  ${f}`).join("\n"));
  return rilevanti.length > 0;
}

async function main() {
  if (!FORCE && !contenutoCambiato()) {
    console.log("nessuna modifica di contenuto in questo deploy, nessuna segnalazione inviata.");
    return;
  }
  if (FORCE) console.log("esecuzione forzata: salto il controllo sul diff.");

  const chiave = leggiChiave();
  const host = new URL(SITE_URL).host;

  // la chiave deve essere raggiungibile sul dominio, altrimenti IndexNow da' 403
  const verifica = await fetch(`${SITE_URL}/${chiave}.txt`);
  const servita = (await verifica.text()).trim();
  if (!verifica.ok || servita !== chiave) {
    throw new Error(`la chiave non e' servita su ${SITE_URL} (HTTP ${verifica.status})`);
  }

  const risposta = await fetch(`${SITE_URL}/sitemap.xml`);
  if (!risposta.ok) throw new Error(`sitemap non raggiungibile (HTTP ${risposta.status})`);
  const tutti = [...(await risposta.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // IndexNow accetta solo URL dell'host dichiarato: la sitemap puo' contenere
  // anche gli indirizzi delle altre lingue, e in quel caso rifiuta tutto con 422.
  const urlList = tutti.filter((u) => {
    try { return new URL(u).host === host; } catch { return false; }
  });
  if (tutti.length !== urlList.length) {
    console.log(`esclusi ${tutti.length - urlList.length} URL di altri host`);
  }
  if (urlList.length === 0) throw new Error("la sitemap live non contiene nessun URL di questo host");

  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: chiave, keyLocation: `${SITE_URL}/${chiave}.txt`, urlList }),
  });

  // 200 accettato, 202 accettato con chiave ancora in validazione
  if (r.status !== 200 && r.status !== 202) {
    throw new Error(`IndexNow ha risposto HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  console.log(`segnalati ${urlList.length} URL di ${host}, HTTP ${r.status}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
