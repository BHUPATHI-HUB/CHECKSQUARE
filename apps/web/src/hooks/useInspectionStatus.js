import { useCallback } from 'react';
import { toast } from 'sonner';
import data from '@/services/dataService.js';
import { putPendingInspection, enqueue, listPendingInspections, getPendingInspection, putCachedList, getCachedList } from '@/lib/localStore.js';
import { requestSync, isNetworkError } from '@/services/syncEngine.js';

// Stale-while-revalidate cache so navigating away from a dashboard and back
// shows the last known list INSTANTLY instead of a blank screen plus a full
// re-fetch every time. Dashboards seed their initial state from here and then
// refresh in the background. Mutations clear it so stale rows don't linger.
const inspectionListCache = { all: null, byInspector: {}, deleted: null };
export const getCachedAllInspections = () => inspectionListCache.all;
export const getCachedInspectorInspections = (id) => inspectionListCache.byInspector[id] || null;
const clearInspectionListCache = () => {
  inspectionListCache.all = null;
  inspectionListCache.byInspector = {};
  inspectionListCache.deleted = null;
};

// Prepend locally-saved (not-yet-synced) inspections that the server list
// doesn't have yet, so offline work stays visible on the dashboards.
const mergePending = (serverRows, pending) => {
  if (!pending || pending.length === 0) return serverRows;
  const ids = new Set((serverRows || []).map((r) => r.id));
  const extra = pending.filter((p) => !ids.has(p.id));
  return [...extra, ...(serverRows || [])];
};

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
    let records;
    try {
      records = await data.listInspections({ filter: 'deletedAt = null', sort: '-created', ...options });
      inspectionListCache.all = records;
      putCachedList('inspections:all', records);
    } catch (error) {
      if (!error?.isAbort) console.error('Failed to fetch inspections', error);
      records = inspectionListCache.all || (await getCachedList('inspections:all')) || [];
    }
    return mergePending(records, await listPendingInspections());
  }, []);

  const getInspectionsForInspector = useCallback(async (inspectorId) => {
    if (!inspectorId) return [];
    const cacheKey = `inspections:inspector:${inspectorId}`;
    let records;
    try {
      records = await data.listInspections({
        filter: `inspector = "${inspectorId}" && deletedAt = null`,
        sort: '-created',
      });
      inspectionListCache.byInspector[inspectorId] = records;
      putCachedList(cacheKey, records);
    } catch (error) {
      if (!error?.isAbort) console.error('Failed to fetch inspector inspections', error);
      records = inspectionListCache.byInspector[inspectorId] || (await getCachedList(cacheKey)) || [];
    }
    const pending = (await listPendingInspections()).filter((p) => p.inspector === inspectorId);
    return mergePending(records, pending);
  }, []);

  const getDeletedInspections = useCallback(async () => {
    try {
      return await data.listInspections({ filter: 'deletedAt != null', sort: '-deletedAt' });
    } catch (error) {
      if (error?.isAbort) return [];
      console.error('Failed to fetch deleted inspections', error);
      return [];
    }
  }, []);

  const getInspectionById = useCallback(async (inspectionId) => {
    if (!inspectionId) return null;
    try {
      return await data.getInspection(inspectionId);
    } catch (error) {
      // Offline-created inspection not yet synced, or no connectivity → serve
      // the full local copy so it can still be viewed/edited.
      if (error?.status === 404 || error?.code === 'PGRST116' || isNetworkError(error)) {
        const local = await getPendingInspection(inspectionId);
        if (local) return local;
        if (error?.status === 404 || error?.code === 'PGRST116') return null;
      }
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
      await data.updateInspection(inspectionId, payload);
      clearInspectionListCache();
      return true;
    } catch (error) {
      console.error('Failed to update inspection status', error);
      toast.error('Failed to update status');
      return false;
    }
  }, []);

  const softDeleteInspection = useCallback(async (inspectionId, user, reason = 'Manual Admin Deletion') => {
    try {
      await data.updateInspection(inspectionId, {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.name || user?.email || 'Admin',
        deletionReason: reason,
      });
      clearInspectionListCache();
      return true;
    } catch (error) {
      console.error('Failed to delete inspection', error);
      toast.error('Failed to delete report');
      return false;
    }
  }, []);

  const restoreInspection = useCallback(async (inspectionId) => {
    try {
      await data.updateInspection(inspectionId, {
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
      });
      clearInspectionListCache();
      return true;
    } catch (error) {
      console.error('Failed to restore inspection', error);
      toast.error('Failed to restore report');
      return false;
    }
  }, []);

  const permanentlyDeleteInspection = useCallback(async (inspectionId) => {
    try {
      await data.deleteInspection(inspectionId);
      clearInspectionListCache();
      return true;
    } catch (error) {
      console.error('Failed to permanently delete inspection', error);
      toast.error('Failed to permanently delete');
      return false;
    }
  }, []);

  const saveInspection = useCallback(async (inspectionData, existingId = null) => {
    const payload = {
      metadata: inspectionData.metadata || {},
      areaCalculations: inspectionData.areaCalculations || [],
      // Phase 2 free-form metrics (door height, ceiling height, wall height, …).
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

    // Client-stable id so an offline draft has a permanent identity that the
    // sync engine can upsert later without creating duplicates.
    const clientId = existingId || inspectionData.id
      || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    // Persist locally + queue for sync. Used when offline OR when a network
    // write fails, so the inspector never loses a submission with no signal.
    const queueLocally = async () => {
      const now = new Date().toISOString();
      const localRecord = {
        id: clientId, ...payload, created: now, updated: now, syncStatus: 'pending',
      };
      await putPendingInspection(localRecord);
      await enqueue({ type: 'upsertInspection', id: clientId });
      requestSync();
      clearInspectionListCache();
      toast.success("Saved on device — it'll sync automatically when you're back online.");
      return localRecord;
    };

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) return queueLocally();

    try {
      let record;
      if (existingId) {
        record = await data.updateInspection(existingId, payload);
      } else {
        record = await data.createInspection(payload);

        // Every new inspection auto-provisions a group chat thread (inspector +
        // customer + admins). Best-effort — a failure must NOT block the save.
        try {
          const adminIds = await data.listUsersByRole('admin').then((rows) => rows.map((r) => r.id));
          const participants = Array.from(new Set([
            ...adminIds, record.inspector, record.customer,
          ].filter(Boolean)));
          if (participants.length >= 2) {
            await data.createChat({ type: 'group', participants, inspectionId: record.id });
          }
        } catch (chatErr) {
          console.warn('Auto-create chat thread skipped:', chatErr?.message || chatErr);
        }
      }
      clearInspectionListCache();
      return record;
    } catch (error) {
      // Lost connectivity mid-save → don't fail, queue it instead.
      if (isNetworkError(error)) return queueLocally();
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
