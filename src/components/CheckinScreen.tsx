import React, { useState, useEffect } from 'react';
import { useCentral } from '../context/CentralContext';
import { CentralLogo } from './CentralLogo';
import { ShareAppModal } from './ShareAppModal';
import { fmtFechaLarga, fmtHora, suggestedTurnoForNow } from '../utils/centralHelpers';
import { Delete, Check, Smartphone, ArrowLeft, ShieldCheck, Lock, Users, AlertTriangle, KeyRound } from 'lucide-react';
import { Empleado } from '../types/central';

const MAX_INTENTOS = 3;
const LOCKOUT_SECONDS = 60;

export const CheckinScreen: React.FC = () => {
  const { loginWithPin, empleados, pastTurnos } = useCentral();
  
  // Current time & active turno sugerido según franja horaria y cierres del día
  const [clock, setClock] = useState(() => `${fmtFechaLarga()} · ${fmtHora()}`);
  const [turno, setTurno] = useState<'Mañana' | 'Tarde'>(() => suggestedTurnoForNow(pastTurnos));

  // Selected employee in Step 1
  const [selectedEmp, setSelectedEmp] = useState<Empleado | null>(null);

  // Secret PIN in Step 2
  const [pin, setPin] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Security Lockout State (3 failed attempts -> 60s cooldown)
  const [intentosFallidos, setIntentosFallidos] = useState<Record<string, number>>({});
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  // Admin access modal for hidden 'Admin' user
  const [showAdminDirect, setShowAdminDirect] = useState(false);
  const [adminDirectPin, setAdminDirectPin] = useState('');
  const [adminDirectError, setAdminDirectError] = useState<string | null>(null);
  const [isPermLocked, setIsPermLocked] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(`${fmtFechaLarga()} · ${fmtHora()}`);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!selectedEmp) {
      setLockoutRemaining(0);
      return;
    }

    const checkLockout = () => {
      try {
        const stored = sessionStorage.getItem(`central_lockout_${selectedEmp.nombre.toLowerCase()}`);
        if (stored) {
          const until = parseInt(stored, 10);
          const remainingSecs = Math.ceil((until - Date.now()) / 1000);
          if (remainingSecs > 0) {
            setLockoutRemaining(remainingSecs);
          } else {
            setLockoutRemaining(0);
            sessionStorage.removeItem(`central_lockout_${selectedEmp.nombre.toLowerCase()}`);
            setIntentosFallidos((prev) => ({ ...prev, [selectedEmp.nombre.toLowerCase()]: 0 }));
          }
        } else {
          setLockoutRemaining(0);
        }
      } catch {
        setLockoutRemaining(0);
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, [selectedEmp]);

  // Unified single list "Equipo de trabajo":
  // Staff first: Tiara, Mai, Fati, Axel, Vero, Yamil
  // Charly & Luis at the end of the queue
  // Admin is strictly HIDDEN from the list
  const visibleEmployees = empleados.filter((e) => {
    if (!e.activo || e.oculto) return false;
    if (e.nombre.toLowerCase() === 'admin') return false;
    return true;
  });

  const staff = visibleEmployees.filter(
    (e) => !['charly', 'luis', 'carlos'].includes(e.nombre.toLowerCase()) && e.rol !== 'admin'
  );
  const cola = visibleEmployees.filter(
    (e) => ['charly', 'luis', 'carlos'].includes(e.nombre.toLowerCase()) || e.rol === 'admin'
  );

  const equipoDeTrabajo = [...staff, ...cola];

  const handleSelectEmployee = (emp: Empleado) => {
    setSelectedEmp(emp);
    setPin('');
    setErrorMessage(null);
    setIsSuccess(false);

    if (emp.bloqueado) {
      setIsPermLocked(true);
      setLockoutRemaining(0);
      return;
    }
    setIsPermLocked(false);

    // Check if currently locked out (timed lockout for regular staff)
    try {
      const stored = sessionStorage.getItem(`central_lockout_${emp.nombre.toLowerCase()}`);
      if (stored) {
        const until = parseInt(stored, 10);
        const rem = Math.ceil((until - Date.now()) / 1000);
        if (rem > 0) setLockoutRemaining(rem);
      }
    } catch {
      // ignore
    }
  };

  const handleBackToSelect = () => {
    setSelectedEmp(null);
    setPin('');
    setErrorMessage(null);
    setIsSuccess(false);
    setIsPermLocked(false);
  };

  const handleDigit = (digit: string) => {
    if (isPermLocked || selectedEmp?.bloqueado || lockoutRemaining > 0 || pin.length >= 4 || isValidating || isSuccess) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMessage(null);

    if (nextPin.length === 4 && selectedEmp) {
      performLogin(nextPin, selectedEmp);
    }
  };

  const handleClear = () => {
    if (isPermLocked || selectedEmp?.bloqueado || lockoutRemaining > 0 || isValidating || isSuccess) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleReset = () => {
    if (isPermLocked || selectedEmp?.bloqueado || lockoutRemaining > 0 || isValidating || isSuccess) return;
    setPin('');
    setErrorMessage(null);
  };

  const performLogin = async (pinToCheck: string, targetEmp: Empleado) => {
    if (isPermLocked || targetEmp.bloqueado || lockoutRemaining > 0) return;

    setIsValidating(true);
    setErrorMessage(null);

    const empKey = targetEmp.nombre.toLowerCase();
    const isOwnerOrAdmin = targetEmp.rol === 'admin' || ['charly', 'luis', 'carlos'].includes(empKey);

    try {
      const res = await loginWithPin(pinToCheck, turno, targetEmp.nombre);
      if (res.ok) {
        setIsSuccess(true);
        // Reset failed attempts on success
        setIntentosFallidos((prev) => ({ ...prev, [empKey]: 0 }));
        sessionStorage.removeItem(`central_lockout_${empKey}`);
      } else {
        const newFails = (intentosFallidos[empKey] || 0) + 1;
        setIntentosFallidos((prev) => ({ ...prev, [empKey]: newFails }));

        if (newFails >= MAX_INTENTOS) {
          if (isOwnerOrAdmin) {
            // Charly & Luis have NO timer count. They stay PERMANENTLY locked until unlocked by Admin or another admin
            setIsPermLocked(true);
            setLockoutRemaining(0);
            targetEmp.bloqueado = true;
            try {
              await fetch('/api/auth/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: targetEmp.nombre }),
              });
            } catch {
              // ignore
            }
            setIsShaking(true);
            setErrorMessage(`🔒 Usuario bloqueado por seguridad: 3 intentos fallidos. Requiere desbloqueo de otro Administrador.`);
            setTimeout(() => {
              setIsShaking(false);
              setPin('');
              setIsValidating(false);
            }, 700);
          } else {
            // Regular employees have a 60s timed lockout
            const lockoutUntil = Date.now() + LOCKOUT_SECONDS * 1000;
            try {
              sessionStorage.setItem(`central_lockout_${empKey}`, String(lockoutUntil));
            } catch {
              // ignore
            }
            setLockoutRemaining(LOCKOUT_SECONDS);
            setIsShaking(true);
            setErrorMessage(`🔒 Bloqueo de seguridad: Has superado los 3 intentos fallidos.`);
            setTimeout(() => {
              setIsShaking(false);
              setPin('');
              setIsValidating(false);
            }, 700);
          }
        } else {
          const restantes = MAX_INTENTOS - newFails;
          setIsShaking(true);
          setErrorMessage(
            restantes === 1
              ? `⚠️ PIN incorrecto para ${targetEmp.nombre}. ¡Último intento antes del bloqueo!`
              : `PIN incorrecto para ${targetEmp.nombre} (${newFails} de ${MAX_INTENTOS} intentos).`
          );
          setTimeout(() => {
            setIsShaking(false);
            setPin('');
            setIsValidating(false);
          }, 700);
        }
      }
    } catch {
      setIsShaking(true);
      setErrorMessage(`Error al verificar credenciales de ${targetEmp.nombre}.`);
      setTimeout(() => {
        setIsShaking(false);
        setPin('');
        setIsValidating(false);
      }, 700);
    }
  };

  const handleLoginAdminOculto = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminDirectError(null);
    const adminObj = empleados.find((emp) => emp.nombre.toLowerCase() === 'admin');
    if (!adminObj) {
      setAdminDirectError('Usuario Admin no encontrado.');
      return;
    }
    const res = await loginWithPin(adminDirectPin, turno, 'Admin');
    if (res.ok) {
      setShowAdminDirect(false);
    } else {
      setAdminDirectError(res.error || 'PIN de Admin incorrecto.');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!selectedEmp) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleClear();
      } else if (e.key === 'Escape') {
        handleBackToSelect();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, turno, selectedEmp, isValidating, isSuccess, lockoutRemaining]);

  return (
    <div className="min-h-screen bg-[#123D26] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-[420px] w-full shadow-2xl border border-emerald-900/40 text-center relative transition-all">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-4">
          <CentralLogo size={68} className="mb-2" />
          <h1 className="text-xl font-extrabold text-[#123D26] tracking-tight">
            Central · Sede Escobar
          </h1>
          <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-widest mt-0.5">
            Control de Stock &amp; Cierre de Caja
          </p>
          <div className="text-[11px] text-stone-500 mt-1 capitalize font-medium">
            {clock}
          </div>
        </div>

        {/* Turno Selector Switch */}
        <div className="mb-4 bg-stone-100 p-1 rounded-2xl flex items-center border border-stone-200">
          <button
            type="button"
            onClick={() => {
              setTurno('Mañana');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              turno === 'Mañana'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>☀️</span>
            <span>Turno Mañana</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTurno('Tarde');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              turno === 'Tarde'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>🌙</span>
            <span>Turno Tarde</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* PASO 1: LISTA ÚNICA "EQUIPO DE TRABAJO" (CHARLY Y LUIS AL FINAL) */}
        {/* ======================================================== */}
        {!selectedEmp ? (
          <div className="space-y-3.5 animate-fadeIn">
            <div className="text-left border-b border-stone-100 pb-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#1B5E38]" />
                <span className="text-xs font-extrabold text-[#123D26] uppercase tracking-wider block">
                  Equipo de trabajo
                </span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Seleccioná tu nombre para ingresar tu PIN confidencial.
              </p>
            </div>

            {/* Grid unificado de colaboradores: sin insignias de Dueño ni coronas para máxima discreción */}
            <div className="grid grid-cols-2 gap-2 text-left">
              {equipoDeTrabajo.map((emp) => {
                const initial = emp.nombre.charAt(0).toUpperCase();
                return (
                  <button
                    key={emp.nombre}
                    type="button"
                    onClick={() => handleSelectEmployee(emp)}
                    className="p-3 bg-stone-50 hover:bg-emerald-50 active:bg-emerald-100 border border-stone-200/90 hover:border-emerald-300 rounded-2xl flex items-center gap-2.5 transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#1B5E38] text-white font-extrabold flex items-center justify-center text-sm shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
                      {initial}
                    </div>
                    <div className="overflow-hidden">
                      <span className="font-bold text-sm text-stone-900 block truncate">
                        {emp.nombre}
                      </span>
                      <span className="text-[10px] text-stone-500 block">
                        Colaborador
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Aviso de confidencialidad y bloqueo */}
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-left flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
              <p className="text-[11px] text-stone-600 leading-tight">
                <strong>Seguridad:</strong> Bloqueo automático tras 3 intentos fallidos. Tu PIN es confidencial y personal.
              </p>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* PASO 2: INGRESO DE PIN CON BLOQUEO A LOS 3 INTENTOS     */
          /* ======================================================== */
          <div className="space-y-4 animate-fadeIn">
            {/* Cabecera del colaborador seleccionado */}
            <div className="flex items-center justify-between bg-emerald-50/90 border border-emerald-200/90 rounded-2xl p-2.5 text-left">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1B5E38] text-white font-extrabold flex items-center justify-center text-sm shadow-2xs">
                  {selectedEmp.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-stone-900">
                    {selectedEmp.nombre}
                  </div>
                  <span className="text-[11px] text-emerald-800 font-semibold">
                    Turno {turno}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBackToSelect}
                className="px-2 py-1 rounded-xl bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold border border-stone-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Elegir otro colaborador"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cambiar</span>
              </button>
            </div>

            {/* Estado de Bloqueo o Instrucción */}
            {isPermLocked || selectedEmp.bloqueado ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 space-y-2 text-center animate-shake">
                <div className="flex items-center justify-center gap-1.5 font-extrabold text-xs text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                  <span>ACCESO BLOQUEADO POR SEGURIDAD</span>
                </div>
                <p className="text-xs text-rose-800 font-bold">
                  {selectedEmp.nombre} superó los 3 intentos fallidos de PIN.
                </p>
                <div className="text-[11px] text-stone-600 bg-white/80 p-2.5 rounded-xl border border-rose-200 text-left leading-relaxed">
                  Por política de seguridad este usuario administrador <strong>no tiene desbloqueo por tiempo</strong>. Debe ser desbloqueado por otro Administrador o Admin desde la sección de Productos.
                </div>
                <button
                  type="button"
                  onClick={handleBackToSelect}
                  className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer mt-1"
                >
                  ← Volver a la lista de equipo
                </button>
              </div>
            ) : lockoutRemaining > 0 ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 space-y-1.5 animate-shake">
                <div className="flex items-center justify-center gap-1.5 font-extrabold text-xs text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                  <span>ACCESO BLOQUEADO POR SEGURIDAD</span>
                </div>
                <p className="text-xs text-rose-800 font-medium">
                  Se superaron los 3 intentos fallidos para {selectedEmp.nombre}.
                </p>
                <div className="font-mono-num font-black text-2xl text-rose-600 pt-1">
                  00:{lockoutRemaining.toString().padStart(2, '0')}
                </div>
                <p className="text-[10px] text-stone-500">
                  Esperá que termine la cuenta regresiva para reintentar.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-stone-700 flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#1B5E38]" />
                  <span>Ingresá tu PIN confidencial de 4 dígitos</span>
                </p>
              </div>
            )}

            {!isPermLocked && !selectedEmp.bloqueado && (
              <>
                {/* Puntos de seguridad enmascarados */}
                <div className={`flex justify-center items-center gap-4 my-2 ${isShaking ? 'animate-shake' : ''}`}>
                  {[0, 1, 2, 3].map((idx) => {
                    const isFilled = idx < pin.length;
                    return (
                      <div
                        key={idx}
                        className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                          lockoutRemaining > 0
                            ? 'border-rose-400 bg-rose-100'
                            : isSuccess
                            ? 'bg-emerald-600 border-emerald-600 scale-125'
                            : isShaking
                            ? 'bg-rose-500 border-rose-600 scale-110'
                            : isFilled
                            ? 'bg-[#1B5E38] border-[#1B5E38] scale-115 shadow-xs'
                            : 'border-stone-300 bg-stone-50'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Mensajes de validación / intentos restantes */}
                <div className="min-h-[22px]">
                  {isSuccess ? (
                    <span className="text-xs font-extrabold text-emerald-700 flex items-center justify-center gap-1 animate-pulse">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>PIN correcto · Ingresando...</span>
                    </span>
                  ) : errorMessage && lockoutRemaining === 0 ? (
                    <span className="text-xs font-bold text-rose-600 animate-fadeIn">
                      {errorMessage}
                    </span>
                  ) : isValidating ? (
                    <span className="text-xs font-semibold text-emerald-800 animate-pulse">
                      Verificando credenciales...
                    </span>
                  ) : lockoutRemaining === 0 ? (
                    <span className="text-[11px] text-stone-400">
                      Tenés hasta 3 intentos antes del bloqueo de seguridad
                    </span>
                  ) : null}
                </div>

                {/* Teclado numérico táctil */}
                <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleDigit(num)}
                      disabled={lockoutRemaining > 0 || isValidating || isSuccess}
                      className="py-3 text-xl font-bold font-mono-num text-stone-800 bg-stone-50 hover:bg-emerald-50 active:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-200/90 rounded-2xl transition-all cursor-pointer shadow-2xs"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={lockoutRemaining > 0 || isValidating || isSuccess}
                    className="py-3 flex items-center justify-center text-stone-500 hover:text-amber-800 bg-stone-50 hover:bg-amber-50 active:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-200/90 rounded-2xl transition-all cursor-pointer"
                    title="Borrar dígito"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigit('0')}
                    disabled={lockoutRemaining > 0 || isValidating || isSuccess}
                    className="py-3 text-xl font-bold font-mono-num text-stone-800 bg-stone-50 hover:bg-emerald-50 active:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-200/90 rounded-2xl transition-all cursor-pointer shadow-2xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={lockoutRemaining > 0 || isValidating || isSuccess}
                    className="py-3 flex items-center justify-center text-stone-500 hover:text-rose-700 bg-stone-50 hover:bg-rose-50 active:bg-rose-100 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-200/90 rounded-2xl transition-all cursor-pointer font-bold text-xs"
                    title="Limpiar PIN"
                  >
                    <span>C</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer actions: Mobile link & discreet hidden Admin access */}
        <div className="mt-4 pt-3.5 border-t border-stone-100 space-y-2">
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="w-full py-2.5 px-3 bg-stone-50 hover:bg-emerald-50 text-emerald-900 border border-stone-200 hover:border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-emerald-700" />
            <span>📱 Abrir en Celular / Ver QR</span>
          </button>

          {/* Discreet Technical Admin Link */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setShowAdminDirect(true);
                setAdminDirectPin('');
                setAdminDirectError(null);
              }}
              className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
            >
              Acceso técnico soporte
            </button>
          </div>
        </div>

        <ShareAppModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />

        {/* Modal for hidden Admin user */}
        {showAdminDirect && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-xs w-full p-5 text-left border border-stone-200 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs pb-2 border-b border-stone-100">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Acceso Técnico de Soporte (Admin)</span>
              </div>
              <p className="text-[11px] text-stone-500">
                Este usuario está oculto de la lista principal de empleados. Ingresá el código de acceso maestro.
              </p>
              <form onSubmit={handleLoginAdminOculto} className="space-y-3">
                <input
                  type="password"
                  maxLength={10}
                  autoFocus
                  placeholder=""
                  value={adminDirectPin}
                  onChange={(e) => setAdminDirectPin(e.target.value)}
                  className="w-full p-2.5 border border-stone-300 rounded-xl text-center font-mono-num font-bold text-sm tracking-widest"
                />
                {adminDirectError && (
                  <p className="text-xs text-rose-600 font-bold">{adminDirectError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminDirect(false)}
                    className="flex-1 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-[#1B5E38] text-white text-xs font-bold hover:bg-[#14472B]"
                  >
                    Entrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
