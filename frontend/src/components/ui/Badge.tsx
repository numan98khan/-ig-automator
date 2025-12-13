import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  className = '',
}) => {
  const variants = {
    primary: 'bg-primary/20 text-primary-foreground border-primary/20',
    secondary: 'bg-secondary/20 text-secondary-foreground border-secondary/20',
    success: 'bg-green-500/20 text-green-300 border-green-500/20',
    warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/20',
    danger: 'bg-red-500/20 text-red-300 border-red-500/20',
    neutral: 'bg-white/10 text-gray-300 border-white/10',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
