import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import Settings from "./Settings";
import OrderRow from "./OrderRow";
import ReworkSection from "./ReworkSection";
import type { Order } from "./types";

type View = "orders" | "settings";

type ViewState = {
  view: View;
  suggestedSku?: string | null;
};

// In production, use relative URLs (served from same origin)
// In development, use explicit localhost URL
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? "" : "http://localhost:3001");

// Side-specific Status Badge Component
function SideStatusBadge({ 
  status,
  errorMessage,
  onErrorClick 
}: { 
  status: 'not_required' | 'pending' | 'processing' | 'printed' | 'error';
  errorMessage?: string | null;
  onErrorClick?: () => void;
}) {
  if (status === 'not_required') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
        N/A
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span className="h-2 w-2 rounded-full bg-slate-400"></span>
        Da Stampare
      </span>
    );
  }

  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
        Processing...
      </span>
    );
  }

  if (status === 'printed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Printed
      </span>
    );
  }

  if (status === 'error') {
    // Check if this is a configuration error
    const isConfigError = errorMessage?.startsWith('CONFIG_ERROR:');
    
    if (isConfigError) {
      return (
        <button
          onClick={onErrorClick}
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

// Legacy Status Badge Component (for overall status)
function StatusBadge({ 
  order, 
  onErrorClick 
}: { 
  order: Order; 
  onErrorClick?: () => void;
}) {
  return <SideStatusBadge status={order.status as any} errorMessage={order.errorMessage} onErrorClick={onErrorClick} />;
}

// Error Details Modal Component
function ErrorDetailsModal({ 
  order, 
  onClose,
  onRetry,
  onFixConfig,
  isRetrying
}: { 
  order: Order; 
  onClose: () => void;
  onRetry: () => void;
  onFixConfig?: () => void;
  isRetrying?: boolean;
}) {
  // Check if this is a configuration error
  const isConfigError = order.errorMessage?.startsWith('CONFIG_ERROR:');
  const displayMessage = isConfigError 
    ? order.errorMessage?.replace('CONFIG_ERROR: ', '') 
    : order.errorMessage;
  
  // Extract SKU from error message if it's a template match error
  const skuMatch = displayMessage?.match(/SKU[:\s]+['"]([^'"]+)['"]/i);
  const problematicSku = skuMatch ? skuMatch[1] : order.sku;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4" onClick={onClose}>
      <div className="max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <svg 
              className={`h-5 w-5 ${isConfigError ? 'text-orange-600' : 'text-red-600'}`} 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              {isConfigError ? (
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              )}
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">
              {isConfigError ? 'Configuration Error' : 'Error Details'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {isConfigError && (
          <div className="mb-4 rounded-lg bg-orange-50 border border-orange-200 p-3">
            <p className="text-sm text-orange-800">
              <strong>Configurazione Richiesta</strong>
              <br />
              Aggiungi una template in Impostazioni, poi clicca "Reset & Retry" per processare l'ordine.
            </p>
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">ID Ordine</p>
            <p className="text-sm text-slate-600">{order.orderId}</p>
          </div>
          
          {problematicSku && (
            <div>
              <p className="text-sm font-medium text-slate-700">SKU</p>
              <p className="text-sm text-slate-600 font-mono">{problematicSku}</p>
            </div>
          )}
          
          <div>
            <p className="text-sm font-medium text-slate-700">Error Message</p>
            <p className={`text-sm rounded px-3 py-2 border ${
              isConfigError 
                ? 'text-orange-700 bg-orange-50 border-orange-200' 
                : 'text-red-700 bg-red-50 border-red-200'
            }`}>
              {displayMessage || "Unknown error occurred"}
            </p>
          </div>
          
          {!isConfigError && (
            <div>
              <p className="text-sm font-medium text-slate-700">Tentativi</p>
              <p className="text-sm text-slate-600">
                Failed after {order.attemptCount || 0} attempt{(order.attemptCount || 0) !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex gap-3">
          {isConfigError ? (
            <>
              <button
                onClick={() => {
                  onFixConfig?.();
                  onClose();
                }}
                className="flex-1 rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Fix Configuration
                </span>
              </button>
              <button
                onClick={onRetry}
                disabled={isRetrying}
                className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
              >
                {isRetrying ? "Resetting..." : "Reset & Retry"}
              </button>
              <button
                onClick={onClose}
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onRetry}
                disabled={isRetrying}
                className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
              >
                {isRetrying ? "Retrying..." : "Retry Order"}
              </button>
              <button
                onClick={onClose}
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [viewState, setViewState] = useState<ViewState>({ view: "orders" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<'pending' | 'all'>('pending');
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  const [retryingOrders, setRetryingOrders] = useState<Set<string>>(new Set());
  const [processingFronteOrders, setProcessingFronteOrders] = useState<Set<string>>(new Set());
  const [processingRetroOrders, setProcessingRetroOrders] = useState<Set<string>>(new Set());
  const [errorModalOrder, setErrorModalOrder] = useState<Order | null>(null);
  const [errorModalSide, setErrorModalSide] = useState<'front' | 'retro' | null>(null);
  const [isConfigListOpen, setIsConfigListOpen] = useState(false);
  const [discardConfirmOrder, setDiscardConfirmOrder] = useState<Order | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Find configuration errors for banner (check both front and retro)
  const configErrorOrders = orders.filter(o => 
    (o.fronteStatus === 'error' && o.fronteErrorMessage?.startsWith('CONFIG_ERROR:')) ||
    (o.retroStatus === 'error' && o.retroErrorMessage?.startsWith('CONFIG_ERROR:'))
  );
  
  // Show banner if there are config errors
  const showConfigBanner = configErrorOrders.length > 0;

  const fetchOrders = async (term: string, mode: 'pending' | 'all') => {
    console.log('Refetching orders...', { term, mode });
    const trimmedTerm = term.trim();
    setLoading(true);
    setSearching(Boolean(trimmedTerm));
    try {
      const searchParam = trimmedTerm
        ? `&search=${encodeURIComponent(trimmedTerm)}`
        : "";
      // If user is searching, ignore filter and search all history
      // For "To Do" mode, exclude 'printed' orders to show pending, processing, and error
      const statusParam = trimmedTerm ? "" : (mode === 'pending' ? '&excludeStatus=printed' : '');
      // Only show orders with customizations in "To Do" mode
      const customFieldParam = (!trimmedTerm && mode === 'pending') ? '&hasCustomField=true' : '';
      const response = await fetch(
        `${API_URL}/orders?limit=50&offset=0${searchParam}${statusParam}${customFieldParam}`
      );
      const data = await response.json();
      console.log('Orders refreshed:', data.items?.length || 0, 'orders');
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
      setToast({ message: "Sincronizzazione completata.", type: 'success' });
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

  const handleSideProcessing = async (orderId: string, side: 'front' | 'retro') => {
    const sideLabel = side === 'front' ? 'fronte' : 'retro';
    const statusField = side === 'front' ? 'fronteStatus' : 'retroStatus';
    const errorField = side === 'front' ? 'fronteErrorMessage' : 'retroErrorMessage';
    const attemptField = side === 'front' ? 'fronteAttemptCount' : 'retroAttemptCount';
    const setProcessingSide = side === 'front' ? setProcessingFronteOrders : setProcessingRetroOrders;
    
    console.log(`handle${side}Processing called for order:`, orderId);
    
    // Mark order side as processing in local state for UI feedback
    setProcessingSide(prev => new Set(prev).add(orderId));
    
    // Optimistically update status to 'processing'
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.orderId === orderId 
          ? { ...order, [statusField]: 'processing' as const }
          : order
      )
    );
    
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/lightburn/${side}`, {
        method: "POST"
      });
      const data = await response.json();
      
      console.log(`${sideLabel} processing response:`, { ok: response.ok, status: response.status, data });
      
      if (response.ok) {
        // Update to 'printed' status on success
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { ...order, [statusField]: 'printed' as const, [errorField]: null }
              : order
          )
        );
        
        const warningMsg = data.warning ? ` (${data.warning})` : '';
        setToast({ 
          message: `${side === 'front' ? 'Front' : 'Retro'} side processed successfully${warningMsg}`,
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
                  [statusField]: data.status || 'error' as const,
                  [errorField]: data.error || 'Failed to generate file',
                  [attemptField]: data.attemptCount
                }
              : order
          )
        );
        
        setToast({ 
          message: `${side === 'front' ? 'Front' : 'Retro'}: ${data.error || 'Failed to generate file'}`,
          type: 'error'
        });
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error(`${sideLabel} processing request failed:`, error);
      
      // Update to 'error' status on network failure
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.orderId === orderId 
            ? { ...order, [statusField]: 'error' as const, [errorField]: 'Network error: Failed to send to LightBurn' }
            : order
        )
      );
      
      setToast({ 
        message: `Network error: Failed to send ${side} side to LightBurn`,
        type: 'error'
      });
      setTimeout(() => setToast(null), 6000);
    } finally {
      // Remove processing state
      setProcessingSide(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      
      // ALWAYS refresh orders after request completes to ensure UI shows server state
      console.log(`Refreshing orders after ${sideLabel} operation...`);
      await fetchOrders(searchTerm, filterMode);
    }
  };

  const handleLightburn = async (orderId: string) => {
    console.log('handleLightburn called for order:', orderId);
    
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
      
      console.log('LightBurn response:', { ok: response.ok, status: response.status, data });
      
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
      console.error('LightBurn request failed:', error);
      
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
      
      // ALWAYS refresh orders after request completes to ensure UI shows server state
      console.log('Refreshing orders after LightBurn operation...');
      await fetchOrders(searchTerm, filterMode);
    }
  };

  const handleRetry = async (orderId: string) => {
    console.log('handleRetry called for order:', orderId);
    
    // Mark order as retrying for UI feedback
    setRetryingOrders(prev => new Set(prev).add(orderId));
    
    // Optimistically update status to 'pending'
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.orderId === orderId 
          ? { ...order, status: 'pending' as const, errorMessage: null, attemptCount: 0 }
          : order
      )
    );
    
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/retry`, {
        method: "POST"
      });
      const data = await response.json();
      
      console.log('Retry response:', { ok: response.ok, status: response.status, data });
      
      if (response.ok) {
        // Update with the server response
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { ...order, ...data.order }
              : order
          )
        );
        
        setToast({ 
          message: `Order ${orderId} reset successfully. Ready to retry.`,
          type: 'success'
        });
        setTimeout(() => setToast(null), 4000);
        
        // Refresh the order list to ensure consistency
        console.log('Refreshing orders after retry...');
        await fetchOrders(searchTerm, filterMode);
      } else {
        // Revert optimistic update on failure - refetch to get accurate state
        console.log('Retry failed, refetching orders...');
        await fetchOrders(searchTerm, filterMode);
        
        setToast({ 
          message: data.error || 'Failed to retry order',
          type: 'error'
        });
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error('Retry request failed:', error);
      
      // Revert optimistic update on network failure
      await fetchOrders(searchTerm, filterMode);
      
      setToast({ 
        message: "Network error: Failed to retry order",
        type: 'error'
      });
      setTimeout(() => setToast(null), 6000);
    } finally {
      // Remove retrying state
      setRetryingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleFixConfig = (order: Order) => {
    console.log('handleFixConfig called for order:', order.orderId);
    
    // Extract SKU info for Settings hint
    const errorMsg = order.errorMessage?.replace('CONFIG_ERROR: ', '') || '';
    const skuMatch = errorMsg.match(/SKU[:\s]+['"]([^'"]+)['"]/i);
    const problematicSku = skuMatch ? skuMatch[1] : order.sku;
    
    // Navigate to Settings with the problematic SKU
    setViewState({ view: 'settings', suggestedSku: problematicSku });
  };

  const handleDiscardReprint = async (orderId: string) => {
    console.log('handleDiscardReprint called for order:', orderId);
    
    try {
      // Reset both sides to 'printed' status to remove from rework queue
      const response = await fetch(`${API_URL}/orders/${orderId}/discard-reprint`, {
        method: "POST"
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update local state to reflect the change
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.orderId === orderId 
              ? { 
                  ...order, 
                  fronteStatus: 'printed' as const,
                  retroStatus: order.retroStatus === 'not_required' ? ('not_required' as const) : ('printed' as const),
                  fronteErrorMessage: null,
                  retroErrorMessage: null
                }
              : order
          )
        );
        
        setToast({ 
          message: `Order ${orderId} moved back to history.`,
          type: 'success'
        });
        setTimeout(() => setToast(null), 4000);
        
        // Refresh orders to ensure consistency
        await fetchOrders(searchTerm, filterMode);
      } else {
        const data = await response.json().catch(() => ({}));
        setToast({ 
          message: data.error || 'Failed to discard reprint',
          type: 'error'
        });
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error('Discard reprint request failed:', error);
      setToast({ 
        message: "Network error: Failed to discard reprint",
        type: 'error'
      });
      setTimeout(() => setToast(null), 6000);
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

  // Split orders into rework and new categories (only for "To Do" view)
  const isReworkOrder = (order: Order) => {
    return Boolean(
      order.processedAt || 
      order.fronteProcessedAt || 
      order.retroProcessedAt
    );
  };

  const reworkOrders = filterMode === 'pending' 
    ? displayedOrders.filter(isReworkOrder)
    : [];
  const newOrders = filterMode === 'pending'
    ? displayedOrders.filter(order => !isReworkOrder(order))
    : [];

  // Handler for error clicks from OrderRow
  const handleErrorClick = (order: Order, side: 'front' | 'retro') => {
    setErrorModalOrder(order);
    setErrorModalSide(side);
  };

  // Reusable table header with optional discard column
  const renderTableHeader = (showDiscardColumn: boolean = false) => (
    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
      <tr>
        <th className="px-4 py-3 whitespace-nowrap w-32 text-left align-middle">ID Ordine</th>
        <th className="px-4 py-3 whitespace-nowrap w-32 text-left align-middle">SKU</th>
        <th className="px-4 py-3 whitespace-nowrap w-48 text-left align-middle">Campo Custom</th>
        <th className="px-4 py-3 whitespace-nowrap w-20 text-center align-middle">Colore</th>
        <th className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">Status</th>
        <th className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">Stampa Fronte</th>
        <th className="px-4 py-3 whitespace-nowrap w-44 text-center align-middle">Stampa Retro</th>
        {showDiscardColumn && (
          <th className="px-4 py-3 whitespace-nowrap w-32 text-center align-middle">Scarta</th>
        )}
      </tr>
    </thead>
  );

  // Reusable empty state
  const renderEmptyState = (message: string, showDiscardColumn: boolean = false) => (
    <tr>
      <td className="px-4 py-4 text-center text-slate-500 align-middle" colSpan={showDiscardColumn ? 8 : 7}>
        {message}
      </td>
    </tr>
  );

  // If on Settings view, render the Settings component
  if (viewState.view === "settings") {
    return <Settings onBack={() => setViewState({ view: "orders" })} suggestedSku={viewState.suggestedSku} />;
  }

  // Otherwise render the Orders view
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Importer ordini Amazon</h1>
            <p className="text-sm text-slate-600">
              Sincronizza ordini e invia campi personalizzati a LightBurn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              onClick={() => setViewState({ view: "settings" })}
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
              {syncing ? "Aggiornando..." : "Aggiorna Ora"}
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

        {/* Configuration Error Banner - Collapsible */}
        {showConfigBanner && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden animate-fadeIn">
            {/* Collapsed Summary Bar */}
            <button
              onClick={() => setIsConfigListOpen(!isConfigListOpen)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-orange-100 transition-colors"
            >
              <svg className="h-5 w-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="flex-1 text-left text-sm font-semibold text-orange-900">
                <strong>{configErrorOrders.length}</strong> {configErrorOrders.length === 1 ? 'Order requires' : 'Orders require'} configuration
              </span>
              <svg 
                className={`h-5 w-5 text-orange-600 flex-shrink-0 transition-transform ${isConfigListOpen ? 'rotate-180' : ''}`} 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Expanded Details List */}
            {isConfigListOpen && (
              <div className="border-t border-orange-200 px-4 py-3 space-y-3">
                {configErrorOrders.map((order) => {
                  const fronteHasError = order.fronteStatus === 'error' && order.fronteErrorMessage?.startsWith('CONFIG_ERROR:');
                  const retroHasError = order.retroStatus === 'error' && order.retroErrorMessage?.startsWith('CONFIG_ERROR:');
                  
                  return (
                    <div key={order.id} className="text-sm text-orange-800">
                      <strong>Order {order.orderId}</strong>:{' '}
                      {fronteHasError && (
                        <>
                          <span className="font-medium">Front:</span> {order.fronteErrorMessage?.replace('CONFIG_ERROR: ', '')}.{' '}
                        </>
                      )}
                      {retroHasError && (
                        <>
                          <span className="font-medium">Retro:</span> {order.retroErrorMessage?.replace('CONFIG_ERROR: ', '')}.{' '}
                        </>
                      )}
                      <button
                        onClick={() => handleFixConfig(order)}
                        className="underline hover:text-orange-900 font-medium"
                      >
                        Click here to add template rule in Settings
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
                Da Stampare
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setFilterMode('all')}
              >
                Tutti gli Ordini (Completati e Da Stampare)
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={searchInputRef}
                className="w-64 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Cerca ordine con ID (e.g. AMZ-1001)"
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

          {/* For "To Do" mode with split categories */}
          {filterMode === 'pending' && (reworkOrders.length > 0 || newOrders.length > 0) ? (
            <div className="divide-y divide-slate-200">
              {/* New Orders Section - Now First */}
              {newOrders.length > 0 && (
                <div>
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
                    <svg className="h-4 w-4 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    <h3 className="text-sm font-semibold text-slate-700">
                      New Orders ({newOrders.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                      {renderTableHeader()}
                      <tbody className="divide-y divide-slate-100">
                        {newOrders.map(order => (
                          <OrderRow
                            key={order.id}
                            order={order}
                            showDiscardColumn={false}
                            activeSearchTerm={activeSearchTerm}
                            processingFronteOrders={processingFronteOrders}
                            processingRetroOrders={processingRetroOrders}
                            onProcessSide={handleSideProcessing}
                            onErrorClick={handleErrorClick}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Rework / Attention Needed Section - Now Second & Collapsible */}
              <ReworkSection
                orders={reworkOrders}
                activeSearchTerm={activeSearchTerm}
                processingFronteOrders={processingFronteOrders}
                processingRetroOrders={processingRetroOrders}
                onProcessSide={handleSideProcessing}
                onErrorClick={handleErrorClick}
                onDiscardClick={(order) => setDiscardConfirmOrder(order)}
              />
            </div>
          ) : (
            /* Single unified table for "All History" or empty/loading states */
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
                {renderTableHeader()}
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    renderEmptyState("Loading...")
                  ) : displayedOrders.length === 0 ? (
                    renderEmptyState(
                      activeSearchTerm
                        ? `Non ci sono ordini con ID: ${activeSearchTerm}.`
                        : "Non ci sono ordini."
                    )
                  ) : (
                    displayedOrders.map(order => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        showDiscardColumn={false}
                        activeSearchTerm={activeSearchTerm}
                        processingFronteOrders={processingFronteOrders}
                        processingRetroOrders={processingRetroOrders}
                        onProcessSide={handleSideProcessing}
                        onErrorClick={handleErrorClick}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Error Details Modal */}
      {errorModalOrder && errorModalSide && (
        <ErrorDetailsModal
          order={{
            ...errorModalOrder,
            errorMessage: errorModalSide === 'front' 
              ? errorModalOrder.fronteErrorMessage 
              : errorModalOrder.retroErrorMessage,
            attemptCount: errorModalSide === 'front'
              ? errorModalOrder.fronteAttemptCount
              : errorModalOrder.retroAttemptCount
          }}
          onClose={() => {
            setErrorModalOrder(null);
            setErrorModalSide(null);
          }}
          onRetry={() => {
            handleSideProcessing(errorModalOrder.orderId, errorModalSide);
            setErrorModalOrder(null);
            setErrorModalSide(null);
          }}
          onFixConfig={() => {
            handleFixConfig(errorModalOrder);
          }}
          isRetrying={false}
        />
      )}

      {/* Discard Reprint Confirmation Modal */}
      {discardConfirmOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4" onClick={() => setDiscardConfirmOrder(null)}>
          <div className="max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-semibold text-slate-900">Discard Reprint</h3>
              </div>
              <button onClick={() => setDiscardConfirmOrder(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-slate-700">
                Are you sure you want to stop reprinting <strong>{discardConfirmOrder.orderId}</strong> and move it back to history?
              </p>
              <p className="mt-2 text-sm text-slate-500">
                This will not delete the order. It will simply mark it as complete and remove it from the "Rework" queue.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  handleDiscardReprint(discardConfirmOrder.orderId);
                  setDiscardConfirmOrder(null);
                }}
                className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Yes, Discard
              </button>
              <button
                onClick={() => setDiscardConfirmOrder(null)}
                className="flex-1 rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
