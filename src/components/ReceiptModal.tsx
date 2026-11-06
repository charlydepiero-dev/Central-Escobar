import React from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { Printer, X, CheckCircle2 } from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const { lastCompletedSale, setLastCompletedSale } = useApp();

  if (!lastCompletedSale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200 relative">
        
        {/* Close Button */}
        <button
          onClick={() => setLastCompletedSale(null)}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success header */}
        <div className="text-center pb-4 border-b border-dashed border-stone-200">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-2">
            <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h3 className="font-extrabold text-stone-900 text-base">¡Venta Registrada con Éxito!</h3>
          <p className="text-xs text-stone-500">Ticket #{lastCompletedSale.saleNumber}</p>
        </div>

        {/* Printable thermal receipt layout */}
        <div id="printable-receipt" className="py-4 space-y-3 font-mono text-xs text-stone-800">
          <div className="text-center space-y-0.5">
            <p className="font-bold text-sm tracking-wide">CRIOLLA & HORNO</p>
            <p className="text-[10px] text-stone-500">Empanadas Artesanales al Horno</p>
            <p className="text-[10px] text-stone-400">{formatDateTime(lastCompletedSale.timestamp)}</p>
            {lastCompletedSale.customerName && (
              <p className="text-[11px] font-semibold text-stone-700 pt-1">
                Cliente: {lastCompletedSale.customerName}
              </p>
            )}
          </div>

          <div className="border-t border-b border-dashed border-stone-300 py-2 divide-y divide-dotted divide-stone-200">
            {lastCompletedSale.items.map((item, idx) => (
              <div key={idx} className="py-1 flex justify-between items-start text-[11px]">
                <div className="flex-1 pr-2">
                  <span>{item.quantity}x {item.name}</span>
                </div>
                <span className="font-bold tabular-nums">
                  {formatCurrency(item.subtotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between font-extrabold text-sm text-stone-900 pt-1">
              <span>TOTAL:</span>
              <span className="tabular-nums">{formatCurrency(lastCompletedSale.total)}</span>
            </div>

            <div className="flex justify-between text-stone-600 text-[11px]">
              <span>Forma de Pago:</span>
              <span className="capitalize font-semibold">{lastCompletedSale.paymentMethod.replace('_', ' ')}</span>
            </div>

            {lastCompletedSale.cashReceived !== undefined && lastCompletedSale.cashReceived > 0 && (
              <>
                <div className="flex justify-between text-stone-600 text-[11px]">
                  <span>Abona con:</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(lastCompletedSale.cashReceived)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold text-xs">
                  <span>Vuelto:</span>
                  <span className="tabular-nums">{formatCurrency(lastCompletedSale.changeGiven || 0)}</span>
                </div>
              </>
            )}
          </div>

          {lastCompletedSale.notes && (
            <div className="text-[10px] text-stone-500 italic pt-1">
              Nota: {lastCompletedSale.notes}
            </div>
          )}

          <div className="text-center text-[10px] text-stone-400 pt-3 border-t border-dashed border-stone-200">
            <p>¡Muchas gracias por su compra!</p>
            <p>Conserve este comprobante</p>
          </div>
        </div>

        {/* Modal footer actions */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
          <button
            onClick={() => setLastCompletedSale(null)}
            className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
          >
            Listo / Continuar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2 px-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Ticket</span>
          </button>
        </div>

      </div>
    </div>
  );
};
