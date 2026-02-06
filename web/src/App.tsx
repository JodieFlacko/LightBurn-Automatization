import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import Settings from "./Settings";

type Order = {
  id: number;
  orderId: string;
  purchaseDate: string | null;
  sku: string | null;
  buyerName: string | null;
  customField: string | null;
  status: string | null;
};

type View = "orders" | "settings";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [currentView, setCurrentView] = useState<View>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<'pending' | 'all'>('pending');
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const fetchOrders = async (term: string, mode: 'pending' | 'all') => {
    const trimmedTerm = term.trim();
    setLoading(true);
    setSearching(Boolean(trimmedTerm));
    try {
      const searchParam = trimmedTerm
        ? `&search=${encodeURIComponent(trimmedTerm)}`
        : "";
      // If user is searching, ignore filter and search all history
      const statusParam = trimmedTerm ? "" : (mode === 'pending' ? '&status=pending' : '');
      const response = await fetch(
        `${API_URL}/orders?limit=50&offset=0${searchParam}${statusParam}`
      );
      const data = await response.json();
      setOrders(data.items ?? []);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${API_URL}/sync`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
          typeof data?.error === "string"
            ? data.error
            : `Sync failed (${response.status})`;
        throw new Error(message);
      }
      await fetchOrders(searchTerm, filterMode);
      setToast({ message: "Sync completed.", type: 'success' });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sync failed. Check console.";
      console.error(error);
      setToast({ message, type: 'error' });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setSyncing(false);
    }
  };

  const handleLightburn = async (orderId: string) => {
    // Mark order as processing
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/lightburn`, {
        method: "POST"
      });
      const data = await response.json();
      
      if (response.ok) {
        // Optimistically update the order status in local state
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { ...order, status: 'printed' }
              : order
          )
        );
        
        setToast({ 
          message: `LightBurn file created at ${data.filePath || 'output directory'}`,
          type: 'success'
        });
        setTimeout(() => setToast(null), 4000);
        
        // Clear search and refocus input for next scan
        setSearchTerm("");
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 100);
      } else {
        setToast({ 
          message: data.error || 'Failed to generate file',
          type: 'error'
        });
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error(error);
      setToast({ 
        message: "Failed to send to LightBurn",
        type: 'error'
      });
      setTimeout(() => setToast(null), 6000);
    } finally {
      // Remove processing state
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchOrders(debouncedSearchTerm, filterMode);
  }, [debouncedSearchTerm, filterMode]);

  const activeSearchTerm = debouncedSearchTerm.trim();
  const exactMatchOrder = activeSearchTerm
    ? orders.find((order) => order.orderId === activeSearchTerm)
    : undefined;
  const displayedOrders = exactMatchOrder
    ? [
        exactMatchOrder,
        ...orders.filter((order) => order.id !== exactMatchOrder.id)
      ]
    : orders;

  // If on Settings view, render the Settings component
  if (currentView === "settings") {
    return <Settings onBack={() => setCurrentView("orders")} />;
  }

  // Otherwise render the Orders view
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Amazon Orders Feed Importer</h1>
            <p className="text-sm text-slate-600">
              Sync orders and send custom fields to LightBurn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              onClick={() => setCurrentView("settings")}
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </header>

        {toast && (
          <div className={`rounded border px-4 py-3 text-sm ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            {toast.message}
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
            <div className="flex items-center gap-2">
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterMode === 'pending'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setFilterMode('pending')}
              >
                To Do
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setFilterMode('all')}
              >
                All History
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={searchInputRef}
                className="w-64 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Search Order ID (e.g. AMZ-1001)"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searching && (
                <span className="text-xs font-normal text-slate-500">
                  Searching...
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Custom Field</th>
                  <th className="px-4 py-3">LightBurn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-slate-500" colSpan={6}>
                      Loading...
                    </td>
                  </tr>
                ) : displayedOrders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-slate-500" colSpan={6}>
                      {activeSearchTerm
                        ? `No orders found for ${activeSearchTerm}.`
                        : "No orders found."}
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((order) => {
                    const isExactMatch =
                      activeSearchTerm.length > 0 &&
                      order.orderId === activeSearchTerm;
                    const isPrinted = order.status === 'printed';
                    const isProcessing = processingOrders.has(order.orderId);
                    
                    // Row background: amber for exact match, emerald for printed, white for pending
                    const rowClassName = isExactMatch 
                      ? "bg-amber-50" 
                      : isPrinted 
                      ? "bg-emerald-50"
                      : undefined;
                    
                    return (
                      <tr
                        key={order.id}
                        className={rowClassName}
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {order.orderId}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.purchaseDate ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.sku ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.buyerName ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.customField ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          {isPrinted ? (
                            <button
                              className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                              onClick={() => handleLightburn(order.orderId)}
                              disabled={isProcessing}
                            >
                              {isProcessing ? "Sending..." : "Reprint"}
                            </button>
                          ) : (
                            <button
                              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                              onClick={() => handleLightburn(order.orderId)}
                              disabled={isProcessing}
                            >
                              {isProcessing ? "Sending..." : "Send to LightBurn"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
