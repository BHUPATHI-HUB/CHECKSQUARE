import React from 'react';
import { Toaster } from 'sonner';
import { AlertCircle, Check, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

export default function AppToaster() {
  return (
    <Toaster
      className="checksquare-toaster"
      position="top-center"
      offset={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      visibleToasts={3}
      closeButton
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'cs-toast',
          title: 'cs-toast-title',
          description: 'cs-toast-description',
          icon: 'cs-toast-icon',
          closeButton: 'cs-toast-close',
        },
      }}
      icons={{
        success: <Check size={17} strokeWidth={2.4} />,
        error: <AlertCircle size={17} strokeWidth={2.2} />,
        warning: <TriangleAlert size={17} strokeWidth={2.2} />,
        info: <Info size={17} strokeWidth={2.2} />,
        loading: <LoaderCircle size={17} className="animate-spin" />,
        close: <X size={14} />,
      }}
    />
  );
}
