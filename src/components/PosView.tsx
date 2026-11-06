import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Product, PaymentMethod, ProductCategory } from '../types';
import { formatCurrency, formatDozens } from '../utils/formatters';
import { 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  Banknote, 
  QrCode, 
  CreditCard, 
  Check, 
  AlertTriangle,
  Sparkles,
  ShoppingBag,
  Flame
} from 'lucide-react';

export const PosView: React.FC = () => {
  const {
    products,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    completeSale,
    currentShift,
    setActiveTab,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.active) return false;
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.repulgue.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let empanadasCount = 0;

    cart.forEach((item) => {
      subtotal += item.quantity * item.product.price;
      if (item.product.category.startsWith('empanadas')) {
        empanadasCount += item.quantity;
      }
    });

    // Descuento automático por docenas completas si se desea (opcional o neto)
    // Para simplificar y mantener claridad contable transparente:
    const total = subtotal;

    return { subtotal, total, empanadasCount };
  }, [cart]);

  const cashReceivedNumber = parseFloat(cashReceivedInput) || 0;
  const changeToGive = Math.max(0, cashReceivedNumber - cartTotals.total);
  const isCashExact = cashReceivedNumber === cartTotals.total;

  const handleQuickAdd = (product: Product, qty: number) => {
    addToCart(product, qty);
    setErrorMessage(null);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (!currentShift) {
      setErrorMessage('La caja está cerrada. Debes abrir un turno para registrar ventas.');
      return;
    }

    if (paymentMethod === 'efectivo' && cashReceivedInput.trim() !== '') {
      if (cashReceivedNumber < cartTotals.total) {
        setErrorMessage(`El efectivo ingresado (${formatCurrency(cashReceivedNumber)}) es menor al total (${formatCurrency(cartTotals.total)}).`);
        return;
      }
    }

    const cashGiven = paymentMethod === 'efectivo' 
      ? (cashReceivedNumber > 0 ? cashReceivedNumber : cartTotals.total)
      : undefined;

    const result = completeSale(paymentMethod, cashGiven, customerName, saleNotes);
    if (!result.success) {
      setErrorMessage(result.error || 'Error al procesar la venta');
    } else {
      setCashReceivedInput('');
      setCustomerName('');
      setSaleNotes('');
      setErrorMessage(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      
      {/* Caja cerrada warning */}
      {!currentShift && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-600/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-stone-800">
              <strong className="font-semibold text-stone-900">La caja se encuentra cerrada.</strong> No podrás registrar cobros hasta abrir el turno de caja.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('caja')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            Ir a Abrir Turno
          </button>
        </div>
      )}

      {/* Main POS layout: Products grid (left/center) + Cart & Checkout (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Products catalog */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-5">
          
          {/* Search and Category Filters */}
          <div className="bg-white p-4 rounded-xl border border-stone-200/80 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar sabor (ej: Carne, Roquefort, Caprese, Bebida)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-900 placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Todas las variedades
              </button>
              <button
                onClick={() => setSelectedCategory('empanadas_clasicas')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'empanadas_clasicas'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                🥟 Clásicas
              </button>
              <button
                onClick={() => setSelectedCategory('empanadas_especiales')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'empanadas_especiales'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                ⭐ Especiales Gourmet
              </button>
              <button
                onClick={() => setSelectedCategory('bebidas_postres')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'bebidas_postres'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                🥤 Bebidas
              </button>
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredProducts.map((product) => {
              const isLowStock = product.stockHorneadas <= product.minStockAlert;
              const isOutOfStock = product.stockHorneadas === 0;

              return (
                <div
                  key={product.id}
                  className="bg-white border border-stone-200/90 rounded-xl p-4 flex flex-col justify-between hover:border-amber-400/80 hover:shadow-xs transition-all relative group"
                >
                  <div>
                    {/* Header of product */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-stone-900 text-sm leading-tight">
                        {product.name}
                      </h4>
                      <span className="font-bold text-amber-700 text-sm whitespace-nowrap tabular-nums">
                        {formatCurrency(product.price)}
                      </span>
                    </div>

                    {/* Repulgue & Stock info */}
                    <div className="flex items-center gap-2 text-xs text-stone-500 mb-2">
                      <span className="text-[11px] text-stone-600 truncate max-w-[140px]" title={product.repulgue}>
                        {product.repulgue}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`text-[11px] font-medium tabular-nums ${
                          isOutOfStock
                            ? 'text-rose-600 font-semibold'
                            : isLowStock
                            ? 'text-amber-700 font-semibold'
                            : 'text-emerald-700'
                        }`}
                      >
                        {isOutOfStock ? 'Sin stock' : `${product.stockHorneadas} listos`}
                      </span>
                    </div>

                    <p className="text-xs text-stone-500 line-clamp-2 mb-3">
                      {product.description}
                    </p>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="pt-2 border-t border-stone-100 flex items-center gap-1.5">
                    <button
                      onClick={() => handleQuickAdd(product, 1)}
                      className="flex-1 py-1.5 px-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                      title="Agregar 1 unidad"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+1 u.</span>
                    </button>

                    {product.category.startsWith('empanadas') && (
                      <>
                        <button
                          onClick={() => handleQuickAdd(product, 6)}
                          className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                          title="Agregar media docena (6)"
                        >
                          +6 (½ doc)
                        </button>
                        <button
                          onClick={() => handleQuickAdd(product, 12)}
                          className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                          title="Agregar 1 docena (12)"
                        >
                          +12 (1 doc)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
              <ShoppingBag className="w-8 h-8 text-stone-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-stone-700">No se encontraron productos</p>
              <p className="text-xs text-stone-500 mt-1">Prueba con otro término de búsqueda o categoría.</p>
            </div>
          )}
        </div>

        {/* Right column: Cart & Checkout Panel */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-xl border border-stone-200/90 shadow-sm p-4 sm:p-5 sticky top-20">
          
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-stone-700" />
              <h3 className="font-bold text-stone-900 text-base">Pedido en Curso</h3>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-stone-400 hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar</span>
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="mt-3 divide-y divide-stone-100 max-h-[300px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-stone-400 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto text-stone-300 stroke-[1.5]" />
                <p className="text-xs text-stone-500 font-medium">El carrito está vacío</p>
                <p className="text-[11px] text-stone-400">Selecciona variedades para armar el pedido</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900 truncate">{item.product.name}</p>
                    <p className="text-stone-500 tabular-nums">
                      {formatCurrency(item.product.price)} c/u
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center bg-stone-100 rounded-lg border border-stone-200">
                      <button
                        onClick={() => updateCartQuantity(item.product.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-stone-700 hover:bg-stone-200 rounded-l-lg transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-bold text-stone-900 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.product.id, 1)}
                        className="w-7 h-7 flex items-center justify-center text-stone-700 hover:bg-stone-200 rounded-r-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="w-16 text-right font-bold text-stone-900 tabular-nums">
                      {formatCurrency(item.quantity * item.product.price)}
                    </span>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-stone-300 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                      title="Eliminar del pedido"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Docenas Counter Indicator */}
          {cartTotals.empanadasCount > 0 && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/60 flex items-center justify-between text-xs text-amber-900">
              <span className="font-medium flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                <span>Empanadas en pedido:</span>
              </span>
              <span className="font-bold tabular-nums">
                {formatDozens(cartTotals.empanadasCount)}
              </span>
            </div>
          )}

          {/* Customer info & Notes (optional) */}
          <div className="mt-3 space-y-2 pt-2 border-t border-stone-100">
            <input
              type="text"
              placeholder="Nombre del cliente (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <input
              type="text"
              placeholder="Observaciones (ej: caja sellada, salsita criolla)"
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Payment Method Selector */}
          <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
            <label className="text-xs font-semibold text-stone-700 block">
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('efectivo')}
                className={`py-2 px-1 text-xs font-medium rounded-lg border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  paymentMethod === 'efectivo'
                    ? 'border-amber-600 bg-amber-500/10 text-amber-950 font-bold'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Banknote className="w-4 h-4 text-amber-700" />
                <span>Efectivo</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('transferencia_mp')}
                className={`py-2 px-1 text-xs font-medium rounded-lg border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  paymentMethod === 'transferencia_mp'
                    ? 'border-sky-600 bg-sky-500/10 text-sky-950 font-bold'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <QrCode className="w-4 h-4 text-sky-600" />
                <span>Transf. / MP</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('tarjeta')}
                className={`py-2 px-1 text-xs font-medium rounded-lg border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  paymentMethod === 'tarjeta'
                    ? 'border-indigo-600 bg-indigo-500/10 text-indigo-950 font-bold'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Tarjeta</span>
              </button>
            </div>

            {/* Efectivo Calculator: Vuelto */}
            {paymentMethod === 'efectivo' && cartTotals.total > 0 && (
              <div className="mt-3 p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600 font-medium">Paga con:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-stone-400">$</span>
                    <input
                      type="number"
                      placeholder={cartTotals.total.toString()}
                      value={cashReceivedInput}
                      onChange={(e) => setCashReceivedInput(e.target.value)}
                      className="w-28 px-2 py-1 bg-white border border-stone-300 rounded text-right font-bold text-stone-900 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Quick denomination chips */}
                <div className="flex items-center gap-1 flex-wrap pt-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCashReceivedInput(cartTotals.total.toString())}
                    className="px-2 py-0.5 bg-stone-200 hover:bg-stone-300 rounded text-stone-700 font-medium cursor-pointer"
                  >
                    Exacto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashReceivedInput((Math.ceil(cartTotals.total / 10000) * 10000 || 10000).toString())}
                    className="px-2 py-0.5 bg-stone-200 hover:bg-stone-300 rounded text-stone-700 font-medium cursor-pointer tabular-nums"
                  >
                    Redondear 10k
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashReceivedInput((Math.ceil(cartTotals.total / 20000) * 20000 || 20000).toString())}
                    className="px-2 py-0.5 bg-stone-200 hover:bg-stone-300 rounded text-stone-700 font-medium cursor-pointer tabular-nums"
                  >
                    Redondear 20k
                  </button>
                </div>

                {cashReceivedNumber > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/80 text-xs">
                    <span className="text-stone-600 font-semibold">Vuelto a entregar:</span>
                    <span className={`font-bold tabular-nums ${changeToGive > 0 ? 'text-emerald-700 text-sm' : 'text-stone-700'}`}>
                      {formatCurrency(changeToGive)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals Summary */}
          <div className="mt-4 pt-3 border-t border-stone-200 space-y-1.5">
            <div className="flex items-center justify-between text-base font-extrabold text-stone-900">
              <span>Total a Cobrar</span>
              <span className="text-xl text-amber-700 tabular-nums">
                {formatCurrency(cartTotals.total)}
              </span>
            </div>
          </div>

          {/* Error notice */}
          {errorMessage && (
            <p className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
              {errorMessage}
            </p>
          )}

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full mt-4 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
              cart.length === 0
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950 active:scale-[0.99]'
            }`}
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            <span>Confirmar y Cobrar Venta</span>
          </button>
        </div>

      </div>
    </div>
  );
};
