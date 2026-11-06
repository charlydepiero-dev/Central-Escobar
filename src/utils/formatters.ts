// Formateador de moneda en pesos argentinos / locales
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

// Formateador de números estándar con separador de miles
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-AR').format(num);
}

// Formateador de fecha corta (ej: "Lun 06 Oct")
export function formatDateShort(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

// Formateador de hora (ej: "20:45")
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

// Formateador de fecha completa y hora
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

// Helper para calcular docenas equivalentes
export function formatDozens(units: number): string {
  const dozens = Math.floor(units / 12);
  const remainder = units % 12;
  if (dozens === 0) return `${units} u.`;
  if (remainder === 0) return `${dozens} doc. (${units} u.)`;
  return `${dozens} doc. + ${remainder} u. (${units} u.)`;
}
