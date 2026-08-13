// Subtle animated DNA helix - restrained, scientific, not cartoonish.
export default function DnaHelix({ size = 260 }: { size?: number }) {
  const rungs = Array.from({ length: 12 });
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 200 280" className="mx-auto">
      <style>{`
        .strandA, .strandB { animation: sway 6s ease-in-out infinite; transform-origin: center; }
        .strandB { animation-delay: -3s; }
        @keyframes sway { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
      `}</style>
      {rungs.map((_, i) => {
        const y = 20 + i * 22;
        const phase = (i / rungs.length) * Math.PI * 2;
        const xa = 100 + Math.sin(phase) * 40;
        const xb = 100 - Math.sin(phase) * 40;
        return (
          <g key={i}>
            <line x1={xa} y1={y} x2={xb} y2={y} stroke="#A9BFA8" strokeWidth="1.5" opacity="0.6" />
            <circle cx={xa} cy={y} r="4" fill="#1F3D2B" className="strandA" />
            <circle cx={xb} cy={y} r="4" fill="#3E6B63" className="strandB" />
          </g>
        );
      })}
    </svg>
  );
}
