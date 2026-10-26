import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  showCharCount?: boolean;
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, showCharCount, maxLength, id, required, value, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id || generatedId;
    const errorId = fieldId ? `${fieldId}-error` : undefined;
    const hintId = fieldId ? `${fieldId}-hint` : undefined;
    const describedBy = [error && errorId, hint && !error && hintId].filter(Boolean).join(' ') || undefined;
    const charCount = typeof value === 'string' ? value.length : 0;

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          required={required}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:border-transparent transition-colors',
            'resize-y min-h-[80px]',
            {
              'border-gray-300 focus:ring-indigo-500': !error,
              'border-red-500 focus:ring-red-500': error,
            },
            className
          )}
          {...props}
        />
        <div className="flex justify-between items-start">
          <div className="flex-1">
            {error && (
              <p id={errorId} className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {hint && !error && (
              <p id={hintId} className="text-sm text-gray-500">
                {hint}
              </p>
            )}
          </div>
          {showCharCount && maxLength && (
            <span
              className={clsx(
                'text-xs ml-2 flex-shrink-0',
                charCount > maxLength * 0.9 ? 'text-red-500' : 'text-gray-400'
              )}
              aria-live="polite"
            >
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
