/** Label/value pairs as a definition list; empty values (null, undefined, '') are left out. */
export default function FactList({ items }) {
  const shown = items.filter(([, value]) => value != null && value !== '');
  if (!shown.length) return null;
  return (
    <dl className="fact-list">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
