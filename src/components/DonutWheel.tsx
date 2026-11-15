import React from 'react';
import type { DonutSegment, SpinOutcome } from '../types/game';
import { formatUnits } from '../engine/probability';

interface DonutWheelProps {
  segments: DonutSegment[];
  effectiveWinPct: number;
  stakeUnits: number;
  needleAngleDeg: number;
  isSpinning: boolean;
  lastOutcome: SpinOutcome | null;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number
): string {
  const sweep = endDeg - startDeg;
  if (sweep >= 359.99) {
    return [
      describeDonutArc(cx, cy, rOuter, rInner, 0, 180),
      describeDonutArc(cx, cy, rOuter, rInner, 180, 359.99),
    ].join(' ');
  }

  const p1 = polarToCartesian(cx, cy, rOuter, startDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, endDeg);
  const p3 = polarToCartesian(cx, cy, rInner, endDeg);
  const p4 = polarToCartesian(cx, cy, rInner, startDeg);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `L ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}`,
    'Z',
  ].join(' ');
}

function describeStrokeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.05) return '';
  const clampedEnd = sweep >= 359.9 ? startDeg + 359.9 : endDeg;
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, clampedEnd);
  const largeArc = clampedEnd - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export const DonutWheel: React.FC<DonutWheelProps> = ({
  segments,
  effectiveWinPct,
  stakeUnits,
  needleAngleDeg,
  isSpinning,
  lastOutcome,
}) => {
  const cx = 180;
  const cy = 180;
  const rOuter = 132;
  const rInner = 86;
  const winEndDeg = (effectiveWinPct / 100) * 360;

  const ticks = Array.from({ length: 24 }, (_, idx) => {
    const deg = idx * 15;
    const p1 = polarToCartesian(cx, cy, 146, deg);
    const p2 = polarToCartesian(cx, cy, idx % 6 === 0 ? 154 : 150, deg);
    return { deg, p1, p2, major: idx % 6 === 0 };
  });

  const winHighlightPath = describeStrokeArc(cx, cy, 140, 0, winEndDeg);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full max-w-[320px] aspect-square select-none">
        <svg
          viewBox="0 0 360 360"
          className="w-full h-full"
          role="img"
          aria-label={`Ruleta de probabilidades: ${effectiveWinPct.toFixed(2)}% zona ganadora`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={146}
            fill="none"
            stroke="rgba(23,23,23,0.08)"
            strokeWidth="1"
          />

          {ticks.map((t) => (
            <line
              key={t.deg}
              x1={t.p1.x}
              y1={t.p1.y}
              x2={t.p2.x}
              y2={t.p2.y}
              stroke={t.major ? 'rgba(23,23,23,0.38)' : 'rgba(23,23,23,0.16)'}
              strokeWidth={t.major ? 1.5 : 1}
              strokeLinecap="round"
            />
          ))}

          {winHighlightPath && (
            <path
              d={winHighlightPath}
              fill="none"
              stroke="#890149"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}

          {segments.map((seg) => (
            <path
              key={seg.id}
              d={describeDonutArc(
                cx,
                cy,
                rOuter,
                rInner,
                seg.startDeg,
                seg.endDeg
              )}
              fill={seg.color}
              stroke="#FFFFFF"
              strokeWidth={seg.endDeg - seg.startDeg > 1.2 ? 1.4 : 0.4}
            />
          ))}

          <circle
            cx={cx}
            cy={cy}
            r={rInner - 2}
            fill="#FFFFFF"
            stroke="rgba(23,23,23,0.10)"
            strokeWidth="1.5"
          />

          <g
            style={{
              transform: `rotate(${needleAngleDeg}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: isSpinning
                ? 'transform 3.4s cubic-bezier(0.12, 0.85, 0.16, 1)'
                : 'transform 0.35s ease-out',
            }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={rInner - 4}
              fill="none"
              stroke="#890149"
              strokeWidth="2.5"
              strokeOpacity="0.22"
            />
            <polygon
              points={`${cx - 6},${cy - rInner + 4} ${cx + 6},${cy - rInner + 4} ${cx + 2.2},${cy - rOuter - 12} ${cx - 2.2},${cy - rOuter - 12}`}
              fill="#FFFFFF"
              stroke="#171717"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <polygon
              points={`${cx - 7},${cy - rOuter - 18} ${cx + 7},${cy - rOuter - 18} ${cx},${cy - rOuter - 3}`}
              fill="#890149"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle
              cx={cx}
              cy={cy - rInner + 4}
              r={4.5}
              fill="#890149"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        </svg>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[142px] h-[142px] rounded-full flex flex-col items-center justify-center text-center px-3">
            {isSpinning ? (
              <>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#890149]">
                  Girando
                </span>
                <span className="text-lg font-extrabold text-[#171717] tabular mt-1">
                  {formatUnits(stakeUnits)} pts
                </span>
                <span className="text-[11px] font-semibold text-[#76766E] mt-0.5 tabular">
                  {effectiveWinPct.toFixed(1)}% ganar
                </span>
              </>
            ) : lastOutcome ? (
              <>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                    lastOutcome.isLoss
                      ? 'text-[#76766E]'
                      : lastOutcome.isInteger
                        ? 'text-[#890149]'
                        : 'text-[#15803D]'
                  }`}
                >
                  {lastOutcome.isLoss ? 'Sin Premio' : 'Ganaste'}
                </span>
                <span
                  className={`text-2xl font-extrabold tabular leading-tight mt-0.5 ${
                    lastOutcome.isLoss
                      ? 'text-[#171717]'
                      : lastOutcome.isInteger
                        ? 'text-[#890149]'
                        : 'text-[#15803D]'
                  }`}
                >
                  {lastOutcome.isLoss
                    ? '0.00'
                    : `+${formatUnits(lastOutcome.units)}`}
                </span>
                <span className="text-[11px] font-bold text-[#76766E]">
                  puntos
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#76766E]">
                  Prob. Ganar
                </span>
                <span className="text-2xl font-extrabold text-[#890149] tabular mt-0.5">
                  {effectiveWinPct.toFixed(1)}%
                </span>
                <span className="text-[11px] font-semibold text-[#4A4A44] tabular mt-0.5">
                  Apuesta: {formatUnits(stakeUnits)} pts
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Donut Legend */}
      <div className="w-full mt-4 pt-3.5 border-t border-black/10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[11px]">
        {segments.map((seg) => (
          <div key={seg.id} className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="font-semibold text-[#171717] truncate tabular">
              {seg.shortLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
