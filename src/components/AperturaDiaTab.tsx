import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCentral } from '../context/CentralContext';
import { productId, fmtMoney, fmtSignedMoney, abrirWhatsApp, todayKey, fmtDateLabel } from '../utils/centralHelpers';
import { AperturaDiaData, StockAuditItem } from '../types/central';
import { generateAperturaPDF, buildWhatsAppMessage } from '../utils/pdfAperturaGenerator';
import { fechaMenosDias } from '../utils/snapshotNormalizer';
import { 
  Sun, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  FileDown, 
  Share2, 
  Search, 
  Filter, 
  Clock, 
  User, 
  Check, 
  Info,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  RotateCcw,
  History,
  ArrowLeft
} from 'lucide-react';

export const AperturaDiaTab: React.FC = () => {
  const {
    currentEmpleado,
    currentFecha,
    currentTurno,
    setActiveTab,
    catalogo,
    ultimoTurnoNoche,
    serverTurnoNoche,
    fetchAperturaDia,
    efectivoNocheEsperado,
    guardarAperturaDia,
    ultimaAperturaDia,
    aperturasDia,
    forzarSincronizacionDatalive,
  } = useCentral();

  // Eagerly refresh apertura-dia data from server on tab load
  useEffect(() => {
    fetchAperturaDia().catch(() => {});
  }, [fetchAperturaDia]);

  // Selector de Aperturas: 'hoy' (en curso) o el ID/fecha de una apertura anterior
  const [selectedAperturaId, setSelectedAperturaId] = useState<string>('hoy');

  // Registro de apertura histórica seleccionada para revisión
  const selectedHistoricalApertura = useMemo<AperturaDiaData | null>(() => {
    if (selectedAperturaId === 'hoy') return null;
    return aperturasDia.find((a) => (a.id || a.fecha) === selectedAperturaId) || null;
  }, [selectedAperturaId, aperturasDia]);

  const isReviewMode = Boolean(selectedHistoricalApertura);

  // Fecha y hora de apertura para hoy
  const [horaApertura] = useState(() => 
    new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  );

  // Estado de Caja (Modo Hoy)
  const [efectivoContado, setEfectivoContado] = useState<string>(() => 
    efectivoNocheEsperado > 0 ? efectivoNocheEsperado.toString() : ''
  );
  const [observacionesCaja, setObservacionesCaja] = useState<string>('');

  // Estado de Stock: mapa de id -> { contadoApertura } (Modo Hoy)
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [observacionesStock, setObservacionesStock] = useState<string>('');

  // Filtros de tabla
  const [selectedCategoria, setSelectedCategoria] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyDifferences, setOnlyDifferences] = useState<boolean>(false);

  // Estados de interfaz y feedback
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingStock, setIsSyncingStock] = useState<boolean>(false);
  const [isRefreshingCaja, setIsRefreshingCaja] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Helper para extraer conteo numérico de cualquier formato guardado
  const extractCountValue = (entry: any): number | null => {
    if (entry === null || entry === undefined) return null;
    if (typeof entry === 'number') return entry;
    if (typeof entry.contado === 'number') return entry.contado;
    if (typeof entry.total === 'number') return entry.total;
    if (typeof entry.stock === 'number') return entry.stock;
    if (entry.ubic && typeof entry.ubic === 'object') {
      const vals = Object.values(entry.ubic);
      if (vals.length > 0) {
        return vals.reduce((a: number, b: any) => a + (Number(b) || 0), 0);
      }
    }
    return null;
  };

  // Turno TARDE de referencia: el último cerrado formalmente (misma regla que el servidor).
  const turnoNocheReferencia = ultimoTurnoNoche;
  const ayerIso = fechaMenosDias(currentFecha, 1);
  const referenciaEsDeAyer = turnoNocheReferencia ? turnoNocheReferencia.fecha === ayerIso : false;

  // Extraer el conteo físico del turno noche anterior para cada producto
  const conteoFisicoNocheMap = useMemo(() => {
    const map: Record<string, number> = {};

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const keysToTry: string[] = [pid];
          if (p.codigo && p.codigo.trim() !== '') {
            const cleanCode = p.codigo.trim();
            keysToTry.push('c-' + cleanCode, cleanCode);
          }
          keysToTry.push(p.nombre.toLowerCase().trim());

          let resolvedVal: number | null = null;

          // 1. Prioridad: turno noche de referencia directo
          if (turnoNocheReferencia?.conteos) {
            for (const k of keysToTry) {
              if (k in turnoNocheReferencia.conteos) {
                const val = extractCountValue(turnoNocheReferencia.conteos[k]);
                if (val !== null && !isNaN(val)) {
                  resolvedVal = val;
                  break;
                }
              }
            }
          }

          map[pid] = resolvedVal !== null ? resolvedVal : 0;
        });
      });
    });

    return map;
  }, [turnoNocheReferencia, catalogo]);

  const hasUserEditedRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);

  // Inicializar los conteos de apertura con lo contado la noche anterior para el turno de Hoy
  useEffect(() => {
    if (hasUserEditedRef.current || isReviewMode) return;

    const initial: Record<string, number> = {};
    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          if (
            ultimaAperturaDia &&
            ultimaAperturaDia.fecha === currentFecha &&
            ultimaAperturaDia.stockAudit?.[pid]?.contadoApertura !== undefined
          ) {
            initial[pid] = ultimaAperturaDia.stockAudit[pid].contadoApertura;
          } else {
            initial[pid] = conteoFisicoNocheMap[pid] ?? 0;
          }
        });
      });
    });
    setStockCounts(initial);

    if (
      ultimaAperturaDia &&
      ultimaAperturaDia.fecha === currentFecha &&
      ultimaAperturaDia.efectivoContadoApertura > 0
    ) {
      setEfectivoContado(ultimaAperturaDia.efectivoContadoApertura.toString());
      setObservacionesCaja(ultimaAperturaDia.observacionesCaja || '');
      setObservacionesStock(ultimaAperturaDia.observacionesStock || '');
    } else if (efectivoNocheEsperado > 0) {
      setEfectivoContado(efectivoNocheEsperado.toString());
    }
    isInitializedRef.current = true;
  }, [catalogo, conteoFisicoNocheMap, ultimaAperturaDia, currentFecha, efectivoNocheEsperado, isReviewMode]);

  // Cálculos de Caja Activos
  const activeEfectivoEsperado = isReviewMode && selectedHistoricalApertura
    ? selectedHistoricalApertura.efectivoAnteriorEsperado
    : efectivoNocheEsperado;

  const efContadoNum = isReviewMode && selectedHistoricalApertura
    ? selectedHistoricalApertura.efectivoContadoApertura
    : (parseFloat(efectivoContado) || 0);

  const difCaja = isReviewMode && selectedHistoricalApertura
    ? selectedHistoricalApertura.diferenciaEfectivo
    : (efContadoNum - activeEfectivoEsperado);

  const activeObsCaja = isReviewMode && selectedHistoricalApertura
    ? (selectedHistoricalApertura.observacionesCaja || '')
    : observacionesCaja;

  const activeObsStock = isReviewMode && selectedHistoricalApertura
    ? (selectedHistoricalApertura.observacionesStock || '')
    : observacionesStock;

  // Restablecer conteos de apertura a los de la noche anterior (solo modo Hoy)
  const handleResetToNoche = () => {
    if (isReviewMode) return;
    const reset: Record<string, number> = {};
    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          reset[pid] = conteoFisicoNocheMap[pid] ?? 0;
        });
      });
    });
    hasUserEditedRef.current = true;
    setStockCounts(reset);
    showToast('✓ Casilleros de Apertura Mañana copiados desde Contado Anoche.');
  };

  // Dejar únicamente los casilleros de Apertura Mañana en 0 (solo modo Hoy)
  const handlePonerEnCero = () => {
    if (isReviewMode) return;
    hasUserEditedRef.current = true;
    const zeros: Record<string, number> = {};
    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          zeros[productId(cat.id, p)] = 0;
        });
      });
    });
    setStockCounts(zeros);
    showToast('✓ Casilleros de Apertura Mañana puestos en 0.');
  };

  // Función para sincronizar y actualizar el stock directo desde Datalive
  const handleSyncStockDatalive = async () => {
    if (isReviewMode) return;
    setIsSyncingStock(true);
    showToast('Consultando planilla de stock en vivo de Datalive...');
    try {
      const res = await fetch('/api/datalive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        await fetchAperturaDia();
        showToast(`✓ ¡Stock sincronizado con Datalive! (${data.total || data.items.length} productos actualizados)`);
      } else {
        showToast(`⚠️ ${data.error || 'No se pudo sincronizar el stock con Datalive.'}`);
      }
    } catch {
      showToast('⚠️ Error de conexión al consultar stock en Datalive.');
    } finally {
      setIsSyncingStock(false);
    }
  };

  // Función para re-consultar la caja nocturna desde el servidor / Datalive
  const handleRefrescarCajaNoche = async () => {
    if (isReviewMode) return;
    setIsRefreshingCaja(true);
    showToast('Buscando último cierre de caja nocturno en Datalive...');
    try {
      const res = await fetch('/api/apertura-dia');
      if (res.ok) {
        const data = await res.json();
        const expectedCash = data.efectivoEsperado || data.ultimoTurnoNoche?.cierreCaja?.efectivo_real || data.ultimoTurnoNoche?.cierreCaja?.efectivo_mostrador_sist;
        if (expectedCash) {
          setEfectivoContado(expectedCash.toString());
          const shiftDate = data.ultimoTurnoNoche?.fecha || 'ayer';
          showToast(`✓ Caja Turno Noche (${shiftDate}) detectada: ${fmtMoney(expectedCash)}`);
        } else {
          showToast('No se encontró caja cerrada nocturna en Datalive.');
        }
      }
    } catch {
      showToast('⚠️ Error al consultar caja de Datalive.');
    } finally {
      setIsRefreshingCaja(false);
    }
  };

  // Lista plana de productos auditados (soporta tanto modo hoy interactivo como modo revisión histórica)
  const flatProducts = useMemo(() => {
    const items: Array<{
      pid: string;
      codigo: string;
      nombre: string;
      catId: string;
      catNombre: string;
      contadoNoche: number;
      contadoApertura: number;
      diferencia: number;
    }> = [];

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);

          if (isReviewMode && selectedHistoricalApertura?.stockAudit) {
            const auditEntry = selectedHistoricalApertura.stockAudit[pid] ||
                               Object.values(selectedHistoricalApertura.stockAudit).find((it: any) => it.nombre === p.nombre || (it.codigo && it.codigo === p.codigo));
            const cNoche = auditEntry?.contadoNoche ?? (conteoFisicoNocheMap[pid] ?? 0);
            const cApertura = auditEntry?.contadoApertura ?? cNoche;
            const diff = auditEntry?.diferencia ?? (cApertura - cNoche);

            items.push({
              pid,
              codigo: p.codigo || auditEntry?.codigo || '',
              nombre: p.nombre,
              catId: cat.id,
              catNombre: cat.nombre,
              contadoNoche: cNoche,
              contadoApertura: cApertura,
              diferencia: diff,
            });
          } else {
            const cNoche = conteoFisicoNocheMap[pid] ?? 0;
            const cApertura = stockCounts[pid] !== undefined ? stockCounts[pid] : cNoche;
            const diff = cApertura - cNoche;

            items.push({
              pid,
              codigo: p.codigo || '',
              nombre: p.nombre,
              catId: cat.id,
              catNombre: cat.nombre,
              contadoNoche: cNoche,
              contadoApertura: cApertura,
              diferencia: diff,
            });
          }
        });
      });
    });

    return items;
  }, [catalogo, conteoFisicoNocheMap, stockCounts, isReviewMode, selectedHistoricalApertura]);

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return flatProducts.filter((item) => {
      if (selectedCategoria !== 'all' && item.catId !== selectedCategoria) {
        return false;
      }
      if (onlyDifferences && item.diferencia === 0) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.nombre.toLowerCase().includes(q);
        const matchCode = item.codigo.toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });
  }, [flatProducts, selectedCategoria, onlyDifferences, searchQuery]);

  const totalDiferenciasStock = useMemo(() => {
    return flatProducts.filter((p) => p.diferencia !== 0).length;
  }, [flatProducts]);

  const handleStockChange = (pid: string, valStr: string) => {
    if (isReviewMode) return;
    hasUserEditedRef.current = true;
    const val = valStr === '' ? 0 : Math.max(0, parseInt(valStr, 10) || 0);
    setStockCounts((prev) => ({
      ...prev,
      [pid]: val,
    }));
  };

  // Construir objeto de datos de apertura activa
  const buildActiveAperturaData = (): AperturaDiaData => {
    if (isReviewMode && selectedHistoricalApertura) {
      return selectedHistoricalApertura;
    }

    const stockAudit: Record<string, StockAuditItem> = {};
    flatProducts.forEach((p) => {
      stockAudit[p.pid] = {
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.catNombre,
        contadoNoche: p.contadoNoche,
        contadoApertura: p.contadoApertura,
        diferencia: p.diferencia,
      };
    });

    return {
      fecha: currentFecha || todayKey(),
      hora: horaApertura,
      empleado: currentEmpleado?.nombre || 'Colaborador',
      turnoAnteriorFecha: ultimoTurnoNoche?.fecha || 'Noche anterior',
      turnoAnteriorTurno: ultimoTurnoNoche?.turno || 'Tarde',
      turnoAnteriorCerradoPor: ultimoTurnoNoche?.cerrado_por || 'Turno noche',
      efectivoAnteriorEsperado: activeEfectivoEsperado,
      efectivoContadoApertura: efContadoNum,
      diferenciaEfectivo: difCaja,
      observacionesCaja: activeObsCaja,
      stockAudit,
      observacionesStock: activeObsStock,
    };
  };

  // Descarga del PDF de la apertura (actual o histórica)
  const handleDescargarPDF = () => {
    try {
      const data = buildActiveAperturaData();
      const { blob, filename } = generateAperturaPDF(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`✓ PDF de Apertura (${data.fecha}) descargado.`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      showToast('⚠️ No se pudo generar el PDF.');
    }
  };

  // Compartir por WhatsApp
  const handleCompartirWhatsApp = async () => {
    try {
      const data = buildActiveAperturaData();
      const message = buildWhatsAppMessage(data);

      const { blob, filename } = generateAperturaPDF(data);
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `Apertura Central Escobar · ${data.fecha}`,
            text: message,
            files: [file],
          });
          showToast('✓ Reporte compartido con éxito.');
          return;
        } catch (shareErr) {
          // Si el usuario cancela, no lanzar error
        }
      }

      abrirWhatsApp(message, '5491169927352');
      showToast('✓ Abriendo WhatsApp con el resumen de apertura.');
    } catch (err) {
      console.error('Error compartiendo por WhatsApp:', err);
      showToast('⚠️ Error al compartir.');
    }
  };

  // Guardar apertura (solo disponible en modo Hoy)
  const handleGuardarApertura = async () => {
    if (isReviewMode) return;
    setIsSaving(true);
    try {
      const data = buildActiveAperturaData();
      const res = await guardarAperturaDia(data);
      if (res.ok) {
        hasUserEditedRef.current = false;
        setSaveSuccess(true);
        showToast('✓ ¡Apertura del Día registrada con éxito en el historial!');
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        showToast(`⚠️ ${res.error || 'Error al guardar apertura.'}`);
      }
    } catch {
      showToast('⚠️ Error de conexión al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-5 space-y-5">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#123D26] text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-bold border border-emerald-400/40 animate-in fade-in slide-in-from-top-2">
          {toastMsg}
        </div>
      )}

      {/* Banner de Aviso si el usuario está en Turno Tarde */}
      {currentTurno === 'Tarde' && !isReviewMode && (
        <div className="bg-amber-500/10 border-2 border-amber-500/60 rounded-3xl p-4 sm:p-5 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-amber-500 text-white rounded-xl shadow-2xs shrink-0 mt-0.5">
              <Sun className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider font-black text-amber-800">
                Aviso: Turno Tarde Activo
              </div>
              <h2 className="text-sm sm:text-base font-black text-stone-900 mt-0.5">
                La Apertura del Día corresponde únicamente al Turno Mañana
              </h2>
              <p className="text-xs text-stone-600 mt-0.5 max-w-xl">
                En el turno tarde no es necesario realizar apertura de turno ni arqueo inicial. Podés ir directamente a cargar stock en el módulo <strong>Contar</strong> o consultar el historial de aperturas anteriores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('contar')}
            className="px-4 py-2 bg-[#123D26] hover:bg-[#1A5736] text-white rounded-xl text-xs font-black shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <span>Ir a Contar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* SELECTOR DE APERTURA (HOY EN CURSO VS DÍAS ANTERIORES)   */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
              <History className="w-4 h-4" />
            </span>
            <div>
              <span className="text-[11px] font-black text-stone-500 uppercase tracking-wider block">
                Historial de Aperturas
              </span>
              <span className="text-xs sm:text-sm font-bold text-stone-900">
                Seleccioná qué apertura querés ver o auditar
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md sm:justify-end">
            <select
              value={selectedAperturaId}
              onChange={(e) => setSelectedAperturaId(e.target.value)}
              className="w-full text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-[#1B5E38] cursor-pointer shadow-2xs"
            >
              <option value="hoy">
                ☀️ Apertura de Hoy (En curso / Actual) — {fmtDateLabel(currentFecha)}
              </option>
              {aperturasDia.map((ap) => {
                const idVal = ap.id || ap.fecha;
                const isHoy = ap.fecha === currentFecha;
                return (
                  <option key={idVal} value={idVal}>
                    📋 {fmtDateLabel(ap.fecha)} · {ap.hora} hs ({ap.empleado}) {ap.diferenciaEfectivo === 0 ? '· Caja Cuadrada' : `· Dif: ${fmtSignedMoney(ap.diferenciaEfectivo)}`} {isHoy ? '(Hoy guardada)' : ''}
                  </option>
                );
              })}
            </select>

            {isReviewMode && (
              <button
                type="button"
                onClick={() => setSelectedAperturaId('hoy')}
                className="px-3 py-2 bg-[#123D26] hover:bg-[#1A5736] text-white rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 shadow-2xs"
                title="Volver a la apertura de hoy"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a Hoy</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banner de Modo Revisión Histórica (si está activo) */}
      {isReviewMode && selectedHistoricalApertura && (
        <div className="bg-amber-500/10 border-2 border-amber-500/60 rounded-3xl p-4 sm:p-5 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-amber-500 text-white rounded-xl shadow-2xs shrink-0 mt-0.5">
              <History className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider font-black text-amber-800">
                Modo Revisión Histórica
              </div>
              <h2 className="text-sm sm:text-base font-black text-stone-900 mt-0.5">
                Apertura del {fmtDateLabel(selectedHistoricalApertura.fecha)} a las {selectedHistoricalApertura.hora} hs
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Registrada por <strong>{selectedHistoricalApertura.empleado}</strong> · Referencia turno noche: {selectedHistoricalApertura.turnoAnteriorFecha} por {selectedHistoricalApertura.turnoAnteriorCerradoPor || 'Fati'}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              type="button"
              onClick={handleDescargarPDF}
              className="px-3 py-2 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-stone-600" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedAperturaId('hoy')}
              className="px-3.5 py-2 bg-[#123D26] hover:bg-[#1A5736] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <span>Volver a Hoy</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Banner Principal */}
      <div className={`rounded-3xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden transition-colors ${
        isReviewMode
          ? 'bg-gradient-to-r from-[#1E293B] via-[#334155] to-[#1E293B]'
          : 'bg-gradient-to-r from-[#123D26] via-[#164E2F] to-[#1C5D3A]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`p-2 rounded-xl border ${
                isReviewMode
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                  : 'bg-amber-400/20 text-amber-300 border-amber-400/30'
              }`}>
                {isReviewMode ? <History className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-300" />}
              </span>
              <span className="text-[10px] sm:text-xs uppercase tracking-wider font-extrabold text-amber-300 bg-black/30 px-2.5 py-0.5 rounded-full border border-white/10">
                {isReviewMode ? 'Auditoría Histórica Guardada' : 'Operación Matutina · Central Escobar'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {isReviewMode ? `Revisión Apertura: ${selectedHistoricalApertura?.fecha}` : 'Apertura del Día'}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1 max-w-xl leading-relaxed">
              {isReviewMode 
                ? 'Visualizando los datos exactos con los que se abrió el local en esa fecha: efectivo auditado y stock físico.'
                : 'Verificá el efectivo que dejó el turno noche anterior y auditá rápidamente el stock físico al iniciar la jornada.'}
            </p>
          </div>

          <div className="bg-black/30 border border-white/15 p-3.5 rounded-2xl text-xs space-y-1.5 shrink-0 sm:min-w-[210px] backdrop-blur-xs">
            <div className="flex items-center justify-between text-emerald-300 font-medium text-[11px]">
              <span className="flex items-center gap-1 text-emerald-200">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                {isReviewMode ? 'Registró apertura:' : 'Abre el local:'}
              </span>
              <strong className="text-white font-extrabold">
                {isReviewMode ? selectedHistoricalApertura?.empleado : (currentEmpleado?.nombre || 'Colaborador')}
              </strong>
            </div>
            <div className="flex items-center justify-between text-emerald-300 font-medium text-[11px] pt-1 border-t border-white/10">
              <span className="flex items-center gap-1 text-emerald-200">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Hora de apertura:
              </span>
              <span className="text-white font-bold">
                {isReviewMode ? selectedHistoricalApertura?.hora : horaApertura}
              </span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-4 pt-3 border-t border-white/15 flex items-center gap-2 text-[11px] text-emerald-200/90">
          <Info className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>
            {isReviewMode
              ? <strong>Modo Lectura:</strong>
              : <strong>Auditoría Independiente:</strong>}{' '}
            {isReviewMode
              ? 'Estás revisando los datos guardados en el historial acumulativo. No se modifican al navegar.'
              : 'Si corregís un conteo mal hecho anoche, se registrará la novedad y el PDF sin modificar el stock base del sistema.'}
          </span>
        </div>
      </div>

      {/* Qué cierre del turno Tarde se está usando como referencia */}
      {!isReviewMode && (
        turnoNocheReferencia ? (
          <div className={`rounded-2xl border p-3.5 text-xs flex items-start gap-2 ${
            referenciaEsDeAyer ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}>
            {referenciaEsDeAyer
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />}
            <span>
              Datos del turno <strong>Tarde del {turnoNocheReferencia.fecha}</strong>
              {turnoNocheReferencia.hora_cierre ? ` (cierre ${turnoNocheReferencia.hora_cierre})` : ''}, cargados por{' '}
              <strong>{turnoNocheReferencia.cerrado_por || 'turno Tarde'}</strong>
              {referenciaEsDeAyer
                ? '. Contá y verificá que recibiste lo mismo.'
                : `. Ojo: no es el cierre de ayer (${ayerIso}); no hay un cierre Tarde más reciente cargado. Verificá igual y avisá si algo no coincide.`}
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border p-3.5 text-xs flex items-start gap-2 bg-amber-50 border-amber-300 text-amber-950">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              <strong>Todavía no hay un cierre del turno Tarde cargado.</strong> No hay datos de caja ni de stock
              para comparar. Podés cargar tu conteo de apertura igual; se usará como punto de partida.
            </span>
          </div>
        )
      )}

      {/* ======================================================== */}
      {/* BLOQUE 1: ARQUEO DE EFECTIVO DE CAJA                     */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-2xs space-y-4">
        
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
              <DollarSign className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-stone-900">
                1. Convalidación de Efectivo en Caja
              </h2>
              <p className="text-xs text-stone-500">
                Comparación del dinero que dejó el turno anterior versus lo que contás hoy al abrir.
              </p>
            </div>
          </div>

          {difCaja === 0 ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Cuadrada</span>
            </span>
          ) : difCaja > 0 ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Sobrante
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Faltante</span>
            </span>
          )}
        </div>

        {/* 3 Column Grid for Cash Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Campo 1: Efectivo dejado en caja noche anterior (Solo Lectura) */}
          <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide block">
                Efectivo Noche Anterior
              </span>
              {!isReviewMode && (
                <button
                  type="button"
                  onClick={handleRefrescarCajaNoche}
                  disabled={isRefreshingCaja}
                  title="Consultar última caja cerrada nocturna en Datalive"
                  className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingCaja ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-black text-stone-800 font-mono-num">
              {fmtMoney(activeEfectivoEsperado)}
            </div>
            <p className="text-[10px] text-stone-400 truncate">
              {isReviewMode
                ? `Cierre noche de ${selectedHistoricalApertura?.turnoAnteriorCerradoPor || 'Fati'} (${selectedHistoricalApertura?.turnoAnteriorFecha})`
                : (ultimoTurnoNoche 
                    ? `Cierre ${ultimoTurnoNoche.turno} (${ultimoTurnoNoche.fecha}) por ${ultimoTurnoNoche.cerrado_por || 'Turno noche'}` 
                    : 'Último cierre registrado')}
            </p>
          </div>

          {/* Campo 2: Monto completado por el empleado */}
          <div className={`p-3.5 rounded-2xl border-2 space-y-1 ${
            isReviewMode
              ? 'bg-stone-50 border-stone-300'
              : 'bg-emerald-50/70 border-emerald-400'
          }`}>
            <label className="text-[11px] font-bold text-[#123D26] uppercase tracking-wide block">
              Efectivo Contado al Abrir
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-bold text-base">
                $
              </span>
              <input
                type="number"
                step="100"
                min="0"
                disabled={isReviewMode}
                value={isReviewMode ? efContadoNum : efectivoContado}
                onFocus={(e) => {
                  if (e.target.value === '0') e.target.select();
                }}
                onChange={(e) => {
                  if (isReviewMode) return;
                  hasUserEditedRef.current = true;
                  setEfectivoContado(e.target.value);
                }}
                placeholder="0"
                className={`w-full bg-white pl-8 pr-3 py-2 text-xl font-black text-stone-900 border rounded-xl font-mono-num ${
                  isReviewMode
                    ? 'border-stone-200 bg-stone-100/60 text-stone-800 cursor-default'
                    : 'border-emerald-300 focus:outline-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
            </div>
            <p className="text-[10px] text-emerald-800 font-medium">
              {isReviewMode ? 'Efectivo registrado en esta apertura' : 'Ingresá el total de billetes en caja'}
            </p>
          </div>

          {/* Campo 3: Comparación de Diferencia */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${
            difCaja === 0 
              ? 'bg-stone-50 border-stone-200' 
              : difCaja > 0 
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' 
              : 'bg-rose-50/90 border-rose-300 text-rose-950'
          }`}>
            <span className="text-[11px] font-bold uppercase tracking-wide opacity-80 block">
              Diferencia en Caja
            </span>
            <div className={`text-xl sm:text-2xl font-black font-mono-num ${
              difCaja === 0 ? 'text-stone-800' : difCaja > 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {difCaja === 0 ? '$ 0' : fmtSignedMoney(difCaja)}
            </div>
            <p className="text-[10px] opacity-75">
              {difCaja === 0 
                ? 'Coincide exactamente con el cierre nocturno' 
                : difCaja > 0 
                ? 'Hay dinero sobrante respecto a la noche' 
                : 'Falta dinero respecto al cierre nocturno'}
            </p>
          </div>

        </div>

        {/* Campo para Observación de Caja */}
        <div className="pt-1">
          <label className="block text-xs font-bold text-stone-700 mb-1">
            Observación de Caja {difCaja !== 0 && <span className="text-rose-600 font-normal">(Recomendada al existir diferencia)</span>}
          </label>
          <input
            type="text"
            disabled={isReviewMode}
            value={activeObsCaja}
            onChange={(e) => {
              if (isReviewMode) return;
              hasUserEditedRef.current = true;
              setObservacionesCaja(e.target.value);
            }}
            placeholder={isReviewMode ? 'Sin observaciones registradas' : 'Ej: Se contaron billetes chicos y cambio de $1.000...'}
            className={`w-full border rounded-xl px-3.5 py-2.5 text-xs text-stone-800 transition-all ${
              isReviewMode
                ? 'bg-stone-100 border-stone-200 cursor-default'
                : 'bg-stone-50 hover:bg-white focus:bg-white border-stone-300 placeholder-stone-400 focus:outline-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
            }`}
          />
        </div>

      </div>

      {/* ======================================================== */}
      {/* BLOQUE 2: AUDITORÍA DE STOCK FÍSICO NOCHE VS. APERTURA    */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-2xs space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-50 text-amber-800 rounded-xl border border-amber-200">
                <Layers className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-stone-900">
                  2. Auditoría de Stock Físico (Conteo Manual Noche vs. Apertura)
                </h2>
                <p className="text-xs text-stone-500">
                  Valores contados manualmente por el personal del turno tarde anterior versus tu conteo físico en la apertura de hoy.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                    <Clock className="w-3 h-3 text-[#1B5E38]" />
                    {isReviewMode
                      ? `Turno Tarde: ${selectedHistoricalApertura?.turnoAnteriorFecha} por ${selectedHistoricalApertura?.turnoAnteriorCerradoPor || 'Turno noche'}`
                      : `Turno Tarde: ${turnoNocheReferencia?.fecha || 'Ayer'} (${turnoNocheReferencia?.hora_cierre || '23:20'}) · Por: ${turnoNocheReferencia?.cerrado_por || 'Turno noche'}`}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" />
                    Stock Físico Manual Vinculado
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {!isReviewMode && (
              <>
                <button
                  type="button"
                  onClick={handleResetToNoche}
                  title="Copiar los valores de Contado Anoche a los casilleros de Apertura Mañana"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <span>Copiar Conteo Noche</span>
                </button>

                <button
                  type="button"
                  onClick={handlePonerEnCero}
                  title="Cambiar los valores a 0 de Apertura Mañana"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 transition-all cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Poner en 0</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setOnlyDifferences(!onlyDifferences)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyDifferences
                  ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{onlyDifferences ? 'Ver Todos' : 'Ver Solo Diferencias'}</span>
              {totalDiferenciasStock > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                  {totalDiferenciasStock}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter bar: Categories and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategoria('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all border shrink-0 ${
                selectedCategoria === 'all'
                  ? 'bg-[#123D26] text-white border-[#123D26]'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              Todos ({flatProducts.length})
            </button>
            {catalogo.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoria(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all border shrink-0 ${
                  selectedCategoria === cat.id
                    ? 'bg-[#123D26] text-white border-[#123D26]'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] sm:w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-emerald-600 focus:bg-white text-stone-800"
            />
          </div>
        </div>

        {/* Stock Items Table */}
        <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#123D26] text-white text-[11px] font-bold sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3 text-center w-28">Contado Anoche</th>
                  <th className="py-2.5 px-3 text-center w-36">Apertura Mañana</th>
                  <th className="py-2.5 px-3 text-right w-28">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-stone-400 text-xs">
                      No se encontraron productos que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => {
                    const hasDiff = p.diferencia !== 0;

                    return (
                      <tr
                        key={p.pid}
                        className={`transition-colors ${
                          hasDiff
                            ? 'bg-rose-50/70 hover:bg-rose-100/60'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-stone-50/80'
                            : 'bg-stone-50/40 hover:bg-stone-50'
                        }`}
                      >
                        {/* Producto */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-stone-900 leading-tight">
                            {p.nombre}
                          </div>
                          <div className="text-[10px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                            {p.codigo && <span>Cód: {p.codigo}</span>}
                            <span>·</span>
                            <span>{p.catNombre}</span>
                          </div>
                        </td>

                        {/* Col 1: Contado Anoche (Fijo y No Editable) */}
                        <td className="py-2.5 px-3 text-center font-bold text-stone-700 font-mono-num text-sm bg-stone-100/60 select-none">
                          {p.contadoNoche}
                        </td>

                        {/* Col 2: Apertura Mañana */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center">
                            {isReviewMode ? (
                              <span className="w-24 text-center py-1 px-2 rounded-xl text-sm font-extrabold font-mono-num bg-stone-100 border border-stone-200 text-stone-800 inline-block">
                                {p.contadoApertura}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                value={p.contadoApertura}
                                placeholder="0"
                                onFocus={(e) => {
                                  if (e.target.value === '0') e.target.select();
                                }}
                                onChange={(e) => handleStockChange(p.pid, e.target.value)}
                                className={`w-24 text-center py-1 px-2 rounded-xl text-sm font-extrabold font-mono-num border transition-all ${
                                  hasDiff
                                    ? 'bg-white border-rose-400 text-rose-900 ring-2 ring-rose-200'
                                    : 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500'
                                }`}
                              />
                            )}
                          </div>
                        </td>

                        {/* Col 3: Diferencia */}
                        <td className="py-2.5 px-3 text-right font-mono-num text-xs">
                          {p.diferencia === 0 ? (
                            <span className="text-stone-400 font-medium">0</span>
                          ) : p.diferencia > 0 ? (
                            <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-300">
                              +{p.diferencia}
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-lg border border-rose-300">
                              {p.diferencia}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer info */}
          <div className="bg-stone-50 px-4 py-2.5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
            <span>
              Mostrando <strong>{filteredProducts.length}</strong> de <strong>{flatProducts.length}</strong> productos
            </span>
            <div className="flex items-center gap-2">
              {totalDiferenciasStock === 0 ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Sin discrepancias con la noche</span>
                </span>
              ) : (
                <span className="text-rose-700 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{totalDiferenciasStock} producto(s) con diferencia detectada</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Observaciones de Stock */}
        <div className="pt-1">
          <label className="block text-xs font-bold text-stone-700 mb-1">
            Observaciones de Stock al Abrir (Opcional)
          </label>
          <textarea
            rows={2}
            disabled={isReviewMode}
            value={activeObsStock}
            onChange={(e) => {
              if (isReviewMode) return;
              hasUserEditedRef.current = true;
              setObservacionesStock(e.target.value);
            }}
            placeholder={isReviewMode ? 'Sin observaciones registradas' : 'Ej: Se recontaron las medialunas y había 1 bolsa más en depósito que no se anotó anoche...'}
            className={`w-full border rounded-xl px-3.5 py-2 text-xs text-stone-800 transition-all ${
              isReviewMode
                ? 'bg-stone-100 border-stone-200 cursor-default'
                : 'bg-stone-50 hover:bg-white focus:bg-white border-stone-300 placeholder-stone-400 focus:outline-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
            }`}
          />
        </div>

      </div>

      {/* ======================================================== */}
      {/* BLOQUE 3: ACCIONES, DESCARGA PDF, WHATSAPP Y CONFIRMAR   */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div>
          <h3 className="font-bold text-sm text-stone-900">
            {isReviewMode ? 'Acta de Apertura Histórica' : 'Finalizar Convalidación de Apertura'}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {isReviewMode 
              ? 'Podés descargar el PDF original emitido o compartirlo vía WhatsApp.'
              : 'Podés descargar el PDF firmado o compartir directamente por WhatsApp a la gerencia.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          
          {/* Botón Descargar PDF */}
          <button
            type="button"
            onClick={handleDescargarPDF}
            className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-2xs"
            title="Descargar PDF de apertura"
          >
            <FileDown className="w-4 h-4 text-stone-600" />
            <span>Descargar PDF</span>
          </button>

          {/* Botón WhatsApp */}
          <button
            type="button"
            onClick={handleCompartirWhatsApp}
            className="px-4 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
            title="Enviar reporte por WhatsApp"
          >
            <Share2 className="w-4 h-4" />
            <span>WhatsApp</span>
          </button>

          {/* Botón Guardar (Solo disponible en Modo Hoy) */}
          {!isReviewMode ? (
            <button
              type="button"
              onClick={handleGuardarApertura}
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#123D26] hover:bg-[#1A5736] text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md disabled:opacity-50"
            >
              {isSaving ? (
                <span>Guardando...</span>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>¡Guardado!</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-300" />
                  <span>Guardar Apertura</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedAperturaId('hoy')}
              className="px-5 py-2.5 bg-[#123D26] hover:bg-[#1A5736] text-white rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Apertura de Hoy</span>
            </button>
          )}

        </div>

      </div>

    </div>
  );
};
