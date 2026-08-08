import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-primary text-white hover:bg-primary/90 active:bg-primary/80 shadow-sm",
  secondary:
    "bg-white text-text-primary border border-border hover:bg-bg-secondary active:bg-border/40",
  ghost: "bg-transparent text-text-primary hover:bg-bg-secondary",
  danger: "bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
};

const sizeStyles: Record<string, string> = {
  sm: "text-sm px-3 py-1.5 gap-1.5 rounded-lg min-h-[36px]",
  md: "text-sm px-4 py-2.5 gap-2 rounded-xl min-h-[44px]",
  lg: "text-base px-5 py-3 gap-2 rounded-xl min-h-[48px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-none
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={16} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
