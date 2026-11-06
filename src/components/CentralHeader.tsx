import React, { useState } from 'react';
import { useCentral } from '../context/CentralContext';
import { CentralLogo } from './CentralLogo';
import { ShareAppModal } from './ShareAppModal';
import { fmtFechaLarga, fmtDateLabel, isAdminUser } from '../utils/centralHelpers';
import { 
  ClipboardCheck, 
  DollarSign, 
  BarChart3, 
  PackageSearch, 
  LogOut, 
  User, 
  Clock,
  Smartphone,
  Share2,
  TrendingUp,
  Sun
} from 'lucide-react';

export const CentralHeader: React.FC = () => {
  const {
    currentEmpleado,
    currentTurno,
    cambiarTurnoActual,
    currentFecha,
    horaInicio,
    logout,
    activeTab,
    setActiveTab,
    turnoCerrado,
    turnoAbierto,
    aperturaInfo,
    setIsAperturaModalOpen,
  } = useCentral();

  const [showShareModal, setShowShareModal] = useState(false);

  const isOwnerOrAdmin = isAdminUser(currentEmpleado);
  const isOwner = Boolean(
    ['charly', 'carlos', 'luis'].includes(currentEmpleado?.nombre.toLowerCase() || '')
  );

  return (
    <header className="sticky top-0 z-30 bg-[#123D26] text-white shadow-md border-b border-emerald-950/60 w-full max-w-full overflow-x-clip">
      
      {/* Top Main Bar: Single unified bar with generous spacing, no cluttered second row */}
      <div className="max-w-4xl mx-auto px-3.5 sm:px-5 py-2.5 sm:py-3.5">
        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          
          {/* Brand lockup & Employee info (Single logo, clear text, no truncation) */}
          <div className="flex items-center gap-2.5 min-w-0">
            <CentralLogo size={36} className="shrink-0" />
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <span className="text-sm sm:text-base font-extrabold text-white tracking-tight whitespace-nowrap leading-tight">
                  Central Escobar
                </span>
                {isOwnerOrAdmin && (
                  <span className="text-[9px] bg-amber-400 text-stone-950 font-black px-1.5 py-0.2 rounded shrink-0 hidden sm:inline-block">
                    {isOwner ? '👑 DUEÑO' : '🛠️ SOPORTE TÉCNICO'}
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs text-emerald-200/90 font-medium whitespace-nowrap mt-0.5 flex items-center gap-1.5">
                <span className="text-white font-semibold flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-300 shrink-0" />
                  {currentEmpleado?.nombre || 'Empleado'}
                </span>
                <span className="text-emerald-400/60">·</span>
                <button
                  type="button"
                  onClick={() => cambiarTurnoActual(currentTurno === 'Mañana' ? 'Tarde' : 'Mañana')}
                  className="hover:underline cursor-pointer font-bold text-emerald-100 flex items-center gap-1"
                  title="Toca para cambiar de turno"
                >
                  <span>Turno {currentTurno}</span>
                  <span className="text-[9px] opacity-70">⇄</span>
                </button>
              </div>
            </div>
          </div>

          {/* User actions: Turno, Celular & Salir (Spacious, clean, never crowded) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Direct Switchable Turno Button */}
            <button
              onClick={() => {
                const nuevo = currentTurno === 'Mañana' ? 'Tarde' : 'Mañana';
                cambiarTurnoActual(nuevo);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-900/90 hover:bg-emerald-800 text-emerald-100 text-[11px] font-bold flex items-center gap-1.5 border border-emerald-600/70 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
              title={`Turno actual: ${currentTurno}. Toca para cambiar a Turno ${currentTurno === 'Mañana' ? 'Tarde' : 'Mañana'}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${currentTurno === 'Tarde' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>{currentTurno}</span>
              <span className="text-[9px] text-emerald-300 font-normal">⇄</span>
            </button>

            {/* Guía Celular / PWA button */}
            <button
              onClick={() => setShowShareModal(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-emerald-800/50 transition cursor-pointer shrink-0"
              title="Instalar en celular / Compartir app"
              aria-label="Instalar en celular o compartir"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-300" />
              <span className="hidden md:inline">Celular</span>
            </button>

            {/* Salir / Cambiar usuario button (Clearly visible, prominent rose styling, never off-screen) */}
            <button
              onClick={logout}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-100 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-rose-500/60 transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
              title="Cambiar de empleado o cerrar sesión"
              aria-label="Cambiar de empleado o cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-300" />
              <span>Salir</span>
            </button>
          </div>

        </div>
      </div>

      <ShareAppModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />

      {/* Tabs Bar */}
      <div className="bg-[#0D2F1D] border-t border-emerald-900/60" translate="no">
        <nav 
          className={`max-w-4xl mx-auto px-1 notranslate ${
            currentTurno === 'Mañana'
              ? (isOwnerOrAdmin ? 'grid grid-cols-6' : 'grid grid-cols-3')
              : (isOwnerOrAdmin ? 'grid grid-cols-5' : 'grid grid-cols-2')
          }`} 
          translate="no"
        >
              {/* Bloque Apertura: Exclusivo del Turno Mañana */}
              {currentTurno === 'Mañana' && (
                <button
                  onClick={() => setActiveTab('apertura')}
                  translate="no"
                  className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer border-b-2 notranslate ${
                    activeTab === 'apertura'
                      ? 'border-amber-400 text-amber-200 bg-emerald-800/40'
                      : 'border-transparent text-emerald-200/90 hover:text-white hover:bg-emerald-800/15'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-300" />
                  <span translate="no" className="notranslate truncate">Apertura</span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('contar')}
                translate="no"
                className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer border-b-2 notranslate ${
                  activeTab === 'contar'
                    ? 'border-emerald-400 text-white bg-emerald-800/30'
                    : 'border-transparent text-emerald-300/80 hover:text-white hover:bg-emerald-800/15'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span translate="no" className="notranslate font-semibold truncate">Contar</span>
              </button>

              <button
                onClick={() => setActiveTab('caja')}
                translate="no"
                className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer border-b-2 notranslate ${
                  activeTab === 'caja'
                    ? 'border-emerald-400 text-white bg-emerald-800/30'
                    : 'border-transparent text-emerald-300/80 hover:text-white hover:bg-emerald-800/15'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span translate="no" className="notranslate font-semibold truncate">Caja</span>
              </button>

              {isOwnerOrAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('reporte')}
                    translate="no"
                    className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer border-b-2 notranslate ${
                      activeTab === 'reporte'
                        ? 'border-emerald-400 text-white bg-emerald-800/30'
                        : 'border-transparent text-emerald-300/80 hover:text-white hover:bg-emerald-800/15'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span translate="no" className="notranslate font-semibold truncate">Reporte</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('productos')}
                    translate="no"
                    className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer border-b-2 notranslate ${
                      activeTab === 'productos'
                        ? 'border-emerald-400 text-white bg-emerald-800/30'
                        : 'border-transparent text-emerald-300/80 hover:text-white hover:bg-emerald-800/15'
                    }`}
                  >
                    <PackageSearch className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span translate="no" className="notranslate font-semibold truncate">Productos</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('gerencia')}
                    translate="no"
                    className={`py-2 sm:py-2.5 px-0.5 sm:px-2 text-[10px] sm:text-xs md:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 transition-all cursor-pointer border-b-2 notranslate ${
                      activeTab === 'gerencia'
                        ? 'border-amber-400 text-amber-200 bg-emerald-800/40'
                        : 'border-transparent text-amber-300/80 hover:text-amber-100 hover:bg-emerald-800/20'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
                    <span translate="no" className="notranslate truncate">Fábrica</span>
                  </button>
                </>
              )}

            </nav>
      </div>

    </header>
  );
};
