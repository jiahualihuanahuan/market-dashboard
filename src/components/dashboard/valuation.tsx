import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Board } from "@/lib/market/types";
import { UNIVERSE } from "@/lib/market/universe";
import { fmtPct, fmtPrice } from "@/lib/market/format";
import { Panel } from "@/components/dashboard/bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Segment = { name: string; metric: string; multiple: string };

export function Valuation({ board }: { board: Board }) {
  const names = useMemo(
    () => UNIVERSE.filter((item) => item.group === "equity").map((item) => item.symbol),
    [],
  );
  const [symbol, setSymbol] = useState("NVDA");
  const quote = board.quotes.find((item) => item.symbol === symbol);
  const price = quote?.price ?? 0;

  const [fcf, setFcf] = useState("");
  const [growth, setGrowth] = useState("8");
  const [years, setYears] = useState("8");
  const [wacc, setWacc] = useState("9");
  const [terminal, setTerminal] = useState("2.5");
  const [netDebt, setNetDebt] = useState("0");
  const [pe, setPe] = useState("");
  const [medianPe, setMedianPe] = useState("");
  const [pb, setPb] = useState("");
  const [book, setBook] = useState("");
  const [segments, setSegments] = useState<Segment[]>([
    { name: "", metric: "", multiple: "" },
    { name: "", metric: "", multiple: "" },
  ]);
  const [sotpDebt, setSotpDebt] = useState("");
  const [shares, setShares] = useState("");

  const dcf = runDcf({
    fcf: num(fcf),
    growth: num(growth),
    years: num(years),
    wacc: num(wacc),
    terminal: num(terminal),
    netDebt: num(netDebt),
  });
  const yardstick = price > 0 ? price * 0.04 : null;
  const relative = pe && medianPe ? num(pe) - num(medianPe) : null;
  const pbValue = num(pb) > 0 && num(book) > 0 ? num(book) * num(pb) : null;
  const sotp = runSotp(segments, num(sotpDebt), num(shares));

  return (
    <div className="grid gap-4">
      <Panel title="Ticker" kicker="Price is the last completed close. Multiples are yours — filings are not scraped.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm text-muted">
            Symbol
            <select
              className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-fg"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
            >
              {names.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <p className="font-mono text-2xl tabular-nums">{price ? fmtPrice(price) : "No close"}</p>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Discounted cash flow" kicker="Per share. Terminal value is a Gordon growth cap.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="FCF / share" value={fcf} onChange={setFcf} />
            <Field label="Growth % for the explicit years" value={growth} onChange={setGrowth} />
            <Field label="Years" value={years} onChange={setYears} />
            <Field label="Discount rate %" value={wacc} onChange={setWacc} />
            <Field label="Terminal growth %" value={terminal} onChange={setTerminal} />
            <Field label="Net debt / share" value={netDebt} onChange={setNetDebt} />
          </div>
          <p className="mt-3 text-sm text-muted">
            Free cash flow is cash left after the spending needed to keep the business running. The discount rate is the yearly return you demand for waiting and for risk. Terminal growth is how fast you assume that cash grows forever after the years you typed in; it has to stay below the discount rate. Net debt is borrowings minus cash.
            {yardstick ? ` A 4% free-cash-flow yield on this close is ${fmtPrice(yardstick)} per share. That is a yardstick, not a forecast.` : ""}
          </p>
          {dcf == null ? (
            <p className="mt-3 text-sm text-muted">Enter free cash flow per share to see a value.</p>
          ) : (
            <Result
              lines={[
                ["Value / share", fmtPrice(dcf)],
                ["Vs close", price ? fmtPct((dcf / price - 1) * 100) : "—"],
              ]}
            />
          )}
        </Panel>

        <Panel title="Relative" kicker="Your multiple against the median you trust.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trailing P/E" value={pe} onChange={setPe} />
            <Field label="Median P/E" value={medianPe} onChange={setMedianPe} />
            <Field label="P/B" value={pb} onChange={setPb} />
            <Field label="Book / share" value={book} onChange={setBook} />
          </div>
          <Result
            lines={[
              ["P/E vs median", relative == null ? "—" : `${relative > 0 ? "+" : ""}${relative.toFixed(1)} turns`],
              ["Price at that P/B", pbValue ? fmtPrice(pbValue) : "—"],
            ]}
          />
          <p className="mt-3 text-sm text-muted">
            P/E is the share price divided by the last year of profit. P/B is the price divided by the accountants’ book value per share. “Turns” is how many multiples you are above or below the typical company you have in mind.
          </p>
        </Panel>
      </div>

      <Panel title="Sum of the parts" kicker="Value each business, then subtract what the company owes">
        <p className="mb-3 text-sm text-muted">
          Price each segment as if you sold it at a similar company’s multiple, subtract net debt, and divide by the diluted share count. Diluted shares include stock that options and convertibles could create. Figures are in millions except the per-share result.
        </p>
        <div className="grid gap-3">
          {segments.map((segment, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Segment"
                placeholder="Segment"
                value={segment.name}
                onChange={(event) => updateSegment(setSegments, index, { name: event.target.value })}
              />
              <Input
                aria-label="Metric"
                placeholder="EBITDA or revenue"
                inputMode="decimal"
                value={segment.metric}
                onChange={(event) => updateSegment(setSegments, index, { metric: event.target.value })}
              />
              <Input
                aria-label="Multiple"
                placeholder="Multiple"
                inputMode="decimal"
                value={segment.multiple}
                onChange={(event) => updateSegment(setSegments, index, { multiple: event.target.value })}
              />
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Net debt, millions" value={sotpDebt} onChange={setSotpDebt} />
            <Field label="Diluted shares, millions" value={shares} onChange={setShares} />
          </div>
          <Button
            variant="line"
            onClick={() =>
              setSegments([
                { name: "Core", metric: "1000", multiple: "10" },
                { name: "Other", metric: "200", multiple: "8" },
              ])
            }
          >
            Load an example, not company data
          </Button>
        </div>
        {sotp == null ? (
          <p className="mt-3 text-sm text-muted">Add one segment, net debt, and the share count.</p>
        ) : (
          <Result
            lines={[
              ["Equity value", `${fmtPrice(sotp.equity)} m`],
              ["Per share", fmtPrice(sotp.perShare)],
              ["Vs close", price ? fmtPct((sotp.perShare / price - 1) * 100) : "—"],
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <Input className="mt-1" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Result({ lines }: { lines: [string, string][] }) {
  return (
    <dl className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-3">
      {lines.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="font-mono text-lg tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function updateSegment(
  setSegments: Dispatch<SetStateAction<Segment[]>>,
  index: number,
  patch: Partial<Segment>,
) {
  setSegments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}

function num(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function runDcf(input: { fcf: number; growth: number; years: number; wacc: number; terminal: number; netDebt: number }) {
  if (input.fcf <= 0 || input.years < 1 || input.wacc / 100 <= input.terminal / 100) return null;
  const g = input.growth / 100;
  const r = input.wacc / 100;
  const gt = input.terminal / 100;
  const n = Math.min(40, Math.round(input.years));
  let pv = 0;
  let fcf = input.fcf;
  for (let year = 1; year <= n; year += 1) {
    fcf *= 1 + g;
    pv += fcf / (1 + r) ** year;
  }
  const terminal = (fcf * (1 + gt)) / (r - gt);
  pv += terminal / (1 + r) ** n;
  return pv - input.netDebt;
}

function runSotp(segments: Segment[], debt: number, shares: number) {
  const valued = segments
    .map((segment) => num(segment.metric) * num(segment.multiple))
    .filter((value) => value > 0);
  if (!valued.length || shares <= 0) return null;
  const equity = valued.reduce((sum, value) => sum + value, 0) - debt;
  return { equity, perShare: equity / shares };
}
