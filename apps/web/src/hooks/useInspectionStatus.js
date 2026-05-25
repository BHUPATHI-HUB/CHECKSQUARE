import { useCallback } from 'react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

// Fields needed to render the dashboard list rows + drive sort/search/filter
// + power inline actions (approve/reject/chat/delete). Crucially we DO NOT
// fetch the four large JSON fields (`roomInspections`, `areaCalculations`,
// `waterQuality`, `scoreOverrides`) — those can balloon to megabytes per row
// because they hold every uploaded photo URL, room note, and area calc, and
// transferring them for 50+ records over Cloudflare Tunnel is what was making
// the admin/inspector dashboards take many seconds to load. The full record
// is fetched on-demand by AdminDownloadReport and AdminInspectionDetailModal
// when the operator actually opens a row.
const LIST_FIELDS = [
  'id', 'collectionId', 'collectionName',
  'status', 'inspector', 'inspectorName', 'customer',
  'created', 'updated',
  'metadata', // small (~few KB) — needed for address/date/preparedFor in rows
  'propertyType', 'includeScore',
  // propertyMetrics is a tiny JSON array (door height / ceiling height
  // etc.) — small enough to safely ship with list rows and needed by the
  // report renderer downstream.
  'propertyMetrics',
  'deletedAt', 'deletedBy', 'deletionReason',
  'approvedBy', 'approvedAt', 'rejectedBy', 'rejectedAt',
].join(',');

// All inspection CRUD now goes through PocketBase. We keep the same hook surface
// so existing callers (AdminDashboard, InspectorDashboard, InspectionForm, etc.)
// just need to await the returned promises.
export const useInspectionStatus = () => {
  // List ACTIVE (non-deleted) inspections. Server-side filtering by role is
  // enforced by the collection rules, so admins get everything and inspectors
  // only get their own.
  const getAllInspections = useCallback(async (options = {}) => {
    try {
      const records = await pb.collection('inspections').getFullList({
        filter: 'deletedAt = null',
        sort: '-created',
        fields: LIST_FIELDS,
        $autoCancel: false,
        ...options,
      });
      return records;
    } catch (error) {
      if (error?.isAbort) return [];
      console.error('Failed to fetch inspections', error);
      return [];
    }
  }, []);

  const getInspectionsForInspector = useCallback(async (inspectorId) => {
    if (!inspectorId) return [];
    try {
      return await pb.collection('inspections').getFullList({
        filter: `inspector = "${inspectorId}" && deletedAt = null`,
        sort: '-created',
        fields: LIST_FIELDS,
        $autoCancel: false,
      });
    } catch (error) {
      if (error?.isAbort) return [];
      console.error('Failed to fetch inspector inspections', error);
      return [];
    }
  }, []);

  const getDeletedInspections = useCallback(async () => {
    try {
      return await pb.collection('inspections').getFullList({
        filter: 'deletedAt != null',
        sort: '-deletedAt',
        fields: LIST_FIELDS,
        $autoCancel: false,
      });
    } catch (error) {
      if (error?.isAbort) return [];
      console.error('Failed to fetch deleted inspections', error);
      return [];
    }
  }, []);

  const getInspectionById = useCallback(async (inspectionId) => {
    if (!inspectionId) return null;
    try {
      return await pb.collection('inspections').getOne(inspectionId);
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('Failed to fetch inspection', error);
      return null;
    }
  }, []);

  const updateInspectionStatus = useCallback(async (inspectionId, newStatus, user, extra = {}) => {
    try {
      const payload = { status: newStatus, ...extra };
      if (newStatus === 'approved') {
        payload.approvedBy = user?.name || user?.email || 'Admin';
        payload.approvedAt = new Date().toISOString();
      } else if (newStatus === 'rejected') {
        payload.rejectedBy = user?.name || user?.email || 'Admin';
        payload.rejectedAt = new Date().toISOString();
      }
      await pb.collection('inspections').update(inspectionId, payload);
      return true;
    } catch (error) {
      console.error('Failed to update inspection status', error);
      toast.error('Failed to update status');
      return false;
    }
  }, []);

  const softDeleteInspection = useCallback(async (inspectionId, user, reason = 'Manual Admin Deletion') => {
    try {
      await pb.collection('inspections').update(inspectionId, {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.name || user?.email || 'Admin',
        deletionReason: reason,
      });
      return true;
    } catch (error) {
      console.error('Failed to delete inspection', error);
      toast.error('Failed to delete report');
      return false;
    }
  }, []);

  const restoreInspection = useCallback(async (inspectionId) => {
    try {
      await pb.collection('inspections').update(inspectionId, {
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
      });
      return true;
    } catch (error) {
      console.error('Failed to restore inspection', error);
      toast.error('Failed to restore report');
      return false;
    }
  }, []);

  const permanentlyDeleteInspection = useCallback(async (inspectionId) => {
    try {
      await pb.collection('inspections').delete(inspectionId);
      return true;
    } catch (error) {
      console.error('Failed to permanently delete inspection', error);
      toast.error('Failed to permanently delete');
      return false;
    }
  }, []);

  const saveInspection = useCallback(async (inspectionData, existingId = null) => {
    try {
      const payload = {
        metadata: inspectionData.metadata || {},
        areaCalculations: inspectionData.areaCalculations || [],
        // Phase 2 free-form metrics (door height, ceiling height, wall height, …).
        // Schema column added in migration 1779800002; before that, PB silently
        // dropped this field on every save and the metrics never made it into
        // the generated PDF/DOCX.
        propertyMetrics: inspectionData.propertyMetrics || [],
        waterQuality: inspectionData.waterQuality || {},
        roomInspections: inspectionData.roomInspections || [],
        propertyType: inspectionData.propertyType || 'Residential',
        status: inspectionData.status || 'pending',
        inspector: inspectionData.inspector,
        inspectorName: inspectionData.inspectorName,
        customer: inspectionData.customer || null,
        // Scoring fields — passed through so PDF/DOCX can honour them.
        includeScore: inspectionData.includeScore ?? null,
        scoreOverrides: inspectionData.scoreOverrides || {},
        // Optional status-related fields supplied by the form (e.g. when
        // re-submitting a previously rejected inspection we want to clear
        // the prior rejection metadata).
        ...(inspectionData.rejectedBy !== undefined && { rejectedBy: inspectionData.rejectedBy }),
        ...(inspectionData.rejectedAt !== undefined && { rejectedAt: inspectionData.rejectedAt }),
        ...(inspectionData.approvedBy !== undefined && { approvedBy: inspectionData.approvedBy }),
        ...(inspectionData.approvedAt !== undefined && { approvedAt: inspectionData.approvedAt }),
      };
      let record;
      if (existingId) {
        record = await pb.collection('inspections').update(existingId, payload);
      } else {
        record = await pb.collection('inspections').create(payload);

        // Spec §7: every new inspection auto-provisions a group chat
        // thread that includes the assigned inspector, the customer (if any)
        // and every admin in the system so all sides can collaborate in
        // context. We do this best-effort -- a failure here must NOT block
        // the inspection from being saved.
        try {
          const adminIds = await pb
            .collection('users')
            .getFullList({ filter: 'role = "admin"', fields: 'id', $autoCancel: false })
            .then((rows) => rows.map((r) => r.id));

          const participants = Array.from(new Set([
            ...adminIds,
            record.inspector,
            record.customer,
          ].filter(Boolean)));

          if (participants.length >= 2) {
            await pb.collection('chats').create({
              type: 'group',
              participants,
              inspectionId: record.id,
            }, { $autoCancel: false });
          }
        } catch (chatErr) {
          // Likely cause: chats.participants maxSelect not yet bumped by the
          // 1779500003 migration on this PB instance. Log and move on.
          console.warn('Auto-create chat thread skipped:', chatErr?.message || chatErr);
        }
      }
      return record;
    } catch (error) {
      console.error('Failed to save inspection', error);
      toast.error('Failed to save inspection');
      return null;
    }
  }, []);

  return {
    getAllInspections,
    getInspectionsForInspector,
    getDeletedInspections,
    getInspectionById,
    updateInspectionStatus,
    softDeleteInspection,
    restoreInspection,
    permanentlyDeleteInspection,
    saveInspection,
  };
};
