const https = require("https");

função obter(url) {
  retornar nova Promise((resolver, rejeitar) => {
    https.get(url, { headers: { "User-Agent": "MLMiner/1.0" } }, (res) => {
      seja d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        tente { resolver(JSON.parse(d)); }
        catch { resolve({}); }
      });
    }).on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  seja q = req.query.q || "";
  q = q.replace(/Cód[:\s.]+[\w\-]+/gi, "").replace(/\([^)]{0,30}\)/g, "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ erro: "q obrigatório" });

  tentar {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=20`;
    const data = await get(url);
    const items = (data.results || []).filter(i => i.price > 0);

    retornar res.status(200).json({
      consulta: q,
      total_listings: data.paging?.total || 0,
      itens: itens.map(i => ({
        id: i.id,
        título: i.título,
        preço: i.preço,
        condição: i.condição,
        quantidade_vendida: i.quantidade_vendida || 0,
        frete_grátis: i.frete?.frete_grátis || falso,
      })),
    });
  } catch (e) {
    retornar res.status(500).json({ error: e.message });
  }
};
