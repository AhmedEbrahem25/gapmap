import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const variants = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(17_24_39/0.12)]",
  secondary: "bg-white text-ink border border-[#d1d5db] hover:bg-ground hover:border-[#c4c8cf]",
  ghost: "bg-transparent text-primary-600 hover:bg-primary-50",
  ai: "bg-ai-soft text-ai-ink border border-ai-line hover:bg-[#ebe3ff]",
  dark: "bg-ink text-white hover:bg-[#1f2937]",
  danger: "bg-white text-missing border border-[#f5c2c2] hover:bg-missing-soft",
} as const;

const sizes = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-[10px] gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2",
} as const;

export type ButtonVariant = keyof typeof variants;
type Common = { variant?: ButtonVariant; size?: keyof typeof sizes; className?: string };

export const buttonClass = (variant: ButtonVariant = "primary", size: keyof typeof sizes = "md", className?: string) =>
  cn(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 select-none",
    "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
    variants[variant],
    sizes[size],
    className,
  );

export function Button({ variant, size, className, ...props }: Common & ComponentProps<"button">) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
