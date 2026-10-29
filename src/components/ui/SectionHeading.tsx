import React from 'react';

export interface SectionHeadingProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  description,
  action,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 ${className}`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-text tracking-tight font-sans">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-text-muted mt-0.5 font-sans">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 self-start sm:self-auto">{action}</div>}
    </div>
  );
};
