import { ClipboardPaste, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/lookthru/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/lookthru/ui/dialog";
import { Input } from "@/components/lookthru/ui/input";
import { CATALOG_SUGGESTIONS } from "@/lib/lookthru/catalog";
import { parsePaste } from "@/lib/lookthru/tickers";

export function PortfolioEditor({
  onAdd,
  onPaste,
  onSample,
  onClear,
  disabled,
}: {
  onAdd: (ticker: string, shares: number) => void;
  onPaste: (rows: { ticker: string; shares: number }[]) => void;
  onSample: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("100");
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState(
    "HYLD.TO 7070\nQDAY.NE 1749\nXEQT.TO 1296\nHHIS.TO 648\nCMAX.TO 100",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = ticker.trim();
    const n = Number(shares);
    if (!t || !Number.isFinite(n) || n <= 0) return;
    onAdd(t, n);
    setTicker("");
  }

  return (
    <section className="rounded-xl bg-surface p-4 border border-line sm:p-5">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="text-xs font-medium tracking-wide text-muted">Ticker</span>
          <Input
            list="lookthru-tickers"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="HYLD.TO, HHIS.TO, CMAX.TO"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono uppercase"
          />
          <datalist id="lookthru-tickers">
            {CATALOG_SUGGESTIONS.map((s) => (
              <option key={s.symbol} value={s.symbol} label={s.name} />
            ))}
          </datalist>
        </label>
        <label className="w-full space-y-1.5 sm:w-28">
          <span className="text-xs font-medium tracking-wide text-muted">Shares</span>
          <Input
            type="number"
            min={0.0001}
            step="any"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="font-mono tabular-nums"
          />
        </label>
        <Button type="submit" disabled={disabled} className="h-11 w-full sm:w-auto">
          <Plus />
          Add
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" size="sm">
              <ClipboardPaste />
              Paste list
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paste holdings</DialogTitle>
              <DialogDescription>
                Wealthsimple CSV (Symbol, Exchange, Quantity) or one ticker per line:
                HYLD.TO 7070
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={8}
              className="w-full resize-y rounded-md bg-elevated p-3 font-mono text-sm text-fg border border-line focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onPaste(parsePaste(bulk));
                  setOpen(false);
                }}
              >
                Add rows
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button type="button" variant="secondary" size="sm" onClick={onSample}>
          <RotateCcw />
          Load book
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Trash2 />
          Clear
        </Button>
      </div>
    </section>
  );
}
