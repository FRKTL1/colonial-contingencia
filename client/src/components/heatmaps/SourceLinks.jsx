/** Citas cortas con enlace a la fuente pública que sustenta un dato. */
export default function SourceLinks({ keys, sources, label = 'Fuente' }) {
  const items = (keys ?? []).map((key) => [key, sources?.[key]]).filter(([, s]) => s);
  if (items.length === 0) return null;
  return (
    <p className="source-links">
      <span>{items.length > 1 ? `${label}s` : label}:</span>
      {items.map(([key, s]) => (
        <a key={key} href={s.url} target="_blank" rel="noreferrer noopener" title={`${s.titulo} · ${s.editor}`}>{s.corto}</a>
      ))}
    </p>
  );
}
