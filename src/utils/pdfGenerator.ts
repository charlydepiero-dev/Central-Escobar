import { jsPDF } from 'jspdf';
import { CierreCajaData, TurnoCierre, MapaConteos, MapaSistemaStock, CategoriaCatalogo, Empleado, MapaReclamos } from '../types/central';
import { productId, nf, fmtMoney, fmtSignedMoney, fmtDateLabel, abrirWhatsApp } from './centralHelpers';
import { uploadPdfToGoogleDrive } from '../services/googleDriveService';

export interface PDFReportData {
  fecha: string;
  turno: string;
  cerradoPor: string;
  horaCierre: string;
  catalogo: CategoriaCatalogo[];
  sistemaStock: MapaSistemaStock;
  conteoActual: MapaConteos;
  cierreCaja: CierreCajaData;
  reclamos: MapaReclamos;
  empleados?: Empleado[];
  pastTurnos?: TurnoCierre[];
  vistaReporte?: 'resumen' | 'detalle' | 'comparar' | 'evolucion';
}

// Colors definition
const greenPrimary = [18, 61, 38]; // #123D26
const greenAccent = [27, 94, 56]; // #1B5E38
const stoneDark = [30, 41, 59];
const stoneMuted = [100, 116, 139];
const stoneLightBg = [248, 250, 252];
const borderColor = [226, 232, 240];

// Common header drawer
function drawCommonHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  pageNumber: number,
  totalPages: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  y: number
): number {
  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.rect(margin, y, contentWidth, 16, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, margin + 5, y + 6.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, margin + 5, y + 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pág. ${pageNumber}/${totalPages}`, pageWidth - margin - 5, y + 9.5, { align: 'right' });

  return y + 19;
}

// Subheader meta bar
function drawMetaBar(
  doc: jsPDF,
  items: { label: string; val: string }[],
  margin: number,
  contentWidth: number,
  y: number
): number {
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, 8, 'FD');

  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  const step = contentWidth / items.length;
  items.forEach((it, idx) => {
    const x = margin + 4 + idx * step;
    doc.text(`${it.label}: ${it.val}`, x, y + 5.2);
  });

  return y + 11.5;
}

// -------------------------------------------------------------
// 1. INFORME EXCLUSIVO RESUMEN (generateResumenReportPDF)
// -------------------------------------------------------------
export function generateResumenReportPDF(data: PDFReportData): { doc: jsPDF; blob: Blob; file: File; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  y = drawCommonHeader(
    doc,
    'CENTRAL DE PIZZAS & EMPANADAS',
    'SEDE ESCOBAR · REPORTE RESUMEN EJECUTIVO DE STOCK & CAJA',
    1,
    1,
    margin,
    contentWidth,
    pageWidth,
    y
  );

  y = drawMetaBar(
    doc,
    [
      { label: 'Fecha', val: fmtDateLabel(data.fecha) },
      { label: 'Turno', val: data.turno.toUpperCase() },
      { label: 'Generado por', val: data.cerradoPor || 'Admin' },
      { label: 'Hora', val: `${data.horaCierre || '—'} hs` },
    ],
    margin,
    contentWidth,
    y
  );

  // 1. BALANCE DE CAJA RESUMIDO
  const sumaPostnets = (data.cierreCaja.postnet_amarillo || 0) + (data.cierreCaja.postnet_rosa || 0) + (data.cierreCaja.postnet_blanco || 0);
  const sistPostnets = data.cierreCaja.online_local_sist || 0;
  const difPostnets = sumaPostnets - sistPostnets;

  const realEfectivo = data.cierreCaja.efectivo_real || 0;
  const sistEfectivo = data.cierreCaja.efectivo_mostrador_sist || 0;
  const difEfectivo = realEfectivo - sistEfectivo;
  const saldoTotal = difPostnets + difEfectivo;

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 6.5, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('1. RESUMEN DE CIERRE DE CAJA & POSTNETS', margin + 4, y + 4.5);
  y += 8.5;

  const colWidth = (contentWidth - 6) / 3;
  const boxHeight = 22;

  // Box 1: Postnets
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('POSTNETS / TARJETAS', margin + 3.5, y + 4.5);
  doc.setFontSize(10);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Real: ${fmtMoney(sumaPostnets)}`, margin + 3.5, y + 9.5);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Sistema: ${fmtMoney(sistPostnets)}`, margin + 3.5, y + 13.8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  if (difPostnets > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Dif: +${fmtMoney(difPostnets)}`, margin + 3.5, y + 18);
  } else if (difPostnets < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Dif: -${fmtMoney(Math.abs(difPostnets))}`, margin + 3.5, y + 18);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Dif: $ 0 (Exacto)`, margin + 3.5, y + 18);
  }

  // Box 2: Efectivo
  const xCol2 = margin + colWidth + 3;
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(xCol2, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO REAL EN CAJA', xCol2 + 3.5, y + 4.5);
  doc.setFontSize(10);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Real: ${fmtMoney(realEfectivo)}`, xCol2 + 3.5, y + 9.5);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Sistema: ${fmtMoney(sistEfectivo)}`, xCol2 + 3.5, y + 13.8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  if (difEfectivo > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Dif: +${fmtMoney(difEfectivo)}`, xCol2 + 3.5, y + 18);
  } else if (difEfectivo < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Dif: -${fmtMoney(Math.abs(difEfectivo))}`, xCol2 + 3.5, y + 18);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Dif: $ 0 (Exacto)`, xCol2 + 3.5, y + 18);
  }

  // Box 3: Saldo Final Consolidado
  const xCol3 = margin + (colWidth + 3) * 2;
  const isCajaCuadrada = saldoTotal === 0;
  doc.setFillColor(isCajaCuadrada ? 240 : saldoTotal > 0 ? 236 : 255, isCajaCuadrada ? 253 : saldoTotal > 0 ? 253 : 241, isCajaCuadrada ? 244 : saldoTotal > 0 ? 245 : 242);
  doc.setDrawColor(isCajaCuadrada ? 167 : saldoTotal > 0 ? 167 : 254, isCajaCuadrada ? 243 : saldoTotal > 0 ? 243 : 205, isCajaCuadrada ? 208 : saldoTotal > 0 ? 208 : 211);
  doc.roundedRect(xCol3, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('SALDO FINAL CONSOLIDADO', xCol3 + 3.5, y + 4.5);
  doc.setFontSize(10);
  if (saldoTotal > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Neto: +${fmtMoney(saldoTotal)}`, xCol3 + 3.5, y + 9.5);
  } else if (saldoTotal < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Neto: -${fmtMoney(Math.abs(saldoTotal))}`, xCol3 + 3.5, y + 9.5);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Neto: $ 0`, xCol3 + 3.5, y + 9.5);
  }
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isCajaCuadrada ? 22 : saldoTotal > 0 ? 22 : 225, isCajaCuadrada ? 101 : saldoTotal > 0 ? 101 : 29, isCajaCuadrada ? 52 : saldoTotal > 0 ? 52 : 72);
  doc.text(`Estado: ${isCajaCuadrada ? '✓ CAJA CUADRADA' : saldoTotal > 0 ? 'SOBRANTE' : 'FALTANTE'}`, xCol3 + 3.5, y + 13.8);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Ef: ${fmtSignedMoney(difEfectivo)} | Post: ${fmtSignedMoney(difPostnets)}`, xCol3 + 3.5, y + 18);

  y += boxHeight + 4;

  if (data.cierreCaja.observaciones) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Observaciones de caja: ${data.cierreCaja.observaciones}`, margin + 2, y);
    y += 5;
  }

  // 2. CONSOLIDADO DE STOCK (7 CATEGORÍAS)
  let totalSistema = 0;
  let totalContado = 0;
  let difAbs = 0;
  let totalProds = 0;
  let prodsConDif = 0;

  interface SubCategoryStat {
    id: string;
    nombre: string;
    sys: number;
    cont: number;
    dif: number;
    pctDesvio: number;
    prodsCount: number;
    prodsDiff: number;
  }

  const categoryStats: SubCategoryStat[] = [];
  const topDiffsList: { cat: string; nombre: string; sys: number; cont: number; dif: number }[] = [];

  data.catalogo.forEach((cat) => {
    if (cat.id === 'panificados') {
      let pizzaSys = 0, pizzaCont = 0, pizzaCount = 0, pizzaDiffCount = 0;
      let mediaSys = 0, mediaCont = 0, mediaCount = 0, mediaDiffCount = 0;

      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = data.sistemaStock[pid]?.stock ?? 0;
          const entry = data.conteoActual[pid];
          const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          const isMedia = p.nombre.toLowerCase().includes('medialuna') || p.codigo === '11029';

          totalSistema += sys;
          totalContado += contado;
          totalProds++;
          const d = entry ? contado - sys : 0;
          if (entry && d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
            topDiffsList.push({ cat: cat.nombre, nombre: p.nombre, sys, cont: contado, dif: d });
          }

          if (isMedia) {
            mediaSys += sys;
            mediaCont += contado;
            mediaCount++;
            if (entry && d !== 0) mediaDiffCount++;
          } else {
            pizzaSys += sys;
            pizzaCont += contado;
            pizzaCount++;
            if (entry && d !== 0) pizzaDiffCount++;
          }
        });
      });

      const pzDif = pizzaCont - pizzaSys;
      categoryStats.push({
        id: 'pizzas',
        nombre: 'Pizzas / Masas',
        sys: pizzaSys,
        cont: pizzaCont,
        dif: pzDif,
        pctDesvio: pizzaSys > 0 ? (Math.abs(pzDif) / pizzaSys) * 100 : 0,
        prodsCount: pizzaCount,
        prodsDiff: pizzaDiffCount,
      });

      const mdDif = mediaCont - mediaSys;
      categoryStats.push({
        id: 'medialunas',
        nombre: 'Medialunas',
        sys: mediaSys,
        cont: mediaCont,
        dif: mdDif,
        pctDesvio: mediaSys > 0 ? (Math.abs(mdDif) / mediaSys) * 100 : 0,
        prodsCount: mediaCount,
        prodsDiff: mediaDiffCount,
      });
      return;
    }

    if (cat.id === 'sandwich_panchos') {
      let sandSys = 0, sandCont = 0, sandCount = 0, sandDiffCount = 0;
      let salchSys = 0, salchCont = 0, salchCount = 0, salchDiffCount = 0;

      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = data.sistemaStock[pid]?.stock ?? 0;
          const entry = data.conteoActual[pid];
          const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          const isSalch = p.nombre.toLowerCase().includes('salchicha') || p.nombre.toLowerCase().includes('pancho') || p.codigo === '22445';

          totalSistema += sys;
          totalContado += contado;
          totalProds++;
          const d = entry ? contado - sys : 0;
          if (entry && d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
            topDiffsList.push({ cat: cat.nombre, nombre: p.nombre, sys, cont: contado, dif: d });
          }

          if (isSalch) {
            salchSys += sys;
            salchCont += contado;
            salchCount++;
            if (entry && d !== 0) salchDiffCount++;
          } else {
            sandSys += sys;
            sandCont += contado;
            sandCount++;
            if (entry && d !== 0) sandDiffCount++;
          }
        });
      });

      const sDif = sandCont - sandSys;
      categoryStats.push({
        id: 'sandwiches',
        nombre: 'Sandwiches',
        sys: sandSys,
        cont: sandCont,
        dif: sDif,
        pctDesvio: sandSys > 0 ? (Math.abs(sDif) / sandSys) * 100 : 0,
        prodsCount: sandCount,
        prodsDiff: sandDiffCount,
      });

      const slDif = salchCont - salchSys;
      categoryStats.push({
        id: 'panchos',
        nombre: 'Panchos',
        sys: salchSys,
        cont: salchCont,
        dif: slDif,
        pctDesvio: salchSys > 0 ? (Math.abs(slDif) / salchSys) * 100 : 0,
        prodsCount: salchCount,
        prodsDiff: salchDiffCount,
      });
      return;
    }

    let catSys = 0;
    let catCont = 0;
    let catProdsCount = 0;
    let catProdsDiff = 0;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        catSys += sys;
        catCont += contado;
        catProdsCount++;
        totalSistema += sys;
        totalContado += contado;
        totalProds++;
        if (entry) {
          const d = contado - sys;
          if (d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
            catProdsDiff++;
            topDiffsList.push({ cat: cat.nombre, nombre: p.nombre, sys, cont: contado, dif: d });
          }
        }
      });
    });

    const catDif = catCont - catSys;
    categoryStats.push({
      id: cat.id,
      nombre: cat.nombre,
      sys: catSys,
      cont: catCont,
      dif: catDif,
      pctDesvio: catSys > 0 ? (Math.abs(catDif) / catSys) * 100 : 0,
      prodsCount: catProdsCount,
      prodsDiff: catProdsDiff,
    });
  });

  const totalDifNeto = totalContado - totalSistema;
  const precisionGlobal = totalSistema > 0 ? Math.max(0, 100 - (difAbs / totalSistema) * 100).toFixed(1) : '100';

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 6.5, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('2. CONSOLIDADO DE STOCK: BALANCE Y DESVÍOS POR CATEGORÍA', margin + 4, y + 4.5);
  y += 8.5;

  // Global KPI line: 2-line layout with clear horizontal separation so it NEVER overlaps!
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, contentWidth, 9.5, 1, 1, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.setFont('helvetica', 'bold');

  // Fila 1: Totales de Sistema y Contado
  doc.text(`TOTAL SISTEMA: ${nf(totalSistema)} u.`, margin + 4, y + 4.2);
  doc.text(`TOTAL CONTADO: ${nf(totalContado)} u.`, margin + 80, y + 4.2);

  // Fila 2: Desvío Neto (izq) y Precisión (der)
  const isPos = totalDifNeto > 0;
  const isExact = totalDifNeto === 0;
  doc.setTextColor(isExact ? 22 : isPos ? 22 : 225, isExact ? 101 : isPos ? 101 : 29, isExact ? 52 : isPos ? 52 : 72);
  doc.text(`DESVÍO NETO: ${isPos ? '+' : ''}${totalDifNeto} u.  (Dif. Abs: ${nf(difAbs)} u.)`, margin + 4, y + 7.8);

  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`PRECISIÓN: ${precisionGlobal}% (${totalProds - prodsConDif}/${totalProds} OK)`, pageWidth - margin - 4, y + 7.8, { align: 'right' });

  y += 12;

  // Category Cards (7 cards in 2 rows)
  const catCount = categoryStats.length;
  const cardsPerRow = 4;
  const gap = 2.5;
  const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardHeight = 22;

  categoryStats.forEach((catStat, idx) => {
    const row = Math.floor(idx / cardsPerRow);
    const col = idx % cardsPerRow;
    const cardX = margin + col * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);

    const isEx = catStat.dif === 0;
    const isP = catStat.dif > 0;
    const isHighDesvio = Math.abs(catStat.dif) >= 3 || catStat.pctDesvio > 1.5;

    if (isEx) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
    } else if (!isHighDesvio) {
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
    } else {
      doc.setFillColor(255, 241, 242);
      doc.setDrawColor(254, 205, 211);
    }
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    const shortName = catStat.nombre.length > 14 ? catStat.nombre.slice(0, 13) + '..' : catStat.nombre;
    doc.text(shortName.toUpperCase(), cardX + 2.5, cardY + 4.5);

    doc.setFontSize(9.5);
    if (isEx) {
      doc.setTextColor(22, 101, 52);
      doc.text('DIF: 0 u.', cardX + 2.5, cardY + 9.8);
    } else if (isP) {
      doc.setTextColor(isHighDesvio ? 225 : 22, isHighDesvio ? 29 : 101, isHighDesvio ? 72 : 52);
      doc.text(`DIF: +${catStat.dif} u.`, cardX + 2.5, cardY + 9.8);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`DIF: ${catStat.dif} u.`, cardX + 2.5, cardY + 9.8);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Sist: ${nf(catStat.sys)} | Cont: ${nf(catStat.cont)}`, cardX + 2.5, cardY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    if (isEx) {
      doc.setTextColor(22, 101, 52);
      doc.text('✓ Precisión 100%', cardX + 2.5, cardY + 18.2);
    } else if (!isHighDesvio) {
      doc.setTextColor(isP ? 22 : 185, isP ? 101 : 28, isP ? 52 : 28);
      doc.text(`Desvío leve (${catStat.pctDesvio.toFixed(1)}%)`, cardX + 2.5, cardY + 18.2);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`⚠ ALERTA (${catStat.pctDesvio.toFixed(1)}%)`, cardX + 2.5, cardY + 18.2);
    }
  });

  const numRows = Math.ceil(catCount / cardsPerRow);
  y += numRows * (cardHeight + gap) + 3;

  // 3. TOP DIFERENCIAS DETECTADAS (si existen)
  const top10 = topDiffsList.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 6);
  if (top10.length > 0 && y < pageHeight - margin - 35) {
    doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1, 1, 'FD');
    doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('3. PRINCIPALES DIFERENCIAS DE STOCK DETECTADAS', margin + 4, y + 4);
    y += 7;

    doc.setFontSize(7);
    top10.forEach((item, i) => {
      if (y > pageHeight - margin - 22) return;
      if (i % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F');
      }
      doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(item.nombre, margin + 4, y + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
      doc.text(item.cat, margin + 85, y + 3);
      doc.text(`Sist: ${nf(item.sys)} | Cont: ${nf(item.cont)}`, margin + 130, y + 3);

      doc.setFont('helvetica', 'bold');
      if (item.dif > 0) {
        doc.setTextColor(22, 101, 52);
        doc.text(`+${item.dif}`, pageWidth - margin - 4, y + 3, { align: 'right' });
      } else {
        doc.setTextColor(225, 29, 72);
        doc.text(`${item.dif}`, pageWidth - margin - 4, y + 3, { align: 'right' });
      }
      y += 4.5;
    });
  }

  // Firmas al pie
  y = pageHeight - margin - 18;
  doc.setDrawColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.line(margin + 10, y + 8, margin + 65, y + 8);
  doc.line(pageWidth - margin - 65, y + 8, pageWidth - margin - 10, y + 8);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('Firma Responsable de Turno', margin + 37.5, y + 12, { align: 'center' });
  doc.text('Firma Gerencia / Central', pageWidth - margin - 37.5, y + 12, { align: 'center' });

  const filename = `Reporte_Resumen_Central_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { doc, blob, file, filename };
}

// -------------------------------------------------------------
// 2. INFORME EXCLUSIVO DETALLE (generateDetalleReportPDF)
// -------------------------------------------------------------
export function generateDetalleReportPDF(data: PDFReportData): { doc: jsPDF; blob: Blob; file: File; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let pageNumber = 1;

  const drawDetalleHeader = () => {
    y = drawCommonHeader(
      doc,
      'CENTRAL DE PIZZAS & EMPANADAS',
      'SEDE ESCOBAR · REPORTE DETALLE DE CONTEO FÍSICO DE STOCK',
      pageNumber,
      // Total pages will be estimated or shown dynamically
      3,
      margin,
      contentWidth,
      pageWidth,
      margin
    );

    y = drawMetaBar(
      doc,
      [
        { label: 'Fecha', val: fmtDateLabel(data.fecha) },
        { label: 'Turno', val: data.turno.toUpperCase() },
        { label: 'Auditado por', val: data.cerradoPor || 'Admin' },
        { label: 'Hora', val: `${data.horaCierre || '—'} hs` },
      ],
      margin,
      contentWidth,
      y
    );

    // Columns bar
    doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CÓD.', margin + 2, y + 3.8);
    doc.text('PRODUCTO', margin + 14, y + 3.8);
    doc.text('SISTEMA', margin + 82, y + 3.8, { align: 'right' });
    doc.text('CONTADO', margin + 104, y + 3.8, { align: 'right' });
    doc.text('DIF.', margin + 124, y + 3.8, { align: 'right' });
    doc.text('RESPONSABLE / HORA', pageWidth - margin - 3, y + 3.8, { align: 'right' });
    y += 7;
  };

  drawDetalleHeader();

  let globalSys = 0;
  let globalCont = 0;
  let rowCount = 0;

  data.catalogo.forEach((cat) => {
    // Check space for category banner
    if (y > pageHeight - margin - 18) {
      doc.addPage();
      pageNumber++;
      drawDetalleHeader();
    }

    // Category Totals
    let catSys = 0;
    let catCont = 0;
    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const cont = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        catSys += sys;
        catCont += cont;
      });
    });

    globalSys += catSys;
    globalCont += catCont;
    const catDif = catCont - catSys;
    const difStr = catDif > 0 ? `+${nf(catDif)}` : nf(catDif);

    // Category Header Bar with Totals
    doc.setFillColor(greenAccent[0], greenAccent[1], greenAccent[2]);
    doc.rect(margin, y, contentWidth, 5.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`CATEGORÍA: ${cat.nombre.toUpperCase()}   —   SISTEMA: ${nf(catSys)}   |   CONTADO: ${nf(catCont)}   |   DIF: ${difStr}`, margin + 3, y + 3.6);
    y += 6;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        if (y > pageHeight - margin - 10) {
          doc.addPage();
          pageNumber++;
          drawDetalleHeader();
        }

        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        const diff = entry ? contado - sys : 0;

        if (rowCount % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 0.5, contentWidth, 4.6, 'F');
        }

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        doc.text(p.codigo || '—', margin + 2, y + 3);

        doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
        doc.text(p.nombre.length > 32 ? p.nombre.slice(0, 31) + '..' : p.nombre, margin + 14, y + 3);

        doc.text(nf(sys), margin + 82, y + 3, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(entry ? nf(contado) : '—', margin + 104, y + 3, { align: 'right' });

        if (!entry || diff === 0) {
          doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
          doc.text('0', margin + 124, y + 3, { align: 'right' });
        } else if (diff > 0) {
          doc.setTextColor(22, 101, 52);
          doc.text(`+${diff}`, margin + 124, y + 3, { align: 'right' });
        } else {
          doc.setTextColor(225, 29, 72);
          doc.text(`${diff}`, margin + 124, y + 3, { align: 'right' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        const userStamp = entry ? `${entry.empleado} (${entry.hora})` : 'Sin contar';
        doc.text(userStamp, pageWidth - margin - 3, y + 3, { align: 'right' });

        y += 4.6;
        rowCount++;
      });
    });

    y += 2.5; // space between categories
  });

  // Final Total Summary Box
  if (y > pageHeight - margin - 18) {
    doc.addPage();
    drawDetalleHeader();
  }
  const globalDif = globalCont - globalSys;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`TOTAL GENERAL: SISTEMA ${nf(globalSys)} u.   |   CONTADO ${nf(globalCont)} u.   |   DESVÍO NETO: ${globalDif > 0 ? '+' : ''}${globalDif} u.`, margin + 4, y + 5.2);

  const filename = `Reporte_Detalle_Central_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { doc, blob, file, filename };
}

// -------------------------------------------------------------
// 3. INFORME EXCLUSIVO COMPARAR (generateCompararReportPDF)
// -------------------------------------------------------------
export function generateCompararReportPDF(
  data: PDFReportData,
  compareAKey: string,
  compareBKey: string,
  snapA: { conteos: Record<string, any>; sistema: Record<string, any> },
  snapB: { conteos: Record<string, any>; sistema: Record<string, any> }
): { doc: jsPDF; blob: Blob; file: File; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let pageNumber = 1;

  const drawCompHeader = () => {
    y = drawCommonHeader(
      doc,
      'CENTRAL DE PIZZAS & EMPANADAS',
      'SEDE ESCOBAR · COMPARATIVA DE STOCK ENTRE TURNOS',
      pageNumber,
      2,
      margin,
      contentWidth,
      pageWidth,
      margin
    );

    y = drawMetaBar(
      doc,
      [
        { label: 'Turno A', val: compareAKey },
        { label: 'Turno B', val: compareBKey },
        { label: 'Fecha emisión', val: fmtDateLabel(data.fecha) },
        { label: 'Auditor', val: data.cerradoPor || 'Admin' },
      ],
      margin,
      contentWidth,
      y
    );

    doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CÓD.', margin + 2, y + 3.8);
    doc.text('PRODUCTO', margin + 14, y + 3.8);
    doc.text('A CONT.', margin + 74, y + 3.8, { align: 'right' });
    doc.text('A SIST.', margin + 90, y + 3.8, { align: 'right' });
    doc.text('A DIF.', margin + 106, y + 3.8, { align: 'right' });
    doc.text('B CONT.', margin + 126, y + 3.8, { align: 'right' });
    doc.text('B SIST.', margin + 142, y + 3.8, { align: 'right' });
    doc.text('B DIF.', margin + 158, y + 3.8, { align: 'right' });
    doc.text('VARIACIÓN B-A', pageWidth - margin - 3, y + 3.8, { align: 'right' });
    y += 7;
  };

  drawCompHeader();

  let rowCount = 0;

  data.catalogo.forEach((cat) => {
    if (y > pageHeight - margin - 15) {
      doc.addPage();
      pageNumber++;
      drawCompHeader();
    }

    doc.setFillColor(greenAccent[0], greenAccent[1], greenAccent[2]);
    doc.rect(margin, y, contentWidth, 4.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(cat.nombre.toUpperCase(), margin + 3, y + 3.2);
    y += 5.2;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        if (y > pageHeight - margin - 10) {
          doc.addPage();
          pageNumber++;
          drawCompHeader();
        }

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

        if (rowCount % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F');
        }

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        doc.text(p.codigo || '—', margin + 2, y + 3);

        doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
        doc.text(p.nombre.length > 28 ? p.nombre.slice(0, 27) + '..' : p.nombre, margin + 14, y + 3);

        doc.text(String(contA), margin + 74, y + 3, { align: 'right' });
        doc.text(String(sysA), margin + 90, y + 3, { align: 'right' });
        doc.text(String(difA), margin + 106, y + 3, { align: 'right' });

        doc.text(String(contB), margin + 126, y + 3, { align: 'right' });
        doc.text(String(sysB), margin + 142, y + 3, { align: 'right' });
        doc.text(String(difB), margin + 158, y + 3, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        if (delta > 0) {
          doc.setTextColor(22, 101, 52);
          doc.text(`+${delta}`, pageWidth - margin - 3, y + 3, { align: 'right' });
        } else if (delta < 0) {
          doc.setTextColor(225, 29, 72);
          doc.text(`${delta}`, pageWidth - margin - 3, y + 3, { align: 'right' });
        } else {
          doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
          doc.text('0', pageWidth - margin - 3, y + 3, { align: 'right' });
        }

        y += 4.5;
        rowCount++;
      });
    });

    y += 2;
  });

  const filename = `Reporte_Comparar_Central_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { doc, blob, file, filename };
}

// -------------------------------------------------------------
// 4. INFORME EXCLUSIVO EVOLUCIÓN (generateEvolucionReportPDF)
// -------------------------------------------------------------
export function generateEvolucionReportPDF(
  data: PDFReportData,
  days: { key: string; label: string; dateIso: string }[],
  getProductDayDiff: (catId: string, p: { codigo: string; nombre: string }, day: any) => number
): { doc: jsPDF; blob: Blob; file: File; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let pageNumber = 1;

  const drawEvoHeader = () => {
    y = drawCommonHeader(
      doc,
      'CENTRAL DE PIZZAS & EMPANADAS',
      'SEDE ESCOBAR · EVOLUCIÓN HISTÓRICA DE DESVÍOS (7 DÍAS)',
      pageNumber,
      2,
      margin,
      contentWidth,
      pageWidth,
      margin
    );

    y = drawMetaBar(
      doc,
      [
        { label: 'Fecha actual', val: fmtDateLabel(data.fecha) },
        { label: 'Turno', val: data.turno.toUpperCase() },
        { label: 'Período', val: `${days.length} jornadas analizadas` },
        { label: 'Auditor', val: data.cerradoPor || 'Admin' },
      ],
      margin,
      contentWidth,
      y
    );

    doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CÓD.', margin + 2, y + 3.8);
    doc.text('PRODUCTO', margin + 14, y + 3.8);
    doc.text('CAT.', margin + 64, y + 3.8);

    const dayColStart = margin + 85;
    const dayColWidth = 11;
    days.forEach((d, i) => {
      doc.text(d.label, dayColStart + i * dayColWidth + dayColWidth / 2, y + 3.8, { align: 'center' });
    });

    doc.text('DESVÍO ACUM.', pageWidth - margin - 3, y + 3.8, { align: 'right' });
    y += 7;
  };

  drawEvoHeader();

  let rowCount = 0;
  const dayColStart = margin + 85;
  const dayColWidth = 11;

  data.catalogo.forEach((cat) => {
    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        if (y > pageHeight - margin - 10) {
          doc.addPage();
          pageNumber++;
          drawEvoHeader();
        }

        const diffs = days.map((d) => getProductDayDiff(cat.id, p, d));
        const acum = diffs.reduce((a, b) => a + b, 0);

        if (rowCount % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F');
        }

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        doc.text(p.codigo || '—', margin + 2, y + 3);

        doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
        doc.text(p.nombre.length > 25 ? p.nombre.slice(0, 24) + '..' : p.nombre, margin + 14, y + 3);

        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        const shortCat = cat.nombre.slice(0, 8);
        doc.text(shortCat, margin + 64, y + 3);

        diffs.forEach((d, i) => {
          if (d === 0) {
            doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
            doc.text('0', dayColStart + i * dayColWidth + dayColWidth / 2, y + 3, { align: 'center' });
          } else if (d > 0) {
            doc.setTextColor(22, 101, 52);
            doc.text(`+${d}`, dayColStart + i * dayColWidth + dayColWidth / 2, y + 3, { align: 'center' });
          } else {
            doc.setTextColor(225, 29, 72);
            doc.text(`${d}`, dayColStart + i * dayColWidth + dayColWidth / 2, y + 3, { align: 'center' });
          }
        });

        doc.setFont('helvetica', 'bold');
        if (acum === 0) {
          doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
          doc.text('0', pageWidth - margin - 3, y + 3, { align: 'right' });
        } else if (acum > 0) {
          doc.setTextColor(22, 101, 52);
          doc.text(`+${acum}`, pageWidth - margin - 3, y + 3, { align: 'right' });
        } else {
          doc.setTextColor(225, 29, 72);
          doc.text(`${acum}`, pageWidth - margin - 3, y + 3, { align: 'right' });
        }

        y += 4.5;
        rowCount++;
      });
    });
  });

  const filename = `Reporte_Evolucion_Central_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { doc, blob, file, filename };
}

// -------------------------------------------------------------
// 5. INFORME GENERAL DE CIERRE (generateGeneralCierrePDF / generateShiftPDF)
// -------------------------------------------------------------
export function generateGeneralCierrePDF(data: PDFReportData): { doc: jsPDF; blob: Blob; file: File; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const drawHeader = (pageNumber: number, totalPages: number = 2) => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('CENTRAL DE PIZZAS & EMPANADAS', margin + 6, y + 7);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('SEDE ESCOBAR · ACTA OFICIAL DE CONTROL DE STOCK & CAJA', margin + 6, y + 13);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Pág. ${pageNumber}/${totalPages}`, pageWidth - margin - 6, y + 10, { align: 'right' });

    y += 22;

    doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.rect(margin, y, contentWidth, 9, 'FD');

    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha: ${fmtDateLabel(data.fecha)}`, margin + 4, y + 6);
    doc.text(`Turno: ${data.turno.toUpperCase()}`, margin + 50, y + 6);
    doc.text(`Cerrado por: ${data.cerradoPor || 'Admin'}`, margin + 95, y + 6);
    doc.text(`Hora: ${data.horaCierre || '—'} hs`, pageWidth - margin - 4, y + 6, { align: 'right' });

    y += 13;
  };

  // PAGE 1: AUDITORÍA, CAJA & CONSOLIDADO
  drawHeader(1, 2);

  // 1. AUDITORÍA DEL TURNO
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('1. AUDITORÍA DEL TURNO: RESPONSABLES Y HORARIOS DE CARGA', margin + 4, y + 4.8);
  y += 9;

  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, y + 6, pageWidth - margin, y + 6);

  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('SECCIÓN / CATEGORÍA', margin + 3, y + 4);
  doc.text('COLABORADOR RESPONSABLE', margin + 65, y + 4);
  doc.text('HORA REGISTRADA', margin + 120, y + 4);
  doc.text('ESTADO / DETALLE', pageWidth - margin - 3, y + 4, { align: 'right' });
  y += 7;

  const auditItems: { seccion: string; empleado: string; hora: string; detalle: string }[] = [];
  data.catalogo.forEach((cat) => {
    const reclamo = data.reclamos[cat.id];
    let prodsCounted = 0;
    let lastEmp = reclamo?.empleado || '';
    let lastHora = reclamo?.hora || '';

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const c = data.conteoActual[pid];
        if (c && Object.values(c.ubic).some((v) => v > 0)) {
          prodsCounted++;
          if (!lastEmp && c.empleado) lastEmp = c.empleado;
          if (!lastHora && c.hora) lastHora = c.hora;
        }
      });
    });

    auditItems.push({
      seccion: `Stock: ${cat.nombre}`,
      empleado: lastEmp || (reclamo ? reclamo.empleado : 'Sin asignar'),
      hora: lastHora || (reclamo ? reclamo.hora : '—'),
      detalle: prodsCounted > 0 ? `${prodsCounted} productos contados` : 'Completo',
    });
  });

  if (data.cierreCaja.existe) {
    auditItems.push({
      seccion: 'Cierre de Caja & Postnets',
      empleado: data.cierreCaja.empleado || data.cerradoPor || 'Admin',
      hora: data.cierreCaja.hora || data.horaCierre || '—',
      detalle: 'Caja Rendida y Verificada',
    });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);

  auditItems.forEach((item, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y - 0.5, contentWidth, 5.5, 'F');
    }
    doc.text(item.seccion, margin + 3, y + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(item.empleado, margin + 65, y + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.text(item.hora, margin + 120, y + 3.5);
    doc.text(item.detalle, pageWidth - margin - 3, y + 3.5, { align: 'right' });
    y += 5.5;
  });

  y += 4;

  // 2. RESUMEN DE CIERRE DE CAJA
  const sumaPostnets = (data.cierreCaja.postnet_amarillo || 0) + (data.cierreCaja.postnet_rosa || 0) + (data.cierreCaja.postnet_blanco || 0);
  const sistPostnets = data.cierreCaja.online_local_sist || 0;
  const difPostnets = sumaPostnets - sistPostnets;

  const realEfectivo = data.cierreCaja.efectivo_real || 0;
  const sistEfectivo = data.cierreCaja.efectivo_mostrador_sist || 0;
  const difEfectivo = realEfectivo - sistEfectivo;
  const saldoTotal = difPostnets + difEfectivo;

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. RESUMEN DE CIERRE DE CAJA', margin + 4, y + 4.8);
  y += 9;

  const colWidth = (contentWidth - 6) / 3;
  const boxHeight = 24;

  // Box 1: Postnets
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('POSTNETS / TARJETAS', margin + 3.5, y + 4.5);
  doc.setFontSize(10.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Real: ${fmtMoney(sumaPostnets)}`, margin + 3.5, y + 9.5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Sistema: ${fmtMoney(sistPostnets)}`, margin + 3.5, y + 14);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  if (difPostnets > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Diferencia: +${fmtMoney(difPostnets)}`, margin + 3.5, y + 18.5);
  } else if (difPostnets < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Diferencia: -${fmtMoney(Math.abs(difPostnets))}`, margin + 3.5, y + 18.5);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Diferencia: $ 0 (Exacto)`, margin + 3.5, y + 18.5);
  }
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text(`Am: ${fmtMoney(data.cierreCaja.postnet_amarillo || 0)} | Ro: ${fmtMoney(data.cierreCaja.postnet_rosa || 0)} | Bl: ${fmtMoney(data.cierreCaja.postnet_blanco || 0)}`, margin + 3.5, y + 22);

  // Box 2: Efectivo
  const xCol2 = margin + colWidth + 3;
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(xCol2, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO REAL EN CAJA', xCol2 + 3.5, y + 4.5);
  doc.setFontSize(10.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Real: ${fmtMoney(realEfectivo)}`, xCol2 + 3.5, y + 9.5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Sistema: ${fmtMoney(sistEfectivo)}`, xCol2 + 3.5, y + 14);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  if (difEfectivo > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Diferencia: +${fmtMoney(difEfectivo)}`, xCol2 + 3.5, y + 18.5);
  } else if (difEfectivo < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Diferencia: -${fmtMoney(Math.abs(difEfectivo))}`, xCol2 + 3.5, y + 18.5);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Diferencia: $ 0 (Exacto)`, xCol2 + 3.5, y + 18.5);
  }
  doc.setFontSize(6.5);
  if (data.cierreCaja.saldo_inicial_sist !== undefined) {
    doc.text('Ini + Mostr + PEYA - Salidas', xCol2 + 3.5, y + 22);
  } else {
    doc.text('Rendido en sobre de mostrador', xCol2 + 3.5, y + 22);
  }

  // Box 3: Saldo Final Consolidado
  const xCol3 = margin + (colWidth + 3) * 2;
  const isCajaCuadrada = saldoTotal === 0;
  doc.setFillColor(isCajaCuadrada ? 240 : saldoTotal > 0 ? 236 : 255, isCajaCuadrada ? 253 : saldoTotal > 0 ? 253 : 241, isCajaCuadrada ? 244 : saldoTotal > 0 ? 245 : 242);
  doc.setDrawColor(isCajaCuadrada ? 167 : saldoTotal > 0 ? 167 : 254, isCajaCuadrada ? 243 : saldoTotal > 0 ? 243 : 205, isCajaCuadrada ? 208 : saldoTotal > 0 ? 208 : 211);
  doc.roundedRect(xCol3, y, colWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('SALDO FINAL CONSOLIDADO', xCol3 + 3.5, y + 4.5);
  doc.setFontSize(10.5);
  if (saldoTotal > 0) {
    doc.setTextColor(22, 101, 52);
    doc.text(`Neto: +${fmtMoney(saldoTotal)}`, xCol3 + 3.5, y + 9.5);
  } else if (saldoTotal < 0) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Neto: -${fmtMoney(Math.abs(saldoTotal))}`, xCol3 + 3.5, y + 9.5);
  } else {
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Neto: $ 0`, xCol3 + 3.5, y + 9.5);
  }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isCajaCuadrada ? 22 : saldoTotal > 0 ? 22 : 225, isCajaCuadrada ? 101 : saldoTotal > 0 ? 101 : 29, isCajaCuadrada ? 52 : saldoTotal > 0 ? 52 : 72);
  doc.text(`Estado: ${isCajaCuadrada ? '✓ CAJA CUADRADA' : saldoTotal > 0 ? 'SOBRANTE' : 'FALTANTE'}`, xCol3 + 3.5, y + 14);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`Efec: ${fmtSignedMoney(difEfectivo)} | Post: ${fmtSignedMoney(difPostnets)}`, xCol3 + 3.5, y + 18.5);
  doc.setFontSize(6.5);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text(isCajaCuadrada ? 'Balance de caja cerrado perfecto' : 'Auditoría requerida en cierre', xCol3 + 3.5, y + 22);

  y += boxHeight + 4;

  if (data.cierreCaja.observaciones) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Observaciones de caja: ${data.cierreCaja.observaciones}`, margin + 2, y);
    y += 5;
  }

  // 3. CONSOLIDADO DE STOCK
  let totalSistema = 0;
  let totalContado = 0;
  let difAbs = 0;
  let totalProds = 0;
  let prodsConDif = 0;

  interface SubCategoryStat {
    id: string;
    nombre: string;
    sys: number;
    cont: number;
    dif: number;
    pctDesvio: number;
    prodsCount: number;
    prodsDiff: number;
  }

  const categoryStats: SubCategoryStat[] = [];

  data.catalogo.forEach((cat) => {
    if (cat.id === 'panificados') {
      let pizzaSys = 0, pizzaCont = 0, pizzaCount = 0, pizzaDiffCount = 0;
      let mediaSys = 0, mediaCont = 0, mediaCount = 0, mediaDiffCount = 0;

      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = data.sistemaStock[pid]?.stock ?? 0;
          const entry = data.conteoActual[pid];
          const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          const isMedia = p.nombre.toLowerCase().includes('medialuna') || p.codigo === '11029';

          totalSistema += sys;
          totalContado += contado;
          totalProds++;
          const d = entry ? contado - sys : 0;
          if (entry && d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
          }

          if (isMedia) {
            mediaSys += sys;
            mediaCont += contado;
            mediaCount++;
            if (entry && d !== 0) mediaDiffCount++;
          } else {
            pizzaSys += sys;
            pizzaCont += contado;
            pizzaCount++;
            if (entry && d !== 0) pizzaDiffCount++;
          }
        });
      });

      const pzDif = pizzaCont - pizzaSys;
      categoryStats.push({
        id: 'pizzas',
        nombre: 'Pizzas / Masas',
        sys: pizzaSys,
        cont: pizzaCont,
        dif: pzDif,
        pctDesvio: pizzaSys > 0 ? (Math.abs(pzDif) / pizzaSys) * 100 : 0,
        prodsCount: pizzaCount,
        prodsDiff: pizzaDiffCount,
      });

      const mdDif = mediaCont - mediaSys;
      categoryStats.push({
        id: 'medialunas',
        nombre: 'Medialunas',
        sys: mediaSys,
        cont: mediaCont,
        dif: mdDif,
        pctDesvio: mediaSys > 0 ? (Math.abs(mdDif) / mediaSys) * 100 : 0,
        prodsCount: mediaCount,
        prodsDiff: mediaDiffCount,
      });
      return;
    }

    if (cat.id === 'sandwich_panchos') {
      let sandSys = 0, sandCont = 0, sandCount = 0, sandDiffCount = 0;
      let salchSys = 0, salchCont = 0, salchCount = 0, salchDiffCount = 0;

      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = productId(cat.id, p);
          const sys = data.sistemaStock[pid]?.stock ?? 0;
          const entry = data.conteoActual[pid];
          const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
          const isSalch = p.nombre.toLowerCase().includes('salchicha') || p.nombre.toLowerCase().includes('pancho') || p.codigo === '22445';

          totalSistema += sys;
          totalContado += contado;
          totalProds++;
          const d = entry ? contado - sys : 0;
          if (entry && d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
          }

          if (isSalch) {
            salchSys += sys;
            salchCont += contado;
            salchCount++;
            if (entry && d !== 0) salchDiffCount++;
          } else {
            sandSys += sys;
            sandCont += contado;
            sandCount++;
            if (entry && d !== 0) sandDiffCount++;
          }
        });
      });

      const sDif = sandCont - sandSys;
      categoryStats.push({
        id: 'sandwiches',
        nombre: 'Sandwiches',
        sys: sandSys,
        cont: sandCont,
        dif: sDif,
        pctDesvio: sandSys > 0 ? (Math.abs(sDif) / sandSys) * 100 : 0,
        prodsCount: sandCount,
        prodsDiff: sandDiffCount,
      });

      const slDif = salchCont - salchSys;
      categoryStats.push({
        id: 'panchos',
        nombre: 'Panchos',
        sys: salchSys,
        cont: salchCont,
        dif: slDif,
        pctDesvio: salchSys > 0 ? (Math.abs(slDif) / salchSys) * 100 : 0,
        prodsCount: salchCount,
        prodsDiff: salchDiffCount,
      });
      return;
    }

    let catSys = 0;
    let catCont = 0;
    let catProdsCount = 0;
    let catProdsDiff = 0;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        catSys += sys;
        catCont += contado;
        catProdsCount++;
        totalSistema += sys;
        totalContado += contado;
        totalProds++;
        if (entry) {
          const d = contado - sys;
          if (d !== 0) {
            difAbs += Math.abs(d);
            prodsConDif++;
            catProdsDiff++;
          }
        }
      });
    });

    const catDif = catCont - catSys;
    categoryStats.push({
      id: cat.id,
      nombre: cat.nombre,
      sys: catSys,
      cont: catCont,
      dif: catDif,
      pctDesvio: catSys > 0 ? (Math.abs(catDif) / catSys) * 100 : 0,
      prodsCount: catProdsCount,
      prodsDiff: catProdsDiff,
    });
  });

  const totalDifNeto = totalContado - totalSistema;
  const precisionGlobal = totalSistema > 0 ? Math.max(0, 100 - (difAbs / totalSistema) * 100).toFixed(1) : '100';

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('3. CONSOLIDADO DE STOCK: BALANCE Y DESVÍOS POR CATEGORÍA', margin + 4, y + 4.8);
  y += 9;

  // Global KPI line: 2-line clean layout, NO OVERLAPPING GUARANTEED!
  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, contentWidth, 9.5, 1, 1, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.setFont('helvetica', 'bold');

  // Fila 1: Totales de Sistema y Contado
  doc.text(`TOTAL SISTEMA: ${nf(totalSistema)} u.`, margin + 4, y + 4.2);
  doc.text(`TOTAL CONTADO: ${nf(totalContado)} u.`, margin + 80, y + 4.2);

  // Fila 2: Desvío Neto (izq) y Precisión (der)
  const isPos = totalDifNeto > 0;
  const isExact = totalDifNeto === 0;
  doc.setTextColor(isExact ? 22 : isPos ? 22 : 225, isExact ? 101 : isPos ? 101 : 29, isExact ? 52 : isPos ? 52 : 72);
  doc.text(`DESVÍO NETO: ${isPos ? '+' : ''}${totalDifNeto} u.  (Dif. Abs: ${nf(difAbs)} u.)`, margin + 4, y + 7.8);

  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`PRECISIÓN: ${precisionGlobal}% (${totalProds - prodsConDif}/${totalProds} OK)`, pageWidth - margin - 4, y + 7.8, { align: 'right' });

  y += 12.5;

  // Category Cards (7 cards in 2 rows)
  const catCount = categoryStats.length;
  const cardsPerRow = 4;
  const gap = 2.5;
  const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardHeight = 22;

  categoryStats.forEach((catStat, idx) => {
    const row = Math.floor(idx / cardsPerRow);
    const col = idx % cardsPerRow;
    const cardX = margin + col * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);

    const isEx = catStat.dif === 0;
    const isP = catStat.dif > 0;
    const isHighDesvio = Math.abs(catStat.dif) >= 3 || catStat.pctDesvio > 1.5;

    if (isEx) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
    } else if (!isHighDesvio) {
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
    } else {
      doc.setFillColor(255, 241, 242);
      doc.setDrawColor(254, 205, 211);
    }
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    const shortName = catStat.nombre.length > 14 ? catStat.nombre.slice(0, 13) + '..' : catStat.nombre;
    doc.text(shortName.toUpperCase(), cardX + 2.5, cardY + 4.5);

    doc.setFontSize(10);
    if (isEx) {
      doc.setTextColor(22, 101, 52);
      doc.text('DIF: 0 u.', cardX + 2.5, cardY + 9.8);
    } else if (isP) {
      doc.setTextColor(isHighDesvio ? 225 : 22, isHighDesvio ? 29 : 101, isHighDesvio ? 72 : 52);
      doc.text(`DIF: +${catStat.dif} u.`, cardX + 2.5, cardY + 9.8);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`DIF: ${catStat.dif} u.`, cardX + 2.5, cardY + 9.8);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Sist: ${nf(catStat.sys)} | Cont: ${nf(catStat.cont)}`, cardX + 2.5, cardY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    if (isEx) {
      doc.setTextColor(22, 101, 52);
      doc.text('✓ Precisión 100%', cardX + 2.5, cardY + 18.2);
    } else if (!isHighDesvio) {
      doc.setTextColor(isP ? 22 : 185, isP ? 101 : 28, isP ? 52 : 28);
      doc.text(`Desvío leve (${catStat.pctDesvio.toFixed(1)}%)`, cardX + 2.5, cardY + 18.2);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`⚠ ALERTA (${catStat.pctDesvio.toFixed(1)}%)`, cardX + 2.5, cardY + 18.2);
    }
  });

  const numRows = Math.ceil(catCount / cardsPerRow);
  y += numRows * (cardHeight + gap) + 3;

  // Signatures on Page 1 bottom
  y = pageHeight - margin - 22;
  doc.setDrawColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.line(margin + 10, y + 10, margin + 65, y + 10);
  doc.line(pageWidth - margin - 65, y + 10, pageWidth - margin - 10, y + 10);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('Firma Encargado de Turno', margin + 37.5, y + 14, { align: 'center' });
  doc.text('Firma Gerencia / Central', pageWidth - margin - 37.5, y + 14, { align: 'center' });

  // PAGE 2: DETALLE COMPLETO DE PRODUCTOS
  doc.addPage();
  y = margin;
  drawHeader(2, 2);

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DETALLE COMPLETO DE PRODUCTOS POR CATEGORÍA', margin + 4, y + 4.8);
  y += 9;

  doc.setFillColor(stoneLightBg[0], stoneLightBg[1], stoneLightBg[2]);
  doc.rect(margin, y, contentWidth, 5.5, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CÓD.', margin + 2, y + 3.8);
  doc.text('PRODUCTO', margin + 14, y + 3.8);
  doc.text('SISTEMA', margin + 80, y + 3.8, { align: 'right' });
  doc.text('CONTADO', margin + 100, y + 3.8, { align: 'right' });
  doc.text('DIF.', margin + 118, y + 3.8, { align: 'right' });
  doc.text('RESPONSABLE / HORA', pageWidth - margin - 3, y + 3.8, { align: 'right' });
  y += 6.5;

  let rowCount = 0;

  data.catalogo.forEach((cat) => {
    if (y > pageHeight - margin - 15) {
      doc.addPage();
      y = margin;
      drawHeader(3, 3);
    }

    let catSys = 0;
    let catCont = 0;
    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        catSys += sys;
        catCont += contado;
      });
    });
    const catDif = catCont - catSys;
    const difStr = catDif > 0 ? `+${nf(catDif)}` : nf(catDif);

    doc.setFillColor(greenAccent[0], greenAccent[1], greenAccent[2]);
    doc.rect(margin, y, contentWidth, 5.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`CATEGORÍA: ${cat.nombre.toUpperCase()}   —   SISTEMA: ${nf(catSys)}   |   CONTADO: ${nf(catCont)}   |   DIF: ${difStr}`, margin + 3, y + 3.6);
    y += 5.8;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        if (y > pageHeight - margin - 10) {
          doc.addPage();
          y = margin;
          drawHeader(3, 3);
        }

        const pid = productId(cat.id, p);
        const sys = data.sistemaStock[pid]?.stock ?? 0;
        const entry = data.conteoActual[pid];
        const contado = entry ? Object.values(entry.ubic).reduce((a, b) => a + b, 0) : 0;
        const diff = entry ? contado - sys : 0;

        if (rowCount % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 0.5, contentWidth, 4.6, 'F');
        }

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        doc.text(p.codigo || '—', margin + 2, y + 3);

        doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
        doc.text(p.nombre.length > 30 ? p.nombre.slice(0, 30) + '..' : p.nombre, margin + 14, y + 3);

        doc.text(nf(sys), margin + 80, y + 3, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(entry ? nf(contado) : '—', margin + 100, y + 3, { align: 'right' });

        if (!entry || diff === 0) {
          doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
          doc.text('0', margin + 118, y + 3, { align: 'right' });
        } else if (diff > 0) {
          doc.setTextColor(22, 101, 52);
          doc.text(`+${diff}`, margin + 118, y + 3, { align: 'right' });
        } else {
          doc.setTextColor(225, 29, 72);
          doc.text(`${diff}`, margin + 118, y + 3, { align: 'right' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
        const userStamp = entry ? `${entry.empleado} (${entry.hora})` : '—';
        doc.text(userStamp, pageWidth - margin - 3, y + 3, { align: 'right' });

        y += 4.6;
        rowCount++;
      });
    });
  });

  const filename = `Acta_General_Cierre_Escobar_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { doc, blob, file, filename };
}

// Backwards-compatible alias for other components
export const generateShiftPDF = generateGeneralCierrePDF;

export async function shareOrDownloadPDF(
  docData: PDFReportData,
  whatsappNumber: string = '5491169927352'
): Promise<{ method: 'shared' | 'downloaded'; url?: string }> {
  const { blob, file, filename } = generateGeneralCierrePDF(docData);

  let hostedUrl = '';
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
    const base64 = await base64Promise;

    const res = await fetch('/api/reportes/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64,
        filename,
        fecha: docData.fecha,
        turno: docData.turno,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      hostedUrl = json.url || '';
    }

    // Subir a Google Drive en la carpeta dedicada de Cierres de Turno si hay sesión activa
    try {
      const driveRes = await uploadPdfToGoogleDrive(file, filename);
      if (driveRes.ok && driveRes.driveUrl) {
        hostedUrl = driveRes.driveUrl;
      }
    } catch (driveErr) {
      console.warn('Could not auto-upload to Google Drive:', driveErr);
    }
  } catch (err) {
    console.warn('Could not upload PDF to server storage:', err);
  }

  const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator && (navigator as any).canShare({ files: [file] });

  if (canShareFiles && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `Acta Oficial Cierre ${docData.turno} - Central Escobar`,
        text: `📄 Adjunto el acta oficial de cierre de stock y caja (${docData.fecha} - ${docData.turno}).`,
        files: [file],
      });
      return { method: 'shared', url: hostedUrl };
    } catch (shareErr: any) {
      if (shareErr.name !== 'AbortError') {
        console.warn('Web Share failed, fallback to download:', shareErr);
      } else {
        return { method: 'shared', url: hostedUrl };
      }
    }
  }

  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

  const guaranteedServerUrl = `${window.location.origin}/api/reportes/pdf/${filename}`;
  const linkToSend = hostedUrl || guaranteedServerUrl;
  const textMsg = `🍕 *Central Escobar · Cierre de Turno ${docData.turno}*\n` +
    `📅 Fecha: ${fmtDateLabel(docData.fecha)}\n` +
    `👤 Cerrado por: ${docData.cerradoPor} (${docData.horaCierre} hs)\n\n` +
    `📄 *Descargar / Ver PDF Oficial del Acta:*\n${linkToSend}\n\n` +
    `El PDF completo fue descargado en el dispositivo para adjuntarlo a este chat.`;

  abrirWhatsApp(textMsg, whatsappNumber);

  return { method: 'downloaded', url: hostedUrl || downloadUrl };
}
