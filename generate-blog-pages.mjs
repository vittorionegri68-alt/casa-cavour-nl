// ─────────────────────────────────────────────────────────────────────────────
// generate-blog-pages.mjs
//
// Genera una pagina HTML statica per ciascun articolo attivo del blog (letti da
// src/posts.jsx) e la salva in public/post/{slug}.html. Ogni pagina è un URL
// individuale, condivisibile e citabile, con link alla home, link interni verso
// altri articoli (quando presenti nel contenuto) e un CTA verso il profilo
// Instagram @bnb_bertinoro.
//
// Perché esiste: il blog è renderizzato solo lato client (React, stato
// "aperto" in App.jsx), quindi oggi nessun articolo ha un indirizzo proprio.
// generate-blog-noscript.mjs risolve la leggibilità del testo per i crawler
// senza JS sull'unico URL della home, ma non risolve condivisibilità né link
// interni tra articoli: per questo serve un URL dedicato per articolo.
//
// Si esegue automaticamente ad ogni build (vedi package.json: "build"), quindi
// resta sempre sincronizzato con posts.jsx, sia per gli articoli esistenti che
// per ogni nuovo articolo pubblicato in futuro. Non richiede alcun passo
// manuale aggiuntivo.
//
// Nota sullo slug: l'id di un articolo in posts.jsx è pensato come chiave
// interna per React (stato "aperto"), non come URL pubblico. Per questo lo
// slug del file viene derivato con normalizzazione (minuscolo, spazi/accenti
// rimossi), invece di usare l'id grezzo: un id non conforme come
// "Aprile in Romagna" produrrebbe altrimenti un URL non valido
// (/post/Aprile in Romagna.html). Il campo id originale non viene toccato.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const POSTS_PATH = join(ROOT, "src", "posts.js");
const OUT_DIR = join(ROOT, "public", "post");

const SITE_URL = "https://nl.casa-cavour.com";
const INSTAGRAM_URL = "https://www.instagram.com/bnb_bertinoro/";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61577458010505";

function isSocialBlock(b) {
  if (b.tipo === "titoletto" && b.testo.trim().toLowerCase() === "volg ons op social media") return true;
  if (b.tipo === "link" && (b.testo.includes("instagram.com") || b.testo.includes("facebook.com"))) return true;
  return false;
}

function isBlogHomeLink(b) {
  return b.tipo === "link" && b.testo.includes("casa-cavour.com/#blog");
}

// posts.jsx contiene tipicamente due link verso #blog per articolo (uno prima
// di "Leggi anche", uno subito dopo, quest'ultimo senza etichetta quindi
// renderizzato come URL grezzo): risultato duplicato e poco leggibile sulla
// pagina statica. Qui vengono rimossi entrambi e reinserito un solo link con
// etichetta corretta, subito dopo il paragrafo di "Leggi anche" quando
// presente, altrimenti in coda al contenuto.
function buildContenuto(post) {
  const filtered = post.contenuto.filter((b) => !isSocialBlock(b) && !isBlogHomeLink(b));
  const linkBlogHome = { tipo: "link", testo: `${SITE_URL}/#blog`, etichetta: "Ontdek meer artikelen over het gebied" };

  const idx = filtered.findIndex((b) => b.tipo === "titoletto" && b.testo.trim().toLowerCase() === "lees ook");
  if (idx === -1) {
    filtered.push(linkBlogHome);
    return filtered;
  }
  let insertAt = idx + 1;
  if (filtered[insertAt] && filtered[insertAt].tipo === "paragrafo") insertAt++;
  filtered.splice(insertAt, 0, linkBlogHome);
  return filtered;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function slugify(id) {
  return String(id)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove accenti
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  // Stesso approccio di generate-blog-noscript.mjs, per coerenza.
  const tmpPath = join(ROOT, "src", `_posts-tmp-pages-${Date.now()}.mjs`);
  copyFileSync(POSTS_PATH, tmpPath);
  try {
    const mod = await import(pathToFileURL(tmpPath).href);
    return mod.posts;
  } finally {
    unlinkSync(tmpPath);
  }
}

function renderContentBlock(b) {
  if (b.tipo === "paragrafo") {
    return `      <p>${escapeHtml(b.testo)}</p>`;
  }
  if (b.tipo === "titoletto") {
    return `      <h2>${escapeHtml(b.testo)}</h2>`;
  }
  if (b.tipo === "link") {
    const isInstagram = b.testo.includes("instagram");
    const isFacebook = b.testo.includes("facebook");
    const label = b.etichetta ? b.etichetta : isInstagram ? "Instagram" : isFacebook ? "Facebook" : b.testo;
    return `      <p><a class="btn-link" href="${escapeAttr(b.testo)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a></p>`;
  }
  if (b.tipo === "download") {
    const parts = [];
    if (b.src1) parts.push(`<a class="btn-link" href="${escapeAttr(b.src1)}" download>↓ ${escapeHtml(b.label1 || "Scarica")}</a>`);
    if (b.src2) parts.push(`<a class="btn-link" href="${escapeAttr(b.src2)}" download>↓ ${escapeHtml(b.label2 || "Scarica")}</a>`);
    return `      <p>${parts.join(" ")}</p>`;
  }
  return null;
}

function renderPage(post) {
  const slug = post.slug;
  const url = `${SITE_URL}/post/${slug}.html`;
  const title = `${post.titolo} | Casa Cavour Bertinoro`;
  const description = post.sommario;
  const dateIso = new Date(post.data).toISOString();

  const bodyBlocks = buildContenuto(post).map(renderContentBlock).filter(Boolean).join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.titolo,
    "description": post.sommario,
    "datePublished": post.data,
    "dateModified": post.data,
    "url": url,
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "author": { "@type": "Organization", "name": "Casa Cavour Bertinoro" },
    "publisher": {
      "@type": "Organization",
      "name": "Casa Cavour Bertinoro",
      "url": SITE_URL,
    },
  };

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <link rel="canonical" href="${escapeAttr(url)}" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeAttr(post.titolo)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(url)}" />
    <meta property="og:site_name" content="Casa Cavour Bertinoro" />
    <meta property="article:published_time" content="${dateIso}" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttr(post.titolo)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />

    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

    <style>
      :root { --gold:#a0782a; --text:#1a1612; --textMid:#5a5248; --textSoft:#9a9088; --bg:#faf8f4; --border:rgba(160,120,42,0.18); }
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:var(--bg);color:var(--text);font-family:'DM Sans',Arial,sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased;}
      .wrap{max-width:720px;margin:0 auto;padding:3rem 1.5rem 5rem;}
      .top-nav{font-size:0.78rem;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2.5rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;}
      .top-nav a{color:var(--gold);text-decoration:none;font-weight:700;}
      .share-btn{background:none;border:1px solid var(--border);color:var(--textMid);font-family:inherit;font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0.45rem 1rem;cursor:pointer;}
      .share-btn:hover{border-color:var(--gold);color:var(--gold);}
      .cat{display:inline-block;font-size:0.68rem;letter-spacing:0.16em;color:var(--gold);text-transform:uppercase;border:1px solid var(--border);padding:0.2rem 0.6rem;margin-right:0.75rem;}
      time{font-size:0.75rem;color:var(--textSoft);}
      h1{font-family:Georgia,serif;font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.15;margin:1rem 0;}
      .sommario{font-family:Georgia,serif;font-style:italic;color:var(--gold);font-size:1.05rem;margin-bottom:2rem;padding-bottom:2rem;border-bottom:1px solid var(--border);}
      h2{font-family:Georgia,serif;font-size:1.35rem;margin:2rem 0 0.6rem;}
      p{color:var(--textMid);font-size:0.98rem;margin-bottom:1.1rem;}
      .btn-link{display:inline-block;color:var(--gold);border:1.5px solid var(--gold);padding:0.55rem 1.1rem;font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;margin:0.25rem 0.5rem 0.25rem 0;}
      .ig-cta{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border);text-align:center;}
      .ig-cta p{color:var(--textMid);font-size:0.92rem;margin-bottom:1rem;}
      .ig-cta-icons{display:flex;justify-content:center;gap:1rem;}
      .ig-cta-icons a{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:1.5px solid var(--gold);border-radius:50%;color:var(--gold);text-decoration:none;transition:background 0.2s;}
      .ig-cta-icons a:hover{background:rgba(160,120,42,0.1);}
      footer{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border);text-align:center;}
      footer a{color:var(--gold);text-decoration:none;font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top-nav">
        <a href="${SITE_URL}/#blog">← Terug naar Casa Cavour</a>
        <button type="button" class="share-btn" id="share-btn">Delen ↗</button>
      </div>
      <span class="cat">${escapeHtml(post.categoria)}</span>
      <time datetime="${escapeAttr(post.data)}">${escapeHtml(formatDate(post.data))}</time>
      <h1>${escapeHtml(post.titolo)}</h1>
      <p class="sommario">${escapeHtml(post.sommario)}</p>
${bodyBlocks}
      <div class="ig-cta">
        <p>Volg ons op Instagram om niets te missen van nieuwe content over Bertinoro en de heuvels van de Romagna.</p>
        <div class="ig-cta-icons">
          <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>
          </a>
          <a href="${FACEBOOK_URL}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15 3h-2.5C10 3 8.5 4.6 8.5 7.2V10H6v3.2h2.5V21h3.3v-7.8h2.6l.5-3.2h-3.1V7.5c0-.9.3-1.5 1.6-1.5H15V3z"/></svg>
          </a>
        </div>
      </div>
      <footer><a href="${SITE_URL}/">Casa Cavour Bertinoro — Terug naar home</a></footer>
    </div>
    <script>
      (function () {
        var btn = document.getElementById("share-btn");
        if (!btn) return;
        var url = ${JSON.stringify(url)};
        var title = ${JSON.stringify(post.titolo)};
        var text = ${JSON.stringify(post.sommario)};
        var defaultLabel = btn.textContent;
        btn.addEventListener("click", async function () {
          // url ook opgenomen in "text": sommige clients (bv. e-mailapps) lezen
          // alleen het text-veld en negeren url, anders zou de link niet in de
          // berichttekst terechtkomen. Geen apart url-veld: sommige apps (bv.
          // WhatsApp) voegen text en url anders dubbel samen.
          var shareData = { title: title, text: text + "\\n\\n" + url };
          if (navigator.share) {
            try { await navigator.share(shareData); } catch (e) {}
            return;
          }
          try {
            await navigator.clipboard.writeText(url);
            btn.textContent = "Link gekopieerd ✓";
            setTimeout(function () { btn.textContent = defaultLabel; }, 2000);
          } catch (e) {
            window.prompt("Kopieer de link van het artikel:", url);
          }
        });
      })();
    </script>
  </body>
</html>
`;
}

async function main() {
  const posts = await loadPosts();

  const visibili = posts.filter((p) => p.attivo);

  if (visibili.length === 0) {
    console.warn("generate-blog-pages: nessun articolo attivo trovato, nessuna pagina generata.");
    return;
  }

  // Deriva lo slug per ciascun post e verifica che non ci siano collisioni
  // (id diversi che normalizzano allo stesso slug).
  const seen = new Map();
  for (const p of visibili) {
    const slug = slugify(p.id);
    if (!slug) {
      throw new Error(`generate-blog-pages: id "${p.id}" produce uno slug vuoto, correggere l'id in posts.jsx.`);
    }
    if (seen.has(slug)) {
      throw new Error(`generate-blog-pages: collisione di slug "${slug}" tra id "${seen.get(slug)}" e "${p.id}". Correggere uno dei due id in posts.jsx.`);
    }
    seen.set(slug, p.id);
    p.slug = slug;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // Rimuove pagine orfane (articoli disattivati o rinominati) prima di rigenerare,
  // così public/post/ resta sempre uno specchio esatto degli articoli attivi.
  const attesi = new Set(visibili.map((p) => `${p.slug}.html`));
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".html") && !attesi.has(f)) {
      unlinkSync(join(OUT_DIR, f));
    }
  }

  for (const post of visibili) {
    const html = renderPage(post);
    writeFileSync(join(OUT_DIR, `${post.slug}.html`), html, "utf8");
  }

  console.log(`generate-blog-pages: generate ${visibili.length} pagine in public/post/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
