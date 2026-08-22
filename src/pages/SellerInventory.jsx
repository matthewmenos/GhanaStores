import React, { useEffect, useState } from 'react';
import { Plus, PackageX, Bell } from 'lucide-react';
import StatusBadge from '../components/UI/StatusBadge.jsx';
import { apiGet, apiPatch } from '../lib/api.js';

/**
 * SellerInventory — multi-variant product catalogue with inline stock
 * editing. Variants at or below their reorder threshold get an amber
 * "Low stock" badge; Arkesel SMS alerts are handled server-side the
 * moment a PATCH crosses that threshold (see routes/inventoryRoutes.js).
 */
export default function SellerInventory() {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null); // variantId currently being edited

  function refresh() {
    apiGet('/inventory/products').then(setProducts).catch(() => {});
  }

  useEffect(refresh, []);

  async function handleStockUpdate(variantId, quantityOnHand) {
    await apiPatch(`/inventory/variants/${variantId}/stock`, { quantityOnHand });
    setEditing(null);
    refresh();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-950">Inventory</h1>
          <p className="text-sm text-slate-500">Manage product variants, stock levels, and reorder thresholds.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus size={16} /> Add product
        </button>
      </div>

      <div className="space-y-4">
        {products.map((product) => (
          <div key={product.id} className="rounded-xl2 border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{product.name}</p>
                {product.category && <p className="text-xs text-slate-500">{product.category}</p>}
              </div>
              {!product.is_active && <StatusBadge status="pending" label="Inactive" />}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Variant</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Price (GHS)</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id} className="border-t border-slate-50">
                    <td className="px-4 py-2 text-slate-950">{v.optionLabel}</td>
                    <td className="px-4 py-2 text-slate-500">{v.sku}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-950">{Number(v.price).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      {editing === v.id ? (
                        <input
                          type="number"
                          min="0"
                          autoFocus
                          defaultValue={v.quantityOnHand}
                          onBlur={(e) => handleStockUpdate(v.id, Number(e.target.value))}
                          onKeyDown={(e) => e.key === 'Enter' && handleStockUpdate(v.id, Number(e.target.value))}
                          className="w-20 rounded-md border border-slate-200 px-2 py-1 tabular-nums focus:border-brand focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setEditing(v.id)}
                          className="tabular-nums text-slate-950 underline decoration-dotted underline-offset-2"
                        >
                          {v.quantityOnHand}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {v.quantityOnHand <= 0 ? (
                        <StatusBadge status="out_of_stock" />
                      ) : v.isLowStock ? (
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge status="low_stock" />
                          <Bell size={12} className="text-warning" />
                        </span>
                      ) : (
                        <StatusBadge status="active" label="In stock" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {products.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-slate-200 py-12 text-center">
            <PackageX size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">No products yet. Add your first product to start selling.</p>
          </div>
        )}
      </div>
    </div>
  );
}
