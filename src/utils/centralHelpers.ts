import { ProductoItem } from '../types/central';

export function slug(s: string): string {
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function normName(s: string): string {
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function productId(catId: string, prod: ProductoItem): string {
  if (prod.codigo && prod.codigo.trim() !== '') {
    return 'c-' + prod.codigo.trim();
  }
  return 'n-' + catId + '-' + slug(prod.nombre);
}

export function nf(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('es-AR');
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$ ' + Number(n).toLocaleString('es-AR');
}

export function fmtSignedMoney(n: number | null | undefined): string {
  if (n === 0 || n === null || n === undefined) return '$ 0';
  const absVal = Number(Math.abs(n)).toLocaleString('es-AR');
  return (n > 0 ? '+$ ' : '-$ ') + absVal;
}

/**
 * "Día operativo" (hora de Argentina): hasta las 05:00 todavía cuenta como el día anterior,
 * así un cierre del turno Tarde pasada la medianoche queda en el día en que empezó el turno.
 */
export const CORTE_DIA_OPERATIVO_HS = 5;
export function todayKey(now: Date = new Date()): string {
  const ajustada = new Date(now.getTime() - CORTE_DIA_OPERATIVO_HS * 3600 * 1000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ajustada);
  } catch {
    const d = ajustada;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
}

export function getArgentinaHour(now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    return isNaN(h) ? now.getHours() : h % 24;
  } catch {
    return now.getHours();
  }
}

/**
 * Sugiere automáticamente el turno activo según la hora de Argentina y si el turno Mañana de hoy ya cerró:
 * - Entre las 05:00 y las 16:59 -> 'Mañana' (salvo que Mañana de hoy ya figure cerrado, en cuyo caso pasa a 'Tarde').
 * - Desde las 17:00 hasta las 04:59 -> 'Tarde'.
 */
export function suggestedTurnoForNow(pastTurnos?: { fecha?: string; turno?: string; cerrado?: boolean; autoArchivado?: boolean }[]): 'Mañana' | 'Tarde' {
  const h = getArgentinaHour();
  if (h >= 17 || h < CORTE_DIA_OPERATIVO_HS) {
    return 'Tarde';
  }
  const hoy = todayKey();
  if (Array.isArray(pastTurnos) && pastTurnos.some((t) => t && t.fecha === hoy && t.turno === 'Mañana' && t.cerrado && !t.autoArchivado)) {
    return 'Tarde';
  }
  return 'Mañana';
}


export function fmtDateLabel(k: string): string {
  const p = k.split('-');
  if (p.length < 3) return k;
  return p[2] + '/' + p[1] + '/' + p[0];
}

export function fmtFechaLarga(d: Date = new Date()): string {
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function fmtHora(d: Date = new Date()): string {
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function abrirWhatsApp(arg1: string, arg2?: string | null) {
  let texto = arg1;
  let numero = arg2;

  // Si el primer argumento es un número telefónico (ej. '5491169927352') y el segundo es el mensaje
  if (/^(\+?\d{8,16})$/.test((arg1 || '').trim()) && typeof arg2 === 'string') {
    numero = arg1;
    texto = arg2;
  }

  const txt = encodeURIComponent(texto || 'Stock Central Escobar');
  const cleanNumber = numero ? numero.replace(/[^\d]/g, '') : null;
  const url = cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${txt}`
    : `https://wa.me/?text=${txt}`;

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 100);
  } catch {
    window.open(url, '_blank');
  }
}

export function isAdminUser(emp?: { nombre?: string; rol?: string } | null): boolean {
  if (!emp) return false;
  const name = (emp.nombre || '').toLowerCase().trim();
  // Los únicos perfiles de dueños/admin son Charly y Luis, y el Admin técnico de soporte. El resto son empleados.
  return ['charly', 'carlos', 'luis', 'admin'].includes(name);
}
