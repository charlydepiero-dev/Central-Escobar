import React, { Component, ErrorInfo, ReactNode } from 'react';
import { CentralLogo } from './CentralLogo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Central App:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('central_esco_session_v3');
    } catch (e) {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#123D26] flex items-center justify-center p-4 text-center">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-emerald-900/40">
            <CentralLogo size={64} className="mx-auto mb-3" />
            <h1 className="text-lg font-black text-[#123D26]">
              Central · Sede Escobar
            </h1>
            <p className="text-xs text-stone-600 mt-2">
              Se detectó un inconveniente al cargar en este dispositivo.
            </p>
            <div className="my-4 p-3 bg-stone-50 rounded-xl text-[11px] text-stone-500 font-mono-num text-left overflow-auto max-h-24">
              {this.state.error?.message || 'Error inesperado de inicialización.'}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 bg-[#1B5E38] hover:bg-[#14472B] text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
            >
              Reiniciar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
