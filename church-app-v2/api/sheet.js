// Vercel serverless function: fetch a Google Sheet's CSV export SERVER-SIDE and hand it
// back to the browser. The browser can't fetch Google's export URL directly — it's
// CORS-blocked — but a server has no such restriction. Deployed automatically by Vercel
// from this /api folder; no separate infra to set up.
//
// SSRF guard: only Google Sheets URLs are allowed, so this can't be turned into an
// open proxy for arbitrary internal or third-party addresses.
export default async function handler(req, res) {
  const url = req.query?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing ?url" });
  }
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) {
    return res.status(400).json({ error: "Only Google Sheets URLs are allowed" });
  }
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) {
      return res.status(502).json({
        error: `Google returned ${r.status}. Make sure the sheet is shared "Anyone with the link can view".`,
      });
    }
    const text = await r.text();
    // If Google handed back an HTML sign-in/permission page instead of CSV, the sheet
    // isn't publicly readable — say so rather than trying to parse HTML as rows.
    if (/^\s*<(!doctype|html)/i.test(text)) {
      return res.status(502).json({
        error: 'The sheet isn\'t publicly readable. Set sharing to "Anyone with the link can view".',
      });
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ error: `Couldn't fetch the sheet: ${e.message}` });
  }
}
