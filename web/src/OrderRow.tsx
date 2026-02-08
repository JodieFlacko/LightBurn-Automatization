import type { Order } from "./types";

type OrderRowProps = {
  order: Order;
  showDiscardColumn?: boolean;
  activeSearchTerm?: string;
  processingFronteOrders: Set<string>;
  processingRetroOrders: Set<string>;
  onProcessSide: (orderId: string, side: 'front' | 'retro') => void;
  onErrorClick: (order: Order, side: 'front' | 'retro') => void;
  onDiscardClick?: (order: Order) => void;
};

export default function OrderRow({
  order,
  showDiscardColumn = false,
  activeSearchTerm = '',
  processingFronteOrders,
  processingRetroOrders,
  onProcessSide,
  onErrorClick,
  onDiscardClick
}: OrderRowProps) {
  const isExactMatch =
    activeSearchTerm.length > 0 &&
    order.orderId === activeSearchTerm;
  const hasCustomField = Boolean(order.customField && order.customField.trim());
  
  // Row background: amber for exact match, dim for both sides printed, white for pending
  const bothSidesPrinted = order.fronteStatus === 'printed' && 
    (order.retroStatus === 'printed' || order.retroStatus === 'not_required');
  const rowClassName = isExactMatch 
    ? "bg-amber-50 transition-colors duration-200" 
    : bothSidesPrinted
    ? "bg-slate-50 opacity-50 transition-opacity duration-200"
    : "transition-colors duration-200";

  // Calculate single overall status for the order (priority-based)
  const getOverallStatus = () => {
    // Priority 1: Check for errors (any side)
    const fronteHasError = order.fronteStatus === 'error';
    const retroHasError = order.retroStatus === 'error';
    
    if (fronteHasError || retroHasError) {
      // Check if it's a config error
      const isConfigError = 
        (fronteHasError && order.fronteErrorMessage?.startsWith('CONFIG_ERROR:')) ||
        (retroHasError && order.retroErrorMessage?.startsWith('CONFIG_ERROR:'));
      
      if (isConfigError) {
        return (
          <button
            onClick={() => onErrorClick(order, fronteHasError ? 'front' : 'retro')}
            className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200"
            title="Configuration error - click for details"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Config Error
          </button>
        );
      }
      
      return (
        <button
          onClick={() => onErrorClick(order, fronteHasError ? 'front' : 'retro')}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
          title="Error - click for details"
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Error
        </button>
      );
    }

    // Priority 2: Check for processing (any side)
    if (order.fronteStatus === 'processing' || order.retroStatus === 'processing') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
          Processing
        </span>
      );
    }

    // Priority 3: Check for partial completion (at least one side printed, but not both)
    const frontePrinted = order.fronteStatus === 'printed';
    const retroPrintedOrNotRequired = order.retroStatus === 'printed' || order.retroStatus === 'not_required';
    
    if (frontePrinted && retroPrintedOrNotRequired) {
      // Both sides complete
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Complete
        </span>
      );
    } else if (frontePrinted || (order.retroStatus === 'printed')) {
      // Partial completion
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-11a1 1 0 112 0v3.586l1.707 1.707a1 1 0 01-1.414 1.414l-2-2A1 1 0 019 11V7z" clipRule="evenodd" />
          </svg>
          Partial
        </span>
      );
    }

    // Priority 4: Pending (default)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span className="h-2 w-2 rounded-full bg-slate-400"></span>
        Pending
      </span>
    );
  };
  
  // Determine button appearance based on side status
  const getSideActionButton = (
    side: 'front' | 'retro',
    sideStatus: 'pending' | 'processing' | 'printed' | 'error' | 'not_required',
    sideErrorMessage: string | null | undefined,
    sideAttemptCount: number | undefined
  ) => {
    // Retro not required - show N/A
    if (side === 'retro' && sideStatus === 'not_required') {
      return <span className="text-slate-400">N/A</span>;
    }

    if (!hasCustomField) {
      return <span className="text-slate-400">-</span>;
    }

    const processingSet = side === 'front' ? processingFronteOrders : processingRetroOrders;
    const isProcessingSide = processingSet.has(order.orderId);

    // Disable button when processing this side
    if (sideStatus === 'processing' || isProcessingSide) {
      return (
        <button
          className="rounded bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 cursor-not-allowed opacity-60"
          disabled
          title={`${side === 'front' ? 'Front' : 'Retro'} side is being processed`}
        >
          Processing...
        </button>
      );
    }

    // Error state - check if it's a configuration error
    if (sideStatus === 'error') {
      const isConfigError = sideErrorMessage?.startsWith('CONFIG_ERROR:');
      
      if (isConfigError) {
        return (
          <button
            className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 transition-colors"
            onClick={() => onErrorClick(order, side)}
            title="Configuration error - click for details"
          >
            Fix Config
          </button>
        );
      }
      
      return (
        <button
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors"
          onClick={() => onErrorClick(order, side)}
          title="Error - click to retry"
        >
          Retry
        </button>
      );
    }

    // Printed state - show Resend button with warning color
    if (sideStatus === 'printed') {
      return (
        <button
          className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
          onClick={() => onProcessSide(order.orderId, side)}
          title={`${side === 'front' ? 'Front' : 'Retro'} already printed - resend if needed`}
        >
          Resend
        </button>
      );
    }

    // Pending state - show primary button
    return (
      <button
        className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
        onClick={() => onProcessSide(order.orderId, side)}
        title={`Process ${side === 'front' ? 'front' : 'retro'} side`}
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
      <td className="px-4 py-3 font-medium text-slate-700 w-32 text-left align-middle">
        {order.orderId}
      </td>
      <td className="px-4 py-3 text-slate-600 w-32 text-left align-middle">
        {order.sku ?? "-"}
      </td>
      <td className="px-4 py-3 text-slate-600 w-48 text-left align-middle">
        {hasCustomField ? (
          order.customField
        ) : (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
            Standard Order
          </span>
        )}
      </td>
      <td className="px-4 py-3 w-20 text-center align-middle">
        <div className="flex items-center justify-center">
          {order.detectedColor ? (
            <div 
              className="h-6 w-6 rounded-full border-2 border-slate-300"
              style={{ backgroundColor: order.detectedColor }}
              title={order.detectedColor}
            />
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">
        <div className="flex items-center justify-center">
          {getOverallStatus()}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">
        <div className="flex items-center justify-center">
          {getSideActionButton('front', order.fronteStatus, order.fronteErrorMessage, order.fronteAttemptCount)}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">
        <div className="flex items-center justify-center">
          {getSideActionButton('retro', order.retroStatus, order.retroErrorMessage, order.retroAttemptCount)}
        </div>
      </td>
      {showDiscardColumn && (
        <td className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">
          <div className="flex items-center justify-center">
            {(order.fronteStatus === 'error' || order.retroStatus === 'error') ? (
              <button
                onClick={() => onDiscardClick?.(order)}
                className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Cancel reprint and move back to history"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Discard
              </button>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
