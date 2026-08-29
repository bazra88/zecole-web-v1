export default function EmptyPanel({ title, children }) {
  return (
    <div className="empty-panel">
      <div className="empty-dot" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
