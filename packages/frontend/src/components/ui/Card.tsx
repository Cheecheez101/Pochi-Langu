import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>): JSX.Element {
  return <section className={`card ${className}`.trim()} {...props} />;
}
