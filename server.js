// server.ts
import express from "express";

// driveStateSync.ts
async function callScript(cfg, body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, secret: cfg.secret }),
      redirect: "follow",
      signal: controller.signal
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Respuesta no v\xE1lida del script (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(t);
  }
}
async function pullStateFromDrive(cfg) {
  const r = await callScript(cfg, { action: "loadState" }, 2e4);
  if (!r?.ok) throw new Error(r?.error || "El script no pudo leer el estado");
  if (!r.state) return null;
  const parsed = typeof r.state === "string" ? JSON.parse(r.state) : r.state;
  return { state: parsed, savedAt: String(parsed?._savedAt || r.savedAt || "") };
}
async function pushStateToDrive(cfg, stateJson) {
  const r = await callScript(cfg, { action: "saveState", state: stateJson }, 25e3);
  if (!r?.ok) throw new Error(r?.error || "El script no pudo guardar el estado");
}
function createDebouncedPusher(getCfg, getJson, delayMs = 3e3, onResult) {
  let timer = null;
  let inFlight = null;
  let dirty = false;
  async function run() {
    const cfg = getCfg();
    if (!cfg) {
      dirty = false;
      return;
    }
    if (inFlight) return;
    dirty = false;
    inFlight = (async () => {
      const remote = await pullStateFromDrive(cfg).catch(() => null);
      const payload = getJson(remote?.state || null);
      await pushStateToDrive(cfg, payload);
    })().then(() => {
      console.log("[DriveSync] Estado guardado en Google Drive.");
      onResult?.(true);
    }).catch((e) => {
      dirty = true;
      console.warn("[DriveSync] No se pudo guardar en Drive:", e?.message || e);
      onResult?.(false, String(e?.message || e));
    }).finally(() => {
      inFlight = null;
      if (dirty) schedule(delayMs * 3);
    });
    await inFlight;
  }
  function schedule(ms = delayMs) {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, ms);
  }
  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight) await inFlight;
    await run();
  }
  return { schedule, flush };
}

// src/utils/snapshotNormalizer.ts
function sumaPostnets(c) {
  if (!c) return 0;
  return (Number(c.postnet_amarillo) || 0) + (Number(c.postnet_rosa) || 0) + (Number(c.postnet_blanco) || 0);
}
function fechaMenosDias(iso, dias) {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => isNaN(n))) return iso;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}
var CORTE_OPERATIVO_HS = 5;
function operationalDateFromDate(now) {
  const ajustada = new Date(now.getTime() - CORTE_OPERATIVO_HS * 3600 * 1e3);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ajustada);
  } catch {
    return ajustada.toISOString().slice(0, 10);
  }
}
function parseHourFromHoraStr(hora) {
  if (!hora) return null;
  const norm = String(hora).replace(/\s+/g, " ").trim().toLowerCase();
  const m = norm.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (isNaN(h)) return null;
  const isPm = /p\.?\s*m\.?/.test(norm);
  const isAm = /a\.?\s*m\.?/.test(norm);
  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;
  return h;
}
function isNightClosureHour(hora) {
  const h = parseHourFromHoraStr(hora);
  if (h === null) return false;
  return h >= 20 || h < CORTE_OPERATIVO_HS;
}
function resolveEffectiveTurno(t) {
  if (!t) return "Ma\xF1ana";
  const idStr = String(t.id || "");
  const dlTurno = String(t.cierreCaja?.datalive_turno || "").trim().toLowerCase();
  const horaStr = t.hora_cierre || t.cierreCaja?.hora || "";
  const h = parseHourFromHoraStr(horaStr);
  if (t.turno === "Tarde") {
    if (idStr.includes("_Ma\xF1ana_") || dlTurno === "ma\xF1ana") {
      return "Ma\xF1ana";
    }
    if (h !== null && h >= 8 && h < 19) {
      return "Ma\xF1ana";
    }
  }
  return t.turno === "Tarde" ? "Tarde" : "Ma\xF1ana";
}
function hasRealTurnoData(t) {
  if (!t) return false;
  const conteos = t.conteos;
  if (conteos && typeof conteos === "object" && Object.keys(conteos).length > 0) {
    for (const v of Object.values(conteos)) {
      if (typeof v === "number" && v > 0) return true;
      if (v && typeof v === "object") {
        if (typeof v.stock === "number" && v.stock > 0) return true;
        if (typeof v.total === "number" && v.total > 0) return true;
        if (v.ubic && typeof v.ubic === "object") {
          const sum = Object.values(v.ubic).reduce((a, b) => a + (Number(b) || 0), 0);
          if (sum > 0) return true;
        }
      }
    }
    return true;
  }
  const cc = t.cierreCaja;
  if (cc && typeof cc === "object") {
    if ((Number(cc.efectivo_real) || 0) > 0 || (Number(cc.efectivo_mostrador_sist) || 0) > 0 || sumaPostnets(cc) > 0) {
      return true;
    }
  }
  return false;
}
function resolveFechaOperativa(t) {
  if (!t) return "";
  const rawFecha = String(t.fecha || "").trim();
  const idStr = String(t.id || "");
  const idMatch = idStr.match(/_(\d{13})(?:_|$)/);
  if (idMatch) {
    const ms = Number(idMatch[1]);
    if (!isNaN(ms) && ms > 17e11) {
      const opDate = operationalDateFromDate(new Date(ms));
      if (!rawFecha || rawFecha > opDate) {
        return opDate;
      }
    }
  }
  const tsStr = String(t.timestamp || "").trim();
  if (tsStr && !tsStr.endsWith(":20:00.000Z")) {
    const parsedMs = Date.parse(tsStr);
    if (!isNaN(parsedMs) && parsedMs > 17e11) {
      const opDate = operationalDateFromDate(new Date(parsedMs));
      if (!rawFecha || rawFecha > opDate) {
        return opDate;
      }
    }
  }
  return rawFecha;
}
function pickReferenciaTarde(turnos, hoyIso) {
  const lista = Array.isArray(turnos) ? turnos : [];
  if (lista.length === 0) return { turno: null, esDeAyer: false, diasAtras: null };
  const enriquecidos = [];
  for (const t of lista) {
    if (!t) continue;
    const fechaEfectiva = resolveFechaOperativa(t);
    if (!fechaEfectiva) continue;
    const turnoEfectivo = resolveEffectiveTurno(t);
    if (turnoEfectivo !== "Tarde") continue;
    const horaCierre = t.hora_cierre || t.cierreCaja?.hora || "";
    const tieneDatos = hasRealTurnoData(t);
    const esCierreFormal = Boolean(t.cerrado) && !t.autoArchivado;
    if (!esCierreFormal && !tieneDatos) continue;
    if (fechaEfectiva > hoyIso) continue;
    enriquecidos.push({
      original: {
        ...t,
        fecha: fechaEfectiva,
        turno: "Tarde"
      },
      fechaEfectiva,
      esCierreFormal,
      tieneDatos,
      sortTime: t.timestamp || `${fechaEfectiva}T${horaCierre || "23:59"}`
    });
  }
  if (enriquecidos.length === 0) {
    return { turno: null, esDeAyer: false, diasAtras: null };
  }
  const anterioresAHoy = enriquecidos.filter((e) => e.fechaEfectiva < hoyIso);
  const pool = anterioresAHoy.length > 0 ? anterioresAHoy : enriquecidos;
  pool.sort((a, b) => {
    if (a.fechaEfectiva !== b.fechaEfectiva) {
      return b.fechaEfectiva.localeCompare(a.fechaEfectiva);
    }
    if (a.tieneDatos !== b.tieneDatos) {
      return a.tieneDatos ? -1 : 1;
    }
    if (a.esCierreFormal !== b.esCierreFormal) {
      return a.esCierreFormal ? -1 : 1;
    }
    return b.sortTime.localeCompare(a.sortTime);
  });
  const chosen = pool[0]?.original || null;
  if (!chosen) return { turno: null, esDeAyer: false, diasAtras: null };
  const dias = Math.round(
    (Date.parse(hoyIso + "T00:00:00Z") - Date.parse(chosen.fecha + "T00:00:00Z")) / 864e5
  );
  return {
    turno: chosen,
    esDeAyer: chosen.fecha === fechaMenosDias(hoyIso, 1),
    diasAtras: dias
  };
}

// server.ts
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { jsPDF } from "jspdf";
var DEFAULT_NIGHT_CONTEOS = {};
var DEFAULT_NIGHT_SISTEMA = {};
function canonicalPid(key) {
  const k = String(key ?? "").trim();
  return /^\d+$/.test(k) ? "c-" + k : k;
}
function normalizeSistemaServer(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const entries = Object.entries(raw);
  for (const [k, v] of entries) {
    if (k.startsWith("c-") || k.startsWith("n-")) continue;
    const stock = typeof v === "number" ? v : Number(v?.stock);
    if (!isNaN(stock)) out[canonicalPid(k)] = { stock, actualizado: v?.actualizado || "" };
  }
  for (const [k, v] of entries) {
    if (!(k.startsWith("c-") || k.startsWith("n-"))) continue;
    const stock = typeof v === "number" ? v : Number(v?.stock);
    if (!isNaN(stock)) out[k] = { stock, actualizado: v?.actualizado || "" };
  }
  return out;
}
function normalizeConteosServer(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const pid = canonicalPid(k);
    if (v === null || v === void 0) continue;
    if (typeof v === "number") {
      out[pid] = { ubic: { "Stock F\xEDsico": v }, empleado: "", hora: "" };
      continue;
    }
    let ubic = null;
    if (v.ubic && typeof v.ubic === "object" && Object.keys(v.ubic).length > 0) {
      ubic = {};
      for (const [u, n] of Object.entries(v.ubic)) ubic[u] = Number(n) || 0;
    } else if (typeof v.total === "number") ubic = { "Stock F\xEDsico": v.total };
    else if (typeof v.stock === "number") ubic = { "Stock F\xEDsico": v.stock };
    else if (v.ubic && typeof v.ubic === "object") ubic = {};
    if (ubic) out[pid] = { ubic, empleado: v.empleado || "", hora: v.hora || "" };
  }
  return out;
}
var CORTE_DIA_OPERATIVO_HS = 5;
function getTodayIso(now = /* @__PURE__ */ new Date()) {
  const ajustada = new Date(now.getTime() - CORTE_DIA_OPERATIVO_HS * 3600 * 1e3);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ajustada);
  } catch {
    return ajustada.toISOString().split("T")[0];
  }
}
function getArgentinaHour(now = /* @__PURE__ */ new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hour12: false
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    return isNaN(h) ? now.getHours() : h % 24;
  } catch {
    return now.getHours();
  }
}
var FATI_HISTORICAL_TURNO_14 = {
  id: "turno_2026-10-14_Tarde_init",
  timestamp: "2026-10-14T23:20:00.000Z",
  fecha: "2026-10-14",
  turno: "Tarde",
  cerrado: true,
  hora_cierre: "23:20",
  cerrado_por: "Fati",
  cierreCaja: {
    existe: true,
    fecha: "2026-10-14",
    turno: "Tarde",
    efectivo_real: 124620,
    efectivo_mostrador_sist: 124620,
    postnet_amarillo: 60450,
    postnet_rosa: 5e4,
    postnet_blanco: 4e4,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: "Cierre oficial Turno Tarde Datalive #741694",
    empleado: "Fati",
    hora: "23:20"
  },
  conteos: DEFAULT_NIGHT_CONTEOS,
  sistemaStock: DEFAULT_NIGHT_SISTEMA
};
var FATI_HISTORICAL_TURNO = {
  id: "turno_2026-10-13_Tarde_init",
  timestamp: "2026-10-13T23:20:00.000Z",
  fecha: "2026-10-13",
  turno: "Tarde",
  cerrado: true,
  hora_cierre: "23:20",
  cerrado_por: "Fati",
  pdfUrl: "/api/reportes/pdf/Acta_General_Cierre_Escobar_2026-10-13_tarde.pdf",
  cierreCaja: {
    existe: true,
    fecha: "2026-10-13",
    turno: "Tarde",
    efectivo_real: 236250,
    efectivo_mostrador_sist: 235830,
    postnet_amarillo: 60450,
    postnet_rosa: 5e4,
    postnet_blanco: 4e4,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: "Positivo por propina (+ $420). Cierre oficial Turno Tarde Datalive #741392",
    empleado: "Fati",
    hora: "23:20"
  },
  conteos: {},
  sistemaStock: {}
};
function generateServerCierrePdfBuffer(turnoData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  const greenPrimary = [18, 61, 38];
  const greenLight = [238, 245, 240];
  const stoneMuted = [100, 116, 139];
  const stoneDark = [30, 41, 59];
  const borderColor = [226, 232, 240];
  const drawHeader = (pageNumber, totalPages) => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("CENTRAL DE PIZZAS & EMPANADAS \xB7 ESCOBAR", margin + 4, y + 6.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("ACTA OFICIAL DE CIERRE DE TURNO Y CONTROL DE STOCK", margin + 4, y + 12.5);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`P\xE1g. ${pageNumber}/${totalPages}`, pageWidth - margin - 4, y + 6.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`${turnoData.fecha} \xB7 Turno ${turnoData.turno}`, pageWidth - margin - 4, y + 12.5, { align: "right" });
    y += 21;
  };
  const checkPageBreak = (neededHeight) => {
    if (y + neededHeight > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
      drawHeader(doc.getNumberOfPages(), doc.getNumberOfPages());
    }
  };
  drawHeader(1, 1);
  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.setDrawColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 11, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text("CERRADO POR:", margin + 4, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.cerrado_por || turnoData.cierreCaja?.empleado || "Colaborador"}`, margin + 30, y + 4.5);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text("HORA CIERRE:", margin + 85, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.hora_cierre || turnoData.cierreCaja?.hora || "\u2014"} hs`, margin + 110, y + 4.5);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text("FECHA:", margin + 140, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.fecha}`, margin + 155, y + 4.5);
  y += 14;
  const cc = turnoData.cierreCaja || {};
  const efReal = Number(cc.efectivo_real) || 0;
  const efSist = Number(cc.efectivo_mostrador_sist) || 0;
  const difCaja = efReal - efSist;
  const postnets = (Number(cc.postnet_amarillo) || 0) + (Number(cc.postnet_rosa) || 0) + (Number(cc.postnet_blanco) || 0) || (Number(cc.online_local_sist) || 0);
  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.text("1. CIERRE DE CAJA Y ARQUEO DE EFECTIVO", margin + 3, y + 4.2);
  y += 8;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, contentWidth, 16, 1.5, 1.5, "FD");
  const colW = contentWidth / 4;
  doc.setFontSize(7);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text("EFECTIVO REAL", margin + 3, y + 4.5);
  doc.text("TE\xD3RICO DATALIVE", margin + colW + 3, y + 4.5);
  doc.text("DIFERENCIA CAJA", margin + colW * 2 + 3, y + 4.5);
  doc.text("POSTNETS / DIGITAL", margin + colW * 3 + 3, y + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`$ ${Math.round(efReal).toLocaleString("es-AR")}`, margin + 3, y + 10.5);
  doc.text(`$ ${Math.round(efSist).toLocaleString("es-AR")}`, margin + colW + 3, y + 10.5);
  doc.setTextColor(
    difCaja === 0 ? 30 : difCaja > 0 ? 16 : 225,
    difCaja === 0 ? 41 : difCaja > 0 ? 120 : 29,
    difCaja === 0 ? 59 : difCaja > 0 ? 60 : 72
  );
  doc.text(
    difCaja === 0 ? "$ 0 (Cuadrada)" : `${difCaja >= 0 ? "+" : ""}$ ${Math.round(difCaja).toLocaleString("es-AR")}`,
    margin + colW * 2 + 3,
    y + 10.5
  );
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`$ ${Math.round(postnets).toLocaleString("es-AR")}`, margin + colW * 3 + 3, y + 10.5);
  if (cc.observaciones) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text(`Obs: ${cc.observaciones}`, margin + 3, y + 14.5);
  }
  y += 19;
  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.text("2. AUDITOR\xCDA GENERAL DE STOCK (F\xCDSICO VS. SISTEMA)", margin + 3, y + 4.2);
  y += 8;
  const conteos = turnoData.conteos || {};
  const sistema = turnoData.sistemaStock || {};
  const cKeys = Object.keys(conteos);
  if (cKeys.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text("Sin conteo f\xEDsico registrado por los colaboradores para este turno.", margin + 3, y + 6);
    y += 10;
  } else {
    cKeys.forEach((k) => {
      checkPageBreak(5);
      const entry = conteos[k];
      const countVal = typeof entry === "number" ? entry : entry.ubic ? Object.values(entry.ubic).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
      const sysVal = sistema[k]?.stock ?? 0;
      const diff = countVal - sysVal;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
      doc.text(k, margin + 3, y + 3.5);
      doc.text(`Sist: ${sysVal} | Cont: ${countVal}`, margin + 120, y + 3.5, { align: "right" });
      doc.setTextColor(
        diff === 0 ? 150 : diff > 0 ? 16 : 225,
        diff === 0 ? 150 : diff > 0 ? 120 : 29,
        diff === 0 ? 150 : diff > 0 ? 60 : 72
      );
      doc.text(diff === 0 ? "0" : `${diff > 0 ? "+" : ""}${diff}`, margin + contentWidth - 3, y + 3.5, {
        align: "right"
      });
      y += 5;
    });
  }
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProduction = process.env.NODE_ENV === "production";
app.use(express.json({ limit: "25mb" }));
app.use(express.raw({ type: "application/pdf", limit: "25mb" }));
app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    app: "Central de Pizzas & Empanadas Escobar",
    time: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: process.uptime()
  });
});
var DATA_DIR = path.resolve(__dirname, ".data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
var PDF_DIR = path.resolve(DATA_DIR, "reports_pdf");
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
var STORAGE_FILE = path.resolve(DATA_DIR, "app-storage.json");
var DEFAULT_DL_BASE = "https://vm4.zona.dlsrvz.com/central/sistema/prd/";
var DEFAULT_STORAGE = {
  datalive: {
    usuario: process.env.DATALIVE_USUARIO || "principal.centralescobar",
    clave: process.env.DATALIVE_CLAVE || "escobar28",
    token: process.env.DATALIVE_TOKEN || "",
    scriptUrl: process.env.DATALIVE_SCRIPT_URL || "",
    apiEndpoint: DEFAULT_DL_BASE
  },
  google: {
    spreadsheetId: "",
    spreadsheetUrl: "",
    accountEmail: "charlydepiero@gmail.com",
    driveScriptUrl: process.env.GOOGLE_DRIVE_WEBHOOK_URL || "",
    targetFolder: "Reportes Cierre de Turno - Escobar",
    lastSync: "",
    lastDriveUpload: "",
    lastDriveUrl: ""
  },
  turnoActivo: {
    fecha: getTodayIso(),
    turno: "Ma\xF1ana",
    abierto: false,
    cerrado: false,
    apertura: null
  },
  reclamos: {},
  conteoActual: {},
  cierreCaja: {
    existe: false,
    postnet_amarillo: 0,
    postnet_rosa: 0,
    postnet_blanco: 0,
    online_local_sist: 0,
    efectivo_real: 0,
    efectivo_mostrador_sist: 0,
    observaciones: "",
    empleado: "",
    hora: ""
  },
  pastTurnos: [],
  // FIX: historial real, sin turnos de ejemplo
  aperturasDia: [],
  sistemaStock: DEFAULT_NIGHT_SISTEMA,
  empleados: [
    { nombre: "Tiara", pin: "1111", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Mai", pin: "2222", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Fati", pin: "3333", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Axel", pin: "4444", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Vero", pin: "5555", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Yamil", pin: "6666", activo: true, rol: "empleado", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Charly", pin: "1234", activo: true, rol: "admin", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Luis", pin: "4321", activo: true, rol: "admin", creado: "2026-01-01T00:00:00Z" },
    { nombre: "Admin", pin: "170226", activo: true, rol: "admin", oculto: true, creado: "2026-01-01T00:00:00Z" }
  ]
};
var memoryStorage = null;
function getDriveSyncConfig() {
  const url = String(process.env.GOOGLE_DRIVE_WEBHOOK_URL || memoryStorage?.google?.driveScriptUrl || "").trim();
  const secret = String(process.env.STATE_SYNC_SECRET || "").trim();
  if (!url.startsWith("http") || !secret) return null;
  return { url, secret };
}
var driveStatus = {
  restauracion: { resultado: "pendiente", detalle: "", hora: "" },
  ultimoGuardado: { ok: null, hora: "", error: "" }
};
var drivePusher = createDebouncedPusher(
  getDriveSyncConfig,
  (remoteState) => {
    if (memoryStorage && remoteState) {
      mergeRemoteHistoryIntoStorage(memoryStorage, remoteState);
    }
    return JSON.stringify(memoryStorage || {});
  },
  3e3,
  (ok, error) => {
    driveStatus.ultimoGuardado = { ok, hora: (/* @__PURE__ */ new Date()).toISOString(), error: error || "" };
  }
);
function marcarRestauracion(resultado, detalle = "") {
  driveStatus.restauracion = { resultado, detalle, hora: (/* @__PURE__ */ new Date()).toISOString() };
}
function mergeRemoteHistoryIntoStorage(target, remoteState) {
  if (!target || !remoteState || typeof remoteState !== "object") return false;
  let changed = false;
  if (Array.isArray(remoteState.pastTurnos) && remoteState.pastTurnos.length > 0) {
    if (!Array.isArray(target.pastTurnos)) target.pastTurnos = [];
    const normalizeShiftKey = (pt) => {
      const fOp = resolveFechaOperativa(pt) || pt?.fecha || "";
      const tEf = resolveEffectiveTurno(pt);
      const rawId = String(pt?.id || "");
      const cleanId = rawId.replace(/_(Mañana|Tarde)_/, `_${tEf}_`);
      return cleanId || `${fOp}_${tEf}_${pt?.hora_cierre || ""}`;
    };
    const existingKeys = new Set(target.pastTurnos.map(normalizeShiftKey));
    for (const rPt of remoteState.pastTurnos) {
      if (!rPt) continue;
      const k = normalizeShiftKey(rPt);
      if (!existingKeys.has(k)) {
        target.pastTurnos.push(rPt);
        existingKeys.add(k);
        changed = true;
      }
    }
  }
  if (Array.isArray(remoteState.aperturasDia) && remoteState.aperturasDia.length > 0) {
    if (!Array.isArray(target.aperturasDia)) target.aperturasDia = [];
    const existingApKeys = new Set(target.aperturasDia.map((a) => a?.id || a?.fecha));
    for (const rAp of remoteState.aperturasDia) {
      if (!rAp) continue;
      const k = rAp.id || rAp.fecha;
      if (k && !existingApKeys.has(k)) {
        target.aperturasDia.push(rAp);
        existingApKeys.add(k);
        changed = true;
      }
    }
  }
  if (reconciliarYRecuperarTurnos(target)) {
    changed = true;
  }
  return changed;
}
async function restoreStateFromDrive() {
  const cfg = getDriveSyncConfig();
  if (!cfg) {
    console.log("[DriveSync] Sin GOOGLE_DRIVE_WEBHOOK_URL / STATE_SYNC_SECRET: se usa solo el disco local.");
    marcarRestauracion("SIN_CONFIGURAR", "La app no ve GOOGLE_DRIVE_WEBHOOK_URL y/o STATE_SYNC_SECRET (revisar Secrets).");
    return;
  }
  try {
    const remote = await pullStateFromDrive(cfg);
    let localParsed = null;
    let localSavedAt = "";
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        localParsed = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf-8"));
        localSavedAt = String(localParsed?._savedAt || "");
      }
    } catch {
    }
    const isRenderProd = isProduction || Boolean(process.env.RENDER);
    if (remote && remote.state) {
      const useRemoteAsBase = !isRenderProd || !localSavedAt || remote.savedAt >= localSavedAt;
      const baseState = useRemoteAsBase ? remote.state : localParsed || remote.state;
      const secondaryState = useRemoteAsBase ? localParsed : remote.state;
      fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(baseState, null, 2), "utf-8");
      memoryStorage = null;
      const st = readStorage();
      const mergedOrRepaired = mergeRemoteHistoryIntoStorage(st, secondaryState || remote.state);
      if (mergedOrRepaired) {
        writeStorage(st);
      }
      console.log(`[DriveSync] Estado sincronizado y verificado con Google Drive (guardado ${remote.savedAt || "s/f"}).`);
      marcarRestauracion("RESTAURADO_DESDE_DRIVE", `Drive guardado ${remote.savedAt || "s/f"}; local ${localSavedAt || "sin fecha"}`);
    } else if (!remote) {
      console.log("[DriveSync] Drive todav\xEDa no tiene estado guardado; se sube el actual.");
      marcarRestauracion("DRIVE_VACIO_SE_SUBE_LOCAL", "Drive no ten\xEDa app-storage.json");
      readStorage();
      drivePusher.schedule(1e3);
    }
  } catch (e) {
    console.warn("[DriveSync] No se pudo leer Drive al iniciar (se usa el disco local):", e?.message || e);
    marcarRestauracion("ERROR_AL_LEER_DRIVE", String(e?.message || e));
  }
}
function loadStorageFromDisk() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8").trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        const employees = parsed.empleados && parsed.empleados.length > 0 ? parsed.empleados : DEFAULT_STORAGE.empleados;
        const adminEmp = employees.find((e) => e.nombre.toLowerCase() === "admin");
        if (adminEmp && adminEmp.pin !== "170226") {
          adminEmp.pin = "170226";
          adminEmp.oculto = true;
        }
        const rawDl = parsed.datalive || {};
        const dlConfig = {
          usuario: (rawDl.usuario || process.env.DATALIVE_USUARIO || "principal.centralescobar").trim(),
          clave: (rawDl.clave || process.env.DATALIVE_CLAVE || "escobar28").trim(),
          token: (rawDl.token || process.env.DATALIVE_TOKEN || "").trim(),
          scriptUrl: (rawDl.scriptUrl || process.env.DATALIVE_SCRIPT_URL || "").trim(),
          apiEndpoint: (rawDl.apiEndpoint || DEFAULT_DL_BASE).trim()
        };
        const loadedStorage = {
          datalive: dlConfig,
          google: { ...DEFAULT_STORAGE.google, ...parsed.google || {} },
          empleados: employees,
          turnoActivo: parsed.turnoActivo || DEFAULT_STORAGE.turnoActivo,
          reclamos: parsed.reclamos || {},
          conteoActual: parsed.conteoActual || {},
          cierreCaja: parsed.cierreCaja || DEFAULT_STORAGE.cierreCaja,
          sistemaStock: parsed.sistemaStock || DEFAULT_NIGHT_SISTEMA,
          pastTurnos: (Array.isArray(parsed.pastTurnos) && parsed.pastTurnos.length > 0 ? parsed.pastTurnos : DEFAULT_STORAGE.pastTurnos).map(
            (pt, idx) => {
              const shiftId = pt.id || `turno_${pt.fecha || "2026-10-14"}_${pt.turno || "Tarde"}_${pt.hora_cierre ? pt.hora_cierre.replace(/:/g, "") : idx}`;
              const time = pt.timestamp || `${pt.fecha || "2026-10-14"}T${pt.hora_cierre ? pt.hora_cierre.includes(":") ? pt.hora_cierre.padStart(5, "0") : "23:20" : "23:20"}:00.000Z`;
              return {
                ...pt,
                id: shiftId,
                timestamp: time,
                cerrado: pt.cerrado !== void 0 ? pt.cerrado : true
              };
            }
          ),
          aperturasDia: Array.isArray(parsed.aperturasDia) ? parsed.aperturasDia : [],
          ultimoCierreTarde: parsed.ultimoCierreTarde || null,
          conteoTardeAnterior: parsed.conteoTardeAnterior || null
        };
        if (reconciliarYRecuperarTurnos(loadedStorage)) {
          try {
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(loadedStorage, null, 2), "utf-8");
          } catch {
          }
        }
        return loadedStorage;
      }
    }
  } catch (err) {
    console.error("[Storage] Error leyendo archivo de almacenamiento:", err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STORAGE));
}
function areConteosEquivalent(a, b) {
  const normA = normalizeConteosServer(a || {});
  const normB = normalizeConteosServer(b || {});
  const keysA = Object.keys(normA);
  const keysB = Object.keys(normB);
  if (keysA.length === 0 || keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!normB[k]) return false;
    const sumA = Object.values(normA[k].ubic || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
    const sumB = Object.values(normB[k].ubic || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (sumA !== sumB) return false;
  }
  return true;
}
function archivarTurnoActivoSiTieneDatos(storage) {
  if (!storage || !storage.turnoActivo) return false;
  if (storage.turnoActivo.cerrado === true) return false;
  const conteosNorm = normalizeConteosServer(storage.conteoActual || {});
  const tieneConteos = Object.keys(conteosNorm).length > 0;
  const cc = storage.cierreCaja || {};
  const tieneCaja = Boolean(cc.existe) && ((Number(cc.efectivo_real) || 0) > 0 || (Number(cc.postnet_amarillo) || 0) > 0 || (Number(cc.postnet_rosa) || 0) > 0 || (Number(cc.postnet_blanco) || 0) > 0);
  if (!tieneConteos && !tieneCaja) return false;
  if (!Array.isArray(storage.pastTurnos)) storage.pastTurnos = [];
  const fechaTurno = resolveFechaOperativa({ fecha: storage.turnoActivo.fecha }) || getTodayIso();
  const turnoNombre = storage.turnoActivo.turno || "Tarde";
  const formalExistente = storage.pastTurnos.find(
    (p) => resolveFechaOperativa(p) === fechaTurno && resolveEffectiveTurno(p) === turnoNombre && !p.autoArchivado
  );
  if (formalExistente) {
    let updated = false;
    if (tieneConteos && Object.keys(formalExistente.conteos || {}).length === 0) {
      formalExistente.conteos = conteosNorm;
      updated = true;
    }
    if (tieneCaja && !(Number(formalExistente.cierreCaja?.efectivo_real) > 0)) {
      formalExistente.cierreCaja = { ...cc, existe: true, fecha: fechaTurno, turno: turnoNombre };
      updated = true;
    }
    return updated;
  }
  const autoIdx = storage.pastTurnos.findIndex(
    (p) => resolveFechaOperativa(p) === fechaTurno && resolveEffectiveTurno(p) === turnoNombre && p.autoArchivado
  );
  const horaRef = storage.turnoActivo.hora_cierre || cc.hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const empRef = storage.turnoActivo.cerrado_por || cc.empleado || storage.turnoActivo.abierto_por || "Colaborador";
  const record = {
    id: `turno_${fechaTurno}_${turnoNombre}_auto_${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    autoArchivado: true,
    fecha: fechaTurno,
    turno: turnoNombre,
    cerrado: true,
    hora_cierre: horaRef,
    cerrado_por: empRef,
    cierreCaja: tieneCaja ? { ...cc, existe: true, fecha: fechaTurno, turno: turnoNombre } : { existe: false, fecha: fechaTurno, turno: turnoNombre },
    conteos: conteosNorm,
    sistemaStock: normalizeSistemaServer(storage.sistemaStock || {})
  };
  if (autoIdx >= 0) {
    storage.pastTurnos[autoIdx] = {
      ...storage.pastTurnos[autoIdx],
      ...record,
      conteos: tieneConteos ? conteosNorm : storage.pastTurnos[autoIdx].conteos,
      cierreCaja: tieneCaja ? record.cierreCaja : storage.pastTurnos[autoIdx].cierreCaja
    };
  } else {
    storage.pastTurnos.unshift(record);
  }
  if (turnoNombre === "Tarde" && tieneConteos) {
    storage.conteoTardeAnterior = conteosNorm;
  }
  return true;
}
function reconciliarYRecuperarTurnos(storage) {
  if (!storage) return false;
  if (!Array.isArray(storage.pastTurnos)) storage.pastTurnos = [];
  let changed = false;
  for (const pt of storage.pastTurnos) {
    if (!pt) continue;
    const opFecha = resolveFechaOperativa(pt);
    if (opFecha && pt.fecha !== opFecha) {
      console.log(`[Reconciliaci\xF3n] Corrigiendo fecha de turno ${pt.id}: ${pt.fecha} -> ${opFecha}`);
      pt.fecha = opFecha;
      if (pt.cierreCaja) pt.cierreCaja.fecha = opFecha;
      changed = true;
    }
  }
  for (const pt of storage.pastTurnos) {
    if (!pt) continue;
    const realTurno = resolveEffectiveTurno(pt);
    if (realTurno === "Ma\xF1ana" && pt.turno !== "Ma\xF1ana") {
      console.log(
        `[Reconciliaci\xF3n] Restaurando Turno Ma\xF1ana mal etiquetado como Tarde: ${pt.id} (${pt.fecha} ${pt.hora_cierre})`
      );
      pt.turno = "Ma\xF1ana";
      if (pt.cierreCaja) pt.cierreCaja.turno = "Ma\xF1ana";
      if (typeof pt.id === "string" && pt.id.includes("_Tarde_")) {
        pt.id = pt.id.replace("_Tarde_", "_Ma\xF1ana_");
      }
      changed = true;
    }
  }
  for (const pt of storage.pastTurnos) {
    if (!pt || pt.turno !== "Ma\xF1ana") continue;
    const dlTurno = String(pt.cierreCaja?.datalive_turno || "").trim().toLowerCase();
    if (dlTurno === "ma\xF1ana") continue;
    const hr = pt.hora_cierre || pt.cierreCaja?.hora || "";
    if (isNightClosureHour(hr) && hasRealTurnoData(pt)) {
      const tieneOtroManana = storage.pastTurnos.some(
        (other) => other !== pt && other.fecha === pt.fecha && other.turno === "Ma\xF1ana" && !isNightClosureHour(other.hora_cierre || other.cierreCaja?.hora || "")
      );
      const tieneTardeEseDia = storage.pastTurnos.some(
        (other) => other !== pt && other.fecha === pt.fecha && other.turno === "Tarde" && hasRealTurnoData(other)
      );
      if (tieneOtroManana && !tieneTardeEseDia) {
        console.log(`[Reconciliaci\xF3n] Reclasificando cierre nocturno real (${hr}) de ${pt.fecha} como Turno Tarde`);
        pt.turno = "Tarde";
        if (pt.cierreCaja) pt.cierreCaja.turno = "Tarde";
        changed = true;
      }
    }
  }
  const deduped = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (const pt of storage.pastTurnos) {
    if (!pt) continue;
    if (pt.autoArchivado) {
      const formalMatch = storage.pastTurnos.find(
        (other) => other !== pt && !other.autoArchivado && other.fecha === pt.fecha && other.turno === pt.turno
      );
      if (formalMatch) {
        if (Object.keys(formalMatch.conteos || {}).length === 0 && Object.keys(pt.conteos || {}).length > 0) {
          formalMatch.conteos = pt.conteos;
        }
        console.log(`[Reconciliaci\xF3n] Eliminando turno auto-archivado duplicado: ${pt.id}`);
        changed = true;
        continue;
      }
    }
    const key = String(pt.id || `${pt.fecha}_${pt.turno}_${pt.hora_cierre}`);
    if (seenIds.has(key)) {
      changed = true;
      continue;
    }
    seenIds.add(key);
    deduped.push(pt);
  }
  if (deduped.length !== storage.pastTurnos.length) {
    storage.pastTurnos = deduped;
    changed = true;
  }
  if (storage.ultimoCierreTarde && resolveEffectiveTurno(storage.ultimoCierreTarde) !== "Tarde") {
    const realLastTarde = storage.pastTurnos.find((pt) => pt && resolveEffectiveTurno(pt) === "Tarde") || null;
    storage.ultimoCierreTarde = realLastTarde;
    changed = true;
  }
  const todayIso = getTodayIso();
  const ayerIso = fechaMenosDias(todayIso, 1);
  const existeTardeAyer = storage.pastTurnos.some(
    (pt) => pt && pt.fecha === ayerIso && pt.turno === "Tarde" && hasRealTurnoData(pt)
  );
  if (!existeTardeAyer && storage.conteoTardeAnterior && Object.keys(storage.conteoTardeAnterior).length > 0) {
    const conteosRecuperados = normalizeConteosServer(storage.conteoTardeAnterior);
    const yaEstaEnOtroTurno = storage.pastTurnos.some(
      (pt) => pt && areConteosEquivalent(pt.conteos, conteosRecuperados)
    );
    if (!yaEstaEnOtroTurno) {
      let sampleEmp = "Colaborador";
      let sampleHora = "23:30";
      for (const val of Object.values(conteosRecuperados)) {
        if (val?.empleado) sampleEmp = val.empleado;
        if (val?.hora) sampleHora = val.hora;
        if (sampleEmp !== "Colaborador") break;
      }
      const ccActual = storage.cierreCaja || {};
      const cajaNoUsadaEnViejo = Boolean(ccActual.existe) && (Number(ccActual.efectivo_real) || 0) > 0 && !storage.pastTurnos.some(
        (pt) => Number(pt?.cierreCaja?.efectivo_real) === Number(ccActual.efectivo_real)
      );
      const turnoRecuperado = {
        id: `turno_${ayerIso}_Tarde_rec_${Date.now()}`,
        timestamp: `${ayerIso}T23:55:00.000Z`,
        fecha: ayerIso,
        turno: "Tarde",
        cerrado: true,
        hora_cierre: sampleHora,
        cerrado_por: sampleEmp,
        cierreCaja: cajaNoUsadaEnViejo ? { ...ccActual, existe: true, fecha: ayerIso, turno: "Tarde" } : storage.ultimoCierreTarde?.fecha === ayerIso && storage.ultimoCierreTarde?.turno === "Tarde" ? storage.ultimoCierreTarde.cierreCaja : { existe: false, fecha: ayerIso, turno: "Tarde" },
        conteos: conteosRecuperados,
        sistemaStock: normalizeSistemaServer(storage.sistemaStock || {})
      };
      console.log(`[Reconciliaci\xF3n] Recuperado turno Tarde de ${ayerIso} desde conteoTardeAnterior (${Object.keys(conteosRecuperados).length} \xEDtems)`);
      storage.pastTurnos.unshift(turnoRecuperado);
      changed = true;
    }
  }
  if (changed) {
    storage.pastTurnos.sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha || "").localeCompare(String(a.fecha || ""));
      if (a.turno !== b.turno) return a.turno === "Tarde" ? -1 : 1;
      const timeA = a.timestamp || `${a.fecha}T${a.hora_cierre || "00:00"}`;
      const timeB = b.timestamp || `${b.fecha}T${b.hora_cierre || "00:00"}`;
      return timeB.localeCompare(timeA);
    });
  }
  return changed;
}
function readStorage() {
  if (!memoryStorage) {
    memoryStorage = loadStorageFromDisk();
  }
  return memoryStorage;
}
function writeStorage(data, options) {
  try {
    data._savedAt = (/* @__PURE__ */ new Date()).toISOString();
    memoryStorage = data;
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${STORAGE_FILE}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, STORAGE_FILE);
  } catch (err) {
    console.error("[Storage] Error guardando archivo at\xF3mico de almacenamiento:", err);
  }
  if (!options?.skipDrivePush) {
    drivePusher.schedule();
  }
}
function dlExtraerCookies(headers) {
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (setCookies && setCookies.length > 0) {
    return setCookies.map((c) => c.split(";")[0].trim()).join("; ");
  }
  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(",").map((c) => c.split(";")[0].trim()).join("; ");
}
function dlCombinarCookies(base, nuevo) {
  const map = {};
  (base || "").split(";").forEach((p) => {
    const [k, v] = p.trim().split("=");
    if (k) map[k] = v;
  });
  (nuevo || "").split(";").forEach((p) => {
    const [k, v] = p.trim().split("=");
    if (k) map[k] = v;
  });
  return Object.keys(map).map((k) => `${k}=${map[k]}`).join("; ");
}
function dlDecodificarEntidades(s) {
  return s.replace(/&oacute;/g, "\xF3").replace(/&aacute;/g, "\xE1").replace(/&eacute;/g, "\xE9").replace(/&iacute;/g, "\xED").replace(/&uacute;/g, "\xFA").replace(/&ntilde;/g, "\xF1").replace(/&Ntilde;/g, "\xD1").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function dlParsearArgNumero(s) {
  s = (s || "").toString().trim();
  if (s === "" || s === "-") return 0;
  s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function dlParsearTablaStock(html) {
  const filas = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const celdas = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      const texto = dlDecodificarEntidades(tdMatch[1].replace(/<[^>]*>/g, "")).trim();
      celdas.push(texto);
    }
    if (celdas.length >= 3 && /^\d+$/.test(celdas[0])) {
      filas.push({
        codigo: celdas[0],
        nombre: celdas[1],
        stock: dlParsearArgNumero(celdas[2])
      });
    }
  }
  return filas;
}
async function dlLoginSesion(dlBase, usu, pass, token = "") {
  const base = dlBase.endsWith("/") ? dlBase : dlBase + "/";
  const loginPage = await fetch(base + "index.php", {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    redirect: "manual"
  });
  const cookies1 = dlExtraerCookies(loginPage.headers);
  const params = new URLSearchParams({
    from: "AJAX2",
    usu,
    pass,
    Token: token || "",
    logeoAdmin: ""
  });
  const loginResp = await fetch(base + "login_action.php?" + params.toString(), {
    method: "GET",
    headers: {
      Cookie: cookies1,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const responseText = await loginResp.text();
  let data = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Datalive login fall\xF3: Respuesta no v\xE1lida del servidor (${responseText.slice(0, 120)})`);
  }
  if (data["0"] !== "OK") {
    const errorMsg = data.msg || data.mensaje || JSON.stringify(data);
    throw new Error(`Login en Datalive fall\xF3: ${errorMsg}`);
  }
  const cookies2 = dlExtraerCookies(loginResp.headers);
  return dlCombinarCookies(cookies1, cookies2);
}
async function dlImportarStock(dlBase, cookies) {
  const base = dlBase.endsWith("/") ? dlBase : dlBase + "/";
  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const fecha = formatter.format(/* @__PURE__ */ new Date());
  const url = `${base}PR/pr_ver_masiva_stock_nuevo_datos_excel.php?rubroSel=0&optFiltros=&cod_suc_reporte=&fecha=${encodeURIComponent(
    fecha
  )}`;
  console.log(`[Datalive Sync] Fetching stock spreadsheet from ${url}...`);
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Cookie: cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!resp.ok) {
    throw new Error(`Datalive respondi\xF3 c\xF3digo ${resp.status} al consultar la planilla de stock.`);
  }
  const html = await resp.text();
  return dlParsearTablaStock(html);
}
function dlParseMoney(s) {
  if (!s) return 0;
  s = String(s).replace(/&nbsp;/g, "").replace(/[$\s]/g, "").trim();
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}
async function dlObtenerListaCajas(dlBase, cookies) {
  const base = dlBase.endsWith("/") ? dlBase : dlBase + "/";
  const resp = await fetch(base + "index.php?action=3&subaction=ve_01_nuevo", {
    headers: {
      Cookie: cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const html = await resp.text();
  const boxes = [];
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trMatches) {
    const row = tr[1];
    const codMatch = row.match(/cod_ventas=(\d+)/);
    if (!codMatch) continue;
    const codVentas = codMatch[1];
    const isAbierta = row.includes("color: green") || row.includes("Abierta") || row.includes("btn-success") || row.includes("verde") || row.includes("label-success");
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => dlDecodificarEntidades(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    );
    if (tds.length >= 4) {
      boxes.push({
        codVentas,
        fecha: tds[1] || "",
        turno: tds[2] || "",
        estado: tds[3] || (isAbierta ? "Abierta" : "Cerrada"),
        sucursal: tds[4] || "",
        cajero: tds[5] || "",
        isAbierta
      });
    }
  }
  return boxes;
}
async function dlObtenerDetalleCaja(dlBase, cookies, codVentas) {
  const base = dlBase.endsWith("/") ? dlBase : dlBase + "/";
  const movRes = await fetch(
    `${base}index.php?action=3&subaction=ve_02&subsection=ve_detalle_movimientos&cod_ventas=${codVentas}`,
    {
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    }
  );
  const movHtml = await movRes.text();
  let dineroInicio = 0;
  let totalVentas = 0;
  let totalComandas = 0;
  let totalGastos = 0;
  let totalEgresos = 0;
  let totalSueldos = 0;
  let totalEfectivo = 0;
  let totalOnline = 0;
  const tables = [...movHtml.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length >= 1) {
    const t0Rows = [...tables[0][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of t0Rows) {
      const rowHtml = tr[1];
      const text = rowHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      if (/Dinero al inicio/i.test(text)) {
        const m = rowHtml.match(/\$([\d.,]+)/);
        if (m) dineroInicio = dlParseMoney(m[1]);
      } else if (/Total de ventas/i.test(text)) {
        const cMatch = rowHtml.match(/(\d+)\s*Comandas\s*confirmadas/i);
        if (cMatch) totalComandas = parseInt(cMatch[1], 10);
        const moneyMatches = [...rowHtml.matchAll(/\$([\d.,]+)/g)].map((m) => dlParseMoney(m[1]));
        if (moneyMatches.length >= 1) totalVentas = moneyMatches[0];
        if (moneyMatches.length >= 2) totalEfectivo = moneyMatches[1];
        if (moneyMatches.length >= 3) totalOnline = moneyMatches[2];
      } else if (/Total de gastos/i.test(text)) {
        const m = rowHtml.match(/\$([-\d.,]+)/);
        if (m) totalGastos = dlParseMoney(m[1]);
      } else if (/Total de egresos/i.test(text)) {
        const m = rowHtml.match(/\$([-\d.,]+)/);
        if (m) totalEgresos = dlParseMoney(m[1]);
      } else if (/Total pagos de sueldo/i.test(text)) {
        const m = rowHtml.match(/\$([-\d.,]+)/);
        if (m) totalSueldos = dlParseMoney(m[1]);
      }
    }
  }
  let efectivoMostrador = 0;
  let efectivoDelivery = 0;
  let onlineLocal = 0;
  let pedidosYaOnline = 0;
  let pedidosYaEfectivo = 0;
  if (tables.length >= 3) {
    const t2Trs = [...tables[2][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    t2Trs.forEach((tr) => {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (td) => dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      );
      if (tds.length >= 3) {
        const concepto = tds[0].toLowerCase();
        const ef = dlParseMoney(tds[1]);
        const onl = dlParseMoney(tds[2]);
        if (concepto.includes("efectivo mostrador")) efectivoMostrador = ef;
        if (concepto.includes("efectivo delivery")) efectivoDelivery = ef;
        if (concepto.includes("online local")) onlineLocal = onl;
        if (concepto.includes("pedidos ya online")) pedidosYaOnline = onl;
        if (concepto.includes("pedidos ya efectivo")) pedidosYaEfectivo = ef;
      }
    });
  }
  const egresos = [];
  try {
    const egrRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_egresos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } }
    );
    const egrHtml = await egrRes.text();
    const egrTrs = [...egrHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of egrTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (td) => dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      );
      if (tds.length >= 6 && /^\d+$/.test(tds[0]) && tds[1].trim() !== "" && tds[3].trim() !== "") {
        egresos.push({
          codigo: tds[0],
          hora: tds[1],
          usuario: tds[2],
          concepto: tds[3],
          sucursal: tds[4],
          monto: dlParseMoney(tds[5])
        });
      }
    }
  } catch (e) {
    console.error("Error fetching egresos:", e);
  }
  const sueldos = [];
  try {
    const sueRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_sueldos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } }
    );
    const sueHtml = await sueRes.text();
    const sueTrs = [...sueHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of sueTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (td) => dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      );
      if (tds.length >= 7 && /^\d+$/.test(tds[0]) && tds[1].trim() !== "" && tds[2].trim() !== "") {
        sueldos.push({
          codigo: tds[0],
          hora: tds[1],
          empleado: tds[2],
          vale: tds[3],
          observaciones: tds[4],
          periodo: tds[5],
          monto: dlParseMoney(tds[6])
        });
      }
    }
  } catch (e) {
    console.error("Error fetching sueldos:", e);
  }
  const gastos = [];
  try {
    const gasRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_gastos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } }
    );
    const gasHtml = await gasRes.text();
    const gasTrs = [...gasHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of gasTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (td) => dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      );
      if (tds.length >= 5 && /^\d+$/.test(tds[0]) && tds[1].trim() !== "" && (tds[2]?.trim() !== "" || tds[3]?.trim() !== "")) {
        gastos.push({
          codigo: tds[0],
          hora: tds[1],
          concepto: tds[2] || tds[3],
          monto: dlParseMoney(tds[tds.length - 2])
        });
      }
    }
  } catch (e) {
    console.error("Error fetching gastos:", e);
  }
  const rubros = {};
  try {
    const comRes = await fetch(
      `${base}VE/tomar_pedidos_v3.1/ve_venta_lista_comandas_V2.php?hist=X&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } }
    );
    const comHtml = await comRes.text();
    const dateMatch = comHtml.match(/fcn_ventas_por_grupo\(\s*[\x27"](\d{8})[\x27"]/);
    const fechaParam = dateMatch ? dateMatch[1] : "";
    const vgRes = await fetch(`${base}VE/tomar_pedidos_v3.1/ventas_grupo_datos.php`, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${base}VE/tomar_pedidos_v3.1/ve_venta_lista_comandas_V2.php?hist=X&cod_ventas=${codVentas}`
      },
      body: new URLSearchParams({
        tipo: "LISTA",
        fechaDesde: fechaParam,
        fechaHasta: fechaParam,
        cod_ventas: codVentas,
        IDZona: ""
      }).toString()
    });
    const vgData = await vgRes.json();
    if (vgData && vgData[0] === "OK" && Array.isArray(vgData.lista)) {
      vgData.lista.forEach((item) => {
        const rName = dlDecodificarEntidades(item.desc_rubro || "Otros").trim();
        if (!rubros[rName]) {
          rubros[rName] = { totalCant: 0, totalMonto: 0, items: [] };
        }
        const cant = parseFloat(item.cantidad) || 0;
        const total = parseFloat(item.total) || 0;
        rubros[rName].totalCant += cant;
        rubros[rName].totalMonto += total;
        rubros[rName].items.push({
          nombre: dlDecodificarEntidades(item.desc_prd || "").trim(),
          codigo: String(item.codigo || "").trim(),
          cantidad: cant,
          monto: total,
          subRubro: dlDecodificarEntidades(item.descSR || "").trim(),
          pctRubro: "0"
        });
      });
      Object.keys(rubros).forEach((rName) => {
        const r = rubros[rName];
        r.items.sort((a, b) => b.cantidad - a.cantidad);
        r.items.forEach((it) => {
          it.pctRubro = r.totalCant > 0 ? (it.cantidad / r.totalCant * 100).toFixed(1) : "0";
        });
      });
    }
  } catch (e) {
    console.error("Error fetching ventas grupo:", e);
  }
  const gastosVal = Math.abs(totalGastos || 0) || gastos.reduce((acc, g) => acc + Math.abs(g.monto || 0), 0);
  const egresosVal = Math.abs(totalEgresos || 0) || egresos.reduce((acc, e) => acc + Math.abs(e.monto || 0), 0);
  const sueldosVal = Math.abs(totalSueldos || 0) || sueldos.reduce((acc, s) => acc + Math.abs(s.monto || 0), 0);
  const totalSalidas = gastosVal + egresosVal + sueldosVal;
  const teoricoCaja = (dineroInicio || 0) + (efectivoMostrador || 0) + (pedidosYaEfectivo || 0) - totalSalidas;
  return {
    codVentas,
    fechaTexto: "",
    turnoTexto: "",
    estado: "",
    sucursal: "Central Escobar",
    cajero: "",
    dineroInicio,
    totalVentas,
    totalComandas,
    efectivoMostrador,
    efectivoDelivery,
    onlineLocal,
    pedidosYaOnline,
    pedidosYaEfectivo,
    teoricoCaja,
    totalEfectivo,
    totalOnline,
    totalGastos: gastosVal,
    totalEgresos: egresosVal,
    totalSueldos: sueldosVal,
    totalSalidas,
    egresos,
    sueldos,
    gastos,
    rubros
  };
}
app.get("/api/datalive/config", (_req, res) => {
  const storage = readStorage();
  const dl = storage.datalive;
  const isConfigured = Boolean(dl.usuario && dl.clave || dl.scriptUrl);
  return res.json({
    configurado: isConfigured,
    usuario: dl.usuario || "",
    hasClave: Boolean(dl.clave),
    hasToken: Boolean(dl.token),
    scriptUrl: dl.scriptUrl || "",
    apiEndpoint: dl.apiEndpoint || DEFAULT_DL_BASE
  });
});
app.post("/api/datalive/config", (req, res) => {
  const { usuario, clave, token, scriptUrl, apiEndpoint } = req.body || {};
  const storage = readStorage();
  if (usuario !== void 0) storage.datalive.usuario = String(usuario).trim();
  if (clave !== void 0 && String(clave).trim() !== "") storage.datalive.clave = String(clave).trim();
  if (token !== void 0) storage.datalive.token = String(token).trim();
  if (scriptUrl !== void 0) storage.datalive.scriptUrl = String(scriptUrl).trim();
  if (apiEndpoint !== void 0 && String(apiEndpoint).trim() !== "")
    storage.datalive.apiEndpoint = String(apiEndpoint).trim();
  writeStorage(storage);
  console.log(`[Storage] Credenciales de Datalive guardadas permanentemente para usuario: "${storage.datalive.usuario}"`);
  const isConfigured = Boolean(storage.datalive.usuario && storage.datalive.clave || storage.datalive.scriptUrl);
  return res.json({
    ok: true,
    configurado: isConfigured,
    usuario: storage.datalive.usuario,
    mensaje: "Credenciales guardadas permanentemente en el servidor."
  });
});
app.post("/api/datalive/sync", async (req, res) => {
  const body = req.body || {};
  const storage = readStorage();
  const dl = storage.datalive;
  const scriptUrl = (body.scriptUrl !== void 0 && body.scriptUrl !== "" ? body.scriptUrl : dl.scriptUrl || "").trim();
  const usuario = (body.usuario !== void 0 && body.usuario !== "" ? body.usuario : dl.usuario || "").trim();
  const clave = (body.clave !== void 0 && body.clave !== "" ? body.clave : dl.clave || "").trim();
  const token = (body.token !== void 0 && body.token !== "" ? body.token : dl.token || "").trim();
  const apiEndpoint = (body.apiEndpoint !== void 0 && body.apiEndpoint !== "" ? body.apiEndpoint : dl.apiEndpoint || DEFAULT_DL_BASE).trim();
  try {
    if (scriptUrl && scriptUrl.startsWith("http")) {
      console.log("[Datalive Sync] Invocando Google Apps Script...");
      const response = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getStock", usuario, clave, token }),
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(`Google Apps Script respondi\xF3 con status: ${response.status}`);
      }
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || data.productos || data.stock || [];
      return res.json({ ok: true, source: "apps_script", items });
    }
    if (usuario && clave) {
      console.log(`[Datalive Sync] Invocando login de sesi\xF3n en Datalive (${apiEndpoint}) para usuario: ${usuario}...`);
      const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
      console.log("[Datalive Sync] Sesi\xF3n iniciada con \xE9xito. Descargando tabla de stock masiva...");
      const items = await dlImportarStock(apiEndpoint, cookies);
      console.log(`[Datalive Sync] Procesados ${items.length} productos desde Datalive.`);
      dlNocheCache = null;
      return res.json({
        ok: true,
        source: "datalive_session",
        total: items.length,
        items
      });
    }
    return res.status(400).json({
      ok: false,
      error: "Datalive no est\xE1 configurado en el servidor. El due\xF1o o admin debe ingresar el usuario y clave una vez en la pesta\xF1a Productos."
    });
  } catch (error) {
    console.error("[Datalive Sync Error]:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Error al conectar con el sistema Datalive."
    });
  }
});
app.get("/api/datalive/cajas", async (_req, res) => {
  try {
    const storage = readStorage();
    const dl = storage.datalive;
    const usuario = (dl.usuario || "").trim();
    const clave = (dl.clave || "").trim();
    const token = (dl.token || "").trim();
    const apiEndpoint = (dl.apiEndpoint || DEFAULT_DL_BASE).trim();
    if (!usuario || !clave) {
      return res.status(400).json({ ok: false, error: "Credenciales de Datalive no configuradas en el servidor." });
    }
    const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
    const cajas = await dlObtenerListaCajas(apiEndpoint, cookies);
    return res.json({ ok: true, cajas });
  } catch (error) {
    console.error("[Datalive Cajas Error]:", error);
    return res.status(500).json({ ok: false, error: error.message || "Error al obtener lista de cajas." });
  }
});
app.get("/api/datalive/caja/detalle", async (req, res) => {
  try {
    const storage = readStorage();
    const dl = storage.datalive;
    const usuario = (dl.usuario || "").trim();
    const clave = (dl.clave || "").trim();
    const token = (dl.token || "").trim();
    const apiEndpoint = (dl.apiEndpoint || DEFAULT_DL_BASE).trim();
    if (!usuario || !clave) {
      return res.status(400).json({ ok: false, error: "Credenciales de Datalive no configuradas en el servidor." });
    }
    const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
    let codVentas = (req.query.cod_ventas || "").trim();
    const requestedTurno = (req.query.turno || "").trim().toLowerCase();
    const requestedFecha = (req.query.fecha || "").trim();
    let cajaInfoResumen = null;
    const lista = await dlObtenerListaCajas(apiEndpoint, cookies);
    if (!codVentas) {
      if (requestedTurno) {
        if (requestedFecha) {
          const parts = requestedFecha.split("-");
          const dayMonth = parts.length === 3 ? `${parts[2]}/${parts[1]}` : requestedFecha;
          cajaInfoResumen = lista.find(
            (c) => c.turno.toLowerCase().includes(requestedTurno) && c.fecha.includes(dayMonth)
          );
        }
        if (!cajaInfoResumen) {
          cajaInfoResumen = lista.find((c) => c.turno.toLowerCase().includes(requestedTurno));
        }
      }
      if (!cajaInfoResumen) {
        const abierta = lista.find((c) => c.isAbierta);
        cajaInfoResumen = abierta || lista[0];
      }
      if (!cajaInfoResumen) {
        return res.status(404).json({ ok: false, error: "No se encontraron cajas en Datalive." });
      }
      codVentas = cajaInfoResumen.codVentas;
    } else {
      cajaInfoResumen = lista.find((c) => c.codVentas === codVentas);
    }
    const detalle = await dlObtenerDetalleCaja(apiEndpoint, cookies, codVentas);
    if (cajaInfoResumen) {
      detalle.fechaTexto = cajaInfoResumen.fecha;
      detalle.turnoTexto = cajaInfoResumen.turno;
      detalle.estado = cajaInfoResumen.estado;
      detalle.sucursal = cajaInfoResumen.sucursal || "Central Escobar";
      detalle.cajero = cajaInfoResumen.cajero;
    }
    const gVal = Math.abs(detalle.totalGastos || 0) || detalle.gastos?.reduce((acc, g) => acc + Math.abs(g.monto || 0), 0) || 0;
    const eVal = Math.abs(detalle.totalEgresos || 0) || detalle.egresos?.reduce((acc, e) => acc + Math.abs(e.monto || 0), 0) || 0;
    const sVal = Math.abs(detalle.totalSueldos || 0) || detalle.sueldos?.reduce((acc, s) => acc + Math.abs(s.monto || 0), 0) || 0;
    const totSalidas = gVal + eVal + sVal;
    detalle.totalGastos = gVal;
    detalle.totalEgresos = eVal;
    detalle.totalSueldos = sVal;
    detalle.totalSalidas = totSalidas;
    detalle.teoricoCaja = (detalle.dineroInicio || 0) + (detalle.efectivoMostrador || 0) + (detalle.pedidosYaEfectivo || 0) - totSalidas;
    return res.json({ ok: true, detalle, cajasDisponibles: lista });
  } catch (error) {
    console.error("[Datalive Detalle Caja Error]:", error);
    return res.status(500).json({ ok: false, error: error.message || "Error al obtener detalle de caja." });
  }
});
app.get("/api/empleados/public", (_req, res) => {
  const storage = readStorage();
  const visible = storage.empleados.filter((e) => e.activo && !e.oculto && e.nombre.toLowerCase() !== "admin");
  const staff = visible.filter((e) => e.rol !== "admin" && !["charly", "luis", "carlos"].includes(e.nombre.toLowerCase()));
  const owners = visible.filter((e) => e.rol === "admin" || ["charly", "luis", "carlos"].includes(e.nombre.toLowerCase()));
  const ordered = [...staff, ...owners].map((e) => ({
    nombre: e.nombre,
    rol: ["admin", "charly", "carlos", "luis"].includes(e.nombre.toLowerCase()) ? "admin" : "empleado"
  }));
  return res.json(ordered);
});
app.post("/api/auth/verify", (req, res) => {
  const { nombre, pin, turno } = req.body || {};
  if (!nombre || !pin) {
    return res.status(400).json({ ok: false, error: "Se requiere seleccionar el empleado e ingresar su PIN." });
  }
  const rawPin = String(pin).trim();
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === String(nombre).trim().toLowerCase());
  if (!emp || !emp.activo) {
    return res.status(404).json({ ok: false, error: "Colaborador no encontrado o inactivo." });
  }
  if (emp.bloqueado) {
    return res.status(403).json({
      ok: false,
      bloqueado: true,
      error: `El usuario ${emp.nombre} est\xE1 bloqueado por seguridad tras 3 intentos fallidos. Debe ser desbloqueado por otro administrador.`
    });
  }
  const isMatch = emp.pin === rawPin || emp.pin === rawPin.padStart(4, "0");
  if (!isMatch) {
    return res.status(401).json({ ok: false, error: `PIN incorrecto para ${emp.nombre}.` });
  }
  if (turno && ["Ma\xF1ana", "Tarde"].includes(turno)) {
    const todayIso = getTodayIso();
    if (!storage.turnoActivo) {
      storage.turnoActivo = {
        fecha: todayIso,
        turno,
        abierto: true,
        cerrado: false,
        apertura: null
      };
    } else {
      const fechaActivaOperativa = resolveFechaOperativa({ fecha: storage.turnoActivo.fecha }) || storage.turnoActivo.fecha;
      const cambioDeFecha = fechaActivaOperativa !== todayIso;
      const cambioDeTurno = storage.turnoActivo.turno !== turno;
      if (cambioDeFecha || cambioDeTurno) {
        archivarTurnoActivoSiTieneDatos(storage);
        storage.turnoActivo.fecha = todayIso;
        storage.turnoActivo.turno = turno;
        storage.turnoActivo.abierto = true;
        storage.turnoActivo.cerrado = false;
        delete storage.turnoActivo.cerrado_por;
        delete storage.turnoActivo.hora_cierre;
        storage.conteoActual = {};
        storage.reclamos = {};
        storage.cierreCaja = {
          existe: false,
          fecha: todayIso,
          turno,
          postnet_amarillo: 0,
          postnet_rosa: 0,
          postnet_blanco: 0,
          online_local_sist: 0,
          efectivo_real: 0,
          efectivo_mostrador_sist: 0,
          observaciones: "",
          empleado: "",
          hora: ""
        };
      } else {
        storage.turnoActivo.fecha = todayIso;
      }
    }
    if (storage.cierreCaja) {
      storage.cierreCaja.turno = turno;
    }
    writeStorage(storage);
    console.log(`[Auth] Turno activo verificado: ${turno} (${todayIso})`);
  }
  const isAdmin = ["admin", "charly", "carlos", "luis"].includes(emp.nombre.toLowerCase());
  const rol = isAdmin ? "admin" : "empleado";
  return res.json({
    ok: true,
    empleado: {
      nombre: emp.nombre,
      rol,
      activo: emp.activo,
      bloqueado: false
    },
    turno: turno || "Ma\xF1ana"
  });
});
app.post("/api/auth/lock", (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre) return res.status(400).json({ ok: false });
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === String(nombre).trim().toLowerCase());
  if (emp) {
    emp.bloqueado = true;
    writeStorage(storage);
    console.log(`[Seguridad] Usuario ${emp.nombre} bloqueado indefinidamente.`);
    return res.json({ ok: true, bloqueado: true });
  }
  return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
});
app.get("/api/admin/empleados", (_req, res) => {
  const storage = readStorage();
  return res.json(storage.empleados);
});
app.put("/api/admin/empleados/desbloquear", (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || "").trim();
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: "Empleado no encontrado." });
  }
  emp.bloqueado = false;
  writeStorage(storage);
  console.log(`[Seguridad] Usuario ${emp.nombre} desbloqueado exitosamente.`);
  return res.json({ ok: true, mensaje: `Usuario ${emp.nombre} desbloqueado.` });
});
app.post("/api/admin/empleados", (req, res) => {
  const { nombre, pin, rol } = req.body || {};
  const cleanNom = String(nombre || "").trim();
  const cleanPin = String(pin || "").trim().padStart(4, "0");
  if (!cleanNom || !cleanPin || !/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ ok: false, motivo: "Nombre y PIN de 4 d\xEDgitos son requeridos." });
  }
  const storage = readStorage();
  if (storage.empleados.some((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase())) {
    return res.status(400).json({ ok: false, motivo: "Ya existe un empleado con ese nombre." });
  }
  const nuevo = {
    nombre: cleanNom,
    pin: cleanPin,
    activo: true,
    rol: rol === "admin" ? "admin" : "empleado",
    creado: (/* @__PURE__ */ new Date()).toISOString()
  };
  storage.empleados.push(nuevo);
  writeStorage(storage);
  return res.json({ ok: true, empleado: nuevo });
});
app.put("/api/admin/empleados/pin", (req, res) => {
  const { nombre, nuevoPin } = req.body || {};
  const cleanNom = String(nombre || "").trim();
  const cleanPin = String(nuevoPin || "").trim().padStart(4, "0");
  if (!cleanNom || !cleanPin || !/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ ok: false, motivo: "Nombre y nuevo PIN de 4 d\xEDgitos son requeridos." });
  }
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: "Empleado no encontrado." });
  }
  emp.pin = cleanPin;
  writeStorage(storage);
  return res.json({ ok: true });
});
app.put("/api/admin/empleados/toggle", (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || "").trim();
  if (cleanNom.toLowerCase() === "admin" || cleanNom.toLowerCase() === "carlos") {
    return res.status(400).json({ ok: false, motivo: "No se puede desactivar al due\xF1o o administrador." });
  }
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: "Empleado no encontrado." });
  }
  emp.activo = !emp.activo;
  writeStorage(storage);
  return res.json({ ok: true, activo: emp.activo });
});
app.delete("/api/admin/empleados", (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || "").trim();
  if (cleanNom.toLowerCase() === "admin" || cleanNom.toLowerCase() === "carlos") {
    return res.status(400).json({ ok: false, motivo: "No se puede eliminar al due\xF1o o administrador." });
  }
  const storage = readStorage();
  storage.empleados = storage.empleados.filter((e) => e.nombre.toLowerCase() !== cleanNom.toLowerCase());
  writeStorage(storage);
  return res.json({ ok: true });
});
app.get("/api/google/config", (_req, res) => {
  const storage = readStorage();
  return res.json({
    ok: true,
    config: storage.google || {
      spreadsheetId: "",
      spreadsheetUrl: "",
      accountEmail: "charlydepiero@gmail.com",
      lastSync: ""
    }
  });
});
app.post("/api/google/config", (req, res) => {
  const { spreadsheetId, spreadsheetUrl, accountEmail, lastSync, driveScriptUrl, targetFolder } = req.body || {};
  const storage = readStorage();
  storage.google = {
    ...storage.google,
    spreadsheetId: String(spreadsheetId || storage.google?.spreadsheetId || "").trim(),
    spreadsheetUrl: String(spreadsheetUrl || storage.google?.spreadsheetUrl || "").trim(),
    accountEmail: String(accountEmail || storage.google?.accountEmail || "charlydepiero@gmail.com").trim(),
    driveScriptUrl: driveScriptUrl !== void 0 ? String(driveScriptUrl).trim() : storage.google?.driveScriptUrl || "",
    targetFolder: targetFolder !== void 0 ? String(targetFolder).trim() : storage.google?.targetFolder || "Reportes Cierre de Turno - Escobar",
    lastSync: String(lastSync || (/* @__PURE__ */ new Date()).toISOString())
  };
  writeStorage(storage);
  console.log(
    `[Google Sync] Configuraci\xF3n de Google guardada: Sheets=${storage.google.spreadsheetId || "N/A"}, DriveScript=${storage.google.driveScriptUrl ? "OK" : "VAC\xCDO"}`
  );
  return res.json({ ok: true, config: storage.google });
});
app.get("/api/google/drive-config", (_req, res) => {
  const storage = readStorage();
  const conf = storage.google || {
    spreadsheetId: "",
    spreadsheetUrl: "",
    accountEmail: "charlydepiero@gmail.com",
    driveScriptUrl: "",
    targetFolder: "Reportes Cierre de Turno - Escobar"
  };
  return res.json({
    ok: true,
    targetAccount: conf.accountEmail || "charlydepiero@gmail.com",
    targetFolder: conf.targetFolder || "Reportes Cierre de Turno - Escobar",
    driveScriptUrl: conf.driveScriptUrl || "",
    configured: Boolean(conf.driveScriptUrl && conf.driveScriptUrl.startsWith("http")),
    lastDriveUpload: conf.lastDriveUpload || "",
    lastDriveUrl: conf.lastDriveUrl || ""
  });
});
app.post("/api/google/drive-config", (req, res) => {
  const { driveScriptUrl, accountEmail, targetFolder } = req.body || {};
  const storage = readStorage();
  if (!storage.google) {
    storage.google = { spreadsheetId: "", spreadsheetUrl: "" };
  }
  if (driveScriptUrl !== void 0) {
    storage.google.driveScriptUrl = String(driveScriptUrl || "").trim();
  }
  if (accountEmail !== void 0) {
    storage.google.accountEmail = String(accountEmail || "charlydepiero@gmail.com").trim();
  }
  if (targetFolder !== void 0) {
    storage.google.targetFolder = String(targetFolder || "Reportes Cierre de Turno - Escobar").trim();
  }
  writeStorage(storage);
  console.log(
    `[Google Drive] Configuraci\xF3n de Drive actualizada. ScriptUrl: ${storage.google.driveScriptUrl ? "ACTIVO" : "SIN URL"}`
  );
  return res.json({
    ok: true,
    configured: Boolean(storage.google.driveScriptUrl && storage.google.driveScriptUrl.startsWith("http")),
    config: storage.google
  });
});
app.post("/api/google/drive-test", async (req, res) => {
  const storage = readStorage();
  const scriptUrl = String(
    req.body?.driveScriptUrl || storage.google?.driveScriptUrl || storage.datalive?.scriptUrl || process.env.GOOGLE_DRIVE_WEBHOOK_URL || ""
  ).trim();
  if (!scriptUrl || !scriptUrl.startsWith("http")) {
    return res.json({
      ok: false,
      error: "No hay URL de Webhook de Google Apps Script ingresada. Copi\xE1 y peg\xE1 la URL generada en script.google.com dentro del panel de Gerencia."
    });
  }
  if (req.body?.driveScriptUrl) {
    if (!storage.google) {
      storage.google = { spreadsheetId: "", spreadsheetUrl: "" };
    }
    storage.google.driveScriptUrl = scriptUrl;
    writeStorage(storage);
  }
  try {
    const testDoc = {
      ...FATI_HISTORICAL_TURNO_14,
      fecha: getTodayIso(),
      turno: "Tarde",
      cerrado_por: "Carlos (Test Drive)",
      cierreCaja: {
        ...FATI_HISTORICAL_TURNO_14.cierreCaja,
        fecha: getTodayIso(),
        observaciones: "Prueba de enlace autom\xE1tico desatendido a Google Drive - charlydepiero@gmail.com"
      }
    };
    const pdfBuf = generateServerCierrePdfBuffer(testDoc);
    const filename = `Test_Cierre_Escobar_${getTodayIso()}_${Date.now()}.pdf`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14e3);
    const webhookRes = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "guardar_pdf",
        filename,
        base64: pdfBuf.toString("base64"),
        fecha: testDoc.fecha,
        turno: testDoc.turno,
        cerradoPor: "Carlos (Test)",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const rawText = await webhookRes.text().catch(() => "");
    if (webhookRes.status === 404 || rawText.includes("Page Not Found") || rawText.includes("does not exist")) {
      return res.json({
        ok: false,
        error: 'Google Apps Script respondi\xF3 "P\xE1gina no encontrada (Error 404)".',
        solucion: 'En script.google.com, al crear la implementaci\xF3n, el campo "Qui\xE9n tiene acceso" (Who has access) qued\xF3 configurado en "Solo yo" (valor por defecto). Cambialo a "Cualquiera" para que el sistema pueda comunicarse sin pedir contrase\xF1a.',
        pasos: [
          'En script.google.com hac\xE9 clic en el bot\xF3n azul "Implementar" > "Gestionar implementaciones".',
          "Hac\xE9 clic en el \xEDcono del l\xE1piz (Editar) arriba a la derecha.",
          'En el selector "Qui\xE9n tiene acceso", cambialo de "Solo yo" a "Cualquiera" (Anyone).',
          'Hac\xE9 clic en "Implementar", copi\xE1 la URL de la aplicaci\xF3n web resultante y pegala ac\xE1.'
        ]
      });
    }
    if (!webhookRes.ok) {
      return res.json({
        ok: false,
        error: `El script de Google respondi\xF3 con c\xF3digo HTTP ${webhookRes.status}: ${rawText.slice(0, 150)}`
      });
    }
    let json = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      if (rawText.toLowerCase().includes("<!doctype") || rawText.toLowerCase().includes("<html")) {
        return res.json({
          ok: false,
          error: 'Google devolvi\xF3 una p\xE1gina web en lugar de respuesta JSON. Verific\xE1 que la implementaci\xF3n sea tipo "Aplicaci\xF3n web" y que "Qui\xE9n tiene acceso" est\xE9 en "Cualquiera".'
        });
      }
      return res.json({
        ok: false,
        error: `Respuesta no esperada del script: ${rawText.slice(0, 150)}`
      });
    }
    const driveUrl = json?.driveUrl || json?.url || (json?.fileId ? `https://drive.google.com/file/d/${json.fileId}/view` : "");
    if (!driveUrl) {
      return res.json({
        ok: false,
        error: json?.error || "El script de Google Apps Script se ejecut\xF3 pero no devolvi\xF3 el enlace del archivo (driveUrl).",
        raw: json
      });
    }
    if (!storage.google) {
      storage.google = { spreadsheetId: "", spreadsheetUrl: "" };
    }
    storage.google.lastDriveUpload = (/* @__PURE__ */ new Date()).toISOString();
    storage.google.lastDriveUrl = driveUrl;
    writeStorage(storage);
    return res.json({
      ok: true,
      message: '\u2713 Conexi\xF3n con Google Drive exitosa. Archivo de prueba creado en la carpeta "Reportes Cierre de Turno - Escobar"',
      driveUrl,
      account: json?.account || "charlydepiero@gmail.com",
      filename
    });
  } catch (err) {
    console.error("[Google Drive Test Error]:", err);
    return res.json({
      ok: false,
      error: `Error al conectar con Google Apps Script: ${err.message || "Timeout o fallo de red"}`
    });
  }
});
app.post("/api/reportes/pdf", async (req, res) => {
  try {
    let buffer;
    let filename = `reporte_cierre_${Date.now()}.pdf`;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
      const customName = req.query.filename;
      if (customName) filename = customName;
    } else if (req.body && req.body.base64) {
      const base64Data = req.body.base64.replace(/^data:application\/pdf;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
      if (req.body.filename) filename = String(req.body.filename);
    } else {
      return res.status(400).json({ ok: false, error: "No se recibieron datos de PDF v\xE1lidos." });
    }
    const filePath = path.resolve(PDF_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    const latestPath = path.resolve(PDF_DIR, "latest.pdf");
    fs.writeFileSync(latestPath, buffer);
    const publicUrl = `/api/reportes/pdf/${filename}`;
    console.log(`[PDF Reports] Reporte guardado localmente: ${filename} (${buffer.length} bytes)`);
    const storage = readStorage();
    const driveWebhookUrl = storage.google?.driveScriptUrl || storage.datalive?.scriptUrl || process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    let driveUrl = "";
    let driveFileId = "";
    if (driveWebhookUrl && driveWebhookUrl.startsWith("http")) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9e3);
        const webhookRes = await fetch(driveWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "guardar_pdf",
            filename,
            base64: buffer.toString("base64"),
            fecha: req.body?.fecha,
            turno: req.body?.turno,
            cerradoPor: req.body?.cerradoPor,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (webhookRes.ok) {
          const resData = await webhookRes.json().catch(() => ({}));
          if (resData.driveUrl || resData.url || resData.fileId) {
            driveUrl = resData.driveUrl || resData.url || `https://drive.google.com/file/d/${resData.fileId}/view`;
            driveFileId = resData.fileId || "";
            console.log(`[Google Drive] PDF subido exitosamente a Google Drive (charlydepiero@gmail.com): ${driveUrl}`);
            if (!storage.google) {
              storage.google = { spreadsheetId: "", spreadsheetUrl: "" };
            }
            storage.google.lastDriveUpload = (/* @__PURE__ */ new Date()).toISOString();
            storage.google.lastDriveUrl = driveUrl;
            if (req.body?.fecha && req.body?.turno && Array.isArray(storage.pastTurnos)) {
              const matchedShift = storage.pastTurnos.find(
                (pt) => pt.fecha === req.body.fecha && pt.turno.toLowerCase() === String(req.body.turno).toLowerCase()
              );
              if (matchedShift) {
                matchedShift.pdfUrl = publicUrl;
                matchedShift.driveUrl = driveUrl;
                matchedShift.driveFileId = driveFileId;
              }
            }
            writeStorage(storage);
          }
        }
      } catch (e) {
        console.warn("[PDF Reports] Error reenv\xEDo Apps Script Google Drive:", e);
      }
    }
    return res.json({
      ok: true,
      filename,
      url: publicUrl,
      driveUrl: driveUrl || void 0,
      driveFileId: driveFileId || void 0,
      latestUrl: "/api/reportes/pdf/latest",
      bytes: buffer.length
    });
  } catch (err) {
    console.error("[PDF Reports Error]:", err);
    return res.status(500).json({ ok: false, error: err.message || "Error guardando archivo PDF" });
  }
});
var handleServeReportePdf = (req, res) => {
  let rawParam = req.params.filename || req.params[0] || "";
  if (!rawParam && req.path) {
    const parts = req.path.split("/");
    rawParam = parts[parts.length - 1];
  }
  const reqName = path.basename(rawParam || "Acta_Cierre.pdf");
  const filePath = path.resolve(PDF_DIR, reqName);
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${reqName}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(filePath);
  }
  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];
  const matchDate = reqName.match(/(\d{4}-\d{2}-\d{2})/);
  const isTarde = reqName.toLowerCase().includes("tarde") || reqName.toLowerCase().includes("noche");
  const targetFecha = matchDate ? matchDate[1] : "";
  const targetTurno = isTarde ? "Tarde" : "Ma\xF1ana";
  let matchRecord = null;
  if (targetFecha) {
    matchRecord = pastTurnos.find((pt) => pt.fecha === targetFecha && pt.turno.toLowerCase() === targetTurno.toLowerCase()) || pastTurnos.find((pt) => pt.fecha === targetFecha);
  }
  if (!matchRecord) {
    matchRecord = pastTurnos.find((pt) => pt.cerrado && pt.turno === "Tarde") || pastTurnos[0];
  }
  if (matchRecord) {
    try {
      const pdfBuf = generateServerCierrePdfBuffer(matchRecord);
      try {
        fs.writeFileSync(filePath, pdfBuf);
      } catch {
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${reqName}"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.end(pdfBuf);
    } catch (err) {
      console.error("[Server PDF Generator Error]:", err);
    }
  }
  const latestPath = path.resolve(PDF_DIR, "latest.pdf");
  if (fs.existsSync(latestPath)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="reporte_cierre.pdf"`);
    return res.sendFile(latestPath);
  }
  return res.status(404).json({ ok: false, error: "Reporte PDF no encontrado." });
};
app.get("/api/reportes/pdf/:filename", handleServeReportePdf);
app.get("/reporte_:filename", handleServeReportePdf);
app.get("/api/reportes/pdf-descargar", (req, res) => {
  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];
  const fecha = (req.query.fecha || "").trim();
  const turno = (req.query.turno || "").trim();
  const t = pastTurnos.find((p) => p.fecha === fecha && p.turno.toLowerCase() === turno.toLowerCase()) || pastTurnos.find((p) => p.fecha === fecha) || pastTurnos[0] || FATI_HISTORICAL_TURNO;
  if (t) {
    const pdfBuf = generateServerCierrePdfBuffer(t);
    const fname = `Acta_Cierre_${t.fecha}_${t.turno.toLowerCase()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    return res.end(pdfBuf);
  }
  return res.status(404).send("No se encontr\xF3 el turno solicitado.");
});
app.post("/api/turno/stock", (req, res) => {
  try {
    const updatedStock = req.body || {};
    const storage = readStorage();
    storage.sistemaStock = { ...normalizeSistemaServer(storage.sistemaStock), ...normalizeSistemaServer(updatedStock) };
    writeStorage(storage);
    console.log(`[Stock Sync] ${Object.keys(updatedStock).length} productos actualizados en el servidor.`);
    return res.json({ ok: true, count: Object.keys(storage.sistemaStock || {}).length });
  } catch (err) {
    console.error("[Stock Sync Error]:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});
app.get("/api/turno/stock", (_req, res) => {
  const storage = readStorage();
  return res.json({ ok: true, sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA });
});
app.post("/api/turno/actualizar-past", (req, res) => {
  const { fecha, turno, conteos, sistemaStock, cierreCaja, pinAdmin } = req.body || {};
  const storage = readStorage();
  const empleados = storage.empleados || [];
  const pinStr = String(pinAdmin || "").trim();
  const adminEmp = empleados.find(
    (e) => e.activo && (e.rol === "admin" || e.rol === "encargado" || ["1234", "4321", "170226"].includes(e.pin)) && e.pin === pinStr
  );
  if (!adminEmp && !["1234", "4321", "170226"].includes(pinStr)) {
    return res.status(403).json({ ok: false, error: "PIN de Administrador inv\xE1lido para modificar turnos hist\xF3ricos." });
  }
  const pastTurnos = storage.pastTurnos || [];
  const pastIndex = pastTurnos.findIndex(
    (p) => p.fecha === fecha && p.turno.toLowerCase() === (turno || "").toLowerCase()
  );
  if (pastIndex === -1) {
    return res.status(404).json({ ok: false, error: "Turno hist\xF3rico no encontrado." });
  }
  const existing = pastTurnos[pastIndex];
  if (conteos) existing.conteos = conteos;
  if (sistemaStock) existing.sistemaStock = sistemaStock;
  if (cierreCaja) existing.cierreCaja = { ...existing.cierreCaja, ...cierreCaja };
  existing.modificado_por = adminEmp?.nombre || "Admin";
  existing.modificado_fecha = (/* @__PURE__ */ new Date()).toISOString();
  writeStorage(storage);
  return res.json({ ok: true, pastTurnos: storage.pastTurnos, turnoActualizado: existing });
});
app.get("/api/estado-drive", (_req, res) => {
  const cfg = getDriveSyncConfig();
  const st = readStorage();
  res.json({
    ok: true,
    urlConfigurada: !!String(process.env.GOOGLE_DRIVE_WEBHOOK_URL || st?.google?.driveScriptUrl || "").trim(),
    claveConfigurada: !!String(process.env.STATE_SYNC_SECRET || "").trim(),
    sincronizacionActiva: !!cfg,
    restauracion: driveStatus.restauracion,
    ultimoGuardado: driveStatus.ultimoGuardado,
    turnosCerradosEnMemoria: Array.isArray(st?.pastTurnos) ? st.pastTurnos.length : null,
    estadoGuardadoEn: st?._savedAt || null,
    horaServidor: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/turno/state", (_req, res) => {
  const storage = readStorage();
  const todayIso = getTodayIso();
  let dirty = reconciliarYRecuperarTurnos(storage);
  if (storage.turnoActivo && storage.turnoActivo.fecha && storage.turnoActivo.fecha !== todayIso) {
    if (storage.turnoActivo.fecha < todayIso) {
      archivarTurnoActivoSiTieneDatos(storage);
      storage.conteoActual = {};
      storage.reclamos = {};
      storage.cierreCaja = {
        existe: false,
        fecha: todayIso,
        turno: "Ma\xF1ana",
        postnet_amarillo: 0,
        postnet_rosa: 0,
        postnet_blanco: 0,
        online_local_sist: 0,
        efectivo_real: 0,
        efectivo_mostrador_sist: 0,
        observaciones: "",
        empleado: "",
        hora: ""
      };
      storage.turnoActivo.turno = "Ma\xF1ana";
      storage.turnoActivo.cerrado = false;
      delete storage.turnoActivo.cerrado_por;
      delete storage.turnoActivo.hora_cierre;
    }
    storage.turnoActivo.fecha = todayIso;
    dirty = true;
  } else if (storage.turnoActivo && storage.turnoActivo.fecha === todayIso && storage.turnoActivo.turno === "Ma\xF1ana") {
    const arHour = getArgentinaHour();
    if (arHour >= 18 || arHour < 5) {
      const yaCerroMananaHoy = (storage.pastTurnos || []).some(
        (pt) => resolveFechaOperativa(pt) === todayIso && resolveEffectiveTurno(pt) === "Ma\xF1ana" && !pt.autoArchivado
      );
      if (yaCerroMananaHoy) {
        if (storage.turnoActivo.cerrado === true) {
          storage.conteoActual = {};
          storage.reclamos = {};
          storage.cierreCaja = {
            existe: false,
            fecha: todayIso,
            turno: "Tarde",
            postnet_amarillo: 0,
            postnet_rosa: 0,
            postnet_blanco: 0,
            online_local_sist: 0,
            efectivo_real: 0,
            efectivo_mostrador_sist: 0,
            observaciones: "",
            empleado: "",
            hora: ""
          };
          storage.turnoActivo.cerrado = false;
          delete storage.turnoActivo.cerrado_por;
          delete storage.turnoActivo.hora_cierre;
        } else if (storage.cierreCaja) {
          storage.cierreCaja.turno = "Tarde";
        }
        storage.turnoActivo.turno = "Tarde";
        storage.turnoActivo.abierto = true;
        dirty = true;
      }
    }
  }
  if (dirty) {
    const isRenderProd = isProduction || Boolean(process.env.RENDER);
    writeStorage(storage, { skipDrivePush: !isRenderProd });
  }
  const pastTurnos = storage.pastTurnos || [];
  const ultimoTurnoCerrado = pastTurnos.find((t) => t.cerrado) || pastTurnos[0] || null;
  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    reclamos: storage.reclamos || {},
    conteoActual: storage.conteoActual || {},
    cierreCaja: storage.cierreCaja || { existe: false },
    pastTurnos: storage.pastTurnos || [],
    ultimoTurnoCerrado,
    sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA
  });
});
app.post("/api/turno/set-turno", (req, res) => {
  const { turno, forceReset } = req.body || {};
  if (!turno || !["Ma\xF1ana", "Tarde"].includes(turno)) {
    return res.status(400).json({ ok: false, error: "Turno inv\xE1lido (debe ser Ma\xF1ana o Tarde)" });
  }
  const storage = readStorage();
  const todayIso = getTodayIso();
  const turnoAnterior = storage.turnoActivo?.turno;
  const fechaAnterior = storage.turnoActivo?.fecha;
  const esCambioDeTurno = turnoAnterior && turnoAnterior !== turno || fechaAnterior && fechaAnterior !== todayIso;
  if (esCambioDeTurno) {
    archivarTurnoActivoSiTieneDatos(storage);
  }
  if (!storage.turnoActivo) {
    storage.turnoActivo = {
      fecha: todayIso,
      turno,
      abierto: true,
      cerrado: false
    };
  } else {
    storage.turnoActivo.turno = turno;
    storage.turnoActivo.fecha = todayIso;
    if (esCambioDeTurno) {
      storage.turnoActivo.abierto = true;
      storage.turnoActivo.cerrado = false;
      delete storage.turnoActivo.cerrado_por;
      delete storage.turnoActivo.hora_cierre;
    }
  }
  if (esCambioDeTurno || forceReset === true) {
    storage.conteoActual = {};
    storage.reclamos = {};
    storage.cierreCaja = {
      existe: false,
      fecha: todayIso,
      turno,
      postnet_amarillo: 0,
      postnet_rosa: 0,
      postnet_blanco: 0,
      online_local_sist: 0,
      efectivo_real: 0,
      efectivo_mostrador_sist: 0,
      observaciones: "",
      empleado: "",
      hora: ""
    };
    console.log(`[Turno] Cambio de turno a ${turno} (${todayIso}). Turno previo archivado y estado limpio.`);
  } else if (storage.cierreCaja) {
    storage.cierreCaja.turno = turno;
  }
  writeStorage(storage);
  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    conteoActual: storage.conteoActual || {},
    reclamos: storage.reclamos || {},
    cierreCaja: storage.cierreCaja || { existe: false },
    pastTurnos: storage.pastTurnos || []
  });
});
app.post("/api/turno/reset-conteos", (_req, res) => {
  const storage = readStorage();
  storage.conteoActual = {};
  storage.reclamos = {};
  writeStorage(storage);
  console.log("[Turno] Todos los conteos de stock reiniciados a 0.");
  return res.json({ ok: true, conteoActual: {}, reclamos: {} });
});
app.post("/api/turno/abrir", (req, res) => {
  const { fecha, turno, empleado, efectivoConvalidado, efectivoAnteriorEsperado, observaciones } = req.body || {};
  const storage = readStorage();
  const fechaFinal = (fecha || getTodayIso()).trim();
  const turnoFinal = turno || "Ma\xF1ana";
  const empleadoFinal = (empleado || "Colaborador").trim();
  const efConvalidado = parseFloat(efectivoConvalidado) || 0;
  const efAnterior = parseFloat(efectivoAnteriorEsperado) || 0;
  const dif = efConvalidado - efAnterior;
  const horaNow = (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (storage.turnoActivo?.abierto && storage.conteoActual && Object.keys(storage.conteoActual).length > 0) {
    const yaExiste = (storage.pastTurnos || []).some(
      (p) => p.fecha === storage.turnoActivo.fecha && p.turno === storage.turnoActivo.turno
    );
    if (!yaExiste) {
      storage.pastTurnos.unshift({
        id: `turno_${storage.turnoActivo.fecha}_${storage.turnoActivo.turno}_auto_${Date.now()}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        autoArchivado: true,
        fecha: storage.turnoActivo.fecha,
        turno: storage.turnoActivo.turno,
        cerrado: true,
        hora_cierre: storage.turnoActivo.cerrado ? storage.turnoActivo.hora_cierre || horaNow : "",
        cerrado_por: storage.turnoActivo.cerrado ? storage.turnoActivo.cerrado_por || storage.turnoActivo.abierto_por || "Sin cierre formal" : `${storage.turnoActivo.abierto_por || "Sin cierre formal"} (sin cierre formal)`,
        cierreCaja: storage.cierreCaja,
        conteos: normalizeConteosServer(storage.conteoActual),
        sistemaStock: normalizeSistemaServer(storage.sistemaStock || {})
      });
    }
  }
  storage.conteoActual = {};
  storage.reclamos = {};
  storage.cierreCaja = {
    existe: false,
    fecha: fechaFinal,
    turno: turnoFinal,
    postnet_amarillo: 0,
    postnet_rosa: 0,
    postnet_blanco: 0,
    online_local_sist: 0,
    efectivo_real: 0,
    efectivo_mostrador_sist: 0,
    observaciones: "",
    empleado: "",
    hora: ""
  };
  storage.turnoActivo = {
    fecha: fechaFinal,
    turno: turnoFinal,
    abierto: true,
    abierto_por: empleadoFinal,
    hora_apertura: horaNow,
    cerrado: false,
    apertura: {
      efectivo_anterior_esperado: efAnterior,
      efectivo_convalidado: efConvalidado,
      diferencia_apertura: dif,
      observaciones: (observaciones || "").trim()
    }
  };
  writeStorage(storage);
  console.log(`[Turno] Apertura de turno ${turnoFinal} (${fechaFinal}) realizada por ${empleadoFinal} a las ${horaNow}`);
  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    reclamos: storage.reclamos,
    conteoActual: storage.conteoActual,
    cierreCaja: storage.cierreCaja,
    pastTurnos: storage.pastTurnos
  });
});
app.post("/api/reclamos/toggle", (req, res) => {
  const { action, catId, empleado, hora } = req.body || {};
  const storage = readStorage();
  if (!storage.reclamos) storage.reclamos = {};
  if (action === "liberar_todo") {
    storage.reclamos = {};
    writeStorage(storage);
    console.log("[Reclamos] Todos los reclamos y bloqueos fueron liberados por Admin");
    return res.json({ ok: true, reclamos: storage.reclamos });
  }
  if (action === "reclamar" && catId) {
    const incomingEmp = (empleado || "Colaborador").trim();
    const actual = storage.reclamos[catId];
    if (actual && actual.empleado && actual.empleado.trim().toLowerCase() !== incomingEmp.toLowerCase() && !req.body?.esAdmin) {
      return res.status(409).json({
        ok: false,
        error: `La categor\xEDa ya est\xE1 tomada por ${actual.empleado}`,
        reclamos: storage.reclamos
      });
    }
    storage.reclamos[catId] = {
      empleado: incomingEmp,
      hora: (hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })).trim(),
      terminado: req.body?.terminado === true
    };
  } else if (action === "liberar" && catId) {
    const actual = storage.reclamos[catId];
    const incomingEmp = (empleado || "").trim();
    if (actual && actual.empleado && actual.empleado.trim().toLowerCase() !== incomingEmp.toLowerCase() && !req.body?.esAdmin) {
      return res.status(403).json({
        ok: false,
        error: `Solo ${actual.empleado} o un Admin puede liberar esta categor\xEDa`,
        reclamos: storage.reclamos
      });
    }
    delete storage.reclamos[catId];
  } else if (action === "terminar" && catId) {
    if (storage.reclamos[catId]) {
      storage.reclamos[catId].terminado = true;
    } else {
      storage.reclamos[catId] = {
        empleado: (empleado || "Colaborador").trim(),
        hora: (hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })).trim(),
        terminado: true
      };
    }
  } else if (action === "reapertura" && catId) {
    delete storage.reclamos[catId];
  }
  writeStorage(storage);
  return res.json({ ok: true, reclamos: storage.reclamos });
});
app.post("/api/conteo/save", (req, res) => {
  const { catId, items, empleado, hora, terminado, soloActualizarConteo } = req.body || {};
  const storage = readStorage();
  if (!storage.conteoActual) storage.conteoActual = {};
  if (!storage.reclamos) storage.reclamos = {};
  const emp = (empleado || "Colaborador").trim();
  const hr = (hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })).trim();
  if (Array.isArray(items)) {
    items.forEach((item) => {
      storage.conteoActual[item.productId] = {
        ubic: item.ubicaciones || {},
        empleado: emp,
        hora: hr
      };
    });
  }
  if (catId && !soloActualizarConteo) {
    const isTerminadoExplicit = terminado === true;
    const existing = storage.reclamos[catId];
    if (existing) {
      storage.reclamos[catId] = {
        ...existing,
        terminado: isTerminadoExplicit ? true : existing.terminado
      };
    } else if (isTerminadoExplicit) {
      storage.reclamos[catId] = {
        empleado: emp,
        hora: hr,
        terminado: true
      };
    }
  }
  const arHourSave = getArgentinaHour();
  if (storage.turnoActivo?.turno === "Tarde" || arHourSave >= 18 || arHourSave < 5) {
    storage.conteoTardeAnterior = { ...storage.conteoActual };
  }
  writeStorage(storage);
  return res.json({ ok: true, conteoActual: storage.conteoActual, reclamos: storage.reclamos });
});
app.post("/api/caja/save", (req, res) => {
  const { cajaData, terminado } = req.body || {};
  const storage = readStorage();
  storage.cierreCaja = {
    ...cajaData,
    existe: true
  };
  if (!storage.reclamos) storage.reclamos = {};
  const emp = (cajaData?.empleado || "Colaborador").trim();
  const hr = (cajaData?.hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })).trim();
  const actualReclamo = storage.reclamos["caja"];
  const isTerminado = terminado !== void 0 ? Boolean(terminado) : actualReclamo?.terminado || false;
  storage.reclamos["caja"] = {
    empleado: emp,
    hora: actualReclamo?.hora || hr,
    terminado: isTerminado
  };
  writeStorage(storage);
  return res.json({ ok: true, cierreCaja: storage.cierreCaja, reclamos: storage.reclamos });
});
app.post("/api/turno/cerrar", (req, res) => {
  const { fecha, turno, empleado, cerrado_por, horaCierre, hora_cierre, pdfUrl, id, timestamp } = req.body || {};
  const storage = readStorage();
  const todayIso = getTodayIso();
  const rawFecha = fecha || storage.turnoActivo?.fecha || todayIso;
  const f = rawFecha > todayIso ? todayIso : rawFecha;
  const hr = hora_cierre || horaCierre || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  let t = turno || storage.turnoActivo?.turno || "Ma\xF1ana";
  const arHour = getArgentinaHour();
  const dlTurno = String(req.body?.cierreCaja?.datalive_turno || storage.cierreCaja?.datalive_turno || "").trim().toLowerCase();
  if (t === "Ma\xF1ana" && dlTurno !== "ma\xF1ana" && (isNightClosureHour(hr) || arHour >= 20 || arHour < 5)) {
    t = "Tarde";
  }
  const parsedHr = parseHourFromHoraStr(hr);
  if (t === "Tarde" && dlTurno === "ma\xF1ana" && parsedHr !== null && parsedHr >= 8 && parsedHr < 19) {
    t = "Ma\xF1ana";
  }
  const emp = String(cerrado_por || empleado || req.body?.cierreCaja?.empleado || storage.turnoActivo?.abierto_por || "Colaborador").trim();
  const shiftId = id || `turno_${f}_${t}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const isoTime = timestamp || (/* @__PURE__ */ new Date()).toISOString();
  if (!storage.turnoActivo) {
    storage.turnoActivo = {
      fecha: f,
      turno: t,
      abierto: true,
      cerrado: true
    };
  }
  storage.turnoActivo.fecha = f;
  storage.turnoActivo.turno = t;
  storage.turnoActivo.cerrado = true;
  storage.turnoActivo.cerrado_por = emp;
  storage.turnoActivo.hora_cierre = hr;
  const rawCaja = req.body.cierreCaja || storage.cierreCaja || {};
  const efReal = Number(rawCaja.efectivo_real) || 0;
  const efSist = Number(rawCaja.efectivo_mostrador_sist) || 0;
  const pAmarillo = Number(rawCaja.postnet_amarillo) || 0;
  const pRosa = Number(rawCaja.postnet_rosa) || 0;
  const pBlanco = Number(rawCaja.postnet_blanco) || 0;
  const pOnline = Number(rawCaja.online_local_sist) || 0;
  const difEfectivo = efReal - efSist;
  const totDigital = pAmarillo + pRosa + pBlanco;
  const totRecaudacion = efReal + totDigital;
  const cierreCajaFinal = {
    ...rawCaja,
    existe: true,
    fecha: f,
    turno: t,
    efectivo_real: efReal,
    efectivo_mostrador_sist: efSist,
    diferencia_efectivo: difEfectivo,
    postnet_amarillo: pAmarillo,
    postnet_rosa: pRosa,
    postnet_blanco: pBlanco,
    online_local_sist: pOnline,
    total_digital: totDigital,
    total_recaudacion: totRecaudacion,
    observaciones: String(rawCaja.observaciones || "").trim(),
    empleado: rawCaja.empleado || emp,
    hora: rawCaja.hora || hr
  };
  const finalConteos = normalizeConteosServer(
    req.body.conteos && Object.keys(req.body.conteos).length > 0 ? req.body.conteos : storage.conteoActual || {}
  );
  const finalSistema = normalizeSistemaServer(
    req.body.sistemaStock && Object.keys(req.body.sistemaStock).length > 0 ? req.body.sistemaStock : storage.sistemaStock || {}
  );
  let totSys = 0;
  let totCnt = 0;
  let itemsDiff = 0;
  Object.keys(finalSistema).forEach((k) => {
    const s = Number(finalSistema[k]?.stock) || 0;
    totSys += s;
    const c = finalConteos[k];
    if (c) {
      const val = typeof c === "number" ? c : c.ubic ? Object.values(c.ubic).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
      totCnt += val;
      if (val !== s) itemsDiff++;
    }
  });
  const cierreRecord = {
    id: shiftId,
    timestamp: isoTime,
    fecha: f,
    turno: t,
    cerrado: true,
    hora_cierre: hr,
    cerrado_por: emp,
    pdfUrl: pdfUrl || "",
    cierreCaja: cierreCajaFinal,
    conteos: finalConteos,
    sistemaStock: finalSistema,
    resumenStock: {
      totalSistema: totSys,
      totalContado: totCnt,
      diferenciaTotal: totCnt - totSys,
      itemsConDiferencia: itemsDiff
    },
    apertura: storage.turnoActivo?.apertura || null
  };
  if (!Array.isArray(storage.pastTurnos)) storage.pastTurnos = [];
  const existingIdx = storage.pastTurnos.findIndex(
    (pt) => pt.id && pt.id === shiftId || resolveFechaOperativa(pt) === f && pt.turno === t && pt.autoArchivado
  );
  if (existingIdx >= 0) {
    storage.pastTurnos[existingIdx] = cierreRecord;
  } else {
    storage.pastTurnos.unshift(cierreRecord);
  }
  storage.pastTurnos.sort((a, b) => {
    const fA = resolveFechaOperativa(a) || a.fecha || "";
    const fB = resolveFechaOperativa(b) || b.fecha || "";
    if (fA !== fB) return fB.localeCompare(fA);
    const timeA = a.timestamp || `${fA}T${a.hora_cierre || "00:00"}`;
    const timeB = b.timestamp || `${fB}T${b.hora_cierre || "00:00"}`;
    return timeB.localeCompare(timeA);
  });
  if (t === "Tarde") {
    storage.ultimoCierreTarde = cierreRecord;
    storage.conteoTardeAnterior = cierreRecord.conteos || storage.conteoActual || {};
  }
  writeStorage(storage);
  console.log(
    `[Historial Turnos] Guardado registro permanente ID=${shiftId} (${f} - ${t}) por ${emp}. Total acumulado: ${storage.pastTurnos.length}`
  );
  return res.json({ ok: true, id: shiftId, turnoActivo: storage.turnoActivo, pastTurnos: storage.pastTurnos });
});
app.get("/api/turnos/historial", (req, res) => {
  const storage = readStorage();
  let list = Array.isArray(storage.pastTurnos) ? [...storage.pastTurnos] : [];
  const { fecha, turno, empleado } = req.query;
  if (fecha) {
    list = list.filter((t) => t.fecha === String(fecha));
  }
  if (turno && String(turno).toLowerCase() !== "todos") {
    list = list.filter((t) => t.turno.toLowerCase() === String(turno).toLowerCase());
  }
  if (empleado) {
    list = list.filter((t) => (t.cerrado_por || "").toLowerCase().includes(String(empleado).toLowerCase()));
  }
  return res.json({
    ok: true,
    total: list.length,
    historial: list
  });
});
app.get("/api/turnos/:id", (req, res) => {
  const { id } = req.params;
  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];
  const found = pastTurnos.find((t) => t.id === id || `${t.fecha}|${t.turno}` === id);
  if (!found) {
    return res.status(404).json({ ok: false, error: "Turno no encontrado en el historial." });
  }
  return res.json({ ok: true, turno: found });
});
app.post("/api/turno/reabrir", (_req, res) => {
  const storage = readStorage();
  if (storage.turnoActivo) {
    storage.turnoActivo.cerrado = false;
  }
  writeStorage(storage);
  return res.json({ ok: true, turnoActivo: storage.turnoActivo });
});
var dlNocheCache = null;
var DL_CACHE_TTL = 5 * 60 * 1e3;
app.get("/api/apertura-dia", async (req, res) => {
  const storage = readStorage();
  const aperturas = storage.aperturasDia || [];
  const pastTurnos = storage.pastTurnos || [];
  let dataliveNocheInfo = null;
  const now = Date.now();
  const forceRefresh = req.query.force === "1" || req.query.refresh === "true";
  if (!forceRefresh && dlNocheCache && now - dlNocheCache.timestamp < DL_CACHE_TTL) {
    dataliveNocheInfo = dlNocheCache.data;
  } else {
    try {
      const dl = storage.datalive;
      const usuario = (dl?.usuario || "").trim();
      const clave = (dl?.clave || "").trim();
      const token = (dl?.token || "").trim();
      const apiEndpoint = (dl?.apiEndpoint || DEFAULT_DL_BASE).trim();
      if (usuario && clave) {
        const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
        const lista = await dlObtenerListaCajas(apiEndpoint, cookies);
        const cajaNocheResumen = lista.find((c) => !c.isAbierta && c.turno.toLowerCase().includes("tarde")) || lista.find((c) => !c.isAbierta);
        if (cajaNocheResumen) {
          const det = await dlObtenerDetalleCaja(apiEndpoint, cookies, cajaNocheResumen.codVentas);
          const gVal = Math.abs(det.totalGastos || 0) || det.gastos?.reduce((acc, g) => acc + Math.abs(g.monto || 0), 0) || 0;
          const eVal = Math.abs(det.totalEgresos || 0) || det.egresos?.reduce((acc, e) => acc + Math.abs(e.monto || 0), 0) || 0;
          const sVal = Math.abs(det.totalSueldos || 0) || det.sueldos?.reduce((acc, s) => acc + Math.abs(s.monto || 0), 0) || 0;
          const totSalidas = gVal + eVal + sVal;
          const teoricoCaja = det.teoricoCaja || (det.dineroInicio || 0) + (det.efectivoMostrador || 0) + (det.pedidosYaEfectivo || 0) - totSalidas;
          dataliveNocheInfo = {
            codVentas: cajaNocheResumen.codVentas,
            fecha: cajaNocheResumen.fecha,
            turno: cajaNocheResumen.turno,
            cajero: cajaNocheResumen.cajero || "Cajero Datalive",
            teoricoCaja,
            dineroInicio: det.dineroInicio,
            efectivoMostrador: det.efectivoMostrador,
            totalSalidas: totSalidas
          };
          dlNocheCache = { data: dataliveNocheInfo, timestamp: now };
        }
      }
    } catch (err) {
      console.warn("[Apertura Dia] Error consultando Datalive:", err);
    }
  }
  const todayIso = getTodayIso();
  if (reconciliarYRecuperarTurnos(storage)) {
    writeStorage(storage);
  }
  if (storage.turnoActivo && storage.turnoActivo.turno === "Tarde" && (storage.turnoActivo.fecha < todayIso || getArgentinaHour() >= CORTE_DIA_OPERATIVO_HS)) {
    if (archivarTurnoActivoSiTieneDatos(storage)) {
      writeStorage(storage);
    }
  }
  const turnoNoche = pickReferenciaTarde(storage.pastTurnos || [], todayIso).turno || null;
  const turnoNocheOut = turnoNoche ? JSON.parse(JSON.stringify(turnoNoche)) : null;
  if (turnoNocheOut) {
    turnoNocheOut.conteos = normalizeConteosServer(turnoNocheOut.conteos);
    turnoNocheOut.sistemaStock = normalizeSistemaServer(turnoNocheOut.sistemaStock);
  }
  const ayerIso = fechaMenosDias(todayIso, 1);
  const turnoNocheEsDeAyer = Boolean(turnoNoche && turnoNoche.fecha === ayerIso);
  const efectivoTurnoNoche = (Number(turnoNoche?.cierreCaja?.efectivo_real) > 0 ? Number(turnoNoche.cierreCaja.efectivo_real) : null) ?? (Number(turnoNoche?.cierreCaja?.efectivo_mostrador_sist) > 0 ? Number(turnoNoche.cierreCaja.efectivo_mostrador_sist) : null);
  const efectivoEsperado = (turnoNocheEsDeAyer && efectivoTurnoNoche !== null ? efectivoTurnoNoche : null) ?? (Number(dataliveNocheInfo?.teoricoCaja) > 0 ? Number(dataliveNocheInfo.teoricoCaja) : null) ?? efectivoTurnoNoche ?? 0;
  return res.json({
    ok: true,
    aperturas,
    ultimaApertura: aperturas[0] || null,
    ultimoTurnoNoche: turnoNocheOut,
    efectivoEsperado,
    dataliveNocheInfo,
    sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA
  });
});
app.post("/api/apertura-dia", (req, res) => {
  const data = req.body || {};
  const storage = readStorage();
  if (!storage.aperturasDia) storage.aperturasDia = [];
  const nuevaApertura = {
    id: data.id || `ap-${Date.now()}`,
    fecha: data.fecha || getTodayIso(),
    hora: data.hora || (/* @__PURE__ */ new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    empleado: data.empleado || "Colaborador",
    turnoAnteriorFecha: data.turnoAnteriorFecha || "",
    turnoAnteriorTurno: data.turnoAnteriorTurno || "Tarde",
    turnoAnteriorCerradoPor: data.turnoAnteriorCerradoPor || "",
    efectivoAnteriorEsperado: Number(data.efectivoAnteriorEsperado) || 0,
    efectivoContadoApertura: Number(data.efectivoContadoApertura) || 0,
    diferenciaEfectivo: (Number(data.efectivoContadoApertura) || 0) - (Number(data.efectivoAnteriorEsperado) || 0),
    observacionesCaja: data.observacionesCaja || "",
    stockAudit: data.stockAudit || {},
    observacionesStock: data.observacionesStock || "",
    creadoEn: data.creadoEn || (/* @__PURE__ */ new Date()).toISOString()
  };
  const existingIdx = storage.aperturasDia.findIndex(
    (a) => a.id === nuevaApertura.id || a.fecha === nuevaApertura.fecha
  );
  if (existingIdx >= 0) {
    storage.aperturasDia[existingIdx] = nuevaApertura;
  } else {
    storage.aperturasDia.unshift(nuevaApertura);
  }
  storage.aperturasDia.sort((a, b) => {
    const timeA = `${a.fecha}T${a.hora || "00:00"}`;
    const timeB = `${b.fecha}T${b.hora || "00:00"}`;
    return timeB.localeCompare(timeA);
  });
  if (storage.turnoActivo) {
    storage.turnoActivo.apertura = {
      efectivo_anterior_esperado: nuevaApertura.efectivoAnteriorEsperado,
      efectivo_convalidado: nuevaApertura.efectivoContadoApertura,
      diferencia_apertura: nuevaApertura.diferenciaEfectivo,
      observaciones: nuevaApertura.observacionesCaja || "Apertura del d\xEDa registrada"
    };
    storage.turnoActivo.abierto = true;
    storage.turnoActivo.abierto_por = nuevaApertura.empleado;
    storage.turnoActivo.hora_apertura = nuevaApertura.hora;
  }
  writeStorage(storage);
  return res.json({ ok: true, apertura: nuevaApertura, aperturas: storage.aperturasDia });
});
async function startServer() {
  await restoreStateFromDrive();
  const distPath = path.resolve(__dirname, "dist");
  if (isProduction && fs.existsSync(distPath)) {
    console.log("[Server] Running in PRODUCTION mode, serving dist static files...");
    app.use(
      express.static(distPath, {
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html") || filePath.endsWith(".webmanifest") || filePath.endsWith("sw.js") || filePath.endsWith("registerSW.js")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        }
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    console.log("[Server] Running in DEVELOPMENT mode, mounting Vite dev middlewares...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
        hmr: false
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Central App listening on http://0.0.0.0:${PORT} (Mode: ${isProduction ? "Production" : "Development"})`);
  });
}
var apagar = async () => {
  try {
    await drivePusher.flush();
  } catch {
  }
  process.exit(0);
};
process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);
startServer().catch((err) => {
  console.error("[Server] Failed to start server:", err);
  process.exit(1);
});
