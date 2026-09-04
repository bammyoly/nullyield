import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

// 1. Zustand Toast Store
export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toastData) => {
    const id = Date.now() + Math.random();
    set((state) => ({
      toasts: [...state.toasts, { ...toastData, id }],
    }));

    // Auto-dismiss after duration (default 5s)
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, toastData.duration || 5000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// 2. Global Toast Trigger Object
export const toast = {
  success: (message, opts) =>
    useToastStore.getState().addToast({ type: "success", message, ...opts }),
  error: (message, opts) =>
    useToastStore.getState().addToast({ type: "error", message, ...opts }),
  info: (message, opts) =>
    useToastStore.getState().addToast({ type: "info", message, ...opts }),
  warning: (message, opts) =>
    useToastStore.getState().addToast({ type: "warning", message, ...opts }),
};

const iconMap = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-rose-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-amber-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />,
};

const styleMap = {
  success: "border-emerald-500/30 bg-slate-900/95 text-emerald-200 shadow-emerald-500/10",
  error: "border-rose-500/30 bg-slate-900/95 text-rose-200 shadow-rose-500/10",
  info: "border-amber-500/30 bg-slate-900/95 text-amber-200 shadow-amber-500/10",
  warning: "border-yellow-500/30 bg-slate-900/95 text-yellow-200 shadow-yellow-500/10",
};

// 3. UI Container Component
export const Toaster = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      className="fixed top-24 right-6 pointer-events-none flex flex-col gap-3 max-w-md w-full"
      style={{ zIndex: 99999 }}
    >
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`pointer-events-auto backdrop-blur-xl border rounded-xl p-4 flex items-start gap-3 shadow-2xl ${
              styleMap[t.type] || styleMap.info
            }`}
          >
            <div className="mt-0.5">{iconMap[t.type] || iconMap.info}</div>
            <div className="flex-1 text-sm font-medium leading-relaxed break-words font-sans">
              {t.message}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-text-muted hover:text-text-primary transition-colors p-1 -mr-1 rounded-lg shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};