import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Sale, PaymentMethod } from '../types';
import { formatCurrency, formatDozens, formatDateShort, formatDateTime } from '../utils/formatters';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  PieChart, 
  Calendar, 
  Download, 
  Flame, 
  Receipt, 
  ArrowUpRight,
  Filter,
  CreditCard,
  Banknote,
  QrCode
} from 'lucide-react';

type ReportPeriod = 'hoy' | 'semana' | 'ultimos_7' | 'todo';

export const ReportsView: React.FC = () => {
  const { sales, pastShifts, currentShift, setLastCompletedSale } = useApp();
  const [period, setPeriod] = useState<ReportPeriod>('semana');
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | 'all'>('all');
  const [searchSale, setSearchSale] = useState('');

  // Combine current shift and past shifts to get all sales or shifts
  const now = new Date('2026-10-06T15:21:24-07:00'); // current simulated time

  // Filter sales based on period
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = new Date(sale.timestamp);
      
      if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) {
        return false;
      }

      if (searchSale.trim()) {
        const query = searchSale.toLowerCase();
        const matchesNumber = sale.saleNumber.toString().includes(query);
        const matchesCustomer = sale.customerName?.toLowerCase().includes(query);
        const matchesItem = sale.items.some((i) => i.name.toLowerCase().includes(query));
        if (!matchesNumber && !matchesCustomer && !matchesItem) return false;
      }

      if (period === 'hoy') {
        // Today is 2026-10-06
        return (
          saleDate.getFullYear() === 2026 &&
          saleDate.getMonth() === 9 && // October is 9
          saleDate.getDate() === 6
        );
      }

      if (period === 'semana') {
        // Current week (e.g. from Oct 5 to Oct 11)
        const diffDays = (now.getTime() - saleDate.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7 && diffDays >= 0;
      }

      if (period === 'ultimos_7') {
        const diffDays = (now.getTime() - saleDate.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7 && diffDays >= 0;
      }

      return true; // 'todo'
    });
  }, [sales, period, paymentFilter, searchSale]);

  // Aggregate stats from filtered sales
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalEmpanadas = 0;
    let cashTotal = 0;
    let digitalTotal = 0;
    let cardTotal = 0;

    const productSalesMap: Record<
      string,
      { name: string; quantity: number; revenue: number; cost: number; profit: number }
    > = {};

    filteredSales.forEach((sale) => {
      totalRevenue += sale.total;
      totalCost += sale.totalCost;
      totalEmpanadas += sale.totalEmpanadasCount;

      if (sale.paymentMethod === 'efectivo') cashTotal += sale.total;
      if (sale.paymentMethod === 'transferencia_mp') digitalTotal += sale.total;
      if (sale.paymentMethod === 'tarjeta') cardTotal += sale.total;

      sale.items.forEach((item) => {
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = {
            name: item.name,
            quantity: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }
        productSalesMap[item.productId].quantity += item.quantity;
        productSalesMap[item.productId].revenue += item.subtotal;
        productSalesMap[item.productId].cost += item.costSubtotal;
        productSalesMap[item.productId].profit += item.subtotal - item.costSubtotal;
      });
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageTicket = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;

    const productRanking = Object.values(productSalesMap).sort(
      (a, b) => b.quantity - a.quantity
    );

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      totalEmpanadas,
      salesCount: filteredSales.length,
      averageTicket,
      cashTotal,
      digitalTotal,
      cardTotal,
      productRanking,
    };
  }, [filteredSales]);

  // Weekly day-by-day data for the visual chart (from shifts + today)
  const weeklyChartData = useMemo(() => {
    const days = [
      { label: 'Mié 30', date: '2026-09-30', revenue: 252000, profit: 144800, cost: 107200 },
      { label: 'Jue 01', date: '2026-10-01', revenue: 278000, profit: 159400, cost: 118600 },
      { label: 'Vie 02', date: '2026-10-02', revenue: 462000, profit: 266800, cost: 195200 },
      { label: 'Sáb 03', date: '2026-10-03', revenue: 547000, profit: 316300, cost: 230700 },
      { label: 'Dom 04', date: '2026-10-04', revenue: 418000, profit: 241900, cost: 176100 },
      { label: 'Lun 05', date: '2026-10-05', revenue: 300000, profit: 172400, cost: 127600 },
      {
        label: 'Mar 06 (Hoy)',
        date: '2026-10-06',
        revenue: currentShift?.totalRevenue || 136800,
        profit: currentShift?.totalProfit || 78920,
        cost: (currentShift?.totalRevenue || 136800) - (currentShift?.totalProfit || 78920),
      },
    ];
    return days;
  }, [currentShift]);

  const maxWeeklyRevenue = Math.max(...weeklyChartData.map((d) => d.revenue));

  // Export to CSV functionality
  const handleExportCSV = () => {
    const headers = ['Nro Ticket', 'Fecha y Hora', 'Total ($)', 'Costo ($)', 'Ganancia ($)', 'Metodo Pago', 'Empanadas', 'Cliente'];
    const rows = filteredSales.map((s) => [
      s.saleNumber,
      formatDateTime(s.timestamp),
      s.total,
      s.totalCost,
      s.profit,
      s.paymentMethod,
      s.totalEmpanadasCount,
      s.customerName || 'Consumidor Final',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_ventas_${period}_empanadas.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Top Controls: Period selector & Export CSV */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Reportes de Ventas & Ganancias</h1>
          <p className="text-xs text-stone-500">
            Control de ingresos, costo de insumos y ganancia neta para la toma de decisiones.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-stone-100 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setPeriod('hoy')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                period === 'hoy'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Hoy (Diario)
            </button>
            <button
              onClick={() => setPeriod('semana')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                period === 'semana'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Esta Semana
            </button>
            <button
              onClick={() => setPeriod('ultimos_7')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                period === 'ultimos_7'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Últimos 7 Días
            </button>
            <button
              onClick={() => setPeriod('todo')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                period === 'todo'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Histórico
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-stone-900 hover:bg-stone-800 text-stone-100 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Descargar tabla en formato Excel CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        
        {/* Facturación Total */}
        <div className="p-4 bg-white rounded-xl border border-stone-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-stone-500 block">Facturación Total</span>
          <span className="text-xl font-black text-stone-900 tabular-nums block mt-1">
            {formatCurrency(stats.totalRevenue)}
          </span>
          <span className="text-[10px] text-stone-400 mt-0.5 block">{stats.salesCount} pedidos cobrados</span>
        </div>

        {/* Costo de Insumos */}
        <div className="p-4 bg-white rounded-xl border border-stone-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-stone-500 block">Costo de Insumos</span>
          <span className="text-xl font-bold text-stone-600 tabular-nums block mt-1">
            {formatCurrency(stats.totalCost)}
          </span>
          <span className="text-[10px] text-stone-400 mt-0.5 block">Harina, carnes, quesos</span>
        </div>

        {/* Ganancia Bruta Real */}
        <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-900 block">Ganancia Bruta Real</span>
          <span className="text-xl font-black text-emerald-700 tabular-nums block mt-1">
            {formatCurrency(stats.totalProfit)}
          </span>
          <span className="text-[10px] text-emerald-800 font-medium mt-0.5 block">Total en el bolsillo</span>
        </div>

        {/* Margen de Ganancia */}
        <div className="p-4 bg-white rounded-xl border border-stone-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-stone-500 block">Margen de Ganancia</span>
          <span className="text-xl font-black text-stone-900 tabular-nums block mt-1">
            {stats.profitMargin.toFixed(1)}%
          </span>
          <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block">Rentabilidad alta</span>
        </div>

        {/* Empanadas Vendidas */}
        <div className="p-4 bg-white rounded-xl border border-stone-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-stone-500 block">Empanadas Despachadas</span>
          <span className="text-xl font-black text-amber-700 tabular-nums block mt-1">
            {stats.totalEmpanadas} <span className="text-xs font-normal text-stone-500">u.</span>
          </span>
          <span className="text-[10px] text-stone-500 font-medium mt-0.5 block">
            {formatDozens(stats.totalEmpanadas)}
          </span>
        </div>

        {/* Ticket Promedio */}
        <div className="p-4 bg-white rounded-xl border border-stone-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-stone-500 block">Ticket Promedio</span>
          <span className="text-xl font-bold text-stone-900 tabular-nums block mt-1">
            {formatCurrency(Math.round(stats.averageTicket))}
          </span>
          <span className="text-[10px] text-stone-400 mt-0.5 block">Por compra realizada</span>
        </div>

      </div>

      {/* Visual Chart: Evolución Diaria y Semanal de Facturación vs Ganancia */}
      <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-600" />
              <span>Evolución Semanal de Facturación y Ganancias Reales</span>
            </h2>
            <p className="text-xs text-stone-500">
              Comparativa día a día: Verde (Ganancia Neta) vs Gris (Costo de Insumos) = Altura Total (Facturación).
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-stone-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600"></span>
              <span>Ganancia Real</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-stone-300"></span>
              <span>Costo Insumos</span>
            </span>
          </div>
        </div>

        {/* Custom Clean SVG Bar Chart */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-56 border-b border-stone-200 pb-2">
            {weeklyChartData.map((d) => {
              const heightPercent = maxWeeklyRevenue > 0 ? (d.revenue / maxWeeklyRevenue) * 100 : 0;
              const profitHeight = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
              const costHeight = 100 - profitHeight;

              return (
                <div key={d.date} className="flex flex-col items-center h-full justify-end group">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-stone-700 bg-stone-900 text-white rounded px-2 py-1 mb-1 pointer-events-none whitespace-nowrap z-10 shadow-lg">
                    <p className="font-bold">{d.label}</p>
                    <p>Facturación: {formatCurrency(d.revenue)}</p>
                    <p className="text-emerald-300">Ganancia: {formatCurrency(d.profit)}</p>
                  </div>

                  {/* Bar stack */}
                  <div
                    style={{ height: `${Math.max(12, heightPercent)}%` }}
                    className="w-full max-w-[54px] rounded-t-lg overflow-hidden flex flex-col justify-end transition-all group-hover:brightness-105"
                  >
                    {/* Cost segment (top) */}
                    <div
                      style={{ height: `${costHeight}%` }}
                      className="bg-stone-300 w-full"
                    ></div>
                    {/* Profit segment (bottom) */}
                    <div
                      style={{ height: `${profitHeight}%` }}
                      className="bg-emerald-600 w-full"
                    ></div>
                  </div>

                  {/* Label */}
                  <span className="text-[11px] font-semibold text-stone-600 mt-2 truncate w-full text-center">
                    {d.label}
                  </span>
                  <span className="text-[10px] font-bold text-stone-900 tabular-nums">
                    {formatCurrency(d.revenue)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two Columns: Product Profitability Ranking & Payment Methods Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Top Product Flavors Ranking */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-stone-200/90 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-stone-900 text-sm">
                Ranking de Sabores: Ventas & Rentabilidad
              </h3>
            </div>
            <span className="text-xs text-stone-400">Ordenado por unidades despachadas</span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase font-semibold">
                  <th className="py-2.5 px-3">Sabor de Empanada</th>
                  <th className="py-2.5 px-3 text-center">Unidades</th>
                  <th className="py-2.5 px-3 text-right">Facturado</th>
                  <th className="py-2.5 px-3 text-right">Ganancia Neta</th>
                  <th className="py-2.5 px-3 text-center">Margen %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {stats.productRanking.map((item, idx) => {
                  const margin = item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(0) : '0';
                  return (
                    <tr key={item.name} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-stone-900">{item.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-stone-900 tabular-nums">
                        {item.quantity} u.
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-stone-600 tabular-nums">
                        {formatCurrency(item.revenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(item.profit)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-semibold text-stone-700 tabular-nums">
                          {margin}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-stone-200/90 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-stone-700" />
                <h3 className="font-bold text-stone-900 text-sm">Métodos de Pago</h3>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              
              {/* Efectivo */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-950 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-amber-700" />
                    <span>Efectivo en Caja</span>
                  </span>
                  <span className="font-bold text-amber-950 tabular-nums">
                    {stats.totalRevenue > 0
                      ? `${((stats.cashTotal / stats.totalRevenue) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[11px] text-amber-800">Recibido en billetes</span>
                  <span className="font-extrabold text-amber-900 tabular-nums text-sm">
                    {formatCurrency(stats.cashTotal)}
                  </span>
                </div>
              </div>

              {/* Mercado Pago / Transferencias */}
              <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-200/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-950 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-sky-700" />
                    <span>Mercado Pago / Transf.</span>
                  </span>
                  <span className="font-bold text-sky-950 tabular-nums">
                    {stats.totalRevenue > 0
                      ? `${((stats.digitalTotal / stats.totalRevenue) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[11px] text-sky-800">Cuenta bancaria / billetera</span>
                  <span className="font-extrabold text-sky-900 tabular-nums text-sm">
                    {formatCurrency(stats.digitalTotal)}
                  </span>
                </div>
              </div>

              {/* Tarjetas */}
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-700" />
                    <span>Tarjeta Débito / Crédito</span>
                  </span>
                  <span className="font-bold text-indigo-950 tabular-nums">
                    {stats.totalRevenue > 0
                      ? `${((stats.cardTotal / stats.totalRevenue) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[11px] text-indigo-800">Terminal Posnet</span>
                  <span className="font-extrabold text-indigo-900 tabular-nums text-sm">
                    {formatCurrency(stats.cardTotal)}
                  </span>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-400">
            Permite conciliar el dinero que va a la cuenta bancaria vs el efectivo del cajón.
          </div>
        </div>

      </div>

      {/* Detailed Sales Orders Table */}
      <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-stone-700" />
            <h3 className="font-bold text-stone-900 text-sm">Registro Detallado de Ventas</h3>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar por ticket, cliente o sabor..."
              value={searchSale}
              onChange={(e) => setSearchSale(e.target.value)}
              className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentMethod | 'all')}
              className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-none"
            >
              <option value="all">Todos los pagos</option>
              <option value="efectivo">Solo Efectivo</option>
              <option value="transferencia_mp">Solo Mercado Pago</option>
              <option value="tarjeta">Solo Tarjeta</option>
            </select>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase font-semibold">
                <th className="py-2.5 px-3">N° Ticket</th>
                <th className="py-2.5 px-3">Fecha y Hora</th>
                <th className="py-2.5 px-3">Cliente / Detalle</th>
                <th className="py-2.5 px-3 text-center">Empanadas</th>
                <th className="py-2.5 px-3">Método Pago</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-right">Ganancia</th>
                <th className="py-2.5 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredSales.map((s) => (
                <tr key={s.id} className="hover:bg-stone-50/60 transition-colors">
                  <td className="py-3 px-3 font-bold text-stone-900">
                    #{s.saleNumber}
                  </td>
                  <td className="py-3 px-3 text-stone-600 tabular-nums">
                    {formatDateTime(s.timestamp)}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold text-stone-900">
                      {s.customerName || 'Consumidor Final'}
                    </span>
                    <span className="text-[11px] text-stone-400 block truncate max-w-[200px]">
                      {s.items.map((i) => `${i.quantity} ${i.name}`).join(', ')}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-amber-800 tabular-nums">
                    {s.totalEmpanadasCount} u.
                  </td>
                  <td className="py-3 px-3">
                    <span className="capitalize font-medium text-stone-700">
                      {s.paymentMethod.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-stone-900 tabular-nums">
                    {formatCurrency(s.total)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(s.profit)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => setLastCompletedSale(s)}
                      className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Ver Ticket
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
