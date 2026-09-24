/*
 * Круговая шкала балла 0–500. Чистый SVG: без библиотек и без скриптов,
 * рисуется на сервере и одинаково выглядит в письме, печати и на телефоне.
 */
export default function ScoreDial({
  score, target = null, size = 168,
}: {
  score: number;
  target?: number | null;
  size?: number;
}) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 500));
  // Дуга занимает 270° — снизу остаётся разрыв под подпись.
  const span = 0.75;
  const dash = `${c * span * pct} ${c}`;
  const track = `${c * span} ${c}`;
  const tpos = target ? Math.max(0, Math.min(1, target / 500)) : null;

  return (
    <svg className="dial" viewBox="0 0 180 180" width={size} height={size} role="img"
      aria-label={`Балл ${score} из 500`}>
      <defs>
        <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5FE3D6" />
          <stop offset="55%" stopColor="#3CC8C0" />
          <stop offset="100%" stopColor="#4FB6E8" />
        </linearGradient>
      </defs>
      <g transform="rotate(135 90 90)">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#E9EFF6" strokeWidth="14"
          strokeLinecap="round" strokeDasharray={track} />
        <circle cx="90" cy="90" r={r} fill="none" stroke="url(#dialGrad)" strokeWidth="14"
          strokeLinecap="round" strokeDasharray={dash} />
        {tpos !== null ? (
          <circle cx="90" cy="90" r={r} fill="none" stroke="#0B1626" strokeWidth="14"
            strokeDasharray={`2 ${c}`} strokeDashoffset={-c * span * tpos} opacity="0.55" />
        ) : null}
      </g>
      <text x="90" y="92" textAnchor="middle" className="dial-v">{score}</text>
      <text x="90" y="112" textAnchor="middle" className="dial-l">из 500</text>
    </svg>
  );
}
