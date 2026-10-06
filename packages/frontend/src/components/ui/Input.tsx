import type { InputHTMLAttributes } from 'react';

export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className="input" {...props} />;
}
