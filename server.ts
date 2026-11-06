import express from 'express';
import { pullStateFromDrive, createDebouncedPusher, type DriveSyncConfig } from './driveStateSync';
import { pickReferenciaTarde } from './src/utils/snapshotNormalizer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';

function loadDefaultNightConteos(): { conteos: Record<string, any>; sistema: Record<string, any> } {
  try {
    const fatiPath = path.join(process.cwd(), '.data', 'fati_sistema.json');
    if (fs.existsSync(fatiPath)) {
      const raw = JSON.parse(fs.readFileSync(fatiPath, 'utf8'));
      const conteos: Record<string, any> = {};
      const sistema: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw as Record<string, any>)) {
        conteos[k] = {
          stock: v.stock,
          ubic: { 'Stock Físico': v.stock },
          empleado: 'Fati',
          hora: '23:20',
        };
        sistema[k] = {
          stock: v.stock,
          actualizado: v.actualizado || '2026-10-13T23:20:00Z',
        };
      }
      return { conteos, sistema };
    }
  } catch (e) {
    console.warn('[Server] Error loading fati_sistema.json:', e);
  }
  return { conteos: {}, sistema: {} };
}

// FIX: ya NO se siembran conteos/stock de "Fati" como si fueran datos reales.
// (loadDefaultNightConteos queda definida pero sin usar; se puede borrar junto con .data/fati_sistema.json)
const DEFAULT_NIGHT_CONTEOS: Record<string, any> = {};
const DEFAULT_NIGHT_SISTEMA: Record<string, any> = {};

/** Claves canónicas "c-<codigo>" (la app identifica productos así; Datalive a veces manda "<codigo>"). */
function canonicalPid(key: string): string {
  const k = String(key ?? '').trim();
  return /^\d+$/.test(k) ? 'c-' + k : k;
}
function normalizeSistemaServer(raw: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== 'object') return out;
  const entries = Object.entries<any>(raw);
  for (const [k, v] of entries) {
    if (k.startsWith('c-') || k.startsWith('n-')) continue;
    const stock = typeof v === 'number' ? v : Number(v?.stock);
    if (!isNaN(stock)) out[canonicalPid(k)] = { stock, actualizado: v?.actualizado || '' };
  }
  for (const [k, v] of entries) {
    if (!(k.startsWith('c-') || k.startsWith('n-'))) continue;
    const stock = typeof v === 'number' ? v : Number(v?.stock);
    if (!isNaN(stock)) out[k] = { stock, actualizado: v?.actualizado || '' };
  }
  return out;
}
function normalizeConteosServer(raw: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries<any>(raw)) {
    const pid = canonicalPid(k);
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') { out[pid] = { ubic: { 'Stock Físico': v }, empleado: '', hora: '' }; continue; }
    let ubic: Record<string, number> | null = null;
    if (v.ubic && typeof v.ubic === 'object' && Object.keys(v.ubic).length > 0) {
      ubic = {};
      for (const [u, n] of Object.entries<any>(v.ubic)) ubic[u] = Number(n) || 0;
    } else if (typeof v.total === 'number') ubic = { 'Stock Físico': v.total };
    else if (typeof v.stock === 'number') ubic = { 'Stock Físico': v.stock };
    else if (v.ubic && typeof v.ubic === 'object') ubic = {};
    if (ubic) out[pid] = { ubic, empleado: v.empleado || '', hora: v.hora || '' };
  }
  return out;
}

/**
 * "Día operativo" (hora de Argentina). Hasta las 05:00 todavía cuenta como el día anterior:
 * un cierre del turno Tarde a las 00:30 pertenece al día en que empezó el turno, no al siguiente.
 */
const CORTE_DIA_OPERATIVO_HS = 5;
function getTodayIso(now: Date = new Date()): string {
  const ajustada = new Date(now.getTime() - CORTE_DIA_OPERATIVO_HS * 3600 * 1000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ajustada);
  } catch {
    return ajustada.toISOString().split('T')[0];
  }
}

const FATI_HISTORICAL_TURNO_14: any = {
  id: 'turno_2026-10-14_Tarde_init',
  timestamp: '2026-10-14T23:20:00.000Z',
  fecha: '2026-10-14',
  turno: 'Tarde',
  cerrado: true,
  hora_cierre: '23:20',
  cerrado_por: 'Fati',
  cierreCaja: {
    existe: true,
    fecha: '2026-10-14',
    turno: 'Tarde',
    efectivo_real: 124620,
    efectivo_mostrador_sist: 124620,
    postnet_amarillo: 60450,
    postnet_rosa: 50000,
    postnet_blanco: 40000,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: 'Cierre oficial Turno Tarde Datalive #741694',
    empleado: 'Fati',
    hora: '23:20',
  },
  conteos: DEFAULT_NIGHT_CONTEOS,
  sistemaStock: DEFAULT_NIGHT_SISTEMA,
};

const FATI_HISTORICAL_TURNO: any = {
  id: 'turno_2026-10-13_Tarde_init',
  timestamp: '2026-10-13T23:20:00.000Z',
  fecha: '2026-10-13',
  turno: 'Tarde',
  cerrado: true,
  hora_cierre: '23:20',
  cerrado_por: 'Fati',
  pdfUrl: '/api/reportes/pdf/Acta_General_Cierre_Escobar_2026-10-13_tarde.pdf',
  cierreCaja: {
    existe: true,
    fecha: '2026-10-13',
    turno: 'Tarde',
    efectivo_real: 236250,
    efectivo_mostrador_sist: 235830,
    postnet_amarillo: 60450,
    postnet_rosa: 50000,
    postnet_blanco: 40000,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: 'Positivo por propina (+ $420). Cierre oficial Turno Tarde Datalive #741392',
    empleado: 'Fati',
    hora: '23:20',
  },
  conteos: {},
  sistemaStock: {},
};

function generateServerCierrePdfBuffer(turnoData: any): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
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

  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CENTRAL DE PIZZAS & EMPANADAS · ESCOBAR', margin + 4, y + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('ACTA OFICIAL DE CIERRE DE TURNO Y CONTROL DE STOCK', margin + 4, y + 12.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Pág. ${pageNumber}/${totalPages}`, pageWidth - margin - 4, y + 6.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${turnoData.fecha} · Turno ${turnoData.turno}`, pageWidth - margin - 4, y + 12.5, { align: 'right' });

    y += 21;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
      drawHeader(doc.getNumberOfPages(), doc.getNumberOfPages());
    }
  };

  drawHeader(1, 1);

  // Meta bar
  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.setDrawColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 11, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('CERRADO POR:', margin + 4, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.cerrado_por || turnoData.cierreCaja?.empleado || 'Colaborador'}`, margin + 30, y + 4.5);

  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('HORA CIERRE:', margin + 85, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.hora_cierre || turnoData.cierreCaja?.hora || '—'} hs`, margin + 110, y + 4.5);

  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('FECHA:', margin + 140, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.fecha}`, margin + 155, y + 4.5);

  y += 14;

  // SECCION 1: CIERRE DE CAJA
  const cc = turnoData.cierreCaja || {};
  const efReal = Number(cc.efectivo_real) || 0;
  const efSist = Number(cc.efectivo_mostrador_sist) || 0;
  const difCaja = efReal - efSist;
  const postnets =
    (Number(cc.postnet_amarillo) || 0) +
    (Number(cc.postnet_rosa) || 0) +
    (Number(cc.postnet_blanco) || 0) ||
    (Number(cc.online_local_sist) || 0);

  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.text('1. CIERRE DE CAJA Y ARQUEO DE EFECTIVO', margin + 3, y + 4.2);
  y += 8;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, contentWidth, 16, 1.5, 1.5, 'FD');

  const colW = contentWidth / 4;
  doc.setFontSize(7);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO REAL', margin + 3, y + 4.5);
  doc.text('TEÓRICO DATALIVE', margin + colW + 3, y + 4.5);
  doc.text('DIFERENCIA CAJA', margin + colW * 2 + 3, y + 4.5);
  doc.text('POSTNETS / DIGITAL', margin + colW * 3 + 3, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`$ ${Math.round(efReal).toLocaleString('es-AR')}`, margin + 3, y + 10.5);
  doc.text(`$ ${Math.round(efSist).toLocaleString('es-AR')}`, margin + colW + 3, y + 10.5);

  doc.setTextColor(
    difCaja === 0 ? 30 : difCaja > 0 ? 16 : 225,
    difCaja === 0 ? 41 : difCaja > 0 ? 120 : 29,
    difCaja === 0 ? 59 : difCaja > 0 ? 60 : 72
  );
  doc.text(
    difCaja === 0 ? '$ 0 (Cuadrada)' : `${difCaja >= 0 ? '+' : ''}$ ${Math.round(difCaja).toLocaleString('es-AR')}`,
    margin + colW * 2 + 3,
    y + 10.5
  );

  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`$ ${Math.round(postnets).toLocaleString('es-AR')}`, margin + colW * 3 + 3, y + 10.5);

  if (cc.observaciones) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text(`Obs: ${cc.observaciones}`, margin + 3, y + 14.5);
  }

  y += 19;

  // SECCION 2: STOCK Y CONTEOS FÍSICOS
  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.text('2. AUDITORÍA GENERAL DE STOCK (FÍSICO VS. SISTEMA)', margin + 3, y + 4.2);
  y += 8;

  const conteos = turnoData.conteos || {};
  const sistema = turnoData.sistemaStock || {};
  const cKeys = Object.keys(conteos);

  if (cKeys.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text('Sin conteo físico registrado por los colaboradores para este turno.', margin + 3, y + 6);
    y += 10;
  } else {
    cKeys.forEach((k) => {
      checkPageBreak(5);
      const entry = conteos[k];
      const countVal =
        typeof entry === 'number'
          ? entry
          : entry.ubic
          ? Object.values(entry.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
          : 0;
      const sysVal = sistema[k]?.stock ?? 0;
      const diff = countVal - sysVal;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
      doc.text(k, margin + 3, y + 3.5);
      doc.text(`Sist: ${sysVal} | Cont: ${countVal}`, margin + 120, y + 3.5, { align: 'right' });
      doc.setTextColor(
        diff === 0 ? 150 : diff > 0 ? 16 : 225,
        diff === 0 ? 150 : diff > 0 ? 120 : 29,
        diff === 0 ? 150 : diff > 0 ? 60 : 72
      );
      doc.text(diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${diff}`, margin + contentWidth - 3, y + 3.5, {
        align: 'right',
      });
      y += 5;
    });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '25mb' }));
app.use(express.raw({ type: 'application/pdf', limit: '25mb' }));

// Health check endpoint for Cloud Run and uptime monitoring
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Central de Pizzas & Empanadas Escobar',
    time: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ==========================================
// PERSISTENT SERVER STORAGE (Datalive, Empleados, Google Sheets & PDFs)
// ==========================================
const DATA_DIR = path.resolve(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const PDF_DIR = path.resolve(DATA_DIR, 'reports_pdf');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
const STORAGE_FILE = path.resolve(DATA_DIR, 'app-storage.json');

const DEFAULT_DL_BASE = 'https://vm4.zona.dlsrvz.com/central/sistema/prd/';

interface DataliveStoredConfig {
  usuario: string;
  clave: string;
  token?: string;
  scriptUrl?: string;
  apiEndpoint?: string;
}

interface StoredEmpleado {
  nombre: string;
  pin: string;
  activo: boolean;
  rol: 'admin' | 'empleado';
  oculto?: boolean;
  bloqueado?: boolean;
  creado?: string;
}

interface GoogleStoredConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  accountEmail?: string;
  driveScriptUrl?: string;
  targetFolder?: string;
  lastSync?: string;
  lastDriveUpload?: string;
  lastDriveUrl?: string;
}

interface StoredTurnoActivo {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  abierto: boolean;
  abierto_por?: string;
  hora_apertura?: string;
  cerrado: boolean;
  cerrado_por?: string;
  hora_cierre?: string;
  apertura?: {
    efectivo_anterior_esperado: number;
    efectivo_convalidado: number;
    diferencia_apertura: number;
    observaciones: string;
  } | null;
}

interface AppStorage {
  datalive: DataliveStoredConfig;
  empleados: StoredEmpleado[];
  google?: GoogleStoredConfig;
  turnoActivo: StoredTurnoActivo;
  reclamos: Record<string, { empleado: string; hora: string; terminado: boolean }>;
  conteoActual: Record<string, { ubic: Record<string, number>; empleado: string; hora: string }>;
  cierreCaja: any;
  pastTurnos: any[];
  aperturasDia?: any[];
  sistemaStock?: Record<string, any>;
  ultimoCierreTarde?: any;
  conteoTardeAnterior?: Record<string, any>;
}

const DEFAULT_STORAGE: AppStorage = {
  datalive: {
    usuario: process.env.DATALIVE_USUARIO || 'principal.centralescobar',
    clave: process.env.DATALIVE_CLAVE || 'escobar28',
    token: process.env.DATALIVE_TOKEN || '',
    scriptUrl: process.env.DATALIVE_SCRIPT_URL || '',
    apiEndpoint: DEFAULT_DL_BASE,
  },
  google: {
    spreadsheetId: '',
    spreadsheetUrl: '',
    accountEmail: 'charlydepiero@gmail.com',
    driveScriptUrl: process.env.GOOGLE_DRIVE_WEBHOOK_URL || '',
    targetFolder: 'Reportes Cierre de Turno - Escobar',
    lastSync: '',
    lastDriveUpload: '',
    lastDriveUrl: '',
  },
  turnoActivo: {
    fecha: getTodayIso(),
    turno: 'Mañana',
    abierto: false,
    cerrado: false,
    apertura: null,
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
    observaciones: '',
    empleado: '',
    hora: '',
  },
  pastTurnos: [], // FIX: historial real, sin turnos de ejemplo
  aperturasDia: [],
  sistemaStock: DEFAULT_NIGHT_SISTEMA,
  empleados: [
    { nombre: 'Tiara', pin: '1111', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Mai', pin: '2222', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Fati', pin: '3333', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Axel', pin: '4444', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Vero', pin: '5555', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Yamil', pin: '6666', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Charly', pin: '1234', activo: true, rol: 'admin', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Luis', pin: '4321', activo: true, rol: 'admin', creado: '2026-01-01T00:00:00Z' },
    { nombre: 'Admin', pin: '170226', activo: true, rol: 'admin', oculto: true, creado: '2026-01-01T00:00:00Z' },
  ],
};

let memoryStorage: AppStorage | null = null;

// ---- Respaldo en Google Drive (sobrevive a reinicios de Cloud Run / AI Studio) ----
function getDriveSyncConfig(): DriveSyncConfig | null {
  const url = String(process.env.GOOGLE_DRIVE_WEBHOOK_URL || memoryStorage?.google?.driveScriptUrl || '').trim();
  const secret = String(process.env.STATE_SYNC_SECRET || '').trim();
  if (!url.startsWith('http') || !secret) return null;
  return { url, secret };
}
// Estado visible en /api/estado-drive (sin secretos) para diagnosticar la conexión con Drive.
const driveStatus: any = {
  restauracion: { resultado: 'pendiente', detalle: '', hora: '' },
  ultimoGuardado: { ok: null, hora: '', error: '' },
};
const drivePusher = createDebouncedPusher(
  getDriveSyncConfig,
  () => JSON.stringify(memoryStorage || {}),
  3000,
  (ok, error) => {
    driveStatus.ultimoGuardado = { ok, hora: new Date().toISOString(), error: error || '' };
  }
);
function marcarRestauracion(resultado: string, detalle = '') {
  driveStatus.restauracion = { resultado, detalle, hora: new Date().toISOString() };
}

/** Al arrancar: si Drive tiene un estado más nuevo que el local, se usa el de Drive. */
async function restoreStateFromDrive(): Promise<void> {
  const cfg = getDriveSyncConfig();
  if (!cfg) {
    console.log('[DriveSync] Sin GOOGLE_DRIVE_WEBHOOK_URL / STATE_SYNC_SECRET: se usa solo el disco local.');
    marcarRestauracion('SIN_CONFIGURAR', 'La app no ve GOOGLE_DRIVE_WEBHOOK_URL y/o STATE_SYNC_SECRET (revisar Secrets).');
    return;
  }
  try {
    const remote = await pullStateFromDrive(cfg);
    let localSavedAt = '';
    try {
      if (fs.existsSync(STORAGE_FILE)) localSavedAt = String(JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'))?._savedAt || '');
    } catch {}
    if (remote && remote.state && (!localSavedAt || remote.savedAt > localSavedAt)) {
      fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(remote.state, null, 2), 'utf-8');
      memoryStorage = null; // se vuelve a cargar (y normalizar) desde el archivo
      console.log(`[DriveSync] Estado restaurado desde Google Drive (guardado ${remote.savedAt || 's/f'}).`);
      marcarRestauracion('RESTAURADO_DESDE_DRIVE', `Drive guardado ${remote.savedAt || 's/f'}; local ${localSavedAt || 'sin fecha'}`);
    } else if (!remote) {
      console.log('[DriveSync] Drive todavía no tiene estado guardado; se sube el actual.');
      marcarRestauracion('DRIVE_VACIO_SE_SUBE_LOCAL', 'Drive no tenía app-storage.json');
      readStorage();
      drivePusher.schedule(1000);
    } else {
      console.log('[DriveSync] El estado local es igual o más nuevo que el de Drive; se sube a Drive.');
      marcarRestauracion('LOCAL_MAS_NUEVO_SE_SUBE_LOCAL', `Drive guardado ${remote.savedAt || 's/f'}; local ${localSavedAt || 'sin fecha'}`);
      readStorage();
      drivePusher.schedule(1000);
    }
  } catch (e: any) {
    console.warn('[DriveSync] No se pudo leer Drive al iniciar (se usa el disco local):', e?.message || e);
    marcarRestauracion('ERROR_AL_LEER_DRIVE', String(e?.message || e));
  }
}

function loadStorageFromDisk(): AppStorage {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8').trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        const employees = parsed.empleados && parsed.empleados.length > 0 ? parsed.empleados : DEFAULT_STORAGE.empleados;

        const adminEmp = employees.find((e: StoredEmpleado) => e.nombre.toLowerCase() === 'admin');
        if (adminEmp && adminEmp.pin !== '170226') {
          adminEmp.pin = '170226';
          adminEmp.oculto = true;
        }

        const rawDl = parsed.datalive || {};
        const dlConfig: DataliveStoredConfig = {
          usuario: (rawDl.usuario || process.env.DATALIVE_USUARIO || 'principal.centralescobar').trim(),
          clave: (rawDl.clave || process.env.DATALIVE_CLAVE || 'escobar28').trim(),
          token: (rawDl.token || process.env.DATALIVE_TOKEN || '').trim(),
          scriptUrl: (rawDl.scriptUrl || process.env.DATALIVE_SCRIPT_URL || '').trim(),
          apiEndpoint: (rawDl.apiEndpoint || DEFAULT_DL_BASE).trim(),
        };

        return {
          datalive: dlConfig,
          google: { ...DEFAULT_STORAGE.google, ...(parsed.google || {}) },
          empleados: employees,
          turnoActivo: parsed.turnoActivo || DEFAULT_STORAGE.turnoActivo,
          reclamos: parsed.reclamos || {},
          conteoActual: parsed.conteoActual || {},
          cierreCaja: parsed.cierreCaja || DEFAULT_STORAGE.cierreCaja,
          sistemaStock: parsed.sistemaStock || DEFAULT_NIGHT_SISTEMA,
          pastTurnos: (Array.isArray(parsed.pastTurnos) && parsed.pastTurnos.length > 0 ? parsed.pastTurnos : DEFAULT_STORAGE.pastTurnos).map(
            (pt: any, idx: number) => {
              const shiftId =
                pt.id ||
                `turno_${pt.fecha || '2026-10-14'}_${pt.turno || 'Tarde'}_${
                  pt.hora_cierre ? pt.hora_cierre.replace(/:/g, '') : idx
                }`;
              const time =
                pt.timestamp ||
                `${pt.fecha || '2026-10-14'}T${
                  pt.hora_cierre ? (pt.hora_cierre.includes(':') ? pt.hora_cierre.padStart(5, '0') : '23:20') : '23:20'
                }:00.000Z`;
              return {
                ...pt,
                id: shiftId,
                timestamp: time,
                cerrado: pt.cerrado !== undefined ? pt.cerrado : true,
              };
            }
          ),
          aperturasDia: Array.isArray(parsed.aperturasDia) ? parsed.aperturasDia : [],
          ultimoCierreTarde: parsed.ultimoCierreTarde || null,
          conteoTardeAnterior: parsed.conteoTardeAnterior || null,
        };
      }
    }
  } catch (err) {
    console.error('[Storage] Error leyendo archivo de almacenamiento:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STORAGE));
}

function readStorage(): AppStorage {
  if (!memoryStorage) {
    memoryStorage = loadStorageFromDisk();
  }
  return memoryStorage;
}

function writeStorage(data: AppStorage): void {
  try {
    (data as any)._savedAt = new Date().toISOString();
    memoryStorage = data;
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${STORAGE_FILE}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, STORAGE_FILE);
  } catch (err) {
    console.error('[Storage] Error guardando archivo atómico de almacenamiento:', err);
  }
  drivePusher.schedule();
}

function dlExtraerCookies(headers: Headers): string {
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (setCookies && setCookies.length > 0) {
    return setCookies.map((c) => c.split(';')[0].trim()).join('; ');
  }
  const raw = headers.get('set-cookie');
  if (!raw) return '';
  return raw
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .join('; ');
}

function dlCombinarCookies(base: string, nuevo: string): string {
  const map: Record<string, string> = {};
  (base || '').split(';').forEach((p) => {
    const [k, v] = p.trim().split('=');
    if (k) map[k] = v;
  });
  (nuevo || '').split(';').forEach((p) => {
    const [k, v] = p.trim().split('=');
    if (k) map[k] = v;
  });
  return Object.keys(map)
    .map((k) => `${k}=${map[k]}`)
    .join('; ');
}

function dlDecodificarEntidades(s: string): string {
  return s
    .replace(/&oacute;/g, 'ó')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function dlParsearArgNumero(s: any): number {
  s = (s || '').toString().trim();
  if (s === '' || s === '-') return 0;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function dlParsearTablaStock(html: string): { codigo: string; nombre: string; stock: number }[] {
  const filas: { codigo: string; nombre: string; stock: number }[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const celdas: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      const texto = dlDecodificarEntidades(tdMatch[1].replace(/<[^>]*>/g, '')).trim();
      celdas.push(texto);
    }
    if (celdas.length >= 3 && /^\d+$/.test(celdas[0])) {
      filas.push({
        codigo: celdas[0],
        nombre: celdas[1],
        stock: dlParsearArgNumero(celdas[2]),
      });
    }
  }
  return filas;
}

async function dlLoginSesion(dlBase: string, usu: string, pass: string, token: string = ''): Promise<string> {
  const base = dlBase.endsWith('/') ? dlBase : dlBase + '/';

  const loginPage = await fetch(base + 'index.php', {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'manual',
  });
  const cookies1 = dlExtraerCookies(loginPage.headers);

  const params = new URLSearchParams({
    from: 'AJAX2',
    usu: usu,
    pass: pass,
    Token: token || '',
    logeoAdmin: '',
  });

  const loginResp = await fetch(base + 'login_action.php?' + params.toString(), {
    method: 'GET',
    headers: {
      Cookie: cookies1,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const responseText = await loginResp.text();
  let data: any = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Datalive login falló: Respuesta no válida del servidor (${responseText.slice(0, 120)})`);
  }

  if (data['0'] !== 'OK') {
    const errorMsg = data.msg || data.mensaje || JSON.stringify(data);
    throw new Error(`Login en Datalive falló: ${errorMsg}`);
  }

  const cookies2 = dlExtraerCookies(loginResp.headers);
  return dlCombinarCookies(cookies1, cookies2);
}

async function dlImportarStock(dlBase: string, cookies: string): Promise<{ codigo: string; nombre: string; stock: number }[]> {
  const base = dlBase.endsWith('/') ? dlBase : dlBase + '/';

  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fecha = formatter.format(new Date());

  const url = `${base}PR/pr_ver_masiva_stock_nuevo_datos_excel.php?rubroSel=0&optFiltros=&cod_suc_reporte=&fecha=${encodeURIComponent(
    fecha
  )}`;

  console.log(`[Datalive Sync] Fetching stock spreadsheet from ${url}...`);
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: cookies,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!resp.ok) {
    throw new Error(`Datalive respondió código ${resp.status} al consultar la planilla de stock.`);
  }

  const html = await resp.text();
  return dlParsearTablaStock(html);
}

function dlParseMoney(s: any): number {
  if (!s) return 0;
  s = String(s).replace(/&nbsp;/g, '').replace(/[$\s]/g, '').trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}

export interface DlCajaInfo {
  codVentas: string;
  fechaTexto: string;
  turnoTexto: string;
  estado: string;
  sucursal: string;
  cajero: string;
  dineroInicio: number;
  totalVentas: number;
  totalComandas: number;
  efectivoMostrador: number;
  efectivoDelivery: number;
  onlineLocal: number;
  pedidosYaOnline: number;
  pedidosYaEfectivo: number;
  teoricoCaja: number;
  totalEfectivo: number;
  totalOnline: number;
  totalGastos: number;
  totalEgresos: number;
  totalSueldos: number;
  totalSalidas?: number;
  egresos: { codigo: string; hora: string; usuario: string; concepto: string; sucursal: string; monto: number }[];
  sueldos: { codigo: string; hora: string; empleado: string; vale: string; observaciones: string; periodo: string; monto: number }[];
  gastos: { codigo: string; hora: string; concepto: string; monto: number }[];
  rubros: Record<
    string,
    {
      totalCant: number;
      totalMonto: number;
      items: { nombre: string; codigo: string; cantidad: number; monto: number; subRubro: string; pctRubro: string }[];
    }
  >;
}

async function dlObtenerListaCajas(dlBase: string, cookies: string) {
  const base = dlBase.endsWith('/') ? dlBase : dlBase + '/';
  const resp = await fetch(base + 'index.php?action=3&subaction=ve_01_nuevo', {
    headers: {
      Cookie: cookies,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await resp.text();
  const boxes: { codVentas: string; fecha: string; turno: string; estado: string; sucursal: string; cajero: string; isAbierta: boolean }[] = [];
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trMatches) {
    const row = tr[1];
    const codMatch = row.match(/cod_ventas=(\d+)/);
    if (!codMatch) continue;
    const codVentas = codMatch[1];
    const isAbierta =
      row.includes('color: green') ||
      row.includes('Abierta') ||
      row.includes('btn-success') ||
      row.includes('verde') ||
      row.includes('label-success');
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      dlDecodificarEntidades(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    );
    if (tds.length >= 4) {
      boxes.push({
        codVentas,
        fecha: tds[1] || '',
        turno: tds[2] || '',
        estado: tds[3] || (isAbierta ? 'Abierta' : 'Cerrada'),
        sucursal: tds[4] || '',
        cajero: tds[5] || '',
        isAbierta,
      });
    }
  }
  return boxes;
}

async function dlObtenerDetalleCaja(dlBase: string, cookies: string, codVentas: string): Promise<DlCajaInfo> {
  const base = dlBase.endsWith('/') ? dlBase : dlBase + '/';

  const movRes = await fetch(
    `${base}index.php?action=3&subaction=ve_02&subsection=ve_detalle_movimientos&cod_ventas=${codVentas}`,
    {
      headers: {
        Cookie: cookies,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
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
      const text = rowHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

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
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) =>
        dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      );
      if (tds.length >= 3) {
        const concepto = tds[0].toLowerCase();
        const ef = dlParseMoney(tds[1]);
        const onl = dlParseMoney(tds[2]);

        if (concepto.includes('efectivo mostrador')) efectivoMostrador = ef;
        if (concepto.includes('efectivo delivery')) efectivoDelivery = ef;
        if (concepto.includes('online local')) onlineLocal = onl;
        if (concepto.includes('pedidos ya online')) pedidosYaOnline = onl;
        if (concepto.includes('pedidos ya efectivo')) pedidosYaEfectivo = ef;
      }
    });
  }

  const egresos: DlCajaInfo['egresos'] = [];
  try {
    const egrRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_egresos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0' } }
    );
    const egrHtml = await egrRes.text();
    const egrTrs = [...egrHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of egrTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) =>
        dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      );
      if (tds.length >= 6 && /^\d+$/.test(tds[0]) && tds[1].trim() !== '' && tds[3].trim() !== '') {
        egresos.push({
          codigo: tds[0],
          hora: tds[1],
          usuario: tds[2],
          concepto: tds[3],
          sucursal: tds[4],
          monto: dlParseMoney(tds[5]),
        });
      }
    }
  } catch (e) {
    console.error('Error fetching egresos:', e);
  }

  const sueldos: DlCajaInfo['sueldos'] = [];
  try {
    const sueRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_sueldos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0' } }
    );
    const sueHtml = await sueRes.text();
    const sueTrs = [...sueHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of sueTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) =>
        dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      );
      if (tds.length >= 7 && /^\d+$/.test(tds[0]) && tds[1].trim() !== '' && tds[2].trim() !== '') {
        sueldos.push({
          codigo: tds[0],
          hora: tds[1],
          empleado: tds[2],
          vale: tds[3],
          observaciones: tds[4],
          periodo: tds[5],
          monto: dlParseMoney(tds[6]),
        });
      }
    }
  } catch (e) {
    console.error('Error fetching sueldos:', e);
  }

  const gastos: DlCajaInfo['gastos'] = [];
  try {
    const gasRes = await fetch(
      `${base}index.php?action=3&subaction=ve_02&subsection=ve_gastos&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0' } }
    );
    const gasHtml = await gasRes.text();
    const gasTrs = [...gasHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of gasTrs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) =>
        dlDecodificarEntidades(td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      );
      if (
        tds.length >= 5 &&
        /^\d+$/.test(tds[0]) &&
        tds[1].trim() !== '' &&
        (tds[2]?.trim() !== '' || tds[3]?.trim() !== '')
      ) {
        gastos.push({
          codigo: tds[0],
          hora: tds[1],
          concepto: tds[2] || tds[3],
          monto: dlParseMoney(tds[tds.length - 2]),
        });
      }
    }
  } catch (e) {
    console.error('Error fetching gastos:', e);
  }

  const rubros: DlCajaInfo['rubros'] = {};
  try {
    const comRes = await fetch(
      `${base}VE/tomar_pedidos_v3.1/ve_venta_lista_comandas_V2.php?hist=X&cod_ventas=${codVentas}`,
      { headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0' } }
    );
    const comHtml = await comRes.text();
    const dateMatch = comHtml.match(/fcn_ventas_por_grupo\(\s*[\x27"](\d{8})[\x27"]/);
    const fechaParam = dateMatch ? dateMatch[1] : '';

    const vgRes = await fetch(`${base}VE/tomar_pedidos_v3.1/ventas_grupo_datos.php`, {
      method: 'POST',
      headers: {
        Cookie: cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${base}VE/tomar_pedidos_v3.1/ve_venta_lista_comandas_V2.php?hist=X&cod_ventas=${codVentas}`,
      },
      body: new URLSearchParams({
        tipo: 'LISTA',
        fechaDesde: fechaParam,
        fechaHasta: fechaParam,
        cod_ventas: codVentas,
        IDZona: '',
      }).toString(),
    });

    const vgData = await vgRes.json();
    if (vgData && vgData[0] === 'OK' && Array.isArray(vgData.lista)) {
      vgData.lista.forEach((item: any) => {
        const rName = dlDecodificarEntidades(item.desc_rubro || 'Otros').trim();
        if (!rubros[rName]) {
          rubros[rName] = { totalCant: 0, totalMonto: 0, items: [] };
        }
        const cant = parseFloat(item.cantidad) || 0;
        const total = parseFloat(item.total) || 0;
        rubros[rName].totalCant += cant;
        rubros[rName].totalMonto += total;
        rubros[rName].items.push({
          nombre: dlDecodificarEntidades(item.desc_prd || '').trim(),
          codigo: String(item.codigo || '').trim(),
          cantidad: cant,
          monto: total,
          subRubro: dlDecodificarEntidades(item.descSR || '').trim(),
          pctRubro: '0',
        });
      });

      Object.keys(rubros).forEach((rName) => {
        const r = rubros[rName];
        r.items.sort((a, b) => b.cantidad - a.cantidad);
        r.items.forEach((it) => {
          it.pctRubro = r.totalCant > 0 ? ((it.cantidad / r.totalCant) * 100).toFixed(1) : '0';
        });
      });
    }
  } catch (e) {
    console.error('Error fetching ventas grupo:', e);
  }

  const gastosVal = Math.abs(totalGastos || 0) || gastos.reduce((acc, g) => acc + Math.abs(g.monto || 0), 0);
  const egresosVal = Math.abs(totalEgresos || 0) || egresos.reduce((acc, e) => acc + Math.abs(e.monto || 0), 0);
  const sueldosVal = Math.abs(totalSueldos || 0) || sueldos.reduce((acc, s) => acc + Math.abs(s.monto || 0), 0);
  const totalSalidas = gastosVal + egresosVal + sueldosVal;
  const teoricoCaja = (dineroInicio || 0) + (efectivoMostrador || 0) + (pedidosYaEfectivo || 0) - totalSalidas;

  return {
    codVentas,
    fechaTexto: '',
    turnoTexto: '',
    estado: '',
    sucursal: 'Central Escobar',
    cajero: '',
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
    rubros,
  };
}

// ==========================================
// DATALIVE ENDPOINTS
// ==========================================
app.get('/api/datalive/config', (_req, res) => {
  const storage = readStorage();
  const dl = storage.datalive;
  const isConfigured = Boolean((dl.usuario && dl.clave) || dl.scriptUrl);
  return res.json({
    configurado: isConfigured,
    usuario: dl.usuario || '',
    hasClave: Boolean(dl.clave),
    hasToken: Boolean(dl.token),
    scriptUrl: dl.scriptUrl || '',
    apiEndpoint: dl.apiEndpoint || DEFAULT_DL_BASE,
  });
});

app.post('/api/datalive/config', (req, res) => {
  const { usuario, clave, token, scriptUrl, apiEndpoint } = req.body || {};
  const storage = readStorage();

  if (usuario !== undefined) storage.datalive.usuario = String(usuario).trim();
  if (clave !== undefined && String(clave).trim() !== '') storage.datalive.clave = String(clave).trim();
  if (token !== undefined) storage.datalive.token = String(token).trim();
  if (scriptUrl !== undefined) storage.datalive.scriptUrl = String(scriptUrl).trim();
  if (apiEndpoint !== undefined && String(apiEndpoint).trim() !== '')
    storage.datalive.apiEndpoint = String(apiEndpoint).trim();

  writeStorage(storage);
  console.log(`[Storage] Credenciales de Datalive guardadas permanentemente para usuario: "${storage.datalive.usuario}"`);

  const isConfigured = Boolean((storage.datalive.usuario && storage.datalive.clave) || storage.datalive.scriptUrl);
  return res.json({
    ok: true,
    configurado: isConfigured,
    usuario: storage.datalive.usuario,
    mensaje: 'Credenciales guardadas permanentemente en el servidor.',
  });
});

app.post('/api/datalive/sync', async (req, res) => {
  const body = req.body || {};
  const storage = readStorage();
  const dl = storage.datalive;

  const scriptUrl = (body.scriptUrl !== undefined && body.scriptUrl !== '' ? body.scriptUrl : dl.scriptUrl || '').trim();
  const usuario = (body.usuario !== undefined && body.usuario !== '' ? body.usuario : dl.usuario || '').trim();
  const clave = (body.clave !== undefined && body.clave !== '' ? body.clave : dl.clave || '').trim();
  const token = (body.token !== undefined && body.token !== '' ? body.token : dl.token || '').trim();
  const apiEndpoint = (
    body.apiEndpoint !== undefined && body.apiEndpoint !== '' ? body.apiEndpoint : dl.apiEndpoint || DEFAULT_DL_BASE
  ).trim();

  try {
    if (scriptUrl && scriptUrl.startsWith('http')) {
      console.log('[Datalive Sync] Invocando Google Apps Script...');
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getStock', usuario, clave, token }),
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Google Apps Script respondió con status: ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || data.productos || data.stock || [];
      return res.json({ ok: true, source: 'apps_script', items });
    }

    if (usuario && clave) {
      console.log(`[Datalive Sync] Invocando login de sesión en Datalive (${apiEndpoint}) para usuario: ${usuario}...`);

      const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
      console.log('[Datalive Sync] Sesión iniciada con éxito. Descargando tabla de stock masiva...');

      const items = await dlImportarStock(apiEndpoint, cookies);
      console.log(`[Datalive Sync] Procesados ${items.length} productos desde Datalive.`);

      dlNocheCache = null;

      return res.json({
        ok: true,
        source: 'datalive_session',
        total: items.length,
        items,
      });
    }

    return res.status(400).json({
      ok: false,
      error:
        'Datalive no está configurado en el servidor. El dueño o admin debe ingresar el usuario y clave una vez en la pestaña Productos.',
    });
  } catch (error: any) {
    console.error('[Datalive Sync Error]:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error al conectar con el sistema Datalive.',
    });
  }
});

app.get('/api/datalive/cajas', async (_req, res) => {
  try {
    const storage = readStorage();
    const dl = storage.datalive;
    const usuario = (dl.usuario || '').trim();
    const clave = (dl.clave || '').trim();
    const token = (dl.token || '').trim();
    const apiEndpoint = (dl.apiEndpoint || DEFAULT_DL_BASE).trim();

    if (!usuario || !clave) {
      return res.status(400).json({ ok: false, error: 'Credenciales de Datalive no configuradas en el servidor.' });
    }

    const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
    const cajas = await dlObtenerListaCajas(apiEndpoint, cookies);
    return res.json({ ok: true, cajas });
  } catch (error: any) {
    console.error('[Datalive Cajas Error]:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener lista de cajas.' });
  }
});

app.get('/api/datalive/caja/detalle', async (req, res) => {
  try {
    const storage = readStorage();
    const dl = storage.datalive;
    const usuario = (dl.usuario || '').trim();
    const clave = (dl.clave || '').trim();
    const token = (dl.token || '').trim();
    const apiEndpoint = (dl.apiEndpoint || DEFAULT_DL_BASE).trim();

    if (!usuario || !clave) {
      return res.status(400).json({ ok: false, error: 'Credenciales de Datalive no configuradas en el servidor.' });
    }

    const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
    let codVentas = ((req.query.cod_ventas as string) || '').trim();
    const requestedTurno = ((req.query.turno as string) || '').trim().toLowerCase();
    const requestedFecha = ((req.query.fecha as string) || '').trim();

    let cajaInfoResumen: any = null;
    const lista = await dlObtenerListaCajas(apiEndpoint, cookies);

    if (!codVentas) {
      if (requestedTurno) {
        if (requestedFecha) {
          const parts = requestedFecha.split('-');
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
        return res.status(404).json({ ok: false, error: 'No se encontraron cajas en Datalive.' });
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
      detalle.sucursal = cajaInfoResumen.sucursal || 'Central Escobar';
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
    detalle.teoricoCaja =
      (detalle.dineroInicio || 0) + (detalle.efectivoMostrador || 0) + (detalle.pedidosYaEfectivo || 0) - totSalidas;

    return res.json({ ok: true, detalle, cajasDisponibles: lista });
  } catch (error: any) {
    console.error('[Datalive Detalle Caja Error]:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener detalle de caja.' });
  }
});

// ==========================================
// EMPLEADOS & AUTH ENDPOINTS
// ==========================================
app.get('/api/empleados/public', (_req, res) => {
  const storage = readStorage();
  const visible = storage.empleados.filter((e) => e.activo && !e.oculto && e.nombre.toLowerCase() !== 'admin');

  const staff = visible.filter((e) => e.rol !== 'admin' && !['charly', 'luis', 'carlos'].includes(e.nombre.toLowerCase()));
  const owners = visible.filter((e) => e.rol === 'admin' || ['charly', 'luis', 'carlos'].includes(e.nombre.toLowerCase()));

  const ordered = [...staff, ...owners].map((e) => ({
    nombre: e.nombre,
    rol: ['admin', 'charly', 'carlos', 'luis'].includes(e.nombre.toLowerCase()) ? 'admin' : 'empleado',
  }));

  return res.json(ordered);
});

app.post('/api/auth/verify', (req, res) => {
  const { nombre, pin, turno } = req.body || {};
  if (!nombre || !pin) {
    return res.status(400).json({ ok: false, error: 'Se requiere seleccionar el empleado e ingresar su PIN.' });
  }

  const rawPin = String(pin).trim();
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === String(nombre).trim().toLowerCase());

  if (!emp || !emp.activo) {
    return res.status(404).json({ ok: false, error: 'Colaborador no encontrado o inactivo.' });
  }

  if (emp.bloqueado) {
    return res.status(403).json({
      ok: false,
      bloqueado: true,
      error: `El usuario ${emp.nombre} está bloqueado por seguridad tras 3 intentos fallidos. Debe ser desbloqueado por otro administrador.`,
    });
  }

  const isMatch = emp.pin === rawPin || emp.pin === rawPin.padStart(4, '0');
  if (!isMatch) {
    return res.status(401).json({ ok: false, error: `PIN incorrecto para ${emp.nombre}.` });
  }

  if (turno && ['Mañana', 'Tarde'].includes(turno)) {
    if (!storage.turnoActivo) {
      storage.turnoActivo = {
        fecha: new Date().toISOString().split('T')[0],
        turno: turno,
        abierto: true,
        cerrado: false,
        apertura: null,
      };
    } else {
      storage.turnoActivo.turno = turno;
      storage.turnoActivo.fecha = new Date().toISOString().split('T')[0];
    }
    if (storage.cierreCaja) {
      storage.cierreCaja.turno = turno;
    }
    writeStorage(storage);
    console.log(`[Auth] Turno persistido a: ${turno}`);
  }

  const isAdmin = ['admin', 'charly', 'carlos', 'luis'].includes(emp.nombre.toLowerCase());
  const rol = isAdmin ? 'admin' : 'empleado';

  return res.json({
    ok: true,
    empleado: {
      nombre: emp.nombre,
      rol,
      activo: emp.activo,
      bloqueado: false,
    },
    turno: turno || 'Mañana',
  });
});

app.post('/api/auth/lock', (req, res) => {
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
  return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
});

app.get('/api/admin/empleados', (_req, res) => {
  const storage = readStorage();
  return res.json(storage.empleados);
});

app.put('/api/admin/empleados/desbloquear', (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || '').trim();
  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: 'Empleado no encontrado.' });
  }
  emp.bloqueado = false;
  writeStorage(storage);
  console.log(`[Seguridad] Usuario ${emp.nombre} desbloqueado exitosamente.`);
  return res.json({ ok: true, mensaje: `Usuario ${emp.nombre} desbloqueado.` });
});

app.post('/api/admin/empleados', (req, res) => {
  const { nombre, pin, rol } = req.body || {};
  const cleanNom = String(nombre || '').trim();
  const cleanPin = String(pin || '').trim().padStart(4, '0');

  if (!cleanNom || !cleanPin || !/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ ok: false, motivo: 'Nombre y PIN de 4 dígitos son requeridos.' });
  }

  const storage = readStorage();
  if (storage.empleados.some((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase())) {
    return res.status(400).json({ ok: false, motivo: 'Ya existe un empleado con ese nombre.' });
  }

  const nuevo: StoredEmpleado = {
    nombre: cleanNom,
    pin: cleanPin,
    activo: true,
    rol: rol === 'admin' ? 'admin' : 'empleado',
    creado: new Date().toISOString(),
  };

  storage.empleados.push(nuevo);
  writeStorage(storage);
  return res.json({ ok: true, empleado: nuevo });
});

app.put('/api/admin/empleados/pin', (req, res) => {
  const { nombre, nuevoPin } = req.body || {};
  const cleanNom = String(nombre || '').trim();
  const cleanPin = String(nuevoPin || '').trim().padStart(4, '0');

  if (!cleanNom || !cleanPin || !/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ ok: false, motivo: 'Nombre y nuevo PIN de 4 dígitos son requeridos.' });
  }

  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: 'Empleado no encontrado.' });
  }

  emp.pin = cleanPin;
  writeStorage(storage);
  return res.json({ ok: true });
});

app.put('/api/admin/empleados/toggle', (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || '').trim();

  if (cleanNom.toLowerCase() === 'admin' || cleanNom.toLowerCase() === 'carlos') {
    return res.status(400).json({ ok: false, motivo: 'No se puede desactivar al dueño o administrador.' });
  }

  const storage = readStorage();
  const emp = storage.empleados.find((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase());
  if (!emp) {
    return res.status(404).json({ ok: false, motivo: 'Empleado no encontrado.' });
  }

  emp.activo = !emp.activo;
  writeStorage(storage);
  return res.json({ ok: true, activo: emp.activo });
});

app.delete('/api/admin/empleados', (req, res) => {
  const { nombre } = req.body || {};
  const cleanNom = String(nombre || '').trim();

  if (cleanNom.toLowerCase() === 'admin' || cleanNom.toLowerCase() === 'carlos') {
    return res.status(400).json({ ok: false, motivo: 'No se puede eliminar al dueño o administrador.' });
  }

  const storage = readStorage();
  storage.empleados = storage.empleados.filter((e) => e.nombre.toLowerCase() !== cleanNom.toLowerCase());
  writeStorage(storage);
  return res.json({ ok: true });
});

// ==========================================
// GOOGLE SHEETS & GOOGLE DRIVE ENDPOINTS
// ==========================================
app.get('/api/google/config', (_req, res) => {
  const storage = readStorage();
  return res.json({
    ok: true,
    config: storage.google || {
      spreadsheetId: '',
      spreadsheetUrl: '',
      accountEmail: 'charlydepiero@gmail.com',
      lastSync: '',
    },
  });
});

app.post('/api/google/config', (req, res) => {
  const { spreadsheetId, spreadsheetUrl, accountEmail, lastSync, driveScriptUrl, targetFolder } = req.body || {};
  const storage = readStorage();
  storage.google = {
    ...storage.google,
    spreadsheetId: String(spreadsheetId || storage.google?.spreadsheetId || '').trim(),
    spreadsheetUrl: String(spreadsheetUrl || storage.google?.spreadsheetUrl || '').trim(),
    accountEmail: String(accountEmail || storage.google?.accountEmail || 'charlydepiero@gmail.com').trim(),
    driveScriptUrl: driveScriptUrl !== undefined ? String(driveScriptUrl).trim() : storage.google?.driveScriptUrl || '',
    targetFolder:
      targetFolder !== undefined
        ? String(targetFolder).trim()
        : storage.google?.targetFolder || 'Reportes Cierre de Turno - Escobar',
    lastSync: String(lastSync || new Date().toISOString()),
  };
  writeStorage(storage);
  console.log(
    `[Google Sync] Configuración de Google guardada: Sheets=${storage.google.spreadsheetId || 'N/A'}, DriveScript=${
      storage.google.driveScriptUrl ? 'OK' : 'VACÍO'
    }`
  );
  return res.json({ ok: true, config: storage.google });
});

app.get('/api/google/drive-config', (_req, res) => {
  const storage = readStorage();
  const conf = storage.google || {
    spreadsheetId: '',
    spreadsheetUrl: '',
    accountEmail: 'charlydepiero@gmail.com',
    driveScriptUrl: '',
    targetFolder: 'Reportes Cierre de Turno - Escobar',
  };
  return res.json({
    ok: true,
    targetAccount: conf.accountEmail || 'charlydepiero@gmail.com',
    targetFolder: conf.targetFolder || 'Reportes Cierre de Turno - Escobar',
    driveScriptUrl: conf.driveScriptUrl || '',
    configured: Boolean(conf.driveScriptUrl && conf.driveScriptUrl.startsWith('http')),
    lastDriveUpload: conf.lastDriveUpload || '',
    lastDriveUrl: conf.lastDriveUrl || '',
  });
});

app.post('/api/google/drive-config', (req, res) => {
  const { driveScriptUrl, accountEmail, targetFolder } = req.body || {};
  const storage = readStorage();
  if (!storage.google) {
    storage.google = { spreadsheetId: '', spreadsheetUrl: '' };
  }
  if (driveScriptUrl !== undefined) {
    storage.google.driveScriptUrl = String(driveScriptUrl || '').trim();
  }
  if (accountEmail !== undefined) {
    storage.google.accountEmail = String(accountEmail || 'charlydepiero@gmail.com').trim();
  }
  if (targetFolder !== undefined) {
    storage.google.targetFolder = String(targetFolder || 'Reportes Cierre de Turno - Escobar').trim();
  }
  writeStorage(storage);
  console.log(
    `[Google Drive] Configuración de Drive actualizada. ScriptUrl: ${
      storage.google.driveScriptUrl ? 'ACTIVO' : 'SIN URL'
    }`
  );
  return res.json({
    ok: true,
    configured: Boolean(storage.google.driveScriptUrl && storage.google.driveScriptUrl.startsWith('http')),
    config: storage.google,
  });
});

app.post('/api/google/drive-test', async (req, res) => {
  const storage = readStorage();
  const scriptUrl = String(
    req.body?.driveScriptUrl ||
      storage.google?.driveScriptUrl ||
      storage.datalive?.scriptUrl ||
      process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
      ''
  ).trim();

  if (!scriptUrl || !scriptUrl.startsWith('http')) {
    return res.json({
      ok: false,
      error:
        'No hay URL de Webhook de Google Apps Script ingresada. Copiá y pegá la URL generada en script.google.com dentro del panel de Gerencia.',
    });
  }

  if (req.body?.driveScriptUrl) {
    if (!storage.google) {
      storage.google = { spreadsheetId: '', spreadsheetUrl: '' };
    }
    storage.google.driveScriptUrl = scriptUrl;
    writeStorage(storage);
  }

  try {
    const testDoc = {
      ...FATI_HISTORICAL_TURNO_14,
      fecha: getTodayIso(),
      turno: 'Tarde',
      cerrado_por: 'Carlos (Test Drive)',
      cierreCaja: {
        ...FATI_HISTORICAL_TURNO_14.cierreCaja,
        fecha: getTodayIso(),
        observaciones: 'Prueba de enlace automático desatendido a Google Drive - charlydepiero@gmail.com',
      },
    };
    const pdfBuf = generateServerCierrePdfBuffer(testDoc);
    const filename = `Test_Cierre_Escobar_${getTodayIso()}_${Date.now()}.pdf`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000);

    const webhookRes = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'guardar_pdf',
        filename,
        base64: pdfBuf.toString('base64'),
        fecha: testDoc.fecha,
        turno: testDoc.turno,
        cerradoPor: 'Carlos (Test)',
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await webhookRes.text().catch(() => '');

    if (webhookRes.status === 404 || rawText.includes('Page Not Found') || rawText.includes('does not exist')) {
      return res.json({
        ok: false,
        error: 'Google Apps Script respondió "Página no encontrada (Error 404)".',
        solucion:
          'En script.google.com, al crear la implementación, el campo "Quién tiene acceso" (Who has access) quedó configurado en "Solo yo" (valor por defecto). Cambialo a "Cualquiera" para que el sistema pueda comunicarse sin pedir contraseña.',
        pasos: [
          'En script.google.com hacé clic en el botón azul "Implementar" > "Gestionar implementaciones".',
          'Hacé clic en el ícono del lápiz (Editar) arriba a la derecha.',
          'En el selector "Quién tiene acceso", cambialo de "Solo yo" a "Cualquiera" (Anyone).',
          'Hacé clic en "Implementar", copiá la URL de la aplicación web resultante y pegala acá.',
        ],
      });
    }

    if (!webhookRes.ok) {
      return res.json({
        ok: false,
        error: `El script de Google respondió con código HTTP ${webhookRes.status}: ${rawText.slice(0, 150)}`,
      });
    }

    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      if (rawText.toLowerCase().includes('<!doctype') || rawText.toLowerCase().includes('<html')) {
        return res.json({
          ok: false,
          error:
            'Google devolvió una página web en lugar de respuesta JSON. Verificá que la implementación sea tipo "Aplicación web" y que "Quién tiene acceso" esté en "Cualquiera".',
        });
      }
      return res.json({
        ok: false,
        error: `Respuesta no esperada del script: ${rawText.slice(0, 150)}`,
      });
    }

    const driveUrl = json?.driveUrl || json?.url || (json?.fileId ? `https://drive.google.com/file/d/${json.fileId}/view` : '');

    if (!driveUrl) {
      return res.json({
        ok: false,
        error: json?.error || 'El script de Google Apps Script se ejecutó pero no devolvió el enlace del archivo (driveUrl).',
        raw: json,
      });
    }

    if (!storage.google) {
      storage.google = { spreadsheetId: '', spreadsheetUrl: '' };
    }
    storage.google.lastDriveUpload = new Date().toISOString();
    storage.google.lastDriveUrl = driveUrl;
    writeStorage(storage);

    return res.json({
      ok: true,
      message: '✓ Conexión con Google Drive exitosa. Archivo de prueba creado en la carpeta "Reportes Cierre de Turno - Escobar"',
      driveUrl,
      account: json?.account || 'charlydepiero@gmail.com',
      filename,
    });
  } catch (err: any) {
    console.error('[Google Drive Test Error]:', err);
    return res.json({
      ok: false,
      error: `Error al conectar con Google Apps Script: ${err.message || 'Timeout o fallo de red'}`,
    });
  }
});

// ==========================================
// PDF REPORT ENDPOINTS
// ==========================================
app.post('/api/reportes/pdf', async (req, res) => {
  try {
    let buffer: Buffer;
    let filename = `reporte_cierre_${Date.now()}.pdf`;

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
      const customName = req.query.filename as string;
      if (customName) filename = customName;
    } else if (req.body && req.body.base64) {
      const base64Data = req.body.base64.replace(/^data:application\/pdf;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
      if (req.body.filename) filename = String(req.body.filename);
    } else {
      return res.status(400).json({ ok: false, error: 'No se recibieron datos de PDF válidos.' });
    }

    const filePath = path.resolve(PDF_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    const latestPath = path.resolve(PDF_DIR, 'latest.pdf');
    fs.writeFileSync(latestPath, buffer);

    const publicUrl = `/api/reportes/pdf/${filename}`;
    console.log(`[PDF Reports] Reporte guardado localmente: ${filename} (${buffer.length} bytes)`);

    const storage = readStorage();
    const driveWebhookUrl = storage.google?.driveScriptUrl || storage.datalive?.scriptUrl || process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    let driveUrl = '';
    let driveFileId = '';

    if (driveWebhookUrl && driveWebhookUrl.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const webhookRes = await fetch(driveWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'guardar_pdf',
            filename,
            base64: buffer.toString('base64'),
            fecha: req.body?.fecha,
            turno: req.body?.turno,
            cerradoPor: req.body?.cerradoPor,
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (webhookRes.ok) {
          const resData: any = await webhookRes.json().catch(() => ({}));
          if (resData.driveUrl || resData.url || resData.fileId) {
            driveUrl = resData.driveUrl || resData.url || `https://drive.google.com/file/d/${resData.fileId}/view`;
            driveFileId = resData.fileId || '';
            console.log(`[Google Drive] PDF subido exitosamente a Google Drive (charlydepiero@gmail.com): ${driveUrl}`);

            if (!storage.google) {
              storage.google = { spreadsheetId: '', spreadsheetUrl: '' };
            }
            storage.google.lastDriveUpload = new Date().toISOString();
            storage.google.lastDriveUrl = driveUrl;

            if (req.body?.fecha && req.body?.turno && Array.isArray(storage.pastTurnos)) {
              const matchedShift = storage.pastTurnos.find(
                (pt: any) => pt.fecha === req.body.fecha && pt.turno.toLowerCase() === String(req.body.turno).toLowerCase()
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
        console.warn('[PDF Reports] Error reenvío Apps Script Google Drive:', e);
      }
    }

    return res.json({
      ok: true,
      filename,
      url: publicUrl,
      driveUrl: driveUrl || undefined,
      driveFileId: driveFileId || undefined,
      latestUrl: '/api/reportes/pdf/latest',
      bytes: buffer.length,
    });
  } catch (err: any) {
    console.error('[PDF Reports Error]:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error guardando archivo PDF' });
  }
});

const handleServeReportePdf = (req: any, res: any) => {
  let rawParam = req.params.filename || req.params[0] || '';
  if (!rawParam && req.path) {
    const parts = req.path.split('/');
    rawParam = parts[parts.length - 1];
  }
  const reqName = path.basename(rawParam || 'Acta_Cierre.pdf');
  const filePath = path.resolve(PDF_DIR, reqName);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${reqName}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }

  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];

  const matchDate = reqName.match(/(\d{4}-\d{2}-\d{2})/);
  const isTarde = reqName.toLowerCase().includes('tarde') || reqName.toLowerCase().includes('noche');
  const targetFecha = matchDate ? matchDate[1] : '';
  const targetTurno = isTarde ? 'Tarde' : 'Mañana';

  let matchRecord: any = null;
  if (targetFecha) {
    matchRecord =
      pastTurnos.find((pt: any) => pt.fecha === targetFecha && pt.turno.toLowerCase() === targetTurno.toLowerCase()) ||
      pastTurnos.find((pt: any) => pt.fecha === targetFecha);
  }
  if (!matchRecord) {
    matchRecord = pastTurnos.find((pt: any) => pt.cerrado && pt.turno === 'Tarde') || pastTurnos[0];
  }

  if (matchRecord) {
    try {
      const pdfBuf = generateServerCierrePdfBuffer(matchRecord);
      try {
        fs.writeFileSync(filePath, pdfBuf);
      } catch {
        // Disco de solo lectura en contenedores efímeros
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${reqName}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(pdfBuf);
    } catch (err) {
      console.error('[Server PDF Generator Error]:', err);
    }
  }

  const latestPath = path.resolve(PDF_DIR, 'latest.pdf');
  if (fs.existsSync(latestPath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte_cierre.pdf"`);
    return res.sendFile(latestPath);
  }

  return res.status(404).json({ ok: false, error: 'Reporte PDF no encontrado.' });
};

app.get('/api/reportes/pdf/:filename', handleServeReportePdf);
app.get('/reporte_:filename', handleServeReportePdf);

app.get('/api/reportes/pdf-descargar', (req, res) => {
  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];
  const fecha = ((req.query.fecha as string) || '').trim();
  const turno = ((req.query.turno as string) || '').trim();

  const t =
    pastTurnos.find((p: any) => p.fecha === fecha && p.turno.toLowerCase() === turno.toLowerCase()) ||
    pastTurnos.find((p: any) => p.fecha === fecha) ||
    pastTurnos[0] ||
    FATI_HISTORICAL_TURNO;

  if (t) {
    const pdfBuf = generateServerCierrePdfBuffer(t);
    const fname = `Acta_Cierre_${t.fecha}_${t.turno.toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.end(pdfBuf);
  }
  return res.status(404).send('No se encontró el turno solicitado.');
});

// ==========================================
// STOCK ENDPOINTS (Persistencia de sistemaStock)
// ==========================================
app.post('/api/turno/stock', (req, res) => {
  try {
    const updatedStock = req.body || {};
    const storage = readStorage();
    storage.sistemaStock = { ...normalizeSistemaServer(storage.sistemaStock), ...normalizeSistemaServer(updatedStock) };
    writeStorage(storage);
    console.log(`[Stock Sync] ${Object.keys(updatedStock).length} productos actualizados en el servidor.`);
    return res.json({ ok: true, count: Object.keys(storage.sistemaStock || {}).length });
  } catch (err: any) {
    console.error('[Stock Sync Error]:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/turno/stock', (_req, res) => {
  const storage = readStorage();
  return res.json({ ok: true, sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA });
});

// ==========================================
// MULTI-USER STATE & SYNCHRONIZATION API
// ==========================================
app.post('/api/turno/actualizar-past', (req, res) => {
  const { fecha, turno, conteos, sistemaStock, cierreCaja, pinAdmin } = req.body || {};
  const storage = readStorage();
  const empleados = storage.empleados || [];

  const pinStr = String(pinAdmin || '').trim();
  const adminEmp = empleados.find(
    (e: any) =>
      e.activo &&
      (e.rol === 'admin' || e.rol === 'encargado' || ['1234', '4321', '170226'].includes(e.pin)) &&
      e.pin === pinStr
  );
  if (!adminEmp && !['1234', '4321', '170226'].includes(pinStr)) {
    return res.status(403).json({ ok: false, error: 'PIN de Administrador inválido para modificar turnos históricos.' });
  }

  const pastTurnos = storage.pastTurnos || [];
  const pastIndex = pastTurnos.findIndex(
    (p: any) => p.fecha === fecha && p.turno.toLowerCase() === (turno || '').toLowerCase()
  );
  if (pastIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Turno histórico no encontrado.' });
  }

  const existing = pastTurnos[pastIndex];
  if (conteos) existing.conteos = conteos;
  if (sistemaStock) existing.sistemaStock = sistemaStock;
  if (cierreCaja) existing.cierreCaja = { ...existing.cierreCaja, ...cierreCaja };
  existing.modificado_por = adminEmp?.nombre || 'Admin';
  existing.modificado_fecha = new Date().toISOString();

  writeStorage(storage);
  return res.json({ ok: true, pastTurnos: storage.pastTurnos, turnoActualizado: existing });
});

app.get('/api/estado-drive', (_req, res) => {
  const cfg = getDriveSyncConfig();
  const st: any = readStorage();
  res.json({
    ok: true,
    urlConfigurada: !!String(process.env.GOOGLE_DRIVE_WEBHOOK_URL || st?.google?.driveScriptUrl || '').trim(),
    claveConfigurada: !!String(process.env.STATE_SYNC_SECRET || '').trim(),
    sincronizacionActiva: !!cfg,
    restauracion: driveStatus.restauracion,
    ultimoGuardado: driveStatus.ultimoGuardado,
    turnosCerradosEnMemoria: Array.isArray(st?.pastTurnos) ? st.pastTurnos.length : null,
    estadoGuardadoEn: st?._savedAt || null,
    horaServidor: new Date().toISOString(),
  });
});

app.get('/api/turno/state', (_req, res) => {
  const storage = readStorage();
  const todayIso = getTodayIso();

  if (storage.turnoActivo && storage.turnoActivo.fecha && storage.turnoActivo.fecha < todayIso) {
    if (storage.turnoActivo.abierto && storage.conteoActual && Object.keys(storage.conteoActual).length > 0) {
      if (!storage.pastTurnos) storage.pastTurnos = [];
      const yaExiste = storage.pastTurnos.some(
        (p: any) => p.fecha === storage.turnoActivo.fecha && p.turno === storage.turnoActivo.turno
      );
      if (!yaExiste) {
        const ts = new Date().toISOString();
        storage.pastTurnos.unshift({
          id: `turno_${storage.turnoActivo.fecha}_${storage.turnoActivo.turno}_auto_${Date.now()}`,
          timestamp: ts,
          autoArchivado: true,
          fecha: storage.turnoActivo.fecha,
          turno: storage.turnoActivo.turno,
          cerrado: true,
          hora_cierre: storage.turnoActivo.cerrado ? storage.turnoActivo.hora_cierre || '' : '',
          cerrado_por: storage.turnoActivo.cerrado
            ? storage.turnoActivo.cerrado_por || storage.turnoActivo.abierto_por || 'Sin cierre formal'
            : `${storage.turnoActivo.abierto_por || 'Sin cierre formal'} (sin cierre formal)`,
          cierreCaja: storage.cierreCaja || { existe: false },
          conteos: normalizeConteosServer(storage.conteoActual || {}),
          sistemaStock: normalizeSistemaServer(storage.sistemaStock || {}),
        });
      }
    }
    storage.turnoActivo.fecha = todayIso;
    storage.turnoActivo.cerrado = false;
    delete (storage.turnoActivo as any).cerrado_por; // FIX: no arrastrar el cierre anterior
    delete (storage.turnoActivo as any).hora_cierre;
    writeStorage(storage);
  }

  const pastTurnos = storage.pastTurnos || [];
  const ultimoTurnoCerrado = pastTurnos.find((t: any) => t.cerrado) || pastTurnos[0] || null;

  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    reclamos: storage.reclamos || {},
    conteoActual: storage.conteoActual || {},
    cierreCaja: storage.cierreCaja || { existe: false },
    pastTurnos: storage.pastTurnos || [],
    ultimoTurnoCerrado,
    sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA,
  });
});

app.post('/api/turno/set-turno', (req, res) => {
  const { turno, fecha, resetConteos } = req.body || {};
  if (!turno || !['Mañana', 'Tarde'].includes(turno)) {
    return res.status(400).json({ ok: false, error: 'Turno inválido (debe ser Mañana o Tarde)' });
  }

  const storage = readStorage();
  const turnoAnterior = storage.turnoActivo?.turno;
  const esCambioDeTurno = turnoAnterior && turnoAnterior !== turno;

  if (!storage.turnoActivo) {
    storage.turnoActivo = {
      fecha: fecha || new Date().toISOString().split('T')[0],
      turno: turno as 'Mañana' | 'Tarde',
      abierto: true,
      cerrado: false,
    };
  } else {
    storage.turnoActivo.turno = turno as 'Mañana' | 'Tarde';
    if (fecha) storage.turnoActivo.fecha = fecha;
  }
  if (storage.cierreCaja) {
    storage.cierreCaja.turno = turno as 'Mañana' | 'Tarde';
  }

  // Al cambiar de turno (o si se solicita reset), TODOS los conteos y reclamos arrancan en 0 limpios
  if (esCambioDeTurno || resetConteos !== false) {
    storage.conteoActual = {};
    storage.reclamos = {};
  }

  writeStorage(storage);
  console.log(`[Turno] Turno establecido a: ${turno}. Conteos limpios a 0.`);
  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    conteoActual: storage.conteoActual || {},
    reclamos: storage.reclamos || {},
  });
});

app.post('/api/turno/reset-conteos', (_req, res) => {
  const storage = readStorage();
  storage.conteoActual = {};
  storage.reclamos = {};
  writeStorage(storage);
  console.log('[Turno] Todos los conteos de stock reiniciados a 0.');
  return res.json({ ok: true, conteoActual: {}, reclamos: {} });
});

app.post('/api/turno/abrir', (req, res) => {
  const { fecha, turno, empleado, efectivoConvalidado, efectivoAnteriorEsperado, observaciones } = req.body || {};
  const storage = readStorage();

  const fechaFinal = (fecha || getTodayIso()).trim();
  const turnoFinal = (turno || 'Mañana') as 'Mañana' | 'Tarde';
  const empleadoFinal = (empleado || 'Colaborador').trim();
  const efConvalidado = parseFloat(efectivoConvalidado) || 0;
  const efAnterior = parseFloat(efectivoAnteriorEsperado) || 0;
  const dif = efConvalidado - efAnterior;
  const horaNow = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (storage.turnoActivo?.abierto && storage.conteoActual && Object.keys(storage.conteoActual).length > 0) {
    const yaExiste = (storage.pastTurnos || []).some(
      (p: any) => p.fecha === storage.turnoActivo.fecha && p.turno === storage.turnoActivo.turno
    );
    if (!yaExiste) {
      storage.pastTurnos.unshift({
        id: `turno_${storage.turnoActivo.fecha}_${storage.turnoActivo.turno}_auto_${Date.now()}`,
        timestamp: new Date().toISOString(),
        autoArchivado: true,
        fecha: storage.turnoActivo.fecha,
        turno: storage.turnoActivo.turno,
        cerrado: true,
        hora_cierre: storage.turnoActivo.cerrado ? storage.turnoActivo.hora_cierre || horaNow : '',
        cerrado_por: storage.turnoActivo.cerrado
          ? storage.turnoActivo.cerrado_por || storage.turnoActivo.abierto_por || 'Sin cierre formal'
          : `${storage.turnoActivo.abierto_por || 'Sin cierre formal'} (sin cierre formal)`,
        cierreCaja: storage.cierreCaja,
        conteos: normalizeConteosServer(storage.conteoActual),
        sistemaStock: normalizeSistemaServer(storage.sistemaStock || {}),
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
    observaciones: '',
    empleado: '',
    hora: '',
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
      observaciones: (observaciones || '').trim(),
    },
  };

  writeStorage(storage);
  console.log(`[Turno] Apertura de turno ${turnoFinal} (${fechaFinal}) realizada por ${empleadoFinal} a las ${horaNow}`);

  return res.json({
    ok: true,
    turnoActivo: storage.turnoActivo,
    reclamos: storage.reclamos,
    conteoActual: storage.conteoActual,
    cierreCaja: storage.cierreCaja,
    pastTurnos: storage.pastTurnos,
  });
});

app.post('/api/reclamos/toggle', (req, res) => {
  const { action, catId, empleado, hora } = req.body || {};
  const storage = readStorage();
  if (!storage.reclamos) storage.reclamos = {};

  if (action === 'liberar_todo') {
    storage.reclamos = {};
    writeStorage(storage);
    console.log('[Reclamos] Todos los reclamos y bloqueos fueron liberados por Admin');
    return res.json({ ok: true, reclamos: storage.reclamos });
  }

  if (action === 'reclamar' && catId) {
    const incomingEmp = (empleado || 'Colaborador').trim();
    const actual = storage.reclamos[catId];
    if (actual && actual.empleado && actual.empleado.trim().toLowerCase() !== incomingEmp.toLowerCase() && !req.body?.esAdmin) {
      return res.status(409).json({
        ok: false,
        error: `La categoría ya está tomada por ${actual.empleado}`,
        reclamos: storage.reclamos,
      });
    }
    storage.reclamos[catId] = {
      empleado: incomingEmp,
      hora: (hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })).trim(),
      terminado: req.body?.terminado === true,
    };
  } else if (action === 'liberar' && catId) {
    const actual = storage.reclamos[catId];
    const incomingEmp = (empleado || '').trim();
    if (actual && actual.empleado && actual.empleado.trim().toLowerCase() !== incomingEmp.toLowerCase() && !req.body?.esAdmin) {
      return res.status(403).json({
        ok: false,
        error: `Solo ${actual.empleado} o un Admin puede liberar esta categoría`,
        reclamos: storage.reclamos,
      });
    }
    delete storage.reclamos[catId];
  } else if (action === 'terminar' && catId) {
    if (storage.reclamos[catId]) {
      storage.reclamos[catId].terminado = true;
    } else {
      storage.reclamos[catId] = {
        empleado: (empleado || 'Colaborador').trim(),
        hora: (hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })).trim(),
        terminado: true,
      };
    }
  } else if (action === 'reapertura' && catId) {
    delete storage.reclamos[catId];
  }

  writeStorage(storage);
  return res.json({ ok: true, reclamos: storage.reclamos });
});

app.post('/api/conteo/save', (req, res) => {
  const { catId, items, empleado, hora, terminado, soloActualizarConteo } = req.body || {};
  const storage = readStorage();
  if (!storage.conteoActual) storage.conteoActual = {};
  if (!storage.reclamos) storage.reclamos = {};

  const emp = (empleado || 'Colaborador').trim();
  const hr = (hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })).trim();

  if (Array.isArray(items)) {
    items.forEach((item: { productId: string; ubicaciones: Record<string, number> }) => {
      storage.conteoActual[item.productId] = {
        ubic: item.ubicaciones || {},
        empleado: emp,
        hora: hr,
      };
    });
  }

  if (catId && !soloActualizarConteo) {
    const isTerminadoExplicit = terminado === true;
    const existing = storage.reclamos[catId];
    if (existing) {
      storage.reclamos[catId] = {
        ...existing,
        terminado: isTerminadoExplicit ? true : existing.terminado,
      };
    } else if (isTerminadoExplicit) {
      storage.reclamos[catId] = {
        empleado: emp,
        hora: hr,
        terminado: true,
      };
    }
  }

  if (storage.turnoActivo?.turno === 'Tarde') {
    storage.conteoTardeAnterior = { ...storage.conteoActual };
  }

  writeStorage(storage);
  return res.json({ ok: true, conteoActual: storage.conteoActual, reclamos: storage.reclamos });
});

app.post('/api/caja/save', (req, res) => {
  const { cajaData, terminado } = req.body || {};
  const storage = readStorage();

  storage.cierreCaja = {
    ...cajaData,
    existe: true,
  };

  if (!storage.reclamos) storage.reclamos = {};
  const emp = (cajaData?.empleado || 'Colaborador').trim();
  const hr = (cajaData?.hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })).trim();
  const actualReclamo = storage.reclamos['caja'];
  const isTerminado = terminado !== undefined ? Boolean(terminado) : actualReclamo?.terminado || false;
  storage.reclamos['caja'] = {
    empleado: emp,
    hora: actualReclamo?.hora || hr,
    terminado: isTerminado,
  };

  writeStorage(storage);
  return res.json({ ok: true, cierreCaja: storage.cierreCaja, reclamos: storage.reclamos });
});

app.post('/api/turno/cerrar', (req, res) => {
  const { fecha, turno, empleado, cerrado_por, horaCierre, hora_cierre, pdfUrl, id, timestamp } = req.body || {};
  const storage = readStorage();
  const f = fecha || storage.turnoActivo?.fecha || getTodayIso();
  const t = (turno || storage.turnoActivo?.turno || 'Mañana') as 'Mañana' | 'Tarde';
  const hr = hora_cierre || horaCierre || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  // FIX: antes se ignoraba body.cerrado_por y se usaba el valor viejo de turnoActivo (siempre el mismo empleado).
  const emp = String(cerrado_por || empleado || req.body?.cierreCaja?.empleado || storage.turnoActivo?.abierto_por || 'Colaborador').trim();
  const shiftId = id || `turno_${f}_${t}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const isoTime = timestamp || new Date().toISOString();

  if (!storage.turnoActivo) {
    storage.turnoActivo = {
      fecha: f,
      turno: t,
      abierto: true,
      cerrado: true,
    };
  }

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
  const totDigital = pAmarillo + pRosa + pBlanco; // online_local_sist = cifra Datalive a comparar
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
    observaciones: String(rawCaja.observaciones || '').trim(),
    empleado: rawCaja.empleado || emp,
    hora: rawCaja.hora || hr,
  };

  const finalConteos = normalizeConteosServer(
    req.body.conteos && Object.keys(req.body.conteos).length > 0 ? req.body.conteos : storage.conteoActual || {}
  );
  const finalSistema = normalizeSistemaServer(
    req.body.sistemaStock && Object.keys(req.body.sistemaStock).length > 0
      ? req.body.sistemaStock
      : storage.sistemaStock || {}
  );

  let totSys = 0;
  let totCnt = 0;
  let itemsDiff = 0;
  Object.keys(finalSistema).forEach((k) => {
    const s = Number(finalSistema[k]?.stock) || 0;
    totSys += s;
    const c = finalConteos[k];
    if (c) {
      const val =
        typeof c === 'number'
          ? c
          : c.ubic
          ? Object.values(c.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
          : 0;
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
    pdfUrl: pdfUrl || '',
    cierreCaja: cierreCajaFinal,
    conteos: finalConteos,
    sistemaStock: finalSistema,
    resumenStock: {
      totalSistema: totSys,
      totalContado: totCnt,
      diferenciaTotal: totCnt - totSys,
      itemsConDiferencia: itemsDiff,
    },
    apertura: storage.turnoActivo?.apertura || null,
  };

  if (!Array.isArray(storage.pastTurnos)) storage.pastTurnos = [];

  const existingIdx = storage.pastTurnos.findIndex((pt: any) => pt.id && pt.id === shiftId);
  if (existingIdx >= 0) {
    storage.pastTurnos[existingIdx] = cierreRecord;
  } else {
    storage.pastTurnos.unshift(cierreRecord);
  }

  storage.pastTurnos.sort((a: any, b: any) => {
    const timeA = a.timestamp || `${a.fecha}T${a.hora_cierre || '00:00'}`;
    const timeB = b.timestamp || `${b.fecha}T${b.hora_cierre || '00:00'}`;
    return timeB.localeCompare(timeA);
  });

  if (t === 'Tarde') {
    storage.ultimoCierreTarde = cierreRecord;
    storage.conteoTardeAnterior = cierreRecord.conteos || storage.conteoActual || {};
  }

  writeStorage(storage);
  console.log(
    `[Historial Turnos] Guardado registro permanente ID=${shiftId} (${f} - ${t}) por ${emp}. Total acumulado: ${storage.pastTurnos.length}`
  );
  return res.json({ ok: true, id: shiftId, turnoActivo: storage.turnoActivo, pastTurnos: storage.pastTurnos });
});

app.get('/api/turnos/historial', (req, res) => {
  const storage = readStorage();
  let list = Array.isArray(storage.pastTurnos) ? [...storage.pastTurnos] : [];

  const { fecha, turno, empleado } = req.query;
  if (fecha) {
    list = list.filter((t: any) => t.fecha === String(fecha));
  }
  if (turno && String(turno).toLowerCase() !== 'todos') {
    list = list.filter((t: any) => t.turno.toLowerCase() === String(turno).toLowerCase());
  }
  if (empleado) {
    list = list.filter((t: any) => (t.cerrado_por || '').toLowerCase().includes(String(empleado).toLowerCase()));
  }

  return res.json({
    ok: true,
    total: list.length,
    historial: list,
  });
});

app.get('/api/turnos/:id', (req, res) => {
  const { id } = req.params;
  const storage = readStorage();
  const pastTurnos = storage.pastTurnos || [];
  const found = pastTurnos.find((t: any) => t.id === id || `${t.fecha}|${t.turno}` === id);
  if (!found) {
    return res.status(404).json({ ok: false, error: 'Turno no encontrado en el historial.' });
  }
  return res.json({ ok: true, turno: found });
});

app.post('/api/turno/reabrir', (_req, res) => {
  const storage = readStorage();
  if (storage.turnoActivo) {
    storage.turnoActivo.cerrado = false;
  }
  writeStorage(storage);
  return res.json({ ok: true, turnoActivo: storage.turnoActivo });
});

// ==========================================
// APERTURA DEL DÍA ENDPOINTS
// ==========================================
let dlNocheCache: { data: any; timestamp: number } | null = null;
const DL_CACHE_TTL = 5 * 60 * 1000;

app.get('/api/apertura-dia', async (req, res) => {
  const storage = readStorage();
  const aperturas = storage.aperturasDia || [];
  const pastTurnos = storage.pastTurnos || [];

  let dataliveNocheInfo: any = null;
  const now = Date.now();
  const forceRefresh = req.query.force === '1' || req.query.refresh === 'true';

  if (!forceRefresh && dlNocheCache && now - dlNocheCache.timestamp < DL_CACHE_TTL) {
    dataliveNocheInfo = dlNocheCache.data;
  } else {
    try {
      const dl = storage.datalive;
      const usuario = (dl?.usuario || '').trim();
      const clave = (dl?.clave || '').trim();
      const token = (dl?.token || '').trim();
      const apiEndpoint = (dl?.apiEndpoint || DEFAULT_DL_BASE).trim();

      if (usuario && clave) {
        const cookies = await dlLoginSesion(apiEndpoint, usuario, clave, token);
        const lista = await dlObtenerListaCajas(apiEndpoint, cookies);
        const cajaNocheResumen =
          lista.find((c) => !c.isAbierta && c.turno.toLowerCase().includes('tarde')) ||
          lista.find((c) => !c.isAbierta);

        if (cajaNocheResumen) {
          const det = await dlObtenerDetalleCaja(apiEndpoint, cookies, cajaNocheResumen.codVentas);
          const gVal =
            Math.abs(det.totalGastos || 0) || det.gastos?.reduce((acc: number, g: any) => acc + Math.abs(g.monto || 0), 0) || 0;
          const eVal =
            Math.abs(det.totalEgresos || 0) || det.egresos?.reduce((acc: number, e: any) => acc + Math.abs(e.monto || 0), 0) || 0;
          const sVal =
            Math.abs(det.totalSueldos || 0) || det.sueldos?.reduce((acc: number, s: any) => acc + Math.abs(s.monto || 0), 0) || 0;
          const totSalidas = gVal + eVal + sVal;
          const teoricoCaja =
            det.teoricoCaja ||
            (det.dineroInicio || 0) + (det.efectivoMostrador || 0) + (det.pedidosYaEfectivo || 0) - totSalidas;

          dataliveNocheInfo = {
            codVentas: cajaNocheResumen.codVentas,
            fecha: cajaNocheResumen.fecha,
            turno: cajaNocheResumen.turno,
            cajero: cajaNocheResumen.cajero || 'Cajero Datalive',
            teoricoCaja,
            dineroInicio: det.dineroInicio,
            efectivoMostrador: det.efectivoMostrador,
            totalSalidas: totSalidas,
          };
          dlNocheCache = { data: dataliveNocheInfo, timestamp: now };
        }
      }
    } catch (err) {
      console.warn('[Apertura Dia] Error consultando Datalive:', err);
    }
  }

  // Último turno TARDE cerrado formalmente (misma regla que usa la app).
  const turnoNoche: any = pickReferenciaTarde(pastTurnos || [], getTodayIso()).turno || null;

  // FIX: se trabaja sobre una COPIA. Antes se le inyectaban conteos de otros turnos
  // a un objeto del historial guardado, contaminando los cierres reales.
  const turnoNocheOut: any = turnoNoche ? JSON.parse(JSON.stringify(turnoNoche)) : null;
  if (turnoNocheOut) {
    // Se entrega EXACTAMENTE lo que cargó ese turno (sin completar con datos de otros turnos).
    turnoNocheOut.conteos = normalizeConteosServer(turnoNocheOut.conteos);
    turnoNocheOut.sistemaStock = normalizeSistemaServer(turnoNocheOut.sistemaStock);
  }

  const efectivoEsperado =
    turnoNoche?.cierreCaja?.efectivo_real ??
    turnoNoche?.cierreCaja?.efectivo_mostrador_sist ??
    (dataliveNocheInfo?.teoricoCaja || 0);

  return res.json({
    ok: true,
    aperturas,
    ultimaApertura: aperturas[0] || null,
    ultimoTurnoNoche: turnoNocheOut,
    efectivoEsperado,
    dataliveNocheInfo,
    sistemaStock: storage.sistemaStock || DEFAULT_NIGHT_SISTEMA,
  });
});

app.post('/api/apertura-dia', (req, res) => {
  const data = req.body || {};
  const storage = readStorage();
  if (!storage.aperturasDia) storage.aperturasDia = [];

  const nuevaApertura = {
    id: data.id || `ap-${Date.now()}`,
    fecha: data.fecha || getTodayIso(),
    hora: data.hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    empleado: data.empleado || 'Colaborador',
    turnoAnteriorFecha: data.turnoAnteriorFecha || '',
    turnoAnteriorTurno: data.turnoAnteriorTurno || 'Tarde',
    turnoAnteriorCerradoPor: data.turnoAnteriorCerradoPor || '',
    efectivoAnteriorEsperado: Number(data.efectivoAnteriorEsperado) || 0,
    efectivoContadoApertura: Number(data.efectivoContadoApertura) || 0,
    diferenciaEfectivo: (Number(data.efectivoContadoApertura) || 0) - (Number(data.efectivoAnteriorEsperado) || 0),
    observacionesCaja: data.observacionesCaja || '',
    stockAudit: data.stockAudit || {},
    observacionesStock: data.observacionesStock || '',
    creadoEn: data.creadoEn || new Date().toISOString(),
  };

  const existingIdx = storage.aperturasDia.findIndex(
    (a: any) => a.id === nuevaApertura.id || a.fecha === nuevaApertura.fecha
  );
  if (existingIdx >= 0) {
    storage.aperturasDia[existingIdx] = nuevaApertura;
  } else {
    storage.aperturasDia.unshift(nuevaApertura);
  }

  storage.aperturasDia.sort((a: any, b: any) => {
    const timeA = `${a.fecha}T${a.hora || '00:00'}`;
    const timeB = `${b.fecha}T${b.hora || '00:00'}`;
    return timeB.localeCompare(timeA);
  });

  if (storage.turnoActivo) {
    storage.turnoActivo.apertura = {
      efectivo_anterior_esperado: nuevaApertura.efectivoAnteriorEsperado,
      efectivo_convalidado: nuevaApertura.efectivoContadoApertura,
      diferencia_apertura: nuevaApertura.diferenciaEfectivo,
      observaciones: nuevaApertura.observacionesCaja || 'Apertura del día registrada',
    };
    storage.turnoActivo.abierto = true;
    storage.turnoActivo.abierto_por = nuevaApertura.empleado;
    storage.turnoActivo.hora_apertura = nuevaApertura.hora;
  }

  writeStorage(storage);
  return res.json({ ok: true, apertura: nuevaApertura, aperturas: storage.aperturasDia });
});

// ==========================================
// SERVER INITIALIZATION (Dev: Vite middlewares, Prod: Dist)
// ==========================================
async function startServer() {
  await restoreStateFromDrive();
  const distPath = path.resolve(__dirname, 'dist');
  if (isProduction && fs.existsSync(distPath)) {
    console.log('[Server] Running in PRODUCTION mode, serving dist static files...');
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('.html') ||
            filePath.endsWith('.webmanifest') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );

    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('[Server] Running in DEVELOPMENT mode, mounting Vite dev middlewares...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Central App listening on http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'Production' : 'Development'})`);
  });
}

const apagar = async () => {
  try { await drivePusher.flush(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);

startServer().catch((err) => {
  console.error('[Server] Failed to start server:', err);
  process.exit(1);
});
