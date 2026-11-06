import type {
  CierreCajaData,
  MapaConteos,
  MapaSistemaStock,
  TurnoCierre,
} from '../types/central';

/**
 * Los productos se identifican en toda la app como "c-<codigo>" (ver productId()).
 * Pero el stock que llega de Datalive/servidor a veces viene como "<codigo>" a secas
 * (ej. "10952"). Resultado: el reporte buscaba "c-10952" y no encontraba nada,
 * por eso Detalle / Top 10 / Comparar / Evolución salían vacíos o en 0.
 *
 * Este helper deja TODAS las claves en el formato canónico "c-<codigo>".
 */
export function canonicalPid(key: string): string {
  const k = String(key ?? '').trim();
  if (!k) return k;
  if (/^\d+$/.test(k)) return 'c-' + k; // "10952" -> "c-10952"
  return k; // "c-10952", "n-cat-slug" quedan igual
}

/** Normaliza el mapa de stock del sistema. Ante duplicado, gana la clave que ya era canónica. */
export function normalizeSistemaStock(raw: any): MapaSistemaStock {
  const out: MapaSistemaStock = {};
  if (!raw || typeof raw !== 'object') return out;

  const entries = Object.entries(raw);
  // 1) primero las claves "crudas" (sin prefijo)…
  for (const [k, v] of entries) {
    if (k.startsWith('c-') || k.startsWith('n-')) continue;
    const item = toStockItem(v);
    if (item) out[canonicalPid(k)] = item;
  }
  // 2) …y después las canónicas, que pisan a las crudas
  for (const [k, v] of entries) {
    if (!(k.startsWith('c-') || k.startsWith('n-'))) continue;
    const item = toStockItem(v);
    if (item) out[k] = item;
  }
  return out;
}

function toStockItem(v: any): { stock: number; actualizado: string } | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return { stock: v, actualizado: '' };
  const stock = Number(v.stock);
  if (isNaN(stock)) return null;
  return { stock, actualizado: v.actualizado || '' };
}

/** Normaliza conteos: clave canónica y `ubic` SIEMPRE presente (number, {stock}, {total}, {ubic}). */
export function normalizeConteos(raw: any): MapaConteos {
  const out: MapaConteos = {};
  if (!raw || typeof raw !== 'object') return out;

  for (const [k, v] of Object.entries<any>(raw)) {
    const pid = canonicalPid(k);
    if (v === null || v === undefined) continue;

    if (typeof v === 'number') {
      out[pid] = { ubic: { 'Stock Físico': v }, empleado: '', hora: '' };
      continue;
    }

    let ubic: Record<string, number> | null = null;
    if (v.ubic && typeof v.ubic === 'object' && Object.keys(v.ubic).length > 0) {
      ubic = {};
      for (const [u, n] of Object.entries<any>(v.ubic)) ubic[u] = Number(n) || 0;
    } else if (typeof v.total === 'number') {
      ubic = { 'Stock Físico': v.total };
    } else if (typeof v.stock === 'number') {
      ubic = { 'Stock Físico': v.stock };
    } else if (v.ubic && typeof v.ubic === 'object') {
      ubic = {}; // contado pero sin ubicaciones => 0
    }
    if (!ubic) continue;

    out[pid] = { ubic, empleado: v.empleado || '', hora: v.hora || '' };
  }
  return out;
}

/** Suma total contado de una entrada ya normalizada. */
export function totalContado(entry: { ubic?: Record<string, number> } | undefined | null): number {
  if (!entry?.ubic) return 0;
  return Object.values(entry.ubic).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Caja vacía: se usa para turnos históricos sin cierre de caja (NO caer a la caja en vivo). */
export const EMPTY_CAJA: CierreCajaData = {
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
};

/** Suma de los 3 postnets contados a mano (esto es el "cobro electrónico" real). */
export function sumaPostnets(c?: Partial<CierreCajaData> | null): number {
  if (!c) return 0;
  return (
    (Number(c.postnet_amarillo) || 0) +
    (Number(c.postnet_rosa) || 0) +
    (Number(c.postnet_blanco) || 0)
  );
}

/** Devuelve una copia del turno con conteos/sistema normalizados. No muta el original. */
export function normalizeTurno(t: TurnoCierre): TurnoCierre {
  return {
    ...t,
    conteos: normalizeConteos(t.conteos),
    sistemaStock: normalizeSistemaStock(t.sistemaStock),
  };
}

/** Clave de orden cronológico estable (timestamp ISO o fecha + hora). */
export function turnoSortKey(t: Pick<TurnoCierre, 'timestamp' | 'fecha' | 'hora_cierre' | 'turno'>): string {
  if (t.timestamp) return t.timestamp;
  return `${t.fecha}T${t.turno === 'Tarde' ? '2' : '1'}-${t.hora_cierre || '00:00'}`;
}

/** ID único y estable de un turno para selectores. */
export function turnoKey(t: Pick<TurnoCierre, 'id' | 'fecha' | 'turno' | 'hora_cierre'>): string {
  return t.id || `${t.fecha}|${t.turno}|${t.hora_cierre || ''}`;
}

/** Fecha local YYYY-MM-DD (evita el desfase UTC de toISOString() en Argentina). */
export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resta días a una fecha YYYY-MM-DD (sin problemas de zona horaria). */
export function fechaMenosDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

/**
 * Turno de referencia para la APERTURA: el último turno TARDE cerrado formalmente.
 * Única regla para cliente y servidor. Ignora los turnos "auto-archivados" (sin cierre formal)
 * y no usa datos de ejemplo ni cifras fijas.
 */
export function pickReferenciaTarde<
  T extends { fecha: string; turno: string; cerrado?: boolean; autoArchivado?: boolean; timestamp?: string; hora_cierre?: string }
>(turnos: T[], hoyIso: string): { turno: T | null; esDeAyer: boolean; diasAtras: number | null } {
  const candidatos = (turnos || [])
    .filter((t) => t && t.cerrado && t.turno === 'Tarde' && !t.autoArchivado)
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return (b.timestamp || b.hora_cierre || '').localeCompare(a.timestamp || a.hora_cierre || '');
    });
  const turno = candidatos[0] || null;
  if (!turno) return { turno: null, esDeAyer: false, diasAtras: null };
  const dias = Math.round(
    (Date.parse(hoyIso + 'T00:00:00Z') - Date.parse(turno.fecha + 'T00:00:00Z')) / 86400000
  );
  return { turno, esDeAyer: turno.fecha === fechaMenosDias(hoyIso, 1), diasAtras: dias };
}
