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

  const LOG_URL = "https://docs.google.com/spreadsheets/d/1DRYnz-86Gx7mIzGaeNzUUd9xz_HoxwCgF4W-lLsOYjk/gviz/tq?tqx=out:csv&sheet=Sheet1";

  function plantName(v) {
    return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ").replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  }

  function parseActivityLog(csv) {
    const pupuk = {}, tanam = {};
    if (!csv) return { pupuk: pupuk, tanam: tanam, hasTanam: false };
    const data = Papa.parse(csv, { header: true, skipEmptyLines: true, transformHeader: function (h) { return h.trim(); } }).data;
    data.forEach(function (raw) {
      const cat = String(raw["Activities Category"] || "").trim().toLowerCase();
      const id = String(raw["Kode Petak"] || "").trim().toUpperCase();
      const d = sheetDate(raw["Tanggal"], "dmy");
      if (!id || id === "#N/A" || !d) return;
      if (cat === "pemupukan") (pupuk[id] || (pupuk[id] = [])).push(d);
      else if (cat === "planting" && String(raw["Tipe Intervensi"] || "").trim().toLowerCase() === "penanaman") {
        const n = Math.max(0, sheetNum(raw["Jumlah"]));
        (tanam[id] || (tanam[id] = [])).push({ d: d, name: n > 0 ? plantName(raw["Jenis Tanaman"]) : "", n: n });
      }
    });
    Object.keys(pupuk).forEach(function (k) { pupuk[k].sort(function (a, b) { return a - b; }); });
    Object.keys(tanam).forEach(function (k) { tanam[k].sort(function (a, b) { return a.d - b.d; }); });
    return { pupuk: pupuk, tanam: tanam, hasTanam: Object.keys(tanam).length > 0 };
  }

  window.ACTIVITY_LOG_URL = LOG_URL;
  window.parseActivityLog = parseActivityLog;
  window.sheetDate = sheetDate;
  window.sheetIso = sheetIso;
  window.sheetNum = sheetNum;
})();
