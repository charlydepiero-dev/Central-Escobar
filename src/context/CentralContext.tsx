import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CategoriaCatalogo,
  MapaSistemaStock,
  MapaConteos,
  MapaReclamos,
  CierreCajaData,
  Empleado,
  TurnoCierre,
  ReaperturaInfo,
  AperturaTurnoInfo,
  ActiveTab,
  ReportMode,
  AperturaDiaData,
} from '../types/central';
import {
  INITIAL_CATALOGO,
  INITIAL_SISTEMA_STOCK,
  INITIAL_CONTEO,
  INITIAL_CIERRE_CAJA,
  INITIAL_RECLAMOS,
  INITIAL_EMPLEADOS,
} from '../data/centralData';
import { todayKey, fmtHora, fmtFechaLarga, productId, slug, normName, isAdminUser } from '../utils/centralHelpers';
import { normalizeSistemaStock, normalizeConteos, turnoSortKey, pickReferenciaTarde } from '../utils/snapshotNormalizer';

interface CentralContextType {
  // Navigation & Session
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  reportMode: ReportMode;
  setReportMode: (mode: ReportMode) => void;
  currentEmpleado: Empleado | null;
  currentTurno: 'Mañana' | 'Tarde';
  cambiarTurnoActual: (nuevoTurno: 'Mañana' | 'Tarde') => Promise<void>;
  currentFecha: string;
  horaInicio: string;
  turnoCerrado: boolean;
  reaperturaInfo: ReaperturaInfo | null;
  
  // Shift Opening & Multi-user state (Puntos 1, 2, 3, 4, 8)
  turnoAbierto: boolean;
  aperturaInfo: AperturaTurnoInfo | null;
  abrirTurno: (datos: {
    fecha: string;
    turno: 'Mañana' | 'Tarde';
    efectivoConvalidado: number;
    efectivoAnteriorEsperado: number;
    observaciones: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  ultimoTurnoCerrado: TurnoCierre | null;
  ultimoTurnoNoche: TurnoCierre | null;
  efectivoNocheEsperado: number;
  isAperturaModalOpen: boolean;
  setIsAperturaModalOpen: (open: boolean) => void;

  // Apertura del Día
  aperturasDia: AperturaDiaData[];
  ultimaAperturaDia: AperturaDiaData | null;
  serverTurnoNoche: TurnoCierre | null;
  fetchAperturaDia: () => Promise<void>;
  guardarAperturaDia: (data: AperturaDiaData) => Promise<{ ok: boolean; error?: string }>;
  
  // Data
  catalogo: CategoriaCatalogo[];
  sistemaStock: MapaSistemaStock;
  conteoActual: MapaConteos;
  reclamos: MapaReclamos;
  cierreCaja: CierreCajaData;
  pastTurnos: TurnoCierre[];
  empleados: Empleado[];
  resetearConteosTurno: () => Promise<void>;
  
  // Auth & Session
  loginWithPin: (pin: string, turno: 'Mañana' | 'Tarde', nombreEmpleado?: string) => Promise<{ ok: boolean; empleado?: Empleado; error?: string }>;
  logout: () => void;
  
  // Reclamos (Claiming / Lock concurrency)
  reclamarCategoria: (catId: string) => Promise<{ ok: boolean; motivo?: string }>;
  liberarCategoria: (catId: string) => Promise<{ ok: boolean; motivo?: string }>;
  liberarTodosLosReclamos: () => Promise<{ ok: boolean; count: number }>;
  pedirReaperturaCategoria: (catId: string) => { ok: boolean; mensaje: string };
  
  // Conteo
  guardarConteoCategoria: (catId: string, items: { productId: string; ubicaciones: Record<string, number> }[], terminar?: boolean) => void;
  actualizarConteoItem: (productId: string, ubicacion: string, valor: number) => void;
  
  // Caja
  actualizarCierreCajaLive: (datos: Partial<CierreCajaData>, terminado?: boolean) => void;
  guardarCierreCaja: (datos: Omit<CierreCajaData, 'existe' | 'empleado' | 'hora'>) => void;
  borrarCierreCaja: () => boolean;
  
  // Turno Flow
  verificarCierreTurno: () => { puedeCerrar: boolean; motivo?: string; faltantes?: string[] };
  marcarTerminado: () => { ok: boolean; puedeCerrar: boolean; faltantes?: string[] };
  cerrarTurnoDefinitivo: (overrideCaja?: Partial<CierreCajaData>, overrideConteos?: MapaConteos) => { ok: boolean; motivo?: string; reporteTexto?: string; nuevoTurno?: TurnoCierre };
  forzarCierreTurno: (overrideCaja?: Partial<CierreCajaData>, overrideConteos?: MapaConteos) => { ok: boolean; reporteTexto?: string; nuevoTurno?: TurnoCierre };
  reabrirTurno: () => { ok: boolean; motivo?: string };
  actualizarTurnoHistorico: (fecha: string, turno: string, updates: { conteos?: MapaConteos; sistemaStock?: any; cierreCaja?: any }, pinAdmin: string) => Promise<{ ok: boolean; motivo?: string }>;
  
  // Admin & Catalog
  crearEmpleado: (nombre: string, pin: string, rol?: 'admin' | 'empleado') => { ok: boolean; motivo?: string };
  cambiarPinEmpleado: (nombre: string, nuevoPin: string) => { ok: boolean; motivo?: string };
  toggleActivoEmpleado: (nombre: string) => { ok: boolean };
  eliminarEmpleado: (nombre: string) => { ok: boolean; motivo?: string };
  desbloquearEmpleado: (nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  reiniciarDatosTurnoActual: () => { ok: boolean; motivo?: string };
  agregarProducto: (catId: string, nombre: string, codigo?: string) => void;
  crearCategoria: (nombre: string, ubicaciones: string[]) => void;
  importarStockDatalive: (rows: { codigo: string; nombre: string; stock: number }[]) => { matched: number; unmatched: string[] };
  forzarSincronizacionDatalive: (config?: { scriptUrl?: string; usuario?: string; clave?: string; token?: string; apiEndpoint?: string }) => Promise<{ ok: boolean; total: number; motivo?: string }>;
  resetDemoData: () => void;

  // Selected shift for modal
  resumenModalData: { visible: boolean; reporteTexto: string; fecha: string; turno: string; pdfUrl?: string } | null;
  setResumenModalData: (data: { visible: boolean; reporteTexto: string; fecha: string; turno: string; pdfUrl?: string } | null) => void;
}

const STORAGE_KEYS = {
  CATALOGO: 'central_esco_catalogo_v11',
  STOCK: 'central_esco_stock_v11',
  CONTEO: 'central_esco_conteo_v11',
  RECLAMOS: 'central_esco_reclamos_v11',
  CAJA: 'central_esco_caja_v11',
  EMPLEADOS: 'central_esco_empleados_v11',
  TURNOS: 'central_esco_turnos_v11',
  REAPERTURA: 'central_esco_reapertura_v11',
  SESSION: 'central_esco_session_v11',
};

function safeGetWithFallback<T>(key: string, olderKeys: string[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed) return parsed;
    }
    for (const oldKey of olderKeys) {
      const oldSaved = localStorage.getItem(oldKey);
      if (oldSaved) {
        const parsed = JSON.parse(oldSaved);
        if (parsed) return parsed;
      }
    }
    return fallback;
  } catch (e) {
    console.warn(`Error parsing ${key} from localStorage, using fallback:`, e);
    return fallback;
  }
}

function mergeCatalogoWithInitial(_saved: CategoriaCatalogo[], initial: CategoriaCatalogo[]): CategoriaCatalogo[] {
  // Always enforce the strict canonical INITIAL_CATALOGO from centralData.ts
  // so that items not highlighted in yellow in the owner's Excel are strictly excluded.
  return initial;
}

function mergeStockWithInitial(saved: MapaSistemaStock, initial: MapaSistemaStock): MapaSistemaStock {
  const merged: MapaSistemaStock = { ...initial };
  if (saved && typeof saved === 'object') {
    Object.keys(saved).forEach((k) => {
      // Only keep keys that exist in initial catalog (the yellow items)
      if (initial[k] && typeof saved[k]?.stock === 'number') {
        merged[k] = saved[k];
      }
    });
  }
  return merged;
}

const CentralContext = createContext<CentralContextType | undefined>(undefined);

export const CentralProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('contar');
  const [reportMode, setReportMode] = useState<ReportMode>('resumen');
  
  // Session states
  const [currentEmpleado, setCurrentEmpleado] = useState<Empleado | null>(() => {
    try {
      const saved = safeGetWithFallback<any>(STORAGE_KEYS.SESSION, ['central_esco_session_v4', 'central_esco_session_v3'], null);
      return saved?.empleado || null;
    } catch (e) {
      // ignore
    }
    return null; // Prompt PIN on start
  });

  const [currentTurno, setCurrentTurno] = useState<'Mañana' | 'Tarde'>(() => {
    try {
      const saved = safeGetWithFallback<any>(STORAGE_KEYS.SESSION, ['central_esco_session_v4', 'central_esco_session_v3'], null);
      if (saved?.turno === 'Mañana' || saved?.turno === 'Tarde') {
        return saved.turno;
      }
    } catch (e) {
      // ignore
    }
    return 'Tarde';
  });

  // Strict session and shift refs to avoid stale closure issues during periodic background sync
  const currentEmpleadoRef = useRef<Empleado | null>(currentEmpleado);
  currentEmpleadoRef.current = currentEmpleado;
  const currentTurnoRef = useRef<'Mañana' | 'Tarde'>(currentTurno);
  currentTurnoRef.current = currentTurno;
  const locallyClaimedCatsRef = useRef<Set<string>>(new Set());
  const reclamosLiberadosAtRef = useRef<Record<string, number>>({});

  const [currentFecha, setCurrentFecha] = useState<string>(todayKey());
  const [horaInicio, setHoraInicio] = useState<string>(() => fmtHora());
  const [turnoCerrado, setTurnoCerrado] = useState(false);
  const [reaperturaInfo, setReaperturaInfo] = useState<ReaperturaInfo | null>(null);

  // Shift Opening & Multi-user state (Puntos 1, 2, 3, 4, 8)
  const [turnoAbierto, setTurnoAbierto] = useState<boolean>(true);
  const [aperturaInfo, setAperturaInfo] = useState<AperturaTurnoInfo | null>(null);
  const [isAperturaModalOpen, setIsAperturaModalOpen] = useState<boolean>(false);
  const [ignoreSyncTurno, setIgnoreSyncTurno] = useState<boolean>(false);

  // Core Data with guaranteed valid fallbacks and intelligent merge
  const [catalogo, setCatalogo] = useState<CategoriaCatalogo[]>(() => {
    const list = safeGetWithFallback<CategoriaCatalogo[]>(
      STORAGE_KEYS.CATALOGO,
      ['central_esco_catalogo_v7', 'central_esco_catalogo_v6', 'central_esco_catalogo_v5'],
      INITIAL_CATALOGO
    );
    return mergeCatalogoWithInitial(list, INITIAL_CATALOGO);
  });

  const [sistemaStock, setSistemaStock] = useState<MapaSistemaStock>(() => {
    const saved = safeGetWithFallback<MapaSistemaStock>(
      STORAGE_KEYS.STOCK,
      ['central_esco_stock_v7', 'central_esco_stock_v6'],
      INITIAL_SISTEMA_STOCK
    );
    return mergeStockWithInitial(saved, INITIAL_SISTEMA_STOCK);
  });

  // Punto 1: Conteo arranca en 0 en cada turno limpio
  const [conteoActual, setConteoActual] = useState<MapaConteos>(() => {
    const saved = safeGetWithFallback<MapaConteos>(STORAGE_KEYS.CONTEO, [], INITIAL_CONTEO);
    return saved && typeof saved === 'object' ? saved : {};
  });

  // Punto 1 y 4: Reclamos arrancan libres (en 0)
  const [reclamos, setReclamos] = useState<MapaReclamos>(() => {
    const saved = safeGetWithFallback<MapaReclamos>(STORAGE_KEYS.RECLAMOS, [], INITIAL_RECLAMOS);
    return saved && typeof saved === 'object' ? saved : {};
  });

  // Punto 1: Cierre de caja arranca limpio en 0
  const [cierreCaja, setCierreCaja] = useState<CierreCajaData>(() => {
    const saved = safeGetWithFallback<CierreCajaData>(STORAGE_KEYS.CAJA, [], INITIAL_CIERRE_CAJA);
    return saved && typeof saved === 'object' ? saved : INITIAL_CIERRE_CAJA;
  });

  const [empleados, setEmpleados] = useState<Empleado[]>(() => {
    return safeGetWithFallback(
      STORAGE_KEYS.EMPLEADOS,
      ['central_esco_empleados_v7', 'central_esco_empleados_v6', 'central_esco_empleados_v5'],
      INITIAL_EMPLEADOS
    );
  });

  // FIX: el historial arranca SOLO con lo que realmente se guardó (localStorage / servidor).
  // Antes se inyectaban turnos y conteos fijos de "Fati" y se pisaba el efectivo del 14/10.
  const [pastTurnos, setPastTurnos] = useState<TurnoCierre[]>(() => {
    const raw = safeGetWithFallback<TurnoCierre[]>(STORAGE_KEYS.TURNOS, [], []);
    const list = Array.isArray(raw) ? raw : [];
    return [...list].sort((a: any, b: any) => turnoSortKey(b).localeCompare(turnoSortKey(a)));
  });

  const [resumenModalData, setResumenModalData] = useState<{
    visible: boolean;
    reporteTexto: string;
    fecha: string;
    turno: string;
    pdfUrl?: string;
  } | null>(null);

  const ultimoTurnoCerrado: TurnoCierre | null = useMemo(() => {
    return pastTurnos.find((t) => t.cerrado) || pastTurnos[0] || null;
  }, [pastTurnos]);

  // Servidor / Datalive caja de noche anterior
  const [serverTurnoNoche, setServerTurnoNoche] = useState<TurnoCierre | null>(null);

  // Último turno cerrado del tipo "Tarde" (noche anterior)
  // Siempre ordenar por fecha descendente para garantizar que traiga el de la noche más reciente (14/10 > 13/10)
  const ultimoTurnoNoche: TurnoCierre | null = useMemo(() => {
    // Una sola regla (compartida con el servidor): último turno TARDE cerrado formalmente.
    const todos: TurnoCierre[] = [...pastTurnos];
    if (serverTurnoNoche && !todos.some((t) => t.fecha === serverTurnoNoche.fecha && t.turno === serverTurnoNoche.turno)) {
      todos.push(serverTurnoNoche);
    }
    const { turno: chosen } = pickReferenciaTarde(todos, currentFecha);
    if (!chosen) return null;
    return {
      ...chosen,
      conteos: normalizeConteos(chosen.conteos),
      sistemaStock: normalizeSistemaStock(chosen.sistemaStock),
    };
  }, [serverTurnoNoche, pastTurnos, currentFecha]);

  const efectivoNocheEsperado: number = useMemo(() => {
    if (ultimoTurnoNoche?.cierreCaja) {
      const val = Number(ultimoTurnoNoche.cierreCaja.efectivo_real ?? ultimoTurnoNoche.cierreCaja.efectivo_mostrador_sist);
      if (!isNaN(val) && val > 0) {
        return val;
      }
    }
    return 0;
  }, [ultimoTurnoNoche]);

  // Apertura del Día state y persistencia
  const [aperturasDia, setAperturasDia] = useState<AperturaDiaData[]>([]);
  const [ultimaAperturaDia, setUltimaAperturaDia] = useState<AperturaDiaData | null>(null);

  const fetchAperturaDia = useCallback(async () => {
    try {
      const res = await fetch('/api/apertura-dia');
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (Array.isArray(data.aperturas)) {
            setAperturasDia(data.aperturas);
          }
          if (data.ultimaApertura) {
            setUltimaAperturaDia(data.ultimaApertura);
          } else {
            setUltimaAperturaDia(null);
          }
          if (!data.ultimoTurnoNoche) setServerTurnoNoche(null);
          if (data.ultimoTurnoNoche) {
            setServerTurnoNoche(data.ultimoTurnoNoche);
            setPastTurnos((prev) => {
              const cleaned = prev;
              const exists = cleaned.some((p) => p.fecha === data.ultimoTurnoNoche.fecha && p.turno === data.ultimoTurnoNoche.turno);
              const merged = exists
                ? cleaned.map((p) => (p.fecha === data.ultimoTurnoNoche.fecha && p.turno === data.ultimoTurnoNoche.turno) ? data.ultimoTurnoNoche : p)
                : [data.ultimoTurnoNoche, ...cleaned];
              return merged.sort((a, b) => b.fecha.localeCompare(a.fecha));
            });
          }
          if (data.sistemaStock && Object.keys(data.sistemaStock).length > 0) {
            setSistemaStock((prev) => ({ ...prev, ...normalizeSistemaStock(data.sistemaStock) }));
          }
        }
      }
    } catch (e) {
      console.warn('[CentralContext] Error consultando apertura-dia:', e);
    }
  }, []);

  const guardarAperturaDia = async (data: AperturaDiaData): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/apertura-dia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (resData.ok) {
        setUltimaAperturaDia(resData.apertura);
        if (Array.isArray(resData.aperturas)) setAperturasDia(resData.aperturas);
        setTurnoAbierto(true);
        setAperturaInfo({
          fecha: resData.apertura.fecha,
          turno: 'Mañana',
          abierto: true,
          abierto_por: resData.apertura.empleado,
          hora_apertura: resData.apertura.hora,
          efectivo_anterior_esperado: resData.apertura.efectivoAnteriorEsperado,
          efectivo_convalidado: resData.apertura.efectivoContadoApertura,
          diferencia_apertura: resData.apertura.diferenciaEfectivo,
          observaciones: resData.apertura.observacionesCaja,
        });
        return { ok: true };
      }
      return { ok: false, error: resData.error || 'Error al guardar apertura' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Error de conexión' };
    }
  };

  // Cambiar turno actual y persistir en servidor + localStorage
  const cambiarTurnoActual = async (nuevoTurno: 'Mañana' | 'Tarde') => {
    setCurrentTurno(nuevoTurno);
    currentTurnoRef.current = nuevoTurno;

    // Al cambiar de turno, los conteos y reclamos arrancan estrictamente en 0 para todos los turnos
    setConteoActual({});
    setReclamos({});
    locallyClaimedCatsRef.current.clear();
    try {
      localStorage.removeItem('central_esco_contar_drafts');
      localStorage.removeItem(STORAGE_KEYS.CONTEO);
      localStorage.removeItem(STORAGE_KEYS.RECLAMOS);
    } catch {}

    // Si el usuario cambia al Turno Tarde y estaba en Apertura, redirigir a Contar (Apertura es solo para Mañana)
    if (nuevoTurno === 'Tarde' && activeTab === 'apertura') {
      setActiveTab('contar');
    }

    try {
      const emp = currentEmpleadoRef.current;
      localStorage.setItem(
        STORAGE_KEYS.SESSION,
        JSON.stringify({ empleado: emp, turno: nuevoTurno, fecha: currentFecha })
      );
    } catch {}
    try {
      await fetch('/api/turno/set-turno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turno: nuevoTurno, fecha: currentFecha, resetConteos: true }),
      });
    } catch (err) {
      console.warn('Error syncing turno change to server:', err);
    }
  };

  // Función explícita para limpiar todos los conteos del turno actual a 0
  const resetearConteosTurno = async () => {
    setConteoActual({});
    setReclamos({});
    locallyClaimedCatsRef.current.clear();
    try {
      localStorage.removeItem('central_esco_contar_drafts');
      localStorage.removeItem(STORAGE_KEYS.CONTEO);
      localStorage.removeItem(STORAGE_KEYS.RECLAMOS);
    } catch {}
    try {
      await fetch('/api/turno/reset-conteos', { method: 'POST' });
    } catch (e) {
      console.warn('Error resetting conteos on server:', e);
    }
  };

  // Sincronización multiusuario en tiempo real con el servidor (Puntos 1, 4, 8)
  const sincronizarConServidor = useCallback(async () => {
    try {
      const res = await fetch('/api/turno/state');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;

      if (data.reclamos !== undefined) {
        setReclamos((prev) => {
          const merged = { ...data.reclamos };
          const emp = currentEmpleadoRef.current;
          if (emp) {
            // Solo blindar categorías reclamadas activamente en esta sesión mientras el servidor responde
            locallyClaimedCatsRef.current.forEach((catId) => {
              if (prev[catId] && !merged[catId]) {
                merged[catId] = prev[catId];
              }
            });
          }
          return merged;
        });
      }

      if (data.turnoActivo) {
        setTurnoAbierto(!!data.turnoActivo.abierto);
        if (data.turnoActivo.cerrado !== undefined) {
          setTurnoCerrado(!!data.turnoActivo.cerrado);
        }
        const today = todayKey();
        if (data.turnoActivo.fecha && data.turnoActivo.fecha >= today) {
          setCurrentFecha(data.turnoActivo.fecha);
        } else {
          setCurrentFecha(today);
        }
        // SOLUCIÓN DEFINITIVA TURNO: Si el usuario ya inició sesión o seleccionó turno,
        // su turno es inmutable y JAMÁS puede ser pisado por el poller de fondo a 'Mañana'.
        if (!currentEmpleadoRef.current && !localStorage.getItem(STORAGE_KEYS.SESSION) && data.turnoActivo.turno) {
          setCurrentTurno(data.turnoActivo.turno);
          currentTurnoRef.current = data.turnoActivo.turno;
        }
        if (data.turnoActivo.apertura) {
          setAperturaInfo({
            fecha: data.turnoActivo.fecha,
            turno: currentTurnoRef.current || data.turnoActivo.turno,
            abierto: !!data.turnoActivo.abierto,
            abierto_por: data.turnoActivo.abierto_por || 'Colaborador',
            hora_apertura: data.turnoActivo.hora_apertura || '',
            efectivo_anterior_esperado: data.turnoActivo.apertura.efectivo_anterior_esperado || 0,
            efectivo_convalidado: data.turnoActivo.apertura.efectivo_convalidado || 0,
            diferencia_apertura: data.turnoActivo.apertura.diferencia_apertura || 0,
            observaciones: data.turnoActivo.apertura.observaciones || '',
          });
        }
      }

      if (data.conteoActual !== undefined) {
        setConteoActual(data.conteoActual || {});
      }

      if (data.cierreCaja !== undefined) {
        if (!data.cierreCaja.existe) {
          // Si el usuario local reclamó o está cargando caja, no pisar a 0
          if (!locallyClaimedCatsRef.current.has('caja')) {
            setCierreCaja((prev) => {
              if (!prev.existe) {
                return prev;
              }
              return {
                existe: false,
                fecha: currentFecha,
                turno: currentTurnoRef.current || 'Mañana',
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
            });
          }
        } else {
          setCierreCaja((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(data.cierreCaja)) return prev;
            return data.cierreCaja;
          });
        }
      }

      if (data.sistemaStock && Object.keys(data.sistemaStock).length > 0) {
        setSistemaStock((prev) => {
          const incoming = normalizeSistemaStock(data.sistemaStock);
          const merged = { ...prev, ...incoming };
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          return merged;
        });
      }

      // FIX: el SERVIDOR es la fuente de verdad del historial. Antes se ignoraba una lista vacía y se
      // mezclaba con la copia vieja del navegador, por lo que lo borrado en el servidor reaparecía
      // (en cada celular). Solo se conservan cierres locales muy recientes que el servidor aún no devolvió.
      if (Array.isArray(data.pastTurnos)) {
        setPastTurnos((prev) => {
          const map = new Map<string, TurnoCierre>();
          data.pastTurnos.forEach((t: TurnoCierre) => {
            const k = t.id || `${t.fecha}_${t.turno}_${t.hora_cierre}`;
            map.set(k, { ...t, id: k });
          });
          const hace3min = Date.now() - 3 * 60 * 1000;
          prev.forEach((t) => {
            const k = t.id || `${t.fecha}_${t.turno}_${t.hora_cierre}`;
            const reciente = t.timestamp ? Date.parse(t.timestamp) > hace3min : false;
            if (!map.has(k) && reciente) map.set(k, { ...t, id: k });
          });
          const merged = Array.from(map.values()).sort((a, b) => {
            const timeA = a.timestamp || `${a.fecha}T${a.hora_cierre || '00:00'}`;
            const timeB = b.timestamp || `${b.fecha}T${b.hora_cierre || '00:00'}`;
            return timeB.localeCompare(timeA);
          });
          return merged;
        });
      }
    } catch {
      // Ignorar errores transitorios de red
    }
  }, [currentEmpleado]);

  useEffect(() => {
    sincronizarConServidor();
    const interval = setInterval(() => {
      sincronizarConServidor();
    }, 4000);
    return () => clearInterval(interval);
  }, [sincronizarConServidor]);

  useEffect(() => {
    fetchAperturaDia();
  }, [fetchAperturaDia]);

  // LocalStorage Persistence
  useEffect(() => {
    // Sync employees from server storage on startup
    fetch('/api/admin/empleados')
      .then((res) => (res.ok ? res.json() : null))
      .then((serverEmps) => {
        if (Array.isArray(serverEmps) && serverEmps.length > 0) {
          setEmpleados(serverEmps);
        }
      })
      .catch((err) => console.log('[CentralContext] Using local employees fallback:', err));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CATALOGO, JSON.stringify(catalogo));
  }, [catalogo]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK, JSON.stringify(sistemaStock));
  }, [sistemaStock]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONTEO, JSON.stringify(conteoActual));
  }, [conteoActual]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(reclamos));
  }, [reclamos]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CAJA, JSON.stringify(cierreCaja));
  }, [cierreCaja]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EMPLEADOS, JSON.stringify(empleados));
  }, [empleados]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TURNOS, JSON.stringify(pastTurnos));
  }, [pastTurnos]);

  useEffect(() => {
    if (currentEmpleado) {
      localStorage.setItem(
        STORAGE_KEYS.SESSION,
        JSON.stringify({ empleado: currentEmpleado, turno: currentTurno, fecha: currentFecha })
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  }, [currentEmpleado, currentTurno, currentFecha]);

  // Auth & PIN Login (Strict and confidential: supports matching user + PIN)
  const loginWithPin = async (
    pin: string,
    turno: 'Mañana' | 'Tarde',
    nombreEmpleado?: string
  ): Promise<{ ok: boolean; empleado?: Empleado; error?: string }> => {
    const rawPin = pin.trim();
    const cleanPin = rawPin.length <= 4 ? rawPin.padStart(4, '0') : rawPin;

    // 1. Try server verification first
    if (nombreEmpleado) {
      try {
        const resp = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombreEmpleado, pin: cleanPin, turno }),
        });
        const data = await resp.json();
        if (resp.ok && data.ok && data.empleado) {
          const verifiedEmp: Empleado = {
            nombre: data.empleado.nombre,
            pin: cleanPin,
            activo: true,
            rol: ['charly', 'carlos', 'luis', 'admin'].includes(data.empleado.nombre.toLowerCase()) ? 'admin' : 'empleado',
            bloqueado: false,
          };
          setCurrentEmpleado(verifiedEmp);
          currentEmpleadoRef.current = verifiedEmp;
          setCurrentTurno(turno);
          currentTurnoRef.current = turno;
          try {
            localStorage.setItem(
              STORAGE_KEYS.SESSION,
              JSON.stringify({ empleado: verifiedEmp, turno, fecha: currentFecha })
            );
          } catch {}
          cambiarTurnoActual(turno);
          setHoraInicio(fmtHora());
          return { ok: true, empleado: verifiedEmp };
        } else if (data.bloqueado) {
          return {
            ok: false,
            error: data.error || `El usuario ${nombreEmpleado} está bloqueado por seguridad tras 3 intentos fallidos. Debe ser desbloqueado por otro administrador.`,
          };
        } else if (resp.status === 401 || (!data.ok && data.error)) {
          return { ok: false, error: data.error || `PIN incorrecto para ${nombreEmpleado}.` };
        }
      } catch (err) {
        console.warn('[CentralContext] Server auth fallback to local:', err);
      }
    }

    // 2. Local fallback check
    const empTarget = nombreEmpleado
      ? empleados.find((e) => e.nombre.toLowerCase() === nombreEmpleado.toLowerCase())
      : null;

    if (empTarget && empTarget.bloqueado) {
      return {
        ok: false,
        error: `El usuario ${empTarget.nombre} está bloqueado por seguridad tras 3 intentos fallidos. Debe ser desbloqueado por otro administrador.`,
      };
    }

    const emp = empleados.find((e) => {
      if (nombreEmpleado) {
        return (
          e.nombre.toLowerCase() === nombreEmpleado.toLowerCase() &&
          (e.pin === cleanPin || e.pin === rawPin) &&
          e.activo &&
          !e.bloqueado
        );
      }
      return (e.pin === cleanPin || e.pin === rawPin) && e.activo && !e.bloqueado;
    });

    if (emp) {
      const rol: 'admin' | 'empleado' = ['charly', 'carlos', 'luis', 'admin'].includes(emp.nombre.toLowerCase()) ? 'admin' : 'empleado';
      const fullEmp: Empleado = { ...emp, rol };
      setCurrentEmpleado(fullEmp);
      currentEmpleadoRef.current = fullEmp;
      setCurrentTurno(turno);
      currentTurnoRef.current = turno;
      try {
        localStorage.setItem(
          STORAGE_KEYS.SESSION,
          JSON.stringify({ empleado: fullEmp, turno, fecha: currentFecha })
        );
      } catch {}
      cambiarTurnoActual(turno);
      setHoraInicio(fmtHora());
      return { ok: true, empleado: fullEmp };
    }

    return {
      ok: false,
      error: nombreEmpleado
        ? `PIN incorrecto para ${nombreEmpleado}.`
        : 'PIN incorrecto o empleado inactivo.',
    };
  };

  const logout = () => {
    setCurrentEmpleado(null);
    currentEmpleadoRef.current = null;
    setIgnoreSyncTurno(false);
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    } catch {}
  };

  // Shift Opening (Punto 2 & Punto 3)
  const abrirTurno = async (datos: {
    fecha: string;
    turno: 'Mañana' | 'Tarde';
    efectivoConvalidado: number;
    efectivoAnteriorEsperado: number;
    observaciones: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const resp = await fetch('/api/turno/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...datos,
          empleado: currentEmpleado?.nombre || 'Colaborador',
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        return { ok: false, error: errJson.error || 'Error al abrir turno en el servidor' };
      }

      const resData = await resp.json();

      // Punto 1: En cada apertura/cambio de turno, TODOS los datos para cargar arrancan en 0
      setConteoActual({});
      setReclamos({});
      setCierreCaja({
        existe: false,
        fecha: datos.fecha,
        turno: datos.turno,
        postnet_amarillo: 0,
        postnet_rosa: 0,
        postnet_blanco: 0,
        online_local_sist: 0,
        efectivo_real: 0,
        efectivo_mostrador_sist: 0,
        observaciones: '',
        empleado: '',
        hora: '',
      });
      setTurnoCerrado(false);
      setReaperturaInfo(null);
      setCurrentFecha(datos.fecha);
      setCurrentTurno(datos.turno);
      setHoraInicio(fmtHora());
      setTurnoAbierto(true);
      setAperturaInfo({
        fecha: datos.fecha,
        turno: datos.turno,
        abierto: true,
        abierto_por: currentEmpleado?.nombre || 'Colaborador',
        hora_apertura: fmtHora(),
        efectivo_anterior_esperado: datos.efectivoAnteriorEsperado,
        efectivo_convalidado: datos.efectivoConvalidado,
        diferencia_apertura: datos.efectivoConvalidado - datos.efectivoAnteriorEsperado,
        observaciones: datos.observaciones || '',
      });

      if (resData.pastTurnos) {
        setPastTurnos(resData.pastTurnos);
      }

      return { ok: true };
    } catch (err: any) {
      console.error('[CentralContext] Error al abrir turno en servidor, fallback local:', err);
      setConteoActual({});
      setReclamos({});
      setCierreCaja({
        existe: false,
        fecha: datos.fecha,
        turno: datos.turno,
        postnet_amarillo: 0,
        postnet_rosa: 0,
        postnet_blanco: 0,
        online_local_sist: 0,
        efectivo_real: 0,
        efectivo_mostrador_sist: 0,
        observaciones: '',
        empleado: '',
        hora: '',
      });
      setTurnoCerrado(false);
      setReaperturaInfo(null);
      setCurrentFecha(datos.fecha);
      setCurrentTurno(datos.turno);
      setHoraInicio(fmtHora());
      setTurnoAbierto(true);
      setAperturaInfo({
        fecha: datos.fecha,
        turno: datos.turno,
        abierto: true,
        abierto_por: currentEmpleado?.nombre || 'Colaborador',
        hora_apertura: fmtHora(),
        efectivo_anterior_esperado: datos.efectivoAnteriorEsperado,
        efectivo_convalidado: datos.efectivoConvalidado,
        diferencia_apertura: datos.efectivoConvalidado - datos.efectivoAnteriorEsperado,
        observaciones: datos.observaciones || '',
      });
      return { ok: true };
    }
  };

  // Reclamos (Locks) - Sincronizados con el servidor (Puntos 4 y 8)
  const reclamarCategoria = async (catId: string): Promise<{ ok: boolean; motivo?: string }> => {
    if (!currentEmpleado) return { ok: false, motivo: 'Debes iniciar sesión con tu PIN.' };
    const empNombre = currentEmpleado.nombre.trim();
    const actual = reclamos[catId];
    const esAdmin = isAdminUser(currentEmpleado);

    if (actual && !esAdmin) {
      const mismoEmpleado = actual.empleado.trim().toLowerCase() === empNombre.toLowerCase();
      if (!mismoEmpleado && actual.terminado) {
        return {
          ok: false,
          motivo: `La contó ${actual.empleado}. Podés pedir reapertura o el Admin puede liberarla.`,
        };
      }
    }

    const hr = fmtHora();
    const updated: MapaReclamos = {
      ...reclamos,
      [catId]: {
        empleado: empNombre,
        hora: hr,
        terminado: false,
      },
    };
    locallyClaimedCatsRef.current.add(catId);
    setReclamos(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(updated));
    } catch {}

    try {
      const res = await fetch('/api/reclamos/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reclamar',
          catId,
          empleado: empNombre,
          hora: hr,
          esAdmin,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reclamos) {
          setReclamos(data.reclamos);
          try {
            localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(data.reclamos));
          } catch {}
        }
      }
    } catch (e) {
      console.log('Reclamo sync error:', e);
    }

    return { ok: true };
  };

  const liberarCategoria = async (catId: string): Promise<{ ok: boolean; motivo?: string }> => {
    if (!currentEmpleado) return { ok: false, motivo: 'Debes iniciar sesión.' };
    const empNombre = currentEmpleado.nombre.trim();
    const esAdmin = isAdminUser(currentEmpleado);

    locallyClaimedCatsRef.current.delete(catId);
    reclamosLiberadosAtRef.current[catId] = Date.now();
    // Inmediatamente liberar en el estado local para respuesta instantánea de la UI
    const copy = { ...reclamos };
    delete copy[catId];
    setReclamos(copy);
    try {
      localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(copy));
    } catch {}

    try {
      const res = await fetch('/api/reclamos/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'liberar',
          catId,
          empleado: empNombre,
          esAdmin,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reclamos) {
          setReclamos(data.reclamos);
          try {
            localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(data.reclamos));
          } catch {}
        }
      }
    } catch (e) {
      console.log('Liberar sync error:', e);
    }

    return { ok: true };
  };

  // Punto 4 & Punto 8: Liberación de todos los reclamos impacta inmediatamente en el servidor
  const liberarTodosLosReclamos = async (): Promise<{ ok: boolean; count: number }> => {
    const count = Object.keys(reclamos).length;
    locallyClaimedCatsRef.current.clear();
    Object.keys(reclamos).forEach((k) => {
      reclamosLiberadosAtRef.current[k] = Date.now();
    });
    setReclamos({});
    try {
      localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify({}));
    } catch {}

    try {
      const res = await fetch('/api/reclamos/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'liberar_todo',
          empleado: currentEmpleado?.nombre || 'Admin',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reclamos) {
          setReclamos(data.reclamos);
          try {
            localStorage.setItem(STORAGE_KEYS.RECLAMOS, JSON.stringify(data.reclamos));
          } catch {}
        }
      }
    } catch (e) {
      console.log('Liberar todo sync error:', e);
    }

    return { ok: true, count };
  };

  const pedirReaperturaCategoria = (catId: string): { ok: boolean; mensaje: string } => {
    const cat = catalogo.find((c) => c.id === catId);
    const catNombre = cat ? cat.nombre : catId === 'caja' ? 'Cierre de caja' : catId;

    // Liberar inmediatamente el bloqueo para permitir re-conteo y sincronizar con servidor
    const copy = { ...reclamos };
    delete copy[catId];
    setReclamos(copy);

    fetch('/api/reclamos/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reapertura',
        catId,
        empleado: currentEmpleado?.nombre || 'Colaborador',
        hora: fmtHora(),
      }),
    }).catch((e) => console.log('Reapertura sync error:', e));

    return {
      ok: true,
      mensaje: `Reapertura de ${catNombre} habilitada. Ya podés volver a contarla.`,
    };
  };

  // Conteo sincronizado con servidor
  const guardarConteoCategoria = (
    catId: string,
    items: { productId: string; ubicaciones: Record<string, number> }[],
    terminar: boolean = true
  ) => {
    if (!currentEmpleado) return;
    const hora = fmtHora();
    const updated = { ...conteoActual };

    items.forEach((item) => {
      updated[item.productId] = {
        ubic: item.ubicaciones,
        empleado: currentEmpleado.nombre,
        hora,
      };
    });

    setConteoActual(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.CONTEO, JSON.stringify(updated));
    } catch {}

    // Solo actualizar el reclamo si el bloque ya fue tomado o si se marca como terminado explícitamente
    setReclamos((prev) => {
      const existing = prev[catId];
      if (!existing && !terminar) {
        return prev;
      }
      locallyClaimedCatsRef.current.add(catId);
      return {
        ...prev,
        [catId]: {
          empleado: existing?.empleado || currentEmpleado.nombre,
          hora: existing?.hora || hora,
          terminado: terminar ? true : (existing?.terminado || false),
        },
      };
    });

    fetch('/api/conteo/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catId,
        items,
        empleado: currentEmpleado.nombre,
        hora,
        terminado: terminar,
        esAdmin: isAdminUser(currentEmpleado),
        soloActualizarConteo: !terminar && !reclamos[catId],
      }),
    }).catch((e) => console.log('Conteo save sync error:', e));
  };

  // Actualización inmediata individual de casillero para persistencia fluida sin bloquear al scrolear
  const actualizarConteoItem = (productId: string, ubicacion: string, valor: number) => {
    const hora = fmtHora();
    const empNombre = currentEmpleadoRef.current?.nombre || 'Colaborador';
    setConteoActual((prev) => {
      const currentEntry = prev[productId] || { ubic: {}, empleado: empNombre, hora };
      const updatedUbic = { ...currentEntry.ubic, [ubicacion]: valor };
      const updated = {
        ...prev,
        [productId]: {
          ...currentEntry,
          ubic: updatedUbic,
          empleado: empNombre,
          hora,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEYS.CONTEO, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Actualización en vivo de casilleros de caja sincronizada con servidor en tiempo real
  const actualizarCierreCajaLive = (datos: Partial<CierreCajaData>, terminado: boolean = false) => {
    if (!currentEmpleado) return;
    const empNombre = currentEmpleado.nombre.trim();
    const hora = fmtHora();
    const esAdmin = isAdminUser(currentEmpleado);

    // Auto-reclamo caja si está libre o es mía
    locallyClaimedCatsRef.current.add('caja');
    setReclamos((prev) => {
      const current = prev['caja'];
      if (!current || current.empleado === empNombre || esAdmin) {
        return {
          ...prev,
          caja: {
            empleado: current?.empleado || empNombre,
            hora: current?.hora || hora,
            terminado,
          },
        };
      }
      return prev;
    });

    setCierreCaja((prev) => {
      const updated: CierreCajaData = {
        ...prev,
        ...datos,
        existe: true,
        fecha: currentFecha,
        turno: currentTurno,
        empleado: prev.empleado || empNombre,
        hora: prev.hora || hora,
      };
      try {
        localStorage.setItem(STORAGE_KEYS.CAJA, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    fetch('/api/caja/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cajaData: {
          ...cierreCaja,
          ...datos,
          existe: true,
          fecha: currentFecha,
          turno: currentTurno,
          empleado: cierreCaja.empleado || empNombre,
          hora: cierreCaja.hora || hora,
        },
        terminado,
        esAdmin,
      }),
    }).catch((e) => console.log('Caja live sync error:', e));
  };

  // Caja sincronizada con servidor (cierre oficial del módulo)
  const guardarCierreCaja = (datos: Omit<CierreCajaData, 'existe' | 'empleado' | 'hora'>) => {
    if (!currentEmpleado) return;
    const hora = fmtHora();
    const esAdmin = isAdminUser(currentEmpleado);
    const nuevoCierre: CierreCajaData = {
      ...datos,
      existe: true,
      fecha: currentFecha,
      turno: currentTurno,
      empleado: currentEmpleado.nombre,
      hora,
    };
    setCierreCaja(nuevoCierre);
    try {
      localStorage.setItem(STORAGE_KEYS.CAJA, JSON.stringify(nuevoCierre));
    } catch {}

    // Auto-reclamo y marcar como terminada
    locallyClaimedCatsRef.current.add('caja');
    setReclamos((prev) => ({
      ...prev,
      caja: {
        empleado: currentEmpleado.nombre,
        hora,
        terminado: true,
      },
    }));

    fetch('/api/caja/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cajaData: nuevoCierre,
        terminado: true,
        esAdmin,
      }),
    }).catch((e) => console.log('Caja save sync error:', e));
  };

  const borrarCierreCaja = (): boolean => {
    const esAdmin = isAdminUser(currentEmpleado);
    setCierreCaja({
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
    });
    try {
      localStorage.removeItem(STORAGE_KEYS.CAJA);
    } catch {}
    locallyClaimedCatsRef.current.delete('caja');
    reclamosLiberadosAtRef.current['caja'] = Date.now();
    setReclamos((prev) => {
      const copy = { ...prev };
      delete copy.caja;
      return copy;
    });
    fetch('/api/reclamos/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'liberar',
        catId: 'caja',
        empleado: currentEmpleado?.nombre || '',
        esAdmin,
      }),
    }).catch(() => {});
    return true;
  };

  // Validar si el turno puede cerrarse
  const verificarCierreTurno = (): { puedeCerrar: boolean; motivo?: string; faltantes?: string[] } => {
    if (turnoCerrado) return { puedeCerrar: false, motivo: 'ya_cerrado' };

    // 1) Verificar que todas las categorías tengan datos
    const catsVisibles = catalogo.filter((c) => c.id !== 'adicionales');
    const faltantes: string[] = [];

    catsVisibles.forEach((cat) => {
      let tieneAlgo = false;
      for (const g of cat.grupos) {
        for (const p of g.productos) {
          const pid = productId(cat.id, p);
          if (conteoActual[pid] !== undefined) {
            tieneAlgo = true;
            break;
          }
        }
        if (tieneAlgo) break;
      }
      if (!tieneAlgo) {
        faltantes.push(cat.nombre);
      }
    });

    if (faltantes.length > 0) {
      return { puedeCerrar: false, motivo: 'categorias_faltantes', faltantes };
    }

    // 2) Verificar que la caja esté cerrada
    if (!cierreCaja.existe) {
      return { puedeCerrar: false, motivo: 'caja_faltante' };
    }

    return { puedeCerrar: true };
  };

  // Terminar mi conteo
  const marcarTerminado = (): { ok: boolean; puedeCerrar: boolean; faltantes?: string[] } => {
    if (!currentEmpleado) return { ok: false, puedeCerrar: false };

    // Marcar las categorías del empleado como terminadas
    setReclamos((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((catId) => {
        if (updated[catId].empleado === currentEmpleado.nombre) {
          updated[catId] = { ...updated[catId], terminado: true };
        }
      });
      return updated;
    });

    const check = verificarCierreTurno();
    return { ok: true, puedeCerrar: check.puedeCerrar, faltantes: check.faltantes };
  };

  // Armar texto de reporte WhatsApp
  const generarTextoReporteWhatsApp = (cerrador: string): string => {
    const lines: string[] = [];
    lines.push(`📊 *Stock ${currentTurno} - ${fmtFechaLarga(new Date())}*`);
    lines.push(`🏢 *Central de Pizzas y Empanadas · Sede Escobar*`);
    lines.push(`👤 Cerrado por: *${cerrador}* a las ${fmtHora()}`);
    lines.push(``);

    // Caja
    if (cierreCaja.existe) {
      const sumaPostnets =
        (cierreCaja.postnet_amarillo || 0) +
        (cierreCaja.postnet_rosa || 0) +
        (cierreCaja.postnet_blanco || 0);
      const difPostnets = sumaPostnets - cierreCaja.online_local_sist;
      const difEfectivo = cierreCaja.efectivo_real - cierreCaja.efectivo_mostrador_sist;
      const saldoTotal = difPostnets + difEfectivo;

      lines.push(`💰 *CIERRE DE CAJA:*`);
      lines.push(`• Postnets: $ ${sumaPostnets.toLocaleString('es-AR')} (Datalive: $ ${cierreCaja.online_local_sist.toLocaleString('es-AR')}) -> Dif: ${difPostnets >= 0 ? '+' : ''}$ ${difPostnets.toLocaleString('es-AR')}`);
      lines.push(`• Efectivo: $ ${cierreCaja.efectivo_real.toLocaleString('es-AR')} (Datalive: $ ${cierreCaja.efectivo_mostrador_sist.toLocaleString('es-AR')}) -> Dif: ${difEfectivo >= 0 ? '+' : ''}$ ${difEfectivo.toLocaleString('es-AR')}`);
      lines.push(`👉 *Saldo Total:* ${saldoTotal >= 0 ? '+' : ''}$ ${saldoTotal.toLocaleString('es-AR')} ${saldoTotal === 0 ? '✅ (Cuadrado)' : '⚠️'}`);
      if (cierreCaja.observaciones) {
        lines.push(`• Obs: ${cierreCaja.observaciones}`);
      }
      lines.push(``);
    }

    // Resumen de Stock
    let totalSistema = 0;
    let totalContado = 0;
    let difAbs = 0;
    let prodsConDif = 0;

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = sistemaStock[pid]?.stock ?? 0;
          const entry = conteoActual[pid];
          const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          totalSistema += sys;
          totalContado += contado;
          const diff = contado - sys;
          if (diff !== 0) {
            difAbs += Math.abs(diff);
            prodsConDif++;
          }
        });
      });
    });

    lines.push(`📦 *RESUMEN DE STOCK:*`);
    lines.push(`• Total Sistema: ${totalSistema.toLocaleString('es-AR')}`);
    lines.push(`• Total Contado: ${totalContado.toLocaleString('es-AR')}`);
    lines.push(`• Dif. Absoluta: ${difAbs.toLocaleString('es-AR')} (${prodsConDif} productos con diferencia)`);
    lines.push(``);
    lines.push(`📄 Reporte completo generado en Central Sede Escobar.`);

    return lines.join('\n');
  };

  // Cierre de turno oficial
  const cerrarTurnoDefinitivo = (
    overrideCaja?: Partial<CierreCajaData>,
    overrideConteos?: MapaConteos
  ): { ok: boolean; motivo?: string; reporteTexto?: string; nuevoTurno?: TurnoCierre } => {
    const check = verificarCierreTurno();
    if (!check.puedeCerrar) {
      return { ok: false, motivo: `No se puede cerrar: faltan ${check.faltantes?.join(', ') || 'cerrar caja'}` };
    }

    const cerrador = currentEmpleado?.nombre || 'Carlos';
    const hora = fmtHora();
    const textoWA = generarTextoReporteWhatsApp(cerrador);

    const shiftId = `turno_${currentFecha}_${currentTurno}_${Date.now()}`;
    const isoTime = new Date().toISOString();

    const efReal = Number(overrideCaja?.efectivo_real ?? cierreCaja.efectivo_real) || 0;
    const efSist = Number(overrideCaja?.efectivo_mostrador_sist ?? cierreCaja.efectivo_mostrador_sist) || 0;
    const pAmarillo = Number(overrideCaja?.postnet_amarillo ?? cierreCaja.postnet_amarillo) || 0;
    const pRosa = Number(overrideCaja?.postnet_rosa ?? cierreCaja.postnet_rosa) || 0;
    const pBlanco = Number(overrideCaja?.postnet_blanco ?? cierreCaja.postnet_blanco) || 0;
    const pOnline = Number(overrideCaja?.online_local_sist ?? cierreCaja.online_local_sist) || 0;
    const difEfectivo = efReal - efSist;
    const totDigital = pAmarillo + pRosa + pBlanco; // online_local_sist es la cifra Datalive a comparar, no se suma
    const totRecaudacion = efReal + totDigital;

    const cajaSnapshot: CierreCajaData = {
      ...cierreCaja,
      ...(overrideCaja || {}),
      existe: true,
      fecha: currentFecha,
      turno: currentTurno,
      efectivo_real: efReal,
      efectivo_mostrador_sist: efSist,
      diferencia_efectivo: difEfectivo,
      postnet_amarillo: pAmarillo,
      postnet_rosa: pRosa,
      postnet_blanco: pBlanco,
      online_local_sist: pOnline,
      total_digital: totDigital,
      total_recaudacion: totRecaudacion,
      observaciones: String(overrideCaja?.observaciones ?? cierreCaja.observaciones ?? '').trim(),
      empleado: cerrador,
      hora,
    };

    const conteosSnapshot = normalizeConteos(overrideConteos || JSON.parse(JSON.stringify(conteoActual)));
    const sistemaStockSnapshot = normalizeSistemaStock(JSON.parse(JSON.stringify(sistemaStock)));

    let totSys = 0;
    let totCnt = 0;
    let itemsDiff = 0;
    Object.keys(sistemaStockSnapshot).forEach((k) => {
      const s = Number(sistemaStockSnapshot[k]?.stock) || 0;
      totSys += s;
      const c = conteosSnapshot[k];
      if (c) {
        const val = typeof c === 'number' ? c : c.ubic ? Object.values(c.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0) : 0;
        totCnt += val;
        if (val !== s) itemsDiff++;
      }
    });

    const nuevoTurno: TurnoCierre = {
      id: shiftId,
      timestamp: isoTime,
      fecha: currentFecha,
      turno: currentTurno,
      cerrado: true,
      hora_cierre: hora,
      cerrado_por: cerrador,
      cierreCaja: cajaSnapshot,
      conteos: conteosSnapshot,
      sistemaStock: sistemaStockSnapshot,
      resumenStock: {
        totalSistema: totSys,
        totalContado: totCnt,
        diferenciaTotal: totCnt - totSys,
        itemsConDiferencia: itemsDiff,
      },
      apertura: aperturaInfo || undefined,
    };

    // Historial acumulativo inmutable
    setPastTurnos((prev) => {
      const existingIdx = prev.findIndex((p) => p.id === shiftId);
      const updated = existingIdx >= 0
        ? prev.map((p, i) => (i === existingIdx ? nuevoTurno : p))
        : [nuevoTurno, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.TURNOS, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error saving turnos to localStorage:', e);
      }
      return updated;
    });

    setTurnoCerrado(true);

    // Persistir cierre permanente en el servidor
    fetch('/api/turno/cerrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoTurno),
    }).catch((e) => console.log('Error syncing shift close to server:', e));

    // Marcar todos los reclamos como cerrados
    setReclamos((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        updated[k] = { ...updated[k], terminado: true };
      });
      return updated;
    });

    setResumenModalData({
      visible: true,
      reporteTexto: textoWA,
      fecha: currentFecha,
      turno: currentTurno,
    });

    return { ok: true, reporteTexto: textoWA, nuevoTurno };
  };

  // Forzar cierre (Admin)
  const forzarCierreTurno = (
    overrideCaja?: Partial<CierreCajaData>,
    overrideConteos?: MapaConteos
  ): { ok: boolean; reporteTexto?: string; nuevoTurno?: TurnoCierre } => {
    const cerrador = currentEmpleado?.nombre || 'Admin (forzado)';
    const hora = fmtHora();
    const textoWA = generarTextoReporteWhatsApp(cerrador);

    const shiftId = `turno_${currentFecha}_${currentTurno}_${Date.now()}`;
    const isoTime = new Date().toISOString();

    const efReal = Number(overrideCaja?.efectivo_real ?? cierreCaja.efectivo_real) || 0;
    const efSist = Number(overrideCaja?.efectivo_mostrador_sist ?? cierreCaja.efectivo_mostrador_sist) || 0;
    const pAmarillo = Number(overrideCaja?.postnet_amarillo ?? cierreCaja.postnet_amarillo) || 0;
    const pRosa = Number(overrideCaja?.postnet_rosa ?? cierreCaja.postnet_rosa) || 0;
    const pBlanco = Number(overrideCaja?.postnet_blanco ?? cierreCaja.postnet_blanco) || 0;
    const pOnline = Number(overrideCaja?.online_local_sist ?? cierreCaja.online_local_sist) || 0;
    const difEfectivo = efReal - efSist;
    const totDigital = pAmarillo + pRosa + pBlanco; // online_local_sist es la cifra Datalive a comparar, no se suma
    const totRecaudacion = efReal + totDigital;

    const cajaSnapshot: CierreCajaData = {
      ...cierreCaja,
      ...(overrideCaja || {}),
      existe: true,
      fecha: currentFecha,
      turno: currentTurno,
      efectivo_real: efReal,
      efectivo_mostrador_sist: efSist,
      diferencia_efectivo: difEfectivo,
      postnet_amarillo: pAmarillo,
      postnet_rosa: pRosa,
      postnet_blanco: pBlanco,
      online_local_sist: pOnline,
      total_digital: totDigital,
      total_recaudacion: totRecaudacion,
      observaciones: String(overrideCaja?.observaciones ?? cierreCaja.observaciones ?? '').trim(),
      empleado: cerrador,
      hora,
    };

    const conteosSnapshot = normalizeConteos(overrideConteos || JSON.parse(JSON.stringify(conteoActual)));
    const sistemaStockSnapshot = normalizeSistemaStock(JSON.parse(JSON.stringify(sistemaStock)));

    let totSys = 0;
    let totCnt = 0;
    let itemsDiff = 0;
    Object.keys(sistemaStockSnapshot).forEach((k) => {
      const s = Number(sistemaStockSnapshot[k]?.stock) || 0;
      totSys += s;
      const c = conteosSnapshot[k];
      if (c) {
        const val = typeof c === 'number' ? c : c.ubic ? Object.values(c.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0) : 0;
        totCnt += val;
        if (val !== s) itemsDiff++;
      }
    });

    const nuevoTurno: TurnoCierre = {
      id: shiftId,
      timestamp: isoTime,
      fecha: currentFecha,
      turno: currentTurno,
      cerrado: true,
      hora_cierre: hora,
      cerrado_por: cerrador,
      cierreCaja: cajaSnapshot,
      conteos: conteosSnapshot,
      sistemaStock: sistemaStockSnapshot,
      resumenStock: {
        totalSistema: totSys,
        totalContado: totCnt,
        diferenciaTotal: totCnt - totSys,
        itemsConDiferencia: itemsDiff,
      },
      apertura: aperturaInfo || undefined,
    };

    setPastTurnos((prev) => {
      const existingIdx = prev.findIndex((p) => p.id === shiftId);
      const updated = existingIdx >= 0
        ? prev.map((p, i) => (i === existingIdx ? nuevoTurno : p))
        : [nuevoTurno, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.TURNOS, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error saving turnos to localStorage:', e);
      }
      return updated;
    });

    setTurnoCerrado(true);

    fetch('/api/turno/cerrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoTurno),
    }).catch((e) => console.log('Error syncing forced shift close to server:', e));

    setResumenModalData({
      visible: true,
      reporteTexto: textoWA,
      fecha: currentFecha,
      turno: currentTurno,
    });

    return { ok: true, reporteTexto: textoWA, nuevoTurno };
  };

  // Reabrir turno (Admin)
  const reabrirTurno = (): { ok: boolean; motivo?: string } => {
    if (!currentEmpleado || currentEmpleado.nombre.toLowerCase() !== 'admin') {
      return { ok: false, motivo: 'Solo el Administrador puede reabrir un turno cerrado.' };
    }

    const cerrado = pastTurnos.find((t) => t.fecha === currentFecha && t.turno === currentTurno);
    const cerradoPor = cerrado?.cerrado_por || 'Sistema';
    const horaOriginal = cerrado?.hora_cierre || '—';

    setReaperturaInfo({
      fecha: currentFecha,
      turno: currentTurno,
      cerrado_por: cerradoPor,
      hora_cierre_original: horaOriginal,
      reabierto_por: currentEmpleado.nombre,
      hora_reapertura: fmtHora(),
    });

    setTurnoCerrado(false);
    setPastTurnos((prev) => prev.filter((t) => !(t.fecha === currentFecha && t.turno === currentTurno)));

    return { ok: true };
  };

  // Modificar turno histórico cerrado (Requiere PIN de Admin)
  const actualizarTurnoHistorico = async (
    fecha: string,
    turno: string,
    updates: { conteos?: MapaConteos; sistemaStock?: any; cierreCaja?: any },
    pinAdmin: string
  ): Promise<{ ok: boolean; motivo?: string }> => {
    try {
      const res = await fetch('/api/turno/actualizar-past', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, turno, ...updates, pinAdmin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, motivo: data.error || 'No se pudo actualizar el turno histórico.' };
      }
      if (Array.isArray(data.pastTurnos)) {
        setPastTurnos(data.pastTurnos);
        try {
          localStorage.setItem(STORAGE_KEYS.TURNOS, JSON.stringify(data.pastTurnos));
        } catch {
          // ignore
        }
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, motivo: e.message || 'Error de red' };
    }
  };

  // Admin Employees Management
  const crearEmpleado = (nombre: string, pin: string, rol: 'admin' | 'empleado' = 'empleado'): { ok: boolean; motivo?: string } => {
    const cleanNom = nombre.trim();
    const cleanPin = pin.trim().padStart(4, '0');
    if (!cleanNom || !cleanPin) return { ok: false, motivo: 'Nombre y PIN son requeridos.' };
    if (!/^\d{4}$/.test(cleanPin)) return { ok: false, motivo: 'El PIN debe ser de 4 dígitos numéricos.' };

    if (empleados.some((e) => e.nombre.toLowerCase() === cleanNom.toLowerCase())) {
      return { ok: false, motivo: 'Ya existe un empleado con ese nombre.' };
    }
    if (empleados.some((e) => e.pin === cleanPin)) {
      return { ok: false, motivo: 'Ese PIN ya está en uso por otro empleado.' };
    }

    const nuevo: Empleado = {
      nombre: cleanNom,
      pin: cleanPin,
      activo: true,
      rol,
      creado: new Date().toISOString(),
    };
    setEmpleados((prev) => [...prev, nuevo]);

    // Async sync with server
    fetch('/api/admin/empleados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: cleanNom, pin: cleanPin, rol }),
    }).catch((err) => console.log('Could not sync created employee to server:', err));

    return { ok: true };
  };

  const cambiarPinEmpleado = (nombre: string, nuevoPin: string): { ok: boolean; motivo?: string } => {
    const cleanPin = nuevoPin.trim().padStart(4, '0');
    if (!/^\d{4}$/.test(cleanPin)) return { ok: false, motivo: 'El PIN debe ser de 4 dígitos numéricos.' };

    if (empleados.some((e) => e.nombre.toLowerCase() !== nombre.toLowerCase() && e.pin === cleanPin)) {
      return { ok: false, motivo: 'Ese PIN ya está en uso por otro empleado.' };
    }

    setEmpleados((prev) =>
      prev.map((e) => (e.nombre.toLowerCase() === nombre.toLowerCase() ? { ...e, pin: cleanPin } : e))
    );
    return { ok: true };
  };

  const toggleActivoEmpleado = (nombre: string): { ok: boolean } => {
    if (nombre.toLowerCase() === 'admin') return { ok: false };
    setEmpleados((prev) =>
      prev.map((e) => (e.nombre.toLowerCase() === nombre.toLowerCase() ? { ...e, activo: !e.activo } : e))
    );
    return { ok: true };
  };

  const eliminarEmpleado = (nombre: string): { ok: boolean; motivo?: string } => {
    if (nombre.toLowerCase() === 'admin') return { ok: false, motivo: 'No se puede eliminar al Administrador.' };
    setEmpleados((prev) => prev.filter((e) => e.nombre.toLowerCase() !== nombre.toLowerCase()));
    return { ok: true };
  };

  const desbloquearEmpleado = async (nombre: string): Promise<{ ok: boolean; motivo?: string }> => {
    setEmpleados((prev) =>
      prev.map((e) => (e.nombre.toLowerCase() === nombre.toLowerCase() ? { ...e, bloqueado: false } : e))
    );

    try {
      sessionStorage.removeItem(`central_lockout_${nombre.toLowerCase()}`);
      const res = await fetch('/api/admin/empleados/desbloquear', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json();
      return { ok: data.ok, motivo: data.mensaje || `✓ ${nombre} desbloqueado exitosamente.` };
    } catch {
      return { ok: true, motivo: `✓ ${nombre} desbloqueado localmente.` };
    }
  };

  const reiniciarDatosTurnoActual = (): { ok: boolean; motivo?: string } => {
    setConteoActual({});
    setReclamos({});
    setCierreCaja({
      existe: false,
      postnet_amarillo: 0,
      postnet_rosa: 0,
      postnet_blanco: 0,
      online_local_sist: 0,
      efectivo_real: 0,
      efectivo_mostrador_sist: 0,
      observaciones: '',
      empleado: currentEmpleado ? currentEmpleado.nombre : 'Admin',
      hora: fmtHora(),
    });
    setTurnoCerrado(false);
    return { ok: true, motivo: '✓ Todos los conteos y cierre de caja del turno actual fueron reiniciados a cero.' };
  };

  // Catalog
  const agregarProducto = (catId: string, nombre: string, codigo?: string) => {
    setCatalogo((prev) =>
      prev.map((cat) => {
        if (cat.id !== catId) return cat;
        const grupos = [...cat.grupos];
        if (grupos.length === 0) {
          grupos.push({ nombre: null, productos: [] });
        }
        grupos[0].productos.push({
          codigo: (codigo || '').trim(),
          nombre: nombre.trim(),
        });
        return { ...cat, grupos };
      })
    );
  };

  const crearCategoria = (nombre: string, ubicaciones: string[]) => {
    const nueva: CategoriaCatalogo = {
      id: slug(nombre) + '-' + Date.now(),
      nombre: nombre.trim(),
      ubicaciones: ubicaciones.map((u) => u.trim()).filter(Boolean),
      grupos: [{ nombre: null, productos: [] }],
    };
    setCatalogo((prev) => [...prev, nueva]);
  };

  // Datalive Import
  const importarStockDatalive = (
    rows: { codigo: string; nombre: string; stock: number }[]
  ): { matched: number; unmatched: string[] } => {
    const byCodigo: Record<string, string> = {};
    const byNombre: Record<string, string> = {};

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          if (p.codigo) byCodigo[p.codigo] = pid;
          byNombre[normName(p.nombre)] = pid;
        });
      });
    });

    let matched = 0;
    const unmatched: string[] = [];
    const nowIso = new Date().toISOString();
    const updatedStock = { ...sistemaStock };
    const exactMatchedPids = new Set<string>();

    const findPid = (code: string, rowName: string): string | undefined => {
      // 1. Exact match by Datalive code is the official standard
      if (code && byCodigo[code]) return byCodigo[code];
      if (code === '11467') return byCodigo['11467'] || 'c-11467';
      if (code === '28708') return byCodigo['28708'] || 'c-28708';

      // 2. Exact match by catalog normalized name
      const norm = normName(rowName);
      if (byNombre[norm]) return byNombre[norm];

      // If incoming item has an official code that belongs to a different product in Datalive,
      // DO NOT let loose regex falsely attribute it to an unrelated catalog product!
      // (This prevents Fanta Pomelo 68308 and Fanta Uva 85913 from hijacking Fanta 600ml 11467,
      // and Aquarius Pomelo Rosado 97594 from hijacking Aquarius Pomelo 28708)
      if (code && code.trim() !== '') {
        if (['68308', '85913', '97594', '95097', '95098'].includes(code.trim())) return undefined;
      }

      // 2. Smart matching for Sandwiches y Panchos (when code is missing or pasted)
      if (norm.includes('bollo') && norm.includes('bondiola')) return byCodigo['17966'];
      if (norm.includes('bollo') && norm.includes('pollo')) return byCodigo['17968'];
      if (norm.includes('bollo') && norm.includes('ternera')) return byCodigo['17967'];
      if (norm.includes('porcion') && norm.includes('bondiola')) return byCodigo['13944'];
      if (norm.includes('porcion') && norm.includes('pollo')) return byCodigo['13943'];
      if (norm.includes('porcion') && norm.includes('ternera')) return byCodigo['13942'];
      if (norm.includes('pancho') || norm.includes('salchicha')) return byCodigo['22445'];

      // 3. Smart matching for Burritos
      if (norm.includes('burrito') && (norm.includes('ternera') || norm.includes('carne'))) return byCodigo['10981'];
      if (norm.includes('burrito') && (norm.includes('cerdo') || norm.includes('bondiola') || norm.includes('puerco'))) return byCodigo['10982'];
      if (norm.includes('burrito') && norm.includes('pollo')) return byCodigo['10983'];
      if (norm.includes('burrito') && (norm.includes('veget') || norm.includes('verdura') || norm.includes('veggie'))) return byCodigo['10984'];

      // 4. Smart matching for Bebidas
      // 4.1. Aguas
      if (norm.includes('benedictino') && norm.includes('sin gas') && (norm.includes('600') || norm.includes('500'))) return byCodigo['96454'];
      if (norm.includes('benedictino') && norm.includes('con gas') && (norm.includes('600') || norm.includes('500'))) return byCodigo['96455'];
      if (norm.includes('benedictino') && norm.includes('sin gas') && (norm.includes('1.5') || norm.includes('1.75') || norm.includes('litro'))) return byCodigo['96456'];
      if (norm.includes('benedictino') && norm.includes('con gas') && (norm.includes('1.5') || norm.includes('1.75') || norm.includes('litro'))) return byCodigo['96457'];

      // 4.2. Gaseosas 500/600
      if (norm.includes('coca') && !norm.includes('zero') && (norm.includes('500') || norm.includes('600'))) return byCodigo['11475'];
      if (norm.includes('coca') && norm.includes('zero') && (norm.includes('500') || norm.includes('600'))) return byCodigo['94309'];
      if (norm.includes('fanta') && !norm.includes('pomelo') && !norm.includes('uva') && (norm.includes('500') || norm.includes('600') || norm.includes('ml') || norm === 'fanta')) return byCodigo['11467'] || 'c-11467';
      if (norm.includes('sprite') && !norm.includes('zero') && (norm.includes('500') || norm.includes('600'))) return byCodigo['11420'];
      if (norm.includes('sprite') && norm.includes('zero') && (norm.includes('500') || norm.includes('600'))) return byCodigo['13428'];

      // 4.3. Aguas Saborizadas 500/600
      if (norm.includes('aquarius') && norm.includes('manzana') && (norm.includes('500') || norm.includes('600'))) return byCodigo['83764'];
      if (norm.includes('aquarius') && norm.includes('pera') && (norm.includes('500') || norm.includes('600'))) return byCodigo['83765'];
      if (norm.includes('aquarius') && norm.includes('pomelo') && !norm.includes('rosad') && (norm.includes('500') || norm.includes('600') || norm.includes('cc') || norm.includes('ml'))) return byCodigo['28708'] || 'c-28708';

      // 4.4. Gaseosas 1.5/1.75
      if (norm.includes('coca') && !norm.includes('zero') && (norm.includes('1.5') || norm.includes('1.75'))) return byCodigo['12844'];
      if (norm.includes('coca') && norm.includes('zero') && (norm.includes('1.5') || norm.includes('1.75'))) return byCodigo['13427'];
      if (norm.includes('fanta') && !norm.includes('pomelo') && !norm.includes('uva') && (norm.includes('1.5') || norm.includes('1.75'))) return byCodigo['11465'];
      if (norm.includes('sprite') && !norm.includes('zero') && (norm.includes('1.5') || norm.includes('1.75'))) return byCodigo['87757'];
      if (norm.includes('sprite') && norm.includes('zero') && (norm.includes('1.5') || norm.includes('1.75'))) return byCodigo['82049'];

      // 4.5. Aguas Saborizadas Grandes
      if (norm.includes('aquarius') && norm.includes('manzana') && (norm.includes('1.5') || norm.includes('litro'))) return byCodigo['90682'];
      if (norm.includes('aquarius') && norm.includes('naranja') && (norm.includes('1.5') || norm.includes('litro'))) return byCodigo['28707'];
      if (norm.includes('aquarius') && norm.includes('pera') && (norm.includes('1.5') || norm.includes('litro'))) return byCodigo['94301'];
      if (norm.includes('aquarius') && norm.includes('pomelo') && !norm.includes('rosad') && (norm.includes('1.5') || norm.includes('litro'))) return byCodigo['22458'];

      return undefined;
    };

    rows.forEach((r) => {
      const pid = findPid(r.codigo, r.nombre);
      if (!pid) {
        unmatched.push(`${r.nombre} (${r.codigo})`);
      } else {
        // If this product was already exact-code matched, do not allow loose fallback to overwrite it
        if (r.codigo && byCodigo[r.codigo]) {
          exactMatchedPids.add(pid);
          matched++;
          updatedStock[pid] = { stock: r.stock, actualizado: nowIso };
        } else if (!exactMatchedPids.has(pid)) {
          matched++;
          updatedStock[pid] = { stock: r.stock, actualizado: nowIso };
        }
      }
    });

    setSistemaStock(updatedStock);
    // Sync with backend so all connected staff/devices have the new Datalive stock
    fetch('/api/turno/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStock),
    }).catch((e) => console.log('[CentralContext] Sync stock to server:', e));

    return { matched, unmatched };
  };

  // Real Datalive sync via backend proxy (uses saved server credentials or custom overrides)
  const forzarSincronizacionDatalive = async (
    customConfig?: { scriptUrl?: string; usuario?: string; clave?: string; apiEndpoint?: string }
  ): Promise<{ ok: boolean; total: number; motivo?: string }> => {
    try {
      const savedConfigStr = typeof window !== 'undefined' ? localStorage.getItem('central_datalive_config') : null;
      let savedConfig: any = {};
      try {
        if (savedConfigStr) savedConfig = JSON.parse(savedConfigStr);
      } catch (e) {
        console.error('Error parsing datalive config:', e);
      }

      // Merge local config and customConfig if provided. Do NOT block if empty,
      // because server-storage.json on the server has the saved credentials!
      const config = { ...savedConfig, ...customConfig };

      const response = await fetch('/api/datalive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        return {
          ok: false,
          total: 0,
          motivo: resData.error || 'Error al conectar con el servidor de Datalive.',
        };
      }

      if (Array.isArray(resData.items) && resData.items.length > 0) {
        const importRes = importarStockDatalive(resData.items);
        return {
          ok: true,
          total: importRes.matched,
          motivo: `✓ ${importRes.matched} productos actualizados directamente desde Datalive.`,
        };
      }

      return {
        ok: false,
        total: 0,
        motivo: 'Datalive respondió correctamente pero no se encontraron filas de stock.',
      };
    } catch (err: any) {
      return {
        ok: false,
        total: 0,
        motivo: err.message || 'Error de conexión con el servicio Datalive.',
      };
    }
  };

  // Sincronización automática de stock con Datalive al iniciar
  useEffect(() => {
    forzarSincronizacionDatalive().catch(() => {
      // Catch silencioso en segundo plano
    });
  }, []);

  const resetDemoData = () => {
    localStorage.clear();
    setCatalogo(INITIAL_CATALOGO);
    setSistemaStock(INITIAL_SISTEMA_STOCK);
    setConteoActual(INITIAL_CONTEO);
    setCierreCaja(INITIAL_CIERRE_CAJA);
    setReclamos(INITIAL_RECLAMOS);
    setEmpleados(INITIAL_EMPLEADOS);
    setPastTurnos([]);
    setTurnoCerrado(false);
    setReaperturaInfo(null);
  };

  return (
    <CentralContext.Provider
      value={{
        activeTab,
        setActiveTab,
        reportMode,
        setReportMode,
        currentEmpleado,
        currentTurno,
        cambiarTurnoActual,
        currentFecha,
        horaInicio,
        turnoCerrado,
        reaperturaInfo,
        // Shift Opening & Multi-user state (Puntos 1, 2, 3, 4, 8)
        turnoAbierto,
        aperturaInfo,
        abrirTurno,
        ultimoTurnoCerrado,
        ultimoTurnoNoche,
        efectivoNocheEsperado,
        isAperturaModalOpen,
        setIsAperturaModalOpen,
        // Apertura del Día
        aperturasDia,
        ultimaAperturaDia,
        serverTurnoNoche,
        fetchAperturaDia,
        guardarAperturaDia,
        catalogo,
        sistemaStock,
        conteoActual,
        reclamos,
        cierreCaja,
        pastTurnos,
        empleados,
        loginWithPin,
        logout,
        reclamarCategoria,
        liberarCategoria,
        liberarTodosLosReclamos,
        pedirReaperturaCategoria,
        guardarConteoCategoria,
        actualizarConteoItem,
        actualizarCierreCajaLive,
        guardarCierreCaja,
        borrarCierreCaja,
        verificarCierreTurno,
        marcarTerminado,
        cerrarTurnoDefinitivo,
        forzarCierreTurno,
        reabrirTurno,
        actualizarTurnoHistorico,
        crearEmpleado,
        cambiarPinEmpleado,
        toggleActivoEmpleado,
        eliminarEmpleado,
        desbloquearEmpleado,
        reiniciarDatosTurnoActual,
        agregarProducto,
        crearCategoria,
        importarStockDatalive,
        forzarSincronizacionDatalive,
        resetDemoData,
        resumenModalData,
        setResumenModalData,
        resetearConteosTurno,
      }}
    >
      {children}
    </CentralContext.Provider>
  );
};

export const useCentral = () => {
  const context = useContext(CentralContext);
  if (!context) {
    throw new Error('useCentral must be used within a CentralProvider');
  }
  return context;
};
