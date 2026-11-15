import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { LogOut, ShieldCheck, UserCircle2, UserX } from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { DEFAULT_GAME_CONFIG, formatUnits } from './engine/probability';
import type { GameConfig, UserAccount } from './types/game';
import { AuthScreen } from './components/AuthScreen';
import { EmailVerificationScreen } from './components/EmailVerificationScreen';
import { AdminView } from './components/AdminView';
import { StudentView } from './components/StudentView';
import { SubtleCornerClock } from './components/SubtleCornerClock';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [verifiedTick, setVerifiedTick] = useState(0);

  const [account, setAccount] = useState<UserAccount | null>(null);
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isRemovedByAdmin, setIsRemovedByAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setAccount(null);
        setIsRemovedByAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  const isVerifiedUser = Boolean(firebaseUser && firebaseUser.emailVerified);
  const isBootstrappedAdmin =
    firebaseUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  useEffect(() => {
    if (!firebaseUser || !isVerifiedUser) return;

    let cancelled = false;
    let unsubUser: (() => void) | null = null;
    let unsubConfig: (() => void) | null = null;

    const initSession = async () => {
      setBootError(null);
      setIsRemovedByAdmin(false);
      const userRef = doc(db, 'users', firebaseUser.uid);

      try {
        if (!isBootstrappedAdmin) {
          const blockedSnap = await getDoc(
            doc(db, 'blockedUsers', firebaseUser.uid)
          );
          if (blockedSnap.exists()) {
            if (!cancelled) setIsRemovedByAdmin(true);
            return;
          }
        }

        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const fallbackName =
            firebaseUser.displayName?.trim() ||
            firebaseUser.email?.split('@')[0] ||
            'Usuario';
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: fallbackName.slice(0, 80),
            role: isBootstrappedAdmin ? 'admin' : 'student',
            groupId: null,
            targetRewardId: null,
            balanceUnits: 0,
            potUnits: 0,
            streak: 0,
            totalSpins: 0,
            totalWageredUnits: 0,
            totalReturnedUnits: 0,
            bestPrizeUnits: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (isBootstrappedAdmin) {
          const configRef = doc(db, 'config', 'game');
          const cfgSnap = await getDoc(configRef);
          if (!cfgSnap.exists()) {
            await setDoc(configRef, {
              ...DEFAULT_GAME_CONFIG,
              updatedAt: serverTimestamp(),
              updatedBy: firebaseUser.uid,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (
            err instanceof Error &&
            err.message.toLowerCase().includes('permission')
          ) {
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `users/${firebaseUser.uid}`
            );
          }
          setBootError(
            err instanceof Error
              ? err.message
              : 'Error al inicializar tu perfil.'
          );
        }
        return;
      }

      if (cancelled) return;

      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            setAccount(snap.data() as UserAccount);
          } else if (!isBootstrappedAdmin) {
            setAccount(null);
            setIsRemovedByAdmin(true);
          }
        },
        (err) =>
          handleFirestoreError(
            err,
            OperationType.GET,
            `users/${firebaseUser.uid}`
          )
      );

      unsubConfig = onSnapshot(
        doc(db, 'config', 'game'),
        (snap) => {
          if (snap.exists()) {
            setConfig({
              ...DEFAULT_GAME_CONFIG,
              ...(snap.data() as Partial<GameConfig>),
            });
          } else {
            setConfig(DEFAULT_GAME_CONFIG);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'config/game')
      );
    };

    void initSession();

    return () => {
      cancelled = true;
      unsubUser?.();
      unsubConfig?.();
    };
  }, [firebaseUser, isVerifiedUser, isBootstrappedAdmin, verifiedTick]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F3F3E7] flex items-center justify-center">
        <div className="text-sm font-bold text-[#76766E]">
          Cargando LUDOPATA 2.0...
        </div>
        <SubtleCornerClock />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        <AuthScreen />
        <SubtleCornerClock />
      </>
    );
  }

  if (!firebaseUser.emailVerified) {
    return (
      <>
        <EmailVerificationScreen
          user={firebaseUser}
          onVerified={() => setVerifiedTick((n) => n + 1)}
        />
        <SubtleCornerClock />
      </>
    );
  }

  if (isRemovedByAdmin) {
    return (
      <div className="min-h-screen bg-[#F3F3E7] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-black/10 rounded-2xl p-8 space-y-4">
          <div className="w-11 h-11 rounded-xl bg-[#890149]/10 text-[#890149] flex items-center justify-center">
            <UserX className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-[#171717]">
            Cuenta removida del juego
          </h1>
          <p className="text-sm text-[#4A4A44] leading-relaxed">
            El administrador ha eliminado tu usuario de esta sesión de{' '}
            <span className="font-bold">LUDOPATA 2.0</span>. Si necesitas volver a ingresar, solicita al docente que restaure tu acceso.
          </p>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full py-2.5 px-4 rounded-lg bg-[#171717] text-white text-xs font-bold"
          >
            Cerrar sesión
          </button>
        </div>
        <SubtleCornerClock />
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-[#F3F3E7] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-black/10 rounded-2xl p-6 space-y-4">
          <h1 className="text-lg font-extrabold text-[#890149]">
            No se pudo iniciar la sesión
          </h1>
          <p className="text-sm text-[#4A4A44]">{bootError}</p>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full py-2.5 px-4 rounded-lg bg-[#171717] text-white text-xs font-bold"
          >
            Volver al inicio
          </button>
        </div>
        <SubtleCornerClock />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-[#F3F3E7] flex items-center justify-center">
        <div className="text-sm font-bold text-[#76766E]">
          Sincronizando cuenta y grupos...
        </div>
        <SubtleCornerClock />
      </div>
    );
  }

  const isAdmin = account.role === 'admin' || isBootstrappedAdmin;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F3F3E7] text-[#171717] flex flex-col">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-6 flex-1 min-w-0">
        {/* Top Bar Contract (3 clean zones) */}
        <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-6 pb-5 border-b border-black/10 mb-7 min-w-0">
          {/* Zone 1: Single-line Wordmark */}
          <div className="text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0">
            LUDOPATA <span className="text-[#890149]">2.0</span>
          </div>

          {/* Zone 2: Role Context (Admin has no roulette/points; Student shows balance) */}
          <nav className="flex items-center gap-4 text-sm font-semibold text-[#4A4A44] min-w-0 max-w-full">
            {isAdmin ? (
              <div className="flex items-center gap-2 text-xs font-bold text-[#890149] whitespace-nowrap">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Consola de Administrador</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-bold text-[#4A4A44] min-w-0 max-w-full">
                <UserCircle2 className="w-4 h-4 text-[#890149] shrink-0" />
                <span className="truncate max-w-[140px] sm:max-w-[220px]">
                  {account.displayName}
                </span>
                <span className="text-[#76766E] shrink-0">·</span>
                <span className="tabular font-extrabold text-[#171717] whitespace-nowrap shrink-0">
                  Saldo {formatUnits(account.balanceUnits)} pts
                </span>
              </div>
            )}
          </nav>

          {/* Zone 3: Account Action */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 ml-auto sm:ml-0">
            {isAdmin && (
              <span className="hidden md:inline text-xs font-semibold text-[#76766E] whitespace-nowrap truncate max-w-[220px]">
                {account.email}
              </span>
            )}
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="px-3.5 py-2 rounded-lg border border-black/15 hover:border-[#171717] bg-white text-xs font-bold text-[#171717] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>

        {/* Active Role Interface */}
        <main className="min-w-0 w-full">
          {isAdmin ? (
            <AdminView adminAccount={account} config={config} />
          ) : (
            <StudentView account={account} config={config} />
          )}
        </main>
      </div>

      <footer className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 pb-12 sm:pb-6 border-t border-black/10 flex flex-wrap justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#76766E]">
        <span>LUDOPATA 2.0 · Claridad. Confianza. Control.</span>
        <span>Sincronización en tiempo real · 100,000 estados discretos</span>
      </footer>

      <SubtleCornerClock />
    </div>
  );
}
