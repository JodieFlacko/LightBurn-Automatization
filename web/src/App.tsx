import { useEffect, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

type Order = {
  id: number;
  orderId: string;
  purchaseDate: string | null;
  sku: string | null;
  buyerName: string | null;
  customField: string | null;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const fetchOrders = async (term: string) => {
    const trimmedTerm = term.trim();
    setLoading(true);
    setSearching(Boolean(trimmedTerm));
    try {
      const searchParam = trimmedTerm
        ? `&search=${encodeURIComponent(trimmedTerm)}`
        : "";
      const response = await fetch(
        `${API_URL}/orders?limit=50&offset=0${searchParam}`
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
      await fetchOrders(searchTerm);
      setToast("Sync completed.");
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sync failed. Check console.";
      console.error(error);
      setToast(message);
      setTimeout(() => setToast(null), 6000);
    } finally {
      setSyncing(false);
    }
  };

  const handleLightburn = async (orderId: string) => {
    const response = await fetch(`${API_URL}/orders/${orderId}/ezcad`, {
      method: "POST"
    });
    const data = await response.json();
    setToast(`LightBurn file created at ${data.filePath}`);
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchOrders(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

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
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </header>

        {toast && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {toast}
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
            <span>Orders</span>
            <div className="flex items-center gap-3">
              <input
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
                    return (
                      <tr
                        key={order.id}
                        className={isExactMatch ? "bg-amber-50" : undefined}
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
                          <button
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() => handleLightburn(order.orderId)}
                          >
                            Send to LightBurn
                          </button>
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
