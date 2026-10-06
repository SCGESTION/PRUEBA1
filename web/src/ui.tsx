import {
  AlertCircle,
  ArrowUpRight,
  Check,
  LoaderCircle,
  X,
  Dumbbell,
  Timer,
  Flag,
  Activity,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Track } from "./types";
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Intl.DateTimeFormat("es-ES", {
    ...options,
    timeZone: "Europe/Madrid",
  }).format(new Date(date.length === 10 ? `${date}T12:00:00` : date));
export const currency = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n,
  );
export const timeLabel = (seconds: number | null) => {
  if (seconds == null) return "—";
  const centiseconds = Math.round(seconds * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const wholeSeconds = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
};
export const movementLabels: Record<string, string> = {
  squat: "Sentadillas",
  burpee: "Burpees",
  deadlift: "Peso muerto",
  thruster: "Thrusters",
  wall_ball: "Wall balls",
  row: "Remo",
  run: "Carrera",
  ski: "SkiErg",
  box_jump: "Saltos al cajón",
  push_up: "Flexiones",
  pull_up: "Dominadas",
  lunge: "Zancadas",
  farmer_carry: "Farmer carry",
  sled_push: "Empuje de trineo",
};
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 112" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 0h30l24 83L79 0h30v35l31-35h40l-48 56 48 56h-39l-32-40-36 40H38z"
      />
    </svg>
  );
}
export function TrackBadge({ track }: { track: Track | "both" }) {
  return (
    <span className={`track-badge ${track}`}>
      {track === "forge" ? "FORGE" : track === "apex" ? "APEX" : "FORGE + APEX"}
    </span>
  );
}
export function Button({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
  loading = false,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}) {
  return (
    <button
      {...rest}
      type={type}
      className={`button ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </button>
  );
}
export function Notice({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          <Check size={18} />
          {success}
        </div>
      )}
    </>
  );
}
export function Loading() {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={25} />
      <span>Cargando tu universo Vector…</span>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon = "activity",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: "activity" | "flag" | "workout";
}) {
  const Icon =
    icon === "flag" ? Flag : icon === "workout" ? Dumbbell : Activity;
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function MiniArrow() {
  return <ArrowUpRight size={18} />;
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    open: "Abierto",
    upcoming: "Próximamente",
    closed: "Finalizado",
    queued: "En cola",
    processing: "Analizando",
    review: "Pendiente de juez",
    approved: "Validado",
    rejected: "No válido",
    failed: "Análisis fallido",
    pending: "Pendiente",
    confirmed: "Confirmado",
    declined: "Rechazado",
  };
  return (
    <span className={`status ${value}`}>
      <i />
      {labels[value] ?? value}
    </span>
  );
}
export function WorkoutMeta({
  duration,
  format,
}: {
  duration: number;
  format: string;
}) {
  return (
    <span className="meta">
      <Timer size={15} />
      {duration} min<span className="meta-dot">·</span>
      {
        (
          {
            for_time: "For time",
            amrap: "AMRAP",
            emom: "EMOM",
            strength: "Fuerza",
          } as Record<string, string>
        )[format]
      }
    </span>
  );
}
