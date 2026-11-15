import React, { useMemo, useState } from 'react';
import {
  computeEffectiveDistribution,
  formatUnits,
  rollSpinOutcome,
} from '../engine/probability';
import type { GameConfig, TierId } from '../types/game';

interface ProbabilityMatrixTabProps {
  config: GameConfig;
  initialStakeUnits: number;
}

export const ProbabilityMatrixTab: React.FC<ProbabilityMatrixTabProps> = ({
  config,
  initialStakeUnits,
}) => {
  const [previewStakeUnits, setPreviewStakeUnits] = useState<number>(
    Math.max(config.minBetUnits, initialStakeUnits)
  );
  const [simTotal, setSimTotal] = useState<number>(0);
  const [simCounts, setSimCounts] = useState<Record<TierId, number> | null>(
    null
  );

  const dist = useMemo(
    () => computeEffectiveDistribution(config, previewStakeUnits),
    [config, previewStakeUnits]
  );

  const runSimulation = (count: number) => {
    const counts: Record<TierId, number> = {
      loss: 0,
      dec_low: 0,
      dec_mid: 0,
      dec_hi: 0,
      int_1: 0,
      int_2: 0,
      int_3: 0,
      int_4: 0,
      int_5: 0,
    };

    for (let i = 0; i < count; i++) {
      const res = rollSpinOutcome(config, previewStakeUnits);
      counts[res.tierId] += 1;
    }

    setSimTotal(count);
    setSimCounts(counts);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Live Scaled Probability Matrix */}
      <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-black/10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
              Modelo Dinámico Vigente
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight mt-1">
              Matriz de Probabilidades por Monto Apostado
            </h2>
            <p className="text-sm text-[#4A4A44] mt-1 max-w-2xl">
              Entre más puntos apuestas, mayor es el arco resaltado en la dona 2D. Desde{' '}
              <span className="font-bold text-[#171717] tabular">
                {formatUnits(config.minBetUnits)} pts ({config.minBetWinPct.toFixed(2)}% ganar)
              </span>{' '}
              hasta{' '}
              <span className="font-bold text-[#890149] tabular">
                {formatUnits(config.maxBetThresholdUnits)}+ pts ({config.maxBetWinPct.toFixed(2)}% ganar)
              </span>
              .
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full md:w-auto md:min-w-[220px] shrink-0">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#4A4A44]">Simular apuesta de:</span>
              <span className="text-[#890149] tabular">
                {formatUnits(previewStakeUnits)} pts
              </span>
            </div>
            <input
              type="range"
              min={config.minBetUnits}
              max={Math.max(config.minBetUnits + 1, config.maxBetThresholdUnits)}
              step={1}
              value={Math.min(
                Math.max(previewStakeUnits, config.minBetUnits),
                Math.max(config.minBetUnits + 1, config.maxBetThresholdUnits)
              )}
              onChange={(e) => {
                setPreviewStakeUnits(parseInt(e.target.value, 10));
                setSimCounts(null);
                setSimTotal(0);
              }}
              className="accent-[#890149] cursor-pointer"
            />
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                <th className="py-3 px-3">Resultado</th>
                <th className="py-3 px-3">Categoría</th>
                <th className="py-3 px-3 text-right">Probabilidad</th>
                <th className="py-3 px-3 w-48">Distribución</th>
              </tr>
            </thead>
            <tbody>
              {dist.tiers.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-black/8 last:border-none ${
                    t.isJackpot ? 'bg-[#890149]/5' : ''
                  }`}
                >
                  <td className="py-3.5 px-3 font-bold text-[#171717]">
                    {t.label}
                  </td>
                  <td className="py-3.5 px-3 text-xs font-semibold text-[#4A4A44]">
                    {t.category}
                  </td>
                  <td
                    className={`py-3.5 px-3 text-right font-bold tabular ${
                      t.isInteger ? 'text-[#890149]' : 'text-[#171717]'
                    }`}
                  >
                    {t.pct.toFixed(t.pct < 0.1 && t.pct > 0 ? 4 : 2)}%
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-2 bg-[#E7E7D8] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(t.pct, t.pct > 0 ? 1.2 : 0)}%`,
                          backgroundColor: t.color,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monte Carlo Auditor */}
      <section className="bg-white border border-black/10 rounded-2xl p-6 sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
            Auditoría Estadística (Sin afectar saldo real)
          </p>
          <h3 className="text-xl font-extrabold tracking-tight mt-1">
            Simulador Monte Carlo
          </h3>
          <p className="text-sm text-[#4A4A44] mt-1">
            Ejecuta tiradas criptográficas instantáneas para el monto seleccionado (
            <span className="font-bold tabular">
              {formatUnits(previewStakeUnits)} pts · {dist.effectiveWinPct.toFixed(2)}% ganar
            </span>
            ).
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 mb-6">
          {[1000, 10000, 50000].map((vol) => (
            <button
              key={vol}
              type="button"
              onClick={() => runSimulation(vol)}
              className="px-4 py-2.5 rounded-lg border border-black/15 hover:border-[#890149] hover:text-[#890149] bg-[#FAFAF5] text-xs font-bold transition-colors tabular"
            >
              Simular {vol.toLocaleString('es-GT')} tiradas
            </button>
          ))}
        </div>

        {simCounts && simTotal > 0 && (
          <div className="overflow-x-auto border-t border-black/10 pt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                  <th className="py-2.5 px-3">Resultado</th>
                  <th className="py-2.5 px-3 text-right">Teórico</th>
                  <th className="py-2.5 px-3 text-right">Observado</th>
                  <th className="py-2.5 px-3 text-right">% Real</th>
                </tr>
              </thead>
              <tbody>
                {dist.tiers.map((t) => {
                  const obs = simCounts[t.id];
                  const obsPct = (obs / simTotal) * 100;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-black/8 last:border-none"
                    >
                      <td className="py-2.5 px-3 font-bold">{t.label}</td>
                      <td className="py-2.5 px-3 text-right text-[#76766E] tabular">
                        {t.pct.toFixed(t.pct < 0.1 ? 3 : 2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular">
                        {obs.toLocaleString('es-GT')}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold tabular ${
                          t.isInteger ? 'text-[#890149]' : ''
                        }`}
                      >
                        {obsPct.toFixed(t.pct < 0.1 ? 3 : 2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
