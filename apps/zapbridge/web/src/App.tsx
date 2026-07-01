import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Placeholder da Fase 0 — substituído pelo shell/rotas reais nas próximas fases.
function Placeholder() {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg text-white">
      <div className="text-center px-6">
        <div className="text-3xl font-extrabold text-primary">ZapBridge</div>
        <div className="text-muted mt-2">Web nativo (React + Vite) — scaffold no ar ✅</div>
      </div>
    </div>
  );
}
