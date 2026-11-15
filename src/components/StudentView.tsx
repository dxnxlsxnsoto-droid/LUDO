import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Gift,
  Infinity as InfinityIcon,
  Lock,
  Play,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  computeEffectiveDistribution,
  DEFAULT_REWARDS,
  formatUnits,
  getBettingWindowState,
  rollSpinOutcome,
} from '../engine/probability';
import type {
  GameConfig,
  PointMovement,
  RewardItem,
  RewardRedemption,
  SpinOutcome,
  StudentGroup,
  UserAccount,
} from '../types/game';
import { DonutWheel } from './DonutWheel';
import { ProbabilityMatrixTab } from './ProbabilityMatrixTab';

interface StudentViewProps {
  account: UserAccount;
  config: GameConfig;
}

type StudentTab = 'ruleta' | 'premios' | 'probabilidades';

export const StudentView: React.FC<StudentViewProps> = ({
  account,
  config,
}) => {
  const [activeTab, setActiveTab] = useState<StudentTab>('ruleta');
  const [selectedBetUnits, setSelectedBetUnits] = useState<number>(
    Math.max(1, config.minBetUnits)
  );
  const [customBetText, setCustomBetText] = useState<string>('');
  const [movements, setMovements] = useState<PointMovement[]>([]);
  const [studentGroup, setStudentGroup] = useState<StudentGroup | null>(null);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<RewardRedemption[]>([]);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [updatingTargetId, setUpdatingTargetId] = useState<string | null>(null);
  const [redeemSuccessMsg, setRedeemSuccessMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Wheel animation & pending reveal states
  const [isSpinning, setIsSpinning] = useState(false);
  const [needleAngleDeg, setNeedleAngleDeg] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<SpinOutcome | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string>(
    'Ajusta tu apuesta y gira la ruleta 2D. Si la aguja cae en la zona resaltada, ganas puntos.'
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCashingOut, setIsCashingOut] = useState(false);

  const [frozenDisplay, setFrozenDisplay] = useState<{
    balanceUnits: number;
    potUnits: number;
    streak: number;
  } | null>(null);

  const spinTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSelectedBetUnits((prev) =>
      prev < config.minBetUnits ? config.minBetUnits : prev
    );
  }, [config.minBetUnits]);

  // Subscribe to student's assigned group (for per-group countdown timer)
  useEffect(() => {
    if (!account.groupId) {
      setStudentGroup(null);
      return;
    }
    const groupPath = `groups/${account.groupId}`;
    const unsub = onSnapshot(
      doc(db, 'groups', account.groupId),
      (snap) => {
        if (snap.exists()) {
          setStudentGroup(snap.data() as StudentGroup);
        } else {
          setStudentGroup(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, groupPath)
    );
    return () => unsub();
  }, [account.groupId]);

  // Subscribe to movement ledger
  useEffect(() => {
    const path = `users/${account.uid}/movements`;
    const q = query(
      collection(db, 'users', account.uid, 'movements'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: PointMovement[] = snap.docs.map((d) => ({
          ...(d.data() as PointMovement),
          id: d.id,
        }));
        setMovements(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [account.uid]);

  // Subscribe to rewards catalog
  useEffect(() => {
    const q = query(collection(db, 'rewards'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setRewards(DEFAULT_REWARDS);
        } else {
          setRewards(snap.docs.map((d) => d.data() as RewardItem));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'rewards')
    );
    return () => unsub();
  }, []);

  // Subscribe to student's own reward redemptions
  useEffect(() => {
    const q = query(
      collection(db, 'redemptions'),
      where('userId', '==', account.uid),
      limit(40)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as RewardRedemption);
        items.sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
        );
        setMyRedemptions(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'redemptions')
    );
    return () => unsub();
  }, [account.uid]);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current !== null) {
        window.clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  const displayBalance = frozenDisplay
    ? frozenDisplay.balanceUnits
    : account.balanceUnits;
  const displayPot = frozenDisplay ? frozenDisplay.potUnits : account.potUnits;
  const displayStreak = frozenDisplay ? frozenDisplay.streak : account.streak;

  const inRound = displayPot > 0;
  const activeStakeUnits = inRound ? displayPot : selectedBetUnits;

  const distribution = useMemo(
    () => computeEffectiveDistribution(config, activeStakeUnits),
    [config, activeStakeUnits]
  );

  // Use group timer if student belongs to a group; otherwise fall back to global config timer
  const activeTimerSettings = studentGroup ?? config;
  const windowState = useMemo(
    () => getBettingWindowState(activeTimerSettings, nowMs),
    [activeTimerSettings, nowMs]
  );

  const hasEnoughBalance =
    inRound ||
    (selectedBetUnits >= config.minBetUnits &&
      selectedBetUnits <= account.balanceUnits);

  const canSpin =
    !isSpinning &&
    !isCashingOut &&
    windowState.canPlaceBet &&
    hasEnoughBalance;

  const presetValuesUnits = useMemo(() => {
    const base = [
      config.minBetUnits,
      Math.max(config.minBetUnits, 5),
      Math.max(config.minBetUnits, 10),
      Math.max(config.minBetUnits, 25),
      Math.max(config.minBetUnits, 100),
    ];
    return Array.from(new Set(base)).sort((a, b) => a - b);
  }, [config.minBetUnits]);

  const handleSpin = async () => {
    if (!canSpin) return;
    setActionError(null);

    const stakeForSpin = inRound ? account.potUnits : selectedBetUnits;
    if (!inRound && stakeForSpin < config.minBetUnits) {
      setActionError(
        `La apuesta mínima actual es ${formatUnits(config.minBetUnits)} pts.`
      );
      return;
    }
    if (!inRound && stakeForSpin > account.balanceUnits) {
      setActionError('Saldo insuficiente para ejecutar esta apuesta.');
      return;
    }

    const outcome = rollSpinOutcome(config, stakeForSpin);

    setFrozenDisplay({
      balanceUnits: inRound
        ? account.balanceUnits
        : account.balanceUnits - stakeForSpin,
      potUnits: stakeForSpin,
      streak: account.streak,
    });
    setIsSpinning(true);
    setFeedbackMsg(
      `Girando ruleta con ${formatUnits(stakeForSpin)} pts (${outcome.effectiveWinPct.toFixed(2)}% de ganar)...`
    );

    const currentFullTurns = Math.floor(needleAngleDeg / 360);
    const nextAngle = (currentFullTurns + 6) * 360 + outcome.targetAngleDeg;
    setNeedleAngleDeg(nextAngle);

    const userRef = doc(db, 'users', account.uid);
    const movementRef = doc(collection(db, 'users', account.uid, 'movements'));

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) {
          throw new Error('Cuenta de usuario no encontrada.');
        }
        const current = snap.data() as UserAccount;
        const openingNewRound = current.potUnits === 0;

        if (openingNewRound) {
          if (stakeForSpin < config.minBetUnits) {
            throw new Error('La apuesta es menor al mínimo permitido.');
          }
          if (current.balanceUnits < stakeForSpin) {
            throw new Error('Saldo insuficiente.');
          }
        }

        const nextBalance = openingNewRound
          ? current.balanceUnits - stakeForSpin
          : current.balanceUnits;
        const basePot = openingNewRound ? stakeForSpin : current.potUnits;
        const nextPot = outcome.isLoss ? 0 : basePot + outcome.units;
        const nextStreak = outcome.isLoss ? 0 : current.streak + 1;
        const nextTotalWagered = openingNewRound
          ? current.totalWageredUnits + stakeForSpin
          : current.totalWageredUnits;
        const nextBestPrize =
          !outcome.isLoss && outcome.units > current.bestPrizeUnits
            ? outcome.units
            : current.bestPrizeUnits;

        tx.update(userRef, {
          balanceUnits: nextBalance,
          potUnits: nextPot,
          streak: nextStreak,
          totalSpins: current.totalSpins + 1,
          totalWageredUnits: nextTotalWagered,
          bestPrizeUnits: nextBestPrize,
          updatedAt: serverTimestamp(),
        });

        tx.set(movementRef, {
          id: movementRef.id,
          userId: account.uid,
          type: outcome.isLoss ? 'spin_loss' : 'spin_win',
          title: outcome.isLoss
            ? 'Sin premio · Pérdida de ronda'
            : outcome.isInteger
              ? `Premio Entero (+${formatUnits(outcome.units)} pts)`
              : `Premio Décimas (+${formatUnits(outcome.units)} pts)`,
          subtitle: outcome.isLoss
            ? `En riesgo: ${formatUnits(basePot)} pts · Prob. ganar ${outcome.effectiveWinPct.toFixed(1)}%`
            : `Pozo acumulado: ${formatUnits(nextPot)} pts · Prob. ${outcome.effectiveWinPct.toFixed(1)}%`,
          deltaUnits: outcome.isLoss ? -basePot : outcome.units,
          stakeUnits: basePot,
          winProbPct: Number(outcome.effectiveWinPct.toFixed(2)),
          createdBy: account.uid,
          createdAt: serverTimestamp(),
        });
      });
    } catch (err) {
      setIsSpinning(false);
      setFrozenDisplay(null);
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, `users/${account.uid}`);
      }
      setActionError(
        err instanceof Error ? err.message : 'Error al registrar la tirada.'
      );
      return;
    }

    spinTimeoutRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setFrozenDisplay(null);
      setLastOutcome(outcome);
      if (outcome.isLoss) {
        setFeedbackMsg(
          `La aguja cayó en la zona sin premio. Perdiste ${formatUnits(stakeForSpin)} pts acumulados.`
        );
      } else {
        setFeedbackMsg(
          `${outcome.desc}. Pozo actual: ${formatUnits(stakeForSpin + outcome.units)} pts. Decide si arriesgar o retirar al saldo.`
        );
      }
    }, 3450);
  };

  const handleCashout = async () => {
    if (isSpinning || isCashingOut || account.potUnits <= 0) return;
    setIsCashingOut(true);
    setActionError(null);

    const userRef = doc(db, 'users', account.uid);
    const movementRef = doc(collection(db, 'users', account.uid, 'movements'));

    try {
      let cashedUnits = 0;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Usuario no encontrado.');
        const current = snap.data() as UserAccount;
        if (current.potUnits <= 0) return;
        cashedUnits = current.potUnits;

        tx.update(userRef, {
          balanceUnits: current.balanceUnits + cashedUnits,
          potUnits: 0,
          streak: 0,
          totalReturnedUnits: current.totalReturnedUnits + cashedUnits,
          updatedAt: serverTimestamp(),
        });

        tx.set(movementRef, {
          id: movementRef.id,
          userId: account.uid,
          type: 'cashout',
          title: 'Retiro al saldo disponible',
          subtitle: `Racha asegurada (${current.streak} tiradas)`,
          deltaUnits: cashedUnits,
          stakeUnits: cashedUnits,
          winProbPct: 100,
          createdBy: account.uid,
          createdAt: serverTimestamp(),
        });
      });
      setLastOutcome(null);
      setFeedbackMsg(
        `Retiro completado: +${formatUnits(cashedUnits)} pts asegurados en tu saldo.`
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${account.uid}`);
      }
      setActionError(
        err instanceof Error ? err.message : 'No se pudo retirar el pozo.'
      );
    } finally {
      setIsCashingOut(false);
    }
  };

  const handleSelectTargetReward = async (rewardId: string | null) => {
    if (updatingTargetId) return;
    setActionError(null);
    setUpdatingTargetId(rewardId ?? 'clear');
    try {
      await updateDoc(doc(db, 'users', account.uid), {
        targetRewardId: rewardId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${account.uid}`);
      }
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar tu objetivo de canje.'
      );
    } finally {
      setUpdatingTargetId(null);
    }
  };

  const handleRedeemReward = async (reward: RewardItem) => {
    if (redeemingId || isSpinning) return;
    setActionError(null);
    setRedeemSuccessMsg(null);

    const rewardStock = typeof reward.stock === 'number' ? reward.stock : -1;
    if (rewardStock === 0) {
      setActionError(`El premio "${reward.title}" está agotado.`);
      return;
    }

    if (account.balanceUnits < reward.costUnits) {
      setActionError(
        `Necesitas ${formatUnits(reward.costUnits)} pts disponibles para canjear "${reward.title}".`
      );
      return;
    }

    setRedeemingId(reward.id);
    const userRef = doc(db, 'users', account.uid);
    const rewardRef = doc(db, 'rewards', reward.id);
    const redemptionRef = doc(collection(db, 'redemptions'));
    const movementRef = doc(collection(db, 'users', account.uid, 'movements'));

    try {
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Usuario no encontrado.');
        const currentUser = userSnap.data() as UserAccount;

        const rewardSnap = await tx.get(rewardRef);
        if (!rewardSnap.exists()) {
          throw new Error(
            'El catálogo aún se está sincronizando. Pide al administrador que abra la pestaña de Premios.'
          );
        }
        const liveReward = rewardSnap.data() as RewardItem;

        if (!liveReward.active) {
          throw new Error('Este premio no está disponible actualmente.');
        }

        const liveStock =
          typeof liveReward.stock === 'number' ? liveReward.stock : -1;
        if (liveStock === 0) {
          throw new Error('Este premio se encuentra agotado.');
        }

        if (currentUser.balanceUnits < liveReward.costUnits) {
          throw new Error('Saldo insuficiente para este canje.');
        }

        const nextBalance = currentUser.balanceUnits - liveReward.costUnits;

        tx.update(userRef, {
          balanceUnits: nextBalance,
          updatedAt: serverTimestamp(),
        });

        if (liveStock > 0) {
          tx.update(rewardRef, {
            stock: liveStock - 1,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(redemptionRef, {
          id: redemptionRef.id,
          userId: account.uid,
          userName: currentUser.displayName,
          groupId: currentUser.groupId ?? null,
          rewardId: liveReward.id,
          rewardTitle: liveReward.title,
          costUnits: liveReward.costUnits,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(movementRef, {
          id: movementRef.id,
          userId: account.uid,
          type: 'reward_redeem',
          title: `Canje: ${liveReward.title}`,
          subtitle: `Saldo restante: ${formatUnits(nextBalance)} pts`,
          deltaUnits: -liveReward.costUnits,
          stakeUnits: liveReward.costUnits,
          winProbPct: 100,
          createdBy: account.uid,
          createdAt: serverTimestamp(),
        });
      });

      setRedeemSuccessMsg(
        `Canje registrado: "${reward.title}" (-${formatUnits(reward.costUnits)} pts). El administrador verificará tu entrega.`
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'redemptions');
      }
      setActionError(
        err instanceof Error ? err.message : 'No se pudo completar el canje.'
      );
    } finally {
      setRedeemingId(null);
    }
  };

  const handleExportCsv = () => {
    const header =
      'Fecha,Tipo,Concepto,Detalle,Variacion_Pts,En_Riesgo_Pts,Prob_Ganar_Pct\n';
    const rows = movements
      .map((m) => {
        const dateStr = m.createdAt ? m.createdAt.toDate().toISOString() : '';
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        return [
          esc(dateStr),
          esc(m.type),
          esc(m.title),
          esc(m.subtitle),
          formatUnits(m.deltaUnits),
          formatUnits(m.stakeUnits),
          m.winProbPct.toFixed(2),
        ].join(',');
      })
      .join('\n');

    const blob = new Blob([header + rows], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ludopata-movimientos-${account.displayName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const netUnits =
    account.totalReturnedUnits + displayPot - account.totalWageredUnits;

  const visibleRewards = rewards.filter((r) => r.active);
  const orderedVisibleRewards = useMemo(() => {
    if (!account.targetRewardId) return visibleRewards;
    const target = visibleRewards.find((r) => r.id === account.targetRewardId);
    if (!target) return visibleRewards;
    return [target, ...visibleRewards.filter((r) => r.id !== account.targetRewardId)];
  }, [visibleRewards, account.targetRewardId]);

  const targetReward = useMemo(() => {
    if (account.targetRewardId) {
      const found = visibleRewards.find((r) => r.id === account.targetRewardId);
      if (found) return found;
    }
    return null;
  }, [visibleRewards, account.targetRewardId]);

  const targetStock = targetReward
    ? typeof targetReward.stock === 'number'
      ? targetReward.stock
      : -1
    : -1;
  const targetInStock = targetStock === -1 || targetStock > 0;
  const targetProgressPct = targetReward
    ? Math.min(100, Math.round((displayBalance / targetReward.costUnits) * 100))
    : 0;
  const targetReady = Boolean(
    targetReward && account.balanceUnits >= targetReward.costUnits && targetInStock
  );

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Sub-navigation + Live Betting Timer Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
        <div className="inline-flex flex-wrap p-1 bg-[#E7E7D8] border border-black/10 rounded-lg self-start gap-1 max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('ruleta')}
            className={`px-3.5 sm:px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'ruleta'
                ? 'bg-white text-[#171717]'
                : 'text-[#4A4A44] hover:text-[#171717]'
            }`}
          >
            Ruleta y Apuestas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('premios')}
            className={`px-3.5 sm:px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'premios'
                ? 'bg-white text-[#171717]'
                : 'text-[#4A4A44] hover:text-[#171717]'
            }`}
          >
            Premios y Canjes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('probabilidades')}
            className={`px-3.5 sm:px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'probabilidades'
                ? 'bg-white text-[#171717]'
                : 'text-[#4A4A44] hover:text-[#171717]'
            }`}
          >
            Probabilidades &amp; Simulador
          </button>
        </div>

        {/* Synchronized Group or Global Countdown Timer */}
        <div
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-bold min-w-0 max-w-full ${
            windowState.status === 'open'
              ? 'bg-white border-[#166534]/30 text-[#166534]'
              : windowState.status === 'upcoming'
                ? 'bg-white border-[#D97706]/40 text-[#B45309]'
                : 'bg-white border-[#890149]/30 text-[#890149]'
          }`}
        >
          {windowState.canPlaceBet ? (
            <Clock className="w-4 h-4 shrink-0" />
          ) : (
            <Lock className="w-4 h-4 shrink-0" />
          )}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {studentGroup && (
              <span className="text-[#171717] font-extrabold truncate">
                {studentGroup.name} ·
              </span>
            )}
            <span className="tabular">{windowState.label}</span>
            <span className="text-[#76766E] font-medium hidden sm:inline truncate">
              · {windowState.detail}
            </span>
          </div>
        </div>
      </div>

      {activeTab === 'probabilidades' && (
        <ProbabilityMatrixTab
          config={config}
          initialStakeUnits={activeStakeUnits}
        />
      )}

      {activeTab === 'premios' && (
        <div className="space-y-6 min-w-0">
          {redeemSuccessMsg && (
            <div className="px-4 py-3 rounded-xl bg-[#166534] text-white text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="break-words">{redeemSuccessMsg}</span>
            </div>
          )}

          {actionError && (
            <div className="px-4 py-3 rounded-xl border border-[#890149]/30 bg-[#890149]/5 text-[#890149] text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="break-words">{actionError}</span>
            </div>
          )}

          {/* Top Highlighted Goal Card in Cherry */}
          <section className="bg-white border-2 border-[#890149]/40 rounded-2xl p-5 sm:p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#890149]/15 mb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                  <Target className="w-4 h-4 shrink-0" />
                  <span>Mi Objetivo de Canje</span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#171717] mt-1">
                  {targetReward
                    ? targetReward.title
                    : 'Elige tu meta de canje'}
                </h2>
              </div>

              <div className="w-full md:w-72 shrink-0">
                <select
                  aria-label="Seleccionar meta de canje"
                  disabled={Boolean(updatingTargetId)}
                  value={account.targetRewardId ?? ''}
                  onChange={(e) =>
                    handleSelectTargetReward(e.target.value || null)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[#890149]/30 bg-[#890149]/[0.04] text-xs font-bold text-[#171717] focus:outline-none focus:border-[#890149]"
                >
                  <option value="">Selecciona tu premio meta...</option>
                  {visibleRewards.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({formatUnits(r.costUnits)} pts)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {targetReward ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#4A4A44] break-words">
                    {targetReward.description}
                  </span>
                  <span className="text-sm font-extrabold tabular text-[#890149] shrink-0">
                    {formatUnits(account.balanceUnits)} /{' '}
                    {formatUnits(targetReward.costUnits)} pts
                  </span>
                </div>

                <div className="h-2.5 w-full bg-[#E7E7D8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${targetProgressPct}%`,
                      backgroundColor: targetReady ? '#166534' : '#890149',
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-[#890149]">
                      {!targetInStock
                        ? 'Premio agotado temporalmente'
                        : targetReady
                          ? '¡Meta alcanzada! Ya puedes canjearlo.'
                          : `Faltan ${formatUnits(Math.max(0, targetReward.costUnits - account.balanceUnits))} pts (${targetProgressPct}%)`}
                    </span>
                    <span className="text-[#76766E] font-semibold">
                      ·{' '}
                      {targetStock === -1
                        ? 'Stock ilimitado'
                        : targetStock === 0
                          ? 'Agotado'
                          : `Stock: ${targetStock}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={Boolean(updatingTargetId)}
                      onClick={() => handleSelectTargetReward(null)}
                      className="px-3 py-1.5 rounded-lg border border-black/15 hover:border-[#890149] text-xs font-bold text-[#4A4A44] hover:text-[#890149]"
                    >
                      Quitar meta
                    </button>
                    {targetReady && (
                      <button
                        type="button"
                        disabled={redeemingId === targetReward.id || isSpinning}
                        onClick={() => handleRedeemReward(targetReward)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>Canjear ahora</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#4A4A44]">
                Selecciona un premio en el menú desplegable o pulsa{' '}
                <span className="font-bold text-[#890149]">Fijar objetivo</span>{' '}
                en cualquier tarjeta para verlo resaltado aquí y en el panel de la ruleta.
              </p>
            )}
          </section>

          <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-black/10 mb-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                  Catálogo de Recompensas
                </p>
                <h2 className="text-2xl font-extrabold tracking-tight mt-1">
                  Canje de Puntos por Premios
                </h2>
                <p className="text-sm text-[#4A4A44] mt-1">
                  Elige tu objetivo de canje favorito para seguir tu progreso desde la ruleta o canjea directamente cuando alcances los puntos.
                </p>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-[#FAFAF5] border border-black/10 text-right shrink-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                  Tu saldo para canje
                </div>
                <div className="text-xl font-extrabold text-[#171717] tabular">
                  {formatUnits(account.balanceUnits)} pts
                </div>
              </div>
            </div>

            {orderedVisibleRewards.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                No hay premios activos disponibles en este momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderedVisibleRewards.map((reward) => {
                  const stock =
                    typeof reward.stock === 'number' ? reward.stock : -1;
                  const isInfinite = stock === -1;
                  const isOutOfStock = stock === 0;
                  const canAfford = account.balanceUnits >= reward.costUnits;
                  const canRedeem = canAfford && !isOutOfStock;
                  const isRedeeming = redeemingId === reward.id;
                  const isTarget = account.targetRewardId === reward.id;
                  const isUpdatingTarget = updatingTargetId === reward.id;
                  const progressPct = Math.min(
                    100,
                    Math.round((account.balanceUnits / reward.costUnits) * 100)
                  );

                  return (
                    <div
                      key={reward.id}
                      className={`rounded-xl border p-5 flex flex-col justify-between gap-4 min-w-0 ${
                        isTarget
                          ? 'border-2 border-[#890149] bg-[#890149]/[0.05]'
                          : reward.isGrandPrize
                            ? 'border-[#890149]/50 bg-[#890149]/[0.02]'
                            : 'border-black/10 bg-[#FAFAF5]'
                      }`}
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-xs font-extrabold tabular text-[#76766E] mt-0.5 shrink-0">
                              {String(reward.order).padStart(2, '0')}.
                            </span>
                            <h3 className="text-base font-extrabold text-[#171717] break-words">
                              {reward.title}
                            </h3>
                          </div>
                          {reward.isGrandPrize && (
                            <Award className="w-5 h-5 text-[#890149] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#4A4A44] leading-relaxed break-words">
                          {reward.description}
                        </p>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-black/8">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold">
                            {isInfinite ? (
                              <span className="inline-flex items-center gap-1 text-[#4A4A44]">
                                <InfinityIcon className="w-3.5 h-3.5 text-[#890149]" />
                                <span>Stock ilimitado</span>
                              </span>
                            ) : isOutOfStock ? (
                              <span className="text-[#890149] font-extrabold">
                                Agotado (0 disponibles)
                              </span>
                            ) : (
                              <span className="text-[#4A4A44] tabular">
                                Stock disponible: {stock}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-sm font-extrabold tabular ${
                              reward.isGrandPrize
                                ? 'text-[#890149]'
                                : 'text-[#171717]'
                            }`}
                          >
                            {formatUnits(reward.costUnits)} pts
                          </span>
                        </div>

                        <div className="h-1.5 w-full bg-[#E7E7D8] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: canAfford
                                ? '#166534'
                                : '#890149',
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={Boolean(updatingTargetId)}
                            onClick={() =>
                              handleSelectTargetReward(
                                isTarget ? null : reward.id
                              )
                            }
                            className={`py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                              isTarget
                                ? 'bg-[#890149] border-[#890149] text-white'
                                : 'bg-white border-black/15 hover:border-[#890149] hover:text-[#890149] text-[#171717]'
                            }`}
                          >
                            <Target className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isUpdatingTarget
                                ? 'Guardando...'
                                : isTarget
                                  ? 'Objetivo elegido'
                                  : 'Fijar objetivo'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={!canRedeem || isRedeeming || isSpinning}
                            onClick={() => handleRedeemReward(reward)}
                            className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                              canRedeem
                                ? 'bg-[#890149] hover:bg-[#6f013b] text-white'
                                : 'bg-white border border-black/15 text-[#76766E] cursor-not-allowed'
                            }`}
                          >
                            <Gift className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {isRedeeming
                                ? 'Procesando...'
                                : isOutOfStock
                                  ? 'Agotado'
                                  : canAfford
                                    ? `Canjear`
                                    : `Faltan ${formatUnits(reward.costUnits - account.balanceUnits)}`}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Student's Redemption History */}
          <section className="bg-white border border-black/10 rounded-2xl p-6">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
                Mis Canjes Realizados
              </p>
              <h3 className="text-lg font-extrabold tracking-tight mt-0.5">
                Historial de Premios Solicitados
              </h3>
            </div>

            {myRedemptions.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                Todavía no has canjeado ningún premio.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                      <th className="py-2.5 px-3">Premio</th>
                      <th className="py-2.5 px-3 text-right">Puntos</th>
                      <th className="py-2.5 px-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/8">
                    {myRedemptions.map((red) => (
                      <tr key={red.id}>
                        <td className="py-3 px-3 font-bold text-[#171717]">
                          {red.rewardTitle}
                        </td>
                        <td className="py-3 px-3 text-right font-bold tabular text-[#890149]">
                          -{formatUnits(red.costUnits)} pts
                        </td>
                        <td className="py-3 px-3 text-right text-xs font-bold">
                          <span
                            className={
                              red.status === 'delivered'
                                ? 'text-[#166534]'
                                : 'text-[#B45309]'
                            }
                          >
                            {red.status === 'delivered'
                              ? 'Entregado'
                              : 'Pendiente de entrega'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'ruleta' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
          {/* LEFT: 2D Donut Roulette & Controls */}
          <section className="lg:col-span-7 bg-white border border-black/10 rounded-2xl p-5 sm:p-7 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
                  Ruleta de Probabilidades 2D
                </p>
                <h2 className="text-lg font-extrabold tracking-tight mt-0.5 break-words">
                  {inRound
                    ? `Ronda en curso · Pozo ${formatUnits(displayPot)} pts`
                    : 'Configura tu apuesta y gira la aguja'}
                </h2>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                  Racha actual
                </div>
                <div className="text-sm font-extrabold text-[#171717] tabular">
                  {displayStreak} {displayStreak === 1 ? 'tirada' : 'tiradas'}
                </div>
              </div>
            </div>

            <div className="py-4 px-2 rounded-xl bg-[#FAFAF5] border border-black/8 mb-6 overflow-hidden">
              <DonutWheel
                segments={distribution.donutSegments}
                effectiveWinPct={distribution.effectiveWinPct}
                stakeUnits={activeStakeUnits}
                needleAngleDeg={needleAngleDeg}
                isSpinning={isSpinning}
                lastOutcome={lastOutcome}
              />
            </div>

            <div
              className={`mb-6 px-4 py-3 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
                lastOutcome && !isSpinning
                  ? lastOutcome.isLoss
                    ? 'bg-[#FAFAF5] border-black/15 text-[#4A4A44]'
                    : lastOutcome.isInteger
                      ? 'bg-[#890149]/5 border-[#890149]/25 text-[#890149]'
                      : 'bg-[#166534]/5 border-[#166534]/25 text-[#166534]'
                  : 'bg-[#FAFAF5] border-black/10 text-[#4A4A44]'
              }`}
            >
              <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{feedbackMsg}</span>
            </div>

            {actionError && (
              <div className="mb-5 px-4 py-3 rounded-xl border border-[#890149]/30 bg-[#890149]/5 text-[#890149] text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="break-words">{actionError}</span>
              </div>
            )}

            {!inRound && (
              <div className="space-y-4 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <span className="text-[#4A4A44]">
                    Selecciona tu apuesta (Mín. {formatUnits(config.minBetUnits)}{' '}
                    pts)
                  </span>
                  <span className="text-[#890149] tabular">
                    Zona ganadora: {distribution.effectiveWinPct.toFixed(2)}%
                  </span>
                </div>

                {account.balanceUnits >= config.minBetUnits && (
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={config.minBetUnits}
                      max={Math.max(
                        config.minBetUnits,
                        Math.min(
                          account.balanceUnits,
                          Math.max(
                            config.maxBetThresholdUnits,
                            account.balanceUnits
                          )
                        )
                      )}
                      step={1}
                      disabled={isSpinning}
                      value={Math.min(selectedBetUnits, account.balanceUnits)}
                      onChange={(e) => {
                        setCustomBetText('');
                        setSelectedBetUnits(parseInt(e.target.value, 10));
                      }}
                      className="w-full accent-[#890149] cursor-pointer"
                    />
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] font-medium text-[#76766E] tabular">
                      <span>Mín: {formatUnits(config.minBetUnits)} pts</span>
                      <span>
                        Escala máxima ({config.maxBetWinPct.toFixed(0)}%):{' '}
                        {formatUnits(config.maxBetThresholdUnits)} pts
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {presetValuesUnits.map((valUnits) => {
                    const selected =
                      selectedBetUnits === valUnits && customBetText === '';
                    return (
                      <button
                        key={valUnits}
                        type="button"
                        disabled={isSpinning || valUnits > account.balanceUnits}
                        onClick={() => {
                          setCustomBetText('');
                          setSelectedBetUnits(valUnits);
                        }}
                        className={`py-2.5 px-2 rounded-lg border text-xs font-bold tabular transition-colors disabled:opacity-35 ${
                          selected
                            ? 'bg-[#171717] border-[#171717] text-white'
                            : 'bg-white border-black/15 hover:border-[#171717] text-[#171717]'
                        }`}
                      >
                        {formatUnits(valUnits)}
                      </button>
                    );
                  })}

                  <input
                    type="number"
                    min={(config.minBetUnits / 100).toFixed(2)}
                    step="0.01"
                    disabled={isSpinning}
                    value={customBetText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomBetText(raw);
                      const parsed = parseFloat(raw);
                      if (!Number.isNaN(parsed) && parsed > 0) {
                        setSelectedBetUnits(Math.round(parsed * 100));
                      }
                    }}
                    placeholder="Otro"
                    aria-label="Monto de apuesta personalizado"
                    className="w-full min-w-0 py-2 px-2 rounded-lg border border-black/15 focus:border-[#890149] focus:outline-none text-xs font-bold text-center tabular bg-[#FAFAF5]"
                  />
                </div>
              </div>
            )}

            {!inRound && account.balanceUnits < config.minBetUnits && (
              <div className="mb-5 p-4 rounded-xl border border-[#890149]/25 bg-[#890149]/5 text-xs font-semibold text-[#890149]">
                Saldo disponible insuficiente (
                {formatUnits(account.balanceUnits)} pts). Necesitas al menos{' '}
                <span className="font-extrabold tabular">
                  {formatUnits(config.minBetUnits)} pts
                </span>{' '}
                asignados por el administrador para poder girar la ruleta.
              </div>
            )}

            <div
              className={`grid gap-3 ${
                inRound ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <button
                type="button"
                disabled={!canSpin}
                onClick={handleSpin}
                className="py-3.5 px-5 rounded-xl bg-[#890149] hover:bg-[#6f013b] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-45"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {isSpinning
                    ? 'Girando aguja...'
                    : !windowState.canPlaceBet
                      ? windowState.label
                      : inRound
                        ? `Arriesgar Pozo (${formatUnits(displayPot)} pts)`
                        : `Girar Ruleta (${formatUnits(selectedBetUnits)} pts)`}
                </span>
              </button>

              {inRound && (
                <button
                  type="button"
                  disabled={isSpinning || isCashingOut}
                  onClick={handleCashout}
                  className="py-3.5 px-5 rounded-xl border border-[#171717] bg-white hover:bg-[#171717] hover:text-white text-[#171717] text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-45"
                >
                  <ArrowDownToLine className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {isCashingOut
                      ? 'Retirando...'
                      : `Retirar ${formatUnits(displayPot)} pts`}
                  </span>
                </button>
              )}
            </div>
          </section>

          {/* RIGHT: Target Redemption Goal, KPIs & Movement Ledger */}
          <aside className="lg:col-span-5 space-y-5 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
                  Saldo Disponible
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#171717] tabular mt-1 truncate">
                  {formatUnits(displayBalance)}{' '}
                  <span className="text-xs font-semibold text-[#76766E]">
                    pts
                  </span>
                </div>
              </div>
              <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
                  Pozo en Juego
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#890149] tabular mt-1 truncate">
                  {formatUnits(displayPot)}{' '}
                  <span className="text-xs font-semibold text-[#76766E]">
                    pts
                  </span>
                </div>
              </div>
              <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
                  Resultado Neto
                </div>
                <div className="text-lg font-extrabold text-[#171717] tabular mt-1 truncate">
                  {netUnits > 0 ? '+' : ''}
                  {formatUnits(netUnits)} pts
                </div>
              </div>
              <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
                  Tiradas / Máx.
                </div>
                <div className="text-lg font-extrabold text-[#171717] tabular mt-1 truncate">
                  {account.totalSpins} ·{' '}
                  <span className="text-[#890149]">
                    {formatUnits(account.bestPrizeUnits)}
                  </span>
                </div>
              </div>
            </div>

            {/* Mi Objetivo de Canje Card */}
            <section
              className={`rounded-2xl p-5 space-y-3 min-w-0 overflow-hidden border ${
                targetReward
                  ? 'bg-white border-2 border-[#890149]/40'
                  : 'bg-white border-black/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#890149]">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>Mi Objetivo de Canje</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('premios')}
                  className="text-[11px] font-bold text-[#76766E] hover:text-[#171717] underline"
                >
                  Ver catálogo
                </button>
              </div>

              <div>
                <select
                  aria-label="Elegir premio objetivo"
                  disabled={Boolean(updatingTargetId)}
                  value={account.targetRewardId ?? ''}
                  onChange={(e) =>
                    handleSelectTargetReward(e.target.value || null)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold text-[#171717] focus:outline-none focus:border-[#890149]"
                >
                  <option value="">Selecciona tu premio meta...</option>
                  {visibleRewards.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({formatUnits(r.costUnits)} pts)
                    </option>
                  ))}
                </select>
              </div>

              {targetReward ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[#171717] truncate">
                      {targetReward.title}
                    </span>
                    <span className="text-xs font-extrabold tabular text-[#890149] shrink-0">
                      {formatUnits(displayBalance)} /{' '}
                      {formatUnits(targetReward.costUnits)} pts
                    </span>
                  </div>

                  <div className="h-2 w-full bg-[#E7E7D8] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${targetProgressPct}%`,
                        backgroundColor: targetReady ? '#166534' : '#890149',
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-[#4A4A44]">
                      {!targetInStock
                        ? 'Premio agotado temporalmente'
                        : targetReady
                          ? '¡Meta alcanzada! Ya puedes canjearlo.'
                          : `Faltan ${formatUnits(Math.max(0, targetReward.costUnits - displayBalance))} pts (${targetProgressPct}%)`}
                    </span>
                    {targetReady && (
                      <button
                        type="button"
                        disabled={redeemingId === targetReward.id || isSpinning}
                        onClick={() => handleRedeemReward(targetReward)}
                        className="px-3 py-1.5 rounded-md bg-[#166534] hover:bg-[#14532d] text-white font-bold flex items-center gap-1"
                      >
                        <Gift className="w-3 h-3" />
                        <span>Canjear</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#76766E]">
                  Elige uno de los premios del menú para visualizar cuánto te falta para alcanzarlo.
                </p>
              )}
            </section>

            <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-6 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#76766E]">
                    Libro de Movimientos
                  </p>
                  <p className="text-xs text-[#4A4A44] mt-0.5 tabular">
                    {movements.length} registros recientes
                  </p>
                </div>
                {movements.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3 py-1.5 rounded-lg border border-black/15 hover:border-[#171717] text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                )}
              </div>

              {movements.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                  Sin movimientos aún. Cuando el administrador te asigne puntos o gires la ruleta, cada operación aparecerá aquí.
                </div>
              ) : (
                <div className="divide-y divide-black/8 max-h-[380px] overflow-y-auto pr-1">
                  {movements.map((m) => {
                    const isGrant =
                      m.type === 'admin_grant' || m.type === 'admin_adjust';
                    const isLoss =
                      m.type === 'spin_loss' || m.type === 'reward_redeem';
                    const isCashout = m.type === 'cashout';
                    return (
                      <div
                        key={m.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                              isGrant
                                ? 'bg-[#890149]/8 border-[#890149]/25 text-[#890149]'
                                : isLoss
                                  ? 'bg-[#FAFAF5] border-black/10 text-[#76766E]'
                                  : 'bg-[#166534]/8 border-[#166534]/25 text-[#166534]'
                            }`}
                          >
                            {isLoss ? (
                              <X className="w-3.5 h-3.5" />
                            ) : isCashout ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#171717] truncate">
                              {m.title}
                            </div>
                            <div className="text-[11px] text-[#76766E] truncate">
                              {m.subtitle}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`text-xs font-extrabold tabular shrink-0 ${
                            m.deltaUnits > 0
                              ? isGrant
                                ? 'text-[#890149]'
                                : 'text-[#166534]'
                              : 'text-[#76766E]'
                          }`}
                        >
                          {m.deltaUnits > 0 ? '+' : ''}
                          {formatUnits(m.deltaUnits)} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};
