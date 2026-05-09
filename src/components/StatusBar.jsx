export default function StatusBar({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="status-bar" role="status">
      <div className="spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
