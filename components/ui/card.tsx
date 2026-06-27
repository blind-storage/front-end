interface CardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, description, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-slate-700/60 bg-slate-800/50 p-6 ${className}`}>
      {(title || description) && (
        <div className="mb-5">
          {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
          {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
