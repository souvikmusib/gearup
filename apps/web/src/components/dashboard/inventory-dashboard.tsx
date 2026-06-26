'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Package, AlertTriangle, ArrowDownUp, Plus, TrendingDown, BoxIcon } from 'lucide-react';

interface LowStockItem { id: string; sku: string; itemName: string; brand: string | null; quantityInStock: number; reorderLevel: number | null; }
interface Movement { id: string; movementType: string; quantity: number; reason: string | null; createdAt: string; inventoryItem: { itemName: string; sku: string } }

export function InventoryDashboard() {
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ls, mv, items] = await Promise.all([
        api.get<any>('/admin/inventory/low-stock'),
        api.get<any>('/admin/inventory/movements?pageSize=10'),
        api.get<any>('/admin/inventory/items?pageSize=1'),
      ]);
      if (ls.success) setLowStock(ls.data?.slice(0, 8) || []);
      if (mv.success) setMovements(mv.data?.data?.slice(0, 8) || mv.data?.slice?.(0, 8) || []);
      if (items.success) setTotalItems(items.data?.pagination?.total || items.data?.total || 0);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="animate-pulse space-y-4 p-6">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventory Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Stock overview and alerts</p>
        </div>
        <Link href="/admin/inventory/items" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Item
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950"><BoxIcon className="h-5 w-5 text-blue-600" /></div>
            <div><div className="text-2xl font-bold">{totalItems}</div><div className="text-xs text-gray-500">Total Items</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><div className="text-2xl font-bold text-red-600">{lowStock.length}</div><div className="text-xs text-gray-500">Low Stock Alerts</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950"><ArrowDownUp className="h-5 w-5 text-green-600" /></div>
            <div><div className="text-2xl font-bold">{movements.length}</div><div className="text-xs text-gray-500">Recent Movements</div></div>
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Low Stock Items</h2>
            <Link href="/admin/inventory/low-stock" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {lowStock.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">All items above reorder level ✓</div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {lowStock.map(item => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div>
                    <div className="font-medium text-sm">{item.itemName}</div>
                    <div className="text-xs text-gray-400 font-mono">{item.sku}{item.brand ? ` · ${item.brand}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${Number(item.quantityInStock) <= 0 ? 'text-red-600' : 'text-orange-500'}`}>
                      {Number(item.quantityInStock)} left
                    </div>
                    {item.reorderLevel && <div className="text-xs text-gray-400">reorder at {Number(item.reorderLevel)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Movements */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><ArrowDownUp className="h-4 w-4 text-blue-500" /> Recent Stock Movements</h2>
            <Link href="/admin/inventory/movements" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {movements.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No recent movements</div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {movements.map(mv => (
                <div key={mv.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div>
                    <div className="font-medium text-sm">{mv.inventoryItem?.itemName || '—'}</div>
                    <div className="text-xs text-gray-400">{mv.reason || mv.movementType}</div>
                  </div>
                  <div className={`text-sm font-bold ${mv.movementType.includes('IN') || mv.movementType.includes('INCREASE') ? 'text-green-600' : 'text-red-500'}`}>
                    {mv.movementType.includes('IN') || mv.movementType.includes('INCREASE') ? '+' : '−'}{Number(mv.quantity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/admin/inventory/items" className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <Package className="h-5 w-5 mx-auto text-gray-400 mb-2" /><div className="text-xs font-medium">All Items</div>
        </Link>
        <Link href="/admin/inventory/catalog" className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <BoxIcon className="h-5 w-5 mx-auto text-gray-400 mb-2" /><div className="text-xs font-medium">Catalog</div>
        </Link>
        <Link href="/admin/job-cards" className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <Package className="h-5 w-5 mx-auto text-gray-400 mb-2" /><div className="text-xs font-medium">Job Cards</div>
        </Link>
        <Link href="/admin/invoices" className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <Package className="h-5 w-5 mx-auto text-gray-400 mb-2" /><div className="text-xs font-medium">Invoices</div>
        </Link>
      </div>
    </div>
  );
}
