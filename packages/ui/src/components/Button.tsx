import type { ButtonHTMLAttributes } from "react";

import { cn } from "../lib/utils";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-transparent border-border text-foreground",
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-medium border border-transparent px-4 min-h-10 font-semibold text-[0.95rem] transition-colors focus-visible:outline-3 focus-visible:outline-ring/70 focus-visible:outline-offset-2 cursor-pointer",
        buttonVariants[variant],
        className
      )}
      type={type}
      {...props}
    />
  );
}
