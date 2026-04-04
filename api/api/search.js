const axios = require("axios");

// Token management
let _token = null;
let _tokenTime = 0;

async function getToken() {
  const now = Date.now();
  // Use cached token if less than 5 hours old
  if (_token && (now - _tokenTime) < 5 * 3600 * 1000) return _token;

  // Try to get new token via refresh
  const refreshToken = process.env.ML_REFRESH_TOKEN;
  const appId = process.env.ML_APP_ID;
  const secret = process.env.ML_SECRET;

  if (refreshToken && appId && secret) {
    try {
      const res = await axios.post(
        "https://api.mercadolibre.com/oauth/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: appId,
          client_secret: secret,
          refresh_token: refreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
      );
      _token = res.data.access_token;
      _tokenTime = now;
      return _token;
    } catch (e) {
      console.error("Token refresh failed:", e.message);
    }
  }

  // Fallback: use access token directly
  if (process.env.ML_ACCESS_TOKEN) {
    _token = process.env.ML_ACCESS_TOKEN;
    _tokenTime = now;
    return _token;
  }

  return null;
}

function cleanQuery(q) {
  return q
    .replace(/Cód[:\s.]+[\w\-]+/gi, "")
    .replace(/\(NÃO\s+\w+\)/gi, "")
    .replace(/\([^)]{0,30}\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: "Parâmetro q obrigatório" });

  q = cleanQuery(q);
  if (!q) return res.status(400).json({ error: "Nome inválido" });

  try {
    const token = await getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const searchRes = await axios.get(
      "https://api.mercadolibre.com/sites/MLB/search",
      {
        params: { q, limit },
        headers,
        timeout: 10000,
      }
    );

    const items = (searchRes.data.results || []).filter(i => i.price > 0);

    return res.status(200).json({
      query: q,
      total_listings: searchRes.data.paging?.total || 0,
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        condition: item.condition,
        sold_quantity: item.sold_quantity || 0,
        free_shipping: item.shipping?.free_shipping || false,
        daily_visits: null,
        seller_reputation: item.seller?.seller_reputation?.level_id || null,
      })),
    });
  } catch (err) {
    console.error("Search error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
