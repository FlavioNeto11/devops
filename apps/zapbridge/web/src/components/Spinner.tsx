export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-line border-t-primary"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Carregando"
    />
  );
}
