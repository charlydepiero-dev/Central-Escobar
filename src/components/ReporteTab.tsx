import React, { useState, useMemo } from 'react';
import { useCentral } from '../context/CentralContext';
import { nf, fmtDateLabel, productId, abrirWhatsApp, fmtMoney } from '../utils/centralHelpers';
import { 
  shareOrDownloadPDF, 
  generateShiftPDF,
  generateResumenReportPDF,
  generateDetalleReportPDF,
  generateCompararReportPDF,
  generateEvolucionReportPDF
} from '../utils/pdfGenerator';
import { exportReportToExcel, exportReportToCSV } from '../utils/reportExportHelpers';
import { 
  BarChart3, 
  FileText, 
  GitCompare, 
  TrendingUp, 
  Download, 
  Share2, 
  Printer,
  FileSpreadsheet,
  Lock,
  Edit3,
  X,
  Check,
  Camera,
  ShieldCheck,
  AlertCircle,
  Calendar,
  Clock,
  DollarSign,
  CreditCard,
  Wallet,
  Filter,
  CheckCircle2,
  Layers,
  Cloud,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { uploadPdfToGoogleDrive, saveShiftPdfToDriveAndServer } from '../services/googleDriveService';
import {
  normalizeTurno,
  normalizeConteos,
  normalizeSistemaStock,
  totalContado,
  EMPTY_CAJA,
  sumaPostnets,
  turnoKey,
  turnoSortKey,
  localIso,
} from '../utils/snapshotNormalizer';
import { googleSignIn, getAccessToken } from '../services/googleAuth';

export const ReporteTab: React.FC = () => {
  const {
    catalogo,
    sistemaStock: sistemaStockRaw,
    conteoActual: conteoActualRaw,
    pastTurnos: pastTurnosRaw,
    currentFecha,
    currentTurno,
    cierreCaja,
    reclamos,
    currentEmpleado,
    reportMode,
    setReportMode,
    actualizarTurnoHistorico,
  } = useCentral();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // FIX: se normalizan los snapshots una sola vez (claves "c-<codigo>", conteos con `ubic`).
  // Así Resumen / Detalle / Comparar / Evolución / PDF / Excel leen todos el mismo formato.
  const pastTurnos = useMemo(
    () =>
      [...pastTurnosRaw]
        .map(normalizeTurno)
        .sort((a, b) => turnoSortKey(b).localeCompare(turnoSortKey(a))),
    [pastTurnosRaw]
  );
  const conteoActual = useMemo(() => normalizeConteos(conteoActualRaw), [conteoActualRaw]);
  const sistemaStock = useMemo(() => normalizeSistemaStock(sistemaStockRaw), [sistemaStockRaw]);

  // Filtros del Historial Permanente Acumulativo (Día y Turno)
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [filtroTurno, setFiltroTurno] = useState<'todos' | 'Mañana' | 'Tarde'>('todos');
  const [filtroEmpleado, setFiltroEmpleado] = useState<string>('todos');

  // Todos los empleados que alguna vez cerraron un turno (no solo uno fijo)
  const empleadosQueCerraron = useMemo(() => {
    const set = new Set<string>();
    pastTurnos.forEach((t) => {
      const n = (t.cerrado_por || t.cierreCaja?.empleado || '').trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pastTurnos]);

  // Turnos filtrados del historial permanente
  const turnosFiltrados = useMemo(() => {
    return pastTurnos.filter((t) => {
      if (filtroFecha && t.fecha !== filtroFecha) return false;
      if (filtroTurno !== 'todos' && t.turno.toLowerCase() !== filtroTurno.toLowerCase()) return false;
      if (filtroEmpleado !== 'todos') {
        const n = (t.cerrado_por || t.cierreCaja?.empleado || '').trim();
        if (n.toLowerCase() !== filtroEmpleado.toLowerCase()) return false;
      }
      return true;
    });
  }, [pastTurnos, filtroFecha, filtroTurno, filtroEmpleado]);

  // Turno seleccionado: ID del turno histórico o 'vivo' para el turno en curso
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>(() => {
    return pastTurnos.length > 0 ? turnoKey(pastTurnos[0]) : 'vivo';
  });

  // Lista para selectores de comparación
  const allSnapshots = useMemo(() => {
    const list = [
      { id: 'vivo', fecha: currentFecha, turno: currentTurno, label: `Hoy (${fmtDateLabel(currentFecha)}) - ${currentTurno} (En curso)` },
      ...pastTurnos.map((t) => ({
        id: turnoKey(t),
        fecha: t.fecha,
        turno: t.turno,
        label: `${fmtDateLabel(t.fecha)} · ${t.turno} (${t.hora_cierre || 'cierre'}) · ${t.cerrado_por || 'Colab.'}`,
      })),
    ];
    return list;
  }, [pastTurnos, currentFecha, currentTurno]);

  // Selected snapshot turn record
  // FIX: antes, si el id no coincidía, caía SIEMPRE al primer turno (el de Fati) sin avisar.
  // Ahora solo se acepta coincidencia exacta; si no hay, el efecto de abajo reselecciona.
  const selectedPastTurno = useMemo(() => {
    if (selectedTurnoId === 'vivo') return null;
    return (
      pastTurnos.find((t) => turnoKey(t) === selectedTurnoId) ||
      pastTurnos.find((t) => `${t.fecha}|${t.turno}` === selectedTurnoId) ||
      null
    );
  }, [selectedTurnoId, pastTurnos]);

  // Si el seleccionado dejó de existir o los filtros lo excluyen, saltar al primero visible
  React.useEffect(() => {
    if (selectedTurnoId === 'vivo') return;
    const visible = turnosFiltrados.some((t) => turnoKey(t) === selectedTurnoId);
    if (!visible) {
      setSelectedTurnoId(turnosFiltrados.length > 0 ? turnoKey(turnosFiltrados[0]) : 'vivo');
    }
  }, [turnosFiltrados, selectedTurnoId]);

  // Helper: Get snapshot values for comparison
  const getSnapshotData = (key: string) => {
    if (key === 'vivo' || key === `${currentFecha}|${currentTurno}`) {
      return {
        conteos: conteoActual,
        sistema: sistemaStock,
      };
    }
    const past = pastTurnos.find((t) => turnoKey(t) === key || `${t.fecha}|${t.turno}` === key);
    if (past) {
      return {
        conteos: past.conteos || {},
        sistema: past.sistemaStock || {},
      };
    }

    return { conteos: {}, sistema: {} };
  };

  // Selected Snapshot Data for active rendering
  const selectedSnapshot = useMemo(() => {
    if (selectedTurnoId === 'vivo') {
      return {
        conteos: conteoActual,
        sistema: sistemaStock,
      };
    }
    if (selectedPastTurno) {
      return {
        conteos: selectedPastTurno.conteos || {},
        sistema: selectedPastTurno.sistemaStock || {},
      };
    }
    return { conteos: {}, sistema: {} };
  }, [selectedTurnoId, selectedPastTurno, conteoActual, sistemaStock]);

  const activeSistema = selectedSnapshot.sistema || {};
  const activeConteos = selectedSnapshot.conteos || {};
  const activeCierreCaja = selectedPastTurno ? (selectedPastTurno.cierreCaja || EMPTY_CAJA) : cierreCaja;
  const activeSumaPostnets = sumaPostnets(activeCierreCaja);
  const activeDifPostnets = activeSumaPostnets - (Number(activeCierreCaja.online_local_sist) || 0);
  const snapshotSinSistema = Object.keys(activeSistema).length === 0;
  const activeCerrador = selectedPastTurno?.cerrado_por || currentEmpleado?.nombre || 'Colaborador';
  const activeFecha = selectedPastTurno?.fecha || currentFecha;
  const activeTurno = selectedPastTurno?.turno || currentTurno;
  const activeHoraCierre = selectedPastTurno?.hora_cierre || (selectedTurnoId === 'vivo' ? 'En curso' : '—');
  const activeTimestamp = selectedPastTurno?.timestamp || '';

  // States for Detalle
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // States for Comparar (Punto 3: Total Contado vs Diferencia vs Sistema)
  const [compareAKey, setCompareAKey] = useState<string>(() => {
    return pastTurnos.length > 0 ? (pastTurnos[0].id || `${pastTurnos[0].fecha}|${pastTurnos[0].turno}`) : 'vivo';
  });
  const [compareBKey, setCompareBKey] = useState<string>('vivo');
  const [compareMetric, setCompareMetric] = useState<'contado' | 'diferencia' | 'ambos'>('contado');
  const [compareCatFilter, setCompareCatFilter] = useState<string>('todas');
  const [compareSearch, setCompareSearch] = useState<string>('');

  // States for Evolución (Punto 4: Histórico con desvíos y multiselección de categorías)
  const [selectedEvolucionCats, setSelectedEvolucionCats] = useState<string[]>([
    'empanadas',
    'panificados',
    'burritos',
    'sandwich_panchos',
    'bebidas',
  ]);
  const [soloConDesvioEvolucion, setSoloConDesvioEvolucion] = useState(false);
  const [searchEvolucion, setSearchEvolucion] = useState('');

  const getSysStock = (pid: string): number => {
    const item: any = activeSistema[pid];
    if (item === null || item === undefined) return 0;
    if (typeof item === 'number') return item;
    return Number(item.stock) || 0;
  };

  const getCntStock = (pid: string): { total: number; contado: boolean; empleado?: string } => {
    const entry = activeConteos[pid];
    if (!entry) return { total: 0, contado: false };
    return { total: totalContado(entry), contado: true, empleado: entry.empleado };
  };

  // Modal para edición manual de turno cerrado por Administrador
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [editPid, setEditPid] = useState('');
  const [editCountVal, setEditCountVal] = useState('');
  const [editAdminPin, setEditAdminPin] = useState('');
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Evolution Date Range configuration (Punto 5)
  const [evolucionPreset, setEvolucionPreset] = useState<'5dias' | '7dias' | '14dias' | 'custom'>('5dias');
  const [evolucionFechaDesde, setEvolucionFechaDesde] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 4);
    return localIso(d);
  });
  const [evolucionFechaHasta, setEvolucionFechaHasta] = useState<string>(() => localIso(new Date()));

  type EvolucionDay = {
    key: string;
    dateIso: string;
    label: string;
    sub: string;
    isToday: boolean;
    seed: number;
    hasData: boolean;
    snap?: { conteos: Record<string, any>; sistema: Record<string, any> };
  };

  // FIX: antes los días sin cierre se rellenaban con números inventados (un hash).
  // Ahora cada día usa el ÚLTIMO turno cerrado real de esa fecha (Tarde > Mañana);
  // si no hay cierre, el día queda "sin datos" y suma 0.
  const evolucionDays = useMemo<EvolucionDay[]>(() => {
    let daysCount = 5;
    if (evolucionPreset === '7dias') daysCount = 7;
    else if (evolucionPreset === '14dias') daysCount = 14;

    const dates: Date[] = [];
    if (evolucionPreset === 'custom') {
      const curr = new Date(evolucionFechaDesde + 'T00:00:00');
      const end = new Date(evolucionFechaHasta + 'T00:00:00');
      let count = 0;
      while (curr <= end && count < 31) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
        count++;
      }
    } else {
      const today = new Date();
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(d);
      }
    }
    if (dates.length === 0) dates.push(new Date());

    return dates.map((d) => {
      const iso = localIso(d);
      const isToday = iso === currentFecha;
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const seed = d.getFullYear() * 1000 + (d.getMonth() + 1) * 31 + d.getDate();

      const delDia = pastTurnos
        .filter((t) => t.fecha === iso && t.cerrado !== false)
        .sort((a, b) => turnoSortKey(b).localeCompare(turnoSortKey(a)));
      // Preferir Tarde (cierre del día); si no hay, el más reciente
      const ref = delDia.find((t) => t.turno === 'Tarde') || delDia[0];

      let snap: EvolucionDay['snap'];
      let sub = 'Sin cierre';
      if (ref) {
        snap = { conteos: ref.conteos || {}, sistema: ref.sistemaStock || {} };
        sub = `${ref.turno} · ${ref.cerrado_por || 'Colab.'}`;
      } else if (isToday) {
        snap = { conteos: conteoActual, sistema: sistemaStock };
        sub = `${currentTurno} (en curso)`;
      }

      const label =
        evolucionPreset !== 'custom' && isToday ? 'Hoy' : `${dayNum}/${monthNum}`;

      return {
        key: `d-${iso}`,
        dateIso: iso,
        label,
        sub,
        isToday,
        seed,
        hasData: Boolean(snap && Object.keys(snap.conteos).length > 0),
        snap,
      };
    });
  }, [evolucionPreset, evolucionFechaDesde, evolucionFechaHasta, currentFecha, currentTurno, pastTurnos, conteoActual, sistemaStock]);

  const getProductDayDiff = (catId: string, p: { codigo: string; nombre: string }, day: EvolucionDay): number => {
    if (!day.snap) return 0;
    const pid = productId(catId, p);
    const entry = day.snap.conteos[pid];
    if (!entry) return 0; // no se contó ese día => no hay desvío que informar
    const sysItem: any = day.snap.sistema[pid];
    const sys = typeof sysItem === 'number' ? sysItem : Number(sysItem?.stock) || 0;
    return totalContado(entry) - sys;
  };

  // Calculate summary metrics based on active snapshot (immutable past shift or current live)
  const summary = useMemo(() => {
    let totalSistema = 0;
    let totalContado = 0;
    let difAbs = 0;
    let prodsConDif = 0;
    let prodsContados = 0;
    let prodsSinContar = 0;

    const diffList: {
      categoria: string;
      producto: string;
      sistema: number;
      contado: number;
      diferencia: number;
      empleado?: string;
    }[] = [];

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = getSysStock(pid);
          const { total: contado, contado: fueContado, empleado } = getCntStock(pid);

          totalSistema += sys;

          if (fueContado) {
            prodsContados++;
            totalContado += contado;
            const diff = contado - sys;

            if (diff !== 0) {
              difAbs += Math.abs(diff);
              prodsConDif++;
              diffList.push({
                categoria: cat.nombre,
                producto: p.nombre,
                sistema: sys,
                contado,
                diferencia: diff,
                empleado,
              });
            }
          } else {
            prodsSinContar++;
          }
        });
      });
    });

    const totalProductos = prodsContados + prodsSinContar;
    const cobertura = totalProductos > 0 ? Math.round((prodsContados / totalProductos) * 100) : 0;
    const topDiferencias = diffList.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 10);

    return {
      totalSistema,
      totalContado,
      difAbs,
      prodsConDif,
      prodsContados,
      prodsSinContar,
      cobertura,
      topDiferencias,
      diffList,
    };
  }, [catalogo, activeSistema, activeConteos]);

  const handleExportExcel = () => {
    const snapA = reportMode === 'comparar' ? getSnapshotData(compareAKey) : undefined;
    const snapB = reportMode === 'comparar' ? getSnapshotData(compareBKey) : undefined;
    exportReportToExcel({
      mode: reportMode,
      fecha: activeFecha,
      turno: activeTurno,
      cerradoPor: activeCerrador,
      catalogo,
      sistemaStock: activeSistema,
      conteoActual: activeConteos,
      cierreCaja: activeCierreCaja,
      summary,
      compareAKey,
      compareBKey,
      snapA,
      snapB,
      evolucionDays,
      getProductDayDiff,
    });
  };

  const handleExportCSV = () => {
    const snapA = reportMode === 'comparar' ? getSnapshotData(compareAKey) : undefined;
    const snapB = reportMode === 'comparar' ? getSnapshotData(compareBKey) : undefined;
    exportReportToCSV({
      mode: reportMode,
      fecha: activeFecha,
      turno: activeTurno,
      cerradoPor: activeCerrador,
      catalogo,
      sistemaStock: activeSistema,
      conteoActual: activeConteos,
      cierreCaja: activeCierreCaja,
      summary,
      compareAKey,
      compareBKey,
      snapA,
      snapB,
      evolucionDays,
      getProductDayDiff,
    });
  };

  const buildReportData = () => {
    return {
      fecha: activeFecha,
      turno: activeTurno,
      cerradoPor: activeCerrador,
      horaCierre: activeHoraCierre,
      catalogo,
      sistemaStock: activeSistema,
      conteoActual: activeConteos,
      cierreCaja: activeCierreCaja,
      reclamos: selectedPastTurno ? {} : reclamos,
      pastTurnos,
      vistaReporte: reportMode,
    };
  };

  const handleReenviarWhatsApp = async () => {
    setIsGeneratingPdf(true);
    try {
      const reportData = buildReportData();
      let gen: { blob: Blob; file: File; filename: string };

      if (reportMode === 'resumen') {
        gen = generateResumenReportPDF(reportData);
      } else if (reportMode === 'detalle') {
        gen = generateDetalleReportPDF(reportData);
      } else if (reportMode === 'comparar') {
        const snapA = getSnapshotData(compareAKey);
        const snapB = getSnapshotData(compareBKey);
        gen = generateCompararReportPDF(reportData, compareAKey, compareBKey, snapA, snapB);
      } else {
        gen = generateEvolucionReportPDF(reportData, evolucionDays, getProductDayDiff);
      }

      const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator && (navigator as any).canShare({ files: [gen.file] });
      if (canShare && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `Reporte ${reportMode.toUpperCase()} - Central Escobar`,
            text: `📄 Adjunto reporte de ${reportMode.toUpperCase()} (${currentFecha} - ${currentTurno}).`,
            files: [gen.file],
          });
          return;
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      }

      const dlUrl = URL.createObjectURL(gen.blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = gen.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);

      const msg = `🍕 *Central Escobar · Reporte ${reportMode.toUpperCase()}*\n📅 Fecha: ${fmtDateLabel(currentFecha)} (${currentTurno})\n👤 Usuario: ${currentEmpleado?.nombre || 'Admin'}\n\nEl archivo PDF de ${reportMode.toUpperCase()} fue descargado para adjuntar a este chat.`;
      abrirWhatsApp('5491169927352', msg);
    } catch (e: any) {
      console.error('Error sharing PDF report:', e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDescargarPDF = () => {
    setIsGeneratingPdf(true);
    try {
      const reportData = buildReportData();
      let gen: { blob: Blob; filename: string };

      if (reportMode === 'resumen') {
        gen = generateResumenReportPDF(reportData);
      } else if (reportMode === 'detalle') {
        gen = generateDetalleReportPDF(reportData);
      } else if (reportMode === 'comparar') {
        const snapA = getSnapshotData(compareAKey);
        const snapB = getSnapshotData(compareBKey);
        gen = generateCompararReportPDF(reportData, compareAKey, compareBKey, snapA, snapB);
      } else {
        gen = generateEvolucionReportPDF(reportData, evolucionDays, getProductDayDiff);
      }

      const dlUrl = URL.createObjectURL(gen.blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = gen.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
    } catch (err) {
      console.error('Error downloading PDF report:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveFeedback, setDriveFeedback] = useState<{ id: string; url: string } | null>(null);

  const handleUploadClosureToDrive = async () => {
    if (!selectedPastTurno) return;
    setIsUploadingToDrive(true);
    try {
      const { file, filename } = generateShiftPDF({
        fecha: selectedPastTurno.fecha,
        turno: selectedPastTurno.turno,
        cerradoPor: selectedPastTurno.cerrado_por || 'Colaborador',
        horaCierre: selectedPastTurno.hora_cierre || '23:20',
        catalogo,
        sistemaStock: selectedPastTurno.sistemaStock || sistemaStock,
        conteoActual: selectedPastTurno.conteos || conteoActual,
        cierreCaja: selectedPastTurno.cierreCaja || cierreCaja,
        reclamos,
        pastTurnos,
      });

      const res = await saveShiftPdfToDriveAndServer(file, filename, {
        fecha: selectedPastTurno.fecha,
        turno: selectedPastTurno.turno,
        cerradoPor: selectedPastTurno.cerrado_por || 'Colaborador',
      });

      if (res.driveUrl) {
        selectedPastTurno.driveUrl = res.driveUrl;
        setDriveFeedback({ id: selectedPastTurno.id || selectedPastTurno.fecha, url: res.driveUrl });
        window.open(res.driveUrl, '_blank');
      } else {
        alert(res.message || 'Reporte guardado en el servidor local. Para sincronizar con Google Drive, configurá la URL de script en Gerencia.');
      }
    } catch (err: any) {
      console.error('Error subiendo reporte de cierre a Drive:', err);
      alert('Error al conectar con Google Drive.');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      
      {/* Sub-mode Navigation Toggle */}
      <div className="bg-white p-1 rounded-2xl border border-stone-200 flex gap-1 shadow-2xs">
        <button
          onClick={() => setReportMode('resumen')}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportMode === 'resumen'
              ? 'bg-[#1B5E38] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Resumen</span>
        </button>

        <button
          onClick={() => setReportMode('detalle')}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportMode === 'detalle'
              ? 'bg-[#1B5E38] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Detalle</span>
        </button>

        <button
          onClick={() => setReportMode('comparar')}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportMode === 'comparar'
              ? 'bg-[#1B5E38] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>Comparar</span>
        </button>

        <button
          onClick={() => setReportMode('evolucion')}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            reportMode === 'evolucion'
              ? 'bg-[#1B5E38] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Evolución</span>
        </button>
      </div>

      {/* Barra de Filtros del Historial Permanente: Día, Turno y Selección */}
      <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-stone-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filtro por Día */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-stone-600" />
              <span>Día / Fecha:</span>
            </label>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="px-3 py-1.5 bg-stone-50 hover:bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:outline-emerald-600 transition-colors"
            />
            {filtroFecha && (
              <button
                type="button"
                onClick={() => setFiltroFecha('')}
                className="text-[11px] text-stone-500 hover:text-stone-800 font-bold px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                ✕ Ver todos los días
              </button>
            )}
          </div>

          {/* Filtro por Turno */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 mr-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-stone-600" />
              <span>Turno:</span>
            </span>
            {(['todos', 'Mañana', 'Tarde'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroTurno(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filtroTurno === t
                    ? 'bg-[#123D26] text-white shadow-2xs'
                    : 'bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                {t === 'todos' ? 'Todos' : t === 'Mañana' ? '☀️ Mañana' : '🌙 Tarde'}
              </button>
            ))}
          </div>

          {/* Filtro por empleado que cerró */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 mr-1">
              Cerró:
            </span>
            <select
              value={filtroEmpleado}
              onChange={(e) => setFiltroEmpleado(e.target.value)}
              className="px-3 py-1.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:outline-emerald-600"
            >
              <option value="todos">Todos los empleados</option>
              {empleadosQueCerraron.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de registros del historial persistente */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2.5 border-t border-stone-100">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="font-extrabold text-stone-600 uppercase tracking-wider text-[11px] shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-700" />
              <span>Turno ({turnosFiltrados.length} en historial):</span>
            </span>
            <select
              value={selectedTurnoId}
              onChange={(e) => setSelectedTurnoId(e.target.value)}
              className="flex-1 p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 text-xs focus:bg-white focus:outline-emerald-600"
            >
              <option value="vivo">🔴 Turno en curso (Datos en vivo de hoy: {fmtDateLabel(currentFecha)} - {currentTurno})</option>
              {turnosFiltrados.length === 0 ? (
                <option value="" disabled>No hay turnos cerrados con estos filtros</option>
              ) : (
                turnosFiltrados.map((t) => (
                  <option key={turnoKey(t)} value={turnoKey(t)}>
                    [{t.fecha}] {t.turno} ({t.hora_cierre || 'cierre'}) · {t.cerrado_por || t.cierreCaja?.empleado || 'Colaborador'} · Caja: {fmtMoney(t.cierreCaja?.efectivo_real || 0)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
            <button
              onClick={handleReenviarWhatsApp}
              disabled={isGeneratingPdf}
              className="px-3 py-1.5 bg-[#25D366] hover:bg-[#1EBE5D] disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              title="Enviar reporte PDF vía WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'PDF...' : 'WhatsApp'}</span>
            </button>
            <button
              onClick={handleDescargarPDF}
              disabled={isGeneratingPdf}
              className="px-3 py-1.5 bg-[#1B5E38] hover:bg-[#14472B] disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              title={`Descargar vista actual (${reportMode.toUpperCase()}) en PDF`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              title={`Exportar a Excel (.xlsx)`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>Excel</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              title={`Exportar a CSV`}
            >
              <FileText className="w-3.5 h-3.5 text-stone-300" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs"
              title="Imprimir reporte en papel"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Shift Snapshot Status Bar & Admin Edit Trigger */}
      {selectedPastTurno ? (
        <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#123D26] text-white flex items-center justify-center font-bold text-sm shrink-0">
              <Camera className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="font-extrabold text-[#123D26] flex items-center gap-2">
                <span>Fotografía Histórica Inmutable</span>
                <span className="text-[10px] bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full font-extrabold">
                  Turno Cerrado
                </span>
              </div>
              <div className="text-emerald-800 text-[11px] mt-0.5">
                {fmtDateLabel(selectedPastTurno.fecha)} · Turno {selectedPastTurno.turno} · Cerrado por <strong>{selectedPastTurno.cerrado_por || 'Colaborador'}</strong> ({selectedPastTurno.hora_cierre || '—'} hs)
                {selectedPastTurno.cierreCaja?.efectivo_real ? ` · Caja: ${fmtMoney(selectedPastTurno.cierreCaja.efectivo_real)}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={handleUploadClosureToDrive}
              disabled={isUploadingToDrive}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 rounded-xl font-bold cursor-pointer transition-colors text-xs flex items-center gap-1.5 shadow-2xs"
              title="Guardar acta de cierre en Google Drive (Carpeta: Reportes Cierre de Turno - Escobar)"
            >
              {isUploadingToDrive ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin" />
                  <span>Subiendo a Drive...</span>
                </>
              ) : driveFeedback?.id === (selectedPastTurno.id || selectedPastTurno.fecha) ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-blue-700" />
                  <span>Ver en Drive ↗</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-blue-700" />
                  <span>Guardar en Drive</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setEditError('');
                setEditSuccess('');
                setEditPid('');
                setEditCountVal('');
                setEditAdminPin('');
                setShowAdminEditModal(true);
              }}
              className="px-3.5 py-2 bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-900 rounded-xl font-bold cursor-pointer transition-colors text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-700" />
              <span>Ajustar conteo (Admin)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-2 text-xs text-stone-600 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-stone-800">Turno en curso ({currentTurno} - {fmtDateLabel(currentFecha)})</span>
          </div>
          <span className="text-[11px] text-stone-400">Los datos se congelarán permanentemente al cerrar este turno.</span>
        </div>
      )}

      {selectedPastTurno && snapshotSinSistema && reportMode !== 'evolucion' && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-3.5 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <span>
            <strong>Este cierre no guardó el stock del sistema (Datalive).</strong> Sin esa foto no se pueden
            calcular diferencias confiables. Podés cargarlas con "Ajustar conteo (Admin)" o reimportar el stock del día.
          </span>
        </div>
      )}

      {/* MODE 1: RESUMEN */}
      {reportMode === 'resumen' && (
        <div className="space-y-4">
          {/* MÓDULO CAJA: VALORES COMPLETOS (Efectivo, Postnet, Cobros digitales y Arqueo) */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-2xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Wallet className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm text-stone-900">
                    Módulo Caja · Arqueo y Recaudación de {activeTurno}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Fecha: {activeFecha} · Responsable: {activeCierreCaja.empleado || activeCerrador || 'Colaborador'} ({activeCierreCaja.hora || activeHoraCierre} hs)
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                Turno: {activeTurno}
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Efectivo Real */}
                <div className="bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block">
                    Efectivo Real Contado
                  </span>
                  <span className="text-2xl font-black font-mono-num text-stone-900 mt-1 block">
                    {fmtMoney(activeCierreCaja.efectivo_real || 0)}
                  </span>
                  <span className="text-[10px] text-stone-500 font-medium">Billetes en mostrador</span>
                </div>

                {/* Teórico Sistema */}
                <div className="bg-stone-50/80 p-3.5 rounded-2xl border border-stone-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 block">
                    Teórico Sistema (Datalive)
                  </span>
                  <span className="text-2xl font-black font-mono-num text-stone-800 mt-1 block">
                    {fmtMoney(activeCierreCaja.efectivo_mostrador_sist || 0)}
                  </span>
                  <span className="text-[10px] text-stone-500 font-medium">Caja teórica esperada</span>
                </div>

                {/* Arqueo / Diferencia */}
                <div className={`p-3.5 rounded-2xl border ${
                  (activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) === 0
                    ? 'bg-emerald-50/80 border-emerald-300'
                    : (activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) > 0
                    ? 'bg-emerald-50/80 border-emerald-300'
                    : 'bg-rose-50/80 border-rose-300'
                }`}>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 block">
                    Arqueo de Efectivo
                  </span>
                  <span className={`text-2xl font-black font-mono-num mt-1 block ${
                    (activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) === 0
                      ? 'text-emerald-800'
                      : (activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) > 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}>
                    {(activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) === 0
                      ? '$ 0'
                      : fmtMoney((activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0))}
                  </span>
                  <span className="text-[10px] font-bold text-stone-600 block">
                    {(activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) === 0
                      ? '✓ Caja exacta sin desvío'
                      : (activeCierreCaja.efectivo_real || 0) - (activeCierreCaja.efectivo_mostrador_sist || 0) > 0
                      ? 'Sobrante de caja'
                      : 'Faltante en caja'}
                  </span>
                </div>

                {/* Total Recaudación General */}
                <div className="bg-[#123D26] text-white p-3.5 rounded-2xl border border-[#123D26] shadow-2xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200 block">
                    Total Recaudación Turno
                  </span>
                  <span className="text-2xl font-black font-mono-num text-white mt-1 block">
                    {fmtMoney((activeCierreCaja.efectivo_real || 0) + activeSumaPostnets)}
                  </span>
                  <span className="text-[10px] text-emerald-200 font-medium">Efectivo + Postnets (contados)</span>
                </div>
              </div>

              {/* Medios Electrónicos y Cobros Digitales */}
              <div className="pt-2 border-t border-stone-100">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 mb-2 block flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-stone-600" />
                  <span>Cobros Electrónicos y Postnets:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-900 block">Postnet Amarillo</span>
                    <span className="text-base font-extrabold font-mono-num text-amber-950 mt-0.5 block">
                      {fmtMoney(activeCierreCaja.postnet_amarillo || 0)}
                    </span>
                  </div>
                  <div className="bg-pink-50/70 p-3 rounded-xl border border-pink-200">
                    <span className="text-[10px] font-bold text-pink-900 block">Postnet Rosa</span>
                    <span className="text-base font-extrabold font-mono-num text-pink-950 mt-0.5 block">
                      {fmtMoney(activeCierreCaja.postnet_rosa || 0)}
                    </span>
                  </div>
                  <div className="bg-stone-100/80 p-3 rounded-xl border border-stone-200">
                    <span className="text-[10px] font-bold text-stone-700 block">Postnet Blanco</span>
                    <span className="text-base font-extrabold font-mono-num text-stone-900 mt-0.5 block">
                      {fmtMoney(activeCierreCaja.postnet_blanco || 0)}
                    </span>
                  </div>
                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-900 block">Suma Postnets (contado)</span>
                    <span className="text-base font-extrabold font-mono-num text-emerald-950 mt-0.5 block">
                      {fmtMoney(activeSumaPostnets)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                  <div className="bg-sky-50/70 p-3 rounded-xl border border-sky-200">
                    <span className="text-[10px] font-bold text-sky-900 block">Online Local (Sistema Datalive)</span>
                    <span className="text-base font-extrabold font-mono-num text-sky-950 mt-0.5 block">
                      {fmtMoney(activeCierreCaja.online_local_sist || 0)}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${activeDifPostnets === 0 ? 'bg-emerald-50/70 border-emerald-200' : activeDifPostnets > 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}`}>
                    <span className="text-[10px] font-bold text-stone-700 block">Diferencia Postnets vs Datalive</span>
                    <span className={`text-base font-extrabold font-mono-num mt-0.5 block ${activeDifPostnets < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                      {activeDifPostnets === 0 ? '$ 0' : fmtMoney(activeDifPostnets)}
                    </span>
                  </div>
                </div>
              </div>

              {activeCierreCaja.observaciones && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 flex items-start gap-2">
                  <span className="font-extrabold text-stone-900 shrink-0">Observaciones de Caja:</span>
                  <span className="italic">{activeCierreCaja.observaciones}</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Total Sistema (Datalive)
              </span>
              <span className="text-3xl font-black font-mono-num text-stone-800 mt-1 block">
                {nf(summary.totalSistema)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Total Contado Real
              </span>
              <span className="text-3xl font-black font-mono-num text-stone-900 mt-1 block">
                {nf(summary.totalContado)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 text-center shadow-2xs">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Diferencia Absoluta
              </span>
              <span
                className={`text-3xl font-black font-mono-num mt-1 block ${
                  summary.difAbs === 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {nf(summary.difAbs)}
              </span>
              <span className="text-[11px] text-stone-500 font-medium mt-1 block">
                {summary.prodsConDif} con dif · {summary.cobertura}% cobertura
              </span>
            </div>
          </div>

          {/* Top 10 Diferencias */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-stone-700">
                Top 10 Mayores Diferencias
              </h3>
              <span className="text-xs text-stone-500">
                {summary.topDiferencias.length} productos
              </span>
            </div>

            {summary.topDiferencias.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                ✓ No hay diferencias registradas en el conteo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Producto</th>
                      <th className="py-2.5 px-3 text-right">Sistema</th>
                      <th className="py-2.5 px-3 text-right">Contado</th>
                      <th className="py-2.5 px-3 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono-num">
                    {summary.topDiferencias.map((item, idx) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-bold text-stone-900 block">{item.producto}</span>
                          <span className="text-[11px] text-stone-400 block">
                            {item.categoria} {item.empleado ? `· Contó ${item.empleado}` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-stone-600">{nf(item.sistema)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-stone-900">{nf(item.contado)}</td>
                        <td className={`py-2.5 px-3 text-right font-black ${
                          item.diferencia > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                          {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: DETALLE */}
      {reportMode === 'detalle' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100 text-xs">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs w-48 focus:bg-white"
            />
            <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(e) => setOnlyDiff(e.target.checked)}
                className="rounded text-[#1B5E38] focus:ring-[#1B5E38]"
              />
              <span>Solo diferencias</span>
            </label>
          </div>

          <div className="space-y-4">
            {catalogo.map((cat) => {
              const catProds = cat.grupos.flatMap((g) => g.productos).filter((p) => {
                if (searchFilter && !p.nombre.toLowerCase().includes(searchFilter.toLowerCase())) return false;
                const pid = productId(cat.id, p);
                const sys = getSysStock(pid);
                const { total: contado } = getCntStock(pid);
                const diff = contado - sys;
                if (onlyDiff && diff === 0) return false;
                return true;
              });

              if (catProds.length === 0) return null;

              const catTotalContado = catProds.reduce((acc, p) => {
                const pid = productId(cat.id, p);
                return acc + getCntStock(pid).total;
              }, 0);
              const catTotalSistema = catProds.reduce((acc, p) => {
                const pid = productId(cat.id, p);
                return acc + getSysStock(pid);
              }, 0);
              const catTotalDiff = catTotalContado - catTotalSistema;

              return (
                <div key={cat.id} className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-[#123D26] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>{cat.nombre}</span>
                    <span className="text-[11px] font-mono-num font-bold opacity-90">
                      Cont: {nf(catTotalContado)} | Sist: {nf(catTotalSistema)} | Dif: {catTotalDiff > 0 ? `+${catTotalDiff}` : catTotalDiff}
                    </span>
                  </div>
                  <table className="w-full text-left text-xs font-mono-num">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                        <th className="py-2 px-3 font-sans">Producto</th>
                        <th className="py-2 px-3 text-right">Contado</th>
                        <th className="py-2 px-3 text-right">Sistema</th>
                        <th className="py-2 px-3 text-right">Dif.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {catProds.map((p) => {
                        const pid = productId(cat.id, p);
                        const sys = getSysStock(pid);
                        const { total: contado } = getCntStock(pid);
                        const diff = contado - sys;

                        return (
                          <tr key={pid} className="hover:bg-stone-50">
                            <td className="py-2 px-3 font-sans font-semibold text-stone-800">
                              {p.nombre}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-stone-900">{nf(contado)}</td>
                            <td className="py-2 px-3 text-right text-stone-600">{nf(sys)}</td>
                            <td className={`py-2 px-3 text-right font-black ${
                              diff === 0 ? 'text-stone-400' : diff > 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}>
                              {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-100/90 border-t-2 border-stone-300 font-bold text-stone-900 text-xs">
                        <td className="py-2.5 px-3 font-sans uppercase text-[11px]">
                          Total {cat.nombre}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-stone-950">
                          {nf(catTotalContado)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-stone-700">
                          {nf(catTotalSistema)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-black ${
                          catTotalDiff === 0 ? 'text-stone-400' : catTotalDiff > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                          {catTotalDiff === 0 ? '0' : catTotalDiff > 0 ? `+${catTotalDiff}` : catTotalDiff}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 3: COMPARAR (PUNTO 3: Total Contado vs Diferencia vs Sistema) */}
      {reportMode === 'comparar' && (() => {
        const snapA = getSnapshotData(compareAKey);
        const snapB = getSnapshotData(compareBKey);

        let totalFisicoA = 0;
        let totalFisicoB = 0;
        let totalSistA = 0;
        let totalSistB = 0;
        let totalDesvioA = 0;
        let totalDesvioB = 0;

        // Collect all products matching filter
        const filteredProds: Array<{
          catId: string;
          catNombre: string;
          codigo: string;
          nombre: string;
          valFisA: number;
          valSistA: number;
          desvioA: number;
          valFisB: number;
          valSistB: number;
          desvioB: number;
        }> = [];

        catalogo.forEach((cat) => {
          if (compareCatFilter !== 'todas' && cat.id !== compareCatFilter) return;

          cat.grupos.forEach((g) => {
            g.productos.forEach((p) => {
              if (compareSearch && !p.nombre.toLowerCase().includes(compareSearch.toLowerCase())) return;

              const pid = productId(cat.id, p);

              // Data A
              const entryA = snapA.conteos[pid];
              const fisA = entryA ? Object.values(entryA.ubic).reduce((a, b) => a + b, 0) : 0;
              const sistA = snapA.sistema[pid]?.stock ?? 0;
              const desvA = fisA - sistA;

              // Data B
              const entryB = snapB.conteos[pid];
              const fisB = entryB ? Object.values(entryB.ubic).reduce((a, b) => a + b, 0) : 0;
              const sistB = snapB.sistema[pid]?.stock ?? 0;
              const desvB = fisB - sistB;

              totalFisicoA += fisA;
              totalFisicoB += fisB;
              totalSistA += sistA;
              totalSistB += sistB;
              totalDesvioA += desvA;
              totalDesvioB += desvB;

              filteredProds.push({
                catId: cat.id,
                catNombre: cat.nombre,
                codigo: p.codigo,
                nombre: p.nombre,
                valFisA: fisA,
                valSistA: sistA,
                desvioA: desvA,
                valFisB: fisB,
                valSistB: sistB,
                desvioB: desvB,
              });
            });
          });
        });

        const deltaFisico = totalFisicoB - totalFisicoA;
        const deltaDesvio = totalDesvioB - totalDesvioA;

        return (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
            {/* Header Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">Turno A (Base / Referencia)</label>
                <select
                  value={compareAKey}
                  onChange={(e) => setCompareAKey(e.target.value)}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg font-bold text-stone-800"
                >
                  {allSnapshots.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">Turno B (Comparado)</label>
                <select
                  value={compareBKey}
                  onChange={(e) => setCompareBKey(e.target.value)}
                  className="w-full p-2 bg-white border border-stone-300 rounded-lg font-bold text-stone-800"
                >
                  {allSnapshots.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Metric Mode Selector: Punto 3 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() => setCompareMetric('contado')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                    compareMetric === 'contado'
                      ? 'bg-[#1B5E38] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                  }`}
                >
                  Total Físico Contado
                </button>
                <button
                  type="button"
                  onClick={() => setCompareMetric('diferencia')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                    compareMetric === 'diferencia'
                      ? 'bg-[#1B5E38] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                  }`}
                >
                  Diferencia vs Sistema (Desvío)
                </button>
                <button
                  type="button"
                  onClick={() => setCompareMetric('ambos')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                    compareMetric === 'ambos'
                      ? 'bg-[#1B5E38] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                  }`}
                >
                  Vista Completa
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={compareCatFilter}
                  onChange={(e) => setCompareCatFilter(e.target.value)}
                  className="p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700"
                >
                  <option value="todas">Todas las Categorías</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={compareSearch}
                  onChange={(e) => setCompareSearch(e.target.value)}
                  className="p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs w-36 sm:w-44 focus:bg-white"
                />
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono-num">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <span className="block text-[10px] uppercase font-sans font-bold text-stone-500 mb-0.5">
                  Turno A (Total)
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-black text-stone-900">
                    {compareMetric === 'diferencia' ? (totalDesvioA > 0 ? `+${totalDesvioA}` : totalDesvioA) : nf(totalFisicoA)} u.
                  </span>
                  <span className="text-[11px] text-stone-500 font-sans">
                    {compareMetric === 'diferencia' ? `Sist: ${nf(totalSistA)}` : `Desvío: ${totalDesvioA}`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <span className="block text-[10px] uppercase font-sans font-bold text-stone-500 mb-0.5">
                  Turno B (Total)
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-black text-stone-900">
                    {compareMetric === 'diferencia' ? (totalDesvioB > 0 ? `+${totalDesvioB}` : totalDesvioB) : nf(totalFisicoB)} u.
                  </span>
                  <span className="text-[11px] text-stone-500 font-sans">
                    {compareMetric === 'diferencia' ? `Sist: ${nf(totalSistB)}` : `Desvío: ${totalDesvioB}`}
                  </span>
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${
                compareMetric === 'diferencia'
                  ? deltaDesvio === 0 ? 'bg-stone-50 border-stone-200' : deltaDesvio > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                  : deltaFisico === 0 ? 'bg-stone-50 border-stone-200' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <span className="block text-[10px] uppercase font-sans font-bold text-stone-500 mb-0.5">
                  Variación Neta (Turno B - A)
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-black text-stone-900">
                    {compareMetric === 'diferencia'
                      ? (deltaDesvio > 0 ? `+${deltaDesvio}` : `${deltaDesvio}`)
                      : (deltaFisico > 0 ? `+${deltaFisico}` : `${deltaFisico}`)} u.
                  </span>
                  <span className="text-[11px] text-stone-600 font-sans font-semibold">
                    {compareMetric === 'diferencia'
                      ? (deltaDesvio === 0 ? 'Sin variación' : deltaDesvio > 0 ? 'Mayor sobrante' : 'Mayor faltante')
                      : (deltaFisico > 0 ? 'Stock físico mayor' : 'Stock físico menor')}
                  </span>
                </div>
              </div>
            </div>

            {/* Comparison Table grouped by Category (PUNTO 4: Totales por categoría) */}
            <div className="space-y-4">
              {catalogo
                .filter((cat) => compareCatFilter === 'todas' || cat.id === compareCatFilter)
                .map((cat) => {
                  const catProds = filteredProds.filter((p) => p.catId === cat.id);
                  if (catProds.length === 0) return null;

                  const catFisA = catProds.reduce((sum, p) => sum + p.valFisA, 0);
                  const catFisB = catProds.reduce((sum, p) => sum + p.valFisB, 0);
                  const catDesvA = catProds.reduce((sum, p) => sum + p.desvioA, 0);
                  const catDesvB = catProds.reduce((sum, p) => sum + p.desvioB, 0);
                  const varCatFis = catFisB - catFisA;
                  const varCatDesv = catDesvB - catDesvA;

                  return (
                    <div key={cat.id} className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
                      {/* Category Header with Consolidated Totals */}
                      <div className="bg-[#123D26] text-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span>CATEGORÍA: {cat.nombre}</span>
                          <span className="text-emerald-300 font-mono-num text-[11px] font-normal">
                            ({catProds.length} ítems)
                          </span>
                        </span>
                        <span className="font-mono-num font-bold text-white text-[11px]">
                          {compareMetric === 'contado' && (
                            <span>
                              FÍSICO A: {nf(catFisA)} &nbsp;|&nbsp; FÍSICO B: {nf(catFisB)} &nbsp;|&nbsp;
                              <span className={varCatFis >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                &nbsp;VARIACIÓN: {varCatFis > 0 ? `+${nf(varCatFis)}` : nf(varCatFis)}
                              </span>
                            </span>
                          )}
                          {compareMetric === 'diferencia' && (
                            <span>
                              DESVÍO A: {catDesvA > 0 ? `+${nf(catDesvA)}` : nf(catDesvA)} &nbsp;|&nbsp; DESVÍO B: {catDesvB > 0 ? `+${nf(catDesvB)}` : nf(catDesvB)} &nbsp;|&nbsp;
                              <span className={varCatDesv >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                &nbsp;EVOLUCIÓN DESVÍO: {varCatDesv > 0 ? `+${nf(varCatDesv)}` : nf(varCatDesv)}
                              </span>
                            </span>
                          )}
                          {compareMetric === 'ambos' && (
                            <span>
                              Δ FÍSICO: {varCatFis > 0 ? `+${nf(varCatFis)}` : nf(varCatFis)} &nbsp;|&nbsp;
                              <span className={varCatDesv >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                &nbsp;Δ DESVÍO: {varCatDesv > 0 ? `+${nf(varCatDesv)}` : nf(varCatDesv)}
                              </span>
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono-num">
                          <thead>
                            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                              <th className="py-2.5 px-3 font-sans">Cód.</th>
                              <th className="py-2.5 px-3 font-sans">Producto</th>
                              {compareMetric === 'contado' && (
                                <>
                                  <th className="py-2.5 px-3 text-right">Físico A</th>
                                  <th className="py-2.5 px-3 text-right">Físico B</th>
                                  <th className="py-2.5 px-3 text-right">Variación (B - A)</th>
                                </>
                              )}
                              {compareMetric === 'diferencia' && (
                                <>
                                  <th className="py-2.5 px-3 text-right">Desvío A (Fís-Sist)</th>
                                  <th className="py-2.5 px-3 text-right">Desvío B (Fís-Sist)</th>
                                  <th className="py-2.5 px-3 text-right">Evolución Desvío</th>
                                </>
                              )}
                              {compareMetric === 'ambos' && (
                                <>
                                  <th className="py-2.5 px-3 text-right">Turno A (Fís / Sist / Dif)</th>
                                  <th className="py-2.5 px-3 text-right">Turno B (Fís / Sist / Dif)</th>
                                  <th className="py-2.5 px-3 text-right">Δ Físico | Δ Desvío</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {catProds.map((row) => {
                              const varFis = row.valFisB - row.valFisA;
                              const varDesv = row.desvioB - row.desvioA;

                              return (
                                <tr key={`${row.catId}-${row.nombre}`} className="hover:bg-stone-50">
                                  <td className="py-2 px-3 text-stone-400 text-[11px] font-mono-num">
                                    {row.codigo || '—'}
                                  </td>
                                  <td className="py-2 px-3 font-sans font-bold text-stone-900">
                                    {row.nombre}
                                  </td>

                                  {compareMetric === 'contado' && (
                                    <>
                                      <td className="py-2 px-3 text-right text-stone-600 font-semibold">{nf(row.valFisA)}</td>
                                      <td className="py-2 px-3 text-right font-bold text-stone-900">{nf(row.valFisB)}</td>
                                      <td className={`py-2 px-3 text-right font-black ${
                                        varFis === 0 ? 'text-stone-400' : varFis > 0 ? 'text-emerald-700' : 'text-rose-600'
                                      }`}>
                                        {varFis === 0 ? '0' : varFis > 0 ? `+${varFis}` : varFis}
                                      </td>
                                    </>
                                  )}

                                  {compareMetric === 'diferencia' && (
                                    <>
                                      <td className={`py-2 px-3 text-right font-semibold ${
                                        row.desvioA === 0 ? 'text-stone-400' : row.desvioA > 0 ? 'text-emerald-700' : 'text-rose-600'
                                      }`}>
                                        {row.desvioA === 0 ? '0' : row.desvioA > 0 ? `+${row.desvioA}` : row.desvioA}
                                      </td>
                                      <td className={`py-2 px-3 text-right font-bold ${
                                        row.desvioB === 0 ? 'text-stone-400' : row.desvioB > 0 ? 'text-emerald-700' : 'text-rose-600'
                                      }`}>
                                        {row.desvioB === 0 ? '0' : row.desvioB > 0 ? `+${row.desvioB}` : row.desvioB}
                                      </td>
                                      <td className={`py-2 px-3 text-right font-black ${
                                        varDesv === 0 ? 'text-stone-400' : varDesv > 0 ? 'text-emerald-700' : 'text-rose-600'
                                      }`}>
                                        {varDesv === 0 ? '0' : varDesv > 0 ? `+${varDesv}` : varDesv}
                                      </td>
                                    </>
                                  )}

                                  {compareMetric === 'ambos' && (
                                    <>
                                      <td className="py-2 px-3 text-right text-stone-700">
                                        <span>{row.valFisA}</span>
                                        <span className="text-stone-400 mx-1">/</span>
                                        <span className="text-stone-500">{row.valSistA}</span>
                                        <span className="text-stone-400 mx-1">/</span>
                                        <span className={`font-bold ${row.desvioA === 0 ? 'text-stone-400' : row.desvioA > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                          {row.desvioA > 0 ? `+${row.desvioA}` : row.desvioA}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right text-stone-900 font-semibold">
                                        <span>{row.valFisB}</span>
                                        <span className="text-stone-400 mx-1">/</span>
                                        <span className="text-stone-500">{row.valSistB}</span>
                                        <span className="text-stone-400 mx-1">/</span>
                                        <span className={`font-bold ${row.desvioB === 0 ? 'text-stone-400' : row.desvioB > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                          {row.desvioB > 0 ? `+${row.desvioB}` : row.desvioB}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-right font-bold">
                                        <span className={varFis > 0 ? 'text-emerald-700' : varFis < 0 ? 'text-rose-600' : 'text-stone-400'}>
                                          {varFis > 0 ? `+${varFis}` : varFis}
                                        </span>
                                        <span className="text-stone-300 mx-1.5">|</span>
                                        <span className={varDesv > 0 ? 'text-emerald-700' : varDesv < 0 ? 'text-rose-600' : 'text-stone-400'}>
                                          {varDesv > 0 ? `+${varDesv}` : varDesv}
                                        </span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })()}

      {/* MODE 4: EVOLUCION HISTORICA DE DESVIOS (PUNTO 4 & 5) */}
      {reportMode === 'evolucion' && (() => {
        const toggleCategory = (catId: string) => {
          setSelectedEvolucionCats((prev) => {
            if (prev.includes(catId)) {
              return prev.filter((id) => id !== catId);
            } else {
              return [...prev, catId];
            }
          });
        };

        const selectAllCategories = () => {
          setSelectedEvolucionCats(catalogo.map((c) => c.id));
        };

        const clearCategories = () => {
          setSelectedEvolucionCats([]);
        };

        // Collect all products belonging to selected categories
        const prodsList: Array<{
          catId: string;
          catNombre: string;
          codigo: string;
          nombre: string;
          diffs: number[];
          diffAcum: number;
        }> = [];

        // Daily totals for selected categories
        const dayTotals = evolucionDays.map(() => 0);

        catalogo.forEach((cat) => {
          if (!selectedEvolucionCats.includes(cat.id)) return;

          cat.grupos.forEach((g) => {
            g.productos.forEach((p) => {
              if (searchEvolucion && !p.nombre.toLowerCase().includes(searchEvolucion.toLowerCase())) return;

              const diffs = evolucionDays.map((d, dIdx) => {
                const diff = getProductDayDiff(cat.id, p, d);
                dayTotals[dIdx] += diff;
                return diff;
              });

              const hasAnyDiff = diffs.some((d) => d !== 0);
              if (soloConDesvioEvolucion && !hasAnyDiff) return;

              const diffAcum = diffs.reduce((a, b) => a + b, 0);

              prodsList.push({
                catId: cat.id,
                catNombre: cat.nombre,
                codigo: p.codigo,
                nombre: p.nombre,
                diffs,
                diffAcum,
              });
            });
          });
        });

        return (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
            {/* Title & Description */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
              <div>
                <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#1B5E38]" />
                  <span>Histórico de Desvíos Diarios por Producto</span>
                </h3>
                <p className="text-stone-500 text-[11px]">
                  Seguimiento de diferencias físicas vs Datalive día por día. Seleccioná rango de fechas y categorías deseadas.
                </p>
              </div>

              {/* Quick actions for categories */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={selectAllCategories}
                  className="px-2.5 py-1 text-[11px] font-bold text-[#1B5E38] hover:bg-emerald-50 rounded-lg cursor-pointer"
                >
                  Seleccionar todas
                </button>
                <span className="text-stone-300">|</span>
                <button
                  type="button"
                  onClick={clearCategories}
                  className="px-2.5 py-1 text-[11px] font-bold text-stone-500 hover:bg-stone-100 rounded-lg cursor-pointer"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Date Range Selector (Punto 5) */}
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-stone-500 uppercase mr-1">Rango de Fechas:</span>
                {(['5dias', '7dias', '14dias', 'custom'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEvolucionPreset(preset)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                      evolucionPreset === preset
                        ? 'bg-[#1B5E38] text-white shadow-xs'
                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {preset === '5dias' ? 'Últimos 5 días' : preset === '7dias' ? 'Últimos 7 días' : preset === '14dias' ? 'Últimos 14 días' : 'Personalizado'}
                  </button>
                ))}
              </div>

              {evolucionPreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-bold text-stone-500">Desde:</label>
                    <input
                      type="date"
                      value={evolucionFechaDesde}
                      onChange={(e) => setEvolucionFechaDesde(e.target.value)}
                      className="p-1.5 bg-white border border-stone-200 rounded-lg text-xs font-mono-num"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-bold text-stone-500">Hasta:</label>
                    <input
                      type="date"
                      value={evolucionFechaHasta}
                      onChange={(e) => setEvolucionFechaHasta(e.target.value)}
                      className="p-1.5 bg-white border border-stone-200 rounded-lg text-xs font-mono-num"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Category Selector Buttons (Matching 'Contar': Punto 4) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Categorías a visualizar (podés combinar varias, ej: Empanadas + Bebidas):
              </label>
              <div className="flex flex-wrap gap-2">
                {catalogo.map((cat) => {
                  const isSelected = selectedEvolucionCats.includes(cat.id);
                  const icon = cat.id === 'empanadas' ? '🥟' : cat.id === 'panificados' ? '🍕' : cat.id === 'burritos' ? '🌯' : cat.id === 'sandwich_panchos' ? '🥪' : cat.id === 'bebidas' ? '🥤' : '📦';

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-[#123D26] text-white border-[#123D26] shadow-xs'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span>{icon}</span>
                      <span>{cat.nombre}</span>
                      {isSelected && <span className="ml-1 text-[10px] text-emerald-300">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filters bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700 text-xs">
                <input
                  type="checkbox"
                  checked={soloConDesvioEvolucion}
                  onChange={(e) => setSoloConDesvioEvolucion(e.target.checked)}
                  className="rounded text-[#1B5E38] focus:ring-[#1B5E38]"
                />
                <span>Mostrar solo productos con desvíos detectados</span>
              </label>

              <input
                type="text"
                placeholder="Filtrar por nombre de producto..."
                value={searchEvolucion}
                onChange={(e) => setSearchEvolucion(e.target.value)}
                className="p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs w-56 focus:bg-white"
              />
            </div>

            {/* Evolution Historical Table */}
            {selectedEvolucionCats.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-stone-500">
                Seleccioná al menos una categoría arriba para visualizar el histórico de desvíos.
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-200 rounded-xl">
                <table className="w-full text-left text-xs font-mono-num">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3 font-sans">Cód.</th>
                      <th className="py-2.5 px-3 font-sans">Producto</th>
                      <th className="py-2.5 px-3 font-sans">Categoría</th>
                      {evolucionDays.map((d) => (
                        <th key={d.key} className={`py-2.5 px-3 text-right ${d.isToday ? 'bg-emerald-50 text-emerald-900 font-black' : ''}`}>
                          <span className="block">{d.label}</span>
                          <span className="text-[9px] font-normal opacity-75">{d.sub}</span>
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-right">Desvío Acum.</th>
                      <th className="py-2.5 px-3 text-center font-sans">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {prodsList.map((row) => (
                      <tr key={`${row.catId}-${row.nombre}`} className="hover:bg-stone-50">
                        <td className="py-2 px-3 text-stone-400 text-[11px] font-mono-num">
                          {row.codigo || '—'}
                        </td>
                        <td className="py-2 px-3 font-sans font-bold text-stone-900">
                          {row.nombre}
                        </td>
                        <td className="py-2 px-3 font-sans text-stone-500 text-[11px]">
                          {row.catNombre}
                        </td>
                        {row.diffs.map((diff, dIdx) => {
                          const isToday = evolucionDays[dIdx].isToday;
                          return (
                            <td
                              key={dIdx}
                              className={`py-2 px-3 text-right font-bold ${
                                isToday ? 'bg-emerald-50/40' : ''
                              } ${
                                diff === 0
                                  ? 'text-stone-300'
                                  : diff > 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                            </td>
                          );
                        })}
                        <td className={`py-2 px-3 text-right font-black ${
                          row.diffAcum === 0 ? 'text-stone-400' : row.diffAcum > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                          {row.diffAcum === 0 ? '0' : row.diffAcum > 0 ? `+${row.diffAcum}` : row.diffAcum}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.diffAcum === 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600">
                              Exacto
                            </span>
                          ) : row.diffAcum > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Sobrante
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              Faltante
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Summary Totals Row */}
                  <tfoot>
                    <tr className="bg-stone-100 border-t-2 border-stone-300 font-bold text-stone-900">
                      <td colSpan={3} className="py-2.5 px-3 font-sans uppercase text-[10px]">
                        Total Desvío Neto (Categorías Seleccionadas)
                      </td>
                      {dayTotals.map((tot, idx) => (
                        <td
                          key={idx}
                          className={`py-2.5 px-3 text-right font-black ${
                            tot === 0 ? 'text-stone-500' : tot > 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {tot === 0 ? '0' : tot > 0 ? `+${tot}` : tot}
                        </td>
                      ))}
                      <td className={`py-2.5 px-3 text-right font-black ${
                        dayTotals.reduce((a, b) => a + b, 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}>
                        {dayTotals.reduce((a, b) => a + b, 0) > 0 ? `+${dayTotals.reduce((a, b) => a + b, 0)}` : dayTotals.reduce((a, b) => a + b, 0)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Modal: Ajustar Conteo Histórico Cerrado (Admin con PIN) */}
      {showAdminEditModal && selectedPastTurno && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900">
                    Ajustar Conteo Histórico (Admin)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Turno {selectedPastTurno.turno} · {fmtDateLabel(selectedPastTurno.fecha)} (Cerrado por {selectedPastTurno.cerrado_por || 'Colaborador'})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminEditModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-[11px] text-amber-950 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
              <span>
                <strong>Modificación Protegida:</strong> Este turno está oficialmente cerrado y congelado. Cualquier corrección manual quedará auditada y requiere PIN de Administrador (Charly <strong>1234</strong>, Luis <strong>4321</strong> o Admin <strong>170226</strong>).
              </span>
            </div>

            {/* Selector de Producto */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                Producto a corregir:
              </label>
              <select
                value={editPid}
                onChange={(e) => {
                  const newPid = e.target.value;
                  setEditPid(newPid);
                  if (newPid) {
                    const currentVal = getCntStock(newPid).total;
                    setEditCountVal(currentVal.toString());
                  } else {
                    setEditCountVal('');
                  }
                  setEditError('');
                }}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-800 focus:bg-white focus:outline-emerald-600"
              >
                <option value="">-- Seleccionar producto del catálogo --</option>
                {catalogo.map((c) => (
                  <optgroup key={c.id} label={c.nombre}>
                    {c.grupos.flatMap((g) => g.productos).map((p) => {
                      const pid = productId(c.id, p);
                      return (
                        <option key={pid} value={pid}>
                          {p.nombre} (Contado actual: {getCntStock(pid).total} u.)
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </div>

            {editPid && (
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">Stock Sistema en ese turno</span>
                  <span className="font-mono-num font-bold text-stone-700 text-sm">{getSysStock(editPid)} u.</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">Físico Registrado Anoche</span>
                  <span className="font-mono-num font-bold text-stone-900 text-sm">{getCntStock(editPid).total} u.</span>
                </div>
              </div>
            )}

            {/* Nuevo conteo físico */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                Nuevo conteo físico corregido:
              </label>
              <input
                type="number"
                min="0"
                value={editCountVal}
                onChange={(e) => setEditCountVal(e.target.value)}
                placeholder="0"
                disabled={!editPid}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 focus:bg-white focus:outline-emerald-600 disabled:opacity-50"
              />
            </div>

            {/* PIN Administrador */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block flex items-center justify-between">
                <span>PIN de Seguridad Administrador:</span>
                <span className="text-[10px] text-stone-400 font-normal">PIN 4 o 6 dígitos</span>
              </label>
              <input
                type="password"
                maxLength={6}
                value={editAdminPin}
                onChange={(e) => setEditAdminPin(e.target.value)}
                placeholder="••••"
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-center text-lg font-mono tracking-widest text-stone-900 focus:bg-white focus:outline-emerald-600"
              />
            </div>

            {/* Feedback messages */}
            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{editSuccess}</span>
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowAdminEditModal(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingEdit || !editPid}
                onClick={async () => {
                  if (!editPid) {
                    setEditError('Seleccioná un producto para ajustar.');
                    return;
                  }
                  if (!editAdminPin.trim()) {
                    setEditError('Ingresá el PIN de Administrador (ej. 1234 o 170226).');
                    return;
                  }
                  const countNum = parseInt(editCountVal, 10);
                  if (isNaN(countNum) || countNum < 0) {
                    setEditError('Ingresá una cantidad válida (0 o superior).');
                    return;
                  }

                  setIsSavingEdit(true);
                  setEditError('');
                  setEditSuccess('');

                  const updatedConteos = JSON.parse(JSON.stringify(activeConteos));
                  const targetCat = catalogo.find((c) => c.grupos.some((g) => g.productos.some((p) => productId(c.id, p) === editPid)));
                  const defaultUbic = targetCat?.ubicaciones?.[0] || 'Freezer';

                  updatedConteos[editPid] = {
                    ubic: { [defaultUbic]: countNum },
                    empleado: `Admin (Ajuste)`,
                    hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                  };

                  const res = await actualizarTurnoHistorico(
                    selectedPastTurno.fecha,
                    selectedPastTurno.turno,
                    { conteos: updatedConteos },
                    editAdminPin.trim()
                  );

                  setIsSavingEdit(false);
                  if (res.ok) {
                    setEditSuccess('✓ Conteo histórico actualizado y persistido exitosamente.');
                    setTimeout(() => {
                      setShowAdminEditModal(false);
                      setEditPid('');
                      setEditCountVal('');
                      setEditAdminPin('');
                      setEditSuccess('');
                    }, 1200);
                  } else {
                    setEditError(res.motivo || 'PIN de Administrador incorrecto.');
                  }
                }}
                className="px-4 py-2 bg-[#123D26] hover:bg-[#1B5E38] disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                {isSavingEdit ? 'Guardando...' : 'Confirmar Ajuste (Admin)'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
