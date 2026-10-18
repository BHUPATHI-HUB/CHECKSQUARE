import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const FeedbackCtx = createContext(null);

export const FeedbackProvider = ({ children }) => {
  const resolver = useRef(null);
  const [confirmation, setConfirmation] = useState(null);

  const finish = useCallback((accepted) => {
    const resolve = resolver.current;
    resolver.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);

  const confirmAction = useCallback((options) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setConfirmation(options);
  }), []);

  const notify = (kind, title, description) => toast[kind](title, {
    description,
    duration: kind === 'error' ? 6000 : 4200,
  });

  const value = {
    showSuccess: (title, description) => notify('success', title, description),
    showDeleted: (title, description) => notify('success', title, description),
    showInfo: (title, description) => notify('info', title, description),
    showWarning: (title, description) => notify('warning', title, description),
    confirmAction,
  };

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      <AlertDialog open={!!confirmation} onOpenChange={(open) => { if (!open) finish(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title || 'Are you sure?'}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmation?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={() => finish(true)}
            >
              {confirmation?.confirmLabel || 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeedbackCtx.Provider>
  );
};

export const useFeedback = () => useContext(FeedbackCtx);
