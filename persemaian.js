/* =========================================================================
   Dashboard Persemaian — logic
   Sumber data: Google Sheets "[dummy] database nursery"
   Sheet yang dipakai: "3. Data Induk Bibit", "4. Log Distribusi", "5. Master Desa & KTH"
   ========================================================================= */

const SHEET_ID = '14A2o9WGcKprSIm2V1nbW0MKpn518QxptGXZz3-TidJ4';

function sheetCsvUrl(sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const params = `tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&v=${Date.now()}`;
  return `${base}?${params}`;
}

/* ---------- palet warna (mengikuti STYLE_GUIDE.md) ---------- */
const COLOR = {
  cream:'#FFFAF3', sand:'#DCDACC', sage:'#B5BBA9', moss:'#8C9F8B', fern:'#618273', pine:'#356760',
  good:'#3F7D4F', warn:'#C98A32', bad:'#B24A3D'
};
// ramp untuk kategori (jenis tanaman, dsb) — turunan dari palet resmi
const CATEGORY_RAMP = ['#356760','#3E7A6E','#4C8C7C','#5A8E7B','#618273','#7A9A82','#8C9F8B','#A3AC9A','#B5BBA9','#C7C7B0','#DCDACC'];

function colorFor(i){ return CATEGORY_RAMP[i % CATEGORY_RAMP.length]; }

/* =========================================================================
   Helper: parsing angka yang aman terhadap format ekspor Google Sheets
   (bisa berupa "1234", "1,234", "76.6%", string kosong, dst — lihat
   catatan STYLE_GUIDE.md soal ekspor Google Sheets yang kadang berantakan)
   ========================================================================= */
function parseNum(v) {
  if (v === undefined || v === null) return 0;
  let s = String(v).trim();
  if (s === '' || s === '-' || s.toUpperCase() === 'N/A' || s === '#N/A') return 0;
  const isPct = s.includes('%');
  s = s.replace(/%/g, '').trim();

  // Google Sheets export bisa berformat locale AS (1,234.5) maupun ID (1.234,5) —
  // deteksi pemisah desimal secara adaptif alih-alih asumsi satu format saja.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) { s = s.replace(/\./g, '').replace(',', '.'); }
    else { s = s.replace(/,/g, ''); }
  } else if (lastComma > -1) {
    const decimals = s.slice(lastComma + 1);
    s = decimals.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = s.slice(lastDot + 1);
    if (decimals.length === 3 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) { s = s.replace(/\./g, ''); }
  }

  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return isPct ? n / 100 : n;
}

function fmtInt(n) {
  return Math.round(n).toLocaleString('id-ID');
}
function fmtPct(n, decimals = 1) {
  return (n * 100).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

/* =========================================================================
   Helper: parse CSV text menjadi array of objects, dengan deteksi baris
   header secara otomatis (karena beberapa sheet punya baris judul/catatan
   di atas header asli — lihat STYLE_GUIDE.md soal ini)
   ========================================================================= */
function parseSheetCSV(csvText, anchorHeaderText, idColumnName) {
  const parsed = Papa.parse(csvText.trim(), { skipEmptyLines: false });
  const table = parsed.data;

  let headerIdx = table.findIndex(row => row.some(cell => (cell || '').trim() === anchorHeaderText));
  if (headerIdx === -1) headerIdx = 0;

  const headers = table[headerIdx].map(h => (h || '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < table.length; i++) {
    const row = table[i];
    if (!row || row.every(c => (c || '').trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (row[idx] !== undefined ? String(row[idx]).trim() : '');
    });
    rows.push(obj);
  }

  // buang baris ringkasan/total: hanya simpan baris dengan kolom ID valid berupa angka
  return rows.filter(r => {
    const idVal = r[idColumnName];
    return idVal !== undefined && idVal !== '' && !isNaN(parseInt(idVal, 10));
  });
}

function fetchSheet(sheetName) {
  return fetch(sheetCsvUrl(sheetName)).then(res => {
    if (!res.ok) throw new Error(`Gagal memuat sheet "${sheetName}" (HTTP ${res.status}). Pastikan spreadsheet dibagikan dengan akses "Anyone with the link can view".`);
    return res.text();
  });
}

/* =========================================================================
   Agregasi umum
   ========================================================================= */
function groupSum(rows, groupField, valueField) {
  const out = {};
  for (const r of rows) {
    const k = (r[groupField] || 'Lainnya').trim() || 'Lainnya';
    out[k] = (out[k] || 0) + parseNum(r[valueField]);
  }
  return out;
}
function groupCount(rows, groupField) {
  const out = {};
  for (const r of rows) {
    const k = (r[groupField] || 'Lainnya').trim() || 'Lainnya';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
function sumField(rows, field) {
  return rows.reduce((s, r) => s + parseNum(r[field]), 0);
}
function uniqueValues(rows, field) {
  return [...new Set(rows.map(r => (r[field] || '').trim()).filter(Boolean))];
}

/* =========================================================================
   MAIN
   ========================================================================= */
let CHARTS = {};
let DETAIL_ROWS = [];

const UMUR_ORDER = ['0 - 1 Bulan', '1 - 2 Bulan', '2 - 3 Bulan', '3 - 4 Bulan', '> 4 Bulan'];
const TAHAP_ORDER = ['Bibit Masuk', 'Semai', 'Rotasi', 'Grafting/Distribusi'];

function loadAll() {
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const contentEl = document.getElementById('dashboardContent');
  const refreshBtn = document.getElementById('refreshBtn');

  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';
  contentEl.style.display = 'none';
  refreshBtn.disabled = true;

  Promise.all([
    fetchSheet('3. Data Induk Bibit'),
    fetchSheet('4. Log Distribusi'),
    fetchSheet('5. Master Desa & KTH'),
  ]).then(([dibCsv, logCsv, desaCsv]) => {
    const dib = parseSheetCSV(dibCsv, 'Kode Batch', 'No');
    const logDistribusi = parseSheetCSV(logCsv, 'Nama Petani (Tujuan)', 'No');
    const masterDesa = parseSheetCSV(desaCsv, 'KTH', 'No');

    if (dib.length === 0) {
      throw new Error('Sheet "3. Data Induk Bibit" tidak ditemukan atau kosong. Periksa nama sheet & hak akses spreadsheet.');
    }

    renderDashboard(dib, logDistribusi, masterDesa);

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    document.getElementById('lastUpdated').textContent =
      'Dimuat ' + new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    document.getElementById('lastUpdated').classList.remove('error');
  }).catch(err => {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('errorBox').innerHTML =
      `<strong>Gagal memuat data.</strong><br>${err.message}`;
    document.getElementById('lastUpdated').textContent = 'Gagal memuat data';
    document.getElementById('lastUpdated').classList.add('error');
  }).finally(() => {
    refreshBtn.disabled = false;
  });
}

function renderDashboard(dib, logDistribusi, masterDesa) {
  DETAIL_ROWS = dib;
  renderKPI(dib);
  renderStokCharts(dib);
  renderProduksiCharts(dib);
  renderFlow(dib);
  renderDistribusi(logDistribusi, masterDesa, dib);
  renderDetailTable(dib);
}

/* ============================= SECTION 1: KPI ============================= */
function renderKPI(dib) {
  const totalBibitMasuk = sumField(dib, 'Bibit Masuk');
  const totalMati = sumField(dib, 'Total Mati');
  const totalGrafting = sumField(dib, 'Grafting');
  const totalDistribusi = sumField(dib, 'Distribusi');
  const jumlahBatch = dib.length;
  const jenisSet = uniqueValues(dib, 'Jenis Tanaman');
  const survival = totalBibitMasuk > 0 ? (totalBibitMasuk - totalMati) / totalBibitMasuk : 0;

  const cards = [
    { label: 'Jumlah Batch Aktif', value: fmtInt(jumlahBatch), unit: 'batch' },
    { label: 'Jenis Tanaman', value: fmtInt(jenisSet.length), unit: 'jenis' },
    { label: 'Total Bibit Masuk', value: fmtInt(totalBibitMasuk), unit: 'bibit' },
    { label: 'Siap Salur (Grafting + Distribusi)', value: fmtInt(totalGrafting + totalDistribusi), unit: 'bibit' },
    { label: 'Survival Rate Keseluruhan', value: fmtPct(survival), unit: 'seluruh batch', bar: survival },
  ];

  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-unit">${c.unit}</div>
      ${c.bar !== undefined ? `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${Math.min(c.bar*100,100)}%"></div></div>` : ''}
    </div>
  `).join('');
}

/* ============================= SECTION 2: STOK ============================= */
function renderStokCharts(dib) {
  // --- chart 1: Bibit Masuk per Jenis Tanaman (horizontal bar) ---
  const byJenis = groupSum(dib, 'Jenis Tanaman', 'Bibit Masuk');
  const sortedJenis = Object.entries(byJenis).sort((a, b) => b[1] - a[1]);
  const labels1 = sortedJenis.map(e => e[0]);
  const values1 = sortedJenis.map(e => e[1]);

  destroyChart('chartStokJenis');
  CHARTS.chartStokJenis = new Chart(document.getElementById('chartStokJenis'), {
    type: 'bar',
    data: {
      labels: labels1,
      datasets: [{
        data: values1,
        backgroundColor: labels1.map((_, i) => colorFor(i)),
        borderRadius: 2,
        barThickness: 16,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtInt(c.raw) + ' bibit' } } },
      scales: {
        x: { grid: { color: COLOR.sand }, ticks: { color: COLOR.pine, font: { family: 'Inter' } } },
        y: { grid: { display: false }, ticks: { color: '#20302B', font: { family: 'Inter', size: 12 } } },
      }
    }
  });

  // --- chart 2: Komposisi Tahap Saat Ini per Jenis Tanaman (stacked bar, 100%) ---
  const jenisList = [...new Set(dib.map(r => r['Jenis Tanaman']))];
  const tahapCounts = {}; // jenis -> tahap -> count
  jenisList.forEach(j => { tahapCounts[j] = {}; TAHAP_ORDER.forEach(t => tahapCounts[j][t] = 0); });
  dib.forEach(r => {
    const j = r['Jenis Tanaman'];
    const t = TAHAP_ORDER.includes(r['Tahap Bibit (terkini)']) ? r['Tahap Bibit (terkini)'] : 'Grafting/Distribusi';
    if (!tahapCounts[j]) tahapCounts[j] = {};
    tahapCounts[j][t] = (tahapCounts[j][t] || 0) + 1;
  });
  // urutkan jenis sama seperti chart 1 supaya konsisten
  const jenisOrdered = labels1.filter(j => tahapCounts[j]);
  const tahapColors = { 'Bibit Masuk': COLOR.sand, 'Semai': COLOR.moss, 'Rotasi': COLOR.fern, 'Grafting/Distribusi': COLOR.pine };

  const datasets2 = TAHAP_ORDER.map(t => ({
    label: t,
    data: jenisOrdered.map(j => {
      const total = TAHAP_ORDER.reduce((s, tt) => s + (tahapCounts[j][tt] || 0), 0);
      return total > 0 ? (tahapCounts[j][t] || 0) / total * 100 : 0;
    }),
    backgroundColor: tahapColors[t],
  }));

  destroyChart('chartTahapKomposisi');
  CHARTS.chartTahapKomposisi = new Chart(document.getElementById('chartTahapKomposisi'), {
    type: 'bar',
    data: { labels: jenisOrdered, datasets: datasets2 },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(0)}%` } }
      },
      scales: {
        x: { stacked: true, max: 100, grid: { color: COLOR.sand }, ticks: { color: COLOR.pine, callback: (v) => v + '%' } },
        y: { stacked: true, grid: { display: false }, ticks: { color: '#20302B', font: { size: 12 } } },
      }
    }
  });

  document.getElementById('legendTahap').innerHTML = TAHAP_ORDER.map(t =>
    `<span><span class="dot" style="background:${tahapColors[t]}"></span>${t}</span>`
  ).join('');
}

/* ============================= SECTION 3: PRODUKSI ============================= */
function renderProduksiCharts(dib) {
  // --- chart 1: Umur Bibit (stok yang masih dalam proses, per kategori umur) ---
  const byUmur = groupSum(dib, 'Kategori Umur', 'Stok Akhir (Dalam Proses)');
  const labelsU = UMUR_ORDER.filter(u => byUmur[u] !== undefined || true);
  const valuesU = labelsU.map(u => byUmur[u] || 0);

  destroyChart('chartUmur');
  CHARTS.chartUmur = new Chart(document.getElementById('chartUmur'), {
    type: 'bar',
    data: { labels: labelsU, datasets: [{ data: valuesU, backgroundColor: COLOR.fern, borderRadius: 2, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtInt(c.raw) + ' bibit' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#20302B', font: { size: 11.5 } } },
        y: { grid: { color: COLOR.sand }, ticks: { color: COLOR.pine } },
      }
    }
  });

  // --- chart 2: Survival Rate per Jenis Tanaman (weighted, dengan status warna) ---
  const jenisList = [...new Set(dib.map(r => r['Jenis Tanaman']))];
  const survPerJenis = jenisList.map(j => {
    const rows = dib.filter(r => r['Jenis Tanaman'] === j);
    const masuk = sumField(rows, 'Bibit Masuk');
    const mati = sumField(rows, 'Total Mati');
    return { jenis: j, survival: masuk > 0 ? (masuk - mati) / masuk : 0 };
  }).sort((a, b) => b.survival - a.survival);

  const statusColor = (s) => s >= 0.95 ? COLOR.good : (s >= 0.90 ? COLOR.warn : COLOR.bad);

  destroyChart('chartSurvival');
  CHARTS.chartSurvival = new Chart(document.getElementById('chartSurvival'), {
    type: 'bar',
    data: {
      labels: survPerJenis.map(d => d.jenis),
      datasets: [{
        data: survPerJenis.map(d => (d.survival * 100).toFixed(1)),
        backgroundColor: survPerJenis.map(d => statusColor(d.survival)),
        borderRadius: 2, maxBarThickness: 40,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.raw + '%' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#20302B', font: { size: 11.5 } } },
        y: { min: 0, max: 100, grid: { color: COLOR.sand }, ticks: { color: COLOR.pine, callback: (v) => v + '%' } },
      }
    }
  });
}

/* ============================= SECTION 4: ALUR PERGERAKAN ============================= */
function renderFlow(dib) {
  const agg = {
    bibitMasuk: sumField(dib, 'Bibit Masuk'),
    semai: sumField(dib, 'Semai'),
    matiSemai: sumField(dib, 'Mati - Semai'),
    rotasi: sumField(dib, 'Rotasi'),
    matiRotasi: sumField(dib, 'Mati - Rotasi'),
    grafting: sumField(dib, 'Grafting'),
    matiGrafting: sumField(dib, 'Mati - Grafting'),
    distribusi: sumField(dib, 'Distribusi'),
    totalMati: sumField(dib, 'Total Mati'),
    stokAkhir: sumField(dib, 'Stok Akhir (Dalam Proses)'),
  };
  const sisaRotasi = Math.max(agg.rotasi - agg.matiRotasi - agg.grafting - agg.distribusi, 0);
  const berhasilGraft = Math.max(agg.grafting - agg.matiGrafting, 0);

  // ---- KPI cards ----
  const flowKpiDefs = [
    ['Bibit Masuk', agg.bibitMasuk],
    ['Semai', agg.semai],
    ['Rotasi', agg.rotasi],
    ['Grafting', agg.grafting],
    ['Distribusi', agg.distribusi],
    ['Total Mati', agg.totalMati],
    ['Stok Dalam Proses', agg.stokAkhir],
  ];
  document.getElementById('flowKpis').innerHTML = flowKpiDefs.map(([label, val]) => `
    <div class="flow-kpi"><div class="fk-label">${label}</div><div class="fk-value">${fmtInt(val)}</div></div>
  `).join('');

  // ---- Sankey ----
  renderSankeySVG(document.getElementById('sankeyContainer'), agg, sisaRotasi, berhasilGraft);

  // ---- Rincian table ----
  const rincian = [
    ['Bibit Masuk', agg.bibitMasuk],
    ['Semai', agg.semai],
    ['Mati - Semai', agg.matiSemai],
    ['Rotasi', agg.rotasi],
    ['Mati - Rotasi', agg.matiRotasi],
    ['Grafting', agg.grafting],
    ['Mati - Grafting', agg.matiGrafting],
    ['Distribusi', agg.distribusi],
    ['Total Mati (semua tahap)', agg.totalMati],
    ['Stok Akhir (Dalam Proses)', agg.stokAkhir],
  ];
  const tbl = document.getElementById('rincianTable');
  tbl.innerHTML = `
    <thead><tr><th>Tahap</th><th>Jumlah (bibit)</th><th>% thd Bibit Masuk</th></tr></thead>
    <tbody>
      ${rincian.map(([label, val]) => `
        <tr><td>${label}</td><td>${fmtInt(val)}</td><td>${agg.bibitMasuk > 0 ? fmtPct(val / agg.bibitMasuk) : '-'}</td></tr>
      `).join('')}
    </tbody>`;

  // ---- Indikator ----
  const indikators = [
    ['Tingkat Kelangsungan Semai (Rotasi / Semai)', agg.semai > 0 ? agg.rotasi / agg.semai : 0],
    ['Tingkat Kelangsungan Rotasi ((Rotasi−Mati Rotasi) / Rotasi)', agg.rotasi > 0 ? (agg.rotasi - agg.matiRotasi) / agg.rotasi : 0],
    ['Proporsi ke Grafting (Grafting / (Grafting+Distribusi))', (agg.grafting + agg.distribusi) > 0 ? agg.grafting / (agg.grafting + agg.distribusi) : 0],
    ['Proporsi ke Distribusi (Distribusi / (Grafting+Distribusi))', (agg.grafting + agg.distribusi) > 0 ? agg.distribusi / (agg.grafting + agg.distribusi) : 0],
    ['Survival Rate Keseluruhan ((Bibit Masuk−Total Mati) / Bibit Masuk)', agg.bibitMasuk > 0 ? (agg.bibitMasuk - agg.totalMati) / agg.bibitMasuk : 0],
  ];
  document.getElementById('indikatorList').innerHTML = indikators.map(([label, val]) => `
    <div class="indikator-row">
      <div class="ind-label"><span>${label}</span><b>${fmtPct(val)}</b></div>
      <div class="indikator-bar"><div class="indikator-bar-fill" style="width:${Math.min(val*100,100)}%"></div></div>
    </div>
  `).join('');
}

/* ---- Sankey renderer (SVG murni, tanpa library eksternal) ---- */
function renderSankeySVG(container, agg, sisaRotasi, berhasilGraft) {
  const W = 1180, H = 420;
  const padTop = 30, padBottom = 40;
  const plotH = H - padTop - padBottom;
  const scale = agg.bibitMasuk > 0 ? plotH / agg.bibitMasuk : 0;
  const nodeW = 22;
  const colX = [40, 320, 600, 880, 1130 - nodeW];

  const columns = [
    [{ id: 'masuk', label: 'Bibit Masuk', value: agg.bibitMasuk, color: COLOR.pine }],
    [{ id: 'semai', label: 'Semai', value: agg.semai, color: COLOR.fern }],
    [
      { id: 'rotasi', label: 'Rotasi', value: agg.rotasi, color: COLOR.moss },
      { id: 'matiSemai', label: 'Mati - Semai', value: agg.matiSemai, color: COLOR.bad },
    ],
    [
      { id: 'grafting', label: 'Grafting', value: agg.grafting, color: COLOR.pine },
      { id: 'distribusi', label: 'Distribusi', value: agg.distribusi, color: COLOR.fern },
      { id: 'sisa', label: 'Belum Diproses', value: sisaRotasi, color: COLOR.sage },
      { id: 'matiRotasi', label: 'Mati - Rotasi', value: agg.matiRotasi, color: COLOR.bad },
    ],
    [
      { id: 'berhasilGraft', label: 'Berhasil Digrafting', value: berhasilGraft, color: COLOR.pine },
      { id: 'matiGrafting', label: 'Mati - Grafting', value: agg.matiGrafting, color: COLOR.bad },
    ],
  ];

  const edges = [
    { from: 'masuk', to: 'semai' },
    { from: 'semai', to: 'rotasi' },
    { from: 'semai', to: 'matiSemai' },
    { from: 'rotasi', to: 'grafting' },
    { from: 'rotasi', to: 'distribusi' },
    { from: 'rotasi', to: 'sisa' },
    { from: 'rotasi', to: 'matiRotasi' },
    { from: 'grafting', to: 'berhasilGraft' },
    { from: 'grafting', to: 'matiGrafting' },
  ];

  // layout: stack node dalam tiap kolom, hitung y & h
  const nodeById = {};
  const laidColumns = columns.map((col, ci) => {
    let y = padTop;
    return col.map(n => {
      const h = Math.max(n.value * scale, n.value > 0 ? 1.5 : 0);
      const laid = { ...n, x: colX[ci], y, h, colIndex: ci };
      y += h;
      nodeById[n.id] = laid;
      return laid;
    });
  });

  // hitung offset kumulatif per-parent untuk menempatkan pangkal ribbon
  const parentOffset = {};
  edges.forEach(e => { parentOffset[e.from] = 0; });

  let ribbons = '';
  edges.forEach(e => {
    const src = nodeById[e.from];
    const tgt = nodeById[e.to];
    if (!src || !tgt || tgt.h <= 0) return;
    const y1a = src.y + parentOffset[e.from];
    const y1b = y1a + tgt.h;
    parentOffset[e.from] += tgt.h;
    const x1 = src.x + nodeW, x2 = tgt.x;
    const y2a = tgt.y, y2b = tgt.y + tgt.h;
    const mx = (x1 + x2) / 2;
    const d = `M ${x1} ${y1a} C ${mx} ${y1a} ${mx} ${y2a} ${x2} ${y2a} L ${x2} ${y2b} C ${mx} ${y2b} ${mx} ${y1b} ${x1} ${y1b} Z`;
    ribbons += `<path d="${d}" fill="${tgt.color}" fill-opacity="0.28" stroke="none"></path>`;
  });

  let nodesSvg = '';
  let labelsSvg = '';
  laidColumns.flat().forEach(n => {
    if (n.h <= 0) return;
    nodesSvg += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" fill="${n.color}"></rect>`;
    const labelX = n.colIndex === laidColumns.length - 1 ? n.x - 8 : n.x + nodeW + 8;
    const anchor = n.colIndex === laidColumns.length - 1 ? 'end' : 'start';
    const midY = n.y + n.h / 2;
    labelsSvg += `
      <text x="${labelX}" y="${midY - 5}" text-anchor="${anchor}" font-family="Inter" font-size="12.5" font-weight="600" fill="#20302B">${n.label}</text>
      <text x="${labelX}" y="${midY + 11}" text-anchor="${anchor}" font-family="Inter" font-size="11.5" fill="#5B6B62">${fmtInt(n.value)} bibit</text>
    `;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${ribbons}
      ${nodesSvg}
      ${labelsSvg}
    </svg>
  `;
}

/* ============================= SECTION 5: DISTRIBUSI ============================= */
function renderDistribusi(logDistribusi, masterDesa, dib) {
  const totalYTD = sumField(logDistribusi, 'Jumlah Bibit');

  // "bulan ini" = bulan-tahun terbaru yang tersedia di data (robust terhadap kapan halaman dibuka)
  let latestYear = 0, latestMonth = 0;
  logDistribusi.forEach(r => {
    const y = parseInt(r['Tahun'], 10) || 0;
    const m = parseInt(r['Bulan'], 10) || 0;
    if (y > latestYear || (y === latestYear && m > latestMonth)) { latestYear = y; latestMonth = m; }
  });
  const bulanIni = logDistribusi.filter(r => parseInt(r['Tahun'], 10) === latestYear && parseInt(r['Bulan'], 10) === latestMonth);
  const totalBulanIni = sumField(bulanIni, 'Jumlah Bibit');

  const jumlahDesa = uniqueValues(masterDesa, 'Desa').length;
  const jumlahKTH = uniqueValues(masterDesa, 'KTH').length;

  const cards = [
    { label: 'Total Distribusi (YTD)', value: fmtInt(totalYTD), unit: 'bibit' },
    { label: 'Distribusi Bulan Terakhir Tercatat', value: fmtInt(totalBulanIni), unit: 'bibit' },
    { label: 'Jumlah KTH', value: fmtInt(jumlahKTH), unit: 'kelompok tani hutan' },
    { label: 'Jumlah Desa', value: fmtInt(jumlahDesa), unit: 'desa' },
  ];
  document.getElementById('distribusiKpis').innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-unit">${c.unit}</div>
    </div>
  `).join('');

  // --- per program ---
  const byProgram = groupSum(logDistribusi, 'Program', 'Jumlah Bibit');
  const programLabels = Object.keys(byProgram);
  destroyChart('chartProgram');
  CHARTS.chartProgram = new Chart(document.getElementById('chartProgram'), {
    type: 'bar',
    data: { labels: programLabels, datasets: [{ data: programLabels.map(p => byProgram[p]), backgroundColor: programLabels.map((_, i) => colorFor(i)), borderRadius: 2, maxBarThickness: 50 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtInt(c.raw) + ' bibit' } } },
      scales: {
        x: { grid: { color: COLOR.sand }, ticks: { color: COLOR.pine } },
        y: { grid: { display: false }, ticks: { color: '#20302B', font: { size: 12.5 } } },
      }
    }
  });

  // --- per kelompok (donut) ---
  const byKelompok = groupSum(logDistribusi, 'Kelompok', 'Jumlah Bibit');
  const kelompokLabels = Object.keys(byKelompok);
  destroyChart('chartKelompok');
  CHARTS.chartKelompok = new Chart(document.getElementById('chartKelompok'), {
    type: 'doughnut',
    data: { labels: kelompokLabels, datasets: [{ data: kelompokLabels.map(k => byKelompok[k]), backgroundColor: kelompokLabels.map((_, i) => colorFor(i)), borderColor: '#fff', borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#20302B', font: { size: 11.5, family: 'Inter' }, boxWidth: 10, padding: 10 } },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtInt(c.raw)} bibit` } }
      }
    }
  });

  // --- komposisi jenis tanaman didistribusikan (pie) ---
  const byJenisDist = groupSum(logDistribusi, 'Jenis Tanaman', 'Jumlah Bibit');
  const jenisDistSorted = Object.entries(byJenisDist).sort((a, b) => b[1] - a[1]);
  destroyChart('chartJenisDistribusi');
  CHARTS.chartJenisDistribusi = new Chart(document.getElementById('chartJenisDistribusi'), {
    type: 'pie',
    data: {
      labels: jenisDistSorted.map(e => e[0]),
      datasets: [{ data: jenisDistSorted.map(e => e[1]), backgroundColor: jenisDistSorted.map((_, i) => colorFor(i)), borderColor: '#fff', borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#20302B', font: { size: 10.5, family: 'Inter' }, boxWidth: 9, padding: 8 } },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtInt(c.raw)} bibit` } }
      }
    }
  });
}

/* ============================= SECTION 6: DETAIL TABLE ============================= */
const DETAIL_COLUMNS = [
  'Kode Batch', 'Kelompok', 'Jenis Tanaman', 'Varietas', 'Tahap Bibit (terkini)',
  'Bibit Masuk', 'Total Mati', 'Grafting', 'Distribusi', 'Stok Akhir (Dalam Proses)',
  'Survival Rate', 'Program', 'Desa', 'KTH'
];
const NUMERIC_DETAIL_COLS = new Set(['Bibit Masuk', 'Total Mati', 'Grafting', 'Distribusi', 'Stok Akhir (Dalam Proses)']);

function survivalBadge(val) {
  const n = parseNum(val);
  const pct = fmtPct(n);
  if (n >= 0.95) return `<span class="badge badge-good">${pct}</span>`;
  if (n >= 0.90) return `<span class="badge badge-warn">${pct}</span>`;
  return `<span class="badge badge-bad">${pct}</span>`;
}

function renderDetailTable(dib) {
  const thead = document.querySelector('#detailTable thead');
  thead.innerHTML = `<tr>${DETAIL_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr>`;
  renderDetailRows(dib);
  document.getElementById('tableSearch').value = '';
}

function renderDetailRows(rows) {
  const tbody = document.querySelector('#detailTable tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${DETAIL_COLUMNS.map(c => {
        if (c === 'Survival Rate') return `<td>${survivalBadge(r[c])}</td>`;
        if (NUMERIC_DETAIL_COLS.has(c)) return `<td>${fmtInt(parseNum(r[c]))}</td>`;
        return `<td>${r[c] || '-'}</td>`;
      }).join('')}
    </tr>
  `).join('');
  document.getElementById('tableCount').textContent = `${rows.length} batch ditampilkan`;
}

function filterDetailTable() {
  const q = document.getElementById('tableSearch').value.trim().toLowerCase();
  if (!q) { renderDetailRows(DETAIL_ROWS); return; }
  const filtered = DETAIL_ROWS.filter(r =>
    ['Kode Batch', 'Jenis Tanaman', 'KTH', 'Desa', 'Varietas', 'Program', 'Kelompok'].some(c =>
      (r[c] || '').toLowerCase().includes(q)
    )
  );
  renderDetailRows(filtered);
}

/* ============================= util ============================= */
function destroyChart(key) {
  if (CHARTS[key]) { CHARTS[key].destroy(); delete CHARTS[key]; }
}

/* ============================= init ============================= */
document.addEventListener('DOMContentLoaded', loadAll);
