import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useCentral } from '../context/CentralContext';
import { fmtMoney, fmtSignedMoney, productId, abrirWhatsApp, isAdminUser } from '../utils/centralHelpers';
import { generatePdfGerencial } from '../utils/pdfGerencialGenerator';
import { generateShiftPDF } from '../utils/pdfGenerator';
import { VentasTurnoData, PedidoFabricaItem, VentaCanal } from '../types/central';
import { 
  TrendingUp, 
  Factory, 
  FileText, 
  DollarSign, 
  Lock, 
  ShieldCheck, 
  Download, 
  Share2, 
  Plus, 
  Minus, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  ClipboardPaste,
  HelpCircle,
  RefreshCw,
  ArrowDownRight,
  UserCheck,
  Receipt,
  Layers,
  PieChart,
  ShoppingBag,
  Clock,
  ChevronDown,
  Building2,
  Calendar,
  CreditCard,
  Filter,
  Copy,
  Edit2,
  X,
  Check,
  ArrowRight,
  FileSpreadsheet,
  Cloud,
  FolderCheck,
  ExternalLink,
  HardDrive
} from 'lucide-react';

const STORAGE_KEY_VENTAS = 'central_esco_ventas_turno_v1';
const STORAGE_KEY_OBJETIVOS = 'central_esco_stock_objetivos_v1';
const STORAGE_KEY_DL_CAJA = 'central_esco_dl_caja_cache_v1';
const STORAGE_KEY_POSTNETS_OVERRIDES = 'central_esco_postnets_overrides_v1';

export const GerenciaTab: React.FC = () => {
  const {
    currentEmpleado,
    currentFecha,
    currentTurno,
    catalogo,
    sistemaStock,
    conteoActual,
    cierreCaja,
    pastTurnos,
  } = useCentral();

  // Role check: Only Charly, Luis and technical Admin
  const isAuthorized = isAdminUser(currentEmpleado);

  const [pinUnlock, setPinUnlock] = useState('');
  const [unlockedByPin, setUnlockedByPin] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'ventas' | 'caja_auditoria' | 'arqueo_postnets' | 'fabrica' | 'pdf' | 'google_drive'>('ventas');

  // Datalive detailed caja and sales cache
  const [dlCajaData, setDlCajaData] = useState<any>(() => {
    try {
      const saved =
        localStorage.getItem(`${STORAGE_KEY_DL_CAJA}_${currentFecha}_${currentTurno}`) ||
        localStorage.getItem(STORAGE_KEY_DL_CAJA);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [cajasDisponibles, setCajasDisponibles] = useState<any[]>([]);
  const [selectedCodVentas, setSelectedCodVentas] = useState<string>('');
  const [isLoadingDl, setIsLoadingDl] = useState(false);

  // Stock objectives (stock de seguridad por producto para fábrica)
  const [stockObjetivos, setStockObjetivos] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OBJETIVOS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Ventas Data State
  const [ventasData, setVentasData] = useState<VentasTurnoData>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_VENTAS}_${currentFecha}_${currentTurno}`);
      if (saved) return JSON.parse(saved);
    } catch {}

    return {
      fecha: currentFecha,
      turno: currentTurno,
      cargadoPor: currentEmpleado?.nombre || 'Administración',
      fechaHoraCarga: new Date().toISOString(),
      totalFacturado: 0,
      totalTickets: 0,
      canales: [
        { id: 'salon', nombre: 'Salón / Mostrador', monto: 0, tickets: 0 },
        { id: 'online_local', nombre: 'Online Local (Postnets)', monto: 0, tickets: 0 },
        { id: 'pedidosya_online', nombre: 'PedidosYa Online', monto: 0, tickets: 0 },
        { id: 'pedidosya_efectivo', nombre: 'PedidosYa Efectivo', monto: 0, tickets: 0 },
      ],
      articulos: {},
      observaciones: '',
    };
  });

  // Quick paste modal / textarea
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Filter for volume articles view
  const [selectedRubroFiltro, setSelectedRubroFiltro] = useState<string>('todos');

  // Pedido a fábrica overrides (cantidades confirmadas por el dueño)
  const [pedidoOverrides, setPedidoOverrides] = useState<Record<string, number>>({});

  const showFeedback = (text: string, type: 'success' | 'info' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Google Drive Autónomo (charlydepiero@gmail.com)
  const [driveConfig, setDriveConfig] = useState<{
    targetAccount: string;
    targetFolder: string;
    driveScriptUrl: string;
    configured: boolean;
    lastDriveUpload?: string;
    lastDriveUrl?: string;
  }>({
    targetAccount: 'charlydepiero@gmail.com',
    targetFolder: 'Reportes Cierre de Turno - Escobar',
    driveScriptUrl: '',
    configured: false,
  });
  const [inputDriveScriptUrl, setInputDriveScriptUrl] = useState('');
  const [isSavingDriveUrl, setIsSavingDriveUrl] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<{
    ok: boolean;
    message: string;
    driveUrl?: string;
    solucion?: string;
    pasos?: string[];
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncingTurnoId, setSyncingTurnoId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/google/drive-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setDriveConfig(data);
          setInputDriveScriptUrl(data.driveScriptUrl || '');
        }
      })
      .catch((e) => console.log('Error loading drive config:', e));
  }, []);

  const handleSaveDriveConfig = async () => {
    setIsSavingDriveUrl(true);
    try {
      const res = await fetch('/api/google/drive-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveScriptUrl: inputDriveScriptUrl.trim(),
          accountEmail: 'charlydepiero@gmail.com',
          targetFolder: 'Reportes Cierre de Turno - Escobar',
        }),
      });
      if (res.ok) {
        setDriveConfig((prev) => ({
          ...prev,
          driveScriptUrl: inputDriveScriptUrl.trim(),
          configured: Boolean(inputDriveScriptUrl.trim().startsWith('http')),
        }));
        showFeedback('✓ Configuración de Google Drive guardada en el servidor.');
      }
    } catch (e: any) {
      showFeedback('Error guardando configuración de Drive.', 'info');
    } finally {
      setIsSavingDriveUrl(false);
    }
  };

  const handleTestDrive = async () => {
    setIsTestingDrive(true);
    setDriveTestResult(null);
    try {
      const urlToSend = inputDriveScriptUrl.trim();
      const res = await fetch('/api/google/drive-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveScriptUrl: urlToSend }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { ok: false, error: 'El servidor devolvió una respuesta inesperada. Intentá nuevamente.' };
      }

      if (json && json.ok) {
        setDriveTestResult({
          ok: true,
          message: json.message || '✓ Conexión exitosa. Archivo de prueba creado en tu Google Drive.',
          driveUrl: json.driveUrl,
        });
        showFeedback('✓ Archivo de prueba subido a tu Google Drive.');
      } else {
        setDriveTestResult({
          ok: false,
          message: json?.error || 'Error al conectar con Google Apps Script.',
          solucion: json?.solucion,
          pasos: json?.pasos,
        });
      }
    } catch (err: any) {
      setDriveTestResult({
        ok: false,
        message: err?.message || 'Error de conexión con el servidor.',
      });
    } finally {
      setIsTestingDrive(false);
    }
  };

  const APPS_SCRIPT_CODE = `// ===== Central App - Apps Script (PDF de cierres + respaldo de datos) =====
// 1) Cambiá CLAVE por una clave larga inventada por vos (sin espacios).
// 2) Esa MISMA clave se carga en la app como STATE_SYNC_SECRET.
var CLAVE = 'CAMBIAR_POR_UNA_CLAVE_LARGA';
var CARPETA_PDF = 'Reportes Cierre de Turno - Escobar';
var CARPETA_DATOS = 'Central App - Datos';
var ARCHIVO_ESTADO = 'app-storage.json';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'saveState') return guardarEstado_(data);
    if (data.action === 'loadState') return leerEstado_(data);
    return guardarPdf_(data); // comportamiento de siempre (action: guardar_pdf)
  } catch (err) {
    return salida_({ ok: false, error: err.toString() });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function carpeta_(nombre) {
  var it = DriveApp.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
}

function claveOk_(data) {
  return CLAVE !== 'CAMBIAR_POR_UNA_CLAVE_LARGA' && data.secret === CLAVE;
}

function guardarEstado_(data) {
  if (!claveOk_(data)) return salida_({ ok: false, error: 'Clave incorrecta o sin configurar en el script' });
  if (!data.state) return salida_({ ok: false, error: 'No llegó el estado' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var folder = carpeta_(CARPETA_DATOS);
    var it = folder.getFilesByName(ARCHIVO_ESTADO);
    var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
    if (it.hasNext()) {
      var file = it.next();
      // copia de seguridad diaria (la primera del día guarda lo anterior)
      var nombreBk = 'backup_' + hoy + '.json';
      if (!folder.getFilesByName(nombreBk).hasNext()) {
        folder.createFile(nombreBk, file.getBlob().getDataAsString(), 'application/json');
      }
      file.setContent(data.state);
    } else {
      folder.createFile(ARCHIVO_ESTADO, data.state, 'application/json');
    }
    return salida_({ ok: true, savedAt: new Date().toISOString() });
  } finally {
    lock.releaseLock();
  }
}

function leerEstado_(data) {
  if (!claveOk_(data)) return salida_({ ok: false, error: 'Clave incorrecta o sin configurar en el script' });
  var it = carpeta_(CARPETA_DATOS).getFilesByName(ARCHIVO_ESTADO);
  if (!it.hasNext()) return salida_({ ok: true, state: null });
  return salida_({ ok: true, state: it.next().getBlob().getDataAsString() });
}

function guardarPdf_(data) {
  var filename = data.filename || ('Reporte_Cierre_' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd_HH-mm') + '.pdf');
  var folder = carpeta_(CARPETA_PDF);
  var blob = Utilities.newBlob(Utilities.base64Decode(data.base64), 'application/pdf', filename);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shareErr) {}
  return salida_({
    ok: true,
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    filename: filename,
    folderName: CARPETA_PDF,
    account: Session.getActiveUser().getEmail()
  });
}`;

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE).then(() => {
      setCopiedScript(true);
      showFeedback('✓ Código de Google Apps Script copiado al portapapeles.');
      setTimeout(() => setCopiedScript(false), 3000);
    });
  };

  const handleSyncHistoricalShiftToDrive = async (shift: any) => {
    const shiftKey = shift.id || `${shift.fecha}_${shift.turno}`;
    setSyncingTurnoId(shiftKey);
    try {
      const { file, filename } = generateShiftPDF({
        fecha: shift.fecha,
        turno: shift.turno,
        cerradoPor: shift.cerrado_por || 'Colaborador',
        horaCierre: shift.hora_cierre || '23:20',
        catalogo,
        sistemaStock: shift.sistemaStock || sistemaStock,
        conteoActual: shift.conteos || conteoActual,
        cierreCaja: shift.cierreCaja || cierreCaja,
        reclamos: {},
        pastTurnos,
      });

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const res = await fetch('/api/reportes/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          filename,
          fecha: shift.fecha,
          turno: shift.turno,
          cerradoPor: shift.cerrado_por || 'Colaborador',
        }),
      });

      const json = await res.json();
      if (res.ok && json.driveUrl) {
        shift.driveUrl = json.driveUrl;
        showFeedback(`✓ Turno ${shift.fecha} (${shift.turno}) sincronizado en Google Drive!`);
      } else {
        showFeedback(`✓ Turno guardado en servidor. Drive: ${json.driveUrl ? 'OK' : 'Configurá la URL de script arriba'}`, 'info');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'info');
    } finally {
      setSyncingTurnoId(null);
    }
  };

  // Helper for matching product names
  const cleanStr = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  // Fetch full details from Datalive
  const handleFetchDataliveCompleto = async (targetCod?: string) => {
    const cod = targetCod || selectedCodVentas;
    setIsLoadingDl(true);
    showFeedback('⏳ Sincronizando en vivo con Datalive...', 'info');

    try {
      const url = cod 
        ? `/api/datalive/caja/detalle?cod_ventas=${encodeURIComponent(cod)}` 
        : `/api/datalive/caja/detalle?turno=${encodeURIComponent(currentTurno)}&fecha=${encodeURIComponent(currentFecha)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.ok || !data.detalle) {
        showFeedback(`⚠️ ${data.error || 'No se pudieron descargar los datos de Datalive'}`, 'info');
        return;
      }

      const det = data.detalle;
      setDlCajaData(det);
      setSelectedCodVentas(det.codVentas);

      // Save cache in localStorage (both generic and date-specific)
      localStorage.setItem(`${STORAGE_KEY_DL_CAJA}_${currentFecha}_${currentTurno}`, JSON.stringify(det));
      localStorage.setItem(STORAGE_KEY_DL_CAJA, JSON.stringify(det));
      localStorage.setItem(`${STORAGE_KEY_DL_CAJA}_${det.codVentas}`, JSON.stringify(det));

      // Synchronize canales
      const canalesActualizados: VentaCanal[] = [
        { id: 'salon', nombre: 'Efectivo Mostrador', monto: det.efectivoMostrador || 0, tickets: 0 },
        { id: 'online_local', nombre: 'Online Local (Postnets)', monto: det.onlineLocal || 0, tickets: 0 },
        { id: 'pedidosya_online', nombre: 'PedidosYa Online', monto: det.pedidosYaOnline || 0, tickets: 0 },
        { id: 'pedidosya_efectivo', nombre: 'PedidosYa Efectivo', monto: det.pedidosYaEfectivo || 0, tickets: 0 },
      ];

      // Convert rubros into catalog articles with robust fuzzy normalization
      const nextArticulos = { ...ventasData.articulos };
      if (det.rubros) {
        Object.values(det.rubros).forEach((rObj: any) => {
          if (Array.isArray(rObj.items)) {
            rObj.items.forEach((it: any) => {
              let matchedPid: string | null = null;
              const itClean = cleanStr(it.nombre);

              for (const cat of catalogo) {
                for (const g of cat.grupos) {
                  for (const p of g.productos) {
                    const pClean = cleanStr(p.nombre);
                    if (
                      (it.codigo && p.codigo === it.codigo) ||
                      pClean === itClean ||
                      pClean.includes(itClean) ||
                      itClean.includes(pClean)
                    ) {
                      matchedPid = productId(cat.id, p);
                      break;
                    }
                  }
                  if (matchedPid) break;
                }
                if (matchedPid) break;
              }

              const key = matchedPid || `dl-${it.nombre}`;
              nextArticulos[key] = {
                codigo: it.codigo || '',
                nombre: it.nombre,
                categoria: it.subRubro || 'Datalive',
                cantidad: it.cantidad,
                totalMonto: it.monto,
              };
            });
          }
        });
      }

      const nextVentas: VentasTurnoData = {
        ...ventasData,
        totalFacturado: det.totalVentas || (det.totalEfectivo + det.totalOnline),
        totalTickets: det.totalComandas || ventasData.totalTickets,
        canales: canalesActualizados,
        articulos: nextArticulos,
      };

      setVentasData(nextVentas);
      localStorage.setItem(`${STORAGE_KEY_VENTAS}_${currentFecha}_${currentTurno}`, JSON.stringify(nextVentas));

      showFeedback(`✓ Caja #${det.codVentas} (${det.turnoTexto || 'Turno'}) sincronizada con éxito!`);
    } catch (e: any) {
      showFeedback(`Error: ${e.message || 'No se pudo conectar con Datalive'}`, 'info');
    } finally {
      setIsLoadingDl(false);
    }
  };

  // Load available boxes and auto-fetch on mount
  useEffect(() => {
    setIsLoadingDl(true);
    fetch('/api/datalive/cajas')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok && Array.isArray(data.cajas) && data.cajas.length > 0) {
          setCajasDisponibles(data.cajas);
          const abierta = data.cajas.find((c: any) => c.isAbierta);
          const target = abierta || data.cajas[0];
          setSelectedCodVentas(target.codVentas);
          handleFetchDataliveCompleto(target.codVentas);
        } else {
          setIsLoadingDl(false);
        }
      })
      .catch((e) => {
        console.log('Could not load cajas list:', e);
        setIsLoadingDl(false);
      });
  }, []);


  // Save to localStorage when changed
  const handleGuardarVentas = () => {
    try {
      localStorage.setItem(`${STORAGE_KEY_VENTAS}_${currentFecha}_${currentTurno}`, JSON.stringify(ventasData));
      showFeedback('✓ Ventas del turno guardadas correctamente.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCanal = (index: number, field: 'monto' | 'tickets', val: number) => {
    const nextCanales = [...ventasData.canales];
    nextCanales[index] = { ...nextCanales[index], [field]: val };
    const totalFact = nextCanales.reduce((acc, c) => acc + (c.monto || 0), 0);
    const totalTix = nextCanales.reduce((acc, c) => acc + (c.tickets || 0), 0);

    setVentasData({
      ...ventasData,
      canales: nextCanales,
      totalFacturado: totalFact,
      totalTickets: totalTix,
    });
  };

  // Parse pasted Datalive text
  const handleProcessPastedData = () => {
    if (!pasteRawText.trim()) return;

    const lines = pasteRawText.split('\n');
    let matchedCount = 0;
    const nextArticulos = { ...ventasData.articulos };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/[\t;,]+/).filter(Boolean);
      if (parts.length >= 2) {
        const nameOrCode = parts[0].trim();
        const qty = parseFloat(parts[1].replace(',', '.')) || 0;
        const monto = parts[2] ? parseFloat(parts[2].replace(/[$. ]/g, '').replace(',', '.')) || 0 : undefined;

        for (const cat of catalogo) {
          for (const g of cat.grupos) {
            for (const p of g.productos) {
              if (
                p.codigo === nameOrCode || 
                p.nombre.toLowerCase().includes(nameOrCode.toLowerCase()) ||
                nameOrCode.toLowerCase().includes(p.nombre.toLowerCase())
              ) {
                const pid = productId(cat.id, p);
                nextArticulos[pid] = {
                  codigo: p.codigo,
                  nombre: p.nombre,
                  categoria: cat.nombre,
                  cantidad: (nextArticulos[pid]?.cantidad || 0) + qty,
                  totalMonto: monto || (nextArticulos[pid]?.totalMonto || 0),
                };
                matchedCount++;
                break;
              }
            }
          }
        }
      }
    });

    setVentasData({
      ...ventasData,
      articulos: nextArticulos,
    });
    setPasteModalOpen(false);
    setPasteRawText('');
    showFeedback(`✓ Se procesaron ${matchedCount} artículos de Datalive.`);
  };

  // Factory order calculations
  const itemsFabrica = useMemo<PedidoFabricaItem[]>(() => {
    const list: PedidoFabricaItem[] = [];

    catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const entry = conteoActual[pid];
          const stockContado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          
          // Consumo registrado de ventas
          const ventaItem = ventasData.articulos[pid];
          const consumoTurno = ventaItem?.cantidad || 0;

          const defaultObj = cat.nombre.toLowerCase().includes('empanada') ? 24 : 8;
          const stockObjetivo = stockObjetivos[pid] ?? defaultObj;

          const sugerido = Math.max(0, stockObjetivo - stockContado);
          const confirmado = pedidoOverrides[pid] !== undefined ? pedidoOverrides[pid] : sugerido;

          list.push({
            id: pid,
            codigo: p.codigo,
            nombre: p.nombre,
            categoria: cat.nombre,
            stockContado,
            consumoTurno,
            stockObjetivo,
            sugeridoUnidades: sugerido,
            confirmadoUnidades: confirmado,
            bultosDocenas: Math.round((confirmado / 12) * 10) / 10,
          });
        });
      });
    });

    return list;
  }, [catalogo, conteoActual, ventasData, stockObjetivos, pedidoOverrides]);

  const handleUpdatePedidoQty = (id: string, delta: number) => {
    const curr = pedidoOverrides[id] !== undefined ? pedidoOverrides[id] : (itemsFabrica.find(i => i.id === id)?.sugeridoUnidades || 0);
    const nextVal = Math.max(0, curr + delta);
    setPedidoOverrides(prev => ({ ...prev, [id]: nextVal }));
  };

  // Cruce Financiero
  const cruceCaja = useMemo(() => {
    const postnets = (cierreCaja.postnet_amarillo || 0) + (cierreCaja.postnet_rosa || 0) + (cierreCaja.postnet_blanco || 0);
    const efectivoReal = cierreCaja.efectivo_real || 0;
    const rendicionTotal = postnets + efectivoReal;
    const facturadoDatalive = ventasData.totalFacturado;
    const difRendicion = rendicionTotal - facturadoDatalive;

    return {
      rendicionTotal,
      facturadoDatalive,
      difRendicion,
      postnets,
      efectivoReal,
    };
  }, [cierreCaja, ventasData]);

  // Export PDF Gerencial
  const handleDescargarPdfGerencial = () => {
    const docData = {
      fecha: currentFecha,
      turno: currentTurno,
      generadoPor: currentEmpleado?.nombre || 'Administración',
      horaGeneracion: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      ventas: ventasData,
      pedidoFabrica: itemsFabrica.filter(i => i.confirmadoUnidades > 0 || i.consumoTurno > 0),
      cierreCaja,
    };

    const { blob, filename } = generatePdfGerencial(docData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showFeedback('✓ PDF Gerencial descargado.');
  };

  // WhatsApp Pedido a Fábrica
  const handleEnviarPedidoWhatsApp = () => {
    const articulosConPedido = itemsFabrica.filter(i => i.confirmadoUnidades > 0);
    if (articulosConPedido.length === 0) {
      alert('No hay productos con cantidades mayores a 0 en el pedido a fábrica.');
      return;
    }

    let texto = `*PEDIDO A FÁBRICA — CENTRAL ESCOBAR*\n`;
    texto += `📅 *Fecha:* ${currentFecha} | *Turno:* ${currentTurno}\n`;
    texto += `👤 *Responsable:* ${currentEmpleado?.nombre || 'Carlos'}\n`;
    texto += `------------------------------------\n`;
    texto += `📦 *DETALLE DE REPOSICIÓN SOLICITADA:*\n\n`;

    let totalDocenas = 0;
    let totalUnidades = 0;

    articulosConPedido.forEach((item) => {
      const doc = (item.confirmadoUnidades / 12).toFixed(1);
      texto += `• *${item.nombre}*: ${item.confirmadoUnidades}u (${doc} doc.) [Stock: ${item.stockContado}]\n`;
      totalDocenas += item.confirmadoUnidades / 12;
      totalUnidades += item.confirmadoUnidades;
    });

    texto += `\n------------------------------------\n`;
    texto += `📊 *TOTAL A DESPACHAR:* ${totalUnidades} unidades (${totalDocenas.toFixed(1)} docenas)\n`;
    texto += `✓ *Generado automáticamente tras cierre de turno*`;

    abrirWhatsApp(texto);
  };

  // If user is not authorized or wants PIN lock
  if (!isAuthorized && !unlockedByPin) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-3xl shadow-xl border border-stone-200 text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-stone-800 tracking-tight mb-1">
          Módulo Gerencial Protegido
        </h2>
        <p className="text-xs text-stone-500 mb-6">
          Este módulo contiene información confidencial de ventas, caja, egresos y pedidos a fábrica. Solo accesible por los dueños y administradores.
        </p>
        <div className="space-y-3">
          <input
            type="password"
            maxLength={6}
            value={pinUnlock}
            onChange={(e) => setPinUnlock(e.target.value)}
            placeholder="Ingresá PIN de Administrador"
            className="w-full p-3 text-center text-lg font-black tracking-widest border border-stone-300 rounded-xl focus:border-[#123D26] focus:ring-1 focus:ring-[#123D26]"
          />
          <button
            onClick={() => {
              if (['1234', '170226', '4321'].includes(pinUnlock)) {
                setUnlockedByPin(true);
              } else {
                alert('PIN incorrecto.');
                setPinUnlock('');
              }
            }}
            className="w-full py-3 bg-[#123D26] hover:bg-[#1B5E38] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
          >
            Desbloquear Acceso
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD CALCULATIONS (Caja Datalive & Ventas)
  // ==========================================
  // 1. Dinero inicial
  const dineroInicio = dlCajaData?.dineroInicio || 0;

  // 2. Efectivo Total (Mostrador + PedidosYa Efectivo)
  const efMostrador = dlCajaData?.efectivoMostrador ?? (ventasData.canales.find(c => c.id === 'salon')?.monto ?? 0);
  const peyaEfectivo = dlCajaData?.pedidosYaEfectivo ?? (ventasData.canales.find(c => c.id === 'pedidosya_efectivo')?.monto ?? 0);
  const totalEfectivoIngresado = efMostrador + peyaEfectivo;

  // 3. Cobros Digitales (Online Local Postnets + PedidosYa Online)
  const onlineLocalPostnets = dlCajaData?.onlineLocal ?? (ventasData.canales.find(c => c.id === 'online_local')?.monto ?? 0);
  const peyaOnline = dlCajaData?.pedidosYaOnline ?? (ventasData.canales.find(c => c.id === 'pedidosya_online')?.monto ?? 0);
  const totalCobrosDigitales = onlineLocalPostnets + peyaOnline;

  // 4. Salidas y Egresos de Caja
  const totalEgresosRetiros = Math.abs(dlCajaData?.totalEgresos || 0);
  const totalSueldosVales = Math.abs(dlCajaData?.totalSueldos || 0);
  const totalGastosOperativos = Math.abs(dlCajaData?.totalGastos || 0);
  const totalSalidasCaja = totalEgresosRetiros + totalSueldosVales + totalGastosOperativos;

  // 5. Total Teórico en Caja (Efectivo que debe haber en el cajón)
  const totalTeoricoCaja = dineroInicio + totalEfectivoIngresado - totalSalidasCaja;

  // 6. Facturación y Comandas
  const totalFacturadoReal = dlCajaData?.totalVentas || ventasData.totalFacturado || (totalEfectivoIngresado + totalCobrosDigitales);
  const totalComandasReal = dlCajaData?.totalComandas || ventasData.totalTickets || 0;
  const ticketPromedioReal = totalComandasReal > 0 ? totalFacturadoReal / totalComandasReal : 0;

  // 7. Proporciones Locales Mostrador
  const totalVentasLocales = efMostrador + onlineLocalPostnets;
  const pctLocalEfectivo = totalVentasLocales > 0 ? ((efMostrador / totalVentasLocales) * 100).toFixed(1) : '0';
  const pctLocalOnline = totalVentasLocales > 0 ? ((onlineLocalPostnets / totalVentasLocales) * 100).toFixed(1) : '0';

  // 8. Proporciones PedidosYa
  const peyaTotal = peyaOnline + peyaEfectivo;
  const pctPeyaOnline = peyaTotal > 0 ? ((peyaOnline / peyaTotal) * 100).toFixed(1) : '0';
  const pctPeyaEfectivo = peyaTotal > 0 ? ((peyaEfectivo / peyaTotal) * 100).toFixed(1) : '0';

  // ==========================================
  // ARQUEO & AUDITORÍA DE POSTNETS (Rango de fechas y terminales)
  // ==========================================
  // Filtro de rango de fechas personalizado: por defecto últimos 7 días
  const [postnetFechaDesde, setPostnetFechaDesde] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [postnetFechaHasta, setPostnetFechaHasta] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [postnetFiltroTurno, setPostnetFiltroTurno] = useState<'todos' | 'Mañana' | 'Tarde'>('todos');

  // Ajustes/modificaciones manuales persistidas
  const [postnetsOverrides, setPostnetsOverrides] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POSTNETS_OVERRIDES);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [editPostnetModal, setEditPostnetModal] = useState<{
    isOpen: boolean;
    id: string;
    fecha: string;
    turno: 'Mañana' | 'Tarde';
    cajero: string;
    amarillo: number;
    rosa: number;
    blanco: number;
    onlineLocalSist: number;
    observaciones: string;
  } | null>(null);

  // Lista combinada de todos los turnos con arqueo de postnets
  const listaCierresPostnets = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Agregar turnos de pastTurnos
    (pastTurnos || []).forEach((t) => {
      const id = `${t.fecha}_${t.turno}`;
      const c = t.cierreCaja;
      map.set(id, {
        id,
        fecha: t.fecha,
        turno: t.turno,
        cajero: t.cerrado_por || c?.empleado || 'Cajero',
        postnet_amarillo: c?.postnet_amarillo || 0,
        postnet_rosa: c?.postnet_rosa || 0,
        postnet_blanco: c?.postnet_blanco || 0,
        online_local_sist: c?.online_local_sist || 0,
        observaciones: c?.observaciones || '',
      });
    });

    // 2. Agregar cierre activo del turno actual si existe
    if (cierreCaja && cierreCaja.existe) {
      const id = `${cierreCaja.fecha || currentFecha}_${cierreCaja.turno || currentTurno}`;
      map.set(id, {
        id,
        fecha: cierreCaja.fecha || currentFecha,
        turno: cierreCaja.turno || currentTurno,
        cajero: cierreCaja.empleado || currentEmpleado?.nombre || 'Cajero',
        postnet_amarillo: cierreCaja.postnet_amarillo || 0,
        postnet_rosa: cierreCaja.postnet_rosa || 0,
        postnet_blanco: cierreCaja.postnet_blanco || 0,
        online_local_sist: cierreCaja.online_local_sist || (dlCajaData?.onlineLocal || 0),
        observaciones: cierreCaja.observaciones || 'Turno actual',
      });
    }

    // 3. Si se está inspeccionando una caja de Datalive (ej: 740836) y tiene Online Local
    if (dlCajaData && dlCajaData.onlineLocal > 0) {
      const fKey = currentFecha;
      const tKey = (dlCajaData.turnoTexto || currentTurno) as 'Mañana' | 'Tarde';
      const id = `${fKey}_${tKey}`;
      if (!map.has(id)) {
        map.set(id, {
          id,
          fecha: fKey,
          turno: tKey,
          cajero: dlCajaData.cajero || 'Cajero Datalive',
          postnet_amarillo: 0,
          postnet_rosa: 0,
          postnet_blanco: 0,
          online_local_sist: dlCajaData.onlineLocal,
          observaciones: `Caja #${dlCajaData.codVentas} Datalive`,
        });
      } else {
        const item = map.get(id);
        if (!item.online_local_sist) {
          item.online_local_sist = dlCajaData.onlineLocal;
        }
      }
    }

    // 4. Aplicar cualquier ajuste manual
    Object.keys(postnetsOverrides).forEach((id) => {
      map.set(id, {
        ...(map.get(id) || {}),
        ...postnetsOverrides[id],
        id,
      });
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.turno === 'Tarde' ? -1 : 1;
    });

    return list;
  }, [pastTurnos, cierreCaja, currentFecha, currentTurno, currentEmpleado, dlCajaData, postnetsOverrides]);

  // Turnos filtrados por rango de fechas y turno
  const postnetsFiltrados = useMemo(() => {
    return listaCierresPostnets.filter((r) => {
      if (postnetFechaDesde && r.fecha < postnetFechaDesde) return false;
      if (postnetFechaHasta && r.fecha > postnetFechaHasta) return false;
      if (postnetFiltroTurno !== 'todos' && r.turno !== postnetFiltroTurno) return false;
      return true;
    });
  }, [listaCierresPostnets, postnetFechaDesde, postnetFechaHasta, postnetFiltroTurno]);

  // Totales acumulados para el rango
  const postnetTotales = useMemo(() => {
    let totAmarillo = 0;
    let totRosa = 0;
    let totBlanco = 0;
    let totDataliveOnline = 0;

    postnetsFiltrados.forEach((r) => {
      totAmarillo += Number(r.postnet_amarillo) || 0;
      totRosa += Number(r.postnet_rosa) || 0;
      totBlanco += Number(r.postnet_blanco) || 0;
      totDataliveOnline += Number(r.online_local_sist) || 0;
    });

    const totTerminales = totAmarillo + totRosa + totBlanco;
    const difGlobal = totTerminales - totDataliveOnline;

    const pctAmarillo = totTerminales > 0 ? ((totAmarillo / totTerminales) * 100).toFixed(1) : '0';
    const pctRosa = totTerminales > 0 ? ((totRosa / totTerminales) * 100).toFixed(1) : '0';
    const pctBlanco = totTerminales > 0 ? ((totBlanco / totTerminales) * 100).toFixed(1) : '0';

    return {
      totAmarillo,
      totRosa,
      totBlanco,
      totTerminales,
      totDataliveOnline,
      difGlobal,
      pctAmarillo,
      pctRosa,
      pctBlanco,
      countTurnos: postnetsFiltrados.length,
    };
  }, [postnetsFiltrados]);

  // Copiar resumen al portapapeles
  const handleCopiarResumenPostnets = () => {
    let txt = `💳 *ARQUEO & CONCILIACIÓN DE POSTNETS — CENTRAL ESCOBAR*\n`;
    txt += `📅 *Rango:* ${postnetFechaDesde || 'Inicio'} al ${postnetFechaHasta || 'Hoy'} (${postnetFiltroTurno === 'todos' ? 'Ambos turnos' : 'Turno ' + postnetFiltroTurno})\n`;
    txt += `🔢 *Turnos auditados:* ${postnetTotales.countTurnos}\n`;
    txt += `------------------------------------\n`;
    txt += `💛 *Postnet Amarillo:* ${fmtMoney(postnetTotales.totAmarillo)} (${postnetTotales.pctAmarillo}%)\n`;
    txt += `🩷 *Postnet Rosa:* ${fmtMoney(postnetTotales.totRosa)} (${postnetTotales.pctRosa}%)\n`;
    txt += `🤍 *Postnet Blanco:* ${fmtMoney(postnetTotales.totBlanco)} (${postnetTotales.pctBlanco}%)\n`;
    txt += `------------------------------------\n`;
    txt += `💳 *TOTAL TERMINALES FÍSICAS:* ${fmtMoney(postnetTotales.totTerminales)}\n`;
    txt += `🖥️ *ONLINE LOCAL (DATALIVE):* ${fmtMoney(postnetTotales.totDataliveOnline)}\n`;
    txt += `⚖️ *DIFERENCIA:* ${fmtSignedMoney(postnetTotales.difGlobal)} ${Math.abs(postnetTotales.difGlobal) === 0 ? '✅ (Cuadrado)' : '⚠️'}\n`;
    txt += `------------------------------------\n`;
    txt += `Central Escobar · Sistema de Control`;

    navigator.clipboard.writeText(txt).then(() => {
      showFeedback('✓ Resumen de Postnets copiado al portapapeles.');
    }).catch(() => {
      showFeedback('No se pudo copiar automáticamente.');
    });
  };

  // Exportar Detalle Turno por Turno a Excel (.xlsx)
  const handleExportarExcelPostnets = () => {
    if (!postnetsFiltrados || postnetsFiltrados.length === 0) {
      showFeedback('No hay turnos en el rango seleccionado para exportar.');
      return;
    }

    try {
      // 1. Filas individuales de cada turno
      const filas = postnetsFiltrados.map((r) => {
        const suma = (r.postnet_amarillo || 0) + (r.postnet_rosa || 0) + (r.postnet_blanco || 0);
        const dlOnline = r.online_local_sist || 0;
        const dif = suma - dlOnline;
        const estado = Math.abs(dif) < 1 ? 'Cuadrado' : dif > 0 ? 'Sobrante (+)' : 'Faltante (-)';

        return {
          'Fecha': r.fecha,
          'Turno': r.turno,
          'Cajero / Responsable': r.cajero,
          'Postnet Amarillo ($)': r.postnet_amarillo || 0,
          'Postnet Rosa ($)': r.postnet_rosa || 0,
          'Postnet Blanco ($)': r.postnet_blanco || 0,
          'Total 3 Terminales ($)': suma,
          'Online Local Datalive ($)': dlOnline,
          'Diferencia ($)': dif,
          'Estado Diferencia': estado,
          'Observaciones / Lote': r.observaciones || '',
        };
      });

      // 2. Fila separadora y Fila de Totales
      filas.push({
        'Fecha': '---',
        'Turno': '---',
        'Cajero / Responsable': '-----------------------',
        'Postnet Amarillo ($)': 0,
        'Postnet Rosa ($)': 0,
        'Postnet Blanco ($)': 0,
        'Total 3 Terminales ($)': 0,
        'Online Local Datalive ($)': 0,
        'Diferencia ($)': 0,
        'Estado Diferencia': '---',
        'Observaciones / Lote': '---',
      });

      filas.push({
        'Fecha': 'TOTALES',
        'Turno': `${postnetTotales.countTurnos} turnos`,
        'Cajero / Responsable': 'CONSOLIDADO PERÍODO',
        'Postnet Amarillo ($)': postnetTotales.totAmarillo,
        'Postnet Rosa ($)': postnetTotales.totRosa,
        'Postnet Blanco ($)': postnetTotales.totBlanco,
        'Total 3 Terminales ($)': postnetTotales.totTerminales,
        'Online Local Datalive ($)': postnetTotales.totDataliveOnline,
        'Diferencia ($)': postnetTotales.difGlobal,
        'Estado Diferencia': Math.abs(postnetTotales.difGlobal) < 1 ? 'CUADRADO' : postnetTotales.difGlobal > 0 ? 'SOBRANTE' : 'FALTANTE',
        'Observaciones / Lote': `Amarillo: ${postnetTotales.pctAmarillo}% | Rosa: ${postnetTotales.pctRosa}% | Blanco: ${postnetTotales.pctBlanco}%`,
      });

      // 3. Crear hoja y libro
      const ws = XLSX.utils.json_to_sheet(filas);

      // Anchos de columnas óptimos para Excel
      ws['!cols'] = [
        { wch: 13 }, // Fecha
        { wch: 11 }, // Turno
        { wch: 24 }, // Cajero
        { wch: 20 }, // Amarillo
        { wch: 18 }, // Rosa
        { wch: 18 }, // Blanco
        { wch: 22 }, // Total Postnets
        { wch: 22 }, // Online Datalive
        { wch: 16 }, // Diferencia
        { wch: 18 }, // Estado Diferencia
        { wch: 40 }, // Observaciones / Lote
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Arqueo Postnets');

      const nombreArchivo = `Arqueo_Postnets_Central_Escobar_${postnetFechaDesde || 'inicio'}_al_${postnetFechaHasta || 'hoy'}.xlsx`;
      XLSX.writeFile(wb, nombreArchivo);

      showFeedback(`✓ Excel descargado: ${nombreArchivo}`);
    } catch (err: any) {
      console.error('Error generando Excel:', err);
      showFeedback('Error al generar el archivo Excel.');
    }
  };

  const handleGuardarOverridePostnet = (record: any) => {
    const next = {
      ...postnetsOverrides,
      [record.id]: record,
    };
    setPostnetsOverrides(next);
    localStorage.setItem(STORAGE_KEY_POSTNETS_OVERRIDES, JSON.stringify(next));
    setEditPostnetModal(null);
    showFeedback('✓ Cierre de Postnet actualizado correctamente.');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#123D26] text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-bold border border-emerald-400/40 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Top Banner with Datalive Caja Selector */}
      <div className="bg-gradient-to-r from-[#123D26] via-[#1B5E38] to-[#123D26] rounded-3xl p-5 text-white shadow-md border border-emerald-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-black tracking-widest uppercase bg-amber-400 text-stone-950 px-2 py-0.5 rounded-md">
              ACCESO EXCLUSIVO DUEÑOS / GERENCIA
            </span>
          </div>
          <h1 className="text-xl font-black tracking-tight mt-1">
            Auditoría de Caja &amp; Planificación de Fábrica
          </h1>
          <p className="text-xs text-emerald-200/90 mt-0.5">
            Sede Escobar · Integración directa con Datalive (Caja, Egresos, Sueldos, PeYa y Artículos)
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {cajasDisponibles.length > 0 && (
            <select
              value={selectedCodVentas}
              onChange={(e) => {
                setSelectedCodVentas(e.target.value);
                handleFetchDataliveCompleto(e.target.value);
              }}
              className="bg-emerald-950/80 text-emerald-100 text-xs font-bold py-2 px-3 rounded-xl border border-emerald-600/60 focus:outline-none"
            >
              {cajasDisponibles.map((c) => (
                <option key={c.codVentas} value={c.codVentas} className="bg-stone-900 text-white">
                  Caja #{c.codVentas} · {c.fecha} ({c.turno}) {c.isAbierta ? '🟢 ABIERTA' : '🔴 CERRADA'}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => handleFetchDataliveCompleto()}
            disabled={isLoadingDl}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Importar caja completa, egresos, gastos, sueldos y ventas por producto directamente desde Datalive"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDl ? 'animate-spin' : ''}`} />
            <span>{isLoadingDl ? 'Cargando...' : '⚡ Sincronizar Datalive'}</span>
          </button>

          <button
            onClick={handleDescargarPdfGerencial}
            className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            title="Descargar PDF Gerencial Confidencial"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Sincronización State Bar */}
      {isLoadingDl && (
        <div className="bg-emerald-50 border border-emerald-300 text-[#123D26] px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-bold animate-pulse">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#1B5E38]" />
            <span>Sincronizando automáticamente con Datalive en tiempo real...</span>
          </div>
          <span className="text-[11px] text-emerald-800 font-semibold hidden sm:inline">
            Caja, Egresos, Retiros, Sueldos y Artículos
          </span>
        </div>
      )}

      {!isLoadingDl && dlCajaData && (
        <div className="bg-white px-4 py-2.5 rounded-2xl border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-extrabold text-stone-900">
              Datalive Sincronizado: Caja #{dlCajaData.codVentas}
            </span>
            <span className="text-stone-400">·</span>
            <span className="font-semibold text-stone-700">
              {dlCajaData.fechaTexto || 'Hoy'} ({dlCajaData.turnoTexto || 'Turno'})
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                dlCajaData.isAbierta
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-stone-100 text-stone-600 border border-stone-200'
              }`}
            >
              {dlCajaData.isAbierta ? '🟢 En curso (Abierta)' : '🔴 Cerrada'}
            </span>
          </div>
          <div className="text-[11px] text-stone-500 flex items-center gap-2">
            <span>Sucursal: <strong>{dlCajaData.sucursal || 'Central Escobar'}</strong></span>
            {dlCajaData.cajero && (
              <>
                <span>·</span>
                <span>Cajero: <strong>{dlCajaData.cajero}</strong></span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sub tabs selector (6 Módulos Gerenciales) */}
      <div className="bg-white p-1 rounded-2xl border border-stone-200 grid grid-cols-2 sm:grid-cols-6 gap-1 shadow-2xs">
        <button
          onClick={() => setActiveSubTab('ventas')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'ventas'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <PieChart className="w-3.5 h-3.5" />
          <span>1. Dashboard</span>
        </button>

        <button
          onClick={() => setActiveSubTab('caja_auditoria')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'caja_auditoria'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>2. Auditoría</span>
        </button>

        <button
          onClick={() => setActiveSubTab('arqueo_postnets')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'arqueo_postnets'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>3. Postnets</span>
        </button>

        <button
          onClick={() => setActiveSubTab('fabrica')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'fabrica'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>4. Fábrica</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pdf')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'pdf'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>5. Cruce &amp; PDF</span>
        </button>

        <button
          onClick={() => setActiveSubTab('google_drive')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'google_drive'
              ? 'bg-[#123D26] text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>6. Google Drive</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* VISTA 1: DASHBOARD JERÁRQUICO DE VENTAS & ARTÍCULOS */}
      {/* ======================================================== */}
      {activeSubTab === 'ventas' && (
        <div className="space-y-4">
          
          {/* Cuadro Horizontal Alargado: Total Facturado, Comandas Confirmadas y Ticket Promedio (Resaltado con color) */}
          <div className="bg-gradient-to-r from-emerald-100/95 via-emerald-50 to-teal-50/85 rounded-3xl p-4 sm:p-5 border-2 border-emerald-300/90 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 w-full md:w-auto">
              <div className="w-12 h-12 rounded-2xl bg-[#123D26] text-white flex items-center justify-center shrink-0 shadow-sm border border-emerald-600/50">
                <DollarSign className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
                    Total Facturado del Turno
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-200/90 text-emerald-950 px-2 py-0.5 rounded-md border border-emerald-300">
                    Datalive Oficial
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono-num text-[#123D26]">
                    {fmtMoney(totalFacturadoReal)}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-950 font-medium">
                  Efectivo: <strong>{fmtMoney(totalEfectivoIngresado)}</strong> + Cobros Digitales: <strong>{fmtMoney(totalCobrosDigitales)}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-around w-full md:w-auto gap-4 sm:gap-6 border-t md:border-t-0 md:border-l border-emerald-200/80 pt-3 md:pt-0 md:pl-6 text-center md:text-left">
              <div>
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
                  Comandas Confirmadas
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono-num text-stone-900 mt-0.5 block">
                  {totalComandasReal} <span className="text-xs font-normal text-stone-500">tickets</span>
                </span>
              </div>

              <div>
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
                  Ticket Promedio
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono-num text-stone-900 mt-0.5 block">
                  {fmtMoney(Math.round(ticketPromedioReal))}
                </span>
              </div>

              <div className="hidden lg:block text-right">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
                  Auditoría Caja
                </span>
                <span className="text-xs font-black text-stone-800 mt-0.5 block">
                  Caja #{dlCajaData?.codVentas || selectedCodVentas}
                </span>
                <span className="text-[11px] text-stone-600 font-semibold">
                  {dlCajaData?.turnoTexto || currentTurno} · {dlCajaData?.fechaTexto || currentFecha}
                </span>
              </div>
            </div>
          </div>

          {/* Top 4 Big Executive KPI Cards (2x2 en celular, 4 en desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            
            {/* Cuadro 1: EFECTIVO TOTAL */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-emerald-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1 truncate">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Efectivo Total
                  </span>
                  <span className="hidden sm:inline-block text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md shrink-0">
                    Ingreso Físico
                  </span>
                </div>
                <span className="text-lg sm:text-2xl font-black font-mono-num text-emerald-700 block truncate">
                  {fmtMoney(totalEfectivoIngresado)}
                </span>
              </div>

              <div className="mt-2.5 sm:mt-3 pt-2 border-t border-stone-100 bg-emerald-50/50 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-b-2xl sm:rounded-b-3xl space-y-1 text-[11px] sm:text-xs">
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">Mostrador:</span>
                  <span className="font-mono-num font-bold text-stone-900 shrink-0 whitespace-nowrap">{fmtMoney(efMostrador)}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">PeYa Efvo:</span>
                  <span className="font-mono-num font-bold text-emerald-800 shrink-0 whitespace-nowrap">{fmtMoney(peyaEfectivo)}</span>
                </div>
              </div>
            </div>

            {/* Cuadro 2: COBROS DIGITALES */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-blue-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-800 flex items-center gap-1 truncate">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    Cobros Digitales
                  </span>
                  <span className="hidden sm:inline-block text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-md shrink-0">
                    Postnets + App
                  </span>
                </div>
                <span className="text-lg sm:text-2xl font-black font-mono-num text-blue-700 block truncate">
                  {fmtMoney(totalCobrosDigitales)}
                </span>
              </div>

              <div className="mt-2.5 sm:mt-3 pt-2 border-t border-stone-100 bg-blue-50/50 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-b-2xl sm:rounded-b-3xl space-y-1 text-[11px] sm:text-xs">
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">Postnets (3):</span>
                  <span className="font-mono-num font-bold text-blue-900 shrink-0 whitespace-nowrap">{fmtMoney(onlineLocalPostnets)}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">PeYa Online:</span>
                  <span className="font-mono-num font-bold text-rose-800 shrink-0 whitespace-nowrap">{fmtMoney(peyaOnline)}</span>
                </div>
              </div>
            </div>

            {/* Cuadro 3: EGRESOS & SALIDAS DE CAJA */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-rose-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1 truncate">
                    <ArrowDownRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    Total Egresos
                  </span>
                  <span className="hidden sm:inline-block text-[9px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-md shrink-0">
                    Salidas
                  </span>
                </div>
                <span className="text-lg sm:text-2xl font-black font-mono-num text-rose-700 block truncate">
                  -{fmtMoney(totalSalidasCaja)}
                </span>
              </div>

              <div className="mt-2.5 sm:mt-3 pt-2 border-t border-stone-100 bg-rose-50/50 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-b-2xl sm:rounded-b-3xl space-y-1 text-[11px] sm:text-xs">
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">Egresos:</span>
                  <span className="font-mono-num font-bold text-rose-900 shrink-0 whitespace-nowrap">{fmtMoney(totalEgresosRetiros)}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">Sueldos:</span>
                  <span className="font-mono-num font-bold text-amber-900 shrink-0 whitespace-nowrap">{fmtMoney(totalSueldosVales)}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">Gastos:</span>
                  <span className="font-mono-num font-bold text-stone-700 shrink-0 whitespace-nowrap">{fmtMoney(totalGastosOperativos)}</span>
                </div>
              </div>
            </div>

            {/* Cuadro 4: TOTAL TEÓRICO EN CAJA */}
            <div className="bg-[#123D26]/5 p-3 sm:p-4 rounded-2xl sm:rounded-3xl border-2 border-[#123D26]/30 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#123D26] flex items-center gap-1 truncate">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1B5E38] shrink-0" />
                    Teórico en Caja
                  </span>
                  <span className="hidden sm:inline-block text-[9px] font-black bg-[#123D26] text-white px-1.5 py-0.2 rounded-md shrink-0">
                    En Cajón
                  </span>
                </div>
                <span className="text-lg sm:text-2xl font-black font-mono-num text-[#123D26] block truncate">
                  {fmtMoney(totalTeoricoCaja)}
                </span>
              </div>

              <div className="mt-2.5 sm:mt-3 pt-2 border-t border-[#123D26]/10 bg-white/70 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-b-2xl sm:rounded-b-3xl space-y-0.5 text-[11px] sm:text-xs">
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] truncate">Fondo Ini:</span>
                  <span className="font-mono-num font-bold text-stone-800 shrink-0 whitespace-nowrap">{fmtMoney(dineroInicio)}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 gap-1">
                  <span className="text-[10px] sm:text-[11px] truncate">Neto Turno:</span>
                  <span className="font-mono-num font-bold text-[#123D26] shrink-0 whitespace-nowrap">
                    {fmtSignedMoney(totalEfectivoIngresado - totalSalidasCaja)}
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-stone-400 block pt-0.5 truncate hidden sm:block">
                  Dinero físico en cajón
                </span>
              </div>
            </div>

          </div>

          {/* Cards Jerárquicas por Concepto de Canal & Resumen de PedidosYa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Conceptos de Venta del Local (Sin delivery propio) */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#1B5E38]" />
                    <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide">
                      Ventas Locales (Mostrador)
                    </h3>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-[#123D26] px-2 py-0.5 rounded-full font-bold">
                    Operación Local
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-stone-800 block">Efectivo Mostrador</span>
                      <span className="text-[10px] text-stone-400 block leading-tight">Cobrado en mano por el cajero</span>
                    </div>
                    <span className="font-mono-num font-black text-sm text-stone-900 shrink-0 whitespace-nowrap">
                      {fmtMoney(efMostrador)}
                    </span>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-stone-800 block">Online Local (Postnets)</span>
                      <span className="text-[10px] text-stone-500 block leading-tight">Tarjetas y QR · 3 terminales físicas</span>
                    </div>
                    <span className="font-mono-num font-black text-sm text-blue-800 shrink-0 whitespace-nowrap">
                      {fmtMoney(onlineLocalPostnets)}
                    </span>
                  </div>

                  {/* Proporción Efectivo Mostrador vs Postnets */}
                  <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-xs text-[#123D26] space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>Proporción Efectivo Mostrador:</span>
                      <span>{pctLocalEfectivo}%</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span>Proporción Online Local (Postnets):</span>
                      <span>{pctLocalOnline}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-dashed border-stone-200 flex items-center justify-between text-xs font-bold">
                <span className="text-stone-500">Subtotal Operación Local:</span>
                <span className="text-[#123D26] font-mono-num text-base font-black shrink-0 whitespace-nowrap">
                  {fmtMoney(totalVentasLocales)}
                </span>
              </div>
            </div>

            {/* Resumen Especial PedidosYa (Online vs Efectivo) */}
            <div className="bg-gradient-to-br from-rose-50 via-red-50/50 to-amber-50/40 rounded-3xl p-5 border border-rose-200 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-rose-200/60">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-rose-600" />
                    <h3 className="text-sm font-black text-rose-950 uppercase tracking-wide">
                      Resumen PedidosYa (App)
                    </h3>
                  </div>
                  <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full font-bold">
                    Canal Apps
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 bg-white/90 rounded-2xl border border-rose-200/80 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-rose-950 block">PedidosYa Online</span>
                      <span className="text-[10px] text-rose-700/80 block leading-tight">Pagado con tarjeta en app (Liquida PeYa)</span>
                    </div>
                    <span className="font-mono-num font-black text-sm text-rose-950 shrink-0 whitespace-nowrap">
                      {fmtMoney(peyaOnline)}
                    </span>
                  </div>

                  <div className="p-3 bg-white/90 rounded-2xl border border-rose-200/80 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-rose-950 block">PedidosYa Efectivo</span>
                      <span className="text-[10px] text-rose-700/80 block leading-tight">Rendido en mano por el cadete de PeYa</span>
                    </div>
                    <span className="font-mono-num font-black text-sm text-emerald-800 shrink-0 whitespace-nowrap">
                      {fmtMoney(peyaEfectivo)}
                    </span>
                  </div>

                  <div className="p-3 bg-rose-100/60 rounded-2xl border border-rose-300 text-xs text-rose-900 space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>Proporción Online PeYa:</span>
                      <span>{pctPeyaOnline}%</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span>Proporción Efectivo PeYa:</span>
                      <span>{pctPeyaEfectivo}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-dashed border-rose-300 flex items-center justify-between text-xs font-bold">
                <span className="text-rose-900">Total Facturado PeYa:</span>
                <span className="text-rose-950 font-mono-num text-base font-black">
                  {fmtMoney(peyaTotal)}
                </span>
              </div>
            </div>

          </div>

          {/* ======================================================== */}
          {/* ARTÍCULOS VENDIDOS CON % POR RUBRO (EMPANADAS, PIZZAS, ETC) */}
          {/* ======================================================== */}
          <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#1B5E38]" />
                  <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide">
                    Artículos Vendidos por Volumen y % del Rubro
                  </h3>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Desglose exacto de unidades vendidas y el porcentaje que representa cada sabor dentro de su rubro
                </p>
              </div>

              {/* Rubro filter buttons */}
              {dlCajaData?.rubros && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedRubroFiltro('todos')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                      selectedRubroFiltro === 'todos'
                        ? 'bg-[#123D26] text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    Todos
                  </button>
                  {Object.keys(dlCajaData.rubros).map((rName) => (
                    <button
                      key={rName}
                      onClick={() => setSelectedRubroFiltro(rName)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        selectedRubroFiltro === rName
                          ? 'bg-[#123D26] text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {rName} ({dlCajaData.rubros[rName].totalCant} u.)
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Display Rubros Cards */}
            {dlCajaData?.rubros && Object.keys(dlCajaData.rubros).length > 0 ? (
              <div className="space-y-5">
                {Object.entries(dlCajaData.rubros as Record<string, any>)
                  .filter(([rName]) => selectedRubroFiltro === 'todos' || selectedRubroFiltro === rName)
                  .map(([rName, rData]) => (
                    <div key={rName} className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs">
                      {/* Rubro Header */}
                      <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                          <span className="font-extrabold text-xs uppercase tracking-wide text-stone-800">
                            {rName}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-stone-600 flex items-center gap-2 font-mono-num">
                          <span><strong>{rData.totalCant}</strong> unidades vendidas</span>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div className="divide-y divide-stone-100 max-h-[360px] overflow-y-auto">
                        {rData.items.map((it: any, idx: number) => {
                          const pct = parseFloat(it.pctRubro) || 0;
                          return (
                            <div key={idx} className="p-3 flex items-center justify-between hover:bg-stone-50/70 transition-colors gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-stone-900 truncate">
                                    {it.nombre}
                                  </span>
                                  {it.subRubro && (
                                    <span className="text-[10px] text-stone-400 font-medium truncate hidden sm:inline">
                                      ({it.subRubro})
                                    </span>
                                  )}
                                </div>

                                {/* Progress bar visualization of percentage */}
                                <div className="w-full bg-stone-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                                  <div
                                    className="bg-emerald-600 h-1.5 rounded-full"
                                    style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                                  ></div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 text-right font-mono-num">
                                <div>
                                  <span className="text-xs font-black text-stone-900 block">
                                    {it.cantidad} <span className="text-[10px] font-normal text-stone-500">u.</span>
                                  </span>
                                </div>

                                <span className="w-14 text-center px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-900 text-xs font-black border border-emerald-200">
                                  {it.pctRubro}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            ) : isLoadingDl ? (
              <div className="text-center py-12 bg-stone-50 rounded-2xl border border-stone-200 text-stone-500 text-xs space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-[#1B5E38] mx-auto" />
                <p className="font-bold text-stone-800">Descargando y calculando porcentajes por rubro desde Datalive...</p>
                <p className="text-[11px] text-stone-400">Consultando comandas vendidas y volumen de artículos del turno</p>
              </div>
            ) : (
              <div className="text-center py-10 bg-stone-50 rounded-2xl border border-stone-200 text-stone-500 text-xs space-y-2">
                <p>No se encontraron datos de artículos todavía para esta caja.</p>
                <button
                  onClick={() => handleFetchDataliveCompleto()}
                  className="px-4 py-2 bg-[#123D26] hover:bg-[#1B5E38] text-white font-bold rounded-xl cursor-pointer"
                >
                  ⚡ Descargar Artículos desde Datalive
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 2: AUDITORÍA DE CAJA, EGRESOS, RETIROS & SUELDOS */}
      {/* ======================================================== */}
      {activeSubTab === 'caja_auditoria' && (
        <div className="space-y-4">
          
          <div className="bg-amber-50 rounded-3xl p-5 border border-amber-200 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-800" />
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
                  Control Estricto de Retiros &amp; Salidas de Caja
                </span>
              </div>
              <h3 className="text-base font-black text-amber-950 mt-1">
                Auditoría de Egresos, Gastos y Pagos de Sueldos
              </h3>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Detalle exacto de cada centavo que los colaboradores retiraron de la caja del turno con horario, responsable y concepto.
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">Total Salidas Registradas</span>
              <span className="text-2xl font-black font-mono-num text-rose-700">
                {fmtMoney(Math.abs((dlCajaData?.totalEgresos || 0) + (dlCajaData?.totalSueldos || 0) + (dlCajaData?.totalGastos || 0)))}
              </span>
            </div>
          </div>

          {/* Cards resumen de salidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Total Egresos / Retiros
              </span>
              <span className="text-2xl font-black font-mono-num text-rose-600 mt-1 block">
                {fmtMoney(Math.abs(dlCajaData?.totalEgresos || 0))}
              </span>
              <span className="text-[10px] text-stone-500 mt-0.5 block">
                {dlCajaData?.egresos?.length || 0} movimientos registrados
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Pagos de Sueldos / Adelantos
              </span>
              <span className="text-2xl font-black font-mono-num text-amber-700 mt-1 block">
                {fmtMoney(Math.abs(dlCajaData?.totalSueldos || 0))}
              </span>
              <span className="text-[10px] text-stone-500 mt-0.5 block">
                {dlCajaData?.sueldos?.length || 0} vales / adelantos
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Gastos del Turno
              </span>
              <span className="text-2xl font-black font-mono-num text-stone-800 mt-1 block">
                {fmtMoney(Math.abs(dlCajaData?.totalGastos || 0))}
              </span>
              <span className="text-[10px] text-stone-500 mt-0.5 block">
                {dlCajaData?.gastos?.length || 0} gastos operativos
              </span>
            </div>
          </div>

          {/* Tabla de Egresos y Retiros */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black text-stone-800 uppercase tracking-wide">
                1. Detalle de Egresos &amp; Retiros (Transferencias / Cofre / Compras)
              </span>
              <span className="text-xs font-bold text-rose-700 font-mono-num">
                Total: {fmtMoney(Math.abs(dlCajaData?.totalEgresos || 0))}
              </span>
            </div>

            <div className="divide-y divide-stone-100">
              {dlCajaData?.egresos && dlCajaData.egresos.length > 0 ? (
                dlCajaData.egresos.map((egr: any, idx: number) => (
                  <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-stone-50/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-stone-900">{egr.concepto}</span>
                        <span className="text-[10px] bg-stone-200 text-stone-700 font-bold px-1.5 py-0.2 rounded font-mono-num">
                          #{egr.codigo}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>Hora: <strong>{egr.hora}</strong></span>
                        <span>·</span>
                        <span>Cajero: {egr.usuario}</span>
                        {egr.sucursal && egr.sucursal !== 'Ninguna' && (
                          <>
                            <span>·</span>
                            <span>Destino: {egr.sucursal}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black font-mono-num text-rose-700">
                        {fmtMoney(egr.monto)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-stone-400 text-xs">
                  No se registraron egresos en esta caja de Datalive.
                </div>
              )}
            </div>
          </div>

          {/* Tabla de Pagos de Sueldo / Adelantos */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black text-stone-800 uppercase tracking-wide">
                2. Pagos de Sueldo &amp; Adelantos a Empleados
              </span>
              <span className="text-xs font-bold text-amber-700 font-mono-num">
                Total: {fmtMoney(Math.abs(dlCajaData?.totalSueldos || 0))}
              </span>
            </div>

            <div className="divide-y divide-stone-100">
              {dlCajaData?.sueldos && dlCajaData.sueldos.length > 0 ? (
                dlCajaData.sueldos.map((sue: any, idx: number) => (
                  <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-stone-50/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-black text-stone-900">{sue.empleado}</span>
                        {sue.periodo && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded font-mono-num">
                            Período: {sue.periodo}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        <span>Obs: {sue.observaciones || 'Sin observaciones'}</span>
                        <span className="ml-2 font-mono-num text-stone-400">Hora: {sue.hora}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black font-mono-num text-amber-900">
                        {fmtMoney(sue.monto)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-stone-400 text-xs">
                  No se registraron pagos de sueldos o adelantos en esta caja.
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 3: ARQUEO & AUDITORÍA DE POSTNETS POR RANGO DE FECHAS */}
      {/* ======================================================== */}
      {activeSubTab === 'arqueo_postnets' && (
        <div className="space-y-4">
          
          {/* Top Banner de Arqueo */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-5 text-white shadow-md border border-blue-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <span className="text-[10px] font-black tracking-widest uppercase bg-amber-400 text-stone-950 px-2 py-0.5 rounded-md">
                  CONCILIACIÓN DE TERMINALES DE PAGO
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight mt-1">
                Arqueo &amp; Monitoreo de Postnets
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Sumarización individual por terminal física (Amarillo, Rosa y Blanco) para corte de lotes y conciliación bancaria.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={handleExportarExcelPostnets}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                title="Descargar detalle completo de turnos a un archivo Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-stone-950" />
                <span>Bajar en Excel (.xlsx)</span>
              </button>

              <button
                onClick={handleCopiarResumenPostnets}
                className="px-3.5 py-2 bg-blue-500 hover:bg-blue-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                title="Copiar texto resumen formateado para enviar por WhatsApp"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar para WhatsApp</span>
              </button>

              <button
                onClick={() => {
                  setEditPostnetModal({
                    isOpen: true,
                    id: `${currentFecha}_${currentTurno}`,
                    fecha: currentFecha,
                    turno: currentTurno,
                    cajero: currentEmpleado?.nombre || 'Administración',
                    amarillo: 0,
                    rosa: 0,
                    blanco: 0,
                    onlineLocalSist: dlCajaData?.onlineLocal || 0,
                    observaciones: 'Ajuste manual de gerencia',
                  });
                }}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-colors cursor-pointer flex items-center gap-1.5"
                title="Permite a los dueños registrar o corregir manualmente los vouchers si el cajero no los cargó o hubo un error"
              >
                <Plus className="w-3.5 h-3.5 text-amber-300" />
                <span>+ Cargar / Ajustar Turno Manual</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros: Rango de Fechas Personalizado */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#1B5E38]" />
                <span className="text-xs font-black text-stone-800 uppercase tracking-wide">
                  Rango de Fechas para Liquidación
                </span>
                <span className="text-[11px] font-bold text-stone-400 font-mono-num">
                  ({postnetTotales.countTurnos} turnos en período)
                </span>
              </div>

              {/* Presets Rápidos */}
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <button
                  onClick={() => {
                    const hoy = new Date().toISOString().split('T')[0];
                    setPostnetFechaDesde(hoy);
                    setPostnetFechaHasta(hoy);
                  }}
                  className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold text-stone-700 cursor-pointer transition-colors"
                >
                  Hoy
                </button>
                <button
                  onClick={() => {
                    const ayer = new Date();
                    ayer.setDate(ayer.getDate() - 1);
                    const ayerStr = ayer.toISOString().split('T')[0];
                    setPostnetFechaDesde(ayerStr);
                    setPostnetFechaHasta(ayerStr);
                  }}
                  className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold text-stone-700 cursor-pointer transition-colors"
                >
                  Ayer
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 3);
                    setPostnetFechaDesde(d.toISOString().split('T')[0]);
                    setPostnetFechaHasta(new Date().toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold text-stone-700 cursor-pointer transition-colors"
                >
                  Últimos 3 días
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    setPostnetFechaDesde(d.toISOString().split('T')[0]);
                    setPostnetFechaHasta(new Date().toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold text-stone-700 cursor-pointer transition-colors"
                >
                  Últimos 7 días
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    const inicioMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
                    setPostnetFechaDesde(inicioMes);
                    setPostnetFechaHasta(new Date().toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold text-stone-700 cursor-pointer transition-colors"
                >
                  Mes actual
                </button>
                <button
                  onClick={() => {
                    setPostnetFechaDesde('');
                    setPostnetFechaHasta('');
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 font-bold text-emerald-900 cursor-pointer transition-colors"
                >
                  Ver Todo
                </button>
              </div>
            </div>

            {/* Inputs de Rango */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                  Fecha Desde
                </label>
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  <input
                    type="date"
                    value={postnetFechaDesde}
                    onChange={(e) => setPostnetFechaDesde(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-stone-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                  Fecha Hasta
                </label>
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  <input
                    type="date"
                    value={postnetFechaHasta}
                    onChange={(e) => setPostnetFechaHasta(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-stone-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                  Filtrar Turno
                </label>
                <select
                  value={postnetFiltroTurno}
                  onChange={(e) => setPostnetFiltroTurno(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-900 focus:outline-none"
                >
                  <option value="todos">Todos los Turnos (Mañana y Tarde)</option>
                  <option value="Mañana">Solo Turno Mañana</option>
                  <option value="Tarde">Solo Turno Tarde</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sumarización por Terminal (4 Tarjetas KPI) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Postnet 1: Amarillo */}
            <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500 shadow-2xs"></span>
                    Postnet 1 · Amarillo
                  </span>
                  <span className="text-[9px] font-bold bg-amber-200 text-amber-950 px-1.5 py-0.2 rounded-md">
                    Terminal 1
                  </span>
                </div>
                <span className="text-2xl font-black font-mono-num text-amber-950 block">
                  {fmtMoney(postnetTotales.totAmarillo)}
                </span>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-200/80 text-[11px] text-amber-900 flex items-center justify-between font-bold">
                <span>Participación:</span>
                <span className="font-mono-num bg-amber-200/70 px-1.5 py-0.5 rounded text-amber-950">
                  {postnetTotales.pctAmarillo}%
                </span>
              </div>
            </div>

            {/* Postnet 2: Rosa */}
            <div className="bg-pink-50/70 border-2 border-pink-300 rounded-3xl p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-pink-900 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-pink-400 border border-pink-500 shadow-2xs"></span>
                    Postnet 2 · Rosa
                  </span>
                  <span className="text-[9px] font-bold bg-pink-200 text-pink-950 px-1.5 py-0.2 rounded-md">
                    Terminal 2
                  </span>
                </div>
                <span className="text-2xl font-black font-mono-num text-pink-950 block">
                  {fmtMoney(postnetTotales.totRosa)}
                </span>
              </div>
              <div className="mt-3 pt-2 border-t border-pink-200/80 text-[11px] text-pink-900 flex items-center justify-between font-bold">
                <span>Participación:</span>
                <span className="font-mono-num bg-pink-200/70 px-1.5 py-0.5 rounded text-pink-950">
                  {postnetTotales.pctRosa}%
                </span>
              </div>
            </div>

            {/* Postnet 3: Blanco */}
            <div className="bg-stone-50 border-2 border-stone-300 rounded-3xl p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-stone-200 border border-stone-400 shadow-2xs"></span>
                    Postnet 3 · Blanco
                  </span>
                  <span className="text-[9px] font-bold bg-stone-200 text-stone-800 px-1.5 py-0.2 rounded-md">
                    Terminal 3
                  </span>
                </div>
                <span className="text-2xl font-black font-mono-num text-stone-900 block">
                  {fmtMoney(postnetTotales.totBlanco)}
                </span>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200 text-[11px] text-stone-700 flex items-center justify-between font-bold">
                <span>Participación:</span>
                <span className="font-mono-num bg-stone-200 px-1.5 py-0.5 rounded text-stone-900">
                  {postnetTotales.pctBlanco}%
                </span>
              </div>
            </div>

            {/* Total Arqueado vs Datalive */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-3xl p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-700" />
                    Total 3 Terminales
                  </span>
                  <span className="text-[9px] font-bold bg-indigo-200 text-indigo-950 px-1.5 py-0.2 rounded-md">
                    Arqueo Físico
                  </span>
                </div>
                <span className="text-2xl font-black font-mono-num text-indigo-950 block">
                  {fmtMoney(postnetTotales.totTerminales)}
                </span>
              </div>

              <div className="mt-3 pt-2 border-t border-indigo-200/80 text-[11px] text-indigo-900 space-y-0.5">
                <div className="flex items-center justify-between font-medium">
                  <span>Datalive Online:</span>
                  <span className="font-mono-num font-bold">{fmtMoney(postnetTotales.totDataliveOnline)}</span>
                </div>
                <div className="flex items-center justify-between font-black">
                  <span>Diferencia:</span>
                  <span className={`font-mono-num ${Math.abs(postnetTotales.difGlobal) < 1 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {fmtSignedMoney(postnetTotales.difGlobal)}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Tabla Cronológica de Turnos */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black text-stone-800 uppercase tracking-wide block">
                  Detalle de Arqueos Turno por Turno
                </span>
                <span className="text-[11px] text-stone-500">
                  Vouchers y cierres de lote declarados en el rango seleccionado
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-bold text-stone-600 font-mono-num hidden md:block">
                  Total Físico Acumulado: <strong className="text-indigo-950">{fmtMoney(postnetTotales.totTerminales)}</strong>
                </div>
                <button
                  onClick={handleExportarExcelPostnets}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  title="Descargar esta tabla a Excel con formato de celdas"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Bajar en Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-100 text-stone-600 uppercase text-[10px] font-black border-b border-stone-200">
                  <tr>
                    <th className="py-2.5 px-3">Fecha &amp; Turno</th>
                    <th className="py-2.5 px-3">Cajero</th>
                    <th className="py-2.5 px-3 text-right">💛 Amarillo</th>
                    <th className="py-2.5 px-3 text-right">🩷 Rosa</th>
                    <th className="py-2.5 px-3 text-right">🤍 Blanco</th>
                    <th className="py-2.5 px-3 text-right">Total Postnets</th>
                    <th className="py-2.5 px-3 text-right">Datalive (Online)</th>
                    <th className="py-2.5 px-3 text-right">Diferencia</th>
                    <th className="py-2.5 px-3">Observaciones / Lote</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono-num">
                  {postnetsFiltrados.length > 0 ? (
                    postnetsFiltrados.map((r) => {
                      const suma = (r.postnet_amarillo || 0) + (r.postnet_rosa || 0) + (r.postnet_blanco || 0);
                      const dlOnline = r.online_local_sist || 0;
                      const dif = suma - dlOnline;

                      return (
                        <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                          <td className="py-3 px-3 font-sans">
                            <div className="font-bold text-stone-900">{r.fecha}</div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              r.turno === 'Mañana' ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-900'
                            }`}>
                              {r.turno}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-sans text-stone-700 font-medium">
                            {r.cajero}
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-amber-950 bg-amber-50/30">
                            {fmtMoney(r.postnet_amarillo)}
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-pink-950 bg-pink-50/30">
                            {fmtMoney(r.postnet_rosa)}
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-stone-900 bg-stone-50/50">
                            {fmtMoney(r.postnet_blanco)}
                          </td>

                          <td className="py-3 px-3 text-right font-black text-indigo-950 bg-indigo-50/40">
                            {fmtMoney(suma)}
                          </td>

                          <td className="py-3 px-3 text-right text-stone-600">
                            {fmtMoney(dlOnline)}
                          </td>

                          <td className={`py-3 px-3 text-right font-black ${
                            Math.abs(dif) < 1 ? 'text-emerald-700' : dif > 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {fmtSignedMoney(dif)}
                          </td>

                          <td className="py-3 px-3 font-sans text-[11px] text-stone-500 max-w-xs truncate">
                            {r.observaciones || '—'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => {
                                setEditPostnetModal({
                                  isOpen: true,
                                  id: r.id,
                                  fecha: r.fecha,
                                  turno: r.turno,
                                  cajero: r.cajero,
                                  amarillo: r.postnet_amarillo || 0,
                                  rosa: r.postnet_rosa || 0,
                                  blanco: r.postnet_blanco || 0,
                                  onlineLocalSist: r.online_local_sist || 0,
                                  observaciones: r.observaciones || '',
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                              title="Editar o corregir vouchers de este turno"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-stone-400 font-sans text-xs">
                        No hay turnos registrados en este rango de fechas. Podés cambiar el rango arriba o presionar "+ Cargar Turno".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal para Editar o Cargar Turno de Arqueo */}
          {editPostnetModal && editPostnetModal.isOpen && (
            <div className="fixed inset-0 z-50 bg-[#0E2F1D]/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-stone-900 tracking-tight">
                        Cargar / Ajustar Turno Manual
                      </h3>
                      <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                        Ajuste Gerencial
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Permite registrar o corregir manualmente los vouchers de cada terminal si el cajero no los cargó o hubo un error en caja.
                    </p>
                  </div>
                  <button
                    onClick={() => setEditPostnetModal(null)}
                    className="w-8 h-8 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center cursor-pointer hover:bg-stone-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">
                        Fecha
                      </label>
                      <input
                        type="date"
                        value={editPostnetModal.fecha}
                        onChange={(e) =>
                          setEditPostnetModal({ ...editPostnetModal, fecha: e.target.value })
                        }
                        className="w-full p-2.5 border border-stone-300 rounded-xl font-bold text-stone-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">
                        Turno
                      </label>
                      <select
                        value={editPostnetModal.turno}
                        onChange={(e) =>
                          setEditPostnetModal({ ...editPostnetModal, turno: e.target.value as any })
                        }
                        className="w-full p-2.5 border border-stone-300 rounded-xl font-bold text-stone-900"
                      >
                        <option value="Mañana">Mañana</option>
                        <option value="Tarde">Tarde</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">
                      Cajero / Responsable
                    </label>
                    <input
                      type="text"
                      value={editPostnetModal.cajero}
                      onChange={(e) =>
                        setEditPostnetModal({ ...editPostnetModal, cajero: e.target.value })
                      }
                      className="w-full p-2.5 border border-stone-300 rounded-xl font-bold text-stone-900"
                    />
                  </div>

                  {/* 3 Postnets Inputs */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-600 block">
                      Vouchers Físicos de Cada Terminal
                    </span>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          💛 Amarillo
                        </label>
                        <input
                          type="number"
                          value={editPostnetModal.amarillo}
                          onChange={(e) =>
                            setEditPostnetModal({
                              ...editPostnetModal,
                              amarillo: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full p-2 bg-white border border-amber-300 rounded-xl font-mono-num font-bold text-amber-950"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-pink-900 mb-1">
                          🩷 Rosa
                        </label>
                        <input
                          type="number"
                          value={editPostnetModal.rosa}
                          onChange={(e) =>
                            setEditPostnetModal({
                              ...editPostnetModal,
                              rosa: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full p-2 bg-white border border-pink-300 rounded-xl font-mono-num font-bold text-pink-950"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-stone-700 mb-1">
                          🤍 Blanco
                        </label>
                        <input
                          type="number"
                          value={editPostnetModal.blanco}
                          onChange={(e) =>
                            setEditPostnetModal({
                              ...editPostnetModal,
                              blanco: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full p-2 bg-white border border-stone-300 rounded-xl font-mono-num font-bold text-stone-900"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs font-bold">
                      <span className="text-stone-500">Suma de las 3 Terminales:</span>
                      <span className="font-mono-num text-indigo-950 text-sm">
                        {fmtMoney(
                          editPostnetModal.amarillo + editPostnetModal.rosa + editPostnetModal.blanco
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">
                      Online Local Registrado en Datalive
                    </label>
                    <input
                      type="number"
                      value={editPostnetModal.onlineLocalSist}
                      onChange={(e) =>
                        setEditPostnetModal({
                          ...editPostnetModal,
                          onlineLocalSist: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-full p-2.5 border border-stone-300 rounded-xl font-mono-num font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">
                      Observaciones / Número de Cierre de Lote
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Lote 452 Payway / Cupón de terminal"
                      value={editPostnetModal.observaciones}
                      onChange={(e) =>
                        setEditPostnetModal({ ...editPostnetModal, observaciones: e.target.value })
                      }
                      className="w-full p-2.5 border border-stone-300 rounded-xl text-stone-900"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-stone-100">
                  <button
                    onClick={() => setEditPostnetModal(null)}
                    className="px-4 py-2 text-stone-600 font-bold text-xs hover:bg-stone-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      const id = `${editPostnetModal.fecha}_${editPostnetModal.turno}`;
                      handleGuardarOverridePostnet({
                        id,
                        fecha: editPostnetModal.fecha,
                        turno: editPostnetModal.turno,
                        cajero: editPostnetModal.cajero,
                        postnet_amarillo: editPostnetModal.amarillo,
                        postnet_rosa: editPostnetModal.rosa,
                        postnet_blanco: editPostnetModal.blanco,
                        online_local_sist: editPostnetModal.onlineLocalSist,
                        observaciones: editPostnetModal.observaciones,
                      });
                    }}
                    className="px-4 py-2 bg-[#123D26] hover:bg-[#1B5E38] text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs"
                  >
                    Guardar Arqueo
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 4: PEDIDO A FÁBRICA */}
      {/* ======================================================== */}
      {activeSubTab === 'fabrica' && (
        <div className="space-y-4">
          
          <div className="bg-amber-50 rounded-3xl p-5 border border-amber-200 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
                Planificación Inteligente de Reposición
              </span>
              <h3 className="text-base font-black text-amber-950 mt-1">
                Cálculo de Pedido para el Próximo Despacho
              </h3>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Calculado en base al stock contado por los empleados al cierre y las ventas registradas.
              </p>
            </div>

            <button
              onClick={handleEnviarPedidoWhatsApp}
              className="px-4 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar Pedido por WhatsApp</span>
            </button>
          </div>

          {/* Table of products */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black text-stone-700 uppercase tracking-wide">
                Productos a Pedir (Empanadas / Pizzas / Insumos)
              </span>
              <span className="text-xs text-stone-500 font-semibold">
                Unidades &amp; Docenas
              </span>
            </div>

            <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto">
              {itemsFabrica.map((item) => (
                <div key={item.id} className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-stone-900">{item.nombre}</span>
                      <span className="text-[10px] text-stone-400 font-bold bg-stone-100 px-1.5 py-0.2 rounded">
                        {item.categoria}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 flex items-center gap-2 font-mono-num">
                      <span>Stock Contado: <strong>{item.stockContado}</strong></span>
                      <span>·</span>
                      <span>Vendido Turno: <strong>{item.consumoTurno}</strong></span>
                      <span>·</span>
                      <span>Objetivo: {item.stockObjetivo}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <div className="text-right">
                      <span className="text-xs font-bold text-stone-400 block text-[10px] uppercase">
                        Sugerido
                      </span>
                      <span className="text-xs font-bold text-stone-600 font-mono-num">
                        {item.sugeridoUnidades} u. ({(item.sugeridoUnidades / 12).toFixed(1)} doc.)
                      </span>
                    </div>

                    {/* Stepper controls */}
                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
                      <button
                        onClick={() => handleUpdatePedidoQty(item.id, -12)}
                        className="w-7 h-7 bg-white hover:bg-stone-200 text-stone-800 rounded-lg font-black text-xs flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                        title="-12 unidades (-1 docena)"
                      >
                        -12
                      </button>
                      <button
                        onClick={() => handleUpdatePedidoQty(item.id, -1)}
                        className="w-7 h-7 bg-white hover:bg-stone-200 text-stone-800 rounded-lg font-black text-xs flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="number"
                        min="0"
                        value={item.confirmadoUnidades}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setPedidoOverrides(prev => ({ ...prev, [item.id]: val }));
                        }}
                        className="w-14 text-center font-mono-num font-black text-sm text-[#123D26] bg-transparent focus:outline-none"
                      />

                      <button
                        onClick={() => handleUpdatePedidoQty(item.id, 1)}
                        className="w-7 h-7 bg-white hover:bg-stone-200 text-stone-800 rounded-lg font-black text-xs flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUpdatePedidoQty(item.id, 12)}
                        className="w-7 h-7 bg-[#123D26] hover:bg-[#1B5E38] text-white rounded-lg font-black text-xs flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                        title="+12 unidades (+1 docena)"
                      >
                        +12
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 4: CRUCE FINANCIERO & REPORTE PDF */}
      {/* ======================================================== */}
      {activeSubTab === 'pdf' && (
        <div className="space-y-4">
          
          <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
            <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide mb-1">
              Cruce Financiero: Caja Rendida vs. Facturado Datalive
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Compara lo que ingresó físicamente por los 3 postnets + efectivo en el cajón contra lo facturado por el sistema.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Rendición Total Declarada
                </span>
                <span className="text-xl font-black font-mono-num text-stone-900 mt-1 block">
                  {fmtMoney(cruceCaja.rendicionTotal)}
                </span>
                <span className="text-[10px] text-stone-400 mt-0.5 block">
                  {fmtMoney(cruceCaja.postnets)} (postnets) + {fmtMoney(cruceCaja.efectivoReal)} (efvo)
                </span>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-center">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Facturación Total (Datalive)
                </span>
                <span className="text-xl font-black font-mono-num text-[#123D26] mt-1 block">
                  {fmtMoney(cruceCaja.facturadoDatalive)}
                </span>
                <span className="text-[10px] text-stone-400 mt-0.5 block">
                  Sistema de ventas del turno
                </span>
              </div>

              <div className={`p-4 rounded-2xl border text-center ${
                Math.abs(cruceCaja.difRendicion) < 1
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : cruceCaja.difRendicion > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Diferencia de Rendición
                </span>
                <span className="text-xl font-black font-mono-num mt-1 block">
                  {fmtSignedMoney(cruceCaja.difRendicion)}
                </span>
                <span className="text-[10px] font-semibold mt-0.5 block">
                  {Math.abs(cruceCaja.difRendicion) < 1 ? '✓ Rendición Cuadrada' : cruceCaja.difRendicion > 0 ? 'Sobrante' : 'Faltante'}
                </span>
              </div>
            </div>
          </div>

          {/* Generar PDF Gerencial */}
          <div className="bg-gradient-to-br from-[#123D26] to-[#1B5E38] rounded-3xl p-6 text-white text-center shadow-lg border border-emerald-500/40">
            <FileText className="w-10 h-10 text-amber-400 mx-auto mb-2" />
            <h3 className="text-lg font-black tracking-tight">
              Descargar Reporte Gerencial Oficial (PDF)
            </h3>
            <p className="text-xs text-emerald-100 max-w-md mx-auto mt-1 mb-5">
              Genera el documento confidencial con el balance de ventas de Datalive, la auditoría de salidas de caja y la planilla de reposición para fábrica.
            </p>

            <button
              onClick={handleDescargarPdfGerencial}
              className="py-3.5 px-6 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-xs uppercase tracking-wider rounded-2xl transition-transform active:scale-95 shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Descargar PDF Gerencial Confidencial</span>
            </button>
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 6: GOOGLE DRIVE AUTÓNOMO (charlydepiero@gmail.com) */}
      {/* ======================================================== */}
      {activeSubTab === 'google_drive' && (
        <div className="space-y-4">
          
          {/* Header Card: Estado y Respaldo Desatendido */}
          <div className="bg-gradient-to-br from-[#123D26] via-[#1B5E38] to-[#123D26] rounded-3xl p-5 sm:p-6 text-white shadow-md border border-emerald-500/40">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-400/20 text-emerald-200 border border-emerald-400/40 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Respaldo Automático en la Nube (24/7)</span>
                </div>
                <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <span>Google Drive · charlydepiero@gmail.com</span>
                </h3>
                <p className="text-xs text-emerald-100 max-w-xl mt-1 leading-relaxed">
                  Subida 100% desatendida de las <strong>Actas Oficiales de Cierre de Turno en PDF</strong>. Ningún empleado tiene acceso a tu cuenta ni necesita iniciar sesión en Google.
                </p>
              </div>

              <div className="bg-emerald-950/60 border border-emerald-600/50 p-3.5 rounded-2xl text-left shrink-0">
                <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                  Carpeta de Destino en tu Drive:
                </div>
                <div className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                  <FolderCheck className="w-4 h-4 text-emerald-400" />
                  <span>Reportes Cierre de Turno - Escobar</span>
                </div>
                <div className="text-[11px] text-emerald-200/80 mt-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Estado: <strong>{driveConfig.configured ? 'Conectado y listo' : 'Esperando URL'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Dos Columnas: Configuración Webhook + Historial de Archivos */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Columna Izquierda: Configuración del Webhook (lg:col-span-5) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Formulario URL Webhook */}
              <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-[#1B5E38]" />
                    <span>Webhook de Apps Script</span>
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      driveConfig.configured
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {driveConfig.configured ? '✓ Activo' : 'Pendiente'}
                  </span>
                </div>

                <p className="text-xs text-stone-500 mb-3 leading-relaxed">
                  Pegá la URL generada en <code>script.google.com</code> bajo tu cuenta <strong>charlydepiero@gmail.com</strong> para conectar la tienda con tu Google Drive:
                </p>

                <div className="space-y-2 mb-3">
                  <input
                    type="url"
                    value={inputDriveScriptUrl}
                    onChange={(e) => setInputDriveScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full p-2.5 text-xs font-mono bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:border-[#123D26] focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDriveConfig}
                      disabled={isSavingDriveUrl}
                      className="flex-1 py-2 px-3 bg-[#123D26] hover:bg-[#1B5E38] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSavingDriveUrl ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Guardar URL</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleTestDrive}
                      disabled={isTestingDrive || !inputDriveScriptUrl.trim()}
                      className="py-2 px-3 bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      title="Genera un PDF de prueba y verifica que aparezca en tu Drive"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isTestingDrive ? 'animate-spin' : ''}`} />
                      <span>{isTestingDrive ? 'Probando...' : '🧪 Probar Subida'}</span>
                    </button>
                  </div>
                </div>

                {/* Resultado de la Prueba */}
                {driveTestResult && (
                  <div
                    className={`p-3.5 rounded-2xl text-xs font-semibold mb-3 ${
                      driveTestResult.ok
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-950'
                        : 'bg-rose-50 border border-rose-300 text-rose-950'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {driveTestResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 space-y-2">
                        <div className="font-bold text-xs">{driveTestResult.message}</div>
                        {driveTestResult.solucion && (
                          <div className="p-2.5 bg-white/90 border border-rose-200 rounded-xl text-[11px] text-stone-800 space-y-1.5 font-normal">
                            <strong className="block text-rose-900 font-bold">💡 Cómo solucionarlo en 10 segundos:</strong>
                            <p className="text-stone-700">{driveTestResult.solucion}</p>
                            {driveTestResult.pasos && (
                              <ol className="list-decimal list-inside space-y-1 text-stone-700 mt-1 pl-1 font-medium">
                                {driveTestResult.pasos.map((p, i) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ol>
                            )}
                          </div>
                        )}
                        {driveTestResult.driveUrl && (
                          <a
                            href={driveTestResult.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-[#1B5E38] underline mt-1.5 hover:text-emerald-900 text-xs"
                          >
                            <span>Abrir archivo de prueba en Google Drive</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Último reporte subido */}
                {driveConfig.lastDriveUrl && (
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs flex items-center justify-between text-stone-700">
                    <span className="text-[11px]">Último archivo enviado:</span>
                    <a
                      href={driveConfig.lastDriveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[#1B5E38] underline flex items-center gap-1"
                    >
                      <span>Ver en Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Guía Rápida de 1 Minuto para Carlos */}
              <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs text-left space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Guía de Conexión en 3 Pasos</span>
                  </h4>
                  <button
                    onClick={handleCopyAppsScript}
                    className="py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? '¡Copiado!' : 'Copiar Código'}</span>
                  </button>
                </div>

                {/* Aviso clave sobre 'Cualquiera' */}
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-[11px] text-amber-950 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <strong className="block font-bold">Paso clave para evitar el error 404:</strong>
                    En la ventana de implementación, el campo <strong>Quién tiene acceso</strong> debe configurarse como <strong>"Cualquiera"</strong> (Anyone). Si queda en "Solo yo", Google bloquea la conexión externa.
                  </div>
                </div>

                <ol className="text-xs text-stone-600 space-y-2.5 list-decimal list-inside leading-relaxed">
                  <li>
                    Entrá a <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="font-bold text-[#1B5E38] underline">script.google.com</a> con <strong>charlydepiero@gmail.com</strong> y creá un <strong>Nuevo proyecto</strong>.
                  </li>
                  <li>
                    Pegá el código (botón de arriba) reemplazando todo. Cambiá la CLAVE de la primera línea por una clave larga inventada por vos y guardalo (Ctrl+S).
                  </li>
                  <li>
                    Hacé clic en el botón azul <strong>Implementar &gt; Nueva implementación</strong> (o <em>Gestionar implementaciones &gt; Editar</em> si ya la creaste):
                    <ul className="list-disc list-inside ml-3 mt-1 text-[11px] text-stone-800 space-y-1 font-medium bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                      <li>Tipo: <strong>Aplicación web</strong></li>
                      <li>Ejecutar como: <strong>Yo (charlydepiero@gmail.com)</strong></li>
                      <li className="text-emerald-900 font-extrabold bg-emerald-100/70 px-1 py-0.5 rounded">Quién tiene acceso: <strong>Cualquiera</strong> (Anyone)</li>
                    </ul>
                  </li>
                  <li>
                    Hacé clic en <strong>Implementar</strong>, autorizá los permisos de Google Drive una sola vez, copiá la URL de la aplicación web (termina en <code>/exec</code>) y pegala arriba.
                  </li>
                </ol>

                <div className="mt-4 p-3 bg-stone-900 rounded-xl overflow-x-auto text-[11px] font-mono text-emerald-300 leading-snug max-h-36 overflow-y-auto">
                  <pre>{APPS_SCRIPT_CODE}</pre>
                </div>
              </div>

            </div>

            {/* Columna Derecha: Historial Permanente de Cierres y Respaldo (lg:col-span-7) */}
            <div className="lg:col-span-7 space-y-4">
              
              <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5">
                      <FolderCheck className="w-4 h-4 text-[#1B5E38]" />
                      <span>Cierres de Turno Oficiales</span>
                    </h4>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Cada turno cerrado genera un PDF oficial con hash y firma de auditoría.
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-stone-100 text-stone-700 px-3 py-1 rounded-full border border-stone-200 font-mono-num">
                    {pastTurnos.length} cierres registrados
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {pastTurnos.map((shift, idx) => {
                    const shiftKey = shift.id || `${shift.fecha}_${shift.turno}_${idx}`;
                    const isSyncing = syncingTurnoId === (shift.id || `${shift.fecha}_${shift.turno}`);
                    const efReal = shift.cierreCaja?.efectivo_real || 0;
                    const totDigital = shift.cierreCaja?.total_digital || shift.cierreCaja?.postnets || 0;
                    const totStock = shift.resumenStock?.totalContado || (shift.conteos ? Object.keys(shift.conteos).length : 0);

                    return (
                      <div
                        key={shiftKey}
                        className="p-3.5 bg-stone-50/80 hover:bg-stone-50 rounded-2xl border border-stone-200 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-stone-900">
                              {shift.fecha}
                            </span>
                            <span className="text-stone-300">·</span>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                shift.turno === 'Tarde'
                                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                  : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}
                            >
                              Turno {shift.turno}
                            </span>
                            <span className="text-stone-300">·</span>
                            <span className="text-stone-600 font-medium text-[11px]">
                              {shift.cerrado_por || shift.cierreCaja?.empleado || 'Colaborador'} ({shift.hora_cierre || '23:20'})
                            </span>
                          </div>

                          <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-3 font-mono-num">
                            <span>Efectivo: <strong>{fmtMoney(efReal)}</strong></span>
                            <span>Digital: <strong>{fmtMoney(totDigital)}</strong></span>
                            {totStock > 0 && <span>Stock: <strong>{totStock} contados</strong></span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          {/* Ver PDF en Servidor */}
                          <a
                            href={shift.pdfUrl || `/api/reportes/pdf/Acta_General_Cierre_Escobar_${shift.fecha}_${shift.turno.toLowerCase()}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1.5 px-2.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition"
                            title="Ver PDF archivado en servidor local"
                          >
                            <FileText className="w-3.5 h-3.5 text-stone-500" />
                            <span>PDF</span>
                          </a>

                          {/* Enlace o Botón para Google Drive */}
                          {shift.driveUrl ? (
                            <a
                              href={shift.driveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1.5 px-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition shadow-2xs"
                              title="Abrir archivo en Google Drive (charlydepiero@gmail.com)"
                            >
                              <FolderCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>En Drive</span>
                              <ExternalLink className="w-3 h-3 text-emerald-700" />
                            </a>
                          ) : (
                            <button
                              onClick={() => handleSyncHistoricalShiftToDrive(shift)}
                              disabled={isSyncing}
                              className="py-1.5 px-3 bg-[#123D26] hover:bg-[#1B5E38] text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                              title="Subir este reporte a Google Drive ahora"
                            >
                              <Cloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                              <span>{isSyncing ? 'Subiendo...' : 'Subir a Drive'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tarjeta explicativa de seguridad de credenciales */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-4 text-xs text-stone-700 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="text-emerald-950 block font-bold">
                    Seguridad y Cero Acceso de Colaboradores:
                  </strong>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Los empleados de la sucursal (Fati, Axel, Mai, Tiara, Vero) cierran los turnos únicamente con su PIN de 4 dígitos. Cuando presionan "Cerrar Turno", la aplicación envía directamente el archivo PDF a través de este Webhook seguro a tu cuenta <code>charlydepiero@gmail.com</code> sin pedirles inicio de sesión, manteniendo tu privacidad y control absoluto.
                  </p>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Modal para pegar texto de Datalive */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0E2F1D]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-base font-black text-stone-900 tracking-tight mb-1">
              Pegar Ventas desde Datalive
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Copiá la tabla o reporte de ventas de Datalive (ej: código, nombre y cantidad vendida) y pegalo acá:
            </p>

            <textarea
              rows={8}
              value={pasteRawText}
              onChange={(e) => setPasteRawText(e.target.value)}
              placeholder="Ejemplo:&#10;101 Carne Suave 24&#10;102 Pollo 18&#10;201 Muzza 12"
              className="w-full p-3 text-xs font-mono bg-stone-50 border border-stone-300 rounded-xl mb-4 focus:bg-white focus:border-[#123D26]"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPasteModalOpen(false)}
                className="px-4 py-2 text-stone-600 font-bold text-xs hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessPastedData}
                className="px-4 py-2 bg-[#123D26] hover:bg-[#1B5E38] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Procesar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
