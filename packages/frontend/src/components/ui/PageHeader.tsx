export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }): JSX.Element {
  return (
    <header className="page-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p className="lede">{description}</p> : null}
    </header>
  );
}
