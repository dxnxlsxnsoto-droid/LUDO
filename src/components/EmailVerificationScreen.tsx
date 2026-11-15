import React, { useState } from 'react';
import { sendEmailVerification, signOut, type User } from 'firebase/auth';
import { CheckCircle2, LogOut, MailCheck, RefreshCw } from 'lucide-react';
import { auth } from '../firebase';

interface EmailVerificationScreenProps {
  user: User;
  onVerified: () => void;
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  user,
  onVerified,
}) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckVerified = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await user.reload();
      await user.getIdToken(true);
      if (auth.currentUser?.emailVerified) {
        onVerified();
      } else {
        setError('Tu correo aún aparece como no verificado. Revisa tu bandeja o spam y abre el enlace.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comprobar la verificación.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendEmailVerification(user);
      setMessage('Hemos reenviado un nuevo correo de verificación a tu dirección.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Espera unos momentos antes de solicitar otro correo.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F3E7] text-[#171717] flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-white border border-black/10 rounded-2xl p-8 space-y-5">
        <div className="w-11 h-11 rounded-xl bg-[#890149]/10 text-[#890149] flex items-center justify-center">
          <MailCheck className="w-6 h-6" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#890149]">
            Verificación de seguridad
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">
            Confirma tu correo electrónico
          </h1>
          <p className="text-sm text-[#4A4A44] mt-2 leading-relaxed">
            Enviamos un enlace de verificación a{' '}
            <span className="font-bold text-[#171717]">{user.email}</span>. Ábrelo para activar tu cuenta de alumno y proteger la recuperación de contraseña.
          </p>
        </div>

        {message && (
          <div className="p-3 rounded-lg border border-[#166534]/25 bg-[#166534]/5 text-[#166534] text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg border border-[#890149]/25 bg-[#890149]/5 text-[#890149] text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleCheckVerified}
            className="w-full py-3 px-4 rounded-lg bg-[#890149] hover:bg-[#6f013b] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            <span>Ya verifiqué mi correo</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleResend}
            className="w-full py-2.5 px-4 rounded-lg border border-black/15 hover:border-[#171717] bg-white text-sm font-bold text-[#171717] transition-colors disabled:opacity-50"
          >
            Reenviar enlace de verificación
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => signOut(auth)}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-bold text-[#76766E] hover:text-[#171717] flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
};
