"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-accent hover:bg-accent-hover text-white",
        variant === "ghost" && "text-slate-300 hover:bg-slate-700 hover:text-white",
        variant === "danger" && "bg-rose-600 hover:bg-rose-700 text-white",
        size === "md" && "px-4 py-2 text-sm",
        size === "sm" && "px-3 py-1.5 text-xs",
        className
      )}
      {...props}
    >
      {loading && <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
