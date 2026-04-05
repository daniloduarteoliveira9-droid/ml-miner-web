const https = require("https");

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": "MLMiner/1.0", ...headers },
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on("error", reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = body.toString();
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function getToken() {
  const refreshToken = process.env.ML_REFRESH_TOKEN;
  const appId = process.env.ML_APP_ID;
  const secret = process.env.ML_SECRET;

  if (refreshToken && appId && secret) {
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: secret,
        refresh_token: refreshToken,
      });
      const res = await httpPost("https://api.mercadolibre.com/oauth/token", body);
      if (res.status === 200 && res.data.access_token) {
        return res.data.access_token;
      }
    } catch (e) {
      console.error("Token refresh failed:", e.message);
    }
  }

  return process.env.ML_ACCESS_TOKEN || null;
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

    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    const result = await httpGet(url, headers);

    if (result.status !== 200) {
      return res.status(result.status).json({ error: `ML API error ${result.status}`, detail: result.data });
    }

    const items = (result.data.results || []).filter(i => i.price > 0);

    return res.status(200).json({
      query: q,
      total_listings: result.data.paging?.total || 0,
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
