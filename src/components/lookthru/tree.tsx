import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/lookthru/format";
import type { LookthroughResult, TreeNode } from "@/lib/lookthru/types";
import { cn } from "@/lib/utils";

export function HoldingsTree({ result }: { result: LookthroughResult }) {
  return (
    <div className="space-y-2">
      {result.trees.map((node, i) => (
        <div key={`${node.symbol}-${i}`} className="rounded-xl bg-surface p-2 border border-line">
          <NodeRow node={node} currency={result.currency} depth={0} defaultOpen={i < 4} />
        </div>
      ))}
    </div>
  );
}

function NodeRow({
  node,
  currency,
  depth,
  defaultOpen = false,
}: {
  node: TreeNode;
  currency: LookthroughResult["currency"];
  depth: number;
  defaultOpen?: boolean;
}) {
  const hasKids = node.children.length > 0;
  const [open, setOpen] = useState(defaultOpen || depth < 1);

  return (
    <div>
      <button
        type="button"
        onClick={() => hasKids && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-elevated",
          !hasKids && "cursor-default hover:bg-transparent",
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-subtle transition-transform duration-150",
            open && hasKids && "rotate-90",
            !hasKids && "opacity-0",
          )}
        />
        <span className="w-20 shrink-0 font-mono text-sm">{node.displaySymbol}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{node.name}</span>
        <span className="hidden font-mono text-xs tabular-nums text-muted sm:inline">
          {formatPct(node.weightOfParent)} of parent
        </span>
        <span className="w-16 text-right font-mono text-xs tabular-nums">
          {formatPct(node.weightOfNav)}
        </span>
        <span className="w-20 text-right font-mono text-xs tabular-nums">
          {formatMoney(node.value, currency)}
        </span>
      </button>
      {open && hasKids
        ? node.children.map((child) => (
            <NodeRow
              key={`${node.symbol}-${child.symbol}-${child.weightOfParent}`}
              node={child}
              currency={currency}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}
