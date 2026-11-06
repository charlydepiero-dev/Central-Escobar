import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useCentral } from '../context/CentralContext';
import { CentralLogo } from './CentralLogo';
import { GoogleSheetsSyncCard } from './GoogleSheetsSyncCard';
import { getPublicShareUrl, getPublicQrCodeUrl } from '../utils/urlHelper';
import { abrirWhatsApp } from '../utils/centralHelpers';
import { 
  X, 
  Smartphone, 
  Users, 
  Database, 
  Copy, 
  Check, 
  Share2, 
  Download, 
  QrCode, 
  ExternalLink,
  ShieldCheck,
  HardDrive,
  Globe,
  Radio
} from 'lucide-react';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareAppModal: React.FC<ShareAppModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { catalogo, sistemaStock, conteoActual, pastTurnos, empleados, cierreCaja } = useCentral();

  const [activeTab, setActiveTab] = useState<'compartir' | 'celular' | 'database' | 'servidor'>('compartir');
  const [copied, setCopied] = useState(false);

  // Exact public URL that is guaranteed to open on cellphones and WhatsApp
  const appUrl = getPublicShareUrl();
  const qrCodeUrl = getPublicQrCodeUrl(200);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendWhatsapp = () => {
    const text = `🍕 *Central de Pizzas & Empanadas · Sede Escobar*\n\nHola equipo, ingresen a la aplicación de control de stock y caja desde este link:\n${appUrl}\n\nIngresen con su PIN de 4 dígitos.`;
    abrirWhatsApp(text);
  };

  // Export full JSON backup
  const handleExportBackup = () => {
    const backupData = {
      app: 'Central Pizzas & Empanadas Escobar',
      fechaExportacion: new Date().toISOString(),
      catalogo,
      sistemaStock,
      conteoActual,
      cierreCaja,
      pastTurnos,
      empleados,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_central_escobar_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0E2F1D]/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-emerald-900/30 max-h-[90vh] overflow-y-auto relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center pb-4 border-b border-stone-100">
          <CentralLogo size={50} className="mx-auto mb-2" />
          <h2 className="text-lg font-black text-[#123D26] tracking-tight">
            Guía de Uso, Celular &amp; Datos
          </h2>
          <p className="text-xs text-stone-500">
            Central de Pizzas y Empanadas · Sede Escobar
          </p>
        </div>

        {/* Nav subtabs */}
        <div className="flex bg-stone-100 p-1 rounded-2xl my-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('compartir')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'compartir'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Compartir</span>
          </button>

          <button
            onClick={() => setActiveTab('celular')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'celular'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Uso en Celular</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'database'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base de Datos</span>
          </button>

          <button
            onClick={() => setActiveTab('servidor')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'servidor'
                ? 'bg-[#1B5E38] text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Activo 24/7</span>
          </button>
        </div>

        {/* TAB 1: COMPARTIR CON EMPLEADOS */}
        {activeTab === 'compartir' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950">
              <div className="flex items-center gap-1.5 font-bold text-sm mb-1 text-[#123D26]">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Enlace Directo para la Aplicación</span>
              </div>
              <p className="text-stone-600 leading-relaxed">
                Este es el enlace directo a tu aplicación. Si lo abres en tu celular con tu cuenta de Google, se sincroniza al instante y puedes instalarla como acceso directo en la pantalla de inicio.
              </p>
            </div>

            {/* QR Code Section */}
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="bg-white p-2 rounded-xl shadow-xs border border-stone-200 shrink-0">
                <img
                  src={qrCodeUrl}
                  alt="Código QR para abrir la app en el celular"
                  className="w-36 h-36 rounded-lg"
                  loading="lazy"
                />
              </div>
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px] uppercase">
                  <QrCode className="w-3 h-3" />
                  Escanear con la Cámara
                </span>
                <p className="font-bold text-stone-900 text-sm">
                  Apuntá con la cámara de tu celular
                </p>
                <p className="text-stone-500 text-[11px] leading-relaxed">
                  Abrí la app de la cámara en tu celular (iPhone o Android) y escaneá este código QR para abrir el sistema al instante.
                </p>
              </div>
            </div>

            {/* URL Box */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wider">
                Enlace Público Compartible
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={appUrl}
                  className="flex-1 p-2 bg-white border border-stone-300 rounded-lg text-xs font-mono-num text-stone-700 truncate"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* WhatsApp Send button & Direct test */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleSendWhatsapp}
                className="py-3 px-3 bg-[#25D366] hover:bg-[#1EBE5D] text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>Enviar por WhatsApp</span>
              </button>

              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-3 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span>Probar en Pestaña Nueva</span>
              </a>
            </div>

            {/* Steps summary */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-stone-700">
              <p className="font-bold text-stone-900">¿Cómo ingresan tus empleados?</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Abren el enlace en su teléfono (Chrome o Safari).</li>
                <li>Ingresan su <strong>PIN de 4 dígitos</strong> o tocan su nombre en pantalla.</li>
                <li>Eligen el turno (<strong>Mañana</strong> o <strong>Tarde</strong>) e ingresan a contar el stock o cargar caja.</li>
              </ol>
            </div>
          </div>
        )}

        {/* TAB 2: USO EN EL CELULAR (PWA) */}
        {activeTab === 'celular' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950">
              <p className="font-bold text-sm mb-1">📱 Instalar como App en la pantalla de inicio</p>
              <p className="text-stone-600 leading-relaxed">
                La aplicación está configurada como una **PWA (Progressive Web App)**. Al instalarla, queda con el ícono del logo de Central en el celular y se abre a pantalla completa como una app nativa, sin barra de direcciones.
              </p>
            </div>

            {/* Direct PWA Install Button if supported */}
            {isInstallable && !isInstalled && (
              <button
                onClick={install}
                className="w-full py-3.5 px-4 bg-[#1B5E38] hover:bg-[#14472B] text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Instalar App Directamente en este Dispositivo</span>
              </button>
            )}

            {isInstalled && (
              <div className="p-3 bg-emerald-100/80 rounded-xl border border-emerald-300 text-emerald-900 font-bold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>La aplicación ya está instalada en modo app en este dispositivo.</span>
              </div>
            )}

            {/* Instructions for Android */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
              <p className="font-bold text-stone-900 flex items-center gap-1.5">
                <span>🤖 En celulares Android (Google Chrome):</span>
              </p>
              <p className="text-stone-600 pl-2">
                1. Abre el enlace en Chrome.<br />
                2. Toca los <strong>tres puntos (⋮)</strong> arriba a la derecha.<br />
                3. Toca <strong>«Agregar a la pantalla principal»</strong> o <strong>«Instalar aplicación»</strong>.<br />
                4. ¡Listo! Queda el logo de Central en el menú de aplicaciones.
              </p>
            </div>

            {/* Instructions for iPhone */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
              <p className="font-bold text-stone-900 flex items-center gap-1.5">
                <span>🍎 En iPhone / iPad (Safari):</span>
              </p>
              <p className="text-stone-600 pl-2">
                1. Abre el enlace en Safari.<br />
                2. Toca el botón <strong>Compartir</strong> (el cuadrado con la flechita hacia arriba ⎋ en la barra inferior).<br />
                3. Desliza hacia abajo y selecciona <strong>«Agregar al inicio»</strong> (+).<br />
                4. Toca «Agregar». Aparecerá el ícono en tu pantalla de inicio.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: DÓNDE SE GUARDA LA BASE DE DATOS */}
        {activeTab === 'database' && (
          <div className="space-y-4 text-xs">
            
            {/* Storage explanation */}
            <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 text-stone-700">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                <HardDrive className="w-4 h-4 text-[#1B5E38]" />
                <span>¿Dónde se guarda la información día a día?</span>
              </div>
              <p className="leading-relaxed">
                1. <strong>En el dispositivo local:</strong> Todos los conteos, cierres de caja, configuraciones de empleados y estados de reclamos se guardan automáticamente en la memoria persistente del navegador (<strong>LocalStorage</strong>) del dispositivo.
              </p>
              <p className="leading-relaxed">
                2. <strong>En los reportes generados:</strong> Cada vez que se cierra un turno, el reporte se envía por **WhatsApp** al grupo de Central Colón (`5491169927352`) y queda registrado en el historial de turnos archivados con su comprobante imprimible.
              </p>
              <p className="leading-relaxed">
                3. <strong>En archivos de exportación:</strong> Puedes descargar un **archivo CSV (Excel)** con todas las filas o descargar una copia de seguridad completa en formato **JSON**.
              </p>
            </div>

            {/* Backup export & import tools */}
            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <p className="font-bold text-emerald-950 text-xs">Copia de Seguridad y Respaldo:</p>
              <button
                onClick={handleExportBackup}
                className="w-full py-2.5 px-3 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar Respaldo Completo (JSON)</span>
              </button>
              <p className="text-[11px] text-stone-500 text-center">
                Guarda una copia de seguridad con todos los productos, stock, conteos y empleados.
              </p>
            </div>

            {/* Cloud database option note */}
            <div className="space-y-2">
              <GoogleSheetsSyncCard />
            </div>

          </div>
        )}

        {/* TAB 4: SERVIDOR ACTIVO 24/7 */}
        {activeTab === 'servidor' && (
          <div className="space-y-4 text-xs">
            
            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-stone-800">
              <div className="flex items-center gap-2 text-[#123D26] font-extrabold text-sm">
                <Globe className="w-4 h-4 text-emerald-700" />
                <span>¿Por qué se pausaba la app y cómo mantenerla activa 24/7?</span>
              </div>
              <p className="leading-relaxed text-stone-700">
                <strong>Google AI Studio</strong> es una consola de desarrollo interactiva. Cuando cierras la pestaña o te vas a dormir, el contenedor de pruebas entra en reposo temporal <em>(scale-to-zero)</em> para ahorrar recursos. Por eso a la mañana o al mandar el link por WhatsApp daba 404 o acceso denegado.
              </p>
            </div>

            {/* What we already did */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Mejora técnica implementada ahora:
              </span>
              <p className="text-stone-700 leading-relaxed">
                Configuramos un servidor <strong>Express Full-Stack autónomo</strong> en Node.js que sirve los archivos compilados de producción con monitor de estado (<code>/healthz</code>).
              </p>
            </div>

            {/* Permanent 24/7 options */}
            <div className="space-y-3">
              <p className="font-extrabold text-stone-900 text-xs">
                Opciones para tener la app activa 24 horas los 365 días:
              </p>

              {/* Option 1: AI Studio Deploy */}
              <div className="p-3 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">1. Despliegue permanente en AI Studio</span>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Automático</span>
                </div>
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  En la barra superior de Google AI Studio, utiliza el botón de <strong>«Deploy» / «Compartir»</strong>. Esto genera una versión pública fija en Cloud Run sin caducidad.
                </p>
              </div>

              {/* Option 2: Vercel / Firebase Hosting */}
              <div className="p-3 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">2. Hosting Gratuito 24/7 (Vercel o Firebase)</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">Recomendado para locales</span>
                </div>
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  Esta app está creada con React y Vite estándar. Se puede subir a <strong>Vercel</strong> o <strong>Firebase Hosting</strong> (ambos 100% gratuitos) y queda activa permanentemente con un dominio propio como <code>central-escobar.vercel.app</code> o tu dominio <code>.com.ar</code>.
                </p>
              </div>

              {/* Option 3: PWA Offline */}
              <div className="p-3 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">3. Instalación PWA en los celulares</span>
                  <span className="text-[10px] font-bold bg-stone-100 text-stone-800 px-2 py-0.5 rounded-full">Sin internet</span>
                </div>
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  Una vez instalada en el celular con «Agregar a la pantalla principal», la app guarda el código y el stock en el almacenamiento local del teléfono y sigue funcionando aunque no haya señal.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-4 border-t border-stone-100 text-center">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Entendido / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
