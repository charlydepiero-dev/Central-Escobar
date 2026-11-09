import React, { useState, useEffect } from 'react';
import { useCentral } from '../context/CentralContext';
import { nf, productId, fmtMoney, fmtSignedMoney, isAdminUser } from '../utils/centralHelpers';
import { 
  CheckCircle2, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  Save, 
  Flame, 
  Send,
  RefreshCw,
  Share2,
  Sun,
  RotateCcw
} from 'lucide-react';
import { shareOrDownloadPDF } from '../utils/pdfGenerator';

export const ContarTab: React.FC = () => {
  const {
    catalogo,
    sistemaStock,
    conteoActual,
    reclamos,
    currentEmpleado,
    reclamarCategoria,
    liberarCategoria,
    pedirReaperturaCategoria,
    guardarConteoCategoria,
    actualizarConteoItem,
    marcarTerminado,
    cerrarTurnoDefinitivo,
    turnoCerrado,
    reaperturaInfo,
    forzarSincronizacionDatalive,
    currentFecha,
    currentTurno,
    cierreCaja,
    pastTurnos,
    turnoAbierto,
    aperturaInfo,
    setIsAperturaModalOpen,
    setActiveTab,
    resetearConteosTurno,
  } = useCentral();

  const [currentCatId, setCurrentCatId] = useState<string>(() => {
    return catalogo.length > 0 ? catalogo[0].id : 'empanadas';
  });

  const [localCounts, setLocalCounts] = useState<Record<string, Record<string, number | ''>>>({});

  // Cada turno nuevo o cambio de fecha arranca los conteos estrictamente en 0
  useEffect(() => {
    setLocalCounts({});
    try {
      localStorage.removeItem('central_esco_contar_drafts');
    } catch {}
  }, [currentTurno, currentFecha]);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingDatalive, setIsSyncingDatalive] = useState<boolean>(false);
  const [isReenviandoPdf, setIsReenviandoPdf] = useState<boolean>(false);
  const [isResettingCounts, setIsResettingCounts] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleActualizarDatalive = async () => {
    setIsSyncingDatalive(true);
    showToast('Conectando con Datalive para actualizar stock...');
    try {
      const res = await forzarSincronizacionDatalive();
      if (res.ok) {
        showToast(res.motivo || `✓ ${res.total} productos actualizados con Datalive.`);
      } else {
        showToast(`⚠️ ${res.motivo || 'No se pudo actualizar desde Datalive.'}`);
      }
    } catch {
      showToast('Error de conexión al sincronizar Datalive.');
    } finally {
      setIsSyncingDatalive(false);
    }
  };

  const handleReenviarPdfTurno = async () => {
    setIsReenviandoPdf(true);
    showToast('Generando y preparando PDF...');
    try {
      await shareOrDownloadPDF({
        fecha: currentFecha,
        turno: currentTurno,
        cerradoPor: currentEmpleado?.nombre || 'Colaborador',
        horaCierre: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        catalogo,
        sistemaStock,
        conteoActual,
        cierreCaja,
        reclamos,
        pastTurnos,
      }, '5491169927352');
      showToast('✓ PDF enviado con éxito.');
    } catch (err) {
      console.error('Error al reenviar PDF:', err);
      showToast('No se pudo enviar el PDF.');
    } finally {
      setIsReenviandoPdf(false);
    }
  };

  const currentCat = catalogo.find((c) => c.id === currentCatId) || catalogo[0];
  const reclamoActual = reclamos[currentCat.id];
  const miNombre = currentEmpleado?.nombre?.trim().toLowerCase();
  const reclamoEmpNombre = reclamoActual?.empleado?.trim().toLowerCase();
  const esMia = Boolean(reclamoEmpNombre && miNombre && reclamoEmpNombre === miNombre);
  const esAjena = Boolean(reclamoActual && (!miNombre || reclamoEmpNombre !== miNombre));
  const estaLibre = !reclamoActual;
  const estaTerminada = !!reclamoActual?.terminado;
  const esAdmin = isAdminUser(currentEmpleado);

  const handleInputChange = (pid: string, ubic: string, valStr: string) => {
    if (turnoCerrado || (estaLibre && !esAdmin) || (esAjena && !esAdmin) || (estaTerminada && !esMia && !esAdmin)) {
      return;
    }
    const val: number | '' = valStr === '' ? '' : Math.max(0, parseFloat(valStr) || 0);
    setLocalCounts((prev) => {
      const next: Record<string, Record<string, number | ''>> = {
        ...prev,
        [pid]: {
          ...(prev[pid] || {}),
          [ubic]: val,
        },
      };
      try {
        localStorage.setItem('central_esco_contar_drafts', JSON.stringify(next));
      } catch {}
      return next;
    });

    // Auto-persist immediately to conteoActual so values are never lost while scrolling or syncing
    actualizarConteoItem(pid, ubic, val === '' ? 0 : val);
  };

  const getUbicValue = (pid: string, ubic: string): string => {
    if (localCounts[pid] && localCounts[pid][ubic] !== undefined) {
      const val = localCounts[pid][ubic];
      return val === '' ? '' : val.toString();
    }
    const saved = conteoActual[pid]?.ubic?.[ubic];
    return saved !== undefined ? saved.toString() : '';
  };

  const getProductTotal = (cat: typeof currentCat, p: typeof currentCat.grupos[0]['productos'][0]): number => {
    const pid = productId(cat.id, p);
    let total = 0;
    cat.ubicaciones.forEach((u) => {
      const val = getUbicValue(pid, u);
      total += parseFloat(val) || 0;
    });
    return total;
  };

  const handleTomar = async () => {
    const res = await reclamarCategoria(currentCat.id);
    if (res.ok) {
      showToast(`✓ Tomaste ${currentCat.nombre} para contar`);
    } else {
      showToast(res.motivo || 'No se pudo tomar la categoría');
    }
  };

  const handleLiberar = async () => {
    const res = await liberarCategoria(currentCat.id);
    if (res.ok) {
      showToast(`✓ Categoría ${currentCat.nombre} liberada`);
    } else {
      showToast(res.motivo || 'No se pudo liberar');
    }
  };

  const handlePedirReapertura = () => {
    const res = pedirReaperturaCategoria(currentCat.id);
    showToast(res.mensaje);
  };

  const handleGuardarCategoria = (targetCatId?: string, terminar: boolean = false) => {
    const catToSave = targetCatId ? catalogo.find(c => c.id === targetCatId) || currentCat : currentCat;
    // Solo permitir guardar si el bloque fue tomado por el usuario o si es Admin
    const r = reclamos[catToSave.id];
    const isMine = r && r.empleado === currentEmpleado?.nombre;
    if (!isMine && !esAdmin) {
      return;
    }
    // Si el bloque está libre (nadie lo tomó) y no es una acción explícita de terminar, no guardar ni auto-reclamar
    if (!r && !terminar) {
      return;
    }

    const itemsToSave: { productId: string; ubicaciones: Record<string, number> }[] = [];

    catToSave.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(catToSave.id, p);
        const ubicMap: Record<string, number> = {};
        catToSave.ubicaciones.forEach((u) => {
          const val = getUbicValue(pid, u);
          ubicMap[u] = parseFloat(val) || 0;
        });
        itemsToSave.push({ productId: pid, ubicaciones: ubicMap });
      });
    });

    guardarConteoCategoria(catToSave.id, itemsToSave, terminar);
    if (!targetCatId) {
      const msg = terminar
        ? `✓ Conteo de ${catToSave.nombre} finalizado y guardado.`
        : `Guardado - ${catToSave.nombre}`;
      setSaveSuccessMsg(msg);
      showToast(msg);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    }
  };

  const handleTermineConteo = () => {
    if (esMia || esAdmin) {
      handleGuardarCategoria(undefined, true);
    }
    const res = marcarTerminado();
    if (res.puedeCerrar) {
      cerrarTurnoDefinitivo();
      showToast('¡Turno finalizado! Se abrió el resumen de cierre.');
    } else if (res.faltantes && res.faltantes.length > 0) {
      showToast(`Anotamos que terminaste tu parte. Faltan contar: ${res.faltantes.join(', ')}.`);
    } else {
      showToast('✓ Stock completo y guardado. Ahora cargá y cerrá la Caja para finalizar el turno.');
      setTimeout(() => setActiveTab('caja'), 1200);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      
      {/* Toast popup */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#164E2F] text-white px-5 py-3 rounded-xl shadow-xl text-xs font-bold font-heading border border-emerald-400/40">
          {toastMessage}
        </div>
      )}

      {/* Aviso de reapertura si existe */}
      {reaperturaInfo && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <p>
            Turno reabierto por <strong>{reaperturaInfo.reabierto_por}</strong> a las {reaperturaInfo.hora_reapertura}. (Cierre previo de {reaperturaInfo.cerrado_por}).
          </p>
        </div>
      )}

      {/* Turno cerrado aviso */}
      {turnoCerrado && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <p className="font-bold text-sm">Este turno ya fue cerrado oficialmente.</p>
              <p className="text-emerald-800">Podés ver el resumen completo o abrir un nuevo turno para continuar cargando stock.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAperturaModalOpen(true)}
            className="px-4 py-2 bg-[#123D26] hover:bg-[#1A5736] text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-2 shrink-0"
          >
            <Sun className="w-4 h-4 text-amber-300" />
            <span>Abrir Nuevo Turno</span>
          </button>
        </div>
      )}

      {/* Banner de Apertura de Turno: Exclusivo del Turno Mañana */}
      {currentTurno === 'Mañana' && !turnoAbierto ? (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-amber-400/20 text-amber-800 rounded-xl mt-0.5 shrink-0">
              <Sun className="w-5 h-5 text-amber-600" />
            </span>
            <div>
              <p className="font-black text-sm text-stone-900">Apertura de Turno Pendiente</p>
              <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                El colaborador que abre el local a la mañana puede registrar el arqueo de efectivo y stock inicial.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsAperturaModalOpen(true)}
              className="px-4 py-2 bg-[#123D26] hover:bg-[#1A5736] text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-2 shrink-0 animate-pulse"
            >
              <Sun className="w-4 h-4 text-amber-300" />
              <span>Abrir Turno</span>
            </button>
            <button
              onClick={() => setActiveTab('apertura')}
              className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold rounded-xl border border-amber-300 cursor-pointer transition-all"
            >
              Ver Detalle
            </button>
          </div>
        </div>
      ) : (currentTurno === 'Mañana' && aperturaInfo) ? (
        <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Turno {aperturaInfo.turno} Abierto</strong> por {aperturaInfo.abierto_por} ({aperturaInfo.hora_apertura}) · Efectivo inicial: {fmtMoney(aperturaInfo.efectivo_convalidado)} {aperturaInfo.diferencia_apertura !== 0 && `(Dif: ${fmtSignedMoney(aperturaInfo.diferencia_apertura)})`}
            </span>
          </div>
          <button
            onClick={() => setActiveTab('apertura')}
            className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
          >
            Ver apertura del día
          </button>
        </div>
      ) : null}

      {/* Quick Action Bar for Staff */}
      <div className="bg-white p-2.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-stone-600 font-medium">
          <span className="font-bold text-[#123D26] uppercase text-[11px] tracking-wide">Acciones de Turno:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón de Apertura solo visible en Turno Mañana */}
          {currentTurno === 'Mañana' && (
            <button
              type="button"
              onClick={() => setActiveTab('apertura')}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-stone-900 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Ir a Apertura del Día y auditoría física"
            >
              <Sun className="w-3.5 h-3.5 text-amber-600" />
              <span>Apertura del Día</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              setIsResettingCounts(true);
              await resetearConteosTurno();
              setIsResettingCounts(false);
              showToast('✓ Conteos reiniciados a 0 para este turno.');
            }}
            disabled={isResettingCounts}
            className="px-3 py-1.5 bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            title="Reiniciar todos los casilleros de conteo a 0"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResettingCounts ? 'animate-spin text-stone-600' : 'text-stone-500'}`} />
            <span>Poner en 0</span>
          </button>

          <button
            type="button"
            onClick={handleActualizarDatalive}
            disabled={isSyncingDatalive}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#123D26] border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            title="Sincronizar el stock del sistema con Datalive ahora"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#1B5E38] ${isSyncingDatalive ? 'animate-spin' : ''}`} />
            <span>{isSyncingDatalive ? 'Actualizando...' : 'Actualizar Datalive'}</span>
          </button>
          
          <button
            type="button"
            onClick={handleReenviarPdfTurno}
            disabled={isReenviandoPdf}
            className="px-3 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            title="Reenviar el reporte PDF del turno por WhatsApp al bot o contactos"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{isReenviandoPdf ? 'Enviando...' : 'Reenviar PDF'}</span>
          </button>
        </div>
      </div>

      {/* Category Scroller Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
        {catalogo.map((c) => {
          const r = reclamos[c.id];
          const mio = r && r.empleado === currentEmpleado?.nombre;
          const ajeno = r && r.empleado !== currentEmpleado?.nombre;
          const terminada = !!r?.terminado;

          let badgeIcon = '';
          if (mio) badgeIcon = terminada ? ' ✓' : ' ●';
          else if (ajeno) badgeIcon = terminada ? ' ✓' : ' 🔒';

          return (
            <button
              key={c.id}
              onClick={() => {
                if (c.id !== currentCatId) {
                  // Solo navegar y ver el bloque. NUNCA reclamar ni auto-asignar al cambiar de categoría.
                  setCurrentCatId(c.id);
                }
              }}
              className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all border shrink-0 ${
                c.id === currentCatId
                  ? 'bg-[#1B5E38] text-white border-[#1B5E38] shadow-xs'
                  : mio
                  ? 'bg-emerald-100 text-[#123D26] border-emerald-300'
                  : ajeno
                  ? 'bg-stone-100 text-stone-400 border-stone-200'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}
            >
              {c.nombre}
              {badgeIcon && <span className="ml-1 text-[11px]">{badgeIcon}</span>}
            </button>
          );
        })}
      </div>

      {/* Category Block Status & Lock Control Card */}
      <div className={`rounded-2xl p-3.5 border transition-all text-xs shadow-2xs ${
        estaLibre
          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
          : esMia
          ? 'bg-emerald-100/80 border-emerald-400 text-emerald-950'
          : 'bg-amber-50/80 border-amber-300 text-amber-950'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className={`p-2 rounded-xl mt-0.5 sm:mt-0 shrink-0 ${
              estaLibre
                ? 'bg-emerald-200 text-emerald-800'
                : esMia
                ? 'bg-emerald-200 text-emerald-800'
                : 'bg-amber-200 text-amber-900'
            }`}>
              {estaLibre ? (
                <Unlock className="w-4 h-4" />
              ) : esMia ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-sm">
                  {estaLibre && `Bloque libre: ${currentCat.nombre}`}
                  {esMia && (estaTerminada ? `Conteo finalizado por vos (${currentEmpleado?.nombre})` : `Estás contando ${currentCat.nombre}`)}
                  {esAjena && (estaTerminada ? `Conteo finalizado por ${reclamoActual?.empleado}` : `Bloque tomado por ${reclamoActual?.empleado}`)}
                </span>
                {reclamoActual?.hora && (
                  <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-white/70 border border-current opacity-80">
                    {reclamoActual.hora}
                  </span>
                )}
                {(esAjena || (estaTerminada && !esMia && !esAdmin)) && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300">
                    Solo Lectura
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-85 mt-0.5">
                {estaLibre && 'Ningún empleado ha tomado este bloque. Podés tomarlo para comenzar a contar.'}
                {esMia && (estaTerminada
                  ? 'El conteo está guardado y blindado contra edición de otros empleados. Podés seguir ajustando o liberarlo.'
                  : 'Ningún otro empleado puede editar mientras tengas este bloque tomado.')}
                {esAjena && (estaTerminada
                  ? `Las cantidades cargadas por ${reclamoActual?.empleado} están guardadas. Podés ver todo en pantalla sin poder editar.`
                  : `${reclamoActual?.empleado} está cargando cantidades. Podés ver los números en vivo sin poder modificarlos.`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {estaLibre && !turnoCerrado && (
              <button
                type="button"
                onClick={handleTomar}
                className="px-3.5 py-1.5 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                Tomar bloque
              </button>
            )}

            {esMia && !turnoCerrado && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleGuardarCategoria(undefined, true)}
                  className="px-3 py-1.5 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
                  title="Guardar y marcar conteo de este bloque como finalizado"
                >
                  ✓ Terminar bloque
                </button>
                <button
                  type="button"
                  onClick={handleLiberar}
                  className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold rounded-xl cursor-pointer transition-colors"
                  title="Liberar este bloque para que otro empleado pueda tomarlo"
                >
                  Liberar
                </button>
              </div>
            )}

            {esAjena && (
              <button
                type="button"
                onClick={async () => {
                  if (esAdmin) {
                    await liberarCategoria(currentCat.id);
                    showToast(`Liberaste ${currentCat.nombre} como Administrador`);
                  } else {
                    handlePedirReapertura();
                  }
                }}
                className={`px-3 py-1.5 font-bold rounded-xl cursor-pointer transition-colors shadow-2xs ${
                  esAdmin
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {esAdmin ? 'Liberar bloque (Admin)' : 'Reabrir / Liberar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BLOQUE DE TOTAL CONSOLIDADO (PUNTO 7: idem a cualquier gusto con total por ubicaciones y sistema) */}
      {(() => {
        const ubicTotals: Record<string, number> = {};
        currentCat.ubicaciones.forEach((u) => {
          ubicTotals[u] = 0;
        });

        let catTotalContado = 0;
        let catTotalSistema = 0;

        currentCat.grupos.forEach((g) => {
          g.productos.forEach((p) => {
            const pid = productId(currentCat.id, p);
            currentCat.ubicaciones.forEach((u) => {
              const val = parseFloat(getUbicValue(pid, u)) || 0;
              ubicTotals[u] += val;
              catTotalContado += val;
            });
            const sys = sistemaStock[pid]?.stock ?? 0;
            catTotalSistema += sys;
          });
        });

        const catDiff = catTotalContado - catTotalSistema;

        return (
          <div className="bg-[#123D26] text-white rounded-2xl p-4 border border-[#164E2F] shadow-md">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-emerald-800/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  {currentCat.id === 'empanadas' ? 'Total Empanadas (Todas las variedades)' : `Total Consolidado · ${currentCat.nombre}`}
                </span>
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>{currentCat.id === 'empanadas' ? '🥟 Total General de Empanadas' : `Total ${currentCat.nombre}`}</span>
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-800/80 text-emerald-200 border border-emerald-700/60 font-mono-num">
                {currentCat.grupos.flatMap((g) => g.productos).length} variedades
              </span>
            </div>

            {/* Totales por Ubicación */}
            <div className="flex gap-2 flex-wrap mb-3">
              {currentCat.ubicaciones.map((ubic) => (
                <div key={ubic} className="flex-1 min-w-[85px] bg-[#0E2F1D] p-2.5 rounded-xl border border-emerald-800/50 text-center">
                  <label className="block text-[11px] font-semibold text-emerald-300 truncate mb-0.5">
                    {ubic}
                  </label>
                  <span className="text-base font-bold font-mono-num text-white">
                    {nf(ubicTotals[ubic])}
                  </span>
                </div>
              ))}
            </div>

            {/* Resumen Total Contado, Sistema y Diferencia */}
            <div className="pt-2 border-t border-emerald-800/70 grid grid-cols-3 gap-2 text-center font-mono-num text-xs">
              <div className="bg-[#164E2F]/60 p-2 rounded-xl">
                <span className="block text-[10px] uppercase font-sans text-emerald-300 font-bold">
                  Total
                </span>
                <span className="font-black text-sm sm:text-base text-white">
                  {nf(catTotalContado)}
                </span>
              </div>
              <div className="bg-[#164E2F]/60 p-2 rounded-xl">
                <span className="block text-[10px] uppercase font-sans text-emerald-300 font-bold">
                  Sistema
                </span>
                <span className="font-semibold text-sm sm:text-base text-emerald-100">
                  {catTotalSistema === 0 ? '—' : nf(catTotalSistema)}
                </span>
              </div>
              <div className={`p-2 rounded-xl ${catDiff === 0 ? 'bg-[#164E2F]/60' : catDiff > 0 ? 'bg-emerald-900/90 text-emerald-300' : 'bg-rose-950/80 text-rose-300'}`}>
                <span className="block text-[10px] uppercase font-sans font-bold opacity-80">
                  Diferencia
                </span>
                <span className="font-black text-sm sm:text-base">
                  {catDiff === 0 ? '0' : catDiff > 0 ? `+${catDiff}` : catDiff}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Product Cards for Current Category */}
      <div className="space-y-3.5">
        {currentCat.grupos.map((grupo, gIdx) => (
          <div key={gIdx} className="space-y-2.5">
            {grupo.nombre && (
              <h2 className="text-xs uppercase tracking-wider font-bold text-stone-500 pt-2 px-1">
                {grupo.nombre}
              </h2>
            )}

            <div className="grid grid-cols-1 gap-2.5">
              {grupo.productos.map((prod) => {
                const pid = productId(currentCat.id, prod);
                const totalContado = getProductTotal(currentCat, prod);
                const sysVal = sistemaStock[pid]?.stock ?? null;
                const diff = sysVal !== null ? totalContado - sysVal : null;

                // Bloqueo estricto multiusuario: el bloque debe ser tomado primero para editar (los admin pueden editar libremente)
                const isLockedInputs = Boolean(turnoCerrado || (estaLibre && !esAdmin) || (esAjena && !esAdmin) || (estaTerminada && !esMia && !esAdmin));

                return (
                  <div
                    key={pid}
                    onClick={() => {
                      if (estaLibre && !turnoCerrado && !esAdmin) {
                        handleTomar();
                      }
                    }}
                    className={`bg-white rounded-2xl p-3.5 border transition-all ${
                      isLockedInputs
                        ? 'border-stone-200 opacity-75'
                        : 'border-stone-300 hover:border-emerald-600 shadow-2xs'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <h3 className="font-bold text-sm text-stone-900 leading-tight">
                        {prod.nombre}
                      </h3>
                      {prod.codigo && (
                        <span className="text-[11px] font-mono-num text-stone-400">
                           Cod: {prod.codigo}
                        </span>
                      )}
                    </div>

                    {/* Location input fields */}
                    <div className="flex gap-2 flex-wrap mb-3">
                      {currentCat.ubicaciones.map((ubic) => (
                        <div key={ubic} className="flex-1 min-w-[85px]">
                          <label className="block text-[11px] font-medium text-stone-500 mb-1 text-center truncate">
                            {ubic}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="1"
                            disabled={isLockedInputs}
                            value={getUbicValue(pid, ubic)}
                            onFocus={(e) => {
                              if (e.target.value === '0') e.target.select();
                            }}
                            onChange={(e) => handleInputChange(pid, ubic, e.target.value)}
                            placeholder="0"
                            className={`w-full py-2 px-1 text-center font-bold text-base font-mono-num rounded-xl border transition-all ${
                              isLockedInputs
                                ? 'bg-stone-100 text-stone-400 border-stone-200'
                                : 'bg-stone-50 text-stone-900 border-stone-300 focus:bg-white focus:border-[#1B5E38] focus:ring-1 focus:ring-[#1B5E38]'
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Summary row */}
                    <div className="pt-2.5 border-t border-dashed border-stone-200 flex items-center justify-between text-center font-mono-num text-xs">
                      <div className="flex-1">
                        <span className="block text-[10px] uppercase font-sans text-stone-400 font-semibold tracking-wider">
                          Total
                        </span>
                        <span className="font-bold text-sm text-stone-900">
                          {nf(totalContado)}
                        </span>
                      </div>
                      <div className="flex-1 border-x border-stone-100">
                        <span className="block text-[10px] uppercase font-sans text-stone-400 font-semibold tracking-wider">
                          Sistema
                        </span>
                        <span className="font-semibold text-stone-600">
                          {sysVal === null ? '—' : nf(sysVal)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <span className="block text-[10px] uppercase font-sans text-stone-400 font-semibold tracking-wider">
                          Diferencia
                        </span>
                        <span
                          className={`font-black text-sm ${
                            diff === null || diff === 0
                              ? 'text-stone-500'
                              : diff > 0
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {diff === null ? '—' : diff === 0 ? '0' : (diff > 0 ? `+${diff}` : diff)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Save Button Bar */}
      {(esMia || estaLibre || esAdmin) && !turnoCerrado && (
        <div className="sticky bottom-20 z-20 flex flex-col items-center pt-2">
          <button
            onClick={() => handleGuardarCategoria(undefined, true)}
            className="px-6 py-3 bg-[#1B5E38] hover:bg-[#14472B] text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-2 cursor-pointer border border-emerald-400/40"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Guardar y finalizar bloque de {currentCat.nombre.toLowerCase()}</span>
          </button>
          {saveSuccessMsg && (
            <p className="text-xs text-emerald-800 font-bold mt-1 bg-white/90 px-3 py-0.5 rounded-full shadow-2xs">
              {saveSuccessMsg}
            </p>
          )}
        </div>
      )}

      {/* Terminé mi conteo button */}
      {!turnoCerrado && (
        <div className="pt-4 pb-12">
          <button
            onClick={handleTermineConteo}
            translate="no"
            className="w-full py-4 px-6 bg-[#123D26] hover:bg-[#0E2F1D] text-white font-extrabold text-sm uppercase tracking-wide rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-700/50 notranslate"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span translate="no" className="notranslate">Terminé mi conteo</span>
          </button>
        </div>
      )}

    </div>
  );
};
