// Sample accounts are compiled only into explicitly requested preview builds.
// A configured production backend always disables this mode.
export const isDemoMode = import.meta.env?.VITE_DEMO_MODE === 'true'
  && !import.meta.env?.VITE_SUPABASE_URL;
export const demoUsers = [
  { id: '00000000-0000-4000-a000-000000000014', role: 'admin', name: 'Aditi Rao', email: 'admin@example.invalid' },
  { id: '00000000-0000-4000-a000-000000000013', role: 'inspector', name: 'Ravi Kumar', email: 'inspector@example.invalid' },
  { id: '00000000-0000-4000-a000-000000000011', role: 'customer', name: 'Priya Sharma', email: 'customer@example.invalid' },
];
export function getDemoUser() {
  let role = 'admin';
  try { role = sessionStorage.getItem('checksquare-preview-role') || role; } catch { /* default preview role */ }
  return demoUsers.find((user) => user.role === role) || demoUsers[0];
}
