export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}
