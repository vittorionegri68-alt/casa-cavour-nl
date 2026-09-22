// api/lead.js - Vercel serverless function
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};

  // Honeypot: se compilato e' un bot. Rispondi ok senza fare nulla.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const source = (body.source || "").toString().trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email non valida" });
  }

  // 1. Notifica Telegram
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const text =
      "Nuovo lead dal sito\n" +
      "Nome: " + (name || "-") + "\n" +
      "Email: " + email + "\n" +
      "Messaggio: " + (message || "-") + "\n" +
      "Pagina: " + (source || "-");
    try {
      await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text })
      });
    } catch (e) { /* una notifica fallita non deve far fallire la risposta */ }
  }

  // 2. Opzionale: append su Google Sheet via Apps Script Web App
  const sheetUrl = process.env.SHEET_WEBAPP_URL;
  if (sheetUrl) {
    try {
      await fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, source, ts: new Date().toISOString() })
      });
    } catch (e) { /* idem */ }
  }

  // Mai restituire i dati salvati: solo conferma.
  return res.status(200).json({ ok: true });
}
