import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  className = '',
}) => {
  const switchSizes = {
    sm: { track: 'w-7 h-4', thumb: 'w-3 h-3', translate: 'translate-x-3' },
    md: { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' },
  };

  const currentSize = switchSizes[size];

  return (
    <label
      className={`inline-flex items-center gap-2.5 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <div
          className={`${currentSize.track} rounded-full transition-colors ${
            checked ? 'bg-primary' : 'bg-border'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 ${currentSize.thumb} bg-white rounded-full transition-transform ${
            checked ? currentSize.translate : 'translate-x-0'
          }`}
        />
      </div>
      {(label || description) && (
        <div className="text-left">
          {label && <div className="text-xs sm:text-sm font-medium text-text">{label}</div>}
          {description && <div className="text-[11px] text-text-muted">{description}</div>}
        </div>
      )}
    </label>
  );
};
