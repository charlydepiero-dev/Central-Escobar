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
export function turnoSortKey(t: Pick<TurnoCierre, 'timestamp' | 'fecha' | 'hora_cierre' | 'turno'> & { id?: string }): string {
  const f = resolveFechaOperativa(t);
  if (t.timestamp) return `${f}T${t.turno === 'Tarde' ? '2' : '1'}-${t.timestamp}`;
  return `${f}T${t.turno === 'Tarde' ? '2' : '1'}-${t.hora_cierre || '00:00'}`;
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
  const parts = String(iso || '').split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => isNaN(n))) return iso;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

const CORTE_OPERATIVO_HS = 5;

/** Calcula la fecha operativa en Argentina (con corte a las 05:00 AM) para un instante Date. */
export function operationalDateFromDate(now: Date): string {
  const ajustada = new Date(now.getTime() - CORTE_OPERATIVO_HS * 3600 * 1000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ajustada);
  } catch {
    return ajustada.toISOString().slice(0, 10);
  }
}

/** Hora numérica (0-23) a partir de un string "HH:MM" o similar. */
export function parseHourFromHoraStr(hora?: string | null): number | null {
  if (!hora) return null;
  const m = String(hora).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return isNaN(h) ? null : h;
}

/** Determina si una hora de cierre ("23:45", "00:30", etc.) corresponde a un horario nocturno. */
export function isNightClosureHour(hora?: string | null): boolean {
  const h = parseHourFromHoraStr(hora);
  if (h === null) return false;
  return h >= 19 || h < CORTE_OPERATIVO_HS;
}

/** Verifica si un turno tiene datos reales cargados (conteos físicos o arqueo de caja). */
export function hasRealTurnoData(t: any): boolean {
  if (!t) return false;
  const conteos = t.conteos;
  if (conteos && typeof conteos === 'object' && Object.keys(conteos).length > 0) {
    for (const v of Object.values<any>(conteos)) {
      if (typeof v === 'number' && v > 0) return true;
      if (v && typeof v === 'object') {
        if (typeof v.stock === 'number' && v.stock > 0) return true;
        if (typeof v.total === 'number' && v.total > 0) return true;
        if (v.ubic && typeof v.ubic === 'object') {
          const sum = Object.values(v.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
          if (sum > 0) return true;
        }
      }
    }
    return true;
  }
  const cc = t.cierreCaja;
  if (cc && typeof cc === 'object') {
    if (
      (Number(cc.efectivo_real) || 0) > 0 ||
      (Number(cc.efectivo_mostrador_sist) || 0) > 0 ||
      sumaPostnets(cc) > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resuelve la fecha operativa real de un turno en Argentina.
 * Corrige turnos nocturnos cerrados después de las 21:00 ART (00:00 UTC) donde el bug de
 * `new Date().toISOString().split('T')[0]` adelantó la fecha +1 día al día siguiente.
 */
export function resolveFechaOperativa(t: any): string {
  if (!t) return '';
  const rawFecha = String(t.fecha || '').trim();

  // 1) Extraer el timestamp real en milisegundos desde el ID (`turno_YYYY-MM-DD_Tarde_1762...`)
  const idStr = String(t.id || '');
  const idMatch = idStr.match(/_(\d{13})(?:_|$)/);
  if (idMatch) {
    const ms = Number(idMatch[1]);
    if (!isNaN(ms) && ms > 1700000000000) {
      const opDate = operationalDateFromDate(new Date(ms));
      if (!rawFecha || rawFecha > opDate) {
        return opDate;
      }
    }
  }

  // 2) Si tiene timestamp ISO real (con milisegundos distintos de :00.000Z sintético, o turno nocturno)
  const tsStr = String(t.timestamp || '').trim();
  if (tsStr && !tsStr.endsWith(':20:00.000Z')) {
    const parsedMs = Date.parse(tsStr);
    if (!isNaN(parsedMs) && parsedMs > 1700000000000) {
      const opDate = operationalDateFromDate(new Date(parsedMs));
      if (!rawFecha || rawFecha > opDate) {
        return opDate;
      }
    }
  }

  return rawFecha;
}

/**
 * Turno de referencia para la APERTURA: el último turno nocturno (Tarde) anterior a `hoyIso`.
 * - Corrige automáticamente fechas adelantadas +1 día por UTC luego de las 21:00 ART.
 * - Acepta turnos auto-archivados si contienen datos reales (conteos o caja) cuando no hubo cierre formal ese día.
 * - Tolera cierres nocturnos (>19:00 hs o <05:00 hs) que hayan quedado etiquetados como Mañana por error si ese día no tuvo Tarde.
 */
export function pickReferenciaTarde<
  T extends {
    id?: string;
    fecha: string;
    turno: string;
    cerrado?: boolean;
    autoArchivado?: boolean;
    timestamp?: string;
    hora_cierre?: string;
    conteos?: any;
    cierreCaja?: any;
  }
>(turnos: T[], hoyIso: string): { turno: T | null; esDeAyer: boolean; diasAtras: number | null } {
  const lista = Array.isArray(turnos) ? turnos : [];
  if (lista.length === 0) return { turno: null, esDeAyer: false, diasAtras: null };

  type Enriched = {
    original: T;
    fechaEfectiva: string;
    esTardeExplicito: boolean;
    esCierreFormal: boolean;
    tieneDatos: boolean;
    sortTime: string;
  };

  const enriquecidos: Enriched[] = [];

  for (const t of lista) {
    if (!t) continue;
    const fechaEfectiva = resolveFechaOperativa(t);
    if (!fechaEfectiva) continue;

    const horaCierre = t.hora_cierre || t.cierreCaja?.hora || '';
    const esHoraNocturna = isNightClosureHour(horaCierre);
    const esTardeExplicito = t.turno === 'Tarde';
    const tieneDatos = hasRealTurnoData(t);
    const esCierreFormal = Boolean(t.cerrado) && !t.autoArchivado;

    // Solo considerar turnos Tarde (cerrados o auto-archivados con datos) o cierres en horario nocturno con datos
    const calificaComoNoche =
      (esTardeExplicito && (esCierreFormal || (t.autoArchivado && tieneDatos) || tieneDatos)) ||
      (!esTardeExplicito && esHoraNocturna && tieneDatos);

    if (!calificaComoNoche) continue;

    // Para la apertura de `hoyIso`, buscamos el cierre de la noche anterior (`fechaEfectiva < hoyIso`).
    // Excepción: si por algún motivo `fechaEfectiva === hoyIso` pero se cerró en la madrugada (<05:00) o noche (>=19:00)
    // y no existe otro turno de hoy, permitir evaluarlo si `fechaEfectiva` quedó en `hoyIso`.
    if (fechaEfectiva > hoyIso) continue;
    if (fechaEfectiva === hoyIso && !esHoraNocturna && t.fecha === hoyIso) {
      // Si es de hoy pero todavía no es de noche, solo permitirlo si es el único candidato
    }

    enriquecidos.push({
      original: {
        ...t,
        fecha: fechaEfectiva,
      },
      fechaEfectiva,
      esTardeExplicito,
      esCierreFormal,
      tieneDatos,
      sortTime: t.timestamp || `${fechaEfectiva}T${horaCierre || '23:59'}`,
    });
  }

  if (enriquecidos.length === 0) {
    return { turno: null, esDeAyer: false, diasAtras: null };
  }

  // Preferir estrictamente los turnos cuya fecha operativa sea anterior a `hoyIso` (ej: sábado a la noche para abrir el domingo)
  const anterioresAHoy = enriquecidos.filter((e) => e.fechaEfectiva < hoyIso);
  const pool = anterioresAHoy.length > 0 ? anterioresAHoy : enriquecidos;

  pool.sort((a, b) => {
    // 1) Fecha operativa más reciente primero (ej. sábado 2026-11-07 > viernes 2026-11-06)
    if (a.fechaEfectiva !== b.fechaEfectiva) {
      return b.fechaEfectiva.localeCompare(a.fechaEfectiva);
    }
    // 2) En la misma fecha, priorizar los que tienen datos reales cargados
    if (a.tieneDatos !== b.tieneDatos) {
      return a.tieneDatos ? -1 : 1;
    }
    // 3) En la misma fecha, priorizar turno explícitamente etiquetado como 'Tarde'
    if (a.esTardeExplicito !== b.esTardeExplicito) {
      return a.esTardeExplicito ? -1 : 1;
    }
    // 4) En la misma fecha, priorizar cierre formal sobre auto-archivado
    if (a.esCierreFormal !== b.esCierreFormal) {
      return a.esCierreFormal ? -1 : 1;
    }
    // 5) Más reciente por timestamp / hora de cierre
    return b.sortTime.localeCompare(a.sortTime);
  });

  const chosen = pool[0]?.original || null;
  if (!chosen) return { turno: null, esDeAyer: false, diasAtras: null };

  const dias = Math.round(
    (Date.parse(hoyIso + 'T00:00:00Z') - Date.parse(chosen.fecha + 'T00:00:00Z')) / 86400000
  );
  return {
    turno: chosen,
    esDeAyer: chosen.fecha === fechaMenosDias(hoyIso, 1),
    diasAtras: dias,
  };
}

