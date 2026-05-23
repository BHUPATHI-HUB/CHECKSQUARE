import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';

const AdminApprovalActions = ({ inspection, onStatusChanged }) => {
  const { updateInspectionStatus } = useInspectionStatus();
  const { user } = useAuth();
  const { showSuccess, showWarning } = useFeedback();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus) => {
    setIsUpdating(true);
    const success = await updateInspectionStatus(inspection.id, newStatus, user);
    if (success) {
      const addr = inspection.metadata?.propertyAddress || 'The inspection';
      if (newStatus === 'approved') {
        showSuccess('Inspection approved', `"${addr}" is now visible to the customer.`);
      } else if (newStatus === 'rejected') {
        showWarning('Inspection rejected', `"${addr}" was sent back to the inspector for changes.`);
      } else {
        showSuccess('Status updated', `"${addr}" is now marked as ${newStatus}.`);
      }
      if (onStatusChanged) onStatusChanged(newStatus);
    }
    setIsUpdating(false);
  };

  if (!inspection || inspection.status !== 'pending') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isUpdating}>
            <XCircle className="w-4 h-4 mr-2" /> Reject
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this inspection? The inspector will be notified and may need to submit a revised report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleStatusChange('rejected')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reject Inspection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" className="bg-[hsl(var(--status-approved))] hover:bg-[hsl(var(--status-approved))]/90 text-white" disabled={isUpdating}>
            <CheckCircle className="w-4 h-4 mr-2" /> Approve
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this inspection? This will finalize the report and make it available for download by the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleStatusChange('approved')}>
              Approve Inspection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminApprovalActions;