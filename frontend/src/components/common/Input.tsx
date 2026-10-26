import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: boolean;
  hint?: string;
  showValidationIcon?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, success, hint, showValidationIcon = false, id, required, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id || generatedId;
    const errorId = fieldId ? `${fieldId}-error` : undefined;
    const hintId = fieldId ? `${fieldId}-hint` : undefined;
    const describedBy = [error && errorId, hint && !error && hintId].filter(Boolean).join(' ') || undefined;

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
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={clsx(
              'block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:border-transparent transition-colors',
              {
                'border-gray-300 focus:ring-indigo-500': !error && !success,
                'border-red-500 focus:ring-red-500': error,
                'border-green-500 focus:ring-green-500': success && !error,
                'pr-10': showValidationIcon && (error || success),
              },
              className
            )}
            {...props}
          />
          {showValidationIcon && error && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <AlertCircle className="w-5 h-5 text-red-500" aria-hidden="true" />
            </div>
          )}
          {showValidationIcon && success && !error && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
            </div>
          )}
        </div>
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
    );
  }
);

Input.displayName = 'Input';
