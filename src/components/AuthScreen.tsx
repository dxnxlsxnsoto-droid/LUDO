import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Lock, Mail, User } from 'lucide-react';
import { auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

type AuthMode = 'login' | 'register' | 'reset';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [needsEmailProviderSetup, setNeedsEmailProviderSetup] = useState(false);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code ?? '';
    setErrorCode(code || null);
    switch (code) {
      case 'auth/operation-not-allowed':
      case 'auth/admin-restricted-operation':
      case 'auth/configuration-not-found':
        setNeedsEmailProviderSetup(true);
        return 'El registro con Correo y Contraseña aún no está activado en tu proyecto de Firebase.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Correo o contraseña incorrectos. Verifica tus datos o usa "Recuperar".';
      case 'auth/email-already-in-use':
        return 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'Ingresa un correo electrónico válido.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos seguidos. Espera unos minutos antes de reintentar.';
      case 'auth/popup-closed-by-user':
        return 'Se cerró la ventana de acceso con Google antes de completar.';
      case 'auth/popup-blocked':
        return 'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes e intenta de nuevo.';
      case 'auth/unauthorized-domain':
        return 'Este dominio aún no está autorizado en Firebase Authentication (Authorized domains).';
      default:
        return err instanceof Error ? err.message : 'Ocurrió un error al autenticar.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorCode(null);
    setInfoMsg(null);
    setNeedsEmailProviderSetup(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else if (mode === 'register') {
        const cleanName = displayName.trim();
        if (cleanName.length < 2) {
          setErrorMsg('Ingresa tu nombre completo (mínimo 2 caracteres).');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: cleanName });
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // User still lands on EmailVerificationScreen where they can resend
        }
      } else {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfoMsg(
          'Si existe una cuenta asociada a ese correo, hemos enviado un enlace seguro de recuperación. Revisa tu bandeja de entrada y correo no deseado.'
        );
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setNeedsEmailProviderSetup(false);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F3E7] text-[#171717] flex flex-col justify-between px-4 py-8">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-black/10 pb-5">
        <div className="text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0">
          LUDOPATA <span className="text-[#890149]">2.0</span>
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#76766E]">
          Gestión de Riesgo &amp; Puntos
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Brief Game Description */}
        <section className="lg:col-span-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#890149]">
            LUDOPATA 2.0
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12] text-balance">
            ¡Bienvenidos a LUDOPATA 2.0!
          </h1>
          <p className="text-[15px] text-[#4A4A44] leading-relaxed max-w-md">
            Gira la ruleta para ganar puntos y canjearlos por premios increíbles en clase. Inicia sesión o crea tu cuenta para comenzar la partida.
          </p>
        </section>

        {/* Auth Card */}
        <section className="lg:col-span-6">
          <div className="bg-white border border-black/10 rounded-2xl p-6 sm:p-8">
            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#E7E7D8] rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 px-3 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white text-[#171717]'
                    : 'text-[#4A4A44] hover:text-[#171717]'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 px-3 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white text-[#171717]'
                    : 'text-[#4A4A44] hover:text-[#171717]'
                }`}
              >
                Crear Cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 px-3 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'reset'
                    ? 'bg-white text-[#171717]'
                    : 'text-[#4A4A44] hover:text-[#171717]'
                }`}
              >
                Recuperar
              </button>
            </div>

            <div className="mb-5">
              <h2 className="text-xl font-extrabold tracking-tight">
                {mode === 'login' && 'Ingresa con tu correo y contraseña'}
                {mode === 'register' && 'Registro de nuevo alumno'}
                {mode === 'reset' && 'Recuperación segura de cuenta'}
              </h2>
              <p className="text-xs text-[#76766E] mt-1">
                {mode === 'login' &&
                  'Accede a tu mesa de ruleta o consola de administrador.'}
                {mode === 'register' &&
                  'Tu cuenta inicia en 0.00 pts y requiere verificación de correo.'}
                {mode === 'reset' &&
                  'Te enviaremos un enlace oficial de restablecimiento de contraseña.'}
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3.5 rounded-lg border border-[#890149]/30 bg-[#890149]/5 text-[#890149] text-xs font-semibold flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p>{errorMsg}</p>
                  {needsEmailProviderSetup && (
                    <div className="text-[11px] font-medium text-[#4A4A44] leading-relaxed space-y-1.5">
                      <p>
                        Por seguridad, Firebase activa solo Google por defecto. Para permitir que los alumnos creen cuenta con correo y contraseña:
                      </p>
                      <ol className="list-decimal pl-4 space-y-0.5">
                        <li>
                          Abre{' '}
                          <a
                            href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-[#890149] underline"
                          >
                            Firebase Console → Authentication → Sign-in method
                          </a>
                          .
                        </li>
                        <li>
                          Haz clic en <span className="font-bold">Agregar nuevo proveedor</span> →{' '}
                          <span className="font-bold">Correo electrónico/contraseña</span> →{' '}
                          actívalo y presiona <span className="font-bold">Guardar</span>.
                        </li>
                      </ol>
                      <p>
                        También puedes entrar inmediatamente haciendo clic en{' '}
                        <span className="font-bold">Continuar con Google</span> abajo.
                      </p>
                    </div>
                  )}
                  {errorCode && (
                    <p className="text-[10px] font-mono text-[#76766E]">
                      Código: {errorCode}
                    </p>
                  )}
                </div>
              </div>
            )}

            {infoMsg && (
              <div className="mb-4 p-3.5 rounded-lg border border-[#166534]/25 bg-[#166534]/5 text-[#166534] text-xs font-semibold flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{infoMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-[#4A4A44] mb-1.5">
                    Nombre completo del alumno
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#76766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ej. María Fernanda López"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-[#FAFAF5] border border-black/15 rounded-lg focus:outline-none focus:border-[#890149]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#4A4A44] mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#76766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alumno@correo.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-[#FAFAF5] border border-black/15 rounded-lg focus:outline-none focus:border-[#890149]"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#4A4A44]">
                      Contraseña
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          setErrorMsg(null);
                          setInfoMsg(null);
                        }}
                        className="text-xs font-bold text-[#890149] hover:underline"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#76766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-[#FAFAF5] border border-black/15 rounded-lg focus:outline-none focus:border-[#890149]"
                    />
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-[#4A4A44] mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#76766E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-[#FAFAF5] border border-black/15 rounded-lg focus:outline-none focus:border-[#890149]"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <span>
                  {loading
                    ? 'Procesando...'
                    : mode === 'login'
                      ? 'Entrar a la plataforma'
                      : mode === 'register'
                        ? 'Crear cuenta y verificar correo'
                        : 'Enviar enlace de recuperación'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/10" />
              </div>
              <div className="relative flex justify-center text-[11px] font-bold uppercase tracking-wider">
                <span className="bg-white px-3 text-[#76766E]">o continuar con</span>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-lg border border-black/15 hover:border-[#171717] bg-white text-sm font-bold text-[#171717] flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="max-w-5xl w-full mx-auto pt-4 border-t border-black/10 flex flex-wrap justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#76766E]">
        <span>LUDOPATA 2.0 · Claridad. Confianza. Control.</span>
        <span>Autenticación verificada &amp; Recuperación Segura</span>
      </footer>
    </div>
  );
};
