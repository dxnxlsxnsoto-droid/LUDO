import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'admin';

export interface TimerSettings {
  bettingEnabled: boolean;
  bettingStartAt: Timestamp | null;
  bettingEndAt: Timestamp | null;
}

export interface GameConfig extends TimerSettings {
  minBetUnits: number;
  maxBetThresholdUnits: number;
  minBetWinPct: number;
  maxBetWinPct: number;
  tierDecLow: number;
  tierDecMid: number;
  tierDecHi: number;
  tierInt1: number;
  tierInt2: number;
  tierInt3: number;
  tierInt4: number;
  tierInt5: number;
  prizeDecLowMinUnits: number;
  prizeDecLowMaxUnits: number;
  prizeDecMidMinUnits: number;
  prizeDecMidMaxUnits: number;
  prizeDecHiMinUnits: number;
  prizeDecHiMaxUnits: number;
  prizeInt1Units: number;
  prizeInt2Units: number;
  prizeInt3Units: number;
  prizeInt4Units: number;
  prizeInt5Units: number;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
}

export interface StudentGroup extends TimerSettings {
  id: string;
  name: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
}

export interface RewardItem {
  id: string;
  order: number;
  title: string;
  description: string;
  costUnits: number;
  stock: number; // -1 = infinito
  active: boolean;
  isGrandPrize: boolean;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
}

export interface RewardRedemption {
  id: string;
  userId: string;
  userName: string;
  groupId?: string | null;
  rewardId: string;
  rewardTitle: string;
  costUnits: number;
  status: 'pending' | 'delivered';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface BlockedUser {
  uid: string;
  email: string;
  removedAt?: Timestamp | null;
  removedBy?: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  groupId?: string | null;
  targetRewardId?: string | null;
  balanceUnits: number;
  potUnits: number;
  streak: number;
  totalSpins: number;
  totalWageredUnits: number;
  totalReturnedUnits: number;
  bestPrizeUnits: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type MovementType =
  | 'spin_win'
  | 'spin_loss'
  | 'cashout'
  | 'admin_grant'
  | 'admin_adjust'
  | 'reward_redeem';

export interface PointMovement {
  id: string;
  userId: string;
  type: MovementType;
  title: string;
  subtitle: string;
  deltaUnits: number;
  stakeUnits: number;
  winProbPct: number;
  createdBy: string;
  createdAt?: Timestamp | null;
}

export type TierId =
  | 'loss'
  | 'dec_low'
  | 'dec_mid'
  | 'dec_hi'
  | 'int_1'
  | 'int_2'
  | 'int_3'
  | 'int_4'
  | 'int_5';

export interface DonutSegment {
  id: TierId | 'win_integers';
  label: string;
  shortLabel: string;
  pct: number;
  startDeg: number;
  endDeg: number;
  color: string;
  isWin: boolean;
}

export interface EffectiveDistribution {
  effectiveWinPct: number;
  lossPct: number;
  scaleFactor: number;
  tiers: {
    id: TierId;
    label: string;
    category: string;
    pct: number;
    isWin: boolean;
    isInteger: boolean;
    isJackpot?: boolean;
    color: string;
  }[];
  donutSegments: DonutSegment[];
}

export interface SpinOutcome {
  tierId: TierId;
  units: number;
  isLoss: boolean;
  isInteger: boolean;
  isJackpot: boolean;
  desc: string;
  targetAngleDeg: number;
  effectiveWinPct: number;
}

export type BettingWindowStatus = 'disabled' | 'upcoming' | 'open' | 'ended';

export interface BettingWindowState {
  status: BettingWindowStatus;
  canPlaceBet: boolean;
  label: string;
  detail: string;
  remainingMs: number | null;
}
