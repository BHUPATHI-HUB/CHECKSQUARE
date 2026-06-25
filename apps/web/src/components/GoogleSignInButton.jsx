// Google sign-in button.  Renders only when Supabase Auth is configured;
// otherwise it returns null so the existing email + password form is the
// sole login option (no broken buttons).

import React from 'react';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext.jsx';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.165 6.656 3.58 9 3.58Z"/>
  </svg>
);

const GoogleSignInButton = ({ className = '' }) => {
  const { supabaseEnabled, signInWithGoogle, bridging } = useSupabaseAuth();
  if (!supabaseEnabled) return null;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={signInWithGoogle}
      disabled={bridging}
      data-testid="google-sign-in-button"
      className={`w-full h-11 gap-3 ${className}`}
    >
      <GoogleIcon />
      <span>{bridging ? 'Signing you in…' : 'Continue with Google'}</span>
    </Button>
  );
};

export default GoogleSignInButton;
