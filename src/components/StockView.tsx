import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Product, ProductCategory } from '../types';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { 
  Package, 
  Flame, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  History, 
  ChefHat, 
  TrendingDown, 
  ShieldAlert
} from 'lucide-react';

export const StockView: React.FC = () => {
  const {
    products,
    bakeStock,
    addRawStock,
    registerWaste,
    updateProduct,
    addNewProduct,
    stockMovements,
  } = useApp();

  const [filterCategory, setFilterCategory] = useState<ProductCategory | 'all'>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modals state
  const [bakingProduct, setBakingProduct] = useState<Product | null>(null);
  const [bakeQty, setBakeQty] = useState('12');

  const [rawStockProduct, setRawStockProduct] = useState<Product | null>(null);
  const [rawStockQty, setRawStockQty] = useState('60');
  const [rawStockNote, setRawStockNote] = useState('Lote fresco de cocina');

  const [wasteProduct, setWasteProduct] = useState<Product | null>(null);
  const [wasteQty, setWasteQty] = useState('1');
  const [wasteReason, setWasteReason] = useState('Se abrió en el horno');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showNewProductModal, setShowNewProductModal] = useState(false);

  // New product form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ProductCategory>('empanadas_especiales');
  const [newPrice, setNewPrice] = useState('2200');
  const [newCost, setNewCost] = useState('800');
  const [newStockHorneadas, setNewStockHorneadas] = useState('20');
  const [newStockCrudas, setNewStockCrudas] = useState('80');
  const [newMinAlert, setNewMinAlert] = useState('10');
  const [newRepulgue, setNewRepulgue] = useState('Repulgue artesanal');
  const [newDesc, setNewDesc] = useState('');

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (onlyLowStock && p.stockHorneadas > p.minStockAlert) return false;
    return true;
  });

  // Overall totals
  const totalHorneadas = products.reduce((acc, p) => acc + (p.category.startsWith('empanadas') ? p.stockHorneadas : 0), 0);
  const totalCrudas = products.reduce((acc, p) => acc + (p.category.startsWith('empanadas') ? p.stockCrudas : 0), 0);
  const lowStockCount = products.filter((p) => p.stockHorneadas <= p.minStockAlert).length;

  const handleConfirmBake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakingProduct) return;
    const qty = parseInt(bakeQty) || 0;
    if (qty > 0) {
      bakeStock(bakingProduct.id, qty);
    }
    setBakingProduct(null);
  };

  const handleConfirmRaw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawStockProduct) return;
    const qty = parseInt(rawStockQty) || 0;
    if (qty > 0) {
      addRawStock(rawStockProduct.id, qty, rawStockNote);
    }
    setRawStockProduct(null);
  };

  const handleConfirmWaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteProduct) return;
    const qty = parseInt(wasteQty) || 0;
    if (qty > 0) {
      registerWaste(wasteProduct.id, qty, wasteReason);
    }
    setWasteProduct(null);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    addNewProduct({
      name: newName.trim(),
      category: newCategory,
      price: parseFloat(newPrice) || 2000,
      cost: parseFloat(newCost) || 750,
      stockHorneadas: parseInt(newStockHorneadas) || 0,
      stockCrudas: parseInt(newStockCrudas) || 0,
      minStockAlert: parseInt(newMinAlert) || 10,
      repulgue: newRepulgue.trim() || 'Estilo propio',
      description: newDesc.trim() || 'Elaboración artesanal propia.',
      active: true,
    });

    setShowNewProductModal(false);
    setNewName('');
    setNewDesc('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Top Inventory Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-medium">Empanadas Listas (Horneadas)</span>
            <span className="text-2xl font-extrabold text-stone-900 tabular-nums block mt-1">
              {totalHorneadas} <span className="text-xs font-normal text-stone-400">unidades</span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-medium">Empanadas en Cámara (Crudas)</span>
            <span className="text-2xl font-extrabold text-stone-900 tabular-nums block mt-1">
              {totalCrudas} <span className="text-xs font-normal text-stone-400">unidades</span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-700 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-medium">Variedades con Stock Bajo</span>
            <span className="text-2xl font-extrabold text-amber-700 tabular-nums block mt-1">
              {lowStockCount} <span className="text-xs font-normal text-stone-400">sabores</span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-medium">Acción Rápida de Inventario</span>
            <button
              onClick={() => setShowNewProductModal(true)}
              className="mt-2 text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Nuevo Sabor / Producto</span>
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
            <ChefHat className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Management Controls */}
      <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              filterCategory === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Todos ({products.length})
          </button>
          <button
            onClick={() => setFilterCategory('empanadas_clasicas')}
            className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              filterCategory === 'empanadas_clasicas'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            🥟 Clásicas
          </button>
          <button
            onClick={() => setFilterCategory('empanadas_especiales')}
            className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              filterCategory === 'empanadas_especiales'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            ⭐ Especiales Gourmet
          </button>
          <button
            onClick={() => setFilterCategory('bebidas_postres')}
            className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
              filterCategory === 'bebidas_postres'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            🥤 Bebidas
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-stone-700">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={(e) => setOnlyLowStock(e.target.checked)}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="font-medium">Solo stock crítico</span>
          </label>
        </div>
      </div>

      {/* Main Table of Stock */}
      <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Producto & Repulgue</th>
                <th className="py-3 px-3 text-right">Precio Venta</th>
                <th className="py-3 px-3 text-right">Costo Unit.</th>
                <th className="py-3 px-3 text-right">Margen Bruto</th>
                <th className="py-3 px-3 text-center">Listas (Horneadas)</th>
                <th className="py-3 px-3 text-center">En Cámara (Crudas)</th>
                <th className="py-3 px-3 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acciones Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredProducts.map((p) => {
                const marginPercent = p.price > 0 ? (((p.price - p.cost) / p.price) * 100).toFixed(0) : '0';
                const isCritical = p.stockHorneadas <= p.minStockAlert;

                return (
                  <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">{p.name}</div>
                      <div className="text-[11px] text-stone-400">{p.repulgue}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-stone-900 tabular-nums">
                      {formatCurrency(p.price)}
                    </td>
                    <td className="py-3 px-3 text-right text-stone-500 tabular-nums">
                      {formatCurrency(p.cost)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                      {marginPercent}% ({formatCurrency(p.price - p.cost)})
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold tabular-nums text-xs ${
                        p.stockHorneadas === 0
                          ? 'bg-rose-100 text-rose-800'
                          : isCritical
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}>
                        {p.stockHorneadas} u.
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-medium text-stone-600 tabular-nums">
                      {p.category.startsWith('empanadas') ? `${p.stockCrudas} u.` : '-'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {isCritical ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Reponer</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-700">Óptimo</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.category.startsWith('empanadas') && (
                          <>
                            <button
                              onClick={() => {
                                setBakingProduct(p);
                                setBakeQty('12');
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                              title="Pasar de crudas a horneadas"
                            >
                              <Flame className="w-3 h-3" />
                              <span>Hornear</span>
                            </button>
                            <button
                              onClick={() => {
                                setRawStockProduct(p);
                                setRawStockQty('60');
                              }}
                              className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                              title="Ingresar empanadas crudas elaboradas"
                            >
                              + Producción
                            </button>
                            <button
                              onClick={() => {
                                setWasteProduct(p);
                                setWasteQty('1');
                              }}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                              title="Registrar rotura o merma"
                            >
                              Merma
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="p-1 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                          title="Editar precio y costos"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Movements Log */}
      {stockMovements.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
            <History className="w-4 h-4 text-stone-700" />
            <h3 className="font-bold text-stone-900 text-sm">Historial Reciente de Movimientos de Stock</h3>
          </div>
          <div className="mt-3 divide-y divide-stone-100 text-xs">
            {stockMovements.slice(0, 10).map((mov) => (
              <div key={mov.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-900">{mov.productName}</span>
                  <span className="text-stone-500 ml-2">
                    {mov.type === 'hornear' && `🔥 Se hornearon ${mov.quantity} u.`}
                    {mov.type === 'produccion_cruda' && `📦 Se elaboraron ${mov.quantity} u. crudas`}
                    {mov.type === 'merma_rotura' && `⚠️ Merma de ${mov.quantity} u. (${mov.reason})`}
                  </span>
                </div>
                <span className="text-[11px] text-stone-400 tabular-nums">
                  {formatDateTime(mov.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Hornear Tanda */}
      {bakingProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-stone-200">
            <div className="flex items-center gap-2 text-amber-700">
              <Flame className="w-5 h-5" />
              <h3 className="text-base font-bold text-stone-900">Hornear Tanda</h3>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Pasar unidades de cámara frigorífica al mostrador caliente para: <strong>{bakingProduct.name}</strong>.
            </p>
            <p className="text-xs text-stone-600 mt-2">
              Disponibles crudas: <strong className="tabular-nums">{bakingProduct.stockCrudas} u.</strong>
            </p>

            <form onSubmit={handleConfirmBake} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Cantidad a hornear
                </label>
                <input
                  type="number"
                  min="1"
                  max={bakingProduct.stockCrudas}
                  required
                  value={bakeQty}
                  onChange={(e) => setBakeQty(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-1.5 text-xs">
                {['6', '12', '24', '36'].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setBakeQty(q)}
                    className="flex-1 py-1 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-semibold cursor-pointer"
                  >
                    {q} u.
                  </button>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBakingProduct(null)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Confirmar Horneado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ingreso de Producción */}
      {rawStockProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Ingreso de Producción de Cocina</h3>
            <p className="text-xs text-stone-500 mt-1">
              Sumar empanadas crudas recién elaboradas para: <strong>{rawStockProduct.name}</strong>.
            </p>

            <form onSubmit={handleConfirmRaw} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Cantidad de empanadas elaboradas
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={rawStockQty}
                  onChange={(e) => setRawStockQty(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nota o lote
                </label>
                <input
                  type="text"
                  value={rawStockNote}
                  onChange={(e) => setRawStockNote(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRawStockProduct(null)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Guardar Producción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Merma */}
      {wasteProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Registrar Merma / Pérdida</h3>
            <p className="text-xs text-stone-500 mt-1">
              Descuenta unidades horneadas por rotura o descarte de: <strong>{wasteProduct.name}</strong>.
            </p>

            <form onSubmit={handleConfirmWaste} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Cantidad a descartar
                </label>
                <input
                  type="number"
                  min="1"
                  max={wasteProduct.stockHorneadas}
                  required
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Motivo de la merma
                </label>
                <select
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="Se abrió en el horno">Se abrió en el horno</option>
                  <option value="Se quemó">Se quemó</option>
                  <option value="Consumo del personal">Consumo del personal</option>
                  <option value="Degustación / Muestra">Degustación / Muestra</option>
                  <option value="Vencimiento / Descarte fin de turno">Descarte fin de turno</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWasteProduct(null)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Registrar Merma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar Precios & Costos */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Editar {editingProduct.name}</h3>
            <p className="text-xs text-stone-500 mt-1">
              Ajusta los precios de venta, costos de insumo o umbral de alerta.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateProduct(editingProduct);
                setEditingProduct(null);
              }}
              className="mt-4 space-y-3.5"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Precio Venta ($)
                  </label>
                  <input
                    type="number"
                    value={editingProduct.price}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Costo Unitario Insumos ($)
                  </label>
                  <input
                    type="number"
                    value={editingProduct.cost}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, cost: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Alerta Stock Bajo (unidades)
                </label>
                <input
                  type="number"
                  value={editingProduct.minStockAlert}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, minStockAlert: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Repulgue o Identificador
                </label>
                <input
                  type="text"
                  value={editingProduct.repulgue}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, repulgue: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nueva Variedad */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-stone-900">Agregar Nueva Variedad o Producto</h3>
            <p className="text-xs text-stone-500 mt-1">
              Crea un nuevo sabor para tu carta de empanadas o bebida para la venta.
            </p>

            <form onSubmit={handleCreateProduct} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nombre del Producto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Bondiola a la Barbacoa con Cheddar"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Categoría
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900"
                  >
                    <option value="empanadas_clasicas">Empanada Clásica</option>
                    <option value="empanadas_especiales">Empanada Especial Gourmet</option>
                    <option value="bebidas_postres">Bebida / Postre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Repulgue / Cierre
                  </label>
                  <input
                    type="text"
                    value={newRepulgue}
                    onChange={(e) => setNewRepulgue(e.target.value)}
                    placeholder="Ej: Doble espiga"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Precio de Venta ($)
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Costo de Insumos ($)
                  </label>
                  <input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Stock Horneadas
                  </label>
                  <input
                    type="number"
                    value={newStockHorneadas}
                    onChange={(e) => setNewStockHorneadas(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Stock Crudas
                  </label>
                  <input
                    type="number"
                    value={newStockCrudas}
                    onChange={(e) => setNewStockCrudas(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Alerta Mínima
                  </label>
                  <input
                    type="number"
                    value={newMinAlert}
                    onChange={(e) => setNewMinAlert(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Descripción / Ingredientes
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detalle de los ingredientes principales"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Agregar a la Carta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
