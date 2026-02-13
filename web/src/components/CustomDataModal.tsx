import type { Order } from "../types";

type CustomDataModalProps = {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
};

export default function CustomDataModal({ 
  isOpen, 
  onClose, 
  order 
}: CustomDataModalProps) {
  if (!isOpen) return null;

  // Collect non-empty back text lines
  const backTextLines = [
    order.backText1,
    order.backText2,
    order.backText3,
    order.backText4
  ].filter(Boolean);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" 
      onClick={onClose}
    >
      <div 
        className="max-w-2xl w-full rounded-lg bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-indigo-50 to-slate-50">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Order {order.orderId}
            </h2>
            {order.designName && (
              <span className="inline-block mt-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                {order.designName}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Close"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body - Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 py-6">
          {/* Left Column - Front */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Fronte
              </h3>
            </div>
            
            {/* Front Text Display - Styled as tag simulation */}
            <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-6 min-h-[120px] flex items-center justify-center">
              {order.frontText ? (
                <p className="text-2xl font-bold text-slate-800 text-center leading-tight">
                  {order.frontText}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">No front text</p>
              )}
            </div>

            {order.designName && (
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-700">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  {order.designName}
                </span>
              </div>
            )}
          </div>

          {/* Right Column - Back */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Retro
              </h3>
            </div>

            {/* Back Text Display - List */}
            <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4 min-h-[120px]">
              {backTextLines.length > 0 ? (
                <ul className="space-y-2">
                  {backTextLines.map((line, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 flex-shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-700 leading-relaxed">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">No back text</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Specs */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              {/* Font Family */}
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Font Family</p>
                  <p className="text-sm text-slate-700 font-medium">
                    {order.fontFamily || "N/A"}
                  </p>
                </div>
              </div>

              {/* Color */}
              <div className="flex items-center gap-2">
                <div 
                  className="h-6 w-6 rounded-full border-2 border-slate-300 shadow-sm"
                  style={{ backgroundColor: order.colorName === "Nero" || !order.colorName ? "#000000" : "#888888" }}
                  title={order.colorName || "Unknown"}
                />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Color</p>
                  <p className="text-sm text-slate-700 font-medium">
                    {order.colorName || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Download Link */}
            {order.zipUrl && (
              <a
                href={order.zipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Source ZIP
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
