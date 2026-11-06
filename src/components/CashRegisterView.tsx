import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDateTime, formatTime } from '../utils/formatters';
import { CashMovementCategory } from '../types';
import { 
  DollarSign, 
  Lock, 
  Unlock, 
  ArrowUpRight, 
  ArrowDownRight, 
  Receipt, 
  Calculator, 
  History, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  Plus
} from 'lucide-react';

export const CashRegisterView: React.FC = () => {
  const {
    currentShift,
    pastShifts,
    cashMovements,
    openShift,
    addCashMovement,
    closeCurrentShift,
    setSelectedShiftForDetail,
  } = useApp();

  // Modals state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Form states for opening shift
  const [initialCashInput, setInitialCashInput] = useState('35000');
  const [openedByInput, setOpenedByInput] = useState('Carlos (Dueño)');

  // Form states for movement
  const [movType, setMovType] = useState<'egreso' | 'ingreso'>('egreso');
  const [movCategory, setMovCategory] = useState<CashMovementCategory>('repartidor_delivery');
  const [movAmount, setMovAmount] = useState('');
  const [movConcept, setMovConcept] = useState('');

  // Form states for shift closing
  const [closeActualCash, setCloseActualCash] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [closedByName, setClosedByName] = useState<string>('Carlos (Dueño)');

  // Billete calculator inside close modal
  const [denominations, setDenominations] = useState<Record<number, number>>({
    20000: 0,
    10000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
  });

  const handleDenominationChange = (value: number, countStr: string) => {
    const count = parseInt(countStr) || 0;
    const updated = { ...denominations, [value]: count };
    setDenominations(updated);

    const calculatedTotal = Object.entries(updated).reduce((acc, [den, qty]) => {
      return acc + Number(den) * Number(qty);
    }, 0);

    setCloseActualCash(calculatedTotal.toString());
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(initialCashInput) || 0;
    openShift(cash, openedByInput);
    setShowOpenModal(false);
  };

  const handleAddMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(movAmount) || 0;
    if (amount <= 0 || !movConcept.trim()) return;

    addCashMovement(movType, movCategory, amount, movConcept.trim());
    setMovAmount('');
    setMovConcept('');
    setShowMovementModal(false);
  };

  const handleExecuteClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;

    const actual = closeActualCash === '' ? currentShift.expectedCash : (parseFloat(closeActualCash) || 0);
    closeCurrentShift(actual, closeNotes, closedByName);
    setShowCloseModal(false);
    setCloseActualCash('');
    setCloseNotes('');
  };

  const movementsForCurrentShift = currentShift
    ? cashMovements.filter((m) => m.shiftId === currentShift.id)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      
      {/* Top Banner / Status Overview */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700">
                <DollarSign className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-stone-900">
                  {currentShift ? `Turno de Caja #${currentShift.shiftNumber}` : 'Caja Cerrada'}
                </h1>
                <p className="text-xs text-stone-500 mt-0.5">
                  {currentShift
                    ? `Abierta el ${formatDateTime(currentShift.openedAt)}`
                    : 'No hay ningún turno abierto actualmente en el local'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {currentShift ? (
              <>
                <button
                  onClick={() => setShowMovementModal(true)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar Gasto / Ingreso</span>
                </button>
                <button
                  onClick={() => {
                    setCloseActualCash(currentShift.expectedCash.toString());
                    setShowCloseModal(true);
                  }}
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-amber-400 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Realizar Cierre de Caja</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowOpenModal(true)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <Unlock className="w-4 h-4" />
                <span>Abrir Turno de Caja</span>
              </button>
            )}
          </div>
        </div>

        {/* Financial Flow Summary Cards */}
        {currentShift ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5 pt-6">
            
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80">
              <span className="text-[11px] font-medium text-stone-500 block">Fondo Inicial</span>
              <span className="text-base font-bold text-stone-900 tabular-nums mt-0.5 block">
                {formatCurrency(currentShift.initialCash)}
              </span>
              <span className="text-[10px] text-stone-400">Efectivo de cambio</span>
            </div>

            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/60">
              <span className="text-[11px] font-medium text-emerald-800 block">Ventas en Efectivo</span>
              <span className="text-base font-bold text-emerald-950 tabular-nums mt-0.5 block">
                {formatCurrency(currentShift.cashSales)}
              </span>
              <span className="text-[10px] text-emerald-700">Ingreso a caja</span>
            </div>

            <div className="p-3.5 bg-sky-50/60 rounded-xl border border-sky-200/60">
              <span className="text-[11px] font-medium text-sky-800 block">Cobros Digitales (MP)</span>
              <span className="text-base font-bold text-sky-950 tabular-nums mt-0.5 block">
                {formatCurrency(currentShift.digitalSales)}
              </span>
              <span className="text-[10px] text-sky-700">Acreditado en cuenta</span>
            </div>

            <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200/60">
              <span className="text-[11px] font-medium text-indigo-800 block">Ventas con Tarjeta</span>
              <span className="text-base font-bold text-indigo-950 tabular-nums mt-0.5 block">
                {formatCurrency(currentShift.cardSales)}
              </span>
              <span className="text-[10px] text-indigo-700">POS / Posnet</span>
            </div>

            <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200/60">
              <span className="text-[11px] font-medium text-rose-800 block">Egresos / Gastos</span>
              <span className="text-base font-bold text-rose-950 tabular-nums mt-0.5 block">
                -{formatCurrency(currentShift.cashOutflow)}
              </span>
              <span className="text-[10px] text-rose-700">Salidas de efectivo</span>
            </div>

            <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-500/30">
              <span className="text-[11px] font-semibold text-amber-900 block">Efectivo Teórico en Caja</span>
              <span className="text-lg font-extrabold text-amber-950 tabular-nums mt-0.5 block">
                {formatCurrency(currentShift.expectedCash)}
              </span>
              <span className="text-[10px] text-amber-800 font-medium">Debe haber en el cajón</span>
            </div>

          </div>
        ) : (
          <div className="py-8 text-center text-stone-500 space-y-2">
            <Lock className="w-10 h-10 mx-auto text-stone-300" />
            <p className="text-sm font-medium text-stone-700">Abre un nuevo turno de caja para comenzar el despacho</p>
            <p className="text-xs text-stone-400">Podrás registrar el fondo de cambio en efectivo y cobrar pedidos.</p>
          </div>
        )}
      </div>

      {/* Movements & Transactions of Current Shift */}
      {currentShift && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Cash Inflow/Outflow Movements list */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-stone-200/90 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-stone-700" />
                <h3 className="font-bold text-stone-900 text-sm">
                  Movimientos de Caja del Turno ({movementsForCurrentShift.length})
                </h3>
              </div>
              <button
                onClick={() => setShowMovementModal(true)}
                className="text-xs text-amber-700 hover:text-amber-800 font-semibold cursor-pointer"
              >
                + Nuevo
              </button>
            </div>

            <div className="mt-3 divide-y divide-stone-100">
              {movementsForCurrentShift.length === 0 ? (
                <p className="text-xs text-stone-400 py-6 text-center">
                  No hay gastos ni retiros registrados en este turno.
                </p>
              ) : (
                movementsForCurrentShift.map((mov) => (
                  <div key={mov.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`p-1.5 rounded-lg ${
                          mov.type === 'ingreso'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {mov.type === 'ingreso' ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </span>
                      <div>
                        <p className="font-semibold text-stone-900">{mov.concept}</p>
                        <p className="text-[11px] text-stone-400">
                          {formatTime(mov.timestamp)} · Categoría: {mov.category.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-bold tabular-nums text-sm ${
                        mov.type === 'ingreso' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {mov.type === 'ingreso' ? '+' : '-'}
                      {formatCurrency(mov.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Shift Profit & Performance Metrics preview */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-stone-200/90 shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-stone-700" />
                  <h3 className="font-bold text-stone-900 text-sm">Rendimiento del Turno en Vivo</h3>
                </div>
                <span className="text-xs text-stone-400">{currentShift.totalSalesCount} tickets cobrados</span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">Facturación Total del Turno:</span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {formatCurrency(currentShift.totalRevenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">Costo de Insumos / Mercadería:</span>
                  <span className="font-semibold text-stone-500 tabular-nums">
                    {formatCurrency(currentShift.totalRevenue - currentShift.totalProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">Ganancia Bruta del Turno:</span>
                  <span className="font-bold text-emerald-700 tabular-nums text-sm">
                    {formatCurrency(currentShift.totalProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-100">
                  <span className="text-stone-600">Margen de Ganancia:</span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {currentShift.totalRevenue > 0
                      ? `${((currentShift.totalProfit / currentShift.totalRevenue) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">Ticket Promedio por Venta:</span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {currentShift.totalSalesCount > 0
                      ? formatCurrency(Math.round(currentShift.totalRevenue / currentShift.totalSalesCount))
                      : '$0'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span>El arqueo compara el dinero físico en billetes contra el teórico.</span>
              <button
                onClick={() => {
                  setCloseActualCash(currentShift.expectedCash.toString());
                  setShowCloseModal(true);
                }}
                className="text-amber-700 font-bold hover:underline cursor-pointer"
              >
                Hacer arqueo ahora →
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Historical Shifts Table (Cierres Anteriores) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-5">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-stone-700" />
            <h2 className="font-bold text-stone-900 text-base">Historial de Cierres de Caja</h2>
          </div>
          <span className="text-xs text-stone-400">
            {pastShifts.length} turnos archivados
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3">Turno</th>
                <th className="py-2.5 px-3">Fecha y Cierre</th>
                <th className="py-2.5 px-3 text-right">Fondo Inic.</th>
                <th className="py-2.5 px-3 text-right">Facturación</th>
                <th className="py-2.5 px-3 text-right">Efectivo Teórico</th>
                <th className="py-2.5 px-3 text-right">Efectivo Real</th>
                <th className="py-2.5 px-3 text-center">Diferencia</th>
                <th className="py-2.5 px-3 text-right">Ganancia</th>
                <th className="py-2.5 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pastShifts.map((shift) => {
                const diff = shift.difference || 0;
                const isExact = diff === 0;
                const isSurplus = diff > 0;

                return (
                  <tr key={shift.id} className="hover:bg-stone-50/80 transition-colors">
                    <td className="py-3 px-3 font-bold text-stone-900">
                      #{shift.shiftNumber}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-stone-800">
                        {shift.closedAt ? formatDateTime(shift.closedAt) : formatDateTime(shift.openedAt)}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        Por: {shift.closedBy || 'Responsable'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-stone-600 tabular-nums">
                      {formatCurrency(shift.initialCash)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-stone-900 tabular-nums">
                      {formatCurrency(shift.totalRevenue)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-stone-700 tabular-nums">
                      {formatCurrency(shift.expectedCash)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-stone-900 tabular-nums">
                      {formatCurrency(shift.actualCash ?? shift.expectedCash)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {isExact ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Exacta</span>
                        </span>
                      ) : isSurplus ? (
                        <span className="text-[11px] font-semibold text-sky-700 tabular-nums">
                          +{formatCurrency(diff)} (Sobrante)
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-rose-700 tabular-nums">
                          {formatCurrency(diff)} (Faltante)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(shift.totalProfit)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setSelectedShiftForDetail(shift)}
                        className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                      >
                        Ver Acta
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Abrir Turno de Caja */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Apertura de Turno de Caja</h3>
            <p className="text-xs text-stone-500 mt-1">
              Ingresa el fondo de cambio disponible en billetes y monedas para comenzar el turno.
            </p>

            <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Fondo Inicial de Caja ($)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="100"
                  value={initialCashInput}
                  onChange={(e) => setInitialCashInput(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="30000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Responsable del Turno
                </label>
                <input
                  type="text"
                  required
                  value={openedByInput}
                  onChange={(e) => setOpenedByInput(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Confirmar y Abrir Caja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Gasto o Ingreso */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Movimiento de Caja Manual</h3>
            <p className="text-xs text-stone-500 mt-1">
              Registra una salida de efectivo (gasto, pago) o un ingreso imprevisto.
            </p>

            <form onSubmit={handleAddMovement} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovType('egreso')}
                  className={`py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                    movType === 'egreso'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-stone-50 border-stone-200 text-stone-600'
                  }`}
                >
                  Salida / Egreso (-)
                </button>
                <button
                  type="button"
                  onClick={() => setMovType('ingreso')}
                  className={`py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                    movType === 'ingreso'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-stone-50 border-stone-200 text-stone-600'
                  }`}
                >
                  Ingreso Extra (+)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Monto ($)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Categoría
                </label>
                <select
                  value={movCategory}
                  onChange={(e) => setMovCategory(e.target.value as CashMovementCategory)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="repartidor_delivery">Pago a Repartidor / Delivery</option>
                  <option value="proveedores">Proveedores de Harina / Carne / Queso</option>
                  <option value="insumos_frescos">Verdulería / Insumos Frescos</option>
                  <option value="limpieza_embalaje">Cajas de empanadas / Bolsas / Papel</option>
                  <option value="retiro_caja">Retiro del Dueño</option>
                  <option value="otro">Otro concepto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Concepto / Detalle
                </label>
                <input
                  type="text"
                  required
                  value={movConcept}
                  onChange={(e) => setMovConcept(e.target.value)}
                  placeholder="Ej: Compra de 2kg de cebolla de verdeo"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Arqueo y Cierre de Caja Definitivo */}
      {showCloseModal && currentShift && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-stone-900">
                  Arqueo y Cierre de Caja #{currentShift.shiftNumber}
                </h3>
              </div>
            </div>

            {/* Shift Balance Summary */}
            <div className="mt-4 p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-600">Fondo Inicial:</span>
                <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(currentShift.initialCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">(+) Ventas en Efectivo:</span>
                <span className="font-semibold text-emerald-700 tabular-nums">+{formatCurrency(currentShift.cashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">(+) Otros Ingresos en Efectivo:</span>
                <span className="font-semibold text-emerald-700 tabular-nums">+{formatCurrency(currentShift.cashInflow)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">(-) Egresos / Gastos de Caja:</span>
                <span className="font-semibold text-rose-700 tabular-nums">-{formatCurrency(currentShift.cashOutflow)}</span>
              </div>
              <div className="pt-2 border-t border-stone-200 flex justify-between font-extrabold text-sm text-stone-900">
                <span>Efectivo Teórico a Encontrar:</span>
                <span className="text-amber-800 tabular-nums">{formatCurrency(currentShift.expectedCash)}</span>
              </div>
            </div>

            {/* Billete Counter Tool */}
            <div className="mt-4 space-y-2">
              <label className="text-xs font-bold text-stone-800 flex items-center justify-between">
                <span>Calculadora de Billetes (Opcional)</span>
                <span className="text-[11px] text-stone-400 font-normal">Cantidad de billetes físicos contados</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[20000, 10000, 2000, 1000].map((den) => (
                  <div key={den} className="p-2 bg-stone-50 border border-stone-200 rounded-lg">
                    <span className="text-[11px] font-semibold text-stone-600 block">${den}</span>
                    <input
                      type="number"
                      min="0"
                      value={denominations[den] || ''}
                      onChange={(e) => handleDenominationChange(den, e.target.value)}
                      placeholder="0"
                      className="w-full mt-1 px-2 py-1 bg-white border border-stone-200 rounded text-stone-900 font-bold tabular-nums text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Direct Total Input */}
            <form onSubmit={handleExecuteClose} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  Efectivo Físico Total Contado ($) *
                </label>
                <input
                  type="number"
                  required
                  value={closeActualCash}
                  onChange={(e) => setCloseActualCash(e.target.value)}
                  placeholder={currentShift.expectedCash.toString()}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-base font-extrabold text-stone-900 tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Difference Preview */}
              {closeActualCash !== '' && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    parseFloat(closeActualCash) - currentShift.expectedCash === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : parseFloat(closeActualCash) - currentShift.expectedCash > 0
                      ? 'bg-sky-50 border-sky-200 text-sky-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <span className="font-semibold">Resultado del Cuadre:</span>
                  <span className="font-extrabold text-sm tabular-nums">
                    {parseFloat(closeActualCash) - currentShift.expectedCash === 0
                      ? 'Caja Cuadrada Perfecta (Diferencia $0)'
                      : parseFloat(closeActualCash) - currentShift.expectedCash > 0
                      ? `Sobrante de +${formatCurrency(parseFloat(closeActualCash) - currentShift.expectedCash)}`
                      : `Faltante de ${formatCurrency(parseFloat(closeActualCash) - currentShift.expectedCash)}`}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Observaciones / Notas del Cierre
                </label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Ej: Turno tranquilo, se dejaron $30.000 de cambio para mañana."
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Cerrado por
                </label>
                <input
                  type="text"
                  required
                  value={closedByName}
                  onChange={(e) => setClosedByName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  Finalizar y Cerrar Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
