import type { ButtonHTMLAttributes } from 'react';

const variantStyles = {
  primary: 'bg-primary-yellow text-black hover:brightness-95 active:brightness-90',
  secondary: 'bg-status-neutral-bg text-status-neutral hover:bg-gray-200 active:bg-gray-300',
  danger: 'bg-status-danger text-white hover:bg-red-600 active:bg-red-700',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base font-semibold',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}

export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-yellow focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
