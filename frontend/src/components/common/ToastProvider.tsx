import { useState, useCallback, useEffect, ReactNode } from 'react';
import { ToastContext } from './ToastContext';
import { useLocation } from 'react-router-dom';
import { Toast, ToastVariant } from './Toast';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const location = useLocation();

  // Clear toasts on navigation to prevent stale messages
  // Only update state if there are actually toasts to clear
  useEffect(() => {
    if (toasts.length > 0) {
      setToasts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only run on pathname change
  }, [location.pathname]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info', duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const toast = useCallback((message: string, variant?: ToastVariant, duration?: number) => {
    addToast(message, variant, duration);
  }, [addToast]);

  const success = useCallback((message: string, duration?: number) => {
    addToast(message, 'success', duration);
  }, [addToast]);

  const error = useCallback((message: string, duration?: number) => {
    addToast(message, 'error', duration);
  }, [addToast]);

  const info = useCallback((message: string, duration?: number) => {
    addToast(message, 'info', duration);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-auto sm:top-4"
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            id={t.id}
            message={t.message}
            variant={t.variant}
            duration={t.duration}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

