import jsPDF from 'jspdf';
import { fmtMoney, fmtSignedMoney } from './centralHelpers';
import { VentasTurnoData, PedidoFabricaItem } from '../types/central';

export interface GerencialReportData {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  generadoPor: string;
  horaGeneracion: string;
  ventas: VentasTurnoData;
  pedidoFabrica: PedidoFabricaItem[];
  cierreCaja?: any;
}

export function generatePdfGerencial(data: GerencialReportData): { blob: Blob; filename: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const primaryDark = [18, 61, 38]; // #123D26
  const primaryLight = [27, 94, 56]; // #1B5E38
  const goldAccent = [217, 119, 6]; // #D97706
  const textDark = [30, 41, 59];
  const textMuted = [100, 116, 139];
  const stoneLight = [248, 250, 252];
  const borderColor = [226, 232, 240];

  const drawHeader = (title: string, subtitle: string, pageNum: number, totalPages: number) => {
    // Header banner
    doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.rect(margin, margin, contentWidth, 20, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('CENTRAL DE PIZZAS & EMPANADAS', margin + 4, margin + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 240, 215);
    doc.text('Sede Escobar · Informe Gerencial & Pedido a Fábrica (CONFIDENCIAL)', margin + 4, margin + 12);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(252, 211, 77); // Amber-300
    doc.setFontSize(9);
    doc.text(`SOLO ADMINISTRACIÓN · HOJA ${pageNum} DE ${totalPages}`, pageWidth - margin - 4, margin + 7.5, { align: 'right' });

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Fecha: ${data.fecha} | Turno: ${data.turno.toUpperCase()} | Por: ${data.generadoPor}`, pageWidth - margin - 4, margin + 12, { align: 'right' });

    // Section subheader
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.rect(margin, margin + 20, contentWidth, 7, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.text(title.toUpperCase(), margin + 3, margin + 24.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(subtitle, pageWidth - margin - 3, margin + 24.5, { align: 'right' });
  };

  // ==========================================
  // PÁGINA 1: RESUMEN DE VENTAS Y FINANCIERO
  // ==========================================
  drawHeader('1. Resumen de Ventas del Turno (Datalive)', 'Cruce de facturación, canales y rendición de caja', 1, 2);

  let y = margin + 31;

  // KPI Cards row
  const cardW = (contentWidth - 6) / 3;
  const cardH = 18;

  // Total Facturado
  doc.setFillColor(236, 253, 245); // Emerald-50
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin, y, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(primaryLight[0], primaryLight[1], primaryLight[2]);
  doc.text('TOTAL FACTURADO (DATALIVE)', margin + 3, y + 4.5);
  doc.setFontSize(12);
  doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.text(fmtMoney(data.ventas.totalFacturado), margin + 3, y + 12.5);

  // Tickets
  const xCard2 = margin + cardW + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(xCard2, y, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL TICKETS / COMANDAS', xCard2 + 3, y + 4.5);
  doc.setFontSize(12);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(String(data.ventas.totalTickets || 0), xCard2 + 3, y + 12.5);

  // Ticket Promedio
  const ticketPromedio = data.ventas.totalTickets > 0 ? data.ventas.totalFacturado / data.ventas.totalTickets : 0;
  const xCard3 = xCard2 + cardW + 3;
  doc.setFillColor(254, 243, 199); // Amber-50
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(xCard3, y, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.text('TICKET PROMEDIO', xCard3 + 3, y + 4.5);
  doc.setFontSize(12);
  doc.setTextColor(180, 83, 9);
  doc.text(fmtMoney(ticketPromedio), xCard3 + 3, y + 12.5);

  y += cardH + 5;

  // Desglose de Ventas por Canal
  doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.rect(margin, y, contentWidth, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('CANAL DE VENTA', margin + 3, y + 3.8);
  doc.text('TICKETS', margin + 85, y + 3.8, { align: 'right' });
  doc.text('MONTO FACTURADO ($)', margin + 135, y + 3.8, { align: 'right' });
  doc.text('% PART.', pageWidth - margin - 3, y + 3.8, { align: 'right' });

  y += 5.5;

  data.ventas.canales.forEach((c, idx) => {
    const isAlt = idx % 2 === 1;
    if (isAlt) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 5.5, 'F');
    }
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 5.5, pageWidth - margin, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(c.nombre, margin + 3, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.text(String(c.tickets || '-'), margin + 85, y + 4, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(fmtMoney(c.monto), margin + 135, y + 4, { align: 'right' });

    const pct = data.ventas.totalFacturado > 0 ? ((c.monto / data.ventas.totalFacturado) * 100).toFixed(1) + '%' : '0%';
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(pct, pageWidth - margin - 3, y + 4, { align: 'right' });

    y += 5.5;
  });

  y += 6;

  // Cruce con Rendición de Caja
  if (data.cierreCaja && data.cierreCaja.existe) {
    const postnetsTotal = (data.cierreCaja.postnet_amarillo || 0) + (data.cierreCaja.postnet_rosa || 0) + (data.cierreCaja.postnet_blanco || 0);
    const efectivoReal = data.cierreCaja.efectivo_real || 0;
    const rendicionTotal = postnetsTotal + efectivoReal;
    const diferenciaRendicion = rendicionTotal - data.ventas.totalFacturado;

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(margin, y, contentWidth, 26, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.text('CRUCE FINANCIERO: FACTURACIÓN DATALIVE VS RENDICIÓN FÍSICA EN CAJA', margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`• Total Rendido en Cajón: ${fmtMoney(efectivoReal)} (Efectivo) + ${fmtMoney(postnetsTotal)} (Tarjetas) = ${fmtMoney(rendicionTotal)}`, margin + 4, y + 10.5);
    doc.text(`• Total Venta Registrada en Sistema: ${fmtMoney(data.ventas.totalFacturado)}`, margin + 4, y + 15.5);

    doc.setFont('helvetica', 'bold');
    if (Math.abs(diferenciaRendicion) < 1) {
      doc.setTextColor(primaryLight[0], primaryLight[1], primaryLight[2]);
      doc.text(`✓ Cuadratura Total: $0,00 (La caja rendida coincide perfectamente con las ventas de Datalive)`, margin + 4, y + 21);
    } else if (diferenciaRendicion > 0) {
      doc.setTextColor(primaryLight[0], primaryLight[1], primaryLight[2]);
      doc.text(`▲ Sobrante Financiero en Caja: +${fmtMoney(diferenciaRendicion)} a favor`, margin + 4, y + 21);
    } else {
      doc.setTextColor(185, 28, 28);
      doc.text(`▼ Faltante Financiero en Caja: ${fmtSignedMoney(diferenciaRendicion)} respecto a ventas Datalive`, margin + 4, y + 21);
    }

    y += 30;
  }

  // Top Artículos Vendidos en el Turno
  const articulosArray = Object.values(data.ventas.articulos || {}).sort((a, b) => b.cantidad - a.cantidad);

  if (articulosArray.length > 0) {
    doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('ARTÍCULO VENDIDO (DATALIVE)', margin + 3, y + 3.8);
    doc.text('CATEGORÍA', margin + 95, y + 3.8);
    doc.text('UNIDADES', margin + 145, y + 3.8, { align: 'right' });
    doc.text('TOTAL MONTO', pageWidth - margin - 3, y + 3.8, { align: 'right' });

    y += 5.5;

    articulosArray.slice(0, 18).forEach((art, idx) => {
      const isAlt = idx % 2 === 1;
      if (isAlt) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 4.8, 'F');
      }
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, y + 4.8, pageWidth - margin, y + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.text(art.nombre, margin + 3, y + 3.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(art.categoria || '-', margin + 95, y + 3.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
      doc.text(String(art.cantidad), margin + 145, y + 3.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.text(art.totalMonto ? fmtMoney(art.totalMonto) : '-', pageWidth - margin - 3, y + 3.5, { align: 'right' });

      y += 4.8;
    });
  }

  // ==========================================
  // PÁGINA 2: PEDIDO OFICIAL A FÁBRICA
  // ==========================================
  doc.addPage();
  drawHeader('2. Planilla Oficial de Pedido a Fábrica', 'Cálculo de reposición según stock contado y consumo de ventas', 2, 2);

  let y2 = margin + 31;

  // Fábrica Instruction Banner
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(margin, y2, contentWidth, 12, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text('ORDEN DE DESPACHO Y REPOSICIÓN A FÁBRICA', margin + 3, y2 + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Esta orden contempla el stock remanente contado al cierre de turno y la proyección de consumo para el próximo despacho.', margin + 3, y2 + 8.5);

  y2 += 16;

  // Table header
  doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.rect(margin, y2, contentWidth, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PRODUCTO A DESPACHAR', margin + 3, y2 + 3.8);
  doc.text('STOCK ACTUAL', margin + 90, y2 + 3.8, { align: 'right' });
  doc.text('CONSUMO/VTA', margin + 115, y2 + 3.8, { align: 'right' });
  doc.text('SUG. FÁBRICA', margin + 142, y2 + 3.8, { align: 'right' });
  doc.text('PEDIDO FINAL (U)', margin + 170, y2 + 3.8, { align: 'right' });
  doc.text('DOCENAS/CAJAS', pageWidth - margin - 3, y2 + 3.8, { align: 'right' });

  y2 += 5.5;

  let totalUnidadesPedidas = 0;
  let totalDocenasPedidas = 0;

  data.pedidoFabrica.forEach((item, idx) => {
    if (y2 > pageHeight - margin - 18) {
      doc.addPage();
      drawHeader('2. Planilla Oficial de Pedido a Fábrica (Cont.)', 'Continuación del pedido de reposición', 2, 2);
      y2 = margin + 31;
    }

    const isAlt = idx % 2 === 1;
    if (isAlt) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y2, contentWidth, 5.2, 'F');
    }
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y2 + 5.2, pageWidth - margin, y2 + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(item.nombre, margin + 3, y2 + 3.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(String(item.stockContado), margin + 90, y2 + 3.8, { align: 'right' });
    doc.text(String(item.consumoTurno), margin + 115, y2 + 3.8, { align: 'right' });

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(primaryLight[0], primaryLight[1], primaryLight[2]);
    doc.text(String(item.sugeridoUnidades), margin + 142, y2 + 3.8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(String(item.confirmadoUnidades), margin + 170, y2 + 3.8, { align: 'right' });

    const docenas = (item.confirmadoUnidades / 12).toFixed(1);
    doc.text(`${docenas} doc`, pageWidth - margin - 3, y2 + 3.8, { align: 'right' });

    totalUnidadesPedidas += item.confirmadoUnidades;
    totalDocenasPedidas += item.confirmadoUnidades / 12;

    y2 += 5.2;
  });

  // Total summary footer row
  y2 += 2;
  doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.rect(margin, y2, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL GENERAL A DESPACHAR POR FÁBRICA:', margin + 4, y2 + 4.8);
  doc.text(`${totalUnidadesPedidas} unidades`, margin + 170, y2 + 4.8, { align: 'right' });
  doc.text(`${totalDocenasPedidas.toFixed(1)} docenas`, pageWidth - margin - 3, y2 + 4.8, { align: 'right' });

  // Signatures row
  y2 += 16;
  if (y2 < pageHeight - 35) {
    const signW = (contentWidth - 20) / 2;
    // Solicitado por Escobar
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin + 10, y2 + 10, margin + 10 + signW, y2 + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Firma y Aclaración (Encargado Central Escobar)', margin + 10 + signW / 2, y2 + 14, { align: 'center' });

    // Recibido en Fábrica
    const xSign2 = margin + 10 + signW + 20;
    doc.line(xSign2, y2 + 10, xSign2 + signW, y2 + 10);
    doc.text('Firma y Recepción (Despacho / Fábrica)', xSign2 + signW / 2, y2 + 14, { align: 'center' });
  }

  const filename = `Reporte_Gerencial_Ventas_Fabrica_${data.fecha}_${data.turno.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}
