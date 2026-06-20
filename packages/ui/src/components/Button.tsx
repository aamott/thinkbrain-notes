import type { ButtonHTMLAttributes } from "react";

import { classNames } from "../lib/classNames";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames("tn-button", `tn-button--${variant}`, className)}
      type={type}
      {...props}
    />
  );
}
