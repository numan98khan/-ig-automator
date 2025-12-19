import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "neutral";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
}) => {
  // Theme-first:
  // - Use token colors (text-foreground / text-primary / border-border, etc.)
  // - Avoid primary-foreground for text (it's usually for solid buttons)
  // - For status colors, use Tailwind but make them work in both themes via "text-*" not pale-only values
  const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-secondary text-secondary-foreground border-border",
    success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
    danger: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={[
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variants[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
};
