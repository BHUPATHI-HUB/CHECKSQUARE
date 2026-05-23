
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, sessionWarning, extendSession, logout } = useAuth();
  const location = useLocation();

  // Spec §1 Navigation Isolation: re-push our own state on every browser
  // back-button press inside an authenticated dashboard so the user can never
  // navigate "back" into a stale form or pre-login screen by mistake. Sign-out
  // remains the only way to leave the protected area.
  useEffect(() => {
    if (!user) return;
    window.history.pushState(null, '', window.location.href);
    const handler = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [user, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-muted-foreground font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login but save the attempted url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role checking
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    // Admin has access to everything, otherwise check strict match
    const fallbackPath = user.role === 'customer' ? '/customer' : 
                         user.role === 'inspector' ? '/inspector/dashboard' : '/admin/dashboard';
    return <Navigate to={fallbackPath} replace />;
  }

  return (
    <>
      {children}
      <Dialog open={sessionWarning} onOpenChange={(open) => !open && logout()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Are you still there?
            </DialogTitle>
            <DialogDescription>
              You've been inactive for almost 30 minutes. For your security, we'll
              sign you out in 1 minute unless you choose to stay signed in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end mt-4">
            <Button variant="outline" onClick={logout}>Log Out</Button>
            <Button onClick={extendSession}>Stay Signed In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProtectedRoute;
