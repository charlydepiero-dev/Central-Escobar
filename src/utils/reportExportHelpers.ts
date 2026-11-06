import * as XLSX from 'xlsx';
import { CategoriaCatalogo, MapaConteos, MapaSistemaStock, CierreCajaData } from '../types/central';
import { productId, nf } from './centralHelpers';

export interface ReportExportParams {
  mode: 'resumen' | 'detalle' | 'comparar' | 'evolucion';
  fecha: string;
  turno: string;
  cerradoPor: string;
  catalogo: CategoriaCatalogo[];
  sistemaStock: MapaSistemaStock;
  conteoActual: MapaConteos;
  cierreCaja: CierreCajaData;
  summary: {
    totalSistema: number;
    totalContado: number;
    difAbs: number;
    prodsConDif: number;
    prodsContados: number;
    prodsSinContar: number;
    cobertura: number;
    topDiferencias: Array<{
      categoria: string;
      producto: string;
      sistema: number;
      contado: number;
      diferencia: number;
      empleado?: string;
    }>;
  };
  // Compare specifics
  compareAKey?: string;
  compareBKey?: string;
  snapA?: { conteos: Record<string, any>; sistema: Record<string, any> };
  snapB?: { conteos: Record<string, any>; sistema: Record<string, any> };
  // Evolution specifics
  evolucionDays?: Array<{ key: string; label: string; dateIso: string }>;
  getProductDayDiff?: (catId: string, p: { codigo: string; nombre: string }, day: any) => number;
}

export function exportReportToExcel(params: ReportExportParams) {
  const wb = XLSX.utils.book_new();
  const { mode, fecha, turno, cerradoPor } = params;

  if (mode === 'resumen') {
    const rows: any[][] = [];
    rows.push(['CENTRAL DE PIZZAS & EMPANADAS - INFORME RESUMEN EJECUTIVO']);
    rows.push(['Fecha:', fecha, 'Turno:', turno, 'Generado por:', cerradoPor]);
    rows.push([]);

    // 1. Resumen de Stock
    const totalDifNeto = params.summary.totalContado - params.summary.totalSistema;
    const precision = params.summary.totalSistema > 0
      ? Math.max(0, 100 - (params.summary.difAbs / params.summary.totalSistema) * 100).toFixed(1) + '%'
      : '100%';

    rows.push(['INDICADORES GLOBALES DE STOCK']);
    rows.push(['Indicador', 'Valor']);
    rows.push(['Total Stock Sistema', params.summary.totalSistema]);
    rows.push(['Total Stock Contado', params.summary.totalContado]);
    rows.push(['Desvío Neto Unidades', totalDifNeto]);
    rows.push(['Diferencia Absoluta Unidades', params.summary.difAbs]);
    rows.push(['Precisión Global de Stock', precision]);
    rows.push(['Cobertura de Conteo', `${params.summary.cobertura}% (${params.summary.prodsContados} ítems)`]);
    rows.push([]);

    // 2. Resumen de Caja
    const efReal = params.cierreCaja.efectivo_real || 0;
    const efSist = params.cierreCaja.efectivo_mostrador_sist || 0;
    const difEf = efReal - efSist;

    const postnetReal = (params.cierreCaja.postnet_amarillo || 0) + (params.cierreCaja.postnet_rosa || 0) + (params.cierreCaja.postnet_blanco || 0);
    const postnetSist = params.cierreCaja.online_local_sist || 0;
    const difPost = postnetReal - postnetSist;
    const saldoTotal = difEf + difPost;

    rows.push(['BALANCE DE CAJA Y VALORES']);
    rows.push(['Rubro', 'Declarado Real ($)', 'Sistema Datalive ($)', 'Diferencia ($)']);
    rows.push(['Efectivo en Mostrador', efReal, efSist, difEf]);
    rows.push(['Tarjetas y Postnets', postnetReal, postnetSist, difPost]);
    rows.push(['Saldo Consolidado Caja', saldoTotal, '', saldoTotal === 0 ? 'CUADRADA' : saldoTotal > 0 ? 'SOBRANTE' : 'FALTANTE']);
    if (params.cierreCaja.observaciones) {
      rows.push(['Observaciones de Caja', params.cierreCaja.observaciones]);
    }
    rows.push([]);

    // 3. Consolidado por Categoría
    rows.push(['CONSOLIDADO POR CATEGORÍA']);
    rows.push(['Categoría', 'Stock Sistema', 'Stock Contado', 'Diferencia', 'Estado']);
    params.catalogo.forEach((cat) => {
      let sys = 0;
      let cont = 0;
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          sys += params.sistemaStock[pid]?.stock ?? 0;
          const entry = params.conteoActual[pid];
          cont += entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        });
      });
      const d = cont - sys;
      rows.push([cat.nombre, sys, cont, d, d === 0 ? 'Exacto' : d > 0 ? `+${d}` : `${d}`]);
    });
    rows.push([]);

    // 4. Top Diferencias
    if (params.summary.topDiferencias.length > 0) {
      rows.push(['PRINCIPALES DESVÍOS DETECTADOS']);
      rows.push(['Categoría', 'Producto', 'Sistema', 'Contado', 'Diferencia', 'Responsable']);
      params.summary.topDiferencias.forEach((item) => {
        rows.push([item.categoria, item.producto, item.sistema, item.contado, item.diferencia, item.empleado || '—']);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
  } else if (mode === 'detalle') {
    const rows: any[][] = [];
    rows.push(['CENTRAL DE PIZZAS & EMPANADAS - DETALLE DE CONTEO FÍSICO']);
    rows.push(['Fecha:', fecha, 'Turno:', turno, 'Auditado por:', cerradoPor]);
    rows.push([]);

    rows.push(['Categoría', 'Código', 'Producto', 'Sistema Datalive', 'Total Contado', 'Diferencia', 'Responsable', 'Hora']);

    let totalSysAll = 0;
    let totalContAll = 0;

    params.catalogo.forEach((cat) => {
      let catSys = 0;
      let catCont = 0;

      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = params.sistemaStock[pid]?.stock ?? 0;
          const entry = params.conteoActual[pid];
          const cont = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          const d = entry ? cont - sys : -sys;

          catSys += sys;
          catCont += cont;
          totalSysAll += sys;
          totalContAll += cont;

          rows.push([
            cat.nombre,
            p.codigo || '—',
            p.nombre,
            sys,
            entry ? cont : 'Sin contar',
            entry ? d : '—',
            entry?.empleado || '—',
            entry?.hora || '—',
          ]);
        });
      });

      // Subtotal de Categoría
      const catDif = catCont - catSys;
      rows.push([
        `SUBTOTAL ${cat.nombre.toUpperCase()}`,
        '',
        '',
        catSys,
        catCont,
        catDif,
        '',
        '',
      ]);
    });

    rows.push([]);
    rows.push([
      'TOTAL GENERAL CONSOLIDADO',
      '',
      '',
      totalSysAll,
      totalContAll,
      totalContAll - totalSysAll,
      '',
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Conteo');
  } else if (mode === 'comparar') {
    const rows: any[][] = [];
    const snapA = params.snapA || { conteos: {}, sistema: {} };
    const snapB = params.snapB || { conteos: {}, sistema: {} };

    rows.push(['CENTRAL DE PIZZAS & EMPANADAS - COMPARATIVA DE TURNOS']);
    rows.push(['Turno A:', params.compareAKey || 'Turno A', 'Turno B:', params.compareBKey || 'Turno B', 'Fecha:', fecha]);
    rows.push([]);

    rows.push([
      'Categoría',
      'Código',
      'Producto',
      `Contado (${params.compareAKey})`,
      `Sistema (${params.compareAKey})`,
      `Dif (${params.compareAKey})`,
      `Contado (${params.compareBKey})`,
      `Sistema (${params.compareBKey})`,
      `Dif (${params.compareBKey})`,
      'Delta (B vs A)',
    ]);

    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);

          const entryA = snapA.conteos[pid];
          const contA: number = entryA ? Object.values(entryA.ubic).reduce((a: number, b: any) => a + Number(b || 0), 0) : 0;
          const sysA: number = snapA.sistema[pid]?.stock ?? 0;
          const difA = contA - sysA;

          const entryB = snapB.conteos[pid];
          const contB: number = entryB ? Object.values(entryB.ubic).reduce((a: number, b: any) => a + Number(b || 0), 0) : 0;
          const sysB: number = snapB.sistema[pid]?.stock ?? 0;
          const difB = contB - sysB;

          const delta = contB - contA;

          rows.push([
            cat.nombre,
            p.codigo || '—',
            p.nombre,
            contA,
            sysA,
            difA,
            contB,
            sysB,
            difB,
            delta,
          ]);
        });
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativa');
  } else if (mode === 'evolucion') {
    const rows: any[][] = [];
    const days = params.evolucionDays || [];

    rows.push(['CENTRAL DE PIZZAS & EMPANADAS - EVOLUCIÓN HISTÓRICA DE DESVÍOS']);
    rows.push(['Fecha:', fecha, 'Turno:', turno, 'Generado por:', cerradoPor]);
    rows.push([]);

    rows.push([
      'Código',
      'Producto',
      'Categoría',
      ...days.map((d) => d.label),
      'Desvío Acumulado',
    ]);

    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const diffs = days.map((d) => (params.getProductDayDiff ? params.getProductDayDiff(cat.id, p, d) : 0));
          const acum = diffs.reduce((a, b) => a + b, 0);

          rows.push([
            p.codigo || '—',
            p.nombre,
            cat.nombre,
            ...diffs,
            acum,
          ]);
        });
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Evolución');
  }

  const filename = `Reporte_${mode}_${fecha}_${turno.toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportReportToCSV(params: ReportExportParams) {
  const { mode, fecha, turno, cerradoPor } = params;
  const sep = ';';
  const lines: string[] = [];

  if (mode === 'resumen') {
    lines.push(['Indicador', 'Valor'].join(sep));
    lines.push(['Fecha', fecha].join(sep));
    lines.push(['Turno', turno].join(sep));
    lines.push(['Generado por', `"${cerradoPor}"`].join(sep));
    lines.push(['Total Stock Sistema', String(params.summary.totalSistema)].join(sep));
    lines.push(['Total Stock Contado', String(params.summary.totalContado)].join(sep));
    lines.push(['Desvío Neto Unidades', String(params.summary.totalContado - params.summary.totalSistema)].join(sep));
    lines.push(['Diferencia Absoluta', String(params.summary.difAbs)].join(sep));
    lines.push(['Caja Efectivo Real', String(params.cierreCaja.efectivo_real || 0)].join(sep));
    lines.push(['Caja Efectivo Sistema', String(params.cierreCaja.efectivo_mostrador_sist || 0)].join(sep));
    lines.push(['Diferencia Efectivo', String((params.cierreCaja.efectivo_real || 0) - (params.cierreCaja.efectivo_mostrador_sist || 0))].join(sep));
    const postReal = (params.cierreCaja.postnet_amarillo || 0) + (params.cierreCaja.postnet_rosa || 0) + (params.cierreCaja.postnet_blanco || 0);
    lines.push(['Caja Postnets Real', String(postReal)].join(sep));
    lines.push(['Caja Postnets Sistema', String(params.cierreCaja.online_local_sist || 0)].join(sep));
    lines.push(['Diferencia Postnets', String(postReal - (params.cierreCaja.online_local_sist || 0))].join(sep));
    lines.push(['Observaciones Caja', `"${params.cierreCaja.observaciones || 'Sin observaciones'}"`].join(sep));
  } else if (mode === 'detalle') {
    lines.push(['Categoria', 'Codigo', 'Producto', 'Sistema', 'Contado', 'Diferencia', 'Responsable', 'Hora'].join(sep));
    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = params.sistemaStock[pid]?.stock ?? 0;
          const entry = params.conteoActual[pid];
          const cont = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : '';
          const diff = entry ? (Number(cont) - sys) : '';

          lines.push([
            `"${cat.nombre}"`,
            `"${p.codigo || ''}"`,
            `"${p.nombre}"`,
            String(sys),
            String(cont),
            String(diff),
            `"${entry?.empleado || ''}"`,
            `"${entry?.hora || ''}"`,
          ].join(sep));
        });
      });
    });
  } else if (mode === 'comparar') {
    const snapA = params.snapA || { conteos: {}, sistema: {} };
    const snapB = params.snapB || { conteos: {}, sistema: {} };
    lines.push(['Categoria', 'Codigo', 'Producto', `Contado_${params.compareAKey}`, `Sistema_${params.compareAKey}`, `Dif_${params.compareAKey}`, `Contado_${params.compareBKey}`, `Sistema_${params.compareBKey}`, `Dif_${params.compareBKey}`, 'Delta_B_vs_A'].join(sep));

    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);

          const entryA = snapA.conteos[pid];
          const contA: number = entryA ? Object.values(entryA.ubic).reduce((a: number, b: any) => a + Number(b || 0), 0) : 0;
          const sysA: number = snapA.sistema[pid]?.stock ?? 0;
          const difA = contA - sysA;

          const entryB = snapB.conteos[pid];
          const contB: number = entryB ? Object.values(entryB.ubic).reduce((a: number, b: any) => a + Number(b || 0), 0) : 0;
          const sysB: number = snapB.sistema[pid]?.stock ?? 0;
          const difB = contB - sysB;

          lines.push([
            `"${cat.nombre}"`,
            `"${p.codigo || ''}"`,
            `"${p.nombre}"`,
            String(contA),
            String(sysA),
            String(difA),
            String(contB),
            String(sysB),
            String(difB),
            String(contB - contA),
          ].join(sep));
        });
      });
    });
  } else if (mode === 'evolucion') {
    const days = params.evolucionDays || [];
    lines.push(['Codigo', 'Producto', 'Categoria', ...days.map((d) => d.label), 'Desvio_Acumulado'].join(sep));

    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const diffs = days.map((d) => (params.getProductDayDiff ? params.getProductDayDiff(cat.id, p, d) : 0));
          const acum = diffs.reduce((a, b) => a + b, 0);

          lines.push([
            `"${p.codigo || ''}"`,
            `"${p.nombre}"`,
            `"${cat.nombre}"`,
            ...diffs.map((d) => String(d)),
            String(acum),
          ].join(sep));
        });
      });
    });
  }

  const content = '\uFEFF' + lines.join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_${mode}_${fecha}_${turno.toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
