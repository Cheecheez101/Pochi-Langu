import type { ReactNode } from 'react';

export function Alert({ children, role = 'alert' }: { children: ReactNode; role?: 'alert' | 'status' }): JSX.Element {
  return <div className="alert" role={role}>{children}</div>;
}
