import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { FiX, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

type ToastType = 'success' | 'error';

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            {t.type === 'success' ? (
              <FiCheckCircle style={{ color: 'hsl(var(--success))', fontSize: '1.2rem' }} />
            ) : (
              <FiAlertCircle style={{ color: 'hsl(var(--destructive))', fontSize: '1.2rem' }} />
            )}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="toast__close" onClick={() => removeToast(t.id)}>
              <FiX />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
