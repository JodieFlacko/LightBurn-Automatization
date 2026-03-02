import type { Order } from "./types";

type OrderGroupRowProps = {
  orderId: string;
  items: Order[];
  isExpanded: boolean;
  onToggle: () => void;
  colSpan: number;
};

function categorizeOrder(o: Order): "error" | "processing" | "printed" | "pending" {
  if (o.fronteStatus === "error" || o.retroStatus === "error") return "error";
  if (o.fronteStatus === "processing" || o.retroStatus === "processing") return "processing";
  const fronteDone = o.fronteStatus === "printed" && o.frontePrintCount >= o.quantity;
  const retroDone =
    o.retroStatus === "not_required" ||
    (o.retroStatus === "printed" && o.retroPrintCount >= o.quantity);
  if (fronteDone && retroDone) return "printed";
  return "pending";
}

export default function OrderGroupRow({
  orderId,
  items,
  isExpanded,
  onToggle,
  colSpan,
}: OrderGroupRowProps) {
  const counts = { error: 0, processing: 0, printed: 0, pending: 0 };
  items.forEach((o) => counts[categorizeOrder(o)]++);

  const bgClass =
    counts.error > 0
      ? "bg-red-50 hover:bg-red-100"
      : counts.processing > 0
      ? "bg-amber-50 hover:bg-amber-100"
      : counts.printed === items.length
      ? "bg-emerald-50 hover:bg-emerald-100"
      : "bg-indigo-50 hover:bg-indigo-100";

  return (
    <tr
      className={`${bgClass} cursor-pointer select-none transition-colors`}
      onClick={onToggle}
    >
      <td colSpan={colSpan} className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <svg
            className={`h-4 w-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>

          <span className="font-semibold text-slate-800 text-sm">{orderId}</span>

          <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {items.length} articoli
          </span>

          <div className="flex items-center gap-3 text-xs">
            {counts.pending > 0 && (
              <span className="text-slate-500">
                {counts.pending} in attesa
              </span>
            )}
            {counts.processing > 0 && (
              <span className="text-amber-600">
                {counts.processing} in elaborazione
              </span>
            )}
            {counts.printed > 0 && (
              <span className="text-emerald-600">
                {counts.printed} {counts.printed === 1 ? "stampato" : "stampati"}
              </span>
            )}
            {counts.error > 0 && (
              <span className="text-red-600">
                {counts.error} {counts.error === 1 ? "errore" : "errori"}
              </span>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
