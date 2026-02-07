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
  status: 'pending' | 'processing' | 'printed' | 'error';
  detectedColor?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
  attemptCount?: number;
};

type View = "orders" | "settings";

// In production, use relative URLs (served from same origin)
// In development, use explicit localhost URL
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? "" : "http://localhost:3001");

// Status Badge Component
function StatusBadge({ 
  order, 
  onErrorClick 
}: { 
  order: Order; 
  onErrorClick?: () => void;
}) {
  if (order.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span className="h-2 w-2 rounded-full bg-slate-400"></span>
        Pending
      </span>
    );
  }

  if (order.status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
        Processing...
      </span>
    );
  }

  if (order.status === 'printed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Printed
      </span>
    );
  }

  if (order.status === 'error') {
    return (
      <button
        onClick={onErrorClick}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
        title="Click to see error details"
      >
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        Failed
      </button>
    );
  }

  return null;
}

// Error Details Modal Component
function ErrorDetailsModal({ 
  order, 
  onClose,
  onRetry
}: { 
  order: Order; 
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4" onClick={onClose}>
      <div className="max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">Error Details</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Order ID</p>
            <p className="text-sm text-slate-600">{order.orderId}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-slate-700">Error Message</p>
            <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200">
              {order.errorMessage || "Unknown error occurred"}
            </p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-slate-700">Attempts</p>
            <p className="text-sm text-slate-600">
              Failed after {order.attemptCount || 0} attempt{(order.attemptCount || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="mt-6 flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Retry Order
          </button>
          <button
            onClick={onClose}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [errorModalOrder, setErrorModalOrder] = useState<Order | null>(null);
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
      // Only show orders with customizations in "To Do" mode
      const customFieldParam = (!trimmedTerm && mode === 'pending') ? '&hasCustomField=true' : '';
      const response = await fetch(
        `${API_URL}/orders?limit=50&offset=0${searchParam}${statusParam}${customFieldParam}`
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
    // Mark order as processing in local state for UI feedback
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    // Optimistically update status to 'processing'
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.orderId === orderId 
          ? { ...order, status: 'processing' as const }
          : order
      )
    );
    
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/lightburn`, {
        method: "POST"
      });
      const data = await response.json();
      
      if (response.ok) {
        // Update to 'printed' status on success
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { ...order, status: 'printed' as const, errorMessage: null }
              : order
          )
        );
        
        const warningMsg = data.warning ? ` (${data.warning})` : '';
        setToast({ 
          message: `LightBurn file created successfully${warningMsg}`,
          type: 'success'
        });
        setTimeout(() => setToast(null), 4000);
        
        // Clear search and refocus input for next scan
        setSearchTerm("");
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 100);
      } else {
        // Update to 'error' status on failure
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { 
                  ...order, 
                  status: data.status || 'error' as const,
                  errorMessage: data.error || 'Failed to generate file',
                  attemptCount: data.attemptCount
                }
              : order
          )
        );
        
        setToast({ 
          message: data.error || 'Failed to generate file',
          type: 'error'
        });
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error(error);
      
      // Update to 'error' status on network failure
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.orderId === orderId 
            ? { ...order, status: 'error' as const, errorMessage: 'Network error: Failed to send to LightBurn' }
            : order
        )
      );
      
      setToast({ 
        message: "Network error: Failed to send to LightBurn",
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
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Custom Field</th>
                  <th className="px-4 py-3">Color</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
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
                    const isProcessing = order.status === 'processing';
                    const isPrinted = order.status === 'printed';
                    const isError = order.status === 'error';
                    const hasCustomField = Boolean(order.customField && order.customField.trim());
                    
                    // Row background: amber for exact match, dim for printed, white for pending
                    const rowClassName = isExactMatch 
                      ? "bg-amber-50 transition-colors duration-200" 
                      : isPrinted 
                      ? "bg-slate-50 opacity-50 transition-opacity duration-200"
                      : "transition-colors duration-200";
                    
                    // Determine button appearance based on status
                    const getActionButton = () => {
                      if (!hasCustomField) {
                        return <span className="text-slate-400">-</span>;
                      }

                      // Disable button when processing
                      if (isProcessing) {
                        return (
                          <button
                            className="rounded bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 cursor-not-allowed opacity-60"
                            disabled
                            title="Order is being processed"
                          >
                            Processing...
                          </button>
                        );
                      }

                      // Error state - show Retry button
                      if (isError) {
                        return (
                          <button
                            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                            onClick={() => handleLightburn(order.orderId)}
                            title="Retry failed order"
                          >
                            Retry
                          </button>
                        );
                      }

                      // Printed state - show Resend button with warning color
                      if (isPrinted) {
                        return (
                          <button
                            className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                            onClick={() => handleLightburn(order.orderId)}
                            title="Order already printed - resend if needed"
                          >
                            Resend
                          </button>
                        );
                      }

                      // Pending state - show primary button
                      return (
                        <button
                          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                          onClick={() => handleLightburn(order.orderId)}
                        >
                          Send to LightBurn
                        </button>
                      );
                    };
                    
                    return (
                      <tr
                        key={order.id}
                        className={rowClassName}
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {order.orderId}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.sku ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {hasCustomField ? (
                            order.customField
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                              Standard Order
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {order.detectedColor ? (
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-6 w-6 rounded-full border-2 border-slate-300"
                                style={{ backgroundColor: order.detectedColor }}
                                title={order.detectedColor}
                              />
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge 
                            order={order} 
                            onErrorClick={() => setErrorModalOrder(order)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {getActionButton()}
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

      {/* Error Details Modal */}
      {errorModalOrder && (
        <ErrorDetailsModal
          order={errorModalOrder}
          onClose={() => setErrorModalOrder(null)}
          onRetry={() => {
            handleLightburn(errorModalOrder.orderId);
            setErrorModalOrder(null);
          }}
        />
      )}
    </div>
  );
}
