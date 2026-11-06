export interface ProductoItem {
  codigo: string;
  nombre: string;
}

export interface GrupoProductos {
  nombre: string | null;
  productos: ProductoItem[];
}

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  ubicaciones: string[];
  grupos: GrupoProductos[];
}

export interface ConteoProducto {
  ubic: Record<string, number>;
  empleado: string;
  hora: string;
}

export type MapaConteos = Record<string, ConteoProducto>;

export interface ReclamoCategoria {
  empleado: string;
  hora: string;
  terminado: boolean;
}

export type MapaReclamos = Record<string, ReclamoCategoria>;

export interface SistemaStockItem {
  stock: number;
  actualizado: string;
}

export type MapaSistemaStock = Record<string, SistemaStockItem>;

export interface CierreCajaData {
  existe: boolean;
  fecha?: string;
  turno?: 'Mañana' | 'Tarde';
  postnet_amarillo: number;
  postnet_rosa: number;
  postnet_blanco: number;
  online_local_sist: number;
  postnets?: number;
  efectivo_real: number;
  efectivo_mostrador_sist: number; // Teórico en caja: Saldo Inicial + Mostrador + PedidosYa - Gastos - Egresos - Sueldos
  diferencia_efectivo?: number; // Arqueo: efectivo_real - efectivo_mostrador_sist
  total_digital?: number;
  total_recaudacion?: number;
  saldo_inicial_sist?: number;
  efectivo_mostrador_puro?: number;
  efectivo_peya_sist?: number;
  gastos_sist?: number;
  egresos_sist?: number;
  sueldos_sist?: number;
  datalive_cod_ventas?: string;
  datalive_turno?: string;
  observaciones: string;
  empleado: string;
  hora: string;
}

export interface Empleado {
  nombre: string;
  pin: string;
  activo: boolean;
  rol?: 'admin' | 'empleado';
  oculto?: boolean;
  bloqueado?: boolean;
  creado?: string;
}

export interface RegistroTurnoEmpleado {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  empleado: string;
  hora_inicio: string;
  hora_fin?: string;
}

export interface TurnoCierre {
  id?: string;
  timestamp?: string;
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  cerrado: boolean;
  hora_cierre: string;
  forzado_por?: string;
  cerrado_por?: string;
  pdfUrl?: string;
  pdfDriveUrl?: string;
  driveUrl?: string;
  driveFileId?: string;
  cierreCaja?: CierreCajaData;
  conteos?: MapaConteos;
  sistemaStock?: MapaSistemaStock;
  resumenStock?: {
    totalSistema: number;
    totalContado: number;
    diferenciaTotal: number;
    itemsConDiferencia: number;
  };
  modificado_por?: string;
  modificado_fecha?: string;
  apertura?: any;
}

export interface ReaperturaInfo {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  cerrado_por: string;
  hora_cierre_original: string;
  reabierto_por: string;
  hora_reapertura: string;
}

export interface AperturaTurnoInfo {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  abierto: boolean;
  abierto_por: string;
  hora_apertura: string;
  efectivo_anterior_esperado: number;
  efectivo_convalidado: number;
  diferencia_apertura: number;
  observaciones: string;
}

export type ActiveTab = 'contar' | 'caja' | 'apertura' | 'reporte' | 'productos' | 'gerencia';
export type ReportMode = 'resumen' | 'detalle' | 'comparar' | 'evolucion';

export interface StockAuditItem {
  codigo?: string;
  nombre: string;
  categoria: string;
  contadoNoche: number;
  contadoApertura: number;
  diferencia: number;
}

export interface AperturaDiaData {
  id?: string;
  fecha: string;
  hora: string;
  empleado: string;
  turnoAnteriorFecha: string;
  turnoAnteriorTurno: string;
  turnoAnteriorCerradoPor: string;
  efectivoAnteriorEsperado: number;
  efectivoContadoApertura: number;
  diferenciaEfectivo: number;
  observacionesCaja: string;
  stockAudit: Record<string, StockAuditItem>;
  observacionesStock: string;
  creadoEn?: string;
}

export interface VentaCanal {
  id: string;
  nombre: string;
  monto: number;
  tickets?: number;
}

export interface VentaArticuloItem {
  codigo: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario?: number;
  totalMonto?: number;
}

export interface VentasTurnoData {
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  cargadoPor: string;
  fechaHoraCarga: string;
  totalFacturado: number;
  totalTickets: number;
  canales: VentaCanal[];
  articulos: Record<string, VentaArticuloItem>;
  observaciones?: string;
}

export interface PedidoFabricaItem {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  stockContado: number;
  consumoTurno: number;
  stockObjetivo: number;
  sugeridoUnidades: number;
  confirmadoUnidades: number;
  bultosDocenas: number;
}
