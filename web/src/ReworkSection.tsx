import { useState } from "react";
import OrderRow from "./OrderRow";
import type { Order } from "./types";

type ReworkSectionProps = {
  orders: Order[];
  activeSearchTerm?: string;
  processingFronteOrders: Set<string>;
  processingRetroOrders: Set<string>;
  onProcessSide: (orderId: string, side: 'front' | 'retro') => void;
  onErrorClick: (order: Order, side: 'front' | 'retro') => void;
  onDiscardClick: (order: Order) => void;
};

export default function ReworkSection({
  orders,
  activeSearchTerm = '',
  processingFronteOrders,
  processingRetroOrders,
  onProcessSide,
  onErrorClick,
  onDiscardClick
}: ReworkSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (orders.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 hover:bg-amber-100 transition-colors"
      >
        <svg 
          className={`h-4 w-4 text-amber-900 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        <h3 className="text-sm font-semibold text-amber-900">
          Rework / Attention Needed ({orders.length})
        </h3>
      </button>
      {isOpen && (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap w-32 text-left align-middle">Order ID</th>
                <th className="px-4 py-3 whitespace-nowrap w-32 text-left align-middle">SKU</th>
                <th className="px-4 py-3 whitespace-nowrap w-48 text-left align-middle">Custom Field</th>
                <th className="px-4 py-3 whitespace-nowrap w-20 text-center align-middle">Color</th>
                <th className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">Status</th>
                <th className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">Action Fronte</th>
                <th className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">Action Retro</th>
                <th className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">Discard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(order => (
                <OrderRow
                  key={order.id}
                  order={order}
                  showDiscardColumn={true}
                  activeSearchTerm={activeSearchTerm}
                  processingFronteOrders={processingFronteOrders}
                  processingRetroOrders={processingRetroOrders}
                  onProcessSide={onProcessSide}
                  onErrorClick={onErrorClick}
                  onDiscardClick={onDiscardClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
