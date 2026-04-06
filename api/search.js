const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    };
    https.get(url, options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    }).on("error", reject);
  });
}

function cleanQuery(q) {
  return q
    .replace(/Cód[:\s.]+[\w\-]+/gi, "")
    .replace(/\([^)]{0,30}\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let q = req.query.q || "";
  q = cleanQuery(q);
  if (!q) return res.status(400).json({ error: "q obrigatorio" });

  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=20&sort=relevance`;
    const result = await get(url);

    if (result.status !== 200) {
      return res.status(200).json({ query: q, total_listings: 0, items: [], error_detail: result.body });
    }

    const items = (result.body.results || []).filter(i => i.price > 0);

    return res.status(200).json({
      query: q,
      total_listings: result.body.paging?.total || 0,
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
