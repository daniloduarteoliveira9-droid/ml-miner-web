// ── State ─────────────────────────────────────────────────
const BACKEND = "https://ml-miner-backend.vercel.app";
let products = [];
let fileRows = [], fileHeaders = [];

// ── Helpers ───────────────────────────────────────────────
const fmt = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
const pct = (n) => `${Number(n).toFixed(1)}%`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function updateProductCount() {
  const chip = document.getElementById("productCount");
  if (products.length > 0) {
    chip.textContent = products.length;
    chip.style.display = "inline";
  } else {
    chip.style.display = "none";
  }
}

function renderProductList() {
  const list = document.getElementById("productList");
  if (products.length === 0) { list.style.display = "none"; return; }
  list.style.display = "flex";
  list.innerHTML = products.map((p, i) => `
    <div class="product-item">
      <span class="product-item-name">${p.name}</span>
      <span class="product-item-price">${fmt(p.cost)}</span>
      <button class="btn-remove" onclick="removeProduct(${i})">×</button>
    </div>
  `).join("");
}

function removeProduct(i) {
  products.splice(i, 1);
  renderProductList();
  updateProductCount();
}

// ── Tabs ──────────────────────────────────────────────────
function switchTab(tab) {
  ["manual","csv","arquivo"].forEach(t => {
    document.getElementById("tab-" + t).style.display = t === tab ? "block" : "none";
    document.querySelectorAll(".tab")[["manual","csv","arquivo"].indexOf(t)].classList.toggle("active", t === tab);
  });
}

// ── Manual Add ────────────────────────────────────────────
function addProduct() {
  const name = document.getElementById("prodName").value.trim();
  const cost = parseFloat(document.getElementById("prodCost").value.replace(",", "."));
  if (!name || isNaN(cost) || cost <= 0) return;
  products.push({ name, cost });
  document.getElementById("prodName").value = "";
  document.getElementById("prodCost").value = "";
  renderProductList();
  updateProductCount();
}

// ── CSV Import ────────────────────────────────────────────
function importCSV() {
  const text = document.getElementById("csvText").value.trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sep = lines[0]?.includes(";") ? ";" : ",";
  let added = 0;
  lines.forEach(l => {
    const parts = l.split(sep);
    const n = parts[0]?.trim();
    const c = parseFloat(parts[1]?.trim().replace(",", "."));
    if (n && !isNaN(c) && c > 0) { products.push({ name: n, cost: c }); added++; }
  });
  if (added > 0) { renderProductList(); updateProductCount(); }
}

// ── File Upload ───────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById("uploadZone").classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) processFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (file) processFile(file);
}

async function processFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  showUploadMsg("", "");
  document.getElementById("colMap").style.display = "none";
  document.getElementById("uploadTitle").textContent = file.name;

  if (ext === "pdf") {
    await processPDF(file);
    return;
  }

  if (ext === "csv" || ext === "txt") {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 1) { showUploadMsg("error", "Arquivo vazio."); return; }
      const sep = lines[0].includes(";") ? ";" : ",";
      const firstIsHeader = isNaN(parseFloat(lines[0].split(sep)[lines[0].split(sep).length - 1]?.replace(",", ".")));
      let headers, rows;
      if (firstIsHeader && lines.length > 1) {
        headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
        rows = lines.slice(1).map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "")));
      } else {
        headers = lines[0].split(sep).map((_, i) => `Coluna ${i+1}`);
        rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "")));
      }
      autoImportOrMap(headers, rows, file.name);
    };
    reader.readAsText(file, "UTF-8");
    return;
  }

  if (ext === "xlsx" || ext === "xls") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { showUploadMsg("error", "Planilha vazia."); return; }
        const headers = data[0].map(h => String(h ?? "").trim());
        const rows = data.slice(1).map(r => headers.map((_, i) => String(r[i] ?? "").trim()));
        autoImportOrMap(headers, rows, file.name);
      } catch { showUploadMsg("error", "Erro ao ler Excel."); }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  showUploadMsg("error", "Formato não suportado.");
}

async function processPDF(file) {
  showUploadMsg("ok", "Lendo PDF...");
  try {
    if (!window.pdfjsLib) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 15); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(s => s.str).join(" ") + "\n";
    }
    const parsed = extractFromText(text);
    if (!parsed.length) { showUploadMsg("error", "Sem produtos no PDF. Verifique se tem texto selecionável."); return; }
    products.push(...parsed);
    renderProductList();
    updateProductCount();
    showUploadMsg("ok", `✓ ${parsed.length} produtos extraídos do PDF!`);
  } catch (e) {
    showUploadMsg("error", "Erro PDF: " + e.message);
  }
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function extractFromText(text) {
  const results = [];
  const seen = new Set();

  // Estratégia 1: padrão "Nome do Produto R$ 99,90" ou "Nome ... 99,90"
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 3 && l.length < 200);

  const priceRx = /R?\$?\s*(\d{1,5}[.,]\d{2})\b/;
  const loosePrice = /\b(\d{2,4})[,.]?(\d{2})?\s*$/;

  for (const line of lines) {
    // Ignora linhas que são claramente lixo
    if (/PCS\/CX|Suporte Técnico|imagens apresentadas|esclarecimentos|funcionalidades|Voltar ao topo|por por por/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (line.split(" ").length < 2) continue;

    let cost = null;
    let name = line;

    // Tenta achar preço no formato R$ XX,XX
    const m = line.match(priceRx);
    if (m) {
      cost = parseFloat(m[1].replace(",", "."));
      name = line.replace(priceRx, "").trim();
    } else {
      // Tenta preço no final da linha
      const m2 = line.match(/\b(\d{1,4})[,.](\d{2})\s*$/);
      if (m2) {
        cost = parseFloat(m2[1] + "." + m2[2]);
        name = line.replace(/\b(\d{1,4})[,.](\d{2})\s*$/, "").trim();
      }
    }

    if (!cost || cost <= 0 || cost > 50000) continue;

    // Limpa o nome
    name = name
      .replace(/Cód[:\s.]+[\w\-]+/gi, "")
      .replace(/\(NÃO\s+\w+\)/gi, "")
      .replace(/^\W+|\W+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (name.length < 4 || name.length > 100) continue;
    if (/^\d+$/.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;

    seen.add(name.toLowerCase());
    results.push({ name, cost });
  }

  return results.slice(0, 50); // máximo 50 produtos
}

function autoImportOrMap(headers, rows, fileName) {
  let ni = headers.findIndex(h => /nome|produto|descri|item|title/i.test(h));
  let ci = headers.findIndex(h => /custo|preco|preço|valor|cost|price|vlr/i.test(h));
  if (ni < 0 && ci < 0 && headers.length >= 2) { ni = 0; ci = 1; }
  if (ni >= 0 && ci >= 0) {
    const parsed = rows.map(r => {
      const n = r[ni]?.trim(); const c = parseFloat(r[ci]?.replace(",", "."));
      return n && !isNaN(c) && c > 0 ? { name: n, cost: c } : null;
    }).filter(Boolean);
    if (parsed.length > 0) {
      products.push(...parsed); renderProductList(); updateProductCount();
      showUploadMsg("ok", `✓ ${parsed.length} produtos importados de "${fileName}"`);
      return;
    }
  }
  fileHeaders = headers; fileRows = rows;
  const colNameEl = document.getElementById("colName");
  const colCostEl = document.getElementById("colCost");
  colNameEl.innerHTML = '<option value="">— selecione —</option>' + headers.map((h,i) => `<option value="${i}">${h || "Coluna "+(i+1)}</option>`).join("");
  colCostEl.innerHTML = colNameEl.innerHTML;
  if (ni >= 0) colNameEl.value = ni;
  if (ci >= 0) colCostEl.value = ci;
  document.getElementById("colMap").style.display = "block";
  showUploadMsg("ok", `${rows.length} linhas detectadas — selecione as colunas.`);
}

function importFromFile() {
  const ni = parseInt(document.getElementById("colName").value);
  const ci = parseInt(document.getElementById("colCost").value);
  if (isNaN(ni) || isNaN(ci)) { showUploadMsg("error", "Selecione as colunas."); return; }
  const parsed = fileRows.map(r => {
    const n = r[ni]?.trim(); const c = parseFloat(r[ci]?.replace(",", "."));
    return n && !isNaN(c) && c > 0 ? { name: n, cost: c } : null;
  }).filter(Boolean);
  if (!parsed.length) { showUploadMsg("error", "Nenhum produto válido encontrado."); return; }
  products.push(...parsed); renderProductList(); updateProductCount();
  showUploadMsg("ok", `✓ ${parsed.length} produtos importados!`);
  document.getElementById("colMap").style.display = "none";
}

function showUploadMsg(type, text) {
  const el = document.getElementById("uploadMsg");
  if (!text) { el.style.display = "none"; return; }
  el.className = type === "ok" ? "upload-result" : "upload-error";
  el.textContent = (type === "ok" ? "✓ " : "⚠ ") + text;
  el.style.display = "flex";
}

// ── ML Analysis ───────────────────────────────────────────
async function fetchML(query) {
  const url = `${BACKEND}/search?q=${encodeURIComponent(query)}&limit=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    results: (data.items || []).map(item => ({
      price: item.price, condition: "new",
      sold_quantity: item.sold_quantity || 0,
      shipping: { free_shipping: item.free_shipping || false },
      daily_visits: item.daily_visits || null,
    })),
    paging: { total: data.total_listings || 0 },
  };
}

function analyzeMLData(data, costPrice, minTarget) {
  const items = (data.results || []).filter(i => i.price > 0);
  if (!items.length) return null;
  const prices = items.map(i => i.price).sort((a,b)=>a-b);
  const trim = prices.slice(Math.floor(prices.length*0.1), Math.ceil(prices.length*0.9));
  const avgPrice = trim.reduce((s,p)=>s+p,0) / trim.length;
  const minPrice = Math.min(...trim);
  const totalListings = data.paging?.total || 0;
  const avgSold = items.reduce((s,i)=>s+(i.sold_quantity||0),0)/items.length;
  const freeShip = items.filter(i=>i.shipping?.free_shipping).length/items.length;
  const topSellers = items.filter(i=>i.sold_quantity>50).length;

  let demandScore = 0;
  if (totalListings > 5000) demandScore += 40;
  else if (totalListings > 1000) demandScore += 25;
  else if (totalListings > 200) demandScore += 10;
  if (avgSold > 100) demandScore += 40;
  else if (avgSold > 20) demandScore += 25;
  else if (avgSold > 5) demandScore += 12;
  if (topSellers > 3) demandScore += 20;
  else if (topSellers > 0) demandScore += 10;
  demandScore = Math.min(100, demandScore);

  const sellPrice = avgPrice * 0.95;
  const net = sellPrice - sellPrice * 0.16;
  const margin = ((net - costPrice) / sellPrice) * 100;
  const compScore = items.length > 15 ? "Alta" : items.length > 7 ? "Média" : "Baixa";

  let score = 0;
  if (margin >= minTarget) score += 45;
  else if (margin >= minTarget * 0.7) score += 25;
  else if (margin > 0) score += 10;
  score += demandScore * 0.45;
  if (freeShip > 0.6) score += 10;
  score = Math.min(100, Math.round(score));

  const demandLevel = demandScore >= 55 ? "Alta" : demandScore >= 30 ? "Média" : "Baixa";
  let verdict = "Evitar";
  if (score >= 65 && margin >= minTarget) verdict = "Comprar";
  else if (score >= 40 || (margin >= minTarget * 0.8 && demandLevel !== "Baixa")) verdict = "Avaliar";

  return { avgPrice, minPrice, margin, demandLevel, demandScore, totalListings, compScore, score, verdict, itemsFound: items.length };
}

let isAnalyzing = false;
const allResults = [];

async function analyze() {
  if (isAnalyzing || products.length === 0) return;
  isAnalyzing = true;
  allResults.length = 0;
  const minMargin = parseInt(document.getElementById("marginSlider").value);

  document.getElementById("analyzeBtn").disabled = true;
  document.getElementById("analyzeBtn").innerHTML = '<div class="spinner"></div> Analisando...';
  document.getElementById("analyzeError").style.display = "none";
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("resultsTable").style.display = "block";
  document.getElementById("progressBar").style.display = "block";
  document.getElementById("summaryBar").style.display = "none";
  document.getElementById("resultsStats").style.display = "none";
  document.getElementById("resultRows").innerHTML = "";

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    setProgress(i + 1, products.length, p.name);

    // Loading row
    document.getElementById("resultRows").innerHTML += `
      <div class="loading-row" id="row-${i}">
        <div class="spinner"></div> Consultando ${p.name}...
      </div>`;

    let result;
    try {
      const data = await fetchML(p.name);
      await sleep(300);
      const analysis = analyzeMLData(data, p.cost, minMargin);
      result = { product: p, status: analysis ? "ok" : "noresults", analysis };
    } catch (e) {
      result = { product: p, status: "error", analysis: null, err: e.message };
      if (i === 0) {
        showAnalyzeError("Sem conexão com o backend. Verifique: " + e.message);
        finishAnalysis(); return;
      }
    }
    allResults.push(result);
    renderRow(i, result, minMargin);
  }

  // Sort by score
  allResults.sort((a,b) => (b.analysis?.score||0) - (a.analysis?.score||0));
  rerenderAll(minMargin);
  finishAnalysis();
}

function setProgress(current, total, name) {
  document.getElementById("progressCount").textContent = `${current}/${total}`;
  document.getElementById("progressFill").style.width = `${(current/total)*100}%`;
  document.getElementById("progressStatus").textContent = "Buscando: " + name;
}

function renderRow(i, r, minMargin) {
  const el = document.getElementById("row-" + i);
  if (!el) return;
  if (r.status !== "ok" || !r.analysis) {
    el.className = "error-row";
    el.innerHTML = `<span>⚠</span> ${r.product.name} — ${r.status === "error" ? (r.err||"Erro") : "Sem resultados"}`;
    return;
  }
  const a = r.analysis;
  const rowClass = a.verdict === "Comprar" ? "hl-green" : a.verdict === "Avaliar" ? "hl-yellow" : "hl-red";
  const mClass = a.margin >= minMargin ? "margin-good" : a.margin >= minMargin*0.7 ? "margin-ok" : "margin-bad";
  const sClass = a.score >= 65 ? "score-fill-green" : a.score >= 40 ? "score-fill-yellow" : "score-fill-red";
  const vClass = a.verdict === "Comprar" ? "verdict-buy" : a.verdict === "Avaliar" ? "verdict-maybe" : "verdict-skip";
  const vIcon = a.verdict === "Comprar" ? "✓" : a.verdict === "Avaliar" ? "?" : "✗";

  el.className = `result-row ${rowClass}`;
  el.innerHTML = `
    <div class="cell"><div class="product-name-cell">${r.product.name}</div><div class="product-sub">Custo: ${fmt(r.product.cost)}</div></div>
    <div class="cell price-cell">${fmt(a.avgPrice)}</div>
    <div class="cell ${mClass}">${pct(a.margin)}</div>
    <div class="cell"><div class="demand-pill demand-${a.demandLevel.toLowerCase()}">${a.demandLevel}</div></div>
    <div class="cell comp-cell">${a.compScore}</div>
    <div class="cell"><div class="score-bar"><div class="score-fill ${sClass}" style="width:${a.score}%"></div><span class="score-text">${a.score}</span></div></div>
    <div class="cell ${vClass}">${vIcon} ${a.verdict}</div>
  `;
}

function rerenderAll(minMargin) {
  document.getElementById("resultRows").innerHTML = "";
  allResults.forEach((r, i) => renderRow(i, r, minMargin));
}

function finishAnalysis() {
  isAnalyzing = false;
  document.getElementById("analyzeBtn").disabled = false;
  document.getElementById("analyzeBtn").innerHTML = "⚡ Analisar no Mercado Livre";
  document.getElementById("progressBar").style.display = "none";

  const ok = allResults.filter(r => r.analysis);
  if (!ok.length) return;

  const minMargin = parseInt(document.getElementById("marginSlider").value);
  const buyC = ok.filter(r=>r.analysis.verdict==="Comprar").length;
  const evalC = ok.filter(r=>r.analysis.verdict==="Avaliar").length;
  const skipC = ok.filter(r=>r.analysis.verdict==="Evitar").length;
  const avgM = ok.reduce((s,r)=>s+r.analysis.margin,0)/ok.length;

  document.getElementById("resultsStats").style.display = "flex";
  document.getElementById("buyCount").textContent = buyC + " comprar";
  document.getElementById("evalCount").textContent = evalC + " avaliar";
  document.getElementById("skipCount").textContent = skipC + " evitar";

  document.getElementById("summaryBar").style.display = "grid";
  document.getElementById("sumBuy").textContent = buyC;
  document.getElementById("sumMargin").textContent = pct(avgM);
  document.getElementById("sumTotal").textContent = ok.length;
  document.getElementById("sumTarget").textContent = minMargin + "%";
  document.getElementById("sumMargin").style.color = avgM >= minMargin ? "#10b981" : avgM > 0 ? "#fbbf24" : "#ef4444";
}

function showAnalyzeError(msg) {
  const el = document.getElementById("analyzeError");
  el.textContent = "⚠ " + msg;
  el.style.display = "flex";
}

// ── PWA Service Worker ─────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
