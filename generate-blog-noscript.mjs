// ─────────────────────────────────────────────────────────────────────────────
// generate-blog-noscript.mjs
//
// Genera automaticamente il testo integrale degli articoli del blog (letti da
// src/posts.jsx) e li inserisce nel blocco statico <noscript> di index.html,
// tra i marcatori BLOG-STATIC-START / BLOG-STATIC-END.
//
// Perché esiste: il blog è renderizzato solo lato client (React, stato
// "aperto"), quindi i crawler che non eseguono JavaScript (molti crawler AI:
// GPTBot, PerplexityBot, ecc.) non vedono mai il testo degli articoli.
// Questo script duplica il contenuto in una forma statica leggibile da
// qualunque crawler, seguendo lo stesso pattern già usato per FAQ e dotazioni.
//
// Si esegue automaticamente ad ogni build (vedi package.json: "build") quindi
// resta sempre sincronizzato con posts.jsx, sia per gli articoli esistenti
// che per ogni nuovo articolo pubblicato in futuro. Non richiede alcun passo
// manuale aggiuntivo.
//
// v2 (24/09/2026): i link interni [[etichetta|id]] dentro i paragrafi vengono
// risolti in link <a> verso la pagina statica dell'articolo (/post/{slug}.html),
// con la stessa regex e la stessa logica slug di generate-blog-pages.mjs.
// Prima venivano pubblicati in chiaro nel noscript. Un id inesistente o
// disattivato blocca la build, come in generate-blog-pages.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const POSTS_PATH = join(ROOT, "src", "posts.js");
const INDEX_PATH = join(ROOT, "index.html");
const SITE_URL = "https://nl.casa-cavour.com";

const START_MARKER = "<!-- BLOG-STATIC-START (generato automaticamente da generate-blog-noscript.mjs, non modificare a mano) -->";
const END_MARKER = "<!-- BLOG-STATIC-END -->";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Stessa normalizzazione di generate-blog-pages.mjs: gli slug devono
// coincidere con i nomi file reali in public/post/.
function slugify(id) {
  return String(id)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const INTERNAL_LINK_RE = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

function renderParagraphWithLinks(testo, idToSlug) {
  let result = "";
  let lastIndex = 0;
  let match;
  INTERNAL_LINK_RE.lastIndex = 0;
  while ((match = INTERNAL_LINK_RE.exec(testo)) !== null) {
    const [full, label, targetId] = match;
    result += escapeHtml(testo.slice(lastIndex, match.index));
    const slug = idToSlug.get(targetId);
    if (!slug) {
      throw new Error(
        `generate-blog-noscript: link interno verso id "${targetId}" non trovato tra gli articoli attivi (etichetta: "${label}"). Correggere l'id nel file dei post.`
      );
    }
    result += `<a href="${escapeHtml(`${SITE_URL}/post/${slug}.html`)}">${escapeHtml(label)}</a>`;
    lastIndex = match.index + full.length;
  }
  result += escapeHtml(testo.slice(lastIndex));
  return result;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

async function loadPosts() {
  // posts.jsx non contiene sintassi JSX (solo oggetti JS), quindi può essere
  // importato come modulo ES puro: basta una copia temporanea con estensione .mjs.
  const tmpPath = join(ROOT, "src", `_posts-tmp-${Date.now()}.mjs`);
  copyFileSync(POSTS_PATH, tmpPath);
  try {
    const mod = await import(pathToFileURL(tmpPath).href);
    return mod.posts;
  } finally {
    unlinkSync(tmpPath);
  }
}

function renderArticle(post, idToSlug) {
  const blocks = post.contenuto
    .map((b) => {
      if (b.tipo === "paragrafo") return `      <p>${renderParagraphWithLinks(b.testo, idToSlug)}</p>`;
      if (b.tipo === "titoletto") return `      <h4>${escapeHtml(b.testo)}</h4>`;
      // "link" e "download" sono elementi di navigazione/CTA, non contenuto
      // testuale utile per l'estrazione GEO/AEO: vengono omessi di proposito.
      return null;
    })
    .filter(Boolean)
    .join("\n");

  return [
    `    <article>`,
    `      <h3>${escapeHtml(post.titolo)}</h3>`,
    `      <time datetime="${escapeHtml(post.data)}">${escapeHtml(formatDate(post.data))}</time>`,
    `      <p><em>${escapeHtml(post.sommario)}</em></p>`,
    blocks,
    `    </article>`,
  ].join("\n");
}

async function main() {
  const posts = await loadPosts();

  const visibili = posts
    .filter((p) => p.attivo)
    .sort((a, b) => new Date(b.data) - new Date(a.data));

  if (visibili.length === 0) {
    console.warn("generate-blog-noscript: nessun articolo attivo trovato, blocco non generato.");
    return;
  }

  // Mappa id -> slug su tutti gli articoli attivi (come generate-blog-pages.mjs).
  const idToSlug = new Map(visibili.map((p) => [p.id, slugify(p.id)]));

  const articlesHtml = visibili.map((p) => renderArticle(p, idToSlug)).join("\n\n");

  const generated = [
    START_MARKER,
    `    <h2>Blog — Verhalen uit de Romagna</h2>`,
    articlesHtml,
    END_MARKER,
  ].join("\n");

  const html = readFileSync(INDEX_PATH, "utf8");

  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);

  let newHtml;
  if (startIdx !== -1 && endIdx !== -1) {
    // Blocco già presente: sostituisce solo la parte tra i marcatori.
    newHtml = html.slice(0, startIdx) + generated + html.slice(endIdx + END_MARKER.length);
  } else {
    // Prima esecuzione: inserisce il blocco appena prima della chiusura di </article> finale del noscript.
    // Tollerante agli spazi di indentazione reali del file.
    const closingRe = /(\s*)<\/article>(\s*)<\/main>(\s*)<\/noscript>/;
    const match = html.match(closingRe);
    if (!match) {
      throw new Error(
        "generate-blog-noscript: non trovo il punto di inserimento atteso in index.html (chiusura </article></main></noscript>). Controllare manualmente la struttura del file."
      );
    }
    const [full, ws1, ws2, ws3] = match;
    const replacement = `${ws1}</article>\n\n${generated}${ws2}</main>${ws3}</noscript>`;
    newHtml = html.slice(0, match.index) + replacement + html.slice(match.index + full.length);
  }

  writeFileSync(INDEX_PATH, newHtml, "utf8");
  console.log(`generate-blog-noscript: inseriti ${visibili.length} articoli nel blocco statico di index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
