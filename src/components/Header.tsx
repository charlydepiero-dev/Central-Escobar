import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/formatters';
import { ShoppingBag, DollarSign, Package, BarChart3, PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react';

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, currentShift, cart } = useApp();
  const cartTotalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-30 bg-stone-900 border-b border-stone-800 text-stone-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center font-bold text-stone-950 text-base shadow-sm">
            🥟
          </div>
          <button 
            onClick={() => setActiveTab('pos')}
            className="text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors cursor-pointer text-left"
          >
            Criolla & Horno
          </button>
        </div>

        {/* Zone 2: 4 nav links, single-line text with clean hover/active state */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'pos'
                ? 'bg-stone-800 text-amber-400 font-semibold shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>Punto de Venta</span>
            {cartTotalItems > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-stone-950 text-[10px] font-bold rounded-full tabular-nums">
                {cartTotalItems}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('caja')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'caja'
                ? 'bg-stone-800 text-amber-400 font-semibold shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
            }`}
          >
            <DollarSign className="w-4 h-4 shrink-0" />
            <span>Cierre de Caja</span>
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'stock'
                ? 'bg-stone-800 text-amber-400 font-semibold shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>Control de Stock</span>
          </button>

          <button
            onClick={() => setActiveTab('reportes')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'reportes'
                ? 'bg-stone-800 text-amber-400 font-semibold shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>Reportes & Ganancias</span>
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions / Status */}
        <div className="flex items-center gap-3">
          {currentShift ? (
            <button
              onClick={() => setActiveTab('caja')}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800/90 border border-stone-700/80 text-stone-200 text-xs hover:border-amber-500/50 transition-colors"
              title="Click para ver arqueo de caja"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-stone-400">Caja #{currentShift.shiftNumber}:</span>
              <span className="font-semibold text-emerald-400 tabular-nums">
                {formatCurrency(currentShift.expectedCash)}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('caja')}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs hover:bg-rose-900/40 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Caja Cerrada</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('pos')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors shadow-xs whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nueva Venta</span>
          </button>
        </div>

      </div>
    </header>
  );
};
