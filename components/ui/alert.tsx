type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const styles: Record<AlertVariant, string> = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const icons: Record<AlertVariant, string> = {
  info: '⬤',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[variant]} ${className}`}>
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-bold">{icons[variant]}</span>
        <div>
          {title && <p className="mb-1 font-semibold">{title}</p>}
          <div className="opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}
