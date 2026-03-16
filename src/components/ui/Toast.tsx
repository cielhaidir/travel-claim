"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastVariant = "info" | "success" | "error";

type ToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastVariant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-950",
  success: "border-green-200 bg-green-50 text-green-950",
  error: "border-red-200 bg-red-50 text-red-950",
};

const TOAST_ICON_STYLES: Record<ToastVariant, string> = {
  info: "bg-blue-600",
  success: "bg-green-600",
  error: "bg-red-600",
};

export function ToastProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  function dismissToast(id: string) {
    const timeoutId = timeoutsRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timeoutsRef.current[id];
    }

    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id),
    );
  }

  function showToast(toast: ToastInput) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast: ToastItem = {
      id,
      variant: toast.variant ?? "info",
      durationMs: toast.durationMs ?? 4000,
      title: toast.title,
      message: toast.message,
    };

    setToasts((currentToasts) => [...currentToasts, nextToast]);

    if (nextToast.durationMs > 0) {
      timeoutsRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, nextToast.durationMs);
    }

    return id;
  }

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border p-4 shadow-lg ${TOAST_STYLES[toast.variant]}`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TOAST_ICON_STYLES[toast.variant]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                {toast.title && (
                  <p className="text-sm font-semibold">{toast.title}</p>
                )}
                <p className="text-sm leading-5">{toast.message}</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-current/60 transition hover:bg-black/5 hover:text-current"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
