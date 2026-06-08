import { motion } from 'framer-motion';

/** Grid técnico sutil + glows radiais. Decorativo, full-bleed. */
export function GridGlow({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-tech-grid opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      <div className="absolute left-1/2 top-[-10%] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-brand-petrolLight/20 blur-[130px]" />
      <div className="absolute -right-40 bottom-[-10%] h-[420px] w-[420px] rounded-full bg-brand-neon/10 blur-[120px]" />
    </div>
  );
}

/** Curvas de nível / topografia — motivo decorativo. */
export function TopoLines({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 600" fill="none" aria-hidden preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 8 }).map((_, i) => (
        <path
          key={i}
          d={`M ${10 + i * 9} 300 C 150 ${110 + i * 22}, 450 ${110 + i * 22}, ${590 - i * 9} 300 C 450 ${490 - i * 22}, 150 ${490 - i * 22}, ${10 + i * 9} 300 Z`}
          stroke="currentColor"
          strokeWidth="1"
          opacity={Math.max(0.04, 0.2 - i * 0.02)}
        />
      ))}
    </svg>
  );
}

const HUB = { x: 208, y: 286 };
const NODES = [
  { x: 168, y: 120 },
  { x: 286, y: 150 },
  { x: 312, y: 232 },
  { x: 240, y: 318 },
  { x: 196, y: 392 },
  { x: 132, y: 250 },
  { x: 258, y: 210 },
];

/**
 * Mapa-cobertura ESTILIZADO (não cartográfico): silhueta suave + nós luminosos de
 * presença conectados por linhas técnicas animadas. Representa a atuação nacional.
 */
export function CoverageMap({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 480" className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id="rm-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15616F" stopOpacity="0.28" />
          <stop offset="1" stopColor="#0F3D2E" stopOpacity="0.12" />
        </linearGradient>
        <radialGradient id="rm-node" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#34E39B" />
          <stop offset="1" stopColor="#34E39B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* silhueta continental estilizada */}
      <path
        d="M150 58 C182 48 214 60 232 82 C254 70 288 80 292 112 C322 122 348 152 350 188 C360 220 344 256 330 290 C320 326 300 356 280 386 C266 416 250 446 220 452 C198 458 184 440 180 414 C150 410 120 388 110 354 C94 318 80 290 76 254 C66 218 60 178 82 150 C98 120 122 92 150 58 Z"
        fill="url(#rm-land)"
        stroke="rgba(52,227,155,0.32)"
        strokeWidth="1.4"
      />

      {/* linhas técnicas hub -> nós */}
      {NODES.map((n, i) => (
        <motion.line
          key={`l-${i}`}
          x1={HUB.x}
          y1={HUB.y}
          x2={n.x}
          y2={n.y}
          stroke="rgba(52,227,155,0.30)"
          strokeWidth="1"
          strokeDasharray="3 5"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, delay: 0.25 + i * 0.12 }}
        />
      ))}

      {/* nós pulsantes */}
      {NODES.map((n, i) => (
        <g key={`n-${i}`}>
          <motion.circle
            cx={n.x}
            cy={n.y}
            r="14"
            fill="url(#rm-node)"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.1, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.3 }}
            style={{ transformOrigin: `${n.x}px ${n.y}px` }}
          />
          <circle cx={n.x} cy={n.y} r="3.4" fill="#34E39B" />
        </g>
      ))}

      {/* hub central */}
      <circle cx={HUB.x} cy={HUB.y} r="6" fill="#34E39B" />
      <circle cx={HUB.x} cy={HUB.y} r="6" fill="none" stroke="#34E39B" strokeOpacity="0.4">
        <animate attributeName="r" values="6;16;6" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
