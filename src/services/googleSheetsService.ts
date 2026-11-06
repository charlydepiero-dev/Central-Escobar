import { CierreCajaData, TurnoCierre, MapaConteos, MapaSistemaStock, CategoriaCatalogo } from '../types/central';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

export interface SheetSyncResult {
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  message?: string;
}

// Search or create "Central Escobar - Control de Stock & Caja" in Google Drive
export async function getOrCreateSpreadsheet(token: string): Promise<SheetSyncResult> {
  const query = "name = 'Central Escobar - Control de Stock & Caja' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const searchUrl = `${DRIVE_BASE}?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`;

  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        const found = data.files[0];
        return {
          ok: true,
          spreadsheetId: found.id,
          spreadsheetUrl: found.webViewLink || `https://docs.google.com/spreadsheets/d/${found.id}/edit`,
        };
      }
    }

    // Create new spreadsheet if none exists
    const createRes = await fetch(SHEETS_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: 'Central Escobar - Control de Stock & Caja',
        },
        sheets: [
          { properties: { title: 'SistemaStock' } },
          { properties: { title: 'Conteos' } },
          { properties: { title: 'CierresCaja' } },
          { properties: { title: 'HistoricoTurnos' } },
        ],
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json();
      throw new Error(errData.error?.message || 'Error al crear la hoja en Google Sheets');
    }

    const newSheet = await createRes.json();
    const spreadsheetId = newSheet.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Initialize headers in newly created sheets
    await initializeHeaders(token, spreadsheetId);

    return {
      ok: true,
      spreadsheetId,
      spreadsheetUrl,
    };
  } catch (error: any) {
    console.error('Error getOrCreateSpreadsheet:', error);
    return {
      ok: false,
      spreadsheetId: '',
      spreadsheetUrl: '',
      message: error.message || 'Error de conexión con Google Sheets',
    };
  }
}

async function initializeHeaders(token: string, spreadsheetId: string) {
  const headersPayload = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: 'SistemaStock!A1:E1',
        values: [['ID', 'Código', 'Producto', 'Stock Datalive', 'Última Actualización']],
      },
      {
        range: 'Conteos!A1:H1',
        values: [['Fecha', 'Turno', 'ID Producto', 'Producto', 'Ubicación', 'Cantidad Contada', 'Empleado', 'Hora']],
      },
      {
        range: 'CierresCaja!A1:L1',
        values: [[
          'Fecha', 'Turno', 'Postnet Amarillo', 'Postnet Rosa', 'Postnet Blanco',
          'Online Local Sist', 'Efectivo Real', 'Efectivo Mostrador Sist',
          'Saldo Total', 'Observaciones', 'Empleado', 'Hora'
        ]],
      },
      {
        range: 'HistoricoTurnos!A1:I1',
        values: [[
          'Fecha', 'Turno', 'Cerrado Por', 'Hora Cierre', 'Total Sistema',
          'Total Contado', 'Diferencia Absoluta', 'Saldo Caja', 'Fecha ISO'
        ]],
      },
    ],
  };

  await fetch(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(headersPayload),
  });
}

// Sync full state to Google Sheets
export async function syncFullStateToSheets(
  token: string,
  spreadsheetId: string,
  params: {
    catalogo: CategoriaCatalogo[];
    sistemaStock: MapaSistemaStock;
    conteoActual: MapaConteos;
    cierreCaja: CierreCajaData;
    fecha: string;
    turno: string;
    pastTurnos: TurnoCierre[];
  }
): Promise<{ ok: boolean; message?: string }> {
  try {
    // 1. Prepare SistemaStock rows
    const stockRows: any[][] = [['ID', 'Código', 'Producto', 'Stock Datalive', 'Última Actualización']];
    params.catalogo.forEach((cat) => {
      cat.grupos.forEach((g) => {
        g.productos.forEach((p) => {
          const pid = p.codigo ? `c-${p.codigo}` : `n-${cat.id}-${p.nombre}`;
          const stock = params.sistemaStock[pid]?.stock ?? 0;
          const actualizado = params.sistemaStock[pid]?.actualizado || new Date().toISOString();
          stockRows.push([pid, p.codigo || '', p.nombre, stock, actualizado]);
        });
      });
    });

    // 2. Prepare Conteos rows for current shift
    const conteoRows: any[][] = [['Fecha', 'Turno', 'ID Producto', 'Producto', 'Ubicación', 'Cantidad Contada', 'Empleado', 'Hora']];
    Object.entries(params.conteoActual).forEach(([pid, c]) => {
      // Find product name
      let prodName = pid;
      params.catalogo.forEach((cat) => {
        cat.grupos.forEach((g) => {
          g.productos.forEach((p) => {
            const checkPid = p.codigo ? `c-${p.codigo}` : `n-${cat.id}-${p.nombre}`;
            if (checkPid === pid) prodName = p.nombre;
          });
        });
      });

      Object.entries(c.ubic).forEach(([ubic, cant]) => {
        conteoRows.push([
          params.fecha,
          params.turno,
          pid,
          prodName,
          ubic,
          cant,
          c.empleado,
          c.hora,
        ]);
      });
    });

    // 3. Prepare CierresCaja row
    const cajaRows: any[][] = [[
      'Fecha', 'Turno', 'Postnet Amarillo', 'Postnet Rosa', 'Postnet Blanco',
      'Online Local Sist', 'Efectivo Real', 'Efectivo Mostrador Sist',
      'Saldo Total', 'Observaciones', 'Empleado', 'Hora'
    ]];

    if (params.cierreCaja.existe) {
      const sumaPostnets = (params.cierreCaja.postnet_amarillo || 0) + (params.cierreCaja.postnet_rosa || 0) + (params.cierreCaja.postnet_blanco || 0);
      const difPostnets = sumaPostnets - (params.cierreCaja.online_local_sist || 0);
      const difEfectivo = (params.cierreCaja.efectivo_real || 0) - (params.cierreCaja.efectivo_mostrador_sist || 0);
      const saldoTotal = difPostnets + difEfectivo;

      cajaRows.push([
        params.fecha,
        params.turno,
        params.cierreCaja.postnet_amarillo,
        params.cierreCaja.postnet_rosa,
        params.cierreCaja.postnet_blanco,
        params.cierreCaja.online_local_sist,
        params.cierreCaja.efectivo_real,
        params.cierreCaja.efectivo_mostrador_sist,
        saldoTotal,
        params.cierreCaja.observaciones || '',
        params.cierreCaja.empleado,
        params.cierreCaja.hora,
      ]);
    }

    // 4. Prepare HistoricoTurnos rows
    const turnosRows: any[][] = [[
      'Fecha', 'Turno', 'Cerrado Por', 'Hora Cierre', 'Total Sistema',
      'Total Contado', 'Diferencia Absoluta', 'Saldo Caja', 'Fecha ISO'
    ]];

    params.pastTurnos.forEach((t) => {
      turnosRows.push([
        t.fecha,
        t.turno,
        t.cerrado_por || 'Sistema',
        t.hora_cierre || '—',
        '—',
        '—',
        '—',
        t.cierreCaja?.existe ? 'Registrado' : '—',
        new Date().toISOString(),
      ]);
    });

    // Update all 4 sheets in batch
    const payload = {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'SistemaStock!A1:E' + stockRows.length, values: stockRows },
        { range: 'Conteos!A1:H' + conteoRows.length, values: conteoRows },
        { range: 'CierresCaja!A1:L' + cajaRows.length, values: cajaRows },
        { range: 'HistoricoTurnos!A1:I' + turnosRows.length, values: turnosRows },
      ],
    };

    const res = await fetch(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Error al actualizar celdas en Google Sheets');
    }

    return { ok: true };
  } catch (error: any) {
    console.error('Error syncFullStateToSheets:', error);
    return { ok: false, message: error.message };
  }
}
