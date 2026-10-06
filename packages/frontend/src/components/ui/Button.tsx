import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
};

export function Button({ variant = 'primary', isLoading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant}`} disabled={disabled || isLoading} {...props}>
      {isLoading ? 'Please wait…' : children}
    </button>
  );
}
