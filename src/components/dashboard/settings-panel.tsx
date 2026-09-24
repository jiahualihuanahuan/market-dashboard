import { useState } from "react";
import { UNIVERSE } from "@/lib/market/universe";
import { useDesk, type Zone } from "@/lib/market/settings";
import { Panel } from "@/components/dashboard/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SettingsPanel() {
  const zones = useDesk((s) => s.zones);
  const watch = useDesk((s) => s.watch);
  const upsertZone = useDesk((s) => s.upsertZone);
  const removeZone = useDesk((s) => s.removeZone);
  const toggleWatch = useDesk((s) => s.toggleWatch);
  const partialVix = useDesk((s) => s.partialVix);
  const fullVix = useDesk((s) => s.fullVix);
  const partialPct = useDesk((s) => s.partialPct);
  const breadthPanic = useDesk((s) => s.breadthPanic);
  const setPanic = useDesk((s) => s.setPanic);
  const choices = UNIVERSE.filter((item) => item.group === "equity" || item.group === "index");

  return (
    <div className="grid gap-4">
      <Panel title="Buy zones" kicker="Defaults follow the desk rules. Edit them. They stay in this browser.">
        <div className="grid gap-4">
          {zones.map((zone) => (
            <ZoneRow key={zone.symbol} zone={zone} onSave={upsertZone} onRemove={() => removeZone(zone.symbol)} />
          ))}
          <AddZone
            symbols={choices.map((item) => item.symbol).filter((symbol) => !zones.some((zone) => zone.symbol === symbol))}
            onAdd={upsertZone}
          />
        </div>
      </Panel>
      <Panel title="Watchlist" kicker="Names without a zone still show on the opportunity tab.">
        <div className="flex flex-wrap gap-2">
          {choices.map((item) => {
            const on = watch.includes(item.symbol);
            return (
              <button
                key={item.symbol}
                type="button"
                onClick={() => toggleWatch(item.symbol)}
                className={cn(
                  "h-11 rounded-full border px-3 text-sm",
                  on ? "border-fg bg-elevated text-fg" : "border-line text-muted",
                )}
              >
                {item.symbol}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Panic thresholds" kicker="Same numbers as the panic tab.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="Partial VIX" value={partialVix} onChange={(value) => setPanic({ partialVix: value })} />
          <Num label="Full VIX" value={fullVix} onChange={(value) => setPanic({ fullVix: value })} />
          <Num label="Partial deploy %" value={partialPct} onChange={(value) => setPanic({ partialPct: value })} />
          <Num label="Decliners bar %" value={breadthPanic} onChange={(value) => setPanic({ breadthPanic: value })} />
        </div>
      </Panel>
    </div>
  );
}

function ZoneRow({ zone, onSave, onRemove }: { zone: Zone; onSave: (zone: Zone) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(zone);
  return (
    <div className="grid gap-2 border-b border-line pb-4 sm:grid-cols-[6rem_1fr_1fr_1fr_auto]">
      <p className="self-center font-mono text-sm">{zone.symbol}</p>
      <Input aria-label="Low" inputMode="decimal" value={String(draft.low)} onChange={(e) => setDraft({ ...draft, low: Number(e.target.value) })} />
      <Input aria-label="High" inputMode="decimal" value={String(draft.high)} onChange={(e) => setDraft({ ...draft, high: Number(e.target.value) })} />
      <Input aria-label="Skip above" inputMode="decimal" value={String(draft.skipAbove)} onChange={(e) => setDraft({ ...draft, skipAbove: Number(e.target.value) })} />
      <div className="flex gap-2">
        <Button variant="line" onClick={() => onSave(draft)}>Save</Button>
        <Button variant="ghost" onClick={onRemove}>Remove</Button>
      </div>
      <Input className="sm:col-span-5" aria-label="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
    </div>
  );
}

function AddZone({ symbols, onAdd }: { symbols: string[]; onAdd: (zone: Zone) => void }) {
  const [symbol, setSymbol] = useState(symbols[0] ?? "AAPL");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [skip, setSkip] = useState("");
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_1fr_auto]">
      <select className="h-11 rounded-md border border-line bg-bg px-2 text-sm" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
        {symbols.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <Input placeholder="Low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
      <Input placeholder="High" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
      <Input placeholder="Skip above" inputMode="decimal" value={skip} onChange={(e) => setSkip(e.target.value)} />
      <Button
        onClick={() => {
          const zone = { symbol, low: Number(low), high: Number(high), skipAbove: Number(skip), note: "" };
          if ([zone.low, zone.high, zone.skipAbove].every((n) => Number.isFinite(n))) onAdd(zone);
        }}
      >
        Add zone
      </Button>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <Input
        className="mt-1"
        inputMode="decimal"
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
