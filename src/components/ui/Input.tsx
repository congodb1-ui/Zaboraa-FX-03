import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  tabularNums?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightElement,
  tabularNums = false,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-text-muted mb-1 font-sans">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-text-muted pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          disabled={disabled}
          className={`w-full bg-surface border rounded-lg px-3 py-2 text-xs sm:text-sm text-text placeholder:text-text-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed ${
            leftIcon ? 'pl-9' : ''
          } ${rightElement ? 'pr-10' : ''} ${
            error ? 'border-danger focus:ring-danger/30' : 'border-border'
          } ${tabularNums ? 'font-mono tabular-nums' : ''} ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 text-text-muted flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error ? (
        <p className="text-[11px] text-danger mt-1 font-sans">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-text-muted mt-1 font-sans">{hint}</p>
      ) : null}
    </div>
  );
};
