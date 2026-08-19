import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}
