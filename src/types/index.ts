export type ProductCategory = 'empanadas_clasicas' | 'empanadas_especiales' | 'bebidas_postres';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  cost: number; // Costo de insumos unitario para medir ganancia
  stockHorneadas: number; // Listas para servir/entregar
  stockCrudas: number; // En heladera/freezer listas para el horno
  minStockAlert: number;
  repulgue: string; // Tipo de repulgue identificador artesanal
  description: string;
  active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentMethod = 'efectivo' | 'transferencia_mp' | 'tarjeta';

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  costSubtotal: number;
}

export interface Sale {
  id: string;
  saleNumber: number;
  timestamp: string; // ISO string
  items: SaleItem[];
  totalEmpanadasCount: number;
  total: number;
  totalCost: number;
  profit: number; // total - totalCost
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  changeGiven?: number;
  customerName?: string;
  notes?: string;
  shiftId: string;
}

export type CashMovementType = 'ingreso' | 'egreso';
export type CashMovementCategory = 
  | 'proveedores' 
  | 'insumos_frescos' 
  | 'repartidor_delivery' 
  | 'retiro_caja' 
  | 'fondo_cambio' 
  | 'limpieza_embalaje'
  | 'otro';

export interface CashMovement {
  id: string;
  shiftId: string;
  type: CashMovementType;
  category: CashMovementCategory;
  amount: number;
  concept: string;
  timestamp: string;
}

export interface CashShift {
  id: string;
  shiftNumber: number;
  openedAt: string;
  closedAt?: string;
  status: 'abierta' | 'cerrada';
  initialCash: number; // Fondo inicial
  cashSales: number; // Total cobrado en efectivo
  digitalSales: number; // Transferencias / MP
  cardSales: number; // Débito / Crédito
  cashInflow: number; // Entradas adicionales de efectivo
  cashOutflow: number; // Gastos o retiros en efectivo
  expectedCash: number; // initialCash + cashSales + cashInflow - cashOutflow
  actualCash?: number; // Efectivo real recontado
  difference?: number; // actualCash - expectedCash (0 = cuadrada, >0 sobrante, <0 faltante)
  notes?: string;
  totalSalesCount: number;
  totalRevenue: number;
  totalProfit: number;
  closedBy?: string;
}

export type StockMovementType = 'hornear' | 'produccion_cruda' | 'merma_rotura' | 'ajuste_manual';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  timestamp: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
}

export type ActiveTab = 'pos' | 'caja' | 'stock' | 'reportes';
