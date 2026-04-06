const https = require("https");

function get(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    https.get(url, { headers }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    }).on("error", reject);
  });
}

function post(urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function getValidToken() {
  // Try refresh token first
  const refresh = process.env.ML_REFRESH_TOKEN;
  const appId = process.env.ML_APP_ID;
  const secret = process.env.ML_SECRET;

  if (refresh && appId && secret) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: appId,
      client_secret: secret,
      refresh_token: refresh,
    }).toString();

    const res = await post("https://api.mercadolibre.com/oauth/token", body);
    if (res.status === 200 && res.body.access_token) {
      return res.body.access_token;
    }
  }

  // Fallback to access token
  return process.env.ML_ACCESS_TOKEN || null;
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
    const token = await getValidToken();
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=20`;
    const result = await get(url, token);

    if (result.status !== 200) {
      return res.status(500).json({ 
        error: `ML retornou ${result.status}`,
        detail: result.body,
        token_used: token ? "sim" : "nao"
      });
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
