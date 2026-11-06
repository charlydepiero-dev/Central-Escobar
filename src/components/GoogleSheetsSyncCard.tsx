import React, { useState, useEffect } from 'react';
import { useCentral } from '../context/CentralContext';
import { googleSignIn, logoutGoogle, getAccessToken, initAuth } from '../services/googleAuth';
import { getOrCreateSpreadsheet, syncFullStateToSheets } from '../services/googleSheetsService';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  LogOut 
} from 'lucide-react';

export const GoogleSheetsSyncCard: React.FC = () => {
  const {
    catalogo,
    sistemaStock,
    conteoActual,
    cierreCaja,
    pastTurnos,
    currentFecha,
    currentTurno,
  } = useCentral();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem('central_spreadsheet_id');
  });
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(() => {
    return localStorage.getItem('central_spreadsheet_url');
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('central_last_sheet_sync');
  });
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // 1. Fetch server-persisted Google Sheets config
    fetch('/api/google/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.config?.spreadsheetId) {
          setSpreadsheetId(data.config.spreadsheetId);
          setSpreadsheetUrl(data.config.spreadsheetUrl);
          localStorage.setItem('central_spreadsheet_id', data.config.spreadsheetId);
          localStorage.setItem('central_spreadsheet_url', data.config.spreadsheetUrl);
        }
      })
      .catch((e) => console.log('Could not fetch server google config:', e));

    // 2. Initialize Auth
    initAuth(
      (user, token) => {
        setUserEmail(user.email);
        autoConnectSheet(token);
      },
      () => {
        setUserEmail(null);
      }
    );
  }, []);

  const autoConnectSheet = async (token: string) => {
    const existingId = localStorage.getItem('central_spreadsheet_id') || spreadsheetId;
    if (!existingId) {
      const sheet = await getOrCreateSpreadsheet(token);
      if (sheet.ok && sheet.spreadsheetId) {
        setSpreadsheetId(sheet.spreadsheetId);
        setSpreadsheetUrl(sheet.spreadsheetUrl);
        localStorage.setItem('central_spreadsheet_id', sheet.spreadsheetId);
        localStorage.setItem('central_spreadsheet_url', sheet.spreadsheetUrl);
        // Persist to server
        fetch('/api/google/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: sheet.spreadsheetId,
            spreadsheetUrl: sheet.spreadsheetUrl,
          }),
        }).catch((e) => console.log('Error saving sheet config to server:', e));
      }
    }
  };

  const handleGoogleLogin = async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUserEmail(res.user.email);
        const sheet = await getOrCreateSpreadsheet(res.accessToken);
        if (sheet.ok) {
          setSpreadsheetId(sheet.spreadsheetId);
          setSpreadsheetUrl(sheet.spreadsheetUrl);
          localStorage.setItem('central_spreadsheet_id', sheet.spreadsheetId);
          localStorage.setItem('central_spreadsheet_url', sheet.spreadsheetUrl);

          // Persist to server so other phones/devices auto-connect without asking
          fetch('/api/google/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              spreadsheetId: sheet.spreadsheetId,
              spreadsheetUrl: sheet.spreadsheetUrl,
              accountEmail: res.user.email,
            }),
          }).catch((e) => console.log('Error saving sheet config to server:', e));

          setStatusMsg({
            type: 'ok',
            text: '✓ Vinculado con éxito a tu cuenta de Google Sheets. Guardado permanentemente para todos los dispositivos.',
          });
          // Do first sync
          await executeSync(res.accessToken, sheet.spreadsheetId);
        } else {
          setStatusMsg({
            type: 'error',
            text: sheet.message || 'Error al conectar con Google Sheets.',
          });
        }
      }
    } catch (error: any) {
      setStatusMsg({
        type: 'error',
        text: error.message || 'Error durante la autenticación con Google.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const executeSync = async (token: string, targetSheetId: string) => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const syncResult = await syncFullStateToSheets(token, targetSheetId, {
        catalogo,
        sistemaStock,
        conteoActual,
        cierreCaja,
        fecha: currentFecha,
        turno: currentTurno,
        pastTurnos,
      });

      if (syncResult.ok) {
        const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(timeStr);
        localStorage.setItem('central_last_sheet_sync', timeStr);
        setStatusMsg({
          type: 'ok',
          text: `✓ Sincronizado correctamente a las ${timeStr}. Todos tus dispositivos ven estos datos.`,
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: syncResult.message || 'Error al guardar los datos en la hoja.',
        });
      }
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: e.message || 'Error de sincronización.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = async () => {
    const token = await getAccessToken();
    if (!token || !spreadsheetId) {
      await handleGoogleLogin();
      return;
    }
    await executeSync(token, spreadsheetId);
  };

  const handleDisconnect = async () => {
    await logoutGoogle();
    setUserEmail(null);
    setStatusMsg(null);
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-emerald-900/15 shadow-xs space-y-4 text-xs">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-[#1B5E38]" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-stone-900">
              Vincular con Google Sheets (Base de Datos en la Nube)
            </h3>
            <p className="text-[11px] text-stone-500">
              Todos los celulares conectados sincronizan el stock y los cierres en tu propia planilla.
            </p>
          </div>
        </div>

        {userEmail && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span>Conectado</span>
          </span>
        )}
      </div>

      {/* Main Connection State */}
      {!userEmail ? (
        <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center space-y-3">
          <p className="text-stone-600 font-medium">
            Conecta tu cuenta de Google para crear automáticamente la hoja de cálculo <strong>«Central Escobar - Control de Stock &amp; Caja»</strong> en tu Google Drive.
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={isSyncing}
            className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-white hover:bg-stone-50 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 shadow-xs transition-all cursor-pointer active:scale-98"
          >
            {/* Google Icon SVG */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isSyncing ? 'Conectando...' : 'Conectar con Google'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                  Cuenta Vinculada:
                </span>
                <p className="font-bold text-stone-900 text-xs">{userEmail}</p>
              </div>

              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-[#1B5E38] font-bold rounded-lg border border-emerald-300 transition-colors shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Hoja en Google Sheets</span>
                </a>
              )}
            </div>

            {lastSyncTime && (
              <p className="text-[11px] text-emerald-900 font-medium pt-1 border-t border-emerald-200/60">
                Última sincronización: <strong>{lastSyncTime}</strong> (Se actualiza automáticamente al guardar).
              </p>
            )}
          </div>

          {/* Sync actions */}
          <div className="flex gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex-1 py-2.5 px-4 bg-[#1B5E38] hover:bg-[#14472B] disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar a Google Sheets Ahora'}</span>
            </button>

            <button
              onClick={handleDisconnect}
              className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold cursor-pointer"
              title="Desconectar cuenta"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Status banner */}
      {statusMsg && (
        <div
          className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            statusMsg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          {statusMsg.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

    </div>
  );
};
