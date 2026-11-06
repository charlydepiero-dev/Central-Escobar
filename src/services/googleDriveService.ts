import { getAccessToken } from './googleAuth';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface DriveSaveResult {
  ok: boolean;
  driveUrl?: string;
  serverUrl?: string;
  fileId?: string;
  folderId?: string;
  message?: string;
}

/**
 * Searches for or creates a folder in Google Drive for shift closure reports
 */
export async function getOrCreateReportsFolder(
  token: string, 
  folderName = 'Reportes Cierre de Turno - Escobar'
): Promise<string | null> {
  try {
    const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create folder if not found
    const createRes = await fetch(DRIVE_FILES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (createRes.ok) {
      const newFolder = await createRes.json();
      return newFolder.id;
    }
  } catch (err) {
    console.warn('[Google Drive] Error buscando/creando carpeta de reportes:', err);
  }
  return null;
}

/**
 * Uploads a shift closure PDF to Google Drive directly using Drive API v3
 * Only shift closure PDFs are targeted for this folder.
 */
export async function uploadPdfToGoogleDrive(
  pdfBlob: Blob,
  filename: string,
  token?: string
): Promise<{ ok: boolean; driveUrl?: string; fileId?: string; message?: string }> {
  try {
    const authToken = token || (await getAccessToken());
    if (!authToken) {
      return { ok: false, message: 'Inicia sesión con Google para sincronizar en Google Drive.' };
    }

    const folderId = await getOrCreateReportsFolder(authToken, 'Reportes Cierre de Turno - Escobar');

    const metadata: Record<string, any> = {
      name: filename,
      mimeType: 'application/pdf',
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();

    // Build multipart body
    const bodyUint8Array = new Uint8Array([
      ...new TextEncoder().encode(metadataPart),
      ...new TextEncoder().encode(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      ...new Uint8Array(pdfArrayBuffer),
      ...new TextEncoder().encode(closeDelimiter),
    ]);

    const uploadRes = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyUint8Array,
    });

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Google Drive respondió status ${uploadRes.status}`);
    }

    const fileData = await uploadRes.json();
    const fileId = fileData.id;
    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // Try making file viewable with link (anyone with link can view)
    try {
      await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      });
    } catch (permErr) {
      console.warn('[Google Drive] No se pudo establecer permiso público:', permErr);
    }

    return {
      ok: true,
      fileId,
      driveUrl,
    };
  } catch (err: any) {
    console.error('[Google Drive] Error al subir PDF a Drive:', err);
    return {
      ok: false,
      message: err.message || 'Error al subir a Google Drive',
    };
  }
}

/**
 * Saves Shift Closure PDF to both local server storage and Google Drive
 * STRICTLY for shift closures ('solo los que son de cierre del turno')
 */
export async function saveShiftPdfToDriveAndServer(
  pdfFile: File | Blob,
  filename: string,
  extraMeta?: { fecha: string; turno: string; cerradoPor?: string }
): Promise<DriveSaveResult> {
  let serverUrl = '';
  let driveUrl = '';
  let fileId = '';
  let driveError = '';

  // 1. Upload to local server storage
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
      reader.readAsDataURL(pdfFile);
    });
    const base64 = await base64Promise;

    const res = await fetch('/api/reportes/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64,
        filename,
        fecha: extraMeta?.fecha,
        turno: extraMeta?.turno,
        cerradoPor: extraMeta?.cerradoPor,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      serverUrl = json.url || '';
      if (json.driveUrl) {
        driveUrl = json.driveUrl;
        fileId = json.driveFileId || '';
      }
    }
  } catch (err) {
    console.warn('[Server Storage] Error guardando PDF en servidor:', err);
  }

  // 2. Client-side redundancy: if Carlos has already authenticated with Google in this browser, also upload via Drive API v3
  if (!driveUrl) {
    try {
      const token = await getAccessToken();
      if (token) {
        const driveRes = await uploadPdfToGoogleDrive(pdfFile, filename, token);
        if (driveRes.ok && driveRes.driveUrl) {
          driveUrl = driveRes.driveUrl;
          fileId = driveRes.fileId || '';
        }
      }
    } catch (err: any) {
      console.warn('[Google Drive] No se pudo guardar con sesión cliente:', err);
    }
  }

  return {
    ok: Boolean(driveUrl || serverUrl),
    driveUrl: driveUrl || undefined,
    serverUrl: serverUrl || undefined,
    fileId: fileId || undefined,
    message: driveUrl
      ? '✓ Guardado exitosamente en Google Drive (Carpeta: Reportes Cierre de Turno - Escobar)'
      : '✓ Guardado de respaldo en servidor local.',
  };
}
