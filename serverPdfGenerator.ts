import { jsPDF } from 'jspdf';
import { INITIAL_CATALOGO } from './src/data/centralData';
import { productId, nf, fmtMoney, fmtSignedMoney } from './src/utils/centralHelpers';

export interface ServerPdfTurnoData {
  fecha: string;
  turno: string;
  cerrado_por?: string;
  hora_cierre?: string;
  cierreCaja?: any;
  conteos?: Record<string, any>;
  sistemaStock?: Record<string, any>;
}

export function generateServerCierrePdfBuffer(turnoData: ServerPdfTurnoData): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const greenPrimary = [18, 61, 38];
  const greenLight = [238, 245, 240];
  const stoneMuted = [100, 116, 139];
  const stoneDark = [30, 41, 59];
  const borderColor = [226, 232, 240];

  const drawHeader = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.rect(margin, y, contentWidth, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CENTRAL DE PIZZAS & EMPANADAS · ESCOBAR', margin + 4, y + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('ACTA OFICIAL DE CIERRE DE TURNO Y CONTROL DE STOCK', margin + 4, y + 12.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Pág. ${pageNumber}/${totalPages}`, pageWidth - margin - 4, y + 6.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${turnoData.fecha} · Turno ${turnoData.turno}`, pageWidth - margin - 4, y + 12.5, { align: 'right' });

    y += 21;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
      drawHeader(doc.getNumberOfPages(), doc.getNumberOfPages());
    }
  };

  drawHeader(1, 1);

  // Meta bar
  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.setDrawColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 11, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('CERRADO POR:', margin + 4, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.cerrado_por || turnoData.cierreCaja?.empleado || 'Colaborador'}`, margin + 30, y + 4.5);

  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('HORA CIERRE:', margin + 85, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.hora_cierre || turnoData.cierreCaja?.hora || '—'} hs`, margin + 110, y + 4.5);

  doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.text('FECHA:', margin + 140, y + 4.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`${turnoData.fecha}`, margin + 155, y + 4.5);

  y += 14;

  // SECCION 1: CIERRE DE CAJA
  const cc = turnoData.cierreCaja || {};
  const efReal = Number(cc.efectivo_real) || 0;
  const efSist = Number(cc.efectivo_mostrador_sist) || 0;
  const difCaja = efReal - efSist;
  const postnets = (Number(cc.postnet_amarillo) || 0) + (Number(cc.postnet_rosa) || 0) + (Number(cc.postnet_blanco) || 0) || (Number(cc.online_local_sist) || 0);

  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.text('1. CIERRE DE CAJA Y ARQUEO DE EFECTIVO', margin + 3, y + 4.2);
  y += 8;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, contentWidth, 16, 1.5, 1.5, 'FD');

  const colW = contentWidth / 4;
  doc.setFontSize(7);
  doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
  doc.text('EFECTIVO REAL', margin + 3, y + 4.5);
  doc.text('TEÓRICO DATALIVE', margin + colW + 3, y + 4.5);
  doc.text('DIFERENCIA CAJA', margin + colW * 2 + 3, y + 4.5);
  doc.text('POSTNETS / DIGITAL', margin + colW * 3 + 3, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(fmtMoney(efReal), margin + 3, y + 10.5);
  doc.text(fmtMoney(efSist), margin + colW + 3, y + 10.5);

  doc.setTextColor(difCaja === 0 ? 30 : difCaja > 0 ? 16 : 225, difCaja === 0 ? 41 : difCaja > 0 ? 120 : 29, difCaja === 0 ? 59 : difCaja > 0 ? 60 : 72);
  doc.text(difCaja === 0 ? '$ 0 (Cuadrada)' : fmtSignedMoney(difCaja), margin + colW * 2 + 3, y + 10.5);

  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(fmtMoney(postnets), margin + colW * 3 + 3, y + 10.5);

  if (cc.observaciones) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text(`Obs: ${cc.observaciones}`, margin + 3, y + 14.5);
  }

  y += 19;

  // SECCION 2: STOCK Y CONTEOS FÍSICOS
  let totalSistema = 0;
  let totalContado = 0;
  let difAbs = 0;
  let prodsConDif = 0;
  let totalProds = 0;

  const conteos = turnoData.conteos || {};
  const sistema = turnoData.sistemaStock || {};

  INITIAL_CATALOGO.forEach((cat) => {
    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        const pid = productId(cat.id, p);
        const s = sistema[pid]?.stock ?? 0;
        const entry = conteos[pid];
        let c = 0;
        if (entry) {
          if (typeof entry === 'number') c = entry;
          else if (entry.ubic) c = Object.values(entry.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
          else if (typeof entry.contado === 'number') c = entry.contado;
        }
        totalSistema += s;
        totalContado += c;
        totalProds++;
        const d = c - s;
        if (d !== 0) {
          difAbs += Math.abs(d);
          prodsConDif++;
        }
      });
    });
  });

  doc.setFillColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.text('2. AUDITORÍA GENERAL DE STOCK (FÍSICO VS. SISTEMA)', margin + 3, y + 4.2);
  y += 8;

  doc.setFillColor(greenLight[0], greenLight[1], greenLight[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, contentWidth, 10, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
  doc.text(`TOTAL SISTEMA: ${nf(totalSistema)} u.`, margin + 4, y + 6.2);
  doc.text(`TOTAL CONTADO: ${nf(totalContado)} u.`, margin + 60, y + 6.2);
  doc.text(`DIF. ABSOLUTA: ${nf(difAbs)} u.`, margin + 120, y + 6.2);
  doc.text(`CON DESVÍO: ${prodsConDif} prods`, margin + 162, y + 6.2);
  y += 13;

  // TABLA DETALLADA POR CATEGORÍAS
  INITIAL_CATALOGO.forEach((cat) => {
    checkPageBreak(25);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.rect(margin, y, contentWidth, 5.5, 'FD');
    doc.setTextColor(greenPrimary[0], greenPrimary[1], greenPrimary[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(cat.nombre.toUpperCase(), margin + 3, y + 3.8);

    doc.setFontSize(6.5);
    doc.setTextColor(stoneMuted[0], stoneMuted[1], stoneMuted[2]);
    doc.text('SISTEMA', margin + 120, y + 3.8, { align: 'right' });
    doc.text('CONTADO', margin + 150, y + 3.8, { align: 'right' });
    doc.text('DIFERENCIA', margin + contentWidth - 3, y + 3.8, { align: 'right' });
    y += 6.5;

    cat.grupos.forEach((g) => {
      g.productos.forEach((p) => {
        checkPageBreak(5.5);

        const pid = productId(cat.id, p);
        const s = sistema[pid]?.stock ?? 0;
        const entry = conteos[pid];
        let c = 0;
        if (entry) {
          if (typeof entry === 'number') c = entry;
          else if (entry.ubic) c = Object.values(entry.ubic).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
          else if (typeof entry.contado === 'number') c = entry.contado;
        }
        const diff = c - s;

        doc.setFont('helvetica', diff !== 0 ? 'bold' : 'normal');
        doc.setFontSize(7);
        doc.setTextColor(stoneDark[0], stoneDark[1], stoneDark[2]);
        doc.text(p.nombre, margin + 3, y + 3.5);

        doc.setFont('helvetica', 'normal');
        doc.text(nf(s), margin + 120, y + 3.5, { align: 'right' });
        doc.text(nf(c), margin + 150, y + 3.5, { align: 'right' });

        if (diff === 0) {
          doc.setTextColor(150, 150, 150);
          doc.text('0', margin + contentWidth - 3, y + 3.5, { align: 'right' });
        } else if (diff > 0) {
          doc.setTextColor(16, 120, 60);
          doc.text(`+${diff}`, margin + contentWidth - 3, y + 3.5, { align: 'right' });
        } else {
          doc.setTextColor(225, 29, 72);
          doc.text(`${diff}`, margin + contentWidth - 3, y + 3.5, { align: 'right' });
        }

        y += 4.5;
      });
    });

    y += 2;
  });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
