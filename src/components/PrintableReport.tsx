import React from 'react';
import { useCentral } from '../context/CentralContext';
import { CentralLogo } from './CentralLogo';
import { fmtFechaLarga, fmtDateLabel, fmtMoney, fmtSignedMoney, nf, productId } from '../utils/centralHelpers';

export const PrintableReport: React.FC = () => {
  const {
    catalogo,
    sistemaStock,
    conteoActual,
    cierreCaja,
    currentFecha,
    currentTurno,
    currentEmpleado,
    horaInicio,
  } = useCentral();

  // Calculations for print
  let totalSistema = 0;
  let totalContado = 0;
  let difAbs = 0;

  catalogo.forEach((cat) => {
    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const sys = sistemaStock[pid]?.stock ?? 0;
        const entry = conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        totalSistema += sys;
        totalContado += contado;
        if (entry) {
          difAbs += Math.abs(contado - sys);
        }
      });
    });
  });

  const sumaPostnets = (cierreCaja.postnet_amarillo || 0) + (cierreCaja.postnet_rosa || 0) + (cierreCaja.postnet_blanco || 0);
  const difPostnets = sumaPostnets - (cierreCaja.online_local_sist || 0);
  const difEfectivo = (cierreCaja.efectivo_real || 0) - (cierreCaja.efectivo_mostrador_sist || 0);
  const saldoTotal = difPostnets + difEfectivo;

  return (
    <div id="printable-report" className="hidden print:block p-8 font-sans text-stone-900 bg-white">
      
      {/* Official Header */}
      <div className="flex items-center justify-between pb-4 border-b-4 border-[#123D26] mb-6">
        <div className="flex items-center gap-4">
          <CentralLogo size={60} />
          <div>
            <h1 className="text-2xl font-black text-[#123D26] uppercase tracking-tight">
              Central de Pizzas &amp; Empanadas
            </h1>
            <p className="text-sm font-bold text-stone-600">
              Sede Escobar · Acta Oficial de Cierre de Turno {currentTurno}
            </p>
          </div>
        </div>

        <div className="text-right text-xs">
          <p className="font-bold text-stone-900">{fmtDateLabel(currentFecha)}</p>
          <p className="text-stone-500">Responsable Cierre: {currentEmpleado?.nombre || 'Carlos'}</p>
          <p className="text-stone-500">Horario: {horaInicio} en adelante</p>
        </div>
      </div>

      {/* Audit Box: Who loaded what, date and time (PUNTO 10) */}
      <div className="mb-6 border-2 border-[#123D26] rounded-xl overflow-hidden bg-white shadow-2xs">
        <div className="bg-[#123D26] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
          <span>👥 Auditoría del Turno: Responsables y Horarios de Carga</span>
          <span className="text-[10px] text-emerald-300 font-mono-num font-normal">
            Página 1 · Registro Oficial de Operaciones
          </span>
        </div>
        <table className="w-full text-left text-xs font-sans">
          <thead>
            <tr className="bg-stone-100 border-b border-stone-300 text-stone-600 font-bold uppercase text-[10px]">
              <th className="py-2 px-3">Sección / Categoría</th>
              <th className="py-2 px-3">Colaborador</th>
              <th className="py-2 px-3 text-center">Hora de Carga</th>
              <th className="py-2 px-3 text-right">Detalle / Ítems</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {catalogo.map((cat) => {
              let prodsCounted = 0;
              let lastEmp = '';
              let lastHora = '';

              cat.grupos.forEach((g) => {
                g.productos.forEach((p) => {
                  const pid = productId(cat.id, p);
                  const entry = conteoActual[pid];
                  if (entry && Object.values(entry.ubic).some((v) => v > 0)) {
                    prodsCounted++;
                    if (!lastEmp && entry.empleado) lastEmp = entry.empleado;
                    if (!lastHora && entry.hora) lastHora = entry.hora;
                  }
                });
              });

              return (
                <tr key={cat.id} className="hover:bg-stone-50">
                  <td className="py-2 px-3 font-semibold text-stone-900">
                    Control de Stock · {cat.nombre}
                  </td>
                  <td className="py-2 px-3 font-bold text-[#1B5E38]">
                    {lastEmp || 'Sin registrar'}
                  </td>
                  <td className="py-2 px-3 text-center font-mono-num text-stone-600">
                    {lastHora || '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono-num text-stone-700">
                    {prodsCounted > 0 ? `${prodsCounted} productos contados` : 'Completo'}
                  </td>
                </tr>
              );
            })}
            {cierreCaja.existe && (
              <tr className="bg-emerald-50/50 font-medium">
                <td className="py-2 px-3 font-semibold text-emerald-950">
                  Cierre de Caja &amp; Postnets
                </td>
                <td className="py-2 px-3 font-bold text-emerald-900">
                  {cierreCaja.empleado || currentEmpleado?.nombre || 'Admin'}
                </td>
                <td className="py-2 px-3 text-center font-mono-num text-emerald-900">
                  {cierreCaja.hora || '—'}
                </td>
                <td className="py-2 px-3 text-right font-mono-num text-emerald-950 font-bold">
                  Postnets y Efectivo Rendidos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Caja Section (Con diseño balanceado y colores condicionales) */}
      {cierreCaja.existe && (
        <div className="mb-6 border-2 border-stone-300 rounded-xl p-4 bg-stone-50/50">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#123D26] mb-3">
            💰 2. Resumen de Cierre de Caja &amp; Valores
          </h2>

          <div className="grid grid-cols-3 gap-3 text-xs mb-3 text-center">
            {/* Box 1: Postnets */}
            <div className="p-3 bg-white rounded-xl border border-stone-200 flex flex-col justify-between">
              <div>
                <span className="block text-stone-500 font-bold uppercase text-[10px] mb-1">Postnets / Tarjetas</span>
                <span className="text-xl font-black font-mono-num text-stone-900 block">{fmtMoney(sumaPostnets)}</span>
                <span className="block text-xs font-semibold text-stone-600 mt-1">
                  Sistema: {fmtMoney(cierreCaja.online_local_sist || 0)}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-stone-100">
                <span className={`font-black text-sm block ${
                  difPostnets > 0 ? 'text-emerald-700' : difPostnets < 0 ? 'text-rose-600' : 'text-stone-700'
                }`}>
                  Dif: {difPostnets > 0 ? `+${fmtMoney(difPostnets)}` : difPostnets < 0 ? `-${fmtMoney(Math.abs(difPostnets))}` : '$ 0 (OK)'}
                </span>
                <span className="text-[10px] text-stone-400 block mt-0.5">
                  Am: {fmtMoney(cierreCaja.postnet_amarillo || 0)} | Ro: {fmtMoney(cierreCaja.postnet_rosa || 0)} | Bl: {fmtMoney(cierreCaja.postnet_blanco || 0)}
                </span>
              </div>
            </div>

            {/* Box 2: Efectivo */}
            <div className="p-3 bg-white rounded-xl border border-stone-200 flex flex-col justify-between">
              <div>
                <span className="block text-stone-500 font-bold uppercase text-[10px] mb-1">Efectivo Real en Caja</span>
                <span className="text-xl font-black font-mono-num text-stone-900 block">{fmtMoney(cierreCaja.efectivo_real || 0)}</span>
                <span className="block text-xs font-semibold text-stone-600 mt-1">
                  Sistema: {fmtMoney(cierreCaja.efectivo_mostrador_sist || 0)}
                </span>
                {cierreCaja.saldo_inicial_sist !== undefined && (
                  <span className="block text-[9px] text-stone-400 font-normal mt-0.5">
                    (Inicio + Mostr + PEYA - Gastos/Egr/Sueld)
                  </span>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-stone-100">
                <span className={`font-black text-sm block ${
                  difEfectivo > 0 ? 'text-emerald-700' : difEfectivo < 0 ? 'text-rose-600' : 'text-stone-700'
                }`}>
                  Dif: {difEfectivo > 0 ? `+${fmtMoney(difEfectivo)}` : difEfectivo < 0 ? `-${fmtMoney(Math.abs(difEfectivo))}` : '$ 0 (OK)'}
                </span>
                <span className="text-[10px] text-stone-400 block mt-0.5">Sobre de recaudación en mostrador</span>
              </div>
            </div>

            {/* Box 3: Saldo Consolidado */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between ${
              saldoTotal === 0 ? 'bg-emerald-50 border-emerald-300' : saldoTotal > 0 ? 'bg-emerald-50/80 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <div>
                <span className="block text-stone-600 font-bold uppercase text-[10px] mb-1">Saldo Final Consolidado</span>
                <span className={`text-2xl font-black font-mono-num block ${
                  saldoTotal === 0 ? 'text-stone-900' : saldoTotal > 0 ? 'text-emerald-800' : 'text-rose-700'
                }`}>
                  {saldoTotal > 0 ? `+${fmtMoney(saldoTotal)}` : saldoTotal < 0 ? `-${fmtMoney(Math.abs(saldoTotal))}` : '$ 0'}
                </span>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                  saldoTotal === 0 ? 'bg-emerald-200 text-emerald-900' : saldoTotal > 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                }`}>
                  {saldoTotal === 0 ? '✓ CAJA CUADRADA' : saldoTotal > 0 ? 'SOBRANTE' : 'FALTANTE'}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-stone-200/60 text-[10px] text-stone-600">
                <span>Efec: {fmtSignedMoney(difEfectivo)} | Post: {fmtSignedMoney(difPostnets)}</span>
              </div>
            </div>
          </div>

          {cierreCaja.observaciones && (
            <p className="text-xs text-stone-600 bg-white p-2 rounded-lg border border-stone-200">
              <strong>Observaciones:</strong> {cierreCaja.observaciones}
            </p>
          )}
        </div>
      )}

      {/* 3. Consolidado de Stock por Categoría (Scorecard visual de 5 categorías) */}
      <div className="mb-6 space-y-3">
        <div className="bg-[#123D26] text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-between">
          <span>📦 3. Consolidado de Stock: Balance y Desvíos por Categoría</span>
          <span className="text-emerald-200 text-[11px] font-mono-num font-normal">
            Sist: {nf(totalSistema)} u. | Cont: {nf(totalContado)} u. | Neto: {totalContado - totalSistema > 0 ? '+' : ''}{totalContado - totalSistema} u.
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2.5">
          {catalogo.map((cat) => {
            let catSys = 0;
            let catCont = 0;
            cat.grupos.forEach((g) => {
              g.productos.forEach((p) => {
                const pid = productId(cat.id, p);
                catSys += sistemaStock[pid]?.stock ?? 0;
                const entry = conteoActual[pid];
                if (entry) {
                  catCont += Object.values(entry.ubic).reduce((a, b) => a + b, 0);
                }
              });
            });
            const catDif = catCont - catSys;
            const pctDesvio = catSys > 0 ? (Math.abs(catDif) / catSys) * 100 : 0;
            const isExact = catDif === 0;
            const isHighDesvio = Math.abs(catDif) >= 3 || pctDesvio > 1.5;

            return (
              <div
                key={cat.id}
                className={`p-3 rounded-xl border text-center flex flex-col justify-between ${
                  isExact
                    ? 'bg-emerald-50 border-emerald-300'
                    : !isHighDesvio
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div>
                  <span className="text-[10px] font-bold uppercase text-stone-600 block truncate">
                    {cat.nombre}
                  </span>
                  <span className={`text-base font-black font-mono-num block mt-0.5 ${
                    isExact ? 'text-emerald-800' : catDif > 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {catDif > 0 ? `+${catDif}` : catDif} u.
                  </span>
                </div>
                <div className="mt-1.5 pt-1 border-t border-stone-200/60 text-[10px]">
                  <span className="text-stone-600 block">S: {nf(catSys)} | C: {nf(catCont)}</span>
                  <span className={`font-bold block mt-0.5 ${
                    isExact ? 'text-emerald-700' : !isHighDesvio ? 'text-emerald-800' : 'text-rose-700'
                  }`}>
                    {isExact ? '✓ OK' : `Desv: ${pctDesvio.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Products Table by Category */}
      <div className="space-y-6">
        {catalogo.map((cat) => {
          let catSys = 0;
          let catCont = 0;
          cat.grupos.forEach((g) => {
            g.productos.forEach((p) => {
              const pid = productId(cat.id, p);
              catSys += sistemaStock[pid]?.stock ?? 0;
              const entry = conteoActual[pid];
              if (entry) {
                catCont += Object.values(entry.ubic).reduce((a, b) => a + b, 0);
              }
            });
          });
          const catDif = catCont - catSys;
          const difStr = catDif > 0 ? `+${nf(catDif)}` : nf(catDif);

          return (
            <div key={cat.id} className="border border-stone-300 rounded-xl overflow-hidden">
              <div className="bg-[#123D26] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span>CATEGORÍA: {cat.nombre}</span>
                  <span className="bg-emerald-800 text-emerald-100 px-2 py-0.5 rounded text-[11px] font-mono-num font-normal">
                    Sist: {nf(catSys)} &nbsp;|&nbsp; Cont: {nf(catCont)} &nbsp;|&nbsp; Dif: {difStr}
                  </span>
                </span>
              </div>
              <table className="w-full text-left text-xs font-mono-num">
              <thead>
                <tr className="bg-stone-100 border-b border-stone-300 text-stone-600 font-bold uppercase text-[10px]">
                  <th className="py-2 px-3 font-sans">Producto</th>
                  <th className="py-2 px-3 text-right">Sistema</th>
                  <th className="py-2 px-3 text-right">Contado</th>
                  <th className="py-2 px-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {cat.grupos.flatMap((g) => g.productos).map((p) => {
                  const pid = productId(cat.id, p);
                  const sys = sistemaStock[pid]?.stock ?? 0;
                  const entry = conteoActual[pid];
                  const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
                  const diff = contado - sys;

                  return (
                    <tr key={pid}>
                      <td className="py-1.5 px-3 font-sans font-medium text-stone-800">{p.nombre}</td>
                      <td className="py-1.5 px-3 text-right text-stone-600">{nf(sys)}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-stone-900">{nf(contado)}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-stone-800">
                        {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>

      {/* Signature block */}
      <div className="mt-12 pt-8 border-t border-stone-300 flex justify-between text-xs text-stone-500">
        <div className="text-center w-48">
          <div className="border-b border-stone-400 mb-1 h-8"></div>
          <p>Firma Encargado del Turno</p>
        </div>
        <div className="text-center w-48">
          <div className="border-b border-stone-400 mb-1 h-8"></div>
          <p>Firma Supervisión / Central</p>
        </div>
      </div>

    </div>
  );
};
