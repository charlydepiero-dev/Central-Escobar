import React, { useState, useEffect } from 'react';
import { useCentral } from '../context/CentralContext';
import { GoogleSheetsSyncCard } from './GoogleSheetsSyncCard';
import { shareOrDownloadPDF, generateGeneralCierrePDF } from '../utils/pdfGenerator';
import { 
  Users, 
  Lock, 
  Unlock, 
  RotateCcw, 
  RefreshCw, 
  Plus, 
  FileSpreadsheet, 
  Trash2, 
  KeyRound, 
  ShieldAlert,
  Send,
  AlertCircle,
  Settings,
  Database,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  Download,
  Share2
} from 'lucide-react';

import { isAdminUser } from '../utils/centralHelpers';

export const ProductosTab: React.FC = () => {
  const {
    currentEmpleado,
    empleados,
    crearEmpleado,
    cambiarPinEmpleado,
    toggleActivoEmpleado,
    eliminarEmpleado,
    reclamos,
    liberarCategoria,
    liberarTodosLosReclamos,
    catalogo,
    agregarProducto,
    crearCategoria,
    importarStockDatalive,
    forzarSincronizacionDatalive,
    turnoCerrado,
    forzarCierreTurno,
    reabrirTurno,
    pastTurnos,
    desbloquearEmpleado,
    reiniciarDatosTurnoActual,
    currentFecha,
    currentTurno,
    sistemaStock,
    conteoActual,
    cierreCaja,
  } = useCentral();

  const esAdmin = isAdminUser(currentEmpleado);

  // New employee form
  const [newEmpNombre, setNewEmpNombre] = useState('');
  const [newEmpPin, setNewEmpPin] = useState('');
  const [newEmpRol, setNewEmpRol] = useState<'empleado' | 'admin'>('empleado');
  const [empStatusMsg, setEmpStatusMsg] = useState<string | null>(null);
  const [cleanTurnoMsg, setCleanTurnoMsg] = useState<string | null>(null);
  const [reclamosMsg, setReclamosMsg] = useState<string | null>(null);
  const [isReleasingClaims, setIsReleasingClaims] = useState(false);
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // New product inside category
  const [newProdNames, setNewProdNames] = useState<Record<string, string>>({});
  const [newProdCodes, setNewProdCodes] = useState<Record<string, string>>({});

  // New category form
  const [newCatName, setNewCatName] = useState('');
  const [newCatUbic, setNewCatUbic] = useState('Freezer, Heladera');

  // Excel Datalive Import Textarea
  const [importText, setImportText] = useState('');
  const [importResultMsg, setImportResultMsg] = useState<string | null>(null);

  // Datalive sync button status
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResultMsg, setSyncResultMsg] = useState<string | null>(null);
  const [serverDlConfigured, setServerDlConfigured] = useState(false);

  // Datalive configuration state
  const [showDataliveConfig, setShowDataliveConfig] = useState(false);
  const [dlUsuario, setDlUsuario] = useState(() => {
    try {
      const saved = localStorage.getItem('central_datalive_config');
      return saved ? JSON.parse(saved).usuario || '' : '';
    } catch {
      return '';
    }
  });
  const [dlClave, setDlClave] = useState(() => {
    try {
      const saved = localStorage.getItem('central_datalive_config');
      return saved ? JSON.parse(saved).clave || '' : '';
    } catch {
      return '';
    }
  });
  const [dlToken, setDlToken] = useState(() => {
    try {
      const saved = localStorage.getItem('central_datalive_config');
      return saved ? JSON.parse(saved).token || '' : '';
    } catch {
      return '';
    }
  });
  const [dlScriptUrl, setDlScriptUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('central_datalive_config');
      return saved ? JSON.parse(saved).scriptUrl || '' : '';
    } catch {
      return '';
    }
  });
  const [dlConfigMsg, setDlConfigMsg] = useState<string | null>(null);

  // Check server-side Datalive credentials on mount
  useEffect(() => {
    fetch('/api/datalive/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.configurado) setServerDlConfigured(true);
          if (data.usuario && !dlUsuario) setDlUsuario(data.usuario);
          if (data.scriptUrl && !dlScriptUrl) setDlScriptUrl(data.scriptUrl);
        }
      })
      .catch((err) => console.log('Could not load datalive server config status:', err));
  }, []);

  // Reenviar snap state
  const [selectedReenvio, setSelectedReenvio] = useState<string>('');

  const handleGuardarConfigDatalive = async (e: React.FormEvent) => {
    e.preventDefault();
    const config = {
      usuario: dlUsuario.trim(),
      clave: dlClave.trim(),
      token: dlToken.trim(),
      scriptUrl: dlScriptUrl.trim(),
    };
    localStorage.setItem('central_datalive_config', JSON.stringify(config));

    // Save permanently on the server so all employee devices and browsers have automatic access!
    try {
      const res = await fetch('/api/datalive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.ok) {
        setServerDlConfigured(true);
        setDlConfigMsg('✓ Credenciales guardadas en el servidor para todos los usuarios.');
      } else {
        setDlConfigMsg('✓ Credenciales guardadas localmente.');
      }
    } catch {
      setDlConfigMsg('✓ Credenciales guardadas en el navegador.');
    }

    setTimeout(() => setDlConfigMsg(null), 3500);
    // Trigger sync immediately with new config
    handleForzarStockWithConfig(config);
  };

  const handleForzarStockWithConfig = async (customCfg?: { usuario?: string; clave?: string; token?: string; scriptUrl?: string }) => {
    setIsSyncing(true);
    setSyncResultMsg('Conectando con Datalive para sincronizar stock...');
    try {
      const res = await forzarSincronizacionDatalive(customCfg);
      if (res.ok) {
        setSyncResultMsg(res.motivo || `✓ ${res.total} productos actualizados con Datalive.`);
        setServerDlConfigured(true);
      } else {
        setSyncResultMsg(`⚠️ ${res.motivo || 'Error al conectar con Datalive.'}`);
        if (esAdmin) setShowDataliveConfig(true);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForzarStock = () => {
    handleForzarStockWithConfig();
  };

  const handleCrearEmpleado = (e: React.FormEvent) => {
    e.preventDefault();
    const res = crearEmpleado(newEmpNombre, newEmpPin, newEmpRol);
    if (res.ok) {
      setEmpStatusMsg(`Empleado "${newEmpNombre}" (${newEmpRol === 'admin' ? 'Administrador' : 'Colaborador'}) creado exitosamente.`);
      setNewEmpNombre('');
      setNewEmpPin('');
    } else {
      setEmpStatusMsg(res.motivo || 'Error al crear empleado.');
    }
  };

  const handleImportDatalive = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n');
    const parsed: { codigo: string; nombre: string; stock: number }[] = [];

    lines.forEach((line) => {
      const cols = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
      const codigo = (cols[0] || '').trim();
      if (/^\d+$/.test(codigo) && cols.length >= 3) {
        const rawStock = (cols[2] || '0').replace(/\./g, '').replace(',', '.');
        const numStock = parseFloat(rawStock) || 0;
        parsed.push({ codigo, nombre: (cols[1] || '').trim(), stock: numStock });
      }
    });

    const res = importarStockDatalive(parsed);
    setImportResultMsg(
      `✓ ${res.matched} productos actualizados desde Datalive.${
        res.unmatched.length > 0 ? ` (Sin coincidencia: ${res.unmatched.length})` : ''
      }`
    );
    setImportText('');
  };

  const [isGeneratingGeneralPdf, setIsGeneratingGeneralPdf] = useState(false);
  const [selectedTurnoForPdf, setSelectedTurnoForPdf] = useState<string>('actual');

  const buildGeneralReportData = () => {
    if (selectedTurnoForPdf === 'actual') {
      return {
        fecha: currentFecha,
        turno: currentTurno,
        cerradoPor: currentEmpleado?.nombre || 'Admin',
        horaCierre: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        catalogo,
        sistemaStock,
        conteoActual,
        cierreCaja,
        reclamos,
        pastTurnos,
      };
    }
    const past = pastTurnos.find((t) => `${t.fecha}|${t.turno}` === selectedTurnoForPdf);
    return {
      fecha: past ? past.fecha : currentFecha,
      turno: past ? past.turno : currentTurno,
      cerradoPor: past?.cerrado_por || 'Admin',
      horaCierre: past?.hora_cierre || '—',
      catalogo,
      sistemaStock: past?.sistemaStock || sistemaStock,
      conteoActual: past?.conteos || conteoActual,
      cierreCaja: past?.cierreCaja || cierreCaja,
      reclamos: {},
      pastTurnos,
    };
  };

  const handleDescargarGeneralPDF = () => {
    setIsGeneratingGeneralPdf(true);
    try {
      const reportData = buildGeneralReportData();
      const gen = generateGeneralCierrePDF(reportData);
      const dlUrl = URL.createObjectURL(gen.blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = gen.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
    } finally {
      setIsGeneratingGeneralPdf(false);
    }
  };

  const handleCompartirGeneralWhatsApp = async () => {
    setIsGeneratingGeneralPdf(true);
    try {
      const reportData = buildGeneralReportData();
      await shareOrDownloadPDF(reportData, '5491169927352');
    } finally {
      setIsGeneratingGeneralPdf(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-6">
      
      {/* GOOGLE SHEETS CLOUD SYNC CARD (CONFIGURACIÓN SOLO DUEÑO) */}
      {esAdmin && <GoogleSheetsSyncCard />}

      {/* CARD: ACTA GENERAL DE CIERRE OPERATIVO (PDF COMPLETO DE LOS EMPLEADOS) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#1B5E38] flex items-center justify-center font-bold">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-stone-900">Acta Oficial General de Cierre (PDF Operativo)</h2>
                <p className="text-xs text-stone-500">
                  Documento integral que envían los empleados al cerrar (Cierre de Caja, Auditoría por colaborador y Consolidado de stock).
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Acta Oficial
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-xs font-bold text-stone-600 whitespace-nowrap">Turno:</span>
              <select
                value={selectedTurnoForPdf}
                onChange={(e) => setSelectedTurnoForPdf(e.target.value)}
                className="p-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 flex-1 focus:bg-white"
              >
                <option value="actual">Turno Actual ({currentFecha} - {currentTurno})</option>
                {pastTurnos.map((t) => (
                  <option key={`${t.fecha}|${t.turno}`} value={`${t.fecha}|${t.turno}`}>
                    Cierre {t.fecha} - {t.turno} ({t.cerrado_por || 'Cierre'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDescargarGeneralPDF}
                disabled={isGeneratingGeneralPdf}
                className="px-4 py-2.5 bg-[#1B5E38] hover:bg-[#14472B] disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-2xs text-xs"
                title="Descargar archivo PDF completo del acta oficial"
              >
                <Download className="w-4 h-4" />
                <span>{isGeneratingGeneralPdf ? 'Generando...' : 'Descargar PDF General'}</span>
              </button>

              <button
                onClick={handleCompartirGeneralWhatsApp}
                disabled={isGeneratingGeneralPdf}
                className="px-4 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-2xs text-xs"
                title="Compartir acta general por WhatsApp a Central Colón"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN BLOCK 1: GESTIÓN DE EMPLEADOS */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
            <Users className="w-5 h-5 text-[#1B5E38]" />
            <div>
              <h2 className="font-bold text-sm text-stone-900">Gestión de Empleados &amp; PIN</h2>
              <p className="text-xs text-stone-500">
                Administrá los PINes de 4 dígitos. Al desactivar, el empleado no puede ingresar pero sus conteos se conservan.
              </p>
            </div>
          </div>

          <div className="divide-y divide-stone-100">
            {empleados.map((emp) => {
              const isAdmin = isAdminUser(emp);
              const isRevealed = Boolean(revealedPins[emp.nombre]);

              return (
                <div key={emp.nombre} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">{emp.nombre}</span>
                    {isAdmin ? (
                      <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300/60 px-1.5 py-0.2 rounded font-extrabold">
                        {['charly', 'carlos', 'luis'].includes(emp.nombre.toLowerCase())
                          ? '👑 DUEÑO'
                          : '🛠️ SOPORTE TÉCNICO'}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-semibold">
                        EMPLEADO
                      </span>
                    )}
                    {emp.oculto && (
                      <span className="text-[10px] bg-stone-200 text-stone-600 px-1 py-0.2 rounded font-semibold">
                        Oculto
                      </span>
                    )}
                    <div className="flex items-center gap-1 font-mono-num bg-stone-100 px-2 py-0.5 rounded text-stone-700 font-bold">
                      <span>PIN: {isRevealed ? emp.pin : '••••'}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedPins((prev) => ({
                            ...prev,
                            [emp.nombre]: !prev[emp.nombre],
                          }))
                        }
                        className="text-stone-400 hover:text-stone-700 ml-0.5 cursor-pointer"
                        title={isRevealed ? 'Ocultar PIN confidencial' : 'Ver PIN'}
                      >
                        {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                    {!emp.activo && (
                      <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded">
                        Inactivo
                      </span>
                    )}
                    {emp.bloqueado && (
                      <span className="text-[10px] text-rose-700 font-bold bg-rose-100 border border-rose-300 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Bloqueado</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {emp.bloqueado ? (
                      <button
                        onClick={async () => {
                          const res = await desbloquearEmpleado(emp.nombre);
                          setEmpStatusMsg(res.motivo || `✓ Usuario ${emp.nombre} desbloqueado exitosamente.`);
                          setTimeout(() => setEmpStatusMsg(null), 4000);
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs text-[11px]"
                        title="Desbloquear usuario bloqueado"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Desbloquear</span>
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const res = await desbloquearEmpleado(emp.nombre);
                          setEmpStatusMsg(res.motivo || `✓ Intentos de PIN restablecidos para ${emp.nombre}.`);
                          setTimeout(() => setEmpStatusMsg(null), 3000);
                        }}
                        className="px-2 py-1 bg-stone-100 hover:bg-amber-100 hover:text-amber-800 text-stone-500 font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                        title="Restablecer intentos / Desbloquear"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Desbloquear</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const nuevo = prompt(`Nuevo PIN para ${emp.nombre}:`, emp.pin);
                        if (nuevo) cambiarPinEmpleado(emp.nombre, nuevo);
                      }}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Cambiar PIN
                    </button>

                    {!isAdmin && (
                      <>
                        <button
                          onClick={() => toggleActivoEmpleado(emp.nombre)}
                          className={`px-2.5 py-1 font-semibold rounded-lg transition-colors cursor-pointer ${
                            emp.activo
                              ? 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                              : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                          }`}
                        >
                          {emp.activo ? 'Desactivar' : 'Activar'}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`¿Estás seguro de eliminar al empleado ${emp.nombre}?`)) {
                              eliminarEmpleado(emp.nombre);
                            }
                          }}
                          className="p-1 text-stone-300 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Eliminar empleado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form to create new employee with role */}
          <form onSubmit={handleCrearEmpleado} className="pt-3 border-t border-stone-100 flex gap-2 flex-wrap text-xs items-center">
            <input
              type="text"
              required
              placeholder="Nombre (ej: Matías)"
              value={newEmpNombre}
              onChange={(e) => setNewEmpNombre(e.target.value)}
              className="flex-1 min-w-[130px] p-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-bold focus:bg-white"
            />
            <input
              type="text"
              required
              maxLength={4}
              placeholder="PIN 4 dígitos"
              value={newEmpPin}
              onChange={(e) => setNewEmpPin(e.target.value)}
              className="w-28 p-2 bg-stone-50 border border-stone-300 rounded-xl text-center font-mono-num font-bold text-stone-900 focus:bg-white"
            />
            <select
              value={newEmpRol}
              onChange={(e) => setNewEmpRol(e.target.value as 'empleado' | 'admin')}
              className="p-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 font-bold cursor-pointer"
            >
              <option value="empleado">Colaborador</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
            >
              Crear Empleado
            </button>
          </form>

          {empStatusMsg && (
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 p-2 rounded-lg">
              {empStatusMsg}
            </p>
          )}
        </div>
      )}

      {/* ADMIN BLOCK 2: CONTROL DE CIERRE DE TURNO */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-3 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
            <div>
              <h2 className="font-bold text-sm text-stone-900">Control &amp; Forzado de Turno</h2>
              <p className="text-stone-500">
                Opciones avanzadas exclusivas del Administrador para forzar cierre o reabrir el turno.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {!turnoCerrado ? (
              <button
                onClick={() => {
                  forzarCierreTurno();
                }}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-center"
              >
                ⚠️ Forzar Cierre de Turno
              </button>
            ) : (
              <button
                onClick={() => {
                  reabrirTurno();
                }}
                className="w-full py-3 px-4 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-center"
              >
                🔓 Reabrir Turno
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    '⚠️ ¿Estás seguro de que deseás LIMPIAR TODOS LOS DATOS del turno actual?\n\nEsta acción reiniciará a cero todos los conteos de productos cargados y el cierre de caja de este turno para comenzar de nuevo si fuese necesario.'
                  )
                ) {
                  const res = reiniciarDatosTurnoActual();
                  setCleanTurnoMsg(res.motivo || '✓ Datos del turno actual reiniciados a cero.');
                  setTimeout(() => setCleanTurnoMsg(null), 5000);
                }
              }}
              className="w-full py-3 px-4 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-center flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpiar datos de todo el turno</span>
            </button>
          </div>

          {cleanTurnoMsg && (
            <p className="text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 mt-2">
              {cleanTurnoMsg}
            </p>
          )}
        </div>
      )}

      {/* ADMIN BLOCK 3: RECLAMOS ACTIVOS */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-stone-700" />
              <h2 className="font-bold text-sm text-stone-900">Reclamos Activos del Turno</h2>
            </div>
            {Object.keys(reclamos).length > 0 && (
              <button
                type="button"
                disabled={isReleasingClaims}
                onClick={async () => {
                  setIsReleasingClaims(true);
                  try {
                    const res = await liberarTodosLosReclamos();
                    setReclamosMsg(`✓ Todos los reclamos fueron liberados exitosamente (${res.count} categorías).`);
                    setTimeout(() => setReclamosMsg(null), 4000);
                  } finally {
                    setIsReleasingClaims(false);
                  }
                }}
                className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg cursor-pointer transition-colors border border-amber-300 disabled:opacity-50"
              >
                {isReleasingClaims ? 'Liberando...' : 'Liberar todos'}
              </button>
            )}
          </div>

          {reclamosMsg && (
            <p className="p-2 bg-emerald-50 text-emerald-900 font-bold rounded-xl border border-emerald-200 animate-fadeIn">
              {reclamosMsg}
            </p>
          )}

          <div className="space-y-2">
            {Object.keys(reclamos).length === 0 ? (
              <p className="text-stone-400 py-3 text-center">No hay categorías tomadas en este momento. Todas las categorías están libres para contar.</p>
            ) : (
              Object.entries(reclamos).map(([catId, r]) => {
                const cat = catalogo.find((c) => c.id === catId);
                const nombreCat = cat ? cat.nombre : catId === 'caja' ? 'Cierre de Caja' : catId;

                return (
                  <div key={catId} className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-bold text-stone-900">{nombreCat}</span>
                      <span className="text-stone-500 ml-2">
                        Tomada por <strong>{r.empleado}</strong> ({r.hora}) · {r.terminado ? 'Terminada' : 'En curso'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isReleasingClaims}
                      onClick={async () => {
                        setIsReleasingClaims(true);
                        try {
                          const res = await liberarCategoria(catId);
                          if (res.ok) {
                            setReclamosMsg(`✓ Categoría "${nombreCat}" liberada con éxito.`);
                          } else {
                            setReclamosMsg(`⚠️ ${res.motivo || 'No se pudo liberar'}`);
                          }
                          setTimeout(() => setReclamosMsg(null), 4000);
                        } finally {
                          setIsReleasingClaims(false);
                        }
                      }}
                      className="px-3 py-1 bg-white hover:bg-stone-200 border border-stone-300 rounded-lg font-bold text-stone-700 cursor-pointer disabled:opacity-50"
                    >
                      Liberar
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* BLOCK 4: ACTUALIZACIÓN AUTOMÁTICA DATALIVE (1 CLIC PARA TODOS, CONFIGURACIÓN SOLO DUEÑO) */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 text-[#1B5E38] ${isSyncing ? 'animate-spin' : ''}`} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-sm text-stone-900">Sincronización de Stock con Datalive</h2>
                {serverDlConfigured || dlUsuario || dlScriptUrl ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ✓ Servidor Conectado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    ⚠️ Pendiente de configurar por Dueño
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Consulta el stock oficial del sistema Datalive del local y lo sincroniza de inmediato.
              </p>
            </div>
          </div>

          {/* Setting button visible ONLY to Admin/Owner */}
          {esAdmin && (
            <button
              type="button"
              onClick={() => setShowDataliveConfig(!showDataliveConfig)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                showDataliveConfig
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showDataliveConfig ? 'Ocultar Credenciales' : '⚙️ Configurar Acceso (Dueño)'}</span>
            </button>
          )}
        </div>

        {/* Datalive Credentials Configuration Form (ONLY ADMIN) */}
        {esAdmin && showDataliveConfig && (
          <form onSubmit={handleGuardarConfigDatalive} className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 font-bold text-emerald-950">
              <Database className="w-4 h-4 text-emerald-800" />
              <span>Credenciales Maestras de Datalive (Guardadas en Servidor)</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Ingresá tu usuario y contraseña de Datalive una sola vez. Quedan guardadas permanentemente en el servidor para que <strong>todos los colaboradores</strong> puedan actualizar el stock con 1 toque sin tener acceso a tus contraseñas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Usuario Datalive (DL_USUARIO)
                </label>
                <input
                  type="text"
                  value={dlUsuario}
                  onChange={(e) => setDlUsuario(e.target.value)}
                  placeholder="Tu usuario en Datalive"
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Contraseña Datalive (DL_PASSWORD)
                </label>
                <input
                  type="password"
                  value={dlClave}
                  onChange={(e) => setDlClave(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Token Datalive (DL_TOKEN · Opcional)
                </label>
                <input
                  type="text"
                  value={dlToken}
                  onChange={(e) => setDlToken(e.target.value)}
                  placeholder="Dejar vacío si no usás token"
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs font-mono text-[11px] focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  URL Web App Google Script (Opcional)
                </label>
                <input
                  type="text"
                  value={dlScriptUrl}
                  onChange={(e) => setDlScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs font-mono text-[11px] focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                className="px-4 py-2 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Guardar en Servidor y Conectar</span>
              </button>

              {dlConfigMsg && (
                <span className="text-emerald-800 font-bold text-xs">{dlConfigMsg}</span>
              )}
            </div>
          </form>
        )}

        {/* 1-Tap Sync Button for Everyone (Employees & Owner) */}
        <button
          onClick={handleForzarStock}
          disabled={isSyncing}
          className="w-full py-3.5 px-4 bg-[#1B5E38] hover:bg-[#14472B] disabled:opacity-75 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Conectando con Datalive...' : '⚡ Actualizar stock desde Datalive ahora'}</span>
        </button>

        <p className="text-[11px] text-stone-500 text-center">
          {esAdmin
            ? 'Cualquier colaborador puede pulsar este botón. El servidor utiliza las credenciales que configuraste sin exponerlas.'
            : 'Podés sincronizar el stock del sistema en cualquier momento con este botón. No necesitás ingresar ninguna clave.'}
        </p>

        {syncResultMsg && (
          <p className="text-xs font-semibold text-emerald-900 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 animate-fadeIn">
            {syncResultMsg}
          </p>
        )}
      </div>

      {/* BLOCK 5: CATALOGO Y AGREGAR PRODUCTOS (SOLO ADMINS) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-4 text-xs">
          <h2 className="font-bold text-sm text-stone-900 pb-2 border-b border-stone-100">
            Catálogo de Categorías &amp; Productos
          </h2>

          <div className="space-y-4">
            {catalogo.map((cat) => (
              <div key={cat.id} className="border border-stone-200 rounded-xl p-3.5 bg-stone-50/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-stone-900 text-sm">{cat.nombre}</span>
                  <span className="text-[11px] text-stone-500">{cat.ubicaciones.join(' · ')}</span>
                </div>

                <div className="space-y-1 mb-3">
                  {cat.grupos.flatMap((g) => g.productos).map((p) => (
                    <div key={p.nombre} className="py-1 px-2 bg-white rounded border border-stone-200/80 flex justify-between text-[11px]">
                      <span className="font-semibold text-stone-800">{p.nombre}</span>
                      <span className="text-stone-400 font-mono-num">{p.codigo ? `Cod: ${p.codigo}` : 'Sin código'}</span>
                    </div>
                  ))}
                </div>

                {/* Add product to category */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nuevo producto"
                    value={newProdNames[cat.id] || ''}
                    onChange={(e) =>
                      setNewProdNames({ ...newProdNames, [cat.id]: e.target.value })
                    }
                    className="flex-1 p-1.5 bg-white border border-stone-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Código Datalive"
                    value={newProdCodes[cat.id] || ''}
                    onChange={(e) =>
                      setNewProdCodes({ ...newProdCodes, [cat.id]: e.target.value })
                    }
                    className="w-28 p-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newProdNames[cat.id];
                      if (name) {
                        agregarProducto(cat.id, name, newProdCodes[cat.id]);
                        setNewProdNames({ ...newProdNames, [cat.id]: '' });
                        setNewProdCodes({ ...newProdCodes, [cat.id]: '' });
                      }
                    }}
                    className="px-3 py-1.5 bg-stone-900 text-white rounded-lg font-bold cursor-pointer hover:bg-stone-800"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Create new category */}
          <div className="pt-3 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
              Crear Nueva Categoría
            </label>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Nombre categoría (ej: Postres Helados)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold"
              />
              <input
                type="text"
                placeholder="Ubicaciones separadas por coma"
                value={newCatUbic}
                onChange={(e) => setNewCatUbic(e.target.value)}
                className="flex-1 p-2 bg-stone-50 border border-stone-300 rounded-xl"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCatName.trim()) {
                    crearCategoria(newCatName, newCatUbic.split(','));
                    setNewCatName('');
                  }
                }}
                className="px-4 py-2 bg-[#1B5E38] text-white font-bold rounded-xl cursor-pointer hover:bg-[#14472B]"
              >
                Crear Categoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLOCK 6: IMPORTAR STOCK DE DATALIVE PEGAR COLUMNAS (SOLO ADMINS) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs space-y-3 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
            <FileSpreadsheet className="w-5 h-5 text-[#1B5E38]" />
            <div>
              <h2 className="font-bold text-sm text-stone-900">Importar Stock del Sistema (Datalive)</h2>
              <p className="text-stone-500">
                Copiá del Excel exportado de Datalive las columnas <strong>Código, Producto, Stock</strong> y pegalas acá.
              </p>
            </div>
          </div>

          <textarea
            rows={4}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`10967\tBONDIOLA\t222\n11472\tCAPRESSE\t180\n10957\tCARNE CUCHILLO\t423`}
            className="w-full p-3 font-mono-num bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:bg-white"
          />

          <button
            onClick={handleImportDatalive}
            disabled={!importText.trim()}
            className="px-5 py-2.5 bg-[#1B5E38] hover:bg-[#14472B] disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
          >
            Procesar e Importar Filas
          </button>

          {importResultMsg && (
            <p className="p-2.5 bg-emerald-50 text-emerald-900 font-bold rounded-xl border border-emerald-200">
              {importResultMsg}
            </p>
          )}
        </div>
      )}

      {/* MENSAJE SIMPLIFICADO PARA COLABORADORES */}
      {!esAdmin && (
        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-center text-xs space-y-1">
          <p className="font-bold text-emerald-950">
            ✓ Módulo de Stock Conectado
          </p>
          <p className="text-[11px] text-stone-600">
            Como colaborador tenés habilitada la actualización instantánea de stock con el botón superior. La edición de catálogo y configuraciones maestras se gestionan desde los perfiles administradores.
          </p>
        </div>
      )}

    </div>
  );
};
