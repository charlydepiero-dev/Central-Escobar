import { jsPDF } from 'jspdf';
import { AperturaDiaData } from '../types/central';
import { fmtMoney, fmtSignedMoney } from './centralHelpers';

export function generateAperturaPDF(data: AperturaDiaData): { blob: Blob; filename: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const greenPrimary = [18, 61, 38]; // #123D26
  const greenLight = [238, 245, 240];
  const stoneMuted = [115, 115, 115];
  const stoneDark = [28, 25, 23];
  const borderGrey = [220, 220, 220];
  const roseRed = [190, 24, 24];
  const emeraldGreen = [16, 120, 60];

  // Helper page header
  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('CENTRAL DE PIZZAS & EMPANADAS · ESCOBAR', margin + 5, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('ACTA DE AUDITORÍA Y APERTURA DEL DÍA', margin + 5, y + 14);

    doc.setFontSize(8);
    doc.text(`Pág. ${pageNumber} de ${totalPages}`, pageWidth - margin - 5, y + 8, { align: 'right' });
    doc.text(`Fecha: ${data.fecha} · Hora: ${data.hora}`, pageWidth - margin - 5, y + 14, { align: 'right' });

    y += 26;
  };

  // Helper check page break
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 15) {
      doc.addPage();
      y = margin;
      drawHeader(doc.getNumberOfPages(), doc.getNumberOfPages());
    }
  };

  drawHeader(1, 1);

  // Metadata block
  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
  doc.setDrawColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('RESPONSABLE DE APERTURA:', margin + 4, y + 6);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${data.empleado || 'Colaborador'}`, margin + 54, y + 6);

  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('TURNO ANTERIOR AUDITADO:', margin + 4, y + 12);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(
    `Turno ${data.turnoAnteriorTurno || 'Tarde'} (${data.turnoAnteriorFecha || 'Ayer'}) - Cerrado por ${data.turnoAnteriorCerradoPor || 'Personal nocturno'}`,
    margin + 54,
    y + 12
  );

  y += 20;

  // SECCION 1: ARQUEO DE CAJA INICIAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('1. CONVALIDACIÓN DE CAJA INICIAL (EFECTIVO)', margin, y);
  y += 4;

  const boxHeight = 22;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

  const colW = contentWidth / 3;

  // Col 1: Esperado Noche
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO NOCHE ANTERIOR', margin + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(fmtMoney(data.efectivoAnteriorEsperado), margin + 4, y + 14);

  // Col 2: Contado Apertura
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO CONTADO AL ABRIR', margin + colW + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(fmtMoney(data.efectivoContadoApertura), margin + colW + 4, y + 14);

  // Col 3: Diferencia
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('DIFERENCIA EN CAJA', margin + colW * 2 + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  if (data.diferenciaEfectivo === 0) {
    doc.setTextColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
    doc.text('$ 0 (Cuadrada)', margin + colW * 2 + 4, y + 14);
  } else if (data.diferenciaEfectivo > 0) {
    doc.setTextColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
    doc.text(fmtSignedMoney(data.diferenciaEfectivo) + ' (Sobrante)', margin + colW * 2 + 4, y + 14);
  } else {
    doc.setTextColor(roseRed[0], roseRed[1], roseRed[2]);
    doc.text(fmtSignedMoney(data.diferenciaEfectivo) + ' (Faltante)', margin + colW * 2 + 4, y + 14);
  }

  y += boxHeight + 4;

  if (data.observacionesCaja && data.observacionesCaja.trim() !== '') {
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(`Observación de caja: ${data.observacionesCaja}`, margin + 3, y + 6);
    y += 12;
  } else {
    y += 2;
  }

  // SECCION 2: AUDITORIA DE STOCK FISICO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('2. AUDITORÍA COMPARATIVA DE STOCK FÍSICO (NOCHE VS. APERTURA)', margin, y);
  y += 5;

  const stockEntries = Object.entries(data.stockAudit || {});
  const differences = stockEntries.filter(([_, item]) => item.diferencia !== 0);

  // Table header
  const drawTableHeader = () => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    doc.text('PRODUCTO', margin + 3, y + 4.8);
    doc.text('CATEGORÍA', margin + 85, y + 4.8);
    doc.text('CONTADO ANOCHE', margin + 125, y + 4.8, { align: 'right' });
    doc.text('APERTURA MAÑANA', margin + 158, y + 4.8, { align: 'right' });
    doc.text('DIFERENCIA', margin + contentWidth - 3, y + 4.8, { align: 'right' });
    y += 7;
  };

  drawTableHeader();

  // Print all stock audit entries
  stockEntries.forEach(([_, item], idx) => {
    checkPageBreak(7);

    const hasDiff = item.diferencia !== 0;
    if (hasDiff) {
      doc.setFillColor(254, 242, 242); // red tint for diff
      doc.rect(margin, y, contentWidth, 6, 'F');
    } else if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, contentWidth, 6, 'F');
    }

    // Line border
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    doc.line(margin, y + 6, margin + contentWidth, y + 6);

    doc.setFont('helvetica', hasDiff ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);

    const nombreTxt = `${item.nombre}${item.codigo ? ` (${item.codigo})` : ''}`;
    doc.text(nombreTxt.length > 40 ? nombreTxt.substring(0, 38) + '...' : nombreTxt, margin + 3, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text(item.categoria || 'Varios', margin + 85, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text(item.contadoNoche.toString(), margin + 125, y + 4.2, { align: 'right' });

    doc.text(item.contadoApertura.toString(), margin + 155, y + 4.2, { align: 'right' });

    if (item.diferencia === 0) {
      doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
      doc.text('0', margin + contentWidth - 3, y + 4.2, { align: 'right' });
    } else if (item.diferencia > 0) {
      doc.setTextColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(`+${item.diferencia}`, margin + contentWidth - 3, y + 4.2, { align: 'right' });
    } else {
      doc.setTextColor(roseRed[0], roseRed[1], roseRed[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.diferencia}`, margin + contentWidth - 3, y + 4.2, { align: 'right' });
    }

    y += 6;
  });

  // Resumen de diferencias
  checkPageBreak(35);
  y += 4;
  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  if (differences.length === 0) {
    doc.text('✓ CONCILIACIÓN PERFECTA: El stock físico coincide 100% con lo cerrado en el turno anterior.', margin + 4, y + 7);
  } else {
    doc.text(
      `⚠️ SE DETECTARON ${differences.length} DIFERENCIA(S) respecto al conteo del turno noche anterior.`,
      margin + 4,
      y + 7
    );
  }
  y += 16;

  // Observaciones generales de Stock
  if (data.observacionesStock && data.observacionesStock.trim() !== '') {
    checkPageBreak(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    doc.text('OBSERVACIONES DE STOCK AL ABRIR:', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
    const splitObs = doc.splitTextToSize(data.observacionesStock, contentWidth - 6);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(margin, y, contentWidth, splitObs.length * 4.5 + 4, 1.5, 1.5, 'F');
    doc.text(splitObs, margin + 3, y + 4.5);
    y += splitObs.length * 4.5 + 8;
  }

  // Firmas al pie
  checkPageBreak(25);
  y += 6;
  const sigW = (contentWidth - 20) / 2;
  doc.setDrawColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.setLineWidth(0.3);
  doc.line(margin + 5, y + 12, margin + 5 + sigW, y + 12);
  doc.line(margin + contentWidth - 5 - sigW, y + 12, margin + contentWidth - 5, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text(`Firma Empleado Apertura (${data.empleado})`, margin + 5 + sigW / 2, y + 16, { align: 'center' });
  doc.text('Firma Encargado / Gerencia Escobar', margin + contentWidth - 5 - sigW / 2, y + 16, { align: 'center' });

  // Update total pages number across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Pág. ${i} de ${totalPages}`, pageWidth - margin - 5, margin + 8, { align: 'right' });
  }

  const blob = doc.output('blob');
  const filename = `Apertura_Escobar_${data.fecha}.pdf`;
  return { blob, filename };
}

export function buildWhatsAppMessage(data: AperturaDiaData): string {
  const stockEntries = Object.entries(data.stockAudit || {});
  const differences = stockEntries.filter(([_, item]) => item.diferencia !== 0);

  let msg = `*CENTRAL ESCOBAR · APERTURA DEL DÍA*\n`;
  msg += `📅 *Fecha:* ${data.fecha} · *Hora:* ${data.hora}\n`;
  msg += `👤 *Responsable Apertura:* ${data.empleado}\n`;
  msg += `🌙 *Turno auditado:* ${data.turnoAnteriorTurno} (${data.turnoAnteriorFecha}) - Cierre de ${data.turnoAnteriorCerradoPor || 'Turno noche'}\n\n`;

  msg += `💵 *ARQUEO DE CAJA INICIAL:*\n`;
  msg += `• Dejado en noche anterior: ${fmtMoney(data.efectivoAnteriorEsperado)}\n`;
  msg += `• Contado al abrir: ${fmtMoney(data.efectivoContadoApertura)}\n`;
  const difCajaTxt = data.diferenciaEfectivo === 0 ? '$ 0 (Sin diferencia)' : fmtSignedMoney(data.diferenciaEfectivo);
  msg += `• Diferencia de caja: *${difCajaTxt}*\n`;
  if (data.observacionesCaja) {
    msg += `• Obs. Caja: _${data.observacionesCaja}_\n`;
  }

  msg += `\n📦 *AUDITORÍA DE STOCK FÍSICO:*\n`;
  if (differences.length === 0) {
    msg += `✓ *Todo coincide:* El stock físico coincide perfectamente con lo contado anoche.\n`;
  } else {
    msg += `⚠️ *Diferencias detectadas (${differences.length} ítems):*\n`;
    differences.slice(0, 15).forEach(([_, item]) => {
      const sign = item.diferencia > 0 ? `+${item.diferencia}` : `${item.diferencia}`;
      msg += `  • *${item.nombre}:* Noche ${item.contadoNoche} ➔ Mañana ${item.contadoApertura} (Dif: ${sign})\n`;
    });
    if (differences.length > 15) {
      msg += `  • ... y ${differences.length - 15} producto(s) más detallados en el PDF.\n`;
    }
  }

  if (data.observacionesStock) {
    msg += `\n📝 *Obs. Stock:* _${data.observacionesStock}_\n`;
  }

  msg += `\n📄 Reporte formal generado desde el sistema Central Escobar.`;
  return msg;
}
