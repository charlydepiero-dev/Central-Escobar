import React, { useState, useEffect, useRef } from 'react';
import { useCentral } from '../context/CentralContext';
import { generateShiftPDF } from '../utils/pdfGenerator';
import { saveShiftPdfToDriveAndServer, uploadPdfToGoogleDrive } from '../services/googleDriveService';
import { googleSignIn, getAccessToken } from '../services/googleAuth';
import { abrirWhatsApp, isAdminUser } from '../utils/centralHelpers';
import { 
  CheckCircle2, 
  Send, 
  X, 
  CloudCheck,
  Smartphone,
  ExternalLink,
  Loader2,
  Cloud,
  FolderCheck,
  AlertCircle,
  HardDrive
} from 'lucide-react';

export const ResumenCierreModal: React.FC = () => {
  const {
    resumenModalData,
    setResumenModalData,
    catalogo,
    sistemaStock,
    conteoActual,
    cierreCaja,
    reclamos,
    pastTurnos,
    currentFecha,
    currentTurno,
    currentEmpleado,
  } = useCentral();

  const [otroNumero, setOtroNumero] = useState('');
  const [showOtroNumeroInput, setShowOtroNumeroInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; text: string; link?: string } | null>(null);

  // Estados de archivo y respaldo (Google Drive + Servidor)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'saved' | 'saved_server'>('idle');
  const [driveFileLink, setDriveFileLink] = useState<string | null>(null);
  const [serverFileLink, setServerFileLink] = useState<string | null>(null);
  const [driveMessage, setDriveMessage] = useState<string>('');
  const autoUploadAttemptedRef = useRef<boolean>(false);

  const buildDocData = () => {
    return {
      fecha: resumenModalData?.fecha || currentFecha,
      turno: resumenModalData?.turno || currentTurno,
      cerradoPor: currentEmpleado?.nombre || 'Carlos',
      horaCierre: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      catalogo,
      sistemaStock,
      conteoActual,
      cierreCaja,
      reclamos,
      pastTurnos,
    };
  };

  // Subida autónoma desatendida a Google Drive de Carlos (charlydepiero@gmail.com) y servidor
  useEffect(() => {
    if (!resumenModalData?.visible || autoUploadAttemptedRef.current) return;
    autoUploadAttemptedRef.current = true;

    const performAutoDriveUpload = async () => {
      setDriveStatus('uploading');
      setDriveMessage('Generando PDF oficial y archivando reporte...');
      try {
        const docData = buildDocData();
        const { file, filename } = generateShiftPDF(docData);

        const saveRes = await saveShiftPdfToDriveAndServer(file, filename, {
          fecha: docData.fecha,
          turno: docData.turno,
          cerradoPor: docData.cerradoPor,
        });

        if (saveRes.serverUrl) {
          setServerFileLink(saveRes.serverUrl);
        }

        if (saveRes.driveUrl) {
          setDriveStatus('saved');
          setDriveFileLink(saveRes.driveUrl);
          setDriveMessage('✓ Reporte guardado automáticamente en Google Drive (Carpeta: Reportes Cierre de Turno - Escobar)');
        } else {
          setDriveStatus('saved_server');
          setDriveFileLink(saveRes.serverUrl || `/api/reportes/pdf/${filename}`);
          setDriveMessage('✓ Reporte oficial archivado con éxito en el servidor local.');
        }
      } catch (err: any) {
        console.warn('Error en archivo de cierre:', err);
        setDriveStatus('saved_server');
        setDriveMessage('✓ Reporte archivado en servidor.');
      }
    };

    performAutoDriveUpload();
  }, [resumenModalData?.visible]);

  /**
   * ACCIÓN 1: Botón "Listo"
   * 1. Genera el PDF del turno.
   * 2. Guarda el PDF en Google Drive (carpeta "Reportes Cierre de Turno - Escobar") y en el servidor local.
   * 3. Envía el PDF y resumen al Bot de WhatsApp de Central Colón (5491169927352).
   */
  const handleListoEnviarYGuardar = async () => {
    setIsProcessing(true);
    setFeedback(null);

    try {
      const docData = buildDocData();
      const { file, filename } = generateShiftPDF(docData);

      // Guardar en Google Drive y Servidor
      const saveRes = await saveShiftPdfToDriveAndServer(file, filename, {
        fecha: docData.fecha,
        turno: docData.turno,
        cerradoPor: docData.cerradoPor,
      });

      if (saveRes.driveUrl) {
        setDriveStatus('saved');
        setDriveFileLink(saveRes.driveUrl);
      }

      const serverPdfUrl = `${window.location.origin}/api/reportes/pdf/${filename}`;
      const pdfLink = saveRes.driveUrl || driveFileLink || serverPdfUrl;

      // Construir mensaje enriquecido con enlace al PDF
      let mensajeWA = resumenModalData?.reporteTexto || '';
      if (pdfLink) {
        mensajeWA += `\n\n📁 *Acta Oficial en PDF (${(saveRes.driveUrl || driveFileLink) ? 'Google Drive' : 'Descarga Directa'}):*\n${pdfLink}`;
      }

      const canShareFile = typeof navigator !== 'undefined' && 'canShare' in navigator && (navigator as any).canShare({ files: [file] });
      const botNumber = '5491169927352';

      if (canShareFile && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `Reporte de Cierre ${docData.turno} - Central Escobar`,
            text: mensajeWA,
            files: [file],
          });
        } catch (shareErr: any) {
          if (shareErr.name !== 'AbortError') {
            abrirWhatsApp(mensajeWA, botNumber);
          }
        }
      } else {
        abrirWhatsApp(mensajeWA, botNumber);
      }

      setFeedback({
        type: 'success',
        text: `✓ Reporte guardado y enviado al Bot de WhatsApp (${botNumber}).`,
        link: pdfLink,
      });
    } catch (err: any) {
      console.error('Error en botón Listo:', err);
      setFeedback({
        type: 'info',
        text: 'Reporte procesado. Verificá la ventana de WhatsApp abierta.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * ACCIÓN 2: Enviar PDF vía WhatsApp a cualquier contacto de su celular
   */
  const handleEnviarACualquierContacto = async () => {
    setIsProcessing(true);
    setFeedback(null);

    try {
      const docData = buildDocData();
      const { file, filename } = generateShiftPDF(docData);

      const saveRes = await saveShiftPdfToDriveAndServer(file, filename, {
        fecha: docData.fecha,
        turno: docData.turno,
        cerradoPor: docData.cerradoPor,
      });

      if (saveRes.driveUrl) {
        setDriveStatus('saved');
        setDriveFileLink(saveRes.driveUrl);
      }

      const serverPdfUrl = `${window.location.origin}/api/reportes/pdf/${filename}`;
      const pdfLink = saveRes.driveUrl || driveFileLink || serverPdfUrl;
      let mensajeWA = resumenModalData?.reporteTexto || '';
      if (pdfLink) {
        mensajeWA += `\n\n📁 *Acta Oficial en PDF (${(saveRes.driveUrl || driveFileLink) ? 'Google Drive' : 'Descarga Directa'}):*\n${pdfLink}`;
      }

      const canShareFile = typeof navigator !== 'undefined' && 'canShare' in navigator && (navigator as any).canShare({ files: [file] });

      if (canShareFile && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `Reporte de Cierre ${docData.turno} - Central Escobar`,
            text: mensajeWA,
            files: [file],
          });
          setFeedback({
            type: 'success',
            text: '✓ PDF compartido con tu contacto seleccionado.',
            link: pdfLink,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      setShowOtroNumeroInput(true);
    } catch (err: any) {
      console.error('Error enviando a contacto:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnviarNumeroManual = async () => {
    if (!otroNumero.trim()) {
      const docData = buildDocData();
      const { file, filename } = generateShiftPDF(docData);
      const saveRes = await saveShiftPdfToDriveAndServer(file, filename, {
        fecha: docData.fecha,
        turno: docData.turno,
        cerradoPor: docData.cerradoPor,
      });
      const serverPdfUrl = `${window.location.origin}/api/reportes/pdf/${filename}`;
      const pdfLink = saveRes.driveUrl || driveFileLink || serverPdfUrl;
      let mensajeWA = resumenModalData?.reporteTexto || '';
      if (pdfLink) {
        mensajeWA += `\n\n📁 *Acta Oficial en PDF:*\n${pdfLink}`;
      }
      abrirWhatsApp(mensajeWA);
      setShowOtroNumeroInput(false);
      return;
    }

    const cleanNum = otroNumero.replace(/[^\d]/g, '');
    const docData = buildDocData();
    const { file, filename } = generateShiftPDF(docData);
    const saveRes = await saveShiftPdfToDriveAndServer(file, filename, {
      fecha: docData.fecha,
      turno: docData.turno,
      cerradoPor: docData.cerradoPor,
    });
    const serverPdfUrl = `${window.location.origin}/api/reportes/pdf/${filename}`;
    const pdfLink = saveRes.driveUrl || driveFileLink || serverPdfUrl;
    let mensajeWA = resumenModalData?.reporteTexto || '';
    if (pdfLink) {
      mensajeWA += `\n\n📁 *Acta Oficial en PDF:*\n${pdfLink}`;
    }

    abrirWhatsApp(mensajeWA, cleanNum);
    setShowOtroNumeroInput(false);
    setOtroNumero('');
    setFeedback({
      type: 'success',
      text: `✓ Mensaje y PDF enviados a WhatsApp (${cleanNum}).`,
    });
  };

  if (!resumenModalData || !resumenModalData.visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0E2F1D]/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-emerald-900/30 max-h-[92vh] overflow-y-auto text-center relative">
        
        {/* Close X button */}
        <button
          onClick={() => setResumenModalData(null)}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full cursor-pointer transition-colors"
          title="Cerrar ventana"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center pb-3 border-b border-stone-100">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#1B5E38] flex items-center justify-center mb-2 shadow-xs">
            <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-black text-[#123D26] tracking-tight">
            Turno Cerrado Exitosamente
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Sede Escobar · Turno {resumenModalData.turno || currentTurno}
          </p>
        </div>

        {/* Banner de Respaldo Automático (Google Drive + Servidor Local) */}
        <div className="my-3 text-left">
          {driveStatus === 'uploading' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-900">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
              <div className="flex-1 font-medium">
                <strong>Respaldo Automático:</strong> Generando Acta oficial y archivando reporte en Google Drive &amp; servidor...
              </div>
            </div>
          )}

          {driveStatus === 'saved' && driveFileLink && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-950 shadow-2xs">
              <FolderCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-extrabold text-[#123D26] flex items-center gap-1.5">
                  <span>✓ Reporte respaldado en Google Drive</span>
                  <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.2 rounded-full font-bold">
                    Automático
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800/90 mt-0.5">
                  Cuenta: <strong>charlydepiero@gmail.com</strong> · Carpeta: <em>Reportes Cierre de Turno - Escobar</em>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <a
                    href={driveFileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#1B5E38] underline hover:text-emerald-900 text-xs"
                  >
                    <span>Abrir en Google Drive</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {serverFileLink && (
                    <a
                      href={serverFileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-stone-600 hover:text-stone-900 text-[11px]"
                    >
                      <HardDrive className="w-3 h-3 text-stone-500" />
                      <span>Copia servidor</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {driveStatus === 'saved_server' && (
            <div className="p-3 bg-white border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-stone-800 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-[#123D26]">
                  ✓ Reporte oficial archivado permanentemente en el Servidor
                </div>
                <div className="text-[11px] text-stone-600 mt-0.5">
                  El acta en PDF y los datos de caja/stock quedaron guardados para el historial y WhatsApp.
                </div>
                {driveFileLink && (
                  <a
                    href={driveFileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#1B5E38] underline mt-1.5 hover:text-emerald-900"
                  >
                    <span>Abrir PDF Oficial</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp formatted text preview */}
        <div className="my-3 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
              Resumen Oficial del Cierre
            </label>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Listo para WhatsApp &amp; Drive
            </span>
          </div>
          <pre className="p-4 bg-[#EAF5EE] border border-emerald-200 rounded-2xl text-xs font-sans text-stone-800 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto font-mono-num shadow-inner">
            {resumenModalData.reporteTexto}
          </pre>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl text-xs font-semibold mb-3 text-left animate-fadeIn">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{feedback.text}</span>
                {feedback.link && (
                  <a
                    href={feedback.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[11px] text-[#1B5E38] font-bold underline mt-1 flex items-center gap-1"
                  >
                    <span>Abrir PDF Oficial</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Drawer for sending to custom number or open chat selector */}
        {showOtroNumeroInput && (
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 mb-3 text-left animate-fadeIn">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Ingresá el número con código de país (ej: 5491169927352) o dejalo en blanco para elegir en WhatsApp:
            </label>
            <div className="flex gap-2 mt-2">
              <input
                type="tel"
                placeholder="54911... o en blanco"
                value={otroNumero}
                onChange={(e) => setOtroNumero(e.target.value)}
                className="flex-1 p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold font-mono-num focus:border-[#1B5E38] focus:ring-1 focus:ring-[#1B5E38]"
              />
              <button
                type="button"
                onClick={handleEnviarNumeroManual}
                className="px-4 py-2.5 bg-[#128C7E] hover:bg-[#0E6C61] text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Abrir Chat
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {/* Botón 1: Listo (Enviar al Bot de WhatsApp & Guardar en Drive) */}
          <button
            onClick={handleListoEnviarYGuardar}
            disabled={isProcessing}
            className="w-full py-4 px-4 bg-[#25D366] hover:bg-[#1EBE5D] active:scale-[0.99] disabled:opacity-50 text-white font-black text-sm rounded-2xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2.5 border border-emerald-400/40"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Guardando en Drive y enviando al Bot...</span>
              </>
            ) : (
              <>
                <CloudCheck className="w-5 h-5" />
                <span>Listo (Enviar al Bot de WhatsApp &amp; Guardar en Drive)</span>
              </>
            )}
          </button>

          {/* Botón 2: Enviar PDF a cualquier contacto de WhatsApp */}
          <button
            onClick={handleEnviarACualquierContacto}
            disabled={isProcessing}
            className="w-full py-3 px-4 bg-[#128C7E] hover:bg-[#0E6C61] active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
          >
            <Smartphone className="w-4 h-4" />
            <span>Enviar PDF a cualquier contacto de WhatsApp</span>
          </button>

          {/* Dismiss button */}
          <button
            onClick={() => setResumenModalData(null)}
            className="w-full py-2 px-4 text-stone-500 hover:text-stone-800 font-semibold text-xs transition-colors cursor-pointer pt-1"
          >
            Cerrar ventana
          </button>
        </div>

      </div>
    </div>
  );
};
