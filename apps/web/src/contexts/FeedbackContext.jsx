import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Trash2, AlertTriangle, Info } from 'lucide-react';

/**
 * Lightweight context that lets any component pop a confirmation modal after
 * a successful save / delete / update transaction. Use this when a simple
 * toast feels too quiet for an important action.
 *
 *   const { showSuccess, showInfo } = useFeedback();
 *   await save();
 *   showSuccess('Saved', 'Your changes are stored.');
 */
const FeedbackCtx = createContext({
  showSuccess: () => {},
  showDeleted: () => {},
  showInfo: () => {},
  showWarning: () => {},
});

const VARIANTS = {
  success: {
    Icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-100',
    defaultTitle: 'All set',
  },
  deleted: {
    Icon: Trash2,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    ring: 'ring-rose-100',
    defaultTitle: 'Deleted',
  },
  info: {
    Icon: Info,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    ring: 'ring-sky-100',
    defaultTitle: 'Done',
  },
  warning: {
    Icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    ring: 'ring-amber-100',
    defaultTitle: 'Heads up',
  },
};

export const FeedbackProvider = ({ children }) => {
  const [state, setState] = useState({
    open: false, variant: 'success', title: '', description: '', actionLabel: 'OK',
  });

  const open = useCallback((variant, title, description, actionLabel = 'OK') => {
    setState({
      open: true,
      variant,
      title: title || VARIANTS[variant].defaultTitle,
      description: description || '',
      actionLabel,
    });
  }, []);

  const value = {
    showSuccess: (title, description, actionLabel) => open('success', title, description, actionLabel),
    showDeleted: (title, description, actionLabel) => open('deleted', title, description, actionLabel),
    showInfo:    (title, description, actionLabel) => open('info', title, description, actionLabel),
    showWarning: (title, description, actionLabel) => open('warning', title, description, actionLabel),
  };

  const { Icon, color, bg, ring } = VARIANTS[state.variant];

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className={`mx-auto mb-2 w-14 h-14 rounded-full ${bg} ring-4 ${ring} flex items-center justify-center`}>
              <Icon className={`w-7 h-7 ${color}`} strokeWidth={1.75} />
            </div>
            <AlertDialogTitle className="text-center font-display font-light text-2xl leading-tight">
              {state.title}
            </AlertDialogTitle>
            {state.description && (
              <AlertDialogDescription className="text-center text-sm leading-relaxed">
                {state.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction className="min-w-[120px]">{state.actionLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeedbackCtx.Provider>
  );
};

export const useFeedback = () => useContext(FeedbackCtx);
