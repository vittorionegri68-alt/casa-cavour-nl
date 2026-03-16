// ── Blog (Nederlandse versie) ─────────────────────────────────────────────────
// Voeg deze import toe bovenaan App.jsx:
// import { posts } from "./posts.js";
//
// Voeg <Blog /> toe voor <FinalCTA /> in het App component

function Blog() {
  const [open, setOpen] = useState(null);
  const visibili = posts.filter(p => p.attivo);

  return (
    <section id="blog" style={{ background: C.bg2, padding: "7rem 2rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Reveal>
          <div style={{ marginBottom: "3.5rem" }}>
            <div style={{ fontSize: "0.67rem", letterSpacing: "0.28em", color: C.gold, textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: "0.85rem", display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <span style={{ width: 26, height: 1, background: C.gold, display: "inline-block" }} /> Verhalen & Tips
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontSize: "clamp(1.9rem,4vw,3.2rem)", color: C.text, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Ontdek de Romagna<br /><span style={{ color: C.gold, fontStyle: "italic" }}>door onze ogen.</span>
            </h2>
          </div>
        </Reveal>

        {open === null && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }} className="blog-grid">
            {visibili.map((post, i) => (
              <Reveal key={post.id} delay={i * 80}>
                <div
                  onClick={() => setOpen(post.id)}
                  style={{ background: C.cardBg, padding: "2rem", cursor: "pointer", transition: "all 0.3s ease", boxShadow: C.shadow }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(26,22,18,0.14)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = C.shadow; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <span style={{ fontSize: "0.62rem", letterSpacing: "0.18em", color: C.gold, textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", border: `1px solid ${C.border}`, padding: "0.2rem 0.6rem" }}>
                      {post.categoria}
                    </span>
                    <span style={{ fontSize: "0.68rem", color: C.textSoft, fontFamily: "'DM Sans',sans-serif" }}>
                      {new Date(post.data).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontSize: "1.25rem", color: C.text, fontWeight: 700, lineHeight: 1.2, marginBottom: "0.85rem", letterSpacing: "-0.01em" }}>
                    {post.titolo}
                  </h3>
                  <p style={{ fontSize: "0.83rem", color: C.textMid, lineHeight: 1.75, fontFamily: "'DM Sans',sans-serif", marginBottom: "1.25rem" }}>
                    {post.sommario}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: C.gold, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif" }}>
                    Lees meer <span>↗</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}

        {open !== null && (() => {
          const post = visibili.find(p => p.id === open);
          if (!post) return null;
          return (
            <Reveal>
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                <button
                  onClick={() => setOpen(null)}
                  style={{ background: "none", border: `1px solid ${C.border}`, padding: "0.45rem 1rem", fontSize: "0.72rem", color: C.textMid, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", marginBottom: "2.5rem", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
                  ← Alle artikelen
                </button>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.25rem" }}>
                  <span style={{ fontSize: "0.62rem", letterSpacing: "0.18em", color: C.gold, textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", border: `1px solid ${C.border}`, padding: "0.2rem 0.6rem" }}>
                    {post.categoria}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: C.textSoft, fontFamily: "'DM Sans',sans-serif" }}>
                    {new Date(post.data).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
                <h2 style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", color: C.text, fontWeight: 700, lineHeight: 1.1, marginBottom: "1rem", letterSpacing: "-0.02em" }}>
                  {post.titolo}
                </h2>
                <p style={{ fontSize: "1rem", color: C.gold, lineHeight: 1.75, fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontStyle: "italic", marginBottom: "2rem", paddingBottom: "2rem", borderBottom: `1px solid ${C.border}` }}>
                  {post.sommario}
                </p>
                {post.contenuto.map((blocco, i) => {
                  if (blocco.tipo === "paragrafo") {
                    return <p key={i} style={{ fontSize: "0.95rem", color: C.textMid, lineHeight: 1.9, fontFamily: "'DM Sans',sans-serif", marginBottom: "1.25rem" }}>{blocco.testo}</p>;
                  }
                  if (blocco.tipo === "titoletto") {
                    return <h3 key={i} style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontSize: "1.35rem", color: C.text, fontWeight: 700, marginBottom: "0.6rem", marginTop: "2rem", letterSpacing: "-0.01em" }}>{blocco.testo}</h3>;
                  }
                  return null;
                })}
                <div style={{ marginTop: "3rem", padding: "2rem", background: C.bg3, borderLeft: `3px solid ${C.gold}` }}>
                  <p style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontSize: "1.1rem", color: C.text, marginBottom: "1rem", fontStyle: "italic" }}>
                    Wil je de authentieke Romagna beleven vanuit Casa Cavour?
                  </p>
                  <a href="https://airbnb.com/h/casacavour-bertinoro" target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: C.gold, color: "#fff", padding: "0.75rem 1.5rem", fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none", fontFamily: "'DM Sans',sans-serif", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#8a6520"}
                    onMouseLeave={e => e.currentTarget.style.background = C.gold}>
                    Controleer beschikbaarheid op Airbnb ↗
                  </a>
                </div>
              </div>
            </Reveal>
          );
        })()}
      </div>
      <style>{`@media(max-width:600px){.blog-grid{grid-template-columns:1fr!important;}}`}</style>
      <DiagDivider topColor={C.bg2} botColor={C.bg} flip />
    </section>
  );
}
