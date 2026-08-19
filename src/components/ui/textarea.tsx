import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
        {...props}
      />
    );
  },
);
