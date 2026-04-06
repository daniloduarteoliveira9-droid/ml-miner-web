const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MLMiner/1.0" } }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({}); }
      });
    }).on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  let q = req.query.q || "";
  q = q.replace(/Cód[:\s.]+[\w\-]+/gi, "").replace(/\([^)]{0,30}\)/g, "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: "q obrigatório" });

  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=20`;
    const data = await get(url);
    const items = (data.results || []).filter(i => i.price > 0);

    return res.status(200).json({
      query: q,
      total_listings: data.paging?.total || 0,
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        price: i.price,
        condition: i.condition,
        sold_quantity: i.sold_quantity || 0,
        free_shipping: i.shipping?.free_shipping || false,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
