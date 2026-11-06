/**
 * Persistencia del estado de la app en Google Drive (vía Apps Script).
 * Cloud Run / AI Studio borran los archivos del servidor en cada reinicio; por eso
 * el estado (cierres, conteos, caja, empleados) se respalda en un archivo de Drive y se
 * vuelve a leer al arrancar.
 */

export interface DriveSyncConfig {
  url: string; // URL /exec del Apps Script
  secret: string; // misma clave que CLAVE en el Apps Script
}

async function callScript(cfg: DriveSyncConfig, body: any, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, secret: cfg.secret }),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Respuesta no válida del script (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

/** Lee el último estado guardado en Drive. Devuelve null si no hay nada guardado. */
export async function pullStateFromDrive(cfg: DriveSyncConfig): Promise<{ state: any; savedAt: string } | null> {
  const r = await callScript(cfg, { action: 'loadState' }, 20000);
  if (!r?.ok) throw new Error(r?.error || 'El script no pudo leer el estado');
  if (!r.state) return null;
  const parsed = typeof r.state === 'string' ? JSON.parse(r.state) : r.state;
  return { state: parsed, savedAt: String(parsed?._savedAt || r.savedAt || '') };
}

/** Guarda el estado completo en Drive. */
export async function pushStateToDrive(cfg: DriveSyncConfig, stateJson: string): Promise<void> {
  const r = await callScript(cfg, { action: 'saveState', state: stateJson }, 25000);
  if (!r?.ok) throw new Error(r?.error || 'El script no pudo guardar el estado');
}

/** Guardado con retraso (agrupa varios cambios seguidos) y de a uno por vez. */
export function createDebouncedPusher(
  getCfg: () => DriveSyncConfig | null,
  getJson: () => string,
  delayMs = 3000,
  onResult?: (ok: boolean, error?: string) => void
) {
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;
  let dirty = false;

  async function run() {
    const cfg = getCfg();
    if (!cfg) { dirty = false; return; }
    if (inFlight) return; // se reintenta al terminar
    dirty = false;
    inFlight = pushStateToDrive(cfg, getJson())
      .then(() => {
        console.log('[DriveSync] Estado guardado en Google Drive.');
        onResult?.(true);
      })
      .catch((e) => {
        dirty = true; // reintentar en el próximo cambio / timer
        console.warn('[DriveSync] No se pudo guardar en Drive:', e?.message || e);
        onResult?.(false, String(e?.message || e));
      })
      .finally(() => {
        inFlight = null;
        if (dirty) schedule(delayMs * 3);
      });
    await inFlight;
  }

  function schedule(ms = delayMs) {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, ms);
  }

  /** Guardado inmediato (para cuando el servidor se apaga). */
  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) await inFlight;
    await run();
  }

  return { schedule, flush };
}
