import React, { useState, useEffect, useRef } from 'react';
import { useCentral } from '../context/CentralContext';
import { fmtMoney, fmtSignedMoney, nf, isAdminUser } from '../utils/centralHelpers';
import { 
  CreditCard, 
  Banknote, 
  Scale, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  Trash2, 
  Save,
  Share2,
  FileText,
  Download,
  AlertTriangle,
  X,
  ExternalLink
} from 'lucide-react';
import { shareOrDownloadPDF } from '../utils/pdfGenerator';
import { CierreCajaData } from '../types/central';

export const CajaTab: React.FC = () => {
  const {
    cierreCaja,
    reclamos,
    currentEmpleado,
    reclamarCategoria,
    liberarCategoria,
    pedirReaperturaCategoria,
    actualizarCierreCajaLive,
    guardarCierreCaja,
    borrarCierreCaja,
    turnoCerrado,
    cerrarTurnoDefinitivo,
    verificarCierreTurno,
    setResumenModalData,
    setActiveTab,
    catalogo,
    sistemaStock,
    conteoActual,
    pastTurnos,
    currentFecha,
    currentTurno,
  } = useCentral();

  const reclamoCaja = reclamos['caja'];
  const esMia = reclamoCaja?.empleado === currentEmpleado?.nombre;
  const esAjena = reclamoCaja && reclamoCaja.empleado !== currentEmpleado?.nombre;
  const estaLibre = !reclamoCaja;
  const estaTerminada = !!reclamoCaja?.terminado;

  const getDrafts = (): Record<string, string> => {
    try {
      const raw = localStorage.getItem('central_esco_caja_drafts');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const getInitialVal = (val: number | undefined | null, field: string): string => {
    const drafts = getDrafts();
    if (drafts[field] !== undefined && drafts[field] !== null) {
      return drafts[field];
    }
    if (cierreCaja.existe && val !== undefined && val !== null && val !== 0) {
      return val.toString();
    }
    return '';
  };

  // Form states cleanly initialized (empty string by default so placeholder "0" shows without forcing 0)
  const [pAma, setPAma] = useState<string>(() => getInitialVal(cierreCaja.postnet_amarillo, 'pAma'));
  const [pRos, setPRos] = useState<string>(() => getInitialVal(cierreCaja.postnet_rosa, 'pRos'));
  const [pBla, setPBla] = useState<string>(() => getInitialVal(cierreCaja.postnet_blanco, 'pBla'));
  const [ols, setOls] = useState<string>(() => getInitialVal(cierreCaja.online_local_sist, 'ols'));
  const [efr, setEfr] = useState<string>(() => getInitialVal(cierreCaja.efectivo_real, 'efr'));
  const [ems, setEms] = useState<string>(() => getInitialVal(cierreCaja.efectivo_mostrador_sist, 'ems'));
  const [obs, setObs] = useState<string>(() => {
    const drafts = getDrafts();
    return drafts.obs !== undefined && drafts.obs !== null ? drafts.obs : (cierreCaja.observaciones || '');
  });

  // Detailed breakdown from Datalive
  const [selectedDlCodVentas, setSelectedDlCodVentas] = useState<string>(cierreCaja.datalive_cod_ventas || '');
  const [cajasDisponibles, setCajasDisponibles] = useState<any[]>([]);
  const [dlDetalleInfo, setDlDetalleInfo] = useState<{
    codVentas?: string;
    turno?: string;
    fecha?: string;
    estado?: string;
    saldoInicial: number;
    efectivoMostrador: number;
    pedidosYaEfectivo: number;
    gastos: number;
    egresos: number;
    sueldos: number;
    totalSalidas: number;
    teoricoTotal: number;
    gastosItems?: { concepto: string; monto: number }[];
    egresosItems?: { concepto: string; monto: number }[];
    sueldosItems?: { empleado: string; monto: number }[];
  } | null>(() => {
    if (cierreCaja.saldo_inicial_sist !== undefined || cierreCaja.efectivo_mostrador_puro !== undefined) {
      const ini = cierreCaja.saldo_inicial_sist || 0;
      const mos = cierreCaja.efectivo_mostrador_puro || 0;
      const peya = cierreCaja.efectivo_peya_sist || 0;
      const gas = Math.abs(cierreCaja.gastos_sist || 0);
      const egr = Math.abs(cierreCaja.egresos_sist || 0);
      const sue = Math.abs(cierreCaja.sueldos_sist || 0);
      const salidas = gas + egr + sue;
      return {
        codVentas: cierreCaja.datalive_cod_ventas,
        turno: cierreCaja.datalive_turno || currentTurno,
        saldoInicial: ini,
        efectivoMostrador: mos,
        pedidosYaEfectivo: peya,
        gastos: gas,
        egresos: egr,
        sueldos: sue,
        totalSalidas: salidas,
        teoricoTotal: ini + mos + peya - salidas,
      };
    }
    return null;
  });

  const isDirtyRef = useRef<boolean>(false);

  // Manejo unificado de cambios en los casilleros con auto-reclamo y persistencia en vivo hacia el servidor
  const handleFieldChange = (field: 'pAma' | 'pRos' | 'pBla' | 'ols' | 'efr' | 'ems' | 'obs', val: string) => {
    isDirtyRef.current = true;
    if (field === 'pAma') setPAma(val);
    else if (field === 'pRos') setPRos(val);
    else if (field === 'pBla') setPBla(val);
    else if (field === 'ols') setOls(val);
    else if (field === 'efr') setEfr(val);
    else if (field === 'ems') setEms(val);
    else if (field === 'obs') setObs(val);

    try {
      const drafts = getDrafts();
      drafts[field] = val;
      localStorage.setItem('central_esco_caja_drafts', JSON.stringify(drafts));
    } catch {}

    // Persistir de inmediato al contexto y servidor en tiempo real para que todos los empleados
    // vean en vivo los valores cargados en modo solo lectura
    const vAma = field === 'pAma' ? (parseFloat(val) || 0) : (parseFloat(pAma) || 0);
    const vRos = field === 'pRos' ? (parseFloat(val) || 0) : (parseFloat(pRos) || 0);
    const vBla = field === 'pBla' ? (parseFloat(val) || 0) : (parseFloat(pBla) || 0);
    const vOls = field === 'ols' ? (parseFloat(val) || 0) : (parseFloat(ols) || 0);
    const vEfr = field === 'efr' ? (parseFloat(val) || 0) : (parseFloat(efr) || 0);
    const vEms = field === 'ems' ? (parseFloat(val) || 0) : (parseFloat(ems) || 0);
    const vObs = field === 'obs' ? val : obs;

    actualizarCierreCajaLive({
      postnet_amarillo: vAma,
      postnet_rosa: vRos,
      postnet_blanco: vBla,
      online_local_sist: vOls,
      efectivo_real: vEfr,
      efectivo_mostrador_sist: vEms,
      observaciones: vObs,
      saldo_inicial_sist: dlDetalleInfo?.saldoInicial,
      efectivo_mostrador_puro: dlDetalleInfo?.efectivoMostrador,
      efectivo_peya_sist: dlDetalleInfo?.pedidosYaEfectivo,
      gastos_sist: dlDetalleInfo?.gastos,
      egresos_sist: dlDetalleInfo?.egresos,
      sueldos_sist: dlDetalleInfo?.sueldos,
      datalive_cod_ventas: dlDetalleInfo?.codVentas,
      datalive_turno: dlDetalleInfo?.turno || currentTurno,
    }, false);
  };

  useEffect(() => {
    // Si el usuario actual es dueño de la caja y está editando activamente sus campos, no pisar
    if (isDirtyRef.current && esMia) return;

    if (cierreCaja.existe) {
      if (cierreCaja.postnet_amarillo !== undefined && cierreCaja.postnet_amarillo !== null) {
        setPAma(cierreCaja.postnet_amarillo ? cierreCaja.postnet_amarillo.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.postnet_rosa !== undefined && cierreCaja.postnet_rosa !== null) {
        setPRos(cierreCaja.postnet_rosa ? cierreCaja.postnet_rosa.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.postnet_blanco !== undefined && cierreCaja.postnet_blanco !== null) {
        setPBla(cierreCaja.postnet_blanco ? cierreCaja.postnet_blanco.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.online_local_sist !== undefined && cierreCaja.online_local_sist !== null) {
        setOls(cierreCaja.online_local_sist ? cierreCaja.online_local_sist.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.efectivo_real !== undefined && cierreCaja.efectivo_real !== null) {
        setEfr(cierreCaja.efectivo_real ? cierreCaja.efectivo_real.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.efectivo_mostrador_sist !== undefined && cierreCaja.efectivo_mostrador_sist !== null) {
        setEms(cierreCaja.efectivo_mostrador_sist ? cierreCaja.efectivo_mostrador_sist.toString() : (esAjena ? '0' : ''));
      }
      if (cierreCaja.observaciones !== undefined) {
        setObs(cierreCaja.observaciones || '');
      }
    }
    if (cierreCaja.saldo_inicial_sist !== undefined || cierreCaja.efectivo_mostrador_puro !== undefined) {
      const ini = cierreCaja.saldo_inicial_sist || 0;
      const mos = cierreCaja.efectivo_mostrador_puro || 0;
      const peya = cierreCaja.efectivo_peya_sist || 0;
      const gas = Math.abs(cierreCaja.gastos_sist || 0);
      const egr = Math.abs(cierreCaja.egresos_sist || 0);
      const sue = Math.abs(cierreCaja.sueldos_sist || 0);
      const salidas = gas + egr + sue;
      setDlDetalleInfo({
        codVentas: cierreCaja.datalive_cod_ventas,
        turno: cierreCaja.datalive_turno || currentTurno,
        saldoInicial: ini,
        efectivoMostrador: mos,
        pedidosYaEfectivo: peya,
        gastos: gas,
        egresos: egr,
        sueldos: sue,
        totalSalidas: salidas,
        teoricoTotal: ini + mos + peya - salidas,
      });
    }
  }, [cierreCaja, currentTurno, esMia, esAjena]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Calculations
  const numPAma = parseFloat(pAma) || 0;
  const numPRos = parseFloat(pRos) || 0;
  const numPBla = parseFloat(pBla) || 0;
  const numOls = parseFloat(ols) || 0;
  const numEfr = parseFloat(efr) || 0;
  const numEms = parseFloat(ems) || 0;

  const sumaPostnets = numPAma + numPRos + numPBla;
  const difPostnets = sumaPostnets - numOls;
  const difEfectivo = numEfr - numEms;
  const saldoTotal = difPostnets + difEfectivo;

  const esAdmin = isAdminUser(currentEmpleado);
  // Bloqueo estricto multiusuario: solo quien tomó la caja o un Admin puede editar
  const isLocked = Boolean(turnoCerrado || (esAjena && !esAdmin) || (estaTerminada && !esMia && !esAdmin));
  const [isReenviandoPdf, setIsReenviandoPdf] = useState<boolean>(false);
  const [isSyncingDl, setIsSyncingDl] = useState<boolean>(false);
  const [isCerrandoTurno, setIsCerrandoTurno] = useState<boolean>(false);
  const [cierreTurnoModalOpen, setCierreTurnoModalOpen] = useState<boolean>(false);
  const [cierreResultPdfUrl, setCierreResultPdfUrl] = useState<string | null>(null);
  const [confirmFaltantesModal, setConfirmFaltantesModal] = useState<{ open: boolean; faltantes: string[] }>({
    open: false,
    faltantes: [],
  });

  const handleSincronizarCajaDatalive = async (targetCod?: string) => {
    setIsSyncingDl(true);
    showToast(`Consultando Datalive para Turno ${currentTurno}...`);
    try {
      const cod = targetCod || selectedDlCodVentas;
      const url = cod
        ? `/api/datalive/caja/detalle?cod_ventas=${encodeURIComponent(cod)}`
        : `/api/datalive/caja/detalle?turno=${encodeURIComponent(currentTurno)}&fecha=${encodeURIComponent(currentFecha)}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.ok || !data.detalle) {
        showToast(data.error || 'No se pudo obtener datos de Datalive');
        return;
      }
      const d = data.detalle;
      if (Array.isArray(data.cajasDisponibles)) {
        setCajasDisponibles(data.cajasDisponibles);
      }
      setSelectedDlCodVentas(d.codVentas);

      // Teórico total en caja = Saldo Inicial + Efectivo Mostrador + Efectivo PedidosYa - Gastos - Egresos - Sueldos
      const saldoIni = d.dineroInicio || 0;
      const efMostrador = d.efectivoMostrador || 0;
      const efPeya = d.pedidosYaEfectivo || 0;
      const gastosVal = Math.abs(d.totalGastos || 0) || (d.gastos?.reduce((acc: number, g: any) => acc + Math.abs(g.monto || 0), 0) || 0);
      const egresosVal = Math.abs(d.totalEgresos || 0) || (d.egresos?.reduce((acc: number, e: any) => acc + Math.abs(e.monto || 0), 0) || 0);
      const sueldosVal = Math.abs(d.totalSueldos || 0) || (d.sueldos?.reduce((acc: number, s: any) => acc + Math.abs(s.monto || 0), 0) || 0);
      const totalSalidas = gastosVal + egresosVal + sueldosVal;
      const totalTeorico = saldoIni + efMostrador + efPeya - totalSalidas;

      const olsVal = d.onlineLocal !== undefined && d.onlineLocal !== null ? d.onlineLocal.toString() : '0';
      const emsVal = totalTeorico.toString();
      isDirtyRef.current = true;
      setOls(olsVal);
      setEms(emsVal);
      try {
        const drafts = getDrafts();
        drafts.ols = olsVal;
        drafts.ems = emsVal;
        localStorage.setItem('central_esco_caja_drafts', JSON.stringify(drafts));
      } catch {}

      setDlDetalleInfo({
        codVentas: d.codVentas,
        turno: d.turnoTexto || currentTurno,
        fecha: d.fechaTexto || '',
        estado: d.estado || '',
        saldoInicial: saldoIni,
        efectivoMostrador: efMostrador,
        pedidosYaEfectivo: efPeya,
        gastos: gastosVal,
        egresos: egresosVal,
        sueldos: sueldosVal,
        totalSalidas,
        teoricoTotal: totalTeorico,
        gastosItems: d.gastos?.map((g: any) => ({ concepto: g.concepto || 'Varios', monto: Math.abs(g.monto || 0) })),
        egresosItems: d.egresos?.map((e: any) => ({ concepto: e.concepto || 'Egreso', monto: Math.abs(e.monto || 0) })),
        sueldosItems: d.sueldos?.map((s: any) => ({ empleado: s.empleado || 'Personal', monto: Math.abs(s.monto || 0) })),
      });

      showToast(`✓ Datalive (${d.turnoTexto || currentTurno}): Teórico $${fmtMoney(totalTeorico)} (Caja #${d.codVentas})`);
    } catch (e: any) {
      showToast('Error al conectar con Datalive');
    } finally {
      setIsSyncingDl(false);
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

  const handleTomarCaja = async () => {
    const res = await reclamarCategoria('caja');
    if (res.ok) {
      showToast('Tomaste el cierre de caja');
    } else {
      showToast(res.motivo || 'No se pudo tomar la caja');
    }
  };

  const handleLiberarCaja = async () => {
    isDirtyRef.current = false;
    try {
      localStorage.removeItem('central_esco_caja_drafts');
    } catch {}
    const res = await liberarCategoria('caja');
    if (res.ok) {
      showToast('Cierre de caja liberado');
    } else {
      showToast(res.motivo || 'No se pudo liberar');
    }
  };

  const handleGuardarCaja = () => {
    isDirtyRef.current = false;
    try {
      localStorage.removeItem('central_esco_caja_drafts');
    } catch {}
    guardarCierreCaja({
      postnet_amarillo: numPAma,
      postnet_rosa: numPRos,
      postnet_blanco: numPBla,
      online_local_sist: numOls,
      efectivo_real: numEfr,
      efectivo_mostrador_sist: numEms,
      saldo_inicial_sist: dlDetalleInfo?.saldoInicial,
      efectivo_mostrador_puro: dlDetalleInfo?.efectivoMostrador,
      efectivo_peya_sist: dlDetalleInfo?.pedidosYaEfectivo,
      gastos_sist: dlDetalleInfo?.gastos,
      egresos_sist: dlDetalleInfo?.egresos,
      sueldos_sist: dlDetalleInfo?.sueldos,
      datalive_cod_ventas: dlDetalleInfo?.codVentas,
      datalive_turno: dlDetalleInfo?.turno,
      observaciones: obs.trim(),
    });
    showToast('Cierre de caja guardado con éxito');
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleBorrarCaja = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      showToast('Tocá de nuevo «Borrar» para confirmar');
      return;
    }
    isDirtyRef.current = false;
    try {
      localStorage.removeItem('central_esco_caja_drafts');
    } catch {}
    setPAma('');
    setPRos('');
    setPBla('');
    setOls('');
    setEfr('');
    setEms('');
    setObs('');
    borrarCierreCaja();
    setConfirmDelete(false);
    showToast('Cierre de caja eliminado');
  };

  const handleCierreTurnoClick = () => {
    // 1) Guardar caja actual
    handleGuardarCaja();

    // 2) Validar si faltan categorías de stock
    const check = verificarCierreTurno();
    if (!check.puedeCerrar && check.faltantes && check.faltantes.length > 0) {
      setConfirmFaltantesModal({ open: true, faltantes: check.faltantes });
      return;
    }

    // 3) Proceder con cierre definitivo y PDF
    ejecutarCierreTurnoYPdf();
  };

  const ejecutarCierreTurnoYPdf = async () => {
    setIsCerrandoTurno(true);
    showToast('Generando acta de cierre de turno en PDF...');
    try {
      const cajaParaPdf: CierreCajaData = {
        ...cierreCaja,
        postnet_amarillo: numPAma,
        postnet_rosa: numPRos,
        postnet_blanco: numPBla,
        online_local_sist: numOls,
        efectivo_real: numEfr,
        efectivo_mostrador_sist: numEms,
        observaciones: obs.trim(),
        existe: true,
        empleado: currentEmpleado?.nombre || 'Colaborador',
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      };

      const res = cerrarTurnoDefinitivo(cajaParaPdf);
      if (!res.ok && res.motivo) {
        showToast(res.motivo);
        setIsCerrandoTurno(false);
        return;
      }

      const pdfRes = await shareOrDownloadPDF({
        fecha: currentFecha,
        turno: currentTurno,
        cerradoPor: currentEmpleado?.nombre || 'Colaborador',
        horaCierre: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        catalogo,
        sistemaStock,
        conteoActual,
        cierreCaja: cajaParaPdf,
        reclamos,
        pastTurnos,
      }, '5491169927352');

      setCierreResultPdfUrl(pdfRes.url || '');
      setCierreTurnoModalOpen(true);
      showToast('✓ Cierre de turno finalizado y PDF emitido.');
    } catch (err) {
      console.error('Error al cerrar turno:', err);
      showToast('Hubo un inconveniente al generar el PDF de cierre.');
    } finally {
      setIsCerrandoTurno(false);
      setConfirmFaltantesModal({ open: false, faltantes: [] });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#164E2F] text-white px-5 py-3 rounded-xl shadow-xl text-xs font-bold font-heading border border-emerald-400/40">
          {toastMsg}
        </div>
      )}

      {/* Reclamos / Locks Bar for Caja */}
      <div className={`rounded-2xl p-3.5 border text-xs shadow-2xs transition-all ${
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
                  {estaLibre && 'Cierre de caja disponible'}
                  {esMia && (estaTerminada ? `Cierre de caja finalizado por vos (${currentEmpleado?.nombre})` : `Estás cargando el cierre de caja (${currentEmpleado?.nombre})`)}
                  {esAjena && (estaTerminada ? `Cierre de caja finalizado por ${reclamoCaja?.empleado || cierreCaja.empleado}` : `Caja tomada por ${reclamoCaja?.empleado || cierreCaja.empleado}`)}
                </span>
                {(reclamoCaja?.hora || cierreCaja.hora) && (
                  <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-white/70 border border-current opacity-80">
                    {reclamoCaja?.hora || cierreCaja.hora}
                  </span>
                )}
                {(esAjena || (estaTerminada && !esMia && !esAdmin)) && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300">
                    Solo Lectura
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-85 mt-0.5">
                {estaLibre && 'Ningún empleado ha tomado la caja. Comenzá a escribir o tomá la caja para cargar.'}
                {esMia && (estaTerminada
                  ? 'El arqueo está guardado y blindado contra edición de otros empleados. Podés seguir ajustando o liberarlo.'
                  : 'Los importes se actualizan en vivo en el sistema y ningún otro empleado puede editarlos.')}
                {esAjena && (estaTerminada
                  ? `Los importes guardados por ${reclamoCaja?.empleado || cierreCaja.empleado} están protegidos. Podés visualizarlos sin poder modificarlos.`
                  : `${reclamoCaja?.empleado || cierreCaja.empleado} está ingresando valores. Podés ver los datos en tiempo real sin poder editarlos.`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {estaLibre && !turnoCerrado && (
              <button
                type="button"
                onClick={handleTomarCaja}
                className="px-3.5 py-1.5 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                Tomar caja
              </button>
            )}

            {esMia && !turnoCerrado && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGuardarCaja}
                  className="px-3 py-1.5 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
                  title="Guardar el cierre de caja actual"
                >
                  <Save className="w-3.5 h-3.5 inline mr-1" />
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={handleLiberarCaja}
                  className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold rounded-xl cursor-pointer transition-colors"
                  title="Liberar caja para que otro empleado pueda tomarla"
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
                    await liberarCategoria('caja');
                    showToast('Liberaste el arqueo de Caja como Administrador');
                  } else {
                    pedirReaperturaCategoria('caja');
                    showToast('Reapertura de Caja solicitada');
                  }
                }}
                className={`px-3 py-1.5 font-bold rounded-xl cursor-pointer transition-colors shadow-2xs ${
                  esAdmin
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {esAdmin ? 'Liberar caja (Admin)' : 'Pedir liberación'}
              </button>
            )}
          </div>
        </div>
      </div>

      {cierreCaja.existe && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>
              Cierre guardado por <strong>{cierreCaja.empleado}</strong> a las {cierreCaja.hora}.
            </span>
          </div>
        </div>
      )}

      {/* Postnets Section Card */}
      <div className={`bg-white rounded-2xl p-4 border transition-all ${
        isLocked ? 'border-stone-200 opacity-80' : 'border-stone-300 shadow-2xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#1B5E38]" />
            <h2 className="font-bold text-sm text-stone-900">Postnets &amp; Cobros Digitales</h2>
          </div>

          {!isLocked && (
            <div className="flex items-center gap-2 flex-wrap">
              {cajasDisponibles.length > 0 && (
                <select
                  value={selectedDlCodVentas}
                  onChange={(e) => {
                    setSelectedDlCodVentas(e.target.value);
                    handleSincronizarCajaDatalive(e.target.value);
                  }}
                  className="px-2 py-1 rounded-xl bg-white border border-stone-300 text-[11px] font-bold text-stone-800 cursor-pointer shadow-2xs max-w-[200px] truncate"
                  title="Seleccionar caja de Datalive"
                >
                  {cajasDisponibles.map((c: any) => (
                    <option key={c.codVentas} value={c.codVentas}>
                      Caja #{c.codVentas} ({c.turno} - {c.estado})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => handleSincronizarCajaDatalive()}
                disabled={isSyncingDl}
                className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-[#123D26] text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-emerald-300 active:scale-95 shadow-2xs"
                title={`Traer datos de Datalive correspondientes al Turno ${currentTurno}`}
              >
                <span>{isSyncingDl ? '⏳ Conectando...' : `⚡ Traer Datalive (Turno ${currentTurno})`}</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
          {/* Postnet Amarillo */}
          <div className="p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-2xs">
            <label className="block text-[11px] font-extrabold text-amber-950 mb-1.5 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500 inline-block"></span>
              <span>Postnet Amarillo ($)</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              disabled={isLocked}
              value={pAma}
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              onChange={(e) => handleFieldChange('pAma', e.target.value)}
              placeholder="0"
              className="w-full p-2.5 rounded-xl border-2 border-amber-400 bg-amber-100 hover:bg-amber-200/80 focus:bg-amber-200/90 font-mono-num font-black text-amber-950 text-base placeholder-amber-500/60 focus:border-amber-600 focus:ring-2 focus:ring-amber-400/60 transition-colors"
            />
          </div>

          {/* Postnet Rosa */}
          <div className="p-3 rounded-2xl bg-pink-50 border-2 border-pink-300 shadow-2xs">
            <label className="block text-[11px] font-extrabold text-pink-950 mb-1.5 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-400 border border-pink-500 inline-block"></span>
              <span>Postnet Rosa ($)</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              disabled={isLocked}
              value={pRos}
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              onChange={(e) => handleFieldChange('pRos', e.target.value)}
              placeholder="0"
              className="w-full p-2.5 rounded-xl border-2 border-pink-400 bg-pink-100 hover:bg-pink-200/80 focus:bg-pink-200/90 font-mono-num font-black text-pink-950 text-base placeholder-pink-500/60 focus:border-pink-600 focus:ring-2 focus:ring-pink-400/60 transition-colors"
            />
          </div>

          {/* Postnet Blanco (Fondo Gris) */}
          <div className="p-3 rounded-2xl bg-slate-100 border-2 border-slate-300 shadow-2xs">
            <label className="block text-[11px] font-extrabold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-slate-500 inline-block"></span>
              <span>Postnet Blanco ($)</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              disabled={isLocked}
              value={pBla}
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              onChange={(e) => handleFieldChange('pBla', e.target.value)}
              placeholder="0"
              className="w-full p-2.5 rounded-xl border-2 border-slate-400 bg-slate-200 hover:bg-slate-300/80 focus:bg-slate-300/90 font-mono-num font-black text-slate-900 text-base placeholder-slate-500/60 focus:border-slate-600 focus:ring-2 focus:ring-slate-400/60 transition-colors"
            />
          </div>
        </div>

        {/* Datalive Online Local */}
        <div className="pt-3 border-t border-stone-100">
          <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Online Local (Sistema Datalive)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            disabled={isLocked}
            value={ols}
            onFocus={(e) => {
              if (e.target.value === '0') e.target.select();
            }}
            onChange={(e) => handleFieldChange('ols', e.target.value)}
            placeholder="0"
            className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 font-mono-num font-bold text-stone-900 text-base focus:bg-white focus:border-[#1B5E38]"
          />
        </div>

        {/* Postnet calculation summary */}
        <div className="mt-3 pt-3 border-t border-dashed border-stone-200 grid grid-cols-3 gap-2 text-center font-mono-num text-xs">
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Suma Postnets
            </span>
            <span className="font-bold text-stone-900">{fmtMoney(sumaPostnets)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Datalive
            </span>
            <span className="font-medium text-stone-600">{fmtMoney(numOls)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Diferencia
            </span>
            <span
              className={`font-black ${
                difPostnets === 0 ? 'text-emerald-700' : difPostnets > 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {fmtSignedMoney(difPostnets)}
            </span>
          </div>
        </div>
      </div>

      {/* Efectivo Section Card */}
      <div className={`bg-white rounded-2xl p-4 border transition-all ${
        isLocked ? 'border-stone-200 opacity-80' : 'border-stone-300 shadow-2xs'
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <Banknote className="w-5 h-5 text-[#1B5E38]" />
          <h2 className="font-bold text-sm text-stone-900">Efectivo en Caja</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-black text-emerald-950">
                Efectivo Real en Cajón ($)
              </label>
              <span className="text-[10px] text-stone-500 font-medium">Físico contado</span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              disabled={isLocked}
              value={efr}
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              onChange={(e) => handleFieldChange('efr', e.target.value)}
              placeholder="0"
              className="w-full p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50/50 font-mono-num font-black text-stone-900 text-base focus:bg-white focus:border-[#1B5E38] focus:ring-2 focus:ring-emerald-400/40"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-black text-stone-700">
                Teórico en Caja (Sistema Datalive) ($)
              </label>
              <span className="text-[10px] text-stone-500 font-medium">Inicio + Mostr + PEYA - Salidas</span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              disabled={isLocked}
              value={ems}
              onFocus={(e) => {
                if (e.target.value === '0') e.target.select();
              }}
              onChange={(e) => handleFieldChange('ems', e.target.value)}
              placeholder="0"
              className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 font-mono-num font-bold text-stone-900 text-base focus:bg-white focus:border-[#1B5E38]"
            />
          </div>
        </div>

        {/* Breakdown Card for Teórico en Caja (Saldo inicial + Mostrador + PedidosYa - Gastos - Egresos - Sueldos) */}
        {dlDetalleInfo ? (
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs mb-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
              <div className="flex items-center gap-1.5 font-extrabold text-[#123D26] uppercase text-[10px] tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                <span>Desglose Teórico Datalive ({dlDetalleInfo.turno})</span>
              </div>
              {dlDetalleInfo.codVentas && (
                <span className="text-[10px] text-stone-500 font-bold">
                  Caja #{dlDetalleInfo.codVentas} {dlDetalleInfo.estado && `· ${dlDetalleInfo.estado}`}
                </span>
              )}
            </div>
            
            {/* Ingresos en efectivo */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono-num text-[11px] mb-2">
              <div className="p-2 rounded-lg bg-white border border-stone-200 shadow-2xs">
                <span className="block text-[9px] font-sans text-stone-500 font-extrabold uppercase">+ Saldo Inicial</span>
                <span className="font-black text-stone-900 text-xs sm:text-sm">${fmtMoney(dlDetalleInfo.saldoInicial)}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200 shadow-2xs">
                <span className="block text-[9px] font-sans text-emerald-800 font-extrabold uppercase">+ Ef. Mostrador</span>
                <span className="font-black text-emerald-950 text-xs sm:text-sm">${fmtMoney(dlDetalleInfo.efectivoMostrador)}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200 shadow-2xs">
                <span className="block text-[9px] font-sans text-stone-500 font-extrabold uppercase">+ Ef. PedidosYa</span>
                <span className="font-black text-stone-900 text-xs sm:text-sm">${fmtMoney(dlDetalleInfo.pedidosYaEfectivo)}</span>
              </div>
            </div>

            {/* Salidas en efectivo (Gastos, Egresos, Sueldos) */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono-num text-[11px] mb-2">
              <div className={`p-2 rounded-lg border shadow-2xs ${
                dlDetalleInfo.gastos > 0 ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-white border-stone-200 text-stone-600'
              }`}>
                <span className={`block text-[9px] font-sans font-extrabold uppercase ${
                  dlDetalleInfo.gastos > 0 ? 'text-rose-700' : 'text-stone-400'
                }`}>- Gastos</span>
                <span className="font-black text-xs sm:text-sm">
                  {dlDetalleInfo.gastos > 0 ? `-$${fmtMoney(dlDetalleInfo.gastos)}` : '$0'}
                </span>
              </div>

              <div className={`p-2 rounded-lg border shadow-2xs ${
                dlDetalleInfo.egresos > 0 ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-white border-stone-200 text-stone-600'
              }`}>
                <span className={`block text-[9px] font-sans font-extrabold uppercase ${
                  dlDetalleInfo.egresos > 0 ? 'text-rose-700' : 'text-stone-400'
                }`}>- Egresos</span>
                <span className="font-black text-xs sm:text-sm">
                  {dlDetalleInfo.egresos > 0 ? `-$${fmtMoney(dlDetalleInfo.egresos)}` : '$0'}
                </span>
              </div>

              <div className={`p-2 rounded-lg border shadow-2xs ${
                dlDetalleInfo.sueldos > 0 ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-white border-stone-200 text-stone-600'
              }`}>
                <span className={`block text-[9px] font-sans font-extrabold uppercase ${
                  dlDetalleInfo.sueldos > 0 ? 'text-rose-700' : 'text-stone-400'
                }`}>- Sueldos</span>
                <span className="font-black text-xs sm:text-sm">
                  {dlDetalleInfo.sueldos > 0 ? `-$${fmtMoney(dlDetalleInfo.sueldos)}` : '$0'}
                </span>
              </div>
            </div>

            {/* Detalle puntual si hubo gastos, egresos o sueldos */}
            {(dlDetalleInfo.gastosItems?.length || dlDetalleInfo.egresosItems?.length || dlDetalleInfo.sueldosItems?.length) ? (
              <div className="my-2 p-2 rounded-lg bg-rose-50/60 border border-rose-200/80 text-[10px] text-stone-700 font-sans flex flex-wrap gap-2 items-center">
                <span className="font-extrabold text-rose-900 uppercase">Salidas abonadas de caja:</span>
                {dlDetalleInfo.gastosItems?.map((g, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-900 font-medium">
                    Gasto: <strong>{g.concepto}</strong> (-${fmtMoney(g.monto)})
                  </span>
                ))}
                {dlDetalleInfo.egresosItems?.map((e, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-900 font-medium">
                    Egreso: <strong>{e.concepto}</strong> (-${fmtMoney(e.monto)})
                  </span>
                ))}
                {dlDetalleInfo.sueldosItems?.map((s, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-900 font-medium">
                    Sueldo: <strong>{s.empleado}</strong> (-${fmtMoney(s.monto)})
                  </span>
                ))}
              </div>
            ) : null}

            {/* Fórmula explicada */}
            <p className="text-[10.5px] text-stone-600 mt-2 text-center font-sans leading-relaxed">
              Total esperado en cajón: <strong>${fmtMoney(dlDetalleInfo.saldoInicial)}</strong> (Inicio) + <strong>${fmtMoney(dlDetalleInfo.efectivoMostrador)}</strong> (Mostrador)
              {dlDetalleInfo.pedidosYaEfectivo > 0 && <span> + <strong>${fmtMoney(dlDetalleInfo.pedidosYaEfectivo)}</strong> (PEYA)</span>}
              {dlDetalleInfo.totalSalidas > 0 && <span className="text-rose-700"> - <strong>${fmtMoney(dlDetalleInfo.totalSalidas)}</strong> (Gastos/Egr/Sueldos)</span>}
              {' = '}<strong className="text-emerald-950 font-mono-num text-xs font-black px-1.5 py-0.5 bg-emerald-100 rounded">${fmtMoney(dlDetalleInfo.teoricoTotal)}</strong>
            </p>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-[11px] text-amber-900 mb-3 flex items-center justify-between gap-2">
            <span>
              💡 <strong>Teórico en Caja:</strong> El total que deben contar los empleados en el cajón es <strong>Saldo Inicial + Efectivo Mostrador + Efectivo PEYA - Gastos - Egresos - Sueldos</strong>.
            </span>
            {!isLocked && (
              <button
                type="button"
                onClick={() => handleSincronizarCajaDatalive()}
                className="text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950 shrink-0 cursor-pointer"
              >
                Cargar de Datalive
              </button>
            )}
          </div>
        )}

        {/* Efectivo summary */}
        <div className="mt-3 pt-3 border-t border-dashed border-stone-200 grid grid-cols-3 gap-2 text-center font-mono-num text-xs">
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Real
            </span>
            <span className="font-bold text-stone-900">{fmtMoney(numEfr)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Sistema
            </span>
            <span className="font-medium text-stone-600">{fmtMoney(numEms)}</span>
          </div>
          <div>
            <span className="block text-[10px] font-sans text-stone-400 font-semibold uppercase">
              Diferencia
            </span>
            <span
              className={`font-black ${
                difEfectivo === 0 ? 'text-emerald-700' : difEfectivo > 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {fmtSignedMoney(difEfectivo)}
            </span>
          </div>
        </div>
      </div>

      {/* Saldo Total Giant Highlight Card */}
      <div
        className={`rounded-3xl p-6 text-white text-center shadow-lg transition-all ${
          saldoTotal === 0
            ? 'bg-gradient-to-br from-[#123D26] to-[#1B5E38] border-2 border-emerald-400/30'
            : saldoTotal > 0
            ? 'bg-gradient-to-br from-[#14472B] to-[#1F693F] border-2 border-emerald-300/40'
            : 'bg-gradient-to-br from-[#68181D] to-[#941019] border-2 border-rose-400/40'
        }`}
      >
        <span className="text-xs uppercase font-bold tracking-widest opacity-85 block">
          Saldo Total de Caja
        </span>
        <div className="text-4xl sm:text-5xl font-black font-mono-num my-2 tracking-tight">
          {fmtSignedMoney(saldoTotal)}
        </div>
        <p className="text-xs opacity-90 font-medium">
          <strong>{fmtSignedMoney(difPostnets)}</strong> (postnets) + <strong>{fmtSignedMoney(difEfectivo)}</strong> (efectivo)
        </p>
        {saldoTotal === 0 && (
          <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white/20 text-xs font-bold">
            ✓ Caja Cuadrada Perfecta
          </span>
        )}
      </div>

      {/* Observaciones */}
      <div className={`bg-white rounded-2xl p-4 border ${
        isLocked ? 'border-stone-200 opacity-80' : 'border-stone-300'
      }`}>
        <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
          Observaciones de Caja
        </label>
        <textarea
          rows={2}
          disabled={isLocked}
          value={obs}
          onChange={(e) => handleFieldChange('obs', e.target.value)}
          placeholder="Si hay diferencias, explicá qué pasó (ej: vuelto, redondeo, propinas)..."
          className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 text-xs text-stone-900 focus:bg-white focus:border-[#1B5E38] focus:ring-1 focus:ring-[#1B5E38]"
        />
      </div>

      {/* Action Buttons & Cierre de Turno Card (Punto 3) */}
      <div className="pt-2 space-y-3">
        {/* Card Principal de Cierre de Turno */}
        <div className="p-4 sm:p-5 bg-gradient-to-br from-[#123D26] to-[#1B5E38] rounded-3xl border-2 border-emerald-400/40 text-white shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-emerald-600/40">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-2xl bg-white/10 text-emerald-300">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                  <span>Cierre de Turno Oficial</span>
                  {turnoCerrado && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 text-[10px] font-black uppercase">
                      Cerrado
                    </span>
                  )}
                </h3>
                <p className="text-xs text-emerald-100/90 leading-tight">
                  Finaliza el turno, consolida el stock, guarda la caja y emite el PDF oficial.
                </p>
              </div>
            </div>
            {cierreCaja.existe && (
              <span className="text-[11px] font-mono-num font-bold text-emerald-200 self-start sm:self-auto bg-black/20 px-2.5 py-1 rounded-xl">
                Saldo: {fmtSignedMoney(saldoTotal)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {!turnoCerrado ? (
              <button
                type="button"
                onClick={handleCierreTurnoClick}
                disabled={isCerrandoTurno}
                className="w-full py-4 px-4 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-stone-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2 border-2 border-emerald-200 disabled:opacity-50"
              >
                <CheckCircle2 className="w-5 h-5 text-stone-950" />
                <span>{isCerrandoTurno ? 'Cerrando y emitiendo...' : 'Cierre de Turno'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReenviarPdfTurno}
                disabled={isReenviandoPdf}
                className="w-full py-4 px-4 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-stone-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2 border-2 border-emerald-200 disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-stone-950" />
                <span>Descargar Acta PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReenviarPdfTurno}
              disabled={isReenviandoPdf}
              className="w-full py-4 px-4 bg-[#25D366] hover:bg-[#1EBE5D] active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 border border-emerald-400/40 disabled:opacity-50"
              title="Compartir o reenviar el acta PDF por WhatsApp"
            >
              <Share2 className="w-4 h-4" />
              <span>{isReenviandoPdf ? 'Enviando PDF...' : 'Enviar PDF (WhatsApp)'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-emerald-200/80">
            <span>El PDF incluye conteo físico, stock teórico, diferencias y arqueo de caja.</span>
            {esMia && !turnoCerrado && (
              <button
                type="button"
                onClick={handleGuardarCaja}
                className="text-xs font-bold text-white underline hover:text-emerald-100 cursor-pointer"
              >
                Guardar solo caja
              </button>
            )}
          </div>
        </div>

        {cierreCaja.existe && esAdmin && !turnoCerrado && (
          <div className="pt-1">
            <button
              type="button"
              onClick={handleBorrarCaja}
              className="w-full py-2.5 px-4 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Borrar cierre de caja (Solo Admin)</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal de Advertencia de Stock Faltante antes de Cerrar Turno */}
      {confirmFaltantesModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <span className="p-3 rounded-2xl bg-amber-100 text-amber-800 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </span>
              <div>
                <h3 className="font-black text-base text-stone-900">
                  Categorías pendientes de conteo
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Aún no se registraron conteos en las siguientes categorías de stock:
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 font-bold flex flex-wrap gap-1.5">
              {confirmFaltantesModal.faltantes.map((f, i) => (
                <span key={i} className="px-2 py-0.5 rounded-lg bg-white border border-amber-300">
                  • {f}
                </span>
              ))}
            </div>

            <p className="text-xs text-stone-500">
              ¿Deseas efectuar el <strong>Cierre de Turno</strong> de todas formas con los datos actuales o preferís revisar el conteo de stock?
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmFaltantesModal({ open: false, faltantes: [] });
                  setActiveTab('contar');
                }}
                className="py-3 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl cursor-pointer transition-colors text-center"
              >
                Revisar Stock
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmFaltantesModal({ open: false, faltantes: [] });
                  ejecutarCierreTurnoYPdf();
                }}
                className="py-3 px-3 bg-[#1B5E38] hover:bg-[#14472B] text-white font-black text-xs rounded-xl cursor-pointer transition-colors text-center shadow-md"
              >
                Cerrar Turno de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Éxito de Cierre de Turno y Entrega de PDF */}
      {cierreTurnoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-emerald-300 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="p-3 rounded-2xl bg-emerald-100 text-emerald-800 shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </span>
                <div>
                  <h3 className="font-black text-lg text-stone-900">
                    ¡Cierre de Turno {currentTurno} Oficial!
                  </h3>
                  <p className="text-xs text-stone-500">
                    Cerrado por {currentEmpleado?.nombre || 'Colaborador'} · {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCierreTurnoModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1">
              <p className="font-bold flex items-center justify-between">
                <span>Saldo Total de Caja:</span>
                <span className="font-mono-num font-black text-sm">{fmtSignedMoney(saldoTotal)}</span>
              </p>
              <p className="text-emerald-800 text-[11px]">
                El acta oficial fue generada en formato PDF y está lista para compartir o descargar.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleReenviarPdfTurno()}
                className="w-full py-3.5 px-4 bg-[#25D366] hover:bg-[#1EBE5D] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Acta PDF por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleReenviarPdfTurno()}
                className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Descargar PDF en el Dispositivo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCierreTurnoModalOpen(false);
                  setActiveTab('reporte');
                }}
                className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver Resumen Completo en Reporte</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
