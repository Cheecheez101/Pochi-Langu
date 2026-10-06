import type { InputHTMLAttributes, ReactNode } from 'react';
import { Input } from './Input';

interface FormFieldProps {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children?: ReactNode;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

export function FormField({ label, name, error, hint, children, inputProps }: FormFieldProps): JSX.Element {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children ?? <Input id={name} name={name} aria-invalid={Boolean(error)} {...inputProps} />}
      {error ? <p className="field-error" id={`${name}-error`}>{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
