import { Layers } from "lucide-react";
import { Button } from "@/components/lookthru/ui/button";
import type { CurrencyCode } from "@/lib/lookthru/types";
import { cn } from "@/lib/utils";

export function Header({
  currency,
  onCurrency,
}: {
  currency: CurrencyCode;
  onCurrency: (c: CurrencyCode) => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-elevated border border-line">
          <Layers className="size-4 text-accent" strokeWidth={1.5} />
        </span>
        <div>
          <p className="font-medium text-2xl leading-none tracking-tight">Lookthru</p>
          <p className="mt-1 text-xs text-muted">ETF look-through · underlying stocks</p>
        </div>
      </div>
      <div
        className="flex h-11 items-center rounded-md bg-elevated p-1 border border-line"
        role="group"
        aria-label="Display currency"
      >
        {(["CAD", "USD"] as const).map((c) => (
          <Button
            key={c}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onCurrency(c)}
            className={cn(
              "h-9 min-w-12 px-3 font-mono text-xs",
              currency === c && "bg-surface text-fg border border-line",
            )}
          >
            {c}
          </Button>
        ))}
      </div>
    </header>
  );
}
