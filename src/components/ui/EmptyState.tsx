import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-border rounded-xl bg-surface/40 ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-full bg-border/40 flex items-center justify-center text-text-muted mb-3.5">
          {icon}
        </div>
      )}
      <h4 className="text-sm sm:text-base font-semibold text-text font-sans">{title}</h4>
      {description && (
        <p className="text-xs sm:text-sm text-text-muted max-w-sm mt-1 font-sans">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
