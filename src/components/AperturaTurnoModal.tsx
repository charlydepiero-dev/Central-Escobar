import React, { useState, useEffect } from 'react';
import { useCentral } from '../context/CentralContext';
import { fmtMoney, fmtSignedMoney } from '../utils/centralHelpers';
import { 
  Sun, 
  Moon, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  PackageCheck,
  ChevronDown,
  ChevronUp,
  UserCheck
} from 'lucide-react';

export const AperturaTurnoModal: React.FC = () => {
  const {
    currentEmpleado,
    currentFecha,
    currentTurno,
    turnoAbierto,
    ultimoTurnoCerrado,
    ultimoTurnoNoche,
    efectivoNocheEsperado,
    isAperturaModalOpen,
    setIsAperturaModalOpen,
    abrirTurno,
    catalogo,
    sistemaStock,
  } = useCentral();

  const [turnoSel, setTurnoSel] = useState<'Mañana' | 'Tarde'>(currentTurno);
  const [fechaSel, setFechaSel] = useState<string>(currentFecha);
  const [efectivoRealInput, setEfectivoRealInput] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [showStockPreview, setShowStockPreview] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determinar el efectivo esperado del último cierre nocturno
  const efectivoAnteriorEsperado = efectivoNocheEsperado;

  useEffect(() => {
    if (isAperturaModalOpen) {
      setTurnoSel(currentTurno);
      setFechaSel(currentFecha);
      setEfectivoRealInput(efectivoAnteriorEsperado.toString());
      setObservaciones('');
      setErrorMsg(null);
    }
  }, [isAperturaModalOpen]);

  // El turno tarde no realiza apertura de turno (solo corresponde al Turno Mañana)
  if (!isAperturaModalOpen || currentTurno === 'Tarde') return null;

  const efRealNum = parseFloat(efectivoRealInput) || 0;
  const diferencia = efRealNum - efectivoAnteriorEsperado;

  const handleConfirmarApertura = async () => {
    if (!currentEmpleado) {
      setErrorMsg('Debés iniciar sesión con tu PIN para abrir el turno.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await abrirTurno({
        fecha: fechaSel,
        turno: turnoSel,
        efectivoConvalidado: efRealNum,
        efectivoAnteriorEsperado,
        observaciones,
      });

      if (res.ok) {
        setIsAperturaModalOpen(false);
      } else {
        setErrorMsg(res.error || 'No se pudo registrar la apertura de turno.');
      }
    } catch {
      setErrorMsg('Error de conexión al abrir el turno.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#123D26] to-[#1C5D3A] text-white p-5 sm:p-6 relative">
          <button
            onClick={() => setIsAperturaModalOpen(false)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <span className="p-2 bg-emerald-400/20 text-emerald-300 rounded-xl border border-emerald-400/30">
              <Sun className="w-5 h-5" />
            </span>
            <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-300">
              Control Operativo Escobar
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Apertura de Turno
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1">
            Convalidación de caja anterior y habilitación de conteos para el nuevo turno.
          </p>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Turno y Empleado Activo */}
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-semibold flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                Responsable de Apertura:
              </span>
              <span className="font-extrabold text-[#123D26] bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                {currentEmpleado?.nombre || 'Colaborador'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200">
              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">
                  Fecha del Turno
                </label>
                <input
                  type="date"
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-500 mb-1">
                  Turno
                </label>
                <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-stone-300">
                  <button
                    type="button"
                    onClick={() => setTurnoSel('Mañana')}
                    className={`py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      turnoSel === 'Mañana'
                        ? 'bg-[#123D26] text-white shadow-2xs'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <Sun className="w-3 h-3" />
                    Mañana
                  </button>
                  <button
                    type="button"
                    onClick={() => setTurnoSel('Tarde')}
                    className={`py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      turnoSel === 'Tarde'
                        ? 'bg-[#123D26] text-white shadow-2xs'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <Moon className="w-3 h-3" />
                    Tarde
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bloque: Convalidación de Caja Anterior (Punto 3) */}
          <div className="bg-emerald-50/60 p-4 sm:p-5 rounded-2xl border border-emerald-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#123D26]">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              <span>Convalidación de Caja Anterior</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-emerald-200/80 flex items-center justify-between text-xs">
              <span className="text-stone-600 font-medium">
                Efectivo de cierre noche anterior ({ultimoTurnoNoche ? `${ultimoTurnoNoche.turno} ${ultimoTurnoNoche.fecha}` : ultimoTurnoCerrado ? `${ultimoTurnoCerrado.turno} ${ultimoTurnoCerrado.fecha}` : 'esperado'}):
              </span>
              <span className="font-mono-num font-black text-sm text-[#123D26]">
                {fmtMoney(efectivoAnteriorEsperado)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Efectivo real en cajón al recibir la apertura ($):
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-stone-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={efectivoRealInput}
                  onChange={(e) => setEfectivoRealInput(e.target.value)}
                  placeholder="0"
                  className="w-full pl-8 pr-4 py-2.5 bg-white border border-emerald-300 rounded-xl text-sm sm:text-base font-black font-mono-num text-stone-900 focus:outline-emerald-700 shadow-2xs"
                />
              </div>
            </div>

            {/* Diferencia en apertura */}
            <div className="flex items-center justify-between px-2 pt-1 text-xs">
              <span className="text-stone-500 font-medium">Diferencia de apertura:</span>
              <span
                className={`font-mono-num font-extrabold ${
                  diferencia === 0
                    ? 'text-emerald-700'
                    : diferencia > 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {diferencia === 0 ? '✓ Exacta ($ 0)' : fmtSignedMoney(diferencia)}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">
                Observaciones / Novedades de Caja (Opcional):
              </label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Se recibió $84.600 en billetes chicos y cambio..."
                className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:outline-emerald-600"
              />
            </div>
          </div>

          {/* Bloque: Convalidación de Stock Inicial (Punto 3) */}
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
            <button
              type="button"
              onClick={() => setShowStockPreview(!showStockPreview)}
              className="w-full flex items-center justify-between text-xs font-bold text-stone-700 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-stone-800">
                <PackageCheck className="w-4 h-4 text-emerald-700" />
                <span>Revisar Stock Inicial del Turno Anterior</span>
              </span>
              <span className="text-stone-400 flex items-center gap-1">
                <span className="text-[11px]">{showStockPreview ? 'Ocultar' : 'Ver detalle'}</span>
                {showStockPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            <p className="text-[11px] text-stone-500 leading-relaxed">
              En este turno, <strong>todos los casilleros de conteo arrancan en 0</strong> para que los empleados registren limpiamente el stock actual sin arrastrar conteos anteriores.
            </p>

            {showStockPreview && (
              <div className="pt-2 border-t border-stone-200 max-h-48 overflow-y-auto space-y-1.5 text-xs">
                {catalogo.map((cat) => (
                  <div key={cat.id} className="bg-white p-2 rounded-lg border border-stone-200/80">
                    <span className="font-extrabold text-stone-700 block mb-1">
                      {cat.nombre}
                    </span>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-stone-600 font-mono-num">
                      {cat.grupos.flatMap((g) => g.productos).map((p) => {
                        const pid = `c-${p.codigo}`;
                        const sys = sistemaStock[pid]?.stock ?? 0;
                        return (
                          <div key={p.codigo} className="truncate flex justify-between pr-2">
                            <span className="truncate">{p.nombre}:</span>
                            <span className="font-bold text-stone-900">{sys} u.</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Al confirmar, el turno quedará formalmente abierto para todos los empleados en sus celulares, liberando todas las categorías para su conteo.
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setIsAperturaModalOpen(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-white border border-stone-300 hover:bg-stone-100 rounded-xl cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmarApertura}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-black text-white bg-[#123D26] hover:bg-[#1A5736] rounded-xl cursor-pointer transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span>Abriendo turno...</span>
            ) : (
              <>
                <Sun className="w-4 h-4" />
                <span>Confirmar y Comenzar Turno</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
