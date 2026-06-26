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
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "primary" && "bg-[#4f7ef8] hover:bg-[#3b6ef0] text-white text-sm font-semibold shadow-lg shadow-blue-900/20",
        variant === "ghost"   && "text-muted hover:bg-white/[0.04] hover:text-subtle",
        variant === "danger"  && "bg-red-600 hover:bg-red-500 text-white",
        size === "md" && "px-4 py-2 text-sm",
        size === "sm" && "px-3 py-1.5 text-xs",
        className
      )}
      {...props}
    >
      {loading && <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
