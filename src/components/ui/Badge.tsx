import React from 'react';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'primary';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  dot = false,
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 leading-tight',
    md: 'text-xs px-2.5 py-1 leading-normal',
  };

  const variantStyles = {
    default: 'bg-border/40 text-text-muted border border-border/60',
    primary: 'bg-primary/10 text-primary border border-primary/30',
    success: 'bg-success/10 text-success border border-success/30',
    danger: 'bg-danger/10 text-danger border border-danger/30',
    warning: 'bg-warning/10 text-warning border border-warning/30',
    info: 'bg-info/10 text-info border border-info/30',
  };

  const dotColors = {
    default: 'bg-text-muted',
    primary: 'bg-primary',
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-info',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      <span>{children}</span>
    </span>
  );
};
