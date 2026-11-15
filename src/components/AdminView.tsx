import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Award,
  CheckCircle2,
  Clock,
  FolderPlus,
  Gift,
  Infinity as InfinityIcon,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Trash2,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  computeEffectiveDistribution,
  DEFAULT_GAME_CONFIG,
  DEFAULT_REWARDS,
  formatUnits,
  getBettingWindowState,
} from '../engine/probability';
import type {
  BlockedUser,
  GameConfig,
  RewardItem,
  RewardRedemption,
  StudentGroup,
  TimerSettings,
  UserAccount,
} from '../types/game';

interface AdminViewProps {
  adminAccount: UserAccount;
  config: GameConfig;
}

type AdminSection =
  | 'alumnos'
  | 'grupos'
  | 'leaderboard'
  | 'premios'
  | 'probabilidades';

function toDatetimeLocalValue(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AdminView: React.FC<AdminViewProps> = ({
  adminAccount,
  config,
}) => {
  const [section, setSection] = useState<AdminSection>('alumnos');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [bulkGroupTarget, setBulkGroupTarget] = useState<string>('');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    {}
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCustomText, setBulkCustomText] = useState('0.01');
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Groups state
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [timerTarget, setTimerTarget] = useState<string>('global'); // 'global' | 'all' | groupId

  // Editable reward drafts: keyed by rewardId
  const [rewardDrafts, setRewardDrafts] = useState<
    Record<
      string,
      {
        title: string;
        description: string;
        costPts: string;
        stock: string;
        active: boolean;
        isGrandPrize: boolean;
      }
    >
  >({});
  const [savingRewardId, setSavingRewardId] = useState<string | null>(null);
  const [deletingRewardId, setDeletingRewardId] = useState<string | null>(null);
  const [confirmDeleteRewardId, setConfirmDeleteRewardId] = useState<
    string | null
  >(null);

  // Add new reward form state
  const [newRewardTitle, setNewRewardTitle] = useState('');
  const [newRewardDesc, setNewRewardDesc] = useState('');
  const [newRewardPts, setNewRewardPts] = useState('10.00');
  const [newRewardStock, setNewRewardStock] = useState('-1');
  const [newRewardIsGrand, setNewRewardIsGrand] = useState(false);
  const [creatingReward, setCreatingReward] = useState(false);

  const hasAutoSeededRewardsRef = useRef(false);

  // Leaderboard filter
  const [leaderboardGroupFilter, setLeaderboardGroupFilter] =
    useState<string>('all');

  // Editable probability & prize config draft states
  const [minBetText, setMinBetText] = useState(
    formatUnits(config.minBetUnits)
  );
  const [maxThresholdText, setMaxThresholdText] = useState(
    formatUnits(config.maxBetThresholdUnits)
  );
  const [minBetWinPctText, setMinBetWinPctText] = useState(
    config.minBetWinPct.toFixed(2)
  );
  const [maxBetWinPctText, setMaxBetWinPctText] = useState(
    config.maxBetWinPct.toFixed(2)
  );
  const [tierDecLowText, setTierDecLowText] = useState(
    String(config.tierDecLow)
  );
  const [tierDecMidText, setTierDecMidText] = useState(
    String(config.tierDecMid)
  );
  const [tierDecHiText, setTierDecHiText] = useState(String(config.tierDecHi));
  const [tierInt1Text, setTierInt1Text] = useState(String(config.tierInt1));
  const [tierInt2Text, setTierInt2Text] = useState(String(config.tierInt2));
  const [tierInt3Text, setTierInt3Text] = useState(String(config.tierInt3));
  const [tierInt4Text, setTierInt4Text] = useState(String(config.tierInt4));
  const [tierInt5Text, setTierInt5Text] = useState(String(config.tierInt5));

  const [prizeDecLowMinText, setPrizeDecLowMinText] = useState(
    formatUnits(config.prizeDecLowMinUnits ?? 10)
  );
  const [prizeDecLowMaxText, setPrizeDecLowMaxText] = useState(
    formatUnits(config.prizeDecLowMaxUnits ?? 30)
  );
  const [prizeDecMidMinText, setPrizeDecMidMinText] = useState(
    formatUnits(config.prizeDecMidMinUnits ?? 40)
  );
  const [prizeDecMidMaxText, setPrizeDecMidMaxText] = useState(
    formatUnits(config.prizeDecMidMaxUnits ?? 60)
  );
  const [prizeDecHiMinText, setPrizeDecHiMinText] = useState(
    formatUnits(config.prizeDecHiMinUnits ?? 70)
  );
  const [prizeDecHiMaxText, setPrizeDecHiMaxText] = useState(
    formatUnits(config.prizeDecHiMaxUnits ?? 90)
  );
  const [prizeInt1Text, setPrizeInt1Text] = useState(
    formatUnits(config.prizeInt1Units ?? 100)
  );
  const [prizeInt2Text, setPrizeInt2Text] = useState(
    formatUnits(config.prizeInt2Units ?? 200)
  );
  const [prizeInt3Text, setPrizeInt3Text] = useState(
    formatUnits(config.prizeInt3Units ?? 300)
  );
  const [prizeInt4Text, setPrizeInt4Text] = useState(
    formatUnits(config.prizeInt4Units ?? 400)
  );
  const [prizeInt5Text, setPrizeInt5Text] = useState(
    formatUnits(config.prizeInt5Units ?? 500)
  );

  const [startInput, setStartInput] = useState(
    toDatetimeLocalValue(config.bettingStartAt)
  );
  const [endInput, setEndInput] = useState(
    toDatetimeLocalValue(config.bettingEndAt)
  );
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    setMinBetText(formatUnits(config.minBetUnits));
    setMaxThresholdText(formatUnits(config.maxBetThresholdUnits));
    setMinBetWinPctText(config.minBetWinPct.toFixed(2));
    setMaxBetWinPctText(config.maxBetWinPct.toFixed(2));
    setTierDecLowText(String(config.tierDecLow));
    setTierDecMidText(String(config.tierDecMid));
    setTierDecHiText(String(config.tierDecHi));
    setTierInt1Text(String(config.tierInt1));
    setTierInt2Text(String(config.tierInt2));
    setTierInt3Text(String(config.tierInt3));
    setTierInt4Text(String(config.tierInt4));
    setTierInt5Text(String(config.tierInt5));
    setPrizeDecLowMinText(formatUnits(config.prizeDecLowMinUnits ?? 10));
    setPrizeDecLowMaxText(formatUnits(config.prizeDecLowMaxUnits ?? 30));
    setPrizeDecMidMinText(formatUnits(config.prizeDecMidMinUnits ?? 40));
    setPrizeDecMidMaxText(formatUnits(config.prizeDecMidMaxUnits ?? 60));
    setPrizeDecHiMinText(formatUnits(config.prizeDecHiMinUnits ?? 70));
    setPrizeDecHiMaxText(formatUnits(config.prizeDecHiMaxUnits ?? 90));
    setPrizeInt1Text(formatUnits(config.prizeInt1Units ?? 100));
    setPrizeInt2Text(formatUnits(config.prizeInt2Units ?? 200));
    setPrizeInt3Text(formatUnits(config.prizeInt3Units ?? 300));
    setPrizeInt4Text(formatUnits(config.prizeInt4Units ?? 400));
    setPrizeInt5Text(formatUnits(config.prizeInt5Units ?? 500));
  }, [config]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Subscriptions: users, groups, rewards, redemptions, blockedUsers
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserAccount));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubGroups = onSnapshot(
      query(collection(db, 'groups'), orderBy('name', 'asc')),
      (snap) => {
        setGroups(snap.docs.map((d) => d.data() as StudentGroup));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groups')
    );

    const unsubRewards = onSnapshot(
      query(collection(db, 'rewards'), orderBy('order', 'asc')),
      async (snap) => {
        if (snap.empty) {
          if (!hasAutoSeededRewardsRef.current) {
            hasAutoSeededRewardsRef.current = true;
            const batch = writeBatch(db);
            DEFAULT_REWARDS.forEach((r) => {
              batch.set(doc(db, 'rewards', r.id), {
                ...r,
                updatedAt: serverTimestamp(),
                updatedBy: adminAccount.uid,
              });
            });
            try {
              await batch.commit();
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, 'rewards');
            }
            return;
          }
          setRewards([]);
          setRewardDrafts({});
          return;
        }

        hasAutoSeededRewardsRef.current = true;
        const list = snap.docs.map((d) => {
          const data = d.data() as RewardItem;
          return {
            ...data,
            stock: typeof data.stock === 'number' ? data.stock : -1,
          };
        });

        // Backfill legacy reward documents missing `stock` field
        const missingStock = snap.docs.filter(
          (d) => typeof (d.data() as Partial<RewardItem>).stock !== 'number'
        );
        if (missingStock.length > 0) {
          const backfill = writeBatch(db);
          missingStock.forEach((d) => {
            backfill.set(
              d.ref,
              {
                ...(d.data() as RewardItem),
                stock: -1,
                updatedAt: serverTimestamp(),
                updatedBy: adminAccount.uid,
              },
              { merge: true }
            );
          });
          backfill.commit().catch(() => {});
        }

        setRewards(list);
        const drafts: Record<
          string,
          {
            title: string;
            description: string;
            costPts: string;
            stock: string;
            active: boolean;
            isGrandPrize: boolean;
          }
        > = {};
        list.forEach((r) => {
          drafts[r.id] = {
            title: r.title,
            description: r.description,
            costPts: formatUnits(r.costUnits),
            stock: String(r.stock),
            active: r.active,
            isGrandPrize: Boolean(r.isGrandPrize),
          };
        });
        setRewardDrafts(drafts);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'rewards')
    );

    const unsubRedemptions = onSnapshot(
      query(collection(db, 'redemptions'), orderBy('createdAt', 'desc')),
      (snap) => {
        setRedemptions(snap.docs.map((d) => d.data() as RewardRedemption));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'redemptions')
    );

    const unsubBlocked = onSnapshot(
      collection(db, 'blockedUsers'),
      (snap) => {
        setBlockedUsers(snap.docs.map((d) => d.data() as BlockedUser));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'blockedUsers')
    );

    return () => {
      unsubUsers();
      unsubGroups();
      unsubRewards();
      unsubRedemptions();
      unsubBlocked();
    };
  }, [adminAccount.uid]);

  // Sync schedule inputs when timerTarget changes
  useEffect(() => {
    if (timerTarget === 'global' || timerTarget === 'all') {
      setStartInput(toDatetimeLocalValue(config.bettingStartAt));
      setEndInput(toDatetimeLocalValue(config.bettingEndAt));
    } else {
      const grp = groups.find((g) => g.id === timerTarget);
      if (grp) {
        setStartInput(toDatetimeLocalValue(grp.bettingStartAt));
        setEndInput(toDatetimeLocalValue(grp.bettingEndAt));
      }
    }
  }, [timerTarget, config, groups]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3600);
  };

  // ONLY students play and hold points (never admins/teachers)
  const students = useMemo(
    () => users.filter((u) => u.role === 'student'),
    [users]
  );

  const groupMap = useMemo(() => {
    const map: Record<string, StudentGroup> = {};
    groups.forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [groups]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students.filter((s) => {
      const matchesTerm =
        !term ||
        s.displayName.toLowerCase().includes(term) ||
        s.email.toLowerCase().includes(term);
      const matchesGroup =
        groupFilter === 'all'
          ? true
          : groupFilter === 'none'
            ? !s.groupId
            : s.groupId === groupFilter;
      return matchesTerm && matchesGroup;
    });
  }, [students, searchTerm, groupFilter]);

  const leaderboardStudents = useMemo(() => {
    const pool =
      leaderboardGroupFilter === 'all'
        ? students
        : leaderboardGroupFilter === 'none'
          ? students.filter((s) => !s.groupId)
          : students.filter((s) => s.groupId === leaderboardGroupFilter);
    return [...pool].sort((a, b) => {
      const totalA = a.balanceUnits + a.potUnits;
      const totalB = b.balanceUnits + b.potUnits;
      if (totalB !== totalA) return totalB - totalA;
      return b.bestPrizeUnits - a.bestPrizeUnits;
    });
  }, [students, leaderboardGroupFilter]);

  const totalBalanceUnits = useMemo(
    () => students.reduce((acc, s) => acc + s.balanceUnits + s.potUnits, 0),
    [students]
  );

  const totalSpinsAll = useMemo(
    () => students.reduce((acc, s) => acc + s.totalSpins, 0),
    [students]
  );

  const globalWindowState = useMemo(
    () => getBettingWindowState(config, nowMs),
    [config, nowMs]
  );

  // Point assignment
  const assignPointsToUser = async (target: UserAccount, deltaUnits: number) => {
    if (deltaUnits === 0) return;
    setErrorMsg(null);
    setBusyUserId(target.uid);

    const userRef = doc(db, 'users', target.uid);
    const movementRef = doc(collection(db, 'users', target.uid, 'movements'));

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Alumno no encontrado.');
        const current = snap.data() as UserAccount;
        const nextBalance = Math.max(0, current.balanceUnits + deltaUnits);
        const appliedDelta = nextBalance - current.balanceUnits;

        tx.update(userRef, {
          balanceUnits: nextBalance,
          updatedAt: serverTimestamp(),
        });

        tx.set(movementRef, {
          id: movementRef.id,
          userId: target.uid,
          type: appliedDelta >= 0 ? 'admin_grant' : 'admin_adjust',
          title:
            appliedDelta >= 0
              ? `Asignación del Administrador (+${formatUnits(appliedDelta)} pts)`
              : `Ajuste del Administrador (${formatUnits(appliedDelta)} pts)`,
          subtitle: `Saldo actualizado: ${formatUnits(nextBalance)} pts`,
          deltaUnits: appliedDelta,
          stakeUnits: 0,
          winProbPct: 100,
          createdBy: adminAccount.uid,
          createdAt: serverTimestamp(),
        });
      });

      showToast(
        `${deltaUnits > 0 ? '+' : ''}${formatUnits(deltaUnits)} pts aplicados a ${target.displayName}.`
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo actualizar el saldo.'
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleBulkAssign = async (
    targetList: UserAccount[],
    deltaUnits: number
  ) => {
    if (targetList.length === 0 || deltaUnits === 0) return;
    setBulkBusy(true);
    setErrorMsg(null);

    try {
      for (const student of targetList) {
        const userRef = doc(db, 'users', student.uid);
        const movementRef = doc(
          collection(db, 'users', student.uid, 'movements')
        );
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          if (!snap.exists()) return;
          const current = snap.data() as UserAccount;
          const nextBalance = Math.max(0, current.balanceUnits + deltaUnits);
          const appliedDelta = nextBalance - current.balanceUnits;
          tx.update(userRef, {
            balanceUnits: nextBalance,
            updatedAt: serverTimestamp(),
          });
          tx.set(movementRef, {
            id: movementRef.id,
            userId: student.uid,
            type: appliedDelta >= 0 ? 'admin_grant' : 'admin_adjust',
            title: `Asignación grupal (${appliedDelta >= 0 ? '+' : ''}${formatUnits(appliedDelta)} pts)`,
            subtitle: `Saldo actualizado: ${formatUnits(nextBalance)} pts`,
            deltaUnits: appliedDelta,
            stakeUnits: 0,
            winProbPct: 100,
            createdBy: adminAccount.uid,
            createdAt: serverTimestamp(),
          });
        });
      }
      showToast(
        `Aplicados ${deltaUnits > 0 ? '+' : ''}${formatUnits(deltaUnits)} pts a ${targetList.length} alumnos.`
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'users');
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error en asignación grupal de puntos.'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  // Delete / Remove student
  const handleRemoveStudent = async (target: UserAccount) => {
    setBusyUserId(target.uid);
    setErrorMsg(null);
    try {
      // Mark blocked so they cannot auto-recreate profile on reload
      await setDoc(doc(db, 'blockedUsers', target.uid), {
        uid: target.uid,
        email: target.email,
        removedAt: serverTimestamp(),
        removedBy: adminAccount.uid,
      });

      // Delete user doc
      await deleteDoc(doc(db, 'users', target.uid));
      setSelectedUids((prev) => prev.filter((id) => id !== target.uid));
      setConfirmDeleteUid(null);
      showToast(`Usuario "${target.displayName}" eliminado del juego.`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.DELETE, `users/${target.uid}`);
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo eliminar al usuario.'
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRestoreBlockedUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'blockedUsers', uid));
      showToast('Acceso restaurado. El alumno podrá volver a ingresar.');
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.DELETE, `blockedUsers/${uid}`);
      }
      setErrorMsg('No se pudo restaurar el acceso.');
    }
  };

  // Assign student to group
  const handleAssignUserGroup = async (uid: string, groupId: string | null) => {
    setBusyUserId(uid);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'users', uid), {
        groupId: groupId || null,
        updatedAt: serverTimestamp(),
      });
      showToast('Grupo actualizado.');
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      }
      setErrorMsg('No se pudo asignar el grupo.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleBulkAssignGroup = async () => {
    if (selectedUids.length === 0) return;
    setBulkBusy(true);
    setErrorMsg(null);
    const targetGroupId = bulkGroupTarget || null;
    try {
      const batch = writeBatch(db);
      selectedUids.forEach((uid) => {
        batch.update(doc(db, 'users', uid), {
          groupId: targetGroupId,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast(
        `${selectedUids.length} alumnos movidos a ${
          targetGroupId ? groupMap[targetGroupId]?.name ?? 'grupo' : 'Sin grupo'
        }.`
      );
      setSelectedUids([]);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, 'users');
      }
      setErrorMsg('Error al agrupar alumnos seleccionados.');
    } finally {
      setBulkBusy(false);
    }
  };

  // Create & delete groups
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newGroupName.trim();
    if (!cleanName) return;
    setCreatingGroup(true);
    setErrorMsg(null);
    try {
      const groupRef = doc(collection(db, 'groups'));
      await setDoc(groupRef, {
        id: groupRef.id,
        name: cleanName.slice(0, 80),
        bettingEnabled: true,
        bettingStartAt: null,
        bettingEndAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: adminAccount.uid,
      });
      setNewGroupName('');
      setTimerTarget(groupRef.id);
      showToast(`Grupo "${cleanName}" creado.`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.CREATE, 'groups');
      }
      setErrorMsg('No se pudo crear el grupo.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (grp: StudentGroup) => {
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const u = d.data() as UserAccount;
        if (u.groupId === grp.id) {
          batch.update(d.ref, { groupId: null, updatedAt: serverTimestamp() });
        }
      });
      batch.delete(doc(db, 'groups', grp.id));
      await batch.commit();
      if (timerTarget === grp.id) setTimerTarget('global');
      if (groupFilter === grp.id) setGroupFilter('all');
      showToast(`Grupo "${grp.name}" eliminado.`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.DELETE, `groups/${grp.id}`);
      }
      setErrorMsg('No se pudo eliminar el grupo.');
    }
  };

  // Timer updates for Global / Specific Group / All Groups
  const applyTimerToTarget = async (
    nextTimer: Partial<TimerSettings>,
    msg: string,
    explicitTarget?: string
  ) => {
    const target = explicitTarget ?? timerTarget;
    setSavingConfig(true);
    setErrorMsg(null);

    try {
      const updateGlobal = async () => {
        await setDoc(doc(db, 'config', 'game'), {
          minBetUnits: config.minBetUnits,
          maxBetThresholdUnits: config.maxBetThresholdUnits,
          minBetWinPct: config.minBetWinPct,
          maxBetWinPct: config.maxBetWinPct,
          tierDecLow: config.tierDecLow,
          tierDecMid: config.tierDecMid,
          tierDecHi: config.tierDecHi,
          tierInt1: config.tierInt1,
          tierInt2: config.tierInt2,
          tierInt3: config.tierInt3,
          tierInt4: config.tierInt4,
          tierInt5: config.tierInt5,
          prizeDecLowMinUnits: config.prizeDecLowMinUnits ?? 10,
          prizeDecLowMaxUnits: config.prizeDecLowMaxUnits ?? 30,
          prizeDecMidMinUnits: config.prizeDecMidMinUnits ?? 40,
          prizeDecMidMaxUnits: config.prizeDecMidMaxUnits ?? 60,
          prizeDecHiMinUnits: config.prizeDecHiMinUnits ?? 70,
          prizeDecHiMaxUnits: config.prizeDecHiMaxUnits ?? 90,
          prizeInt1Units: config.prizeInt1Units ?? 100,
          prizeInt2Units: config.prizeInt2Units ?? 200,
          prizeInt3Units: config.prizeInt3Units ?? 300,
          prizeInt4Units: config.prizeInt4Units ?? 400,
          prizeInt5Units: config.prizeInt5Units ?? 500,
          bettingEnabled:
            nextTimer.bettingEnabled !== undefined
              ? nextTimer.bettingEnabled
              : config.bettingEnabled,
          bettingStartAt:
            nextTimer.bettingStartAt !== undefined
              ? nextTimer.bettingStartAt
              : config.bettingStartAt,
          bettingEndAt:
            nextTimer.bettingEndAt !== undefined
              ? nextTimer.bettingEndAt
              : config.bettingEndAt,
          updatedAt: serverTimestamp(),
          updatedBy: adminAccount.uid,
        });
      };

      if (target === 'global') {
        await updateGlobal();
      } else if (target === 'all') {
        await updateGlobal();
        const batch = writeBatch(db);
        groups.forEach((g) => {
          batch.update(doc(db, 'groups', g.id), {
            bettingEnabled:
              nextTimer.bettingEnabled !== undefined
                ? nextTimer.bettingEnabled
                : g.bettingEnabled,
            bettingStartAt:
              nextTimer.bettingStartAt !== undefined
                ? nextTimer.bettingStartAt
                : g.bettingStartAt,
            bettingEndAt:
              nextTimer.bettingEndAt !== undefined
                ? nextTimer.bettingEndAt
                : g.bettingEndAt,
            updatedAt: serverTimestamp(),
            updatedBy: adminAccount.uid,
          });
        });
        await batch.commit();
      } else {
        const grp = groups.find((g) => g.id === target);
        if (grp) {
          await updateDoc(doc(db, 'groups', grp.id), {
            bettingEnabled:
              nextTimer.bettingEnabled !== undefined
                ? nextTimer.bettingEnabled
                : grp.bettingEnabled,
            bettingStartAt:
              nextTimer.bettingStartAt !== undefined
                ? nextTimer.bettingStartAt
                : grp.bettingStartAt,
            bettingEndAt:
              nextTimer.bettingEndAt !== undefined
                ? nextTimer.bettingEndAt
                : grp.bettingEndAt,
            updatedAt: serverTimestamp(),
            updatedBy: adminAccount.uid,
          });
        }
      }
      showToast(msg);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'groups/config');
      }
      setErrorMsg('No se pudo actualizar el cronómetro.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Reward CRUD & redemptions
  const parseStockValue = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return -1;
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed < -1 || parsed > 1000000) {
      return null;
    }
    return parsed;
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newRewardTitle.trim().slice(0, 100);
    if (!title) {
      setErrorMsg('Ingresa un título para el nuevo premio.');
      return;
    }
    const parsedPts = parseFloat(newRewardPts);
    if (Number.isNaN(parsedPts) || parsedPts <= 0) {
      setErrorMsg('El valor en puntos debe ser mayor a 0.00.');
      return;
    }
    const stockVal = parseStockValue(newRewardStock);
    if (stockVal === null) {
      setErrorMsg('El stock debe ser -1 (infinito) o un número entero mayor o igual a 0.');
      return;
    }

    setCreatingReward(true);
    setErrorMsg(null);
    const costUnits = Math.min(100000000, Math.max(1, Math.round(parsedPts * 100)));
    const nextOrder = Math.min(
      500,
      rewards.reduce((max, r) => Math.max(max, r.order), 0) + 1
    );
    const rewardRef = doc(collection(db, 'rewards'));

    try {
      await setDoc(rewardRef, {
        id: rewardRef.id,
        order: nextOrder,
        title,
        description: newRewardDesc.trim().slice(0, 240),
        costUnits,
        stock: stockVal,
        active: true,
        isGrandPrize: newRewardIsGrand,
        updatedAt: serverTimestamp(),
        updatedBy: adminAccount.uid,
      });
      setNewRewardTitle('');
      setNewRewardDesc('');
      setNewRewardPts('10.00');
      setNewRewardStock('-1');
      setNewRewardIsGrand(false);
      showToast(`Premio "${title}" agregado (${formatUnits(costUnits)} pts).`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.CREATE, 'rewards');
      }
      setErrorMsg('No se pudo agregar el premio.');
    } finally {
      setCreatingReward(false);
    }
  };

  const handleSaveReward = async (reward: RewardItem) => {
    const draft = rewardDrafts[reward.id];
    if (!draft) return;
    const parsedPts = parseFloat(draft.costPts);
    if (Number.isNaN(parsedPts) || parsedPts <= 0) {
      setErrorMsg('El valor en puntos del premio debe ser mayor a 0.00.');
      return;
    }
    const stockVal = parseStockValue(draft.stock);
    if (stockVal === null) {
      setErrorMsg('El stock debe ser -1 (infinito) o un número entero >= 0.');
      return;
    }

    setSavingRewardId(reward.id);
    setErrorMsg(null);
    const costUnits = Math.min(100000000, Math.max(1, Math.round(parsedPts * 100)));
    const cleanTitle = draft.title.trim().slice(0, 100) || reward.title;

    try {
      await setDoc(doc(db, 'rewards', reward.id), {
        id: reward.id,
        order: reward.order,
        title: cleanTitle,
        description: draft.description.trim().slice(0, 240),
        costUnits,
        stock: stockVal,
        active: draft.active,
        isGrandPrize: draft.isGrandPrize,
        updatedAt: serverTimestamp(),
        updatedBy: adminAccount.uid,
      });
      showToast(
        `Premio "${cleanTitle}" actualizado (${formatUnits(costUnits)} pts · Stock: ${stockVal === -1 ? '∞' : stockVal}).`
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, `rewards/${reward.id}`);
      }
      setErrorMsg('No se pudo guardar el premio.');
    } finally {
      setSavingRewardId(null);
    }
  };

  const handleDeleteReward = async (reward: RewardItem) => {
    setDeletingRewardId(reward.id);
    setErrorMsg(null);
    try {
      await deleteDoc(doc(db, 'rewards', reward.id));
      setConfirmDeleteRewardId(null);
      showToast(`Premio "${reward.title}" eliminado.`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.DELETE, `rewards/${reward.id}`);
      }
      setErrorMsg('No se pudo eliminar el premio.');
    } finally {
      setDeletingRewardId(null);
    }
  };

  const handleRestoreDefaultRewards = async () => {
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      DEFAULT_REWARDS.forEach((r) => {
        batch.set(doc(db, 'rewards', r.id), {
          ...r,
          updatedAt: serverTimestamp(),
          updatedBy: adminAccount.uid,
        });
      });
      await batch.commit();
      showToast('Catálogo de 10 premios restaurado (Exoneración = 1000.00 pts).');
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'rewards');
      }
      setErrorMsg('No se pudo restaurar el catálogo.');
    }
  };

  const handleMarkDelivered = async (red: RewardRedemption) => {
    try {
      await updateDoc(doc(db, 'redemptions', red.id), {
        status: 'delivered',
        updatedAt: serverTimestamp(),
      });
      showToast(`Canje de ${red.userName} marcado como entregado.`);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.UPDATE, `redemptions/${red.id}`);
      }
      setErrorMsg('No se pudo actualizar el estado del canje.');
    }
  };

  const toClampedPrizeUnits = (raw: string, fallback: number): number => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(100000, Math.max(1, Math.round(parsed * 100)));
  };

  // Probabilities & prizes save
  const handleSaveProbabilities = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setErrorMsg(null);

    const minBetUnits = Math.min(
      100000,
      Math.max(1, Math.round((parseFloat(minBetText) || 0.01) * 100))
    );
    const maxBetThresholdUnits = Math.min(
      1000000,
      Math.max(
        minBetUnits,
        Math.round((parseFloat(maxThresholdText) || 1.0) * 100)
      )
    );
    const minBetWinPct = Math.min(
      100,
      Math.max(0, parseFloat(minBetWinPctText) || 0)
    );
    const maxBetWinPct = Math.min(
      100,
      Math.max(minBetWinPct, parseFloat(maxBetWinPctText) || minBetWinPct)
    );

    const rawLowMin = toClampedPrizeUnits(prizeDecLowMinText, 10);
    const rawLowMax = toClampedPrizeUnits(prizeDecLowMaxText, 30);
    const rawMidMin = toClampedPrizeUnits(prizeDecMidMinText, 40);
    const rawMidMax = toClampedPrizeUnits(prizeDecMidMaxText, 60);
    const rawHiMin = toClampedPrizeUnits(prizeDecHiMinText, 70);
    const rawHiMax = toClampedPrizeUnits(prizeDecHiMaxText, 90);

    try {
      await setDoc(doc(db, 'config', 'game'), {
        minBetUnits,
        maxBetThresholdUnits,
        minBetWinPct,
        maxBetWinPct,
        tierDecLow: Math.min(100, Math.max(0, parseFloat(tierDecLowText) || 0)),
        tierDecMid: Math.min(100, Math.max(0, parseFloat(tierDecMidText) || 0)),
        tierDecHi: Math.min(100, Math.max(0, parseFloat(tierDecHiText) || 0)),
        tierInt1: Math.min(100, Math.max(0, parseFloat(tierInt1Text) || 0)),
        tierInt2: Math.min(100, Math.max(0, parseFloat(tierInt2Text) || 0)),
        tierInt3: Math.min(100, Math.max(0, parseFloat(tierInt3Text) || 0)),
        tierInt4: Math.min(100, Math.max(0, parseFloat(tierInt4Text) || 0)),
        tierInt5: Math.min(100, Math.max(0, parseFloat(tierInt5Text) || 0)),
        prizeDecLowMinUnits: Math.min(rawLowMin, rawLowMax),
        prizeDecLowMaxUnits: Math.max(rawLowMin, rawLowMax),
        prizeDecMidMinUnits: Math.min(rawMidMin, rawMidMax),
        prizeDecMidMaxUnits: Math.max(rawMidMin, rawMidMax),
        prizeDecHiMinUnits: Math.min(rawHiMin, rawHiMax),
        prizeDecHiMaxUnits: Math.max(rawHiMin, rawHiMax),
        prizeInt1Units: toClampedPrizeUnits(prizeInt1Text, 100),
        prizeInt2Units: toClampedPrizeUnits(prizeInt2Text, 200),
        prizeInt3Units: toClampedPrizeUnits(prizeInt3Text, 300),
        prizeInt4Units: toClampedPrizeUnits(prizeInt4Text, 400),
        prizeInt5Units: toClampedPrizeUnits(prizeInt5Text, 500),
        bettingEnabled: config.bettingEnabled,
        bettingStartAt: config.bettingStartAt,
        bettingEndAt: config.bettingEndAt,
        updatedAt: serverTimestamp(),
        updatedBy: adminAccount.uid,
      });
      showToast('Probabilidades, premios de ruleta y apuesta mínima actualizados.');
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'config/game');
      }
      setErrorMsg('No se pudieron guardar las probabilidades y premios.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRestoreDefaultProbabilities = async () => {
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'config', 'game'), {
        ...DEFAULT_GAME_CONFIG,
        bettingEnabled: config.bettingEnabled,
        bettingStartAt: config.bettingStartAt,
        bettingEndAt: config.bettingEndAt,
        updatedAt: serverTimestamp(),
        updatedBy: adminAccount.uid,
      });
      showToast('Probabilidades y premios base de la ruleta restaurados.');
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        handleFirestoreError(err, OperationType.WRITE, 'config/game');
      }
      setErrorMsg('No se pudieron restaurar las probabilidades.');
    } finally {
      setSavingConfig(false);
    }
  };

  const draftPreviewConfig: GameConfig = useMemo(() => {
    const pLowMin = toClampedPrizeUnits(prizeDecLowMinText, 10);
    const pLowMax = toClampedPrizeUnits(prizeDecLowMaxText, 30);
    const pMidMin = toClampedPrizeUnits(prizeDecMidMinText, 40);
    const pMidMax = toClampedPrizeUnits(prizeDecMidMaxText, 60);
    const pHiMin = toClampedPrizeUnits(prizeDecHiMinText, 70);
    const pHiMax = toClampedPrizeUnits(prizeDecHiMaxText, 90);
    return {
      ...config,
      minBetUnits: Math.max(
        1,
        Math.round((parseFloat(minBetText) || 0.01) * 100)
      ),
      maxBetThresholdUnits: Math.max(
        1,
        Math.round((parseFloat(maxThresholdText) || 1.0) * 100)
      ),
      minBetWinPct: Math.min(100, Math.max(0, parseFloat(minBetWinPctText) || 0)),
      maxBetWinPct: Math.min(100, Math.max(0, parseFloat(maxBetWinPctText) || 0)),
      tierDecLow: parseFloat(tierDecLowText) || 0,
      tierDecMid: parseFloat(tierDecMidText) || 0,
      tierDecHi: parseFloat(tierDecHiText) || 0,
      tierInt1: parseFloat(tierInt1Text) || 0,
      tierInt2: parseFloat(tierInt2Text) || 0,
      tierInt3: parseFloat(tierInt3Text) || 0,
      tierInt4: parseFloat(tierInt4Text) || 0,
      tierInt5: parseFloat(tierInt5Text) || 0,
      prizeDecLowMinUnits: Math.min(pLowMin, pLowMax),
      prizeDecLowMaxUnits: Math.max(pLowMin, pLowMax),
      prizeDecMidMinUnits: Math.min(pMidMin, pMidMax),
      prizeDecMidMaxUnits: Math.max(pMidMin, pMidMax),
      prizeDecHiMinUnits: Math.min(pHiMin, pHiMax),
      prizeDecHiMaxUnits: Math.max(pHiMin, pHiMax),
      prizeInt1Units: toClampedPrizeUnits(prizeInt1Text, 100),
      prizeInt2Units: toClampedPrizeUnits(prizeInt2Text, 200),
      prizeInt3Units: toClampedPrizeUnits(prizeInt3Text, 300),
      prizeInt4Units: toClampedPrizeUnits(prizeInt4Text, 400),
      prizeInt5Units: toClampedPrizeUnits(prizeInt5Text, 500),
    };
  }, [
    config,
    minBetText,
    maxThresholdText,
    minBetWinPctText,
    maxBetWinPctText,
    tierDecLowText,
    tierDecMidText,
    tierDecHiText,
    tierInt1Text,
    tierInt2Text,
    tierInt3Text,
    tierInt4Text,
    tierInt5Text,
    prizeDecLowMinText,
    prizeDecLowMaxText,
    prizeDecMidMinText,
    prizeDecMidMaxText,
    prizeDecHiMinText,
    prizeDecHiMaxText,
    prizeInt1Text,
    prizeInt2Text,
    prizeInt3Text,
    prizeInt4Text,
    prizeInt5Text,
  ]);

  const tierSum =
    draftPreviewConfig.tierDecLow +
    draftPreviewConfig.tierDecMid +
    draftPreviewConfig.tierDecHi +
    draftPreviewConfig.tierInt1 +
    draftPreviewConfig.tierInt2 +
    draftPreviewConfig.tierInt3 +
    draftPreviewConfig.tierInt4 +
    draftPreviewConfig.tierInt5;

  const curveSamples = useMemo(() => {
    const minU = draftPreviewConfig.minBetUnits;
    const maxU = Math.max(minU, draftPreviewConfig.maxBetThresholdUnits);
    const midLow = Math.round(minU + (maxU - minU) * 0.25);
    const midHigh = Math.round(minU + (maxU - minU) * 0.6);
    return [minU, midLow, midHigh, maxU].map((u) => ({
      units: u,
      winPct: computeEffectiveDistribution(draftPreviewConfig, u).effectiveWinPct,
    }));
  }, [draftPreviewConfig]);

  const activeTimerPreview: TimerSettings = useMemo(() => {
    if (timerTarget !== 'global' && timerTarget !== 'all') {
      const grp = groups.find((g) => g.id === timerTarget);
      if (grp) return grp;
    }
    return config;
  }, [timerTarget, groups, config]);

  const activeTimerPreviewState = useMemo(
    () => getBettingWindowState(activeTimerPreview, nowMs),
    [activeTimerPreview, nowMs]
  );

  const pendingRedemptionsCount = redemptions.filter(
    (r) => r.status === 'pending'
  ).length;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {toast && (
        <div className="px-4 py-3 rounded-xl bg-[#166534] text-white text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="break-words">{toast}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl border border-[#890149]/30 bg-[#890149]/5 text-[#890149] text-xs font-bold break-words">
          {errorMsg}
        </div>
      )}

      {/* Admin KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
            Alumnos Activos
          </div>
          <div className="text-2xl font-extrabold text-[#171717] tabular mt-1">
            {students.length}
          </div>
        </div>
        <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
            Grados / Grupos
          </div>
          <div className="text-2xl font-extrabold text-[#171717] tabular mt-1">
            {groups.length}
          </div>
        </div>
        <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
            Puntos de Alumnos
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#890149] tabular mt-1 truncate">
            {formatUnits(totalBalanceUnits)}{' '}
            <span className="text-xs font-semibold text-[#76766E]">pts</span>
          </div>
        </div>
        <div className="bg-white border border-black/10 rounded-xl p-4 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] truncate">
            Tiradas / Canjes Pend.
          </div>
          <div className="text-2xl font-extrabold text-[#171717] tabular mt-1">
            {totalSpinsAll}{' '}
            <span className="text-sm font-bold text-[#890149]">
              · {pendingRedemptionsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Section Tabs */}
      <div className="inline-flex flex-wrap p-1 bg-[#E7E7D8] border border-black/10 rounded-xl gap-1 max-w-full">
        {(
          [
            { id: 'alumnos', label: 'Alumnos & Puntos', icon: Users },
            { id: 'grupos', label: 'Grupos & Cronómetros', icon: Layers },
            { id: 'leaderboard', label: 'Tabla Clasificatoria', icon: Trophy },
            {
              id: 'premios',
              label: 'Premios y Canjes',
              icon: Gift,
            },
            {
              id: 'probabilidades',
              label: 'Probabilidades & Premios Ruleta',
              icon: Sliders,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`px-3 sm:px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white text-[#171717]'
                  : 'text-[#4A4A44] hover:text-[#171717]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-[#890149] shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== SECTION 1: ALUMNOS & PUNTOS ==================== */}
      {section === 'alumnos' && (
        <div className="space-y-6 min-w-0">
          <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-black/10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                  Gestión de Alumnos
                </p>
                <h2 className="text-xl font-extrabold tracking-tight mt-1">
                  Asignar puntos, agrupar y eliminar
                </h2>
                <p className="text-xs text-[#4A4A44] mt-1">
                  El administrador asigna puntos y gestiona grupos; únicamente los alumnos participan en la ruleta.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkBusy || filteredStudents.length === 0}
                  onClick={() => handleBulkAssign(filteredStudents, 1)}
                  className="px-3.5 py-2 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+0.01 pts a mostrados ({filteredStudents.length})</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={bulkCustomText}
                    onChange={(e) => setBulkCustomText(e.target.value)}
                    aria-label="Monto grupal"
                    className="w-20 px-2.5 py-2 rounded-lg border border-black/15 text-xs font-bold tabular text-center bg-[#FAFAF5]"
                  />
                  <button
                    type="button"
                    disabled={bulkBusy || filteredStudents.length === 0}
                    onClick={() => {
                      const val = Math.round(
                        (parseFloat(bulkCustomText) || 0) * 100
                      );
                      if (val !== 0)
                        void handleBulkAssign(filteredStudents, val);
                    }}
                    className="px-3 py-2 rounded-lg border border-black/15 hover:border-[#171717] text-xs font-bold transition-colors disabled:opacity-45 whitespace-nowrap"
                  >
                    Aplicar a mostrados
                  </button>
                </div>
              </div>
            </div>

            {/* Filters & Multi-select Toolbar */}
            <div className="my-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="w-4 h-4 text-[#76766E] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar alumno o correo..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-lg border border-black/15 bg-[#FAFAF5] focus:outline-none focus:border-[#890149]"
                  />
                </div>

                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold"
                >
                  <option value="all">Todos los grupos</option>
                  <option value="none">Sin grupo asignado</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedUids.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-[#FAFAF5] border border-[#890149]/25">
                  <span className="text-xs font-bold text-[#890149] px-1 tabular">
                    {selectedUids.length} seleccionados:
                  </span>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => {
                      const list = students.filter((s) =>
                        selectedUids.includes(s.uid)
                      );
                      void handleBulkAssign(list, 1);
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-[#890149] text-white text-xs font-bold"
                  >
                    +0.01 pts
                  </button>
                  <select
                    value={bulkGroupTarget}
                    onChange={(e) => setBulkGroupTarget(e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold"
                  >
                    <option value="">Sin grupo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={handleBulkAssignGroup}
                    className="px-2.5 py-1.5 rounded-md bg-[#171717] text-white text-xs font-bold"
                  >
                    Mover al grupo
                  </button>
                </div>
              )}
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-12 px-4 text-center border border-dashed border-black/15 rounded-xl text-sm text-[#76766E]">
                No hay alumnos registrados con ese filtro. Los alumnos inician con 0.00 pts al verificar su correo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                      <th className="py-3 px-2 w-8">
                        <input
                          type="checkbox"
                          checked={
                            filteredStudents.length > 0 &&
                            filteredStudents.every((s) =>
                              selectedUids.includes(s.uid)
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUids(
                                filteredStudents.map((s) => s.uid)
                              );
                            } else {
                              setSelectedUids([]);
                            }
                          }}
                          aria-label="Seleccionar todos"
                          className="accent-[#890149]"
                        />
                      </th>
                      <th className="py-3 px-3">Alumno</th>
                      <th className="py-3 px-3">Grupo / Grado</th>
                      <th className="py-3 px-3 text-right">Saldo</th>
                      <th className="py-3 px-3 text-right">Asignar Puntos</th>
                      <th className="py-3 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/8">
                    {filteredStudents.map((u) => {
                      const isBusy = busyUserId === u.uid;
                      const customVal = customAmounts[u.uid] ?? '';
                      const isConfirmingDelete = confirmDeleteUid === u.uid;

                      return (
                        <tr key={u.uid} className="hover:bg-[#FAFAF5]">
                          <td className="py-3.5 px-2">
                            <input
                              type="checkbox"
                              checked={selectedUids.includes(u.uid)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUids((prev) => [...prev, u.uid]);
                                } else {
                                  setSelectedUids((prev) =>
                                    prev.filter((id) => id !== u.uid)
                                  );
                                }
                              }}
                              aria-label={`Seleccionar ${u.displayName}`}
                              className="accent-[#890149]"
                            />
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-[#171717]">
                              {u.displayName}
                            </div>
                            <div className="text-xs text-[#76766E]">
                              {u.email}
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <select
                              disabled={isBusy}
                              value={u.groupId ?? ''}
                              onChange={(e) =>
                                handleAssignUserGroup(
                                  u.uid,
                                  e.target.value || null
                                )
                              }
                              className="px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs font-semibold"
                            >
                              <option value="">Sin grupo</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="font-extrabold tabular text-[#171717]">
                              {formatUnits(u.balanceUnits)} pts
                            </div>
                            {u.potUnits > 0 && (
                              <div className="text-[11px] font-bold tabular text-[#890149]">
                                Pozo: {formatUnits(u.potUnits)}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => assignPointsToUser(u, 1)}
                                className="px-2 py-1.5 rounded-md bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold tabular transition-colors disabled:opacity-45"
                              >
                                +0.01
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => assignPointsToUser(u, 10)}
                                className="px-2 py-1.5 rounded-md border border-black/15 hover:border-[#171717] bg-white text-xs font-bold tabular transition-colors disabled:opacity-45"
                              >
                                +0.10
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => assignPointsToUser(u, 100)}
                                className="px-2 py-1.5 rounded-md border border-black/15 hover:border-[#171717] bg-white text-xs font-bold tabular transition-colors disabled:opacity-45"
                              >
                                +1.00
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || u.balanceUnits <= 0}
                                onClick={() => assignPointsToUser(u, -1)}
                                className="px-2 py-1.5 rounded-md border border-black/15 hover:border-[#890149] hover:text-[#890149] bg-white text-xs font-bold tabular transition-colors disabled:opacity-35"
                              >
                                -0.01
                              </button>
                              <div className="flex items-center gap-1 ml-0.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="±0.00"
                                  value={customVal}
                                  onChange={(e) =>
                                    setCustomAmounts((prev) => ({
                                      ...prev,
                                      [u.uid]: e.target.value,
                                    }))
                                  }
                                  className="w-16 px-1.5 py-1 text-xs font-bold tabular text-center border border-black/15 rounded-md bg-[#FAFAF5]"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy || !customVal}
                                  onClick={() => {
                                    const delta = Math.round(
                                      (parseFloat(customVal) || 0) * 100
                                    );
                                    if (delta !== 0) {
                                      void assignPointsToUser(u, delta);
                                      setCustomAmounts((prev) => ({
                                        ...prev,
                                        [u.uid]: '',
                                      }));
                                    }
                                  }}
                                  className="px-2 py-1 rounded-md bg-[#171717] text-white text-xs font-bold disabled:opacity-35"
                                >
                                  Ir
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            {isConfirmingDelete ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRemoveStudent(u)}
                                  className="px-2.5 py-1.5 rounded-md bg-[#890149] text-white text-xs font-bold"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUid(null)}
                                  className="px-2 py-1.5 rounded-md border border-black/15 text-xs font-bold"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteUid(u.uid)}
                                title="Eliminar alumno"
                                className="p-2 rounded-md border border-black/15 hover:border-[#890149] hover:text-[#890149] text-[#76766E] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Removed / Blocked Users Restore Panel */}
          {blockedUsers.length > 0 && (
            <section className="bg-white border border-black/10 rounded-2xl p-6">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#76766E]">
                  Usuarios Eliminados ({blockedUsers.length})
                </p>
                <p className="text-xs text-[#4A4A44] mt-0.5">
                  Estos usuarios fueron removidos del juego. Puedes restaurar su acceso si lo deseas.
                </p>
              </div>
              <div className="divide-y divide-black/8">
                {blockedUsers.map((b) => (
                  <div
                    key={b.uid}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-semibold text-[#171717]">
                      {b.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRestoreBlockedUser(b.uid)}
                      className="px-3 py-1.5 rounded-md border border-black/15 hover:border-[#166534] hover:text-[#166534] font-bold flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Restaurar acceso</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ==================== SECTION 2: GRUPOS & CRONÓMETROS ==================== */}
      {section === 'grupos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Create & List Groups */}
          <section className="lg:col-span-7 bg-white border border-black/10 rounded-2xl p-6 space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                Organización por Grados
              </p>
              <h2 className="text-xl font-extrabold tracking-tight mt-1">
                Grupos y Cronómetros Activos
              </h2>
              <p className="text-xs text-[#4A4A44] mt-1">
                Crea grados o secciones para activar cronómetros independientes según el grupo con el que estés trabajando.
              </p>
            </div>

            <form onSubmit={handleCreateGroup} className="flex gap-2">
              <input
                type="text"
                maxLength={80}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej. 1ro Básico A, 5to Bachillerato..."
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-black/15 bg-[#FAFAF5] text-sm font-semibold focus:outline-none focus:border-[#890149]"
              />
              <button
                type="submit"
                disabled={creatingGroup || !newGroupName.trim()}
                className="px-4 py-2.5 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Crear Grupo</span>
              </button>
            </form>

            {/* Live Group Cards */}
            <div className="space-y-3">
              {/* General / Ungrouped Card */}
              <div className="p-4 rounded-xl border border-black/10 bg-[#FAFAF5] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-[#171717]">
                    General (Alumnos sin grupo)
                  </div>
                  <div className="text-xs text-[#76766E] tabular">
                    {students.filter((s) => !s.groupId).length} alumnos ·{' '}
                    <span
                      className={
                        globalWindowState.canPlaceBet
                          ? 'text-[#166534] font-bold'
                          : 'text-[#890149] font-bold'
                      }
                    >
                      {globalWindowState.label}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTimerTarget('global')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    timerTarget === 'global'
                      ? 'bg-[#171717] border-[#171717] text-white'
                      : 'bg-white border-black/15 text-[#171717]'
                  }`}
                >
                  Configurar reloj
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                  Aún no has creado grupos por grado. Crea uno arriba para controlar su cronómetro por separado.
                </div>
              ) : (
                groups.map((grp) => {
                  const grpState = getBettingWindowState(grp, nowMs);
                  const memberCount = students.filter(
                    (s) => s.groupId === grp.id
                  ).length;

                  return (
                    <div
                      key={grp.id}
                      className="p-4 rounded-xl border border-black/10 bg-white flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-extrabold text-[#171717]">
                          {grp.name}
                        </div>
                        <div className="text-xs text-[#76766E] tabular">
                          {memberCount}{' '}
                          {memberCount === 1 ? 'alumno' : 'alumnos'} ·{' '}
                          <span
                            className={
                              grpState.canPlaceBet
                                ? 'text-[#166534] font-bold'
                                : 'text-[#890149] font-bold'
                            }
                          >
                            {grpState.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTimerTarget(grp.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            timerTarget === grp.id
                              ? 'bg-[#171717] border-[#171717] text-white'
                              : 'bg-white border-black/15 text-[#171717]'
                          }`}
                        >
                          Configurar reloj
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(grp)}
                          title="Eliminar grupo"
                          className="p-1.5 rounded-lg border border-black/15 hover:border-[#890149] hover:text-[#890149] text-[#76766E]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right: Per-Group Timer Controller */}
          <section className="lg:col-span-5 bg-white border border-black/10 rounded-2xl p-6">
            <div className="pb-4 border-b border-black/10 mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Cronómetro por Grupo</span>
              </p>
              <h3 className="text-lg font-extrabold tracking-tight mt-1">
                Activar o Programar Ronda
              </h3>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-[#4A4A44] mb-1.5">
                Aplicar cronómetro a:
              </label>
              <select
                value={timerTarget}
                onChange={(e) => setTimerTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold"
              >
                <option value="global">General (Alumnos sin grupo)</option>
                <option value="all">Todos los grupos y General</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Grupo: {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-4 rounded-xl bg-[#FAFAF5] border border-black/10 mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                  Estado actual seleccionado
                </div>
                <div
                  className={`text-lg font-extrabold tabular mt-0.5 ${
                    activeTimerPreviewState.canPlaceBet
                      ? 'text-[#166534]'
                      : 'text-[#890149]'
                  }`}
                >
                  {activeTimerPreviewState.label}
                </div>
              </div>
              <button
                type="button"
                disabled={savingConfig}
                onClick={() =>
                  applyTimerToTarget(
                    { bettingEnabled: !activeTimerPreview.bettingEnabled },
                    activeTimerPreview.bettingEnabled
                      ? 'Apuestas pausadas para el destino.'
                      : 'Apuestas reanudadas para el destino.'
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                  activeTimerPreview.bettingEnabled
                    ? 'border-[#890149]/30 text-[#890149]'
                    : 'bg-[#166534] border-[#166534] text-white'
                }`}
              >
                {activeTimerPreview.bettingEnabled ? (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Activar</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="text-xs font-bold text-[#4A4A44]">
                Inicio rápido de cronómetro (desde ahora)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[2, 5, 10, 15, 30].map((min) => (
                  <button
                    key={min}
                    type="button"
                    disabled={savingConfig}
                    onClick={() =>
                      applyTimerToTarget(
                        {
                          bettingEnabled: true,
                          bettingStartAt: Timestamp.fromMillis(Date.now()),
                          bettingEndAt: Timestamp.fromMillis(
                            Date.now() + min * 60 * 1000
                          ),
                        },
                        `Cronómetro de ${min} min activado.`
                      )
                    }
                    className="py-2 px-3 rounded-lg border border-black/15 hover:border-[#890149] hover:text-[#890149] bg-white text-xs font-bold tabular transition-colors"
                  >
                    {min} min
                  </button>
                ))}
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() =>
                    applyTimerToTarget(
                      {
                        bettingEnabled: true,
                        bettingStartAt: null,
                        bettingEndAt: null,
                      },
                      'Ventana abierta sin límite de tiempo.'
                    )
                  }
                  className="py-2 px-3 rounded-lg border border-black/15 hover:border-[#171717] bg-[#FAFAF5] text-xs font-bold transition-colors"
                >
                  Sin límite
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const startTs = startInput
                  ? Timestamp.fromDate(new Date(startInput))
                  : null;
                const endTs = endInput
                  ? Timestamp.fromDate(new Date(endInput))
                  : null;
                if (startTs && endTs && endTs.toMillis() <= startTs.toMillis()) {
                  setErrorMsg('La hora de fin debe ser posterior al inicio.');
                  return;
                }
                void applyTimerToTarget(
                  {
                    bettingEnabled: true,
                    bettingStartAt: startTs,
                    bettingEndAt: endTs,
                  },
                  'Horario programado aplicado.'
                );
              }}
              className="space-y-3 pt-4 border-t border-black/10"
            >
              <div className="text-xs font-bold text-[#4A4A44]">
                Programar horario exacto
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#76766E] mb-1">
                  Inicio
                </label>
                <input
                  type="datetime-local"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-semibold bg-[#FAFAF5]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#76766E] mb-1">
                  Fin
                </label>
                <input
                  type="datetime-local"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-semibold bg-[#FAFAF5]"
                />
              </div>
              <button
                type="submit"
                disabled={savingConfig}
                className="w-full py-2.5 px-4 rounded-lg bg-[#171717] hover:bg-black text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                Aplicar horario programado
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ==================== SECTION 3: LEADERBOARD ==================== */}
      {section === 'leaderboard' && (
        <section className="bg-white border border-black/10 rounded-2xl p-6 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149] flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                <span>Clasificación en Tiempo Real</span>
              </p>
              <h2 className="text-xl font-extrabold tracking-tight mt-1">
                Tabla Clasificatoria de Alumnos (Leaderboard)
              </h2>
              <p className="text-xs text-[#4A4A44] mt-1">
                Ordenada por saldo acumulado total (saldo disponible + pozo en juego).
              </p>
            </div>

            <select
              value={leaderboardGroupFilter}
              onChange={(e) => setLeaderboardGroupFilter(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold self-start sm:self-auto"
            >
              <option value="all">Todos los grados</option>
              <option value="none">Sin grupo asignado</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {leaderboardStudents.length > 0 && (
            <div className="p-5 rounded-xl border border-[#890149]/30 bg-[#890149]/[0.04] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#890149] text-white flex items-center justify-center font-extrabold text-sm tabular">
                  #1
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#890149]">
                    Mejor Puntaje Actual
                  </div>
                  <div className="text-lg font-extrabold text-[#171717]">
                    {leaderboardStudents[0].displayName}
                  </div>
                  <div className="text-xs text-[#76766E]">
                    {leaderboardStudents[0].groupId
                      ? groupMap[leaderboardStudents[0].groupId]?.name ??
                        'Grupo'
                      : 'Sin grupo'}{' '}
                    · {leaderboardStudents[0].email}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-[#76766E]">
                  Puntaje Acumulado
                </div>
                <div className="text-2xl font-extrabold text-[#890149] tabular">
                  {formatUnits(
                    leaderboardStudents[0].balanceUnits +
                      leaderboardStudents[0].potUnits
                  )}{' '}
                  pts
                </div>
              </div>
            </div>
          )}

          {leaderboardStudents.length === 0 ? (
            <div className="py-12 px-4 text-center border border-dashed border-black/15 rounded-xl text-sm text-[#76766E]">
              No hay alumnos en este grupo para clasificar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                    <th className="py-3 px-3 w-16">Pos.</th>
                    <th className="py-3 px-3">Alumno</th>
                    <th className="py-3 px-3">Grupo</th>
                    <th className="py-3 px-3 text-right">Saldo</th>
                    <th className="py-3 px-3 text-right">En Pozo</th>
                    <th className="py-3 px-3 text-right">Total Acumulado</th>
                    <th className="py-3 px-3 text-right">Tiradas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/8">
                  {leaderboardStudents.map((s, idx) => {
                    const total = s.balanceUnits + s.potUnits;
                    const rank = idx + 1;
                    return (
                      <tr
                        key={s.uid}
                        className={rank === 1 ? 'bg-[#890149]/[0.03]' : ''}
                      >
                        <td
                          className={`py-3.5 px-3 font-extrabold tabular ${
                            rank === 1 ? 'text-[#890149]' : 'text-[#171717]'
                          }`}
                        >
                          #{rank}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-[#171717]">
                            {s.displayName}
                          </div>
                          <div className="text-xs text-[#76766E]">{s.email}</div>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-semibold text-[#4A4A44]">
                          {s.groupId
                            ? groupMap[s.groupId]?.name ?? 'Grupo'
                            : 'Sin grupo'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold tabular">
                          {formatUnits(s.balanceUnits)} pts
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold tabular text-[#76766E]">
                          {formatUnits(s.potUnits)} pts
                        </td>
                        <td
                          className={`py-3.5 px-3 text-right font-extrabold tabular ${
                            rank === 1 ? 'text-[#890149]' : 'text-[#171717]'
                          }`}
                        >
                          {formatUnits(total)} pts
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold tabular text-[#4A4A44]">
                          {s.totalSpins}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ==================== SECTION 4: PREMIOS & CANJES ==================== */}
      {section === 'premios' && (
        <div className="space-y-6 min-w-0">
          {/* Add New Reward Form */}
          <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
            <div className="pb-4 border-b border-black/10 mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                Nuevo Premio
              </p>
              <h2 className="text-xl font-extrabold tracking-tight mt-1">
                Agregar Premio al Catálogo
              </h2>
              <p className="text-xs text-[#4A4A44] mt-1">
                Define título, descripción, valor en puntos y stock disponible (usa{' '}
                <span className="font-extrabold text-[#171717] tabular">-1</span>{' '}
                para stock infinito).
              </p>
            </div>

            <form
              onSubmit={handleCreateReward}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
            >
              <div className="md:col-span-4 min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Título del premio
                </label>
                <input
                  type="text"
                  maxLength={100}
                  required
                  value={newRewardTitle}
                  onChange={(e) => setNewRewardTitle(e.target.value)}
                  placeholder="Ej. Exoneración de Laboratorio"
                  className="w-full px-3 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold focus:outline-none focus:border-[#890149]"
                />
              </div>

              <div className="md:col-span-4 min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Descripción breve
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={newRewardDesc}
                  onChange={(e) => setNewRewardDesc(e.target.value)}
                  placeholder="Detalle o condiciones del canje..."
                  className="w-full px-3 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs focus:outline-none focus:border-[#890149]"
                />
              </div>

              <div className="md:col-span-2 min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Puntos
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={newRewardPts}
                  onChange={(e) => setNewRewardPts(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-extrabold tabular text-right text-[#890149] focus:outline-none focus:border-[#890149]"
                />
              </div>

              <div className="md:col-span-2 min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Stock (-1 = ∞)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    min="-1"
                    value={newRewardStock}
                    onChange={(e) => setNewRewardStock(e.target.value)}
                    className="w-full min-w-0 px-2.5 py-2 rounded-lg border border-black/15 bg-[#FAFAF5] text-xs font-bold tabular text-center focus:outline-none focus:border-[#890149]"
                  />
                  <button
                    type="button"
                    title="Fijar stock infinito (-1)"
                    onClick={() => setNewRewardStock('-1')}
                    className={`px-2 py-2 rounded-lg border text-xs font-bold shrink-0 ${
                      newRewardStock === '-1'
                        ? 'bg-[#171717] border-[#171717] text-white'
                        : 'bg-white border-black/15 text-[#4A4A44]'
                    }`}
                  >
                    ∞
                  </button>
                </div>
              </div>

              <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#4A4A44] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRewardIsGrand}
                    onChange={(e) => setNewRewardIsGrand(e.target.checked)}
                    className="accent-[#890149]"
                  />
                  <span>Destacar como Premio Mayor</span>
                </label>

                <button
                  type="submit"
                  disabled={creatingReward}
                  className="px-4 py-2.5 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-45"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingReward ? 'Agregando...' : 'Agregar Premio'}</span>
                </button>
              </div>
            </form>
          </section>

          {/* Editable Catalog */}
          <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-black/10 mb-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
                  Catálogo Editable ({rewards.length} Premios)
                </p>
                <h2 className="text-xl font-extrabold tracking-tight mt-1">
                  Editar, Eliminar y Controlar Stock
                </h2>
                <p className="text-xs text-[#4A4A44] mt-1">
                  Ajusta puntos, stock (<span className="font-bold">-1 = infinito</span>) o elimina premios en tiempo real.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaultRewards}
                className="px-3.5 py-2 rounded-lg border border-black/15 hover:border-[#171717] text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar 10 premios base</span>
              </button>
            </div>

            {rewards.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                No hay premios en el catálogo. Agrega uno arriba o restaura los 10 premios base.
              </div>
            ) : (
              <div className="space-y-3">
                {rewards.map((reward) => {
                  const draft = rewardDrafts[reward.id] ?? {
                    title: reward.title,
                    description: reward.description,
                    costPts: formatUnits(reward.costUnits),
                    stock: String(reward.stock ?? -1),
                    active: reward.active,
                    isGrandPrize: Boolean(reward.isGrandPrize),
                  };
                  const savingThis = savingRewardId === reward.id;
                  const deletingThis = deletingRewardId === reward.id;
                  const confirmingDelete = confirmDeleteRewardId === reward.id;
                  const parsedStock = parseInt(draft.stock, 10);
                  const isInf = parsedStock === -1;

                  return (
                    <div
                      key={reward.id}
                      className={`p-4 rounded-xl border space-y-3 min-w-0 ${
                        draft.isGrandPrize
                          ? 'border-[#890149]/40 bg-[#890149]/[0.03]'
                          : 'border-black/10 bg-[#FAFAF5]'
                      }`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-4 min-w-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#76766E] mb-1">
                            #{String(reward.order).padStart(2, '0')} · Título
                          </label>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {draft.isGrandPrize && (
                              <Award className="w-4 h-4 text-[#890149] shrink-0" />
                            )}
                            <input
                              type="text"
                              maxLength={100}
                              value={draft.title}
                              onChange={(e) =>
                                setRewardDrafts((prev) => ({
                                  ...prev,
                                  [reward.id]: { ...draft, title: e.target.value },
                                }))
                              }
                              className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="md:col-span-4 min-w-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#76766E] mb-1">
                            Descripción
                          </label>
                          <input
                            type="text"
                            maxLength={240}
                            value={draft.description}
                            onChange={(e) =>
                              setRewardDrafts((prev) => ({
                                ...prev,
                                [reward.id]: {
                                  ...draft,
                                  description: e.target.value,
                                },
                              }))
                            }
                            className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs text-[#4A4A44]"
                          />
                        </div>

                        <div className="md:col-span-2 min-w-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#76766E] mb-1">
                            Valor (pts)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={draft.costPts}
                            onChange={(e) =>
                              setRewardDrafts((prev) => ({
                                ...prev,
                                [reward.id]: { ...draft, costPts: e.target.value },
                              }))
                            }
                            className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs font-extrabold tabular text-right text-[#890149]"
                          />
                        </div>

                        <div className="md:col-span-2 min-w-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#76766E] mb-1">
                            Stock (-1 = ∞)
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="1"
                              min="-1"
                              value={draft.stock}
                              onChange={(e) =>
                                setRewardDrafts((prev) => ({
                                  ...prev,
                                  [reward.id]: { ...draft, stock: e.target.value },
                                }))
                              }
                              className="w-full min-w-0 px-2 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold tabular text-center"
                            />
                            <button
                              type="button"
                              title="Fijar infinito (-1)"
                              onClick={() =>
                                setRewardDrafts((prev) => ({
                                  ...prev,
                                  [reward.id]: { ...draft, stock: '-1' },
                                }))
                              }
                              className={`px-2 py-1.5 rounded-md border text-xs font-bold shrink-0 ${
                                isInf
                                  ? 'bg-[#171717] border-[#171717] text-white'
                                  : 'bg-white border-black/15 text-[#4A4A44]'
                              }`}
                            >
                              <InfinityIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/8">
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4A4A44] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) =>
                                setRewardDrafts((prev) => ({
                                  ...prev,
                                  [reward.id]: {
                                    ...draft,
                                    active: e.target.checked,
                                  },
                                }))
                              }
                              className="accent-[#890149]"
                            />
                            <span>Activo</span>
                          </label>

                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4A4A44] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.isGrandPrize}
                              onChange={(e) =>
                                setRewardDrafts((prev) => ({
                                  ...prev,
                                  [reward.id]: {
                                    ...draft,
                                    isGrandPrize: e.target.checked,
                                  },
                                }))
                              }
                              className="accent-[#890149]"
                            />
                            <span>Premio Mayor</span>
                          </label>

                          <span className="text-[11px] font-semibold text-[#76766E] tabular">
                            {isInf
                              ? 'Disponible: ∞ (ilimitado)'
                              : parsedStock === 0
                                ? 'Agotado (0)'
                                : `Quedan: ${Number.isNaN(parsedStock) ? '—' : parsedStock}`}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={savingThis || deletingThis}
                            onClick={() => handleSaveReward(reward)}
                            className="px-3 py-1.5 rounded-md bg-[#171717] hover:bg-black text-white text-xs font-bold flex items-center gap-1 disabled:opacity-45"
                          >
                            <Save className="w-3 h-3" />
                            <span>{savingThis ? 'Guardando...' : 'Guardar'}</span>
                          </button>

                          {confirmingDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingThis}
                                onClick={() => handleDeleteReward(reward)}
                                className="px-2.5 py-1.5 rounded-md bg-[#890149] text-white text-xs font-bold"
                              >
                                {deletingThis ? '...' : 'Confirmar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRewardId(null)}
                                className="px-2 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={savingThis || deletingThis}
                              onClick={() => setConfirmDeleteRewardId(reward.id)}
                              title="Eliminar premio"
                              className="px-2.5 py-1.5 rounded-md border border-black/15 bg-white hover:border-[#890149] hover:text-[#890149] text-[#76766E] text-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Redemptions Queue */}
          <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-6 overflow-hidden">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
                Solicitudes de Canje ({redemptions.length})
              </p>
              <h3 className="text-lg font-extrabold tracking-tight mt-0.5">
                Premios Canjeados por Alumnos
              </h3>
            </div>

            {redemptions.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-[#76766E] border border-dashed border-black/15 rounded-xl">
                Ningún alumno ha canjeado un premio todavía.
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black/15 text-left text-[11px] font-bold uppercase tracking-wider text-[#76766E]">
                      <th className="py-2.5 px-3">Alumno</th>
                      <th className="py-2.5 px-3">Premio Canjeado</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                      <th className="py-2.5 px-3 text-right">Estado / Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/8">
                    {redemptions.map((red) => (
                      <tr key={red.id}>
                        <td className="py-3 px-3 font-bold text-[#171717]">
                          {red.userName}
                          {red.groupId && groupMap[red.groupId] && (
                            <span className="ml-2 text-xs font-medium text-[#76766E]">
                              · {groupMap[red.groupId].name}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold">
                          {red.rewardTitle}
                        </td>
                        <td className="py-3 px-3 text-right font-bold tabular text-[#890149]">
                          {formatUnits(red.costUnits)} pts
                        </td>
                        <td className="py-3 px-3 text-right">
                          {red.status === 'delivered' ? (
                            <span className="text-xs font-bold text-[#166534]">
                              Entregado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMarkDelivered(red)}
                              className="px-3 py-1.5 rounded-md bg-[#890149] hover:bg-[#6f013b] text-white text-xs font-bold"
                            >
                              Marcar entregado
                            </button>
                          )}
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

      {/* ==================== SECTION 5: PROBABILIDADES & PREMIOS DE RULETA ==================== */}
      {section === 'probabilidades' && (
        <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-7 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/10 mb-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#76766E]">
                Modelo Matemático &amp; Premios de Ruleta
              </p>
              <h2 className="text-xl font-extrabold tracking-tight mt-1">
                Editar Probabilidades, Premios de Apuesta y Mínimo
              </h2>
            </div>
            <button
              type="button"
              disabled={savingConfig}
              onClick={handleRestoreDefaultProbabilities}
              className="px-3 py-1.5 rounded-lg border border-black/15 hover:border-[#171717] text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Base</span>
            </button>
          </div>

          <form onSubmit={handleSaveProbabilities} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Apuesta mínima (pts)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={minBetText}
                  onChange={(e) => setMinBetText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-bold tabular bg-[#FAFAF5] focus:outline-none focus:border-[#890149]"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  % Ganar (Apuesta Mín.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={minBetWinPctText}
                  onChange={(e) => setMinBetWinPctText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-bold tabular bg-[#FAFAF5] focus:outline-none focus:border-[#890149]"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  % Ganar (Apuesta Alta)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={maxBetWinPctText}
                  onChange={(e) => setMaxBetWinPctText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-bold tabular bg-[#FAFAF5] focus:outline-none focus:border-[#890149]"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#4A4A44] mb-1">
                  Umbral Apuesta Alta (pts)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.01"
                  value={maxThresholdText}
                  onChange={(e) => setMaxThresholdText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-black/15 text-xs font-bold tabular bg-[#FAFAF5] focus:outline-none focus:border-[#890149]"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAFAF5] border border-black/10">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#76766E] mb-2">
                Vista previa de escala (más puntos apostados = mayor probabilidad)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {curveSamples.map((s, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-black/10 rounded-lg p-2.5 text-center min-w-0"
                  >
                    <div className="text-[11px] font-semibold text-[#76766E] tabular truncate">
                      {formatUnits(s.units)} pts
                    </div>
                    <div className="text-sm font-extrabold text-[#890149] tabular mt-0.5">
                      {s.winPct.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Editable Ranges & Tiers: Both Probabilities (%) AND Roulette Prizes (pts) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-[#4A4A44]">
                  Configuración de Niveles: Probabilidad (%) y Premio otorgado (pts)
                </span>
                <span className="text-[#76766E] tabular">
                  Suma ganadores: {tierSum.toFixed(2)}% · Pérdida:{' '}
                  {(100 - Math.min(100, tierSum)).toFixed(2)}%
                </span>
              </div>

              {/* 3 Range Bands */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    name: 'Banda Baja',
                    color: '#15803D',
                    prob: tierDecLowText,
                    setProb: setTierDecLowText,
                    minVal: prizeDecLowMinText,
                    setMinVal: setPrizeDecLowMinText,
                    maxVal: prizeDecLowMaxText,
                    setMaxVal: setPrizeDecLowMaxText,
                  },
                  {
                    name: 'Banda Media',
                    color: '#0D9488',
                    prob: tierDecMidText,
                    setProb: setTierDecMidText,
                    minVal: prizeDecMidMinText,
                    setMinVal: setPrizeDecMidMinText,
                    maxVal: prizeDecMidMaxText,
                    setMaxVal: setPrizeDecMidMaxText,
                  },
                  {
                    name: 'Banda Alta',
                    color: '#D97706',
                    prob: tierDecHiText,
                    setProb: setTierDecHiText,
                    minVal: prizeDecHiMinText,
                    setMinVal: setPrizeDecHiMinText,
                    maxVal: prizeDecHiMaxText,
                    setMaxVal: setPrizeDecHiMaxText,
                  },
                ].map((band) => (
                  <div
                    key={band.name}
                    className="p-3.5 rounded-xl border border-black/10 bg-[#FAFAF5] space-y-2.5 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: band.color }}
                        />
                        <span className="text-xs font-extrabold text-[#171717] truncate">
                          {band.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          aria-label={`${band.name} porcentaje`}
                          value={band.prob}
                          onChange={(e) => band.setProb(e.target.value)}
                          className="w-20 px-2 py-1 rounded-md border border-black/15 bg-white text-xs font-bold tabular text-right focus:outline-none focus:border-[#890149]"
                        />
                        <span className="text-[11px] font-bold text-[#76766E]">
                          %
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-[#76766E] mb-0.5">
                          Premio Mín (pts)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1000"
                          value={band.minVal}
                          onChange={(e) => band.setMinVal(e.target.value)}
                          className="w-full min-w-0 px-2 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold tabular text-right focus:outline-none focus:border-[#890149]"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-[#76766E] mb-0.5">
                          Premio Máx (pts)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1000"
                          value={band.maxVal}
                          onChange={(e) => band.setMaxVal(e.target.value)}
                          className="w-full min-w-0 px-2 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold tabular text-right focus:outline-none focus:border-[#890149]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 5 Higher / Cherry Tiers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  {
                    name: 'Nivel 1',
                    prob: tierInt1Text,
                    setProb: setTierInt1Text,
                    prize: prizeInt1Text,
                    setPrize: setPrizeInt1Text,
                  },
                  {
                    name: 'Raro',
                    prob: tierInt2Text,
                    setProb: setTierInt2Text,
                    prize: prizeInt2Text,
                    setPrize: setPrizeInt2Text,
                  },
                  {
                    name: 'Muy Raro',
                    prob: tierInt3Text,
                    setProb: setTierInt3Text,
                    prize: prizeInt3Text,
                    setPrize: setPrizeInt3Text,
                  },
                  {
                    name: 'Épico',
                    prob: tierInt4Text,
                    setProb: setTierInt4Text,
                    prize: prizeInt4Text,
                    setPrize: setPrizeInt4Text,
                  },
                  {
                    name: 'Premio Mayor',
                    prob: tierInt5Text,
                    setProb: setTierInt5Text,
                    prize: prizeInt5Text,
                    setPrize: setPrizeInt5Text,
                    isJackpot: true,
                  },
                ].map((tier) => (
                  <div
                    key={tier.name}
                    className={`p-3.5 rounded-xl border space-y-2.5 min-w-0 ${
                      tier.isJackpot
                        ? 'border-[#890149]/40 bg-[#890149]/[0.04]'
                        : 'border-black/10 bg-[#FAFAF5]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#890149] shrink-0" />
                      <span
                        className={`text-xs font-extrabold truncate ${
                          tier.isJackpot ? 'text-[#890149]' : 'text-[#171717]'
                        }`}
                      >
                        {tier.name}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#76766E] mb-0.5">
                        Probabilidad (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={tier.prob}
                        onChange={(e) => tier.setProb(e.target.value)}
                        className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs font-bold tabular text-right focus:outline-none focus:border-[#890149]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#76766E] mb-0.5">
                        Premio (pts)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="1000"
                        value={tier.prize}
                        onChange={(e) => tier.setPrize(e.target.value)}
                        className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-black/15 bg-white text-xs font-extrabold tabular text-right text-[#890149] focus:outline-none focus:border-[#890149]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="w-full py-3 px-5 rounded-xl bg-[#890149] hover:bg-[#6f013b] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>
                {savingConfig
                  ? 'Guardando...'
                  : 'Guardar Probabilidades, Premios y Mínimo'}
              </span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
};
