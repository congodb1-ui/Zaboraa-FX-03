import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const paddingMap = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7',
  };

  return (
    <div
      className={`bg-surface border border-border rounded-xl shadow-xs text-text transition-colors ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <div>
            {typeof title === 'string' ? (
              <h3 className="text-sm font-semibold text-text tracking-tight">{title}</h3>
            ) : (
              title
            )}
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={paddingMap[padding]}>{children}</div>
    </div>
  );
};
