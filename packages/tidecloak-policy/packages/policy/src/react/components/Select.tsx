import { useState, useRef, useEffect } from 'react';
import './policy-builder.css';

// Inline SVG Icon
const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

interface SelectProps<T> {
  value: T | null;
  options: T[];
  onChange: (value: T) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
}

export function Select<T>({
  value,
  options,
  onChange,
  getLabel,
  getValue,
  placeholder = 'Select an option',
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (option: T) => {
    onChange(option);
    setIsOpen(false);
  };

  return (
    <div className="pb-select" ref={selectRef}>
      <button
        className="pb-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value ? getLabel(value) : placeholder}</span>
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="pb-select-options" role="listbox">
          {options.map((option) => {
            const optionValue = getValue(option);
            const isSelected = value && getValue(value) === optionValue;

            return (
              <div
                key={optionValue}
                className={`pb-select-option ${isSelected ? 'pb-select-option-selected' : ''}`}
                onClick={() => handleSelect(option)}
                role="option"
                aria-selected={!!isSelected}
              >
                {getLabel(option)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
