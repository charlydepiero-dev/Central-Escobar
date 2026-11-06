import React from 'react';
import { CentralProvider, useCentral } from './context/CentralContext';
import { CheckinScreen } from './components/CheckinScreen';
import { CentralHeader } from './components/CentralHeader';
import { ContarTab } from './components/ContarTab';
import { CajaTab } from './components/CajaTab';
import { ReporteTab } from './components/ReporteTab';
import { ProductosTab } from './components/ProductosTab';
import { GerenciaTab } from './components/GerenciaTab';
import { ResumenCierreModal } from './components/ResumenCierreModal';
import { PrintableReport } from './components/PrintableReport';
import { AperturaTurnoModal } from './components/AperturaTurnoModal';
import { AperturaDiaTab } from './components/AperturaDiaTab';
import { RotateCcw } from 'lucide-react';

const CentralAppContent: React.FC = () => {
  const { currentEmpleado, activeTab, setActiveTab, currentTurno, resetDemoData } = useCentral();

  // El bloque de apertura es solo para el Turno Mañana. Si está en Tarde, redirigir a Contar.
  React.useEffect(() => {
    if (currentTurno === 'Tarde' && activeTab === 'apertura') {
      setActiveTab('contar');
    }
  }, [currentTurno, activeTab, setActiveTab]);

  // If not logged in, show PIN Check-in screen
  if (!currentEmpleado) {
    return <CheckinScreen />;
  }

  return (
    <div className="min-h-screen bg-[#F4F7F4] text-stone-900 flex flex-col font-sans overflow-x-hidden w-full max-w-full">
      <CentralHeader />

      <main className="flex-1 pb-16">
        {activeTab === 'apertura' && currentTurno === 'Mañana' && <AperturaDiaTab />}
        {activeTab === 'contar' && <ContarTab />}
        {activeTab === 'caja' && <CajaTab />}
        {activeTab === 'reporte' && <ReporteTab />}
        {activeTab === 'productos' && <ProductosTab />}
        {activeTab === 'gerencia' && <GerenciaTab />}
      </main>

      {/* Modals and Print template */}
      <AperturaTurnoModal />
      <ResumenCierreModal />
      <PrintableReport />

      {/* Footer */}
      <footer className="border-t border-emerald-900/10 bg-white py-3 px-4 text-xs text-stone-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#123D26]">Central de Pizzas &amp; Empanadas</span>
            <span aria-hidden="true">·</span>
            <span>Sede Escobar</span>
            <span aria-hidden="true">·</span>
            <span className="text-stone-400">Control de Stock &amp; Cierre de Caja</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                resetDemoData();
              }}
              className="flex items-center gap-1 text-stone-400 hover:text-emerald-800 transition-colors cursor-pointer text-[11px]"
              title="Restaurar datos predeterminados"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar datos iniciales</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <CentralProvider>
      <CentralAppContent />
    </CentralProvider>
  );
}
