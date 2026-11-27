// Controllo di indicizzabilita' tecnica di un sito gia' online.
//
// Verifica che quello che il server consegna davvero ai crawler sia coerente:
// ogni URL dichiarato nella sitemap deve esistere, essere raggiungibile da un
// link vero nell'HTML servito, non essere escluso dagli indici e dichiarare le
// altre lingue in modo reciproco.
//
// Gira dopo ogni deploy di produzione, prima della segnalazione a IndexNow,
// cosi' un contenuto non indicizzabile si vede subito e non viene segnalato.
//
// Uso: SITE_URL=https://www.esempio.com node check-indexability.mjs
// Esce con codice 1 se trova almeno un errore bloccante.

let SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
const TIMEOUT = Number(process.env.CHECK_TIMEOUT_MS || 20000);
const CONCORRENZA = 5;

if (!SITE_URL) {
  console.error("SITE_URL non impostata.");
  process.exit(1);
}

const errori = [];
const avvisi = [];
const err = (m) => errori.push(m);
const avv = (m) => avvisi.push(m);

// Una pagina viene scaricata una volta sola: le verifiche incrociate sugli
// hreflang rileggono dalla cache invece di ripetere la richiesta.
const cache = new Map();

async function scarica(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { redirect: "manual", signal: ctrl.signal });
      const corpo = r.status >= 200 && r.status < 300 ? await r.text() : "";
      return { status: r.status, headers: r.headers, corpo, location: r.headers.get("location") };
    } catch (e) {
      return { status: 0, headers: new Headers(), corpo: "", errore: e.message };
    } finally {
      clearTimeout(t);
    }
  })();
  cache.set(url, p);
  return p;
}

async function inLotti(voci, fn) {
  const out = [];
  for (let i = 0; i < voci.length; i += CONCORRENZA) {
    out.push(...(await Promise.all(voci.slice(i, i + CONCORRENZA).map(fn))));
  }
  return out;
}

const normalizza = (u) => {
  try {
    const x = new URL(u);
    x.hash = "";
    return (x.origin + x.pathname).replace(/\/$/, "") || x.origin;
  } catch {
    return u;
  }
};

const estrai = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

// ---------------------------------------------------------------- sitemap
let sm = await scarica(SITE_URL + "/sitemap.xml");

// Se il dominio indicato rimanda altrove, ad esempio da apex a www, il controllo
// prosegue sull'indirizzo canonico invece di fermarsi sul redirect.
if (sm.status >= 300 && sm.status < 400 && sm.location) {
  const dest = new URL(sm.location, SITE_URL);
  avv(`${SITE_URL} rimanda a ${dest.origin}, proseguo su quell'indirizzo`);
  SITE_URL = dest.origin;
  sm = await scarica(SITE_URL + "/sitemap.xml");
}

if (sm.status !== 200) {
  console.error(`BLOCCANTE  sitemap.xml non raggiungibile (HTTP ${sm.status}${sm.errore ? ", " + sm.errore : ""})`);
  process.exit(1);
}
const loc = estrai(sm.corpo, /<loc>\s*([^<\s]+)\s*<\/loc>/g);
if (loc.length === 0) {
  console.error("BLOCCANTE  la sitemap non contiene nessun URL");
  process.exit(1);
}
if (/changefreq|priority/.test(sm.corpo)) avv("la sitemap contiene changefreq o priority, che lo standard del progetto esclude");

// ------------------------------------------------- home e link realmente serviti
const home = await scarica(SITE_URL + "/");
if (home.status !== 200) err(`la home risponde HTTP ${home.status}`);

const hrefHome = new Set(
  estrai(home.corpo, /href="([^"#]+)"/g).map((h) => normalizza(h.startsWith("http") ? h : SITE_URL + (h.startsWith("/") ? "" : "/") + h))
);

// JSON-LD della home: deve esserci ed essere leggibile da una macchina.
const blocchi = estrai(home.corpo, /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g);
if (blocchi.length === 0) avv("nessun blocco JSON-LD nella home");
blocchi.forEach((b, i) => {
  try {
    JSON.parse(b);
  } catch (e) {
    err(`il blocco JSON-LD numero ${i + 1} della home non e' valido: ${e.message}`);
  }
});

// ------------------------------------------------------------- file di istruzioni
const robots = await scarica(SITE_URL + "/robots.txt");
if (robots.status !== 200) err(`robots.txt non raggiungibile (HTTP ${robots.status})`);
else if (!/sitemap:/i.test(robots.corpo)) avv("robots.txt non dichiara la sitemap");

for (const f of ["llms.txt", "ai.txt"]) {
  const r = await scarica(`${SITE_URL}/${f}`);
  if (r.status !== 200) avv(`${f} non raggiungibile (HTTP ${r.status})`);
}

// Chiave IndexNow: se il repo ne contiene una, il dominio deve servirla, altrimenti
// ogni segnalazione a Bing viene rifiutata e il sito smette di essere avvisato.
const { readdirSync, existsSync } = await import("node:fs");
if (existsSync("public")) {
  for (const nome of readdirSync("public").filter((n) => /^[a-f0-9]{8,128}\.txt$/i.test(n))) {
    const chiave = nome.replace(/\.txt$/i, "");
    const r = await scarica(`${SITE_URL}/${nome}`);
    if (r.status !== 200) err(`la chiave IndexNow ${nome} non e' servita (HTTP ${r.status})`);
    else if (r.corpo.trim() !== chiave) err(`la chiave IndexNow ${nome} e' servita con un contenuto diverso dal nome del file`);
  }
}

// ------------------------------------------------------------- pagine della sitemap
const pagine = await inLotti(loc, async (u) => ({ url: u, r: await scarica(u) }));

for (const { url, r } of pagine) {
  if (r.status === 0) { err(`${url} non risponde (${r.errore})`); continue; }
  if (r.status >= 300 && r.status < 400) {
    err(`${url} e' dichiarato nella sitemap ma risponde ${r.status} verso ${r.location}`);
    continue;
  }
  if (r.status !== 200) { err(`${url} risponde HTTP ${r.status}`); continue; }

  const xr = r.headers.get("x-robots-tag") || "";
  const meta = (r.corpo.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i) || [])[1] || "";
  if (/noindex/i.test(xr + " " + meta)) err(`${url} e' nella sitemap ma e' escluso dagli indici (noindex)`);

  const can = (r.corpo.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) || [])[1];
  if (can && normalizza(can) !== normalizza(url)) err(`${url} ha un canonical diverso da se stesso: ${can}`);

  // Un crawler che non esegue JavaScript trova la pagina solo se un link vero
  // la raggiunge. Vale per gli URL di questo host, la home esclusa.
  if (normalizza(url) !== normalizza(SITE_URL) && new URL(url).host === new URL(SITE_URL).host) {
    if (!hrefHome.has(normalizza(url))) err(`${url} e' nella sitemap ma nessun link lo raggiunge nell'HTML servito della home`);
  }
}

// ------------------------------------------------------------------- hreflang
for (const { url, r } of pagine) {
  if (r.status !== 200) continue;
  const alt = [...r.corpo.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)]
    .map((m) => ({ lang: m[1], href: m[2] }));
  if (alt.length === 0) continue;

  for (const a of alt) {
    if (a.lang === "x-default") continue;
    const t = await scarica(a.href);
    if (t.status !== 200) { err(`${url} dichiara hreflang ${a.lang} verso ${a.href}, che risponde HTTP ${t.status}`); continue; }
    const indietro = [...t.corpo.matchAll(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/gi)].map((m) => normalizza(m[1]));
    if (!indietro.includes(normalizza(url))) err(`hreflang non reciproco: ${url} punta a ${a.href}, che non rimanda indietro`);
  }
}

// -------------------------------------------------------------------- header
const attesi = ["x-content-type-options", "x-frame-options", "referrer-policy", "strict-transport-security"];
const mancanti = attesi.filter((h) => !home.headers.get(h));
if (mancanti.length) avv(`header assenti sulla home: ${mancanti.join(", ")}`);

// --------------------------------------------------------------------- esito
console.log(`Controllo di ${SITE_URL}: ${loc.length} URL nella sitemap, ${cache.size} richieste.`);
for (const a of avvisi) console.log(`  avviso     ${a}`);
for (const e of errori) console.log(`  BLOCCANTE  ${e}`);

if (errori.length) {
  console.log(`\n${errori.length} problemi bloccanti. La segnalazione a IndexNow non viene inviata.`);
  process.exit(1);
}
console.log(`\nNessun problema bloccante${avvisi.length ? `, ${avvisi.length} avvisi` : ""}.`);
