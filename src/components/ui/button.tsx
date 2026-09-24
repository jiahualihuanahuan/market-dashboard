import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost" | "line";
};

export function Button({ className, variant = "solid", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
        variant === "solid" && "bg-accent text-accent-fg hover:bg-fg",
        variant === "line" && "border border-line bg-surface text-fg hover:bg-elevated",
        variant === "ghost" && "text-muted hover:bg-elevated hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
