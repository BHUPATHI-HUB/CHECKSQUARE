import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleStatusChange = async (newStatus) => {
    setIsUpdating(true);
    try {
      const reason = newStatus === 'rejected' ? rejectionReason.trim() : undefined;
      if (newStatus === 'rejected' && !reason) return;
      const success = await updateInspectionStatus(inspection.id, newStatus, user, { version: inspection.version, ...(reason && { rejectionReason: reason }) });
      if (success) {
        const addr = inspection.metadata?.propertyAddress || 'The inspection';
        if (newStatus === 'approved') {
          showSuccess('Inspection approved', `"${addr}" is now visible to the customer.`);
        } else if (newStatus === 'rejected') {
          showWarning('Inspection rejected', `"${addr}" was sent back to the inspector for changes.`);
          setRejectOpen(false);
          setRejectionReason('');
        } else {
          showSuccess('Status updated', `"${addr}" is now marked as ${newStatus}.`);
        }
        onStatusChanged?.(newStatus);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (!inspection || inspection.status !== 'pending') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <AlertDialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) setRejectionReason(''); }}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isUpdating}>
            <XCircle className="w-4 h-4 mr-2" /> Reject
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              Tell the inspector what needs correction. They will see your reason with the rejected report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Reason for rejection"
            placeholder="Describe what needs correction…"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            maxLength={1000}
            className="min-h-28"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); handleStatusChange('rejected'); }}
              disabled={isUpdating || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isUpdating ? 'Rejecting…' : 'Reject inspection'}
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
