export const NATIVE_AUTH_CALLBACK = 'com.bhupathi.checksquare.connected://auth/callback';
export const RECOVERY_PENDING_KEY = 'checksquare:password-recovery-pending';

export const isRecoveryPending = () => {
  try {
    const started = Number(localStorage.getItem(RECOVERY_PENDING_KEY));
    return started > 0 && Date.now() - started < 24 * 60 * 60 * 1000;
  } catch { return false; }
};
