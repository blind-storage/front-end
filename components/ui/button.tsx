import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-emerald-400',
  secondary:
    'bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500',
  danger: 'bg-red-700 text-white hover:bg-red-600 disabled:bg-red-900 disabled:text-red-400',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 disabled:text-slate-600',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', isLoading, disabled, className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});
