import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <LoaderCircle className={cn("spin h-4 w-4", className)} aria-hidden="true" strokeWidth={2} />
      {label && <span>{label}</span>}
    </span>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted">
      <Spinner label="Loading..." />
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
  optional?: boolean;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, children, className, optional }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Notice({
  tone,
  title,
  children,
  className,
  role,
}: {
  tone: "danger" | "warn" | "info" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const Icon = tone === "danger" ? CircleAlert : tone === "warn" ? TriangleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-control border px-3.5 py-3 text-[14px] leading-snug",
        tone === "danger" && "border-[#f1c9c5] bg-danger-tint text-[#7a1a12]",
        tone === "warn" && "border-[#f0dca4] bg-warn-tint text-warn",
        tone === "info" && "border-line bg-alt text-ink",
        tone === "success" && "border-[#bfdccf] bg-brand-tint text-brand",
        className,
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

/** Native <dialog>: focus is trapped and Escape closes it, handled by the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "w-[calc(100%-24px)] rounded-card border border-line bg-surface p-0 text-ink shadow-lift",
        wide ? "max-w-[880px] bg-page" : "max-w-[480px]",
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-[18px] font-semibold leading-snug">
              {title}
            </h2>
            <button type="button" className="-m-2 rounded-control p-2 text-muted hover:bg-alt" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 text-[15px]">{children}</div>
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------- Toasts ----------

interface Toast {
  id: number;
  text: string;
  tone: "success" | "danger";
}

const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        data-clarity-mask="True"
        className="pointer-events-none fixed inset-x-0 bottom-[84px] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-[420px] items-center gap-2 rounded-control px-4 py-3 text-[14px] font-medium shadow-lift",
              t.tone === "success" ? "bg-deep text-on-deep" : "bg-danger text-white",
            )}
          >
            {t.tone === "success" ? <CircleCheck className="h-4 w-4 shrink-0 text-mint" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function StatusBadge({ status, paid }: { status: "draft" | "issued" | "cancelled"; paid?: boolean }) {
  if (status === "draft") return <span className="badge bg-alt text-muted">Draft</span>;
  if (status === "cancelled") return <span className="badge bg-danger-tint text-danger">Cancelled</span>;
  return paid ? (
    <span className="badge bg-brand-tint text-brand">Paid</span>
  ) : (
    <span className="badge bg-warn-tint text-warn">Unpaid</span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-ink", className)}>
      <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-brand text-[15px] font-bold text-white">
        P
      </span>
      Parchi
    </span>
  );
}
