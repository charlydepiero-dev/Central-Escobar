import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';

export const ShiftDetailModal: React.FC = () => {
  const { selectedShiftForDetail, setSelectedShiftForDetail } = useApp();

  if (!selectedShiftForDetail) return null;

  const shift = selectedShiftForDetail;
  const diff = shift.difference || 0;
  const isExact = diff === 0;
  const isSurplus = diff > 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 relative max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={() => setSelectedShiftForDetail(null)}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 pb-4 border-b border-stone-100">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-stone-900 text-base">
              Acta de Cierre de Caja #{shift.shiftNumber}
            </h3>
            <p className="text-xs text-stone-500">
              {shift.closedAt ? `Cerrada: ${formatDateTime(shift.closedAt)}` : `Abierta: ${formatDateTime(shift.openedAt)}`}
            </p>
          </div>
        </div>

        {/* Printable Shift Statement */}
        <div id="printable-receipt" className="py-4 space-y-4 text-xs text-stone-800">
          
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-2 gap-2 text-stone-600">
            <div>
              <span className="text-[11px] text-stone-400 block">Responsable</span>
              <span className="font-bold text-stone-900">{shift.closedBy || 'Encargado'}</span>
            </div>
            <div>
              <span className="text-[11px] text-stone-400 block">Estado del Turno</span>
              <span className="font-bold text-stone-900 capitalize">{shift.status}</span>
            </div>
            <div>
              <span className="text-[11px] text-stone-400 block">Apertura</span>
              <span className="font-medium text-stone-700">{formatDateTime(shift.openedAt)}</span>
            </div>
            <div>
              <span className="text-[11px] text-stone-400 block">Cierre</span>
              <span className="font-medium text-stone-700">
                {shift.closedAt ? formatDateTime(shift.closedAt) : 'En curso'}
              </span>
            </div>
          </div>

          {/* Breakdown table */}
          <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
            
            <div className="p-3 bg-stone-50/50 flex justify-between font-medium">
              <span className="text-stone-600">Fondo Inicial de Apertura</span>
              <span className="font-bold text-stone-900 tabular-nums">{formatCurrency(shift.initialCash)}</span>
            </div>

            <div className="p-3 flex justify-between text-stone-700">
              <span>(+) Ventas en Efectivo</span>
              <span className="font-semibold text-emerald-700 tabular-nums">+{formatCurrency(shift.cashSales)}</span>
            </div>

            <div className="p-3 flex justify-between text-stone-700">
              <span>(+) Ventas Mercado Pago / Transferencias</span>
              <span className="font-semibold text-sky-700 tabular-nums">+{formatCurrency(shift.digitalSales)}</span>
            </div>

            <div className="p-3 flex justify-between text-stone-700">
              <span>(+) Ventas Tarjeta de Débito/Crédito</span>
              <span className="font-semibold text-indigo-700 tabular-nums">+{formatCurrency(shift.cardSales)}</span>
            </div>

            <div className="p-3 flex justify-between text-stone-700">
              <span>(-) Salidas de Efectivo (Gastos / Repartidor)</span>
              <span className="font-semibold text-rose-700 tabular-nums">-{formatCurrency(shift.cashOutflow)}</span>
            </div>

            <div className="p-3 bg-amber-500/10 flex justify-between font-bold text-stone-900 text-sm">
              <span className="text-amber-950">Efectivo Teórico Esperado en Cajón:</span>
              <span className="text-amber-950 tabular-nums">{formatCurrency(shift.expectedCash)}</span>
            </div>

            <div className="p-3 bg-stone-50 flex justify-between font-bold text-stone-900 text-sm">
              <span>Efectivo Real Contado:</span>
              <span className="tabular-nums">{formatCurrency(shift.actualCash ?? shift.expectedCash)}</span>
            </div>

            <div className="p-3 flex justify-between font-extrabold text-sm">
              <span>Resultado del Arqueo:</span>
              <span className={`tabular-nums ${
                isExact ? 'text-emerald-700' : isSurplus ? 'text-sky-700' : 'text-rose-700'
              }`}>
                {isExact
                  ? 'Caja Cuadrada Perfecta ($0)'
                  : isSurplus
                  ? `Sobrante de +${formatCurrency(diff)}`
                  : `Faltante de ${formatCurrency(diff)}`}
              </span>
            </div>

          </div>

          {/* Performance figures */}
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Facturación Total del Turno:</span>
              <span className="font-bold tabular-nums">{formatCurrency(shift.totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Ganancia Bruta Real del Turno:</span>
              <span className="font-extrabold text-emerald-800 text-sm tabular-nums">
                {formatCurrency(shift.totalProfit)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Cantidad de Ventas / Tickets:</span>
              <span className="font-semibold tabular-nums">{shift.totalSalesCount} pedidos</span>
            </div>
          </div>

          {shift.notes && (
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-600 text-xs">
              <span className="font-semibold block text-stone-700 mb-0.5">Observaciones:</span>
              <p>{shift.notes}</p>
            </div>
          )}

        </div>

        {/* Modal actions */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
          <button
            onClick={() => setSelectedShiftForDetail(null)}
            className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2 px-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Acta</span>
          </button>
        </div>

      </div>
    </div>
  );
};
