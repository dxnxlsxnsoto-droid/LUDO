import type {
  BettingWindowState,
  DonutSegment,
  EffectiveDistribution,
  GameConfig,
  RewardItem,
  SpinOutcome,
  TierId,
  TimerSettings,
} from '../types/game';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minBetUnits: 1, // 0.01 pts
  maxBetThresholdUnits: 100, // 1.00 pt
  minBetWinPct: 12.0,
  maxBetWinPct: 40.0,
  tierDecLow: 25.0,
  tierDecMid: 10.0,
  tierDecHi: 4.5,
  tierInt1: 0.35,
  tierInt2: 0.09,
  tierInt3: 0.03,
  tierInt4: 0.02,
  tierInt5: 0.01,
  prizeDecLowMinUnits: 10,
  prizeDecLowMaxUnits: 30,
  prizeDecMidMinUnits: 40,
  prizeDecMidMaxUnits: 60,
  prizeDecHiMinUnits: 70,
  prizeDecHiMaxUnits: 90,
  prizeInt1Units: 100,
  prizeInt2Units: 200,
  prizeInt3Units: 300,
  prizeInt4Units: 400,
  prizeInt5Units: 500,
  bettingEnabled: true,
  bettingStartAt: null,
  bettingEndAt: null,
};

export const DEFAULT_REWARDS: Omit<RewardItem, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'reward_01',
    order: 1,
    title: 'Cambio de Lugar en Clase',
    description: 'Elige tu escritorio preferido durante una sesión de clase.',
    costUnits: 500,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_02',
    order: 2,
    title: '5 Minutos Extra en Actividad',
    description: 'Tiempo adicional individual en un taller o práctica en clase.',
    costUnits: 1000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_03',
    order: 3,
    title: 'Pista en Ejercicio o Laboratorio',
    description: 'Orientación directa del docente en un inciso de evaluación práctica.',
    costUnits: 2500,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_04',
    order: 4,
    title: 'Prórroga de 24h en Tarea',
    description: 'Entrega una tarea con 24 horas adicionales sin penalización.',
    costUnits: 5000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_05',
    order: 5,
    title: '+1 Punto Extra en Tarea Corta',
    description: 'Bonificación de 1 punto neto sobre una tarea o hoja de trabajo.',
    costUnits: 10000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_06',
    order: 6,
    title: 'Comodín: Repetir Quiz o Corto',
    description: 'Derecho a repetir una prueba corta y conservar la nota más alta.',
    costUnits: 20000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_07',
    order: 7,
    title: 'Exoneración de Tarea Semanal',
    description: 'Nota completa automática en una tarea semanal asignada.',
    costUnits: 35000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_08',
    order: 8,
    title: '+5 Puntos Extra en Parcial',
    description: 'Bonificación directa de 5 puntos en tu evaluación parcial.',
    costUnits: 50000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_09',
    order: 9,
    title: 'Sustitución de Nota de Laboratorio',
    description: 'Reemplaza tu nota más baja de laboratorio por el máximo puntaje.',
    costUnits: 75000,
    stock: -1,
    active: true,
    isGrandPrize: false,
  },
  {
    id: 'reward_10',
    order: 10,
    title: 'Exoneración de Examen (Premio Mayor)',
    description: 'Exoneración total del examen con calificación máxima acreditada.',
    costUnits: 100000,
    stock: -1,
    active: true,
    isGrandPrize: true,
  },
];

export function formatUnits(units: number): string {
  return (units / 100).toFixed(2);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function secureRandInt(maxExclusive: number): number {
  const array = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  let r = 0;
  do {
    window.crypto.getRandomValues(array);
    r = array[0];
  } while (r >= limit);
  return r % maxExclusive;
}

function randomUnitsInRange(minUnits: number, maxUnits: number): number {
  const lo = Math.max(1, Math.min(minUnits, maxUnits));
  const hi = Math.max(lo, maxUnits);
  if (lo === hi) return lo;
  // Pick step in 10-unit (0.10) increments if divisible by 10, else 1-unit (0.01) increments
  if (lo % 10 === 0 && hi % 10 === 0) {
    const steps = Math.floor((hi - lo) / 10) + 1;
    return lo + secureRandInt(steps) * 10;
  }
  const steps = hi - lo + 1;
  return lo + secureRandInt(steps);
}

function formatRangeLabel(minUnits: number, maxUnits: number): string {
  const lo = Math.min(minUnits, maxUnits);
  const hi = Math.max(minUnits, maxUnits);
  if (lo === hi) return `+${formatUnits(lo)} pts`;
  return `+${formatUnits(lo)} a +${formatUnits(hi)} pts`;
}

export function computeEffectiveDistribution(
  config: GameConfig,
  stakeUnits: number
): EffectiveDistribution {
  const minBet = Math.max(1, config.minBetUnits);
  const maxThreshold = Math.max(minBet, config.maxBetThresholdUnits);
  const effectiveStake = Math.max(minBet, stakeUnits);

  const progress =
    maxThreshold === minBet
      ? 1
      : clamp((effectiveStake - minBet) / (maxThreshold - minBet), 0, 1);

  const rawBaseWinSum =
    config.tierDecLow +
    config.tierDecMid +
    config.tierDecHi +
    config.tierInt1 +
    config.tierInt2 +
    config.tierInt3 +
    config.tierInt4 +
    config.tierInt5;

  const safeBaseSum = rawBaseWinSum > 0 ? rawBaseWinSum : 40.0;
  const maxWin = clamp(config.maxBetWinPct, 0, 100);
  const minWin = clamp(config.minBetWinPct, 0, maxWin);

  const effectiveWinPct = minWin + progress * (maxWin - minWin);
  const lossPct = Math.max(0, 100 - effectiveWinPct);
  const scaleFactor = effectiveWinPct / safeBaseSum;

  const tierDecLow = config.tierDecLow * scaleFactor;
  const tierDecMid = config.tierDecMid * scaleFactor;
  const tierDecHi = config.tierDecHi * scaleFactor;
  const tierInt1 = config.tierInt1 * scaleFactor;
  const tierInt2 = config.tierInt2 * scaleFactor;
  const tierInt3 = config.tierInt3 * scaleFactor;
  const tierInt4 = config.tierInt4 * scaleFactor;
  const tierInt5 = config.tierInt5 * scaleFactor;

  const integersCombinedPct =
    tierInt1 + tierInt2 + tierInt3 + tierInt4 + tierInt5;

  const pLowMin = config.prizeDecLowMinUnits ?? 10;
  const pLowMax = config.prizeDecLowMaxUnits ?? 30;
  const pMidMin = config.prizeDecMidMinUnits ?? 40;
  const pMidMax = config.prizeDecMidMaxUnits ?? 60;
  const pHiMin = config.prizeDecHiMinUnits ?? 70;
  const pHiMax = config.prizeDecHiMaxUnits ?? 90;
  const pInt1 = config.prizeInt1Units ?? 100;
  const pInt2 = config.prizeInt2Units ?? 200;
  const pInt3 = config.prizeInt3Units ?? 300;
  const pInt4 = config.prizeInt4Units ?? 400;
  const pInt5 = config.prizeInt5Units ?? 500;

  const tiers: EffectiveDistribution['tiers'] = [
    {
      id: 'loss',
      label: '0.00 pts (Pérdida total)',
      category: 'Sin premio',
      pct: lossPct,
      isWin: false,
      isInteger: false,
      color: '#232320',
    },
    {
      id: 'dec_low',
      label: formatRangeLabel(pLowMin, pLowMax),
      category: 'Banda Baja',
      pct: tierDecLow,
      isWin: true,
      isInteger: false,
      color: '#15803D',
    },
    {
      id: 'dec_mid',
      label: formatRangeLabel(pMidMin, pMidMax),
      category: 'Banda Media',
      pct: tierDecMid,
      isWin: true,
      isInteger: false,
      color: '#0D9488',
    },
    {
      id: 'dec_hi',
      label: formatRangeLabel(pHiMin, pHiMax),
      category: 'Banda Alta',
      pct: tierDecHi,
      isWin: true,
      isInteger: false,
      color: '#D97706',
    },
    {
      id: 'int_1',
      label: `+${formatUnits(pInt1)} pts`,
      category: 'Nivel 1',
      pct: tierInt1,
      isWin: true,
      isInteger: true,
      color: '#890149',
    },
    {
      id: 'int_2',
      label: `+${formatUnits(pInt2)} pts`,
      category: 'Raro',
      pct: tierInt2,
      isWin: true,
      isInteger: true,
      color: '#890149',
    },
    {
      id: 'int_3',
      label: `+${formatUnits(pInt3)} pts`,
      category: 'Muy raro',
      pct: tierInt3,
      isWin: true,
      isInteger: true,
      color: '#890149',
    },
    {
      id: 'int_4',
      label: `+${formatUnits(pInt4)} pts`,
      category: 'Épico',
      pct: tierInt4,
      isWin: true,
      isInteger: true,
      color: '#890149',
    },
    {
      id: 'int_5',
      label: `+${formatUnits(pInt5)} pts (Mayor)`,
      category: 'Premio Mayor',
      pct: tierInt5,
      isWin: true,
      isInteger: true,
      isJackpot: true,
      color: '#890149',
    },
  ];

  const donutSegments: DonutSegment[] = [];
  let cursor = 0;

  const pushSeg = (
    id: DonutSegment['id'],
    label: string,
    shortLabel: string,
    pct: number,
    color: string,
    isWin: boolean
  ) => {
    if (pct <= 0) return;
    const sweep = (pct / 100) * 360;
    const startDeg = cursor;
    const endDeg = Math.min(360, cursor + sweep);
    donutSegments.push({
      id,
      label,
      shortLabel,
      pct,
      startDeg,
      endDeg,
      color,
      isWin,
    });
    cursor = endDeg;
  };

  pushSeg(
    'win_integers',
    `Mayores (+${formatUnits(pInt1)}–${formatUnits(pInt5)} pts)`,
    `+${formatUnits(pInt1)}–${formatUnits(pInt5)}`,
    integersCombinedPct,
    '#890149',
    true
  );
  pushSeg(
    'dec_hi',
    `Banda Alta (${formatRangeLabel(pHiMin, pHiMax)})`,
    `+${formatUnits(pHiMin)}–${formatUnits(pHiMax)}`,
    tierDecHi,
    '#D97706',
    true
  );
  pushSeg(
    'dec_mid',
    `Banda Media (${formatRangeLabel(pMidMin, pMidMax)})`,
    `+${formatUnits(pMidMin)}–${formatUnits(pMidMax)}`,
    tierDecMid,
    '#0D9488',
    true
  );
  pushSeg(
    'dec_low',
    `Banda Baja (${formatRangeLabel(pLowMin, pLowMax)})`,
    `+${formatUnits(pLowMin)}–${formatUnits(pLowMax)}`,
    tierDecLow,
    '#15803D',
    true
  );
  pushSeg(
    'loss',
    'Zona sin premio (0.00 pts)',
    'Sin premio',
    Math.max(0, 100 - (cursor / 360) * 100),
    '#232320',
    false
  );

  return {
    effectiveWinPct,
    lossPct,
    scaleFactor,
    tiers,
    donutSegments,
  };
}

function pickAngleInSegment(
  segments: DonutSegment[],
  segId: DonutSegment['id']
): number {
  const seg = segments.find((s) => s.id === segId);
  if (!seg) return 180;
  const span = seg.endDeg - seg.startDeg;
  if (span <= 0.4) {
    return seg.startDeg + span / 2;
  }
  const pad = Math.min(1.5, span * 0.15);
  const innerSpan = Math.max(0.1, span - pad * 2);
  const randRatio = secureRandInt(10000) / 10000;
  return seg.startDeg + pad + randRatio * innerSpan;
}

export function rollSpinOutcome(
  config: GameConfig,
  stakeUnits: number
): SpinOutcome {
  const dist = computeEffectiveDistribution(config, stakeUnits);
  const totalStates = 100000;
  const n = secureRandInt(totalStates);

  const getTierPct = (id: TierId) =>
    dist.tiers.find((t) => t.id === id)?.pct ?? 0;

  const cInt5 = Math.round((getTierPct('int_5') / 100) * totalStates);
  const cInt4 = cInt5 + Math.round((getTierPct('int_4') / 100) * totalStates);
  const cInt3 = cInt4 + Math.round((getTierPct('int_3') / 100) * totalStates);
  const cInt2 = cInt3 + Math.round((getTierPct('int_2') / 100) * totalStates);
  const cInt1 = cInt2 + Math.round((getTierPct('int_1') / 100) * totalStates);
  const cDecHi = cInt1 + Math.round((getTierPct('dec_hi') / 100) * totalStates);
  const cDecMid =
    cDecHi + Math.round((getTierPct('dec_mid') / 100) * totalStates);
  const cDecLow =
    cDecMid + Math.round((getTierPct('dec_low') / 100) * totalStates);

  const pLowMin = config.prizeDecLowMinUnits ?? 10;
  const pLowMax = config.prizeDecLowMaxUnits ?? 30;
  const pMidMin = config.prizeDecMidMinUnits ?? 40;
  const pMidMax = config.prizeDecMidMaxUnits ?? 60;
  const pHiMin = config.prizeDecHiMinUnits ?? 70;
  const pHiMax = config.prizeDecHiMaxUnits ?? 90;
  const pInt1 = config.prizeInt1Units ?? 100;
  const pInt2 = config.prizeInt2Units ?? 200;
  const pInt3 = config.prizeInt3Units ?? 300;
  const pInt4 = config.prizeInt4Units ?? 400;
  const pInt5 = config.prizeInt5Units ?? 500;

  if (n < cInt5) {
    return {
      tierId: 'int_5',
      units: pInt5,
      isLoss: false,
      isInteger: true,
      isJackpot: true,
      desc: `Premio Mayor · +${formatUnits(pInt5)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'win_integers'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cInt4) {
    return {
      tierId: 'int_4',
      units: pInt4,
      isLoss: false,
      isInteger: true,
      isJackpot: false,
      desc: `Premio Épico · +${formatUnits(pInt4)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'win_integers'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cInt3) {
    return {
      tierId: 'int_3',
      units: pInt3,
      isLoss: false,
      isInteger: true,
      isJackpot: false,
      desc: `Premio Muy Raro · +${formatUnits(pInt3)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'win_integers'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cInt2) {
    return {
      tierId: 'int_2',
      units: pInt2,
      isLoss: false,
      isInteger: true,
      isJackpot: false,
      desc: `Premio Raro · +${formatUnits(pInt2)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'win_integers'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cInt1) {
    return {
      tierId: 'int_1',
      units: pInt1,
      isLoss: false,
      isInteger: true,
      isJackpot: false,
      desc: `Premio Nivel 1 · +${formatUnits(pInt1)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'win_integers'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cDecHi) {
    const u = randomUnitsInRange(pHiMin, pHiMax);
    return {
      tierId: 'dec_hi',
      units: u,
      isLoss: false,
      isInteger: false,
      isJackpot: false,
      desc: `Banda alta · +${formatUnits(u)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'dec_hi'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cDecMid) {
    const u = randomUnitsInRange(pMidMin, pMidMax);
    return {
      tierId: 'dec_mid',
      units: u,
      isLoss: false,
      isInteger: false,
      isJackpot: false,
      desc: `Banda media · +${formatUnits(u)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'dec_mid'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }
  if (n < cDecLow) {
    const u = randomUnitsInRange(pLowMin, pLowMax);
    return {
      tierId: 'dec_low',
      units: u,
      isLoss: false,
      isInteger: false,
      isJackpot: false,
      desc: `Banda baja · +${formatUnits(u)} pts`,
      targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'dec_low'),
      effectiveWinPct: dist.effectiveWinPct,
    };
  }

  return {
    tierId: 'loss',
    units: 0,
    isLoss: true,
    isInteger: false,
    isJackpot: false,
    desc: 'Sin premio · Pozo a 0.00 pts',
    targetAngleDeg: pickAngleInSegment(dist.donutSegments, 'loss'),
    effectiveWinPct: dist.effectiveWinPct,
  };
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function getBettingWindowState(
  timer: TimerSettings,
  nowMs: number
): BettingWindowState {
  if (!timer.bettingEnabled) {
    return {
      status: 'disabled',
      canPlaceBet: false,
      label: 'Apuestas pausadas',
      detail: 'El administrador ha pausado temporalmente las apuestas para este grupo.',
      remainingMs: null,
    };
  }

  const startMs = timer.bettingStartAt ? timer.bettingStartAt.toMillis() : null;
  const endMs = timer.bettingEndAt ? timer.bettingEndAt.toMillis() : null;

  if (startMs !== null && nowMs < startMs) {
    const remainingMs = startMs - nowMs;
    return {
      status: 'upcoming',
      canPlaceBet: false,
      label: `Inicia en ${formatCountdown(remainingMs)}`,
      detail: `Ventana programada para las ${new Date(startMs).toLocaleTimeString('es-GT', {
        hour: '2-digit',
        minute: '2-digit',
      })}.`,
      remainingMs,
    };
  }

  if (endMs !== null && nowMs >= endMs) {
    return {
      status: 'ended',
      canPlaceBet: false,
      label: 'Tiempo finalizado',
      detail: 'La ventana de apuestas ha terminado. Espera a que el administrador abra una nueva ronda.',
      remainingMs: 0,
    };
  }

  if (endMs !== null) {
    const remainingMs = endMs - nowMs;
    return {
      status: 'open',
      canPlaceBet: true,
      label: `Tiempo restante · ${formatCountdown(remainingMs)}`,
      detail: `Cierra a las ${new Date(endMs).toLocaleTimeString('es-GT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}.`,
      remainingMs,
    };
  }

  return {
    status: 'open',
    canPlaceBet: true,
    label: 'Apuestas abiertas',
    detail: 'Mesa activa sin límite de tiempo establecido.',
    remainingMs: null,
  };
}
