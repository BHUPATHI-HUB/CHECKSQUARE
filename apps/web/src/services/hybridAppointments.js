// Shared scheduling lives in Supabase. A per-user snapshot is read-only when
// connectivity drops; never acknowledge a local appointment mutation as saved.
const isConnectionError = (error) => /failed to fetch|fetch failed|network|load failed|timeout/i
  .test(String(error?.message || error));

export function createHybridAppointments({ cloud, getCachedList, putCachedList, isOnline, configured }) {
  const requireCloud = () => {
    if (!configured) throw new Error('Supabase is not configured; appointments are unavailable.');
  };
  const requireConnection = () => {
    requireCloud();
    if (!isOnline()) throw new Error('Connect to the internet to change an appointment.');
  };

  return {
    async listAppointments({ filter = '', sort = '-scheduledAt', cacheUserId = null } = {}) {
      requireCloud();
      const key = cacheUserId ? `appointments:${cacheUserId}:${JSON.stringify([filter, sort])}` : null;
      const cached = async () => key ? getCachedList(key) : null;
      if (!isOnline()) {
        const rows = await cached();
        if (rows !== null) return rows;
        throw new Error('Appointments are unavailable offline until this schedule has loaded online.');
      }
      try {
        const rows = await cloud.listAppointments({ filter, sort });
        if (key) await putCachedList(key, rows);
        return rows;
      } catch (error) {
        if (isConnectionError(error)) {
          const rows = await cached();
          if (rows !== null) return rows;
        }
        throw error;
      }
    },
    createAppointment(payload) {
      requireConnection();
      return cloud.createAppointment(payload);
    },
    updateAppointment(id, payload) {
      requireConnection();
      return cloud.updateAppointment(id, payload);
    },
    transitionAppointment(id, payload) {
      requireConnection();
      return cloud.transitionAppointment(id, payload);
    },
  };
}
