import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Product,
  CartItem,
  Sale,
  CashShift,
  CashMovement,
  StockMovement,
  PaymentMethod,
  CashMovementCategory,
  ActiveTab,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CURRENT_SHIFT,
  INITIAL_PAST_SHIFTS,
  INITIAL_SALES,
  INITIAL_MOVEMENTS,
} from '../data/mockData';

interface AppContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  products: Product[];
  cart: CartItem[];
  currentShift: CashShift | null;
  pastShifts: CashShift[];
  sales: Sale[];
  cashMovements: CashMovement[];
  stockMovements: StockMovement[];
  
  // Cart actions
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, delta: number) => void;
  setCartQuantityExact: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // POS actions
  completeSale: (
    paymentMethod: PaymentMethod,
    cashReceived?: number,
    customerName?: string,
    notes?: string
  ) => { success: boolean; sale?: Sale; error?: string };
  
  // Cash Register actions
  openShift: (initialCash: number, openedBy?: string) => void;
  addCashMovement: (
    type: 'ingreso' | 'egreso',
    category: CashMovementCategory,
    amount: number,
    concept: string
  ) => void;
  closeCurrentShift: (
    actualCash: number,
    notes?: string,
    closedBy?: string
  ) => { success: boolean; closedShift?: CashShift };
  
  // Stock actions
  bakeStock: (productId: string, quantity: number) => boolean;
  addRawStock: (productId: string, quantity: number, notes?: string) => void;
  registerWaste: (productId: string, quantity: number, reason: string) => boolean;
  updateProduct: (product: Product) => void;
  addNewProduct: (productData: Omit<Product, 'id'>) => void;
  
  // Data management
  resetToDefaultData: () => void;
  lastCompletedSale: Sale | null;
  setLastCompletedSale: (sale: Sale | null) => void;
  selectedShiftForDetail: CashShift | null;
  setSelectedShiftForDetail: (shift: CashShift | null) => void;
}

const STORAGE_KEYS = {
  PRODUCTS: 'criolla_products_v2',
  CART: 'criolla_cart_v2',
  CURRENT_SHIFT: 'criolla_current_shift_v2',
  PAST_SHIFTS: 'criolla_past_shifts_v2',
  SALES: 'criolla_sales_v2',
  MOVEMENTS: 'criolla_movements_v2',
  STOCK_MOVEMENTS: 'criolla_stock_movements_v2',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');

  // Products
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CART);
    return saved ? JSON.parse(saved) : [];
  });

  // Current shift
  const [currentShift, setCurrentShift] = useState<CashShift | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_SHIFT);
    return saved !== null ? JSON.parse(saved) : INITIAL_CURRENT_SHIFT;
  });

  // Past shifts
  const [pastShifts, setPastShifts] = useState<CashShift[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PAST_SHIFTS);
    return saved ? JSON.parse(saved) : INITIAL_PAST_SHIFTS;
  });

  // Sales
  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SALES);
    return saved ? JSON.parse(saved) : INITIAL_SALES;
  });

  // Cash movements
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
    return saved ? JSON.parse(saved) : INITIAL_MOVEMENTS;
  });

  // Stock movements
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STOCK_MOVEMENTS);
    return saved ? JSON.parse(saved) : [];
  });

  // Modal helpers
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const [selectedShiftForDetail, setSelectedShiftForDetail] = useState<CashShift | null>(null);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PAST_SHIFTS, JSON.stringify(pastShifts));
  }, [pastShifts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(cashMovements));
  }, [cashMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify(stockMovements));
  }, [stockMovements]);

  // Cart Methods
  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const setCartQuantityExact = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  // Process POS Sale
  const completeSale = (
    paymentMethod: PaymentMethod,
    cashReceived?: number,
    customerName?: string,
    notes?: string
  ): { success: boolean; sale?: Sale; error?: string } => {
    if (cart.length === 0) {
      return { success: false, error: 'El carrito está vacío.' };
    }
    if (!currentShift || currentShift.status !== 'abierta') {
      return {
        success: false,
        error: 'La caja está cerrada. Abra un turno de caja antes de cobrar.',
      };
    }

    let total = 0;
    let totalCost = 0;
    let totalEmpanadas = 0;

    const saleItems = cart.map((item) => {
      const subtotal = item.quantity * item.product.price;
      const costSubtotal = item.quantity * item.product.cost;
      total += subtotal;
      totalCost += costSubtotal;
      if (item.product.category.startsWith('empanadas')) {
        totalEmpanadas += item.quantity;
      }
      return {
        productId: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
        unitCost: item.product.cost,
        subtotal,
        costSubtotal,
      };
    });

    const profit = total - totalCost;
    const changeGiven =
      paymentMethod === 'efectivo' && cashReceived !== undefined
        ? Math.max(0, cashReceived - total)
        : 0;

    const newSaleNumber = sales.length > 0 ? Math.max(...sales.map((s) => s.saleNumber)) + 1 : 101;
    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      saleNumber: newSaleNumber,
      timestamp: new Date().toISOString(),
      items: saleItems,
      totalEmpanadasCount: totalEmpanadas,
      total,
      totalCost,
      profit,
      paymentMethod,
      cashReceived,
      changeGiven,
      customerName: customerName?.trim() || undefined,
      notes: notes?.trim() || undefined,
      shiftId: currentShift.id,
    };

    // Descontar stock horneado de cada producto
    setProducts((prevProducts) =>
      prevProducts.map((p) => {
        const cartItem = cart.find((ci) => ci.product.id === p.id);
        if (!cartItem) return p;
        return {
          ...p,
          stockHorneadas: Math.max(0, p.stockHorneadas - cartItem.quantity),
        };
      })
    );

    // Actualizar ventas
    setSales((prev) => [newSale, ...prev]);

    // Actualizar métricas del turno actual
    setCurrentShift((prev) => {
      if (!prev) return null;
      const isCash = paymentMethod === 'efectivo';
      const isDigital = paymentMethod === 'transferencia_mp';
      const isCard = paymentMethod === 'tarjeta';

      const newCashSales = prev.cashSales + (isCash ? total : 0);
      const newDigitalSales = prev.digitalSales + (isDigital ? total : 0);
      const newCardSales = prev.cardSales + (isCard ? total : 0);
      const newExpectedCash =
        prev.initialCash + newCashSales + prev.cashInflow - prev.cashOutflow;

      return {
        ...prev,
        cashSales: newCashSales,
        digitalSales: newDigitalSales,
        cardSales: newCardSales,
        expectedCash: newExpectedCash,
        totalSalesCount: prev.totalSalesCount + 1,
        totalRevenue: prev.totalRevenue + total,
        totalProfit: prev.totalProfit + profit,
      };
    });

    setLastCompletedSale(newSale);
    clearCart();

    return { success: true, sale: newSale };
  };

  // Cash Register Actions
  const openShift = (initialCash: number, openedBy = 'Dueño') => {
    const shiftNumber =
      pastShifts.length > 0
        ? Math.max(...pastShifts.map((s) => s.shiftNumber)) + 1
        : 1;

    const newShift: CashShift = {
      id: `shift-${Date.now()}`,
      shiftNumber,
      openedAt: new Date().toISOString(),
      status: 'abierta',
      initialCash,
      cashSales: 0,
      digitalSales: 0,
      cardSales: 0,
      cashInflow: 0,
      cashOutflow: 0,
      expectedCash: initialCash,
      totalSalesCount: 0,
      totalRevenue: 0,
      totalProfit: 0,
      closedBy: openedBy,
    };

    setCurrentShift(newShift);
  };

  const addCashMovement = (
    type: 'ingreso' | 'egreso',
    category: CashMovementCategory,
    amount: number,
    concept: string
  ) => {
    if (!currentShift) return;

    const movement: CashMovement = {
      id: `mov-${Date.now()}`,
      shiftId: currentShift.id,
      type,
      category,
      amount,
      concept,
      timestamp: new Date().toISOString(),
    };

    setCashMovements((prev) => [movement, ...prev]);

    setCurrentShift((prev) => {
      if (!prev) return null;
      const newCashInflow = prev.cashInflow + (type === 'ingreso' ? amount : 0);
      const newCashOutflow = prev.cashOutflow + (type === 'egreso' ? amount : 0);
      const newExpectedCash =
        prev.initialCash + prev.cashSales + newCashInflow - newCashOutflow;

      return {
        ...prev,
        cashInflow: newCashInflow,
        cashOutflow: newCashOutflow,
        expectedCash: newExpectedCash,
      };
    });
  };

  const closeCurrentShift = (
    actualCash: number,
    notes?: string,
    closedBy = 'Carlos (Dueño)'
  ): { success: boolean; closedShift?: CashShift } => {
    if (!currentShift) {
      return { success: false };
    }

    const difference = actualCash - currentShift.expectedCash;
    const closed: CashShift = {
      ...currentShift,
      closedAt: new Date().toISOString(),
      status: 'cerrada',
      actualCash,
      difference,
      notes,
      closedBy,
    };

    setPastShifts((prev) => [closed, ...prev]);
    setCurrentShift(null);
    setSelectedShiftForDetail(closed);

    return { success: true, closedShift: closed };
  };

  // Stock Actions
  const bakeStock = (productId: string, quantity: number): boolean => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stockCrudas < quantity) return false;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              stockCrudas: p.stockCrudas - quantity,
              stockHorneadas: p.stockHorneadas + quantity,
            }
          : p
      )
    );

    setStockMovements((prev) => [
      {
        id: `stk-${Date.now()}`,
        productId,
        productName: product.name,
        timestamp: new Date().toISOString(),
        type: 'hornear',
        quantity,
        reason: 'Hornear tanda fresca',
      },
      ...prev,
    ]);

    return true;
  };

  const addRawStock = (productId: string, quantity: number, notes?: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              stockCrudas: p.stockCrudas + quantity,
            }
          : p
      )
    );

    setStockMovements((prev) => [
      {
        id: `stk-${Date.now()}`,
        productId,
        productName: product.name,
        timestamp: new Date().toISOString(),
        type: 'produccion_cruda',
        quantity,
        reason: notes || 'Producción de cocina / lote nuevo',
      },
      ...prev,
    ]);
  };

  const registerWaste = (
    productId: string,
    quantity: number,
    reason: string
  ): boolean => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stockHorneadas < quantity) return false;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              stockHorneadas: p.stockHorneadas - quantity,
            }
          : p
      )
    );

    setStockMovements((prev) => [
      {
        id: `stk-${Date.now()}`,
        productId,
        productName: product.name,
        timestamp: new Date().toISOString(),
        type: 'merma_rotura',
        quantity,
        reason,
      },
      ...prev,
    ]);

    return true;
  };

  const updateProduct = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const addNewProduct = (productData: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...productData,
      id: `emp-custom-${Date.now()}`,
    };
    setProducts((prev) => [...prev, newProduct]);
  };

  const resetToDefaultData = () => {
    localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    localStorage.removeItem(STORAGE_KEYS.CART);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_SHIFT);
    localStorage.removeItem(STORAGE_KEYS.PAST_SHIFTS);
    localStorage.removeItem(STORAGE_KEYS.SALES);
    localStorage.removeItem(STORAGE_KEYS.MOVEMENTS);
    localStorage.removeItem(STORAGE_KEYS.STOCK_MOVEMENTS);

    setProducts(INITIAL_PRODUCTS);
    setCart([]);
    setCurrentShift(INITIAL_CURRENT_SHIFT);
    setPastShifts(INITIAL_PAST_SHIFTS);
    setSales(INITIAL_SALES);
    setCashMovements(INITIAL_MOVEMENTS);
    setStockMovements([]);
    setLastCompletedSale(null);
    setSelectedShiftForDetail(null);
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        products,
        cart,
        currentShift,
        pastShifts,
        sales,
        cashMovements,
        stockMovements,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        setCartQuantityExact,
        clearCart,
        completeSale,
        openShift,
        addCashMovement,
        closeCurrentShift,
        bakeStock,
        addRawStock,
        registerWaste,
        updateProduct,
        addNewProduct,
        resetToDefaultData,
        lastCompletedSale,
        setLastCompletedSale,
        selectedShiftForDetail,
        setSelectedShiftForDetail,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
