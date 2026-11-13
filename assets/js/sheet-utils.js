(function () {
  "use strict";

  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, ags: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };

  function make(y, m, d, h, mi, s) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d, h || 0, mi || 0, s || 0);
    return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }

  function time(rest) {
    const t = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/.exec(rest || "");
    return t ? [+t[1], +t[2], +(t[3] || 0)] : [0, 0, 0];
  }

  function month(name) {
    return MON[String(name).slice(0, 3).toLowerCase()];
  }

  function sheetDate(v, order) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v == null ? "" : v).trim();
    if (!s || s === "#N/A" || s === "-") return null;
    let m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(s);
    if (m) return make(+m[1], +m[2] + 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(.*)$/.exec(s);
    if (m) return make(+m[1], +m[2], +m[3], ...time(m[4]));
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)(.*)$/.exec(s);
    if (m) {
      const a = +m[1], b = +m[2];
      const mdy = b > 12 ? true : a > 12 ? false : order === "mdy";
      return make(+m[3], mdy ? a : b, mdy ? b : a, ...time(m[4]));
    }
    m = /^(\d{1,2})[\s\-]+([A-Za-z]{3,})\.?[\s\-,]+(\d{4}|\d{2})(?!\d)(.*)$/.exec(s);
    if (m && month(m[2])) return make(+m[3], month(m[2]), +m[1], ...time(m[4]));
    m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/.exec(s);
    if (m && month(m[1])) return make(+m[3], month(m[1]), +m[2], ...time(m[4]));
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const n = +s;
      if (n > 20000 && n < 80000) {
        const d = new Date(Math.round((n - 25569) * 864e5));
        return make(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
    }
    return null;
  }

  function sheetIso(v, order) {
    const d = sheetDate(v, order);
    return d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : "";
  }

  function sheetNum(v, fallback) {
    if (typeof v === "number") return isNaN(v) ? (fallback === undefined ? 0 : fallback) : v;
    let s = String(v == null ? "" : v).trim().replace(/^rp\.?/i, "").replace(/[\s %]/g, "");
    const neg = /^\(.*\)$/.test(s);
    if (neg) s = s.slice(1, -1);
    const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
    if (lastDot > -1 && lastComma > -1) {
      s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (lastComma > -1) {
      s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
    } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    const n = parseFloat(s);
    if (isNaN(n)) return fallback === undefined ? 0 : fallback;
    return neg ? -n : n;
  }

  const LOG_URL = "https://docs.google.com/spreadsheets/d/1DRYnz-86Gx7mIzGaeNzUUd9xz_HoxwCgF4W-lLsOYjk/export?format=csv&gid=0";

  function plantName(v) {
    return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ").replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }

  const ARR_SHEET_ID = "1CwnGELzoAz98rcVjrCPGoAu2FljK8FYKs3PEMf0OnFU";
  const ARR_URL = "https://docs.google.com/spreadsheets/d/" + ARR_SHEET_ID + "/export?format=csv&gid=739311476";
  const ARR_TARGET_URL = "https://docs.google.com/spreadsheets/d/" + ARR_SHEET_ID + "/gviz/tq?tqx=out:csv&gid=1012937013";
  const ARR_FIELDS = ["No", "Grid", "KTH", "Luas", "Tipe", "Petani", "Jenis Kelamin", "Desa", "ID_Petak", "Tgl_Partisipasi", "Tgl_Realisasi",
    "Agro_Reg", "Agro_BPO", "Temb_Reg", "Temb_MTL", "link"];
  const ARR_STAGES = 11;
  for (let i = 1; i <= ARR_STAGES; i++) ARR_FIELDS.push("Insentif_T" + i);
  for (let i = 1; i <= ARR_STAGES; i++) ARR_FIELDS.push("Nominal_T" + i);
  ARR_FIELDS.push("PupukPadat", "PupukCair", "tanggal_bpo", "insentifMTL", "tanggal_mtl", "dusun", "luas_agro", "luas_temb", "ENL", "ENP");
  const TIPE = { AGR: "Agroforestri", TBW: "Tembawang" };

  function arrSummaryRows(csv) {
    const grid = Papa.parse(csv || "", { header: false, skipEmptyLines: true }).data;
    if (!grid.length) return [];
    const head = grid[0].map(function (h) { return String(h == null ? "" : h).replace(/\s+/g, " ").trim().toLowerCase(); });
    const all = function (test) {
      const out = [];
      head.forEach(function (h, i) { if (typeof test === "string" ? h === test : test.test(h)) out.push(i); });
      return out;
    };
    const at = function (test, nth) { const a = all(test); return a.length > (nth || 0) ? a[nth || 0] : -1; };
    const c = {
      no: at("no"), grid: at("kompartemen"), kth: at("nama kth"), kode: at("kode intervensi"), luas: at("luas (ha)"),
      petani: at("nama petani"), l: at("l"), p: at("p"), desa: at("desa"), dusun: at("dusun"), id: at("kode petak"),
      part: at(/^kerjasama partisipasi/), real: at(/^realisasi tanam awal/),
      luasAgro: at("agr", 0), luasTemb: at("tbw", 0), enl: at("enl"), enp: at("enp"),
      aReg: at("agr", 1), aBPO: at("bpo", 0), tReg: at("tbw", 1), tMTL: at("mtl", 0),
      padat: at(/^kebutuhan pupuk padat/), cair: at(/^kebutuhan pupuk cair/), tglBPO: at(/^tanggal distribusi/),
      mtl: at(/^kebutuhan insentive mtl/), tglMTL: at(/^tanggal penyerahan/), link: at("link")
    };
    const paid = all("paid");
    const rows = [];
    grid.slice(1).forEach(function (r) {
      const v = function (i) { return i < 0 || r[i] == null ? "" : String(r[i]).trim(); };
      const id = v(c.id);
      if (!id) return;
      const kode = v(c.kode).toUpperCase();
      const o = {
        "No": v(c.no), "Grid": v(c.grid), "KTH": v(c.kth), "Luas": v(c.luas), "Tipe": TIPE[kode] || kode, "Petani": v(c.petani),
        "Jenis Kelamin": sheetNum(v(c.l)) > 0 ? "Laki-laki" : sheetNum(v(c.p)) > 0 ? "Perempuan" : "",
        "Desa": v(c.desa), "ID_Petak": id, "Tgl_Partisipasi": v(c.part), "Tgl_Realisasi": v(c.real),
        "Agro_Reg": v(c.aReg), "Agro_BPO": v(c.aBPO), "Temb_Reg": v(c.tReg), "Temb_MTL": v(c.tMTL), "link": v(c.link),
        "PupukPadat": v(c.padat), "PupukCair": v(c.cair), "tanggal_bpo": v(c.tglBPO), "insentifMTL": v(c.mtl), "tanggal_mtl": v(c.tglMTL),
        "dusun": v(c.dusun), "luas_agro": v(c.luasAgro), "luas_temb": v(c.luasTemb), "ENL": v(c.enl), "ENP": v(c.enp)
      };
      for (let i = 0; i < ARR_STAGES; i++) {
        o["Insentif_T" + (i + 1)] = i < paid.length ? v(paid[i]) : "";
        o["Nominal_T" + (i + 1)] = i < paid.length ? v(paid[i] + 2) : "";
      }
      rows.push(o);
    });
    return rows;
  }

  function arrSummaryCsv(csv) {
    return Papa.unparse({ fields: ARR_FIELDS, data: arrSummaryRows(csv).map(function (o) { return ARR_FIELDS.map(function (f) { return o[f]; }); }) });
  }

  function parseActivityLog(csv) {
    const pupuk = {}, tanam = {}, rawat = {}, ada = {};
    if (!csv) return { pupuk: pupuk, tanam: tanam, rawat: rawat, ada: ada, hasTanam: false };
    const data = Papa.parse(csv, { header: true, skipEmptyLines: true, transformHeader: function (h) { return h.trim(); } }).data;
    data.forEach(function (raw) {
      const cat = String(raw["Activities Category"] || "").trim().toLowerCase();
      const id = String(raw["Kode Petak"] || "").trim().toUpperCase();
      if (!id || id === "#N/A") return;
      if (String(raw["Tipe Intervensi"] || "").trim().toLowerCase() === "tanaman existing") {
        const n = Math.max(0, sheetNum(raw["Jumlah"]));
        const name = plantName(raw["Jenis Tanaman"]);
        if (n > 0 && name) {
          const list = ada[id] || (ada[id] = []);
          const hit = list.find(function (x) { return x.name === name; });
          if (hit) hit.count += n; else list.push({ name: name, count: n });
        }
        return;
      }
      const d = sheetDate(raw["Tanggal"], "dmy");
      if (!d) return;
      if (cat === "pemupukan") (pupuk[id] || (pupuk[id] = [])).push(d);
      else if (cat === "planting" && String(raw["Tipe Intervensi"] || "").trim().toLowerCase() === "penanaman") {
        const n = Math.max(0, sheetNum(raw["Jumlah"]));
        (tanam[id] || (tanam[id] = [])).push({ d: d, name: n > 0 ? plantName(raw["Jenis Tanaman"]) : "", n: n });
      } else if (cat.indexOf("pemeliharaan restorasi") === 0) {
        const type = String(raw["Tipe Intervensi"] || "").trim();
        if (type) (rawat[id] || (rawat[id] = [])).push({ d: d, type: type });
      }
    });
    Object.keys(pupuk).forEach(function (k) { pupuk[k].sort(function (a, b) { return a - b; }); });
    Object.keys(tanam).forEach(function (k) { tanam[k].sort(function (a, b) { return a.d - b.d; }); });
    Object.keys(rawat).forEach(function (k) { rawat[k].sort(function (a, b) { return a.d - b.d; }); });
    Object.keys(ada).forEach(function (k) { ada[k].sort(function (a, b) { return b.count - a.count; }); });
    return { pupuk: pupuk, tanam: tanam, rawat: rawat, ada: ada, hasTanam: Object.keys(tanam).length > 0 };
  }

  window.ARR_URL = ARR_URL;
  window.ARR_TARGET_URL = ARR_TARGET_URL;
  window.arrSummaryRows = arrSummaryRows;
  window.arrSummaryCsv = arrSummaryCsv;
  window.ACTIVITY_LOG_URL = LOG_URL;
  window.parseActivityLog = parseActivityLog;
  window.sheetDate = sheetDate;
  window.sheetIso = sheetIso;
  window.sheetNum = sheetNum;
})();
