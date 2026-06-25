import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Users, ShieldCheck, HardHat, UserRound, Search, RefreshCw, Mail, Phone, KeyRound, Upload, Camera } from 'lucide-react';
import pb from '@/lib/pocketbaseClient.js';
import data from '@/services/dataService.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/Header.jsx';

/**
 * Admin "User Management" page.
 *
 *   • Table view  — list / search / filter every user, with role-coloured
 *     badges, contact info, created date, and inline delete.
 *   • Org chart   — admins on top, then inspectors, then customers.
 *     Each user renders as a card; cards group by role with reporting
 *     lines drawn between the role lanes.
 *   • Create user — modal with role selector (admin / inspector / customer),
 *     name / email / phone / address / password fields.
 *
 *   Backed by the standard PocketBase `users` collection.  Migration
 *   1779700001 grants admins the row-level rules they need to list,
 *   update and delete anyone in the org.
 */

const ROLE_META = {
  admin:     { label: 'Admin',     Icon: ShieldCheck, color: 'bg-amber-500',  text: 'text-amber-700',  ring: 'ring-amber-300/60' },
  inspector: { label: 'Inspector', Icon: HardHat,     color: 'bg-sky-500',    text: 'text-sky-700',    ring: 'ring-sky-300/60'   },
  customer:  { label: 'Customer',  Icon: UserRound,   color: 'bg-emerald-500',text: 'text-emerald-700',ring: 'ring-emerald-300/60'},
};

const RoleBadge = ({ role }) => {
  const meta = ROLE_META[role] || ROLE_META.customer;
  const { Icon } = meta;
  return (
    <Badge variant="secondary" className={`gap-1.5 ${meta.text} bg-white border`}>
      <Icon className="w-3 h-3" />
      <span className="uppercase tracking-wider text-[10px]">{meta.label}</span>
    </Badge>
  );
};

const initialForm = { name: '', email: '', phone: '', address: '', password: '', role: 'inspector' };

const AdminUserManagementPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [view, setView] = useState('table');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialForm);
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [pwTarget, setPwTarget] = useState(null);   // { user, password }
  const [pwSaving, setPwSaving] = useState(false);
  const [avatarBusyId, setAvatarBusyId] = useState(null);
  const fileInputRef = useRef(null);
  const avatarTargetRef = useRef(null);

  // ── Data ───────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // getFullList with a generous sort so the newest accounts surface first.
      // $autoCancel:false so rapid navigation away from the page doesn't
      // surface a noisy autocancel toast — we don't depend on a stale request
      // ever returning, we always start a fresh one.
      const list = await data.listUsers({ sort: '-created' });
      setUsers(list);
    } catch (err) {
      if (String(err?.message || '').includes('autocancel')) return;
      console.error('Failed to load users', err);
      toast.error(err?.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived collections ────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone, u.address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [users, query, roleFilter]);

  const grouped = useMemo(() => ({
    admin:     users.filter((u) => u.role === 'admin'),
    inspector: users.filter((u) => u.role === 'inspector'),
    customer:  users.filter((u) => u.role === 'customer'),
  }), [users]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e?.preventDefault?.();
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast.error('Name, email and password are required.');
      return;
    }
    if (createForm.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    try {
      await data.createUser({
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        passwordConfirm: createForm.password,
        phone: createForm.phone || '',
        address: createForm.address || '',
        role: createForm.role,
        emailVisibility: true,
      });
      toast.success(`${ROLE_META[createForm.role]?.label || 'User'} created.`);
      setCreateOpen(false);
      setCreateForm(initialForm);
      refresh();
    } catch (err) {
      console.error('Create user failed', err);
      toast.error(err?.response?.message || err?.message || 'Could not create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await data.deleteUser(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.name || deleteTarget.email}.`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      console.error('Delete user failed', err);
      toast.error(err?.response?.message || err?.message || 'Could not delete user.');
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (u, nextRole) => {
    if (nextRole === u.role) return;
    if (u.id === currentUser?.id && nextRole !== 'admin') {
      toast.error('You cannot demote your own admin account.');
      return;
    }
    try {
      await data.updateUser(u.id, { role: nextRole });
      toast.success(`${u.name || u.email} is now ${ROLE_META[nextRole]?.label || nextRole}.`);
      refresh();
    } catch (err) {
      console.error('Update role failed', err);
      toast.error(err?.response?.message || err?.message || 'Could not update role.');
    }
  };

  // ── Password reset (admin sets a new password directly) ──────────
  const handlePasswordSave = async () => {
    if (!pwTarget?.user) return;
    if (!pwTarget.password || pwTarget.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setPwSaving(true);
    try {
      await data.updateUser(pwTarget.user.id, {
        password: pwTarget.password,
        passwordConfirm: pwTarget.password,
      });
      toast.success(`Password reset for ${pwTarget.user.name || pwTarget.user.email}.`);
      setPwTarget(null);
    } catch (err) {
      console.error('Password reset failed', err);
      toast.error(err?.response?.message || err?.message || 'Could not reset password.');
    } finally {
      setPwSaving(false);
    }
  };

  // ── Avatar upload (file picker triggered from row/card) ──────────
  const openAvatarPicker = (u) => {
    avatarTargetRef.current = u;
    fileInputRef.current?.click();
  };
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = avatarTargetRef.current;
    avatarTargetRef.current = null;
    if (!file || !target) return;
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      toast.error('Please choose a JPG, PNG, WebP or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar must be 5 MB or smaller.');
      return;
    }
    setAvatarBusyId(target.id);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await data.updateUser(target.id, fd);
      toast.success(`Avatar updated for ${target.name || target.email}.`);
      refresh();
    } catch (err) {
      console.error('Avatar upload failed', err);
      toast.error(err?.response?.message || err?.message || 'Could not upload avatar.');
    } finally {
      setAvatarBusyId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="editorial-eyebrow text-[10px]">Organization · People</p>
            <h1 className="font-display font-light text-3xl mt-1 leading-tight">
              User <em className="text-secondary italic">management.</em>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Create, demote, promote and remove the accounts that power your inspection workflow.
              Switch to the org chart for a quick visual overview of who reports to whom.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="rounded-full">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="rounded-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New user
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {Object.entries(ROLE_META).map(([role, meta]) => {
            const count = grouped[role]?.length || 0;
            const { Icon } = meta;
            return (
              <div key={role} className="border rounded-xl p-4 bg-card flex items-center gap-4">
                <div className={`w-11 h-11 rounded-full ${meta.color} text-white flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="editorial-eyebrow text-[9px]">{meta.label}s</p>
                  <p className="font-display text-2xl leading-none mt-0.5">{count}</p>
                </div>
              </div>
            );
          })}
        </div>

        <Tabs value={view} onValueChange={setView} className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <TabsList>
              <TabsTrigger value="table"><Users className="w-3.5 h-3.5 mr-1.5" /> Directory</TabsTrigger>
              <TabsTrigger value="chart"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Org chart</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, phone…"
                  className="pl-8 h-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="inspector">Inspectors</SelectItem>
                  <SelectItem value="customer">Customers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="table" className="mt-0">
            <DirectoryTable
              users={filtered}
              loading={loading}
              currentUserId={currentUser?.id}
              onRoleChange={handleRoleChange}
            onDelete={(u) => setDeleteTarget(u)}
              onPasswordReset={(u) => setPwTarget({ user: u, password: '' })}
              onAvatarUpload={openAvatarPicker}
              avatarBusyId={avatarBusyId}
            />
          </TabsContent>

          <TabsContent value="chart" className="mt-0">
            <OrgChart grouped={grouped} loading={loading} currentUserId={currentUser?.id} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateForm(initialForm); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="editorial-eyebrow text-[10px]">Organization · Add</p>
            <DialogTitle className="font-display font-light text-2xl mt-1 leading-tight">
              New <em className="text-secondary italic">teammate.</em>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              The account is provisioned immediately. Share the password securely.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="inspector">Inspector</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Full name *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Password (min 8 chars) *</Label>
              <Input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="mt-1 font-mono"
                required
                minLength={8}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <Input
                  value={createForm.address}
                  onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating} className="rounded-full">Cancel</Button>
              <Button type="submit" disabled={creating} className="rounded-full">
                {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hidden file input (avatar) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleAvatarChange}
      />

      {/* Reset password dialog */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => { if (!o) setPwTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <p className="editorial-eyebrow text-[10px]">Security · Reset</p>
            <DialogTitle className="font-display font-light text-2xl mt-1 leading-tight">
              New <em className="text-secondary italic">password.</em>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Set a new password for <span className="font-medium text-foreground">{pwTarget?.user?.name || pwTarget?.user?.email}</span>.
              They will need to use this on their next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Password (min 8 chars)</Label>
              <Input
                type="text"
                value={pwTarget?.password || ''}
                onChange={(e) => setPwTarget((p) => p ? { ...p, password: e.target.value } : p)}
                className="mt-1 font-mono"
                minLength={8}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPwTarget(null)} disabled={pwSaving} className="rounded-full">Cancel</Button>
              <Button onClick={handlePasswordSave} disabled={pwSaving} className="rounded-full">
                {pwSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                Save password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name || deleteTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account and revokes their access immediately.
              Inspections, appointments and chats they own may become orphaned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const DirectoryTable = ({ users, loading, currentUserId, onRoleChange, onDelete, onPasswordReset, onAvatarUpload, avatarBusyId }) => {
  if (loading) {
    return (
      <div className="border rounded-xl bg-card p-12 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading users…
      </div>
    );
  }
  if (!users.length) {
    return (
      <div className="border rounded-xl bg-card p-12 text-center text-sm text-muted-foreground">
        No users match this filter.
      </div>
    );
  }
  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size={36} onUpload={onAvatarUpload} busy={avatarBusyId === u.id} />
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {u.name || '—'}
                          {isMe && <span className="ml-2 text-[10px] uppercase tracking-wider text-secondary">You</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs space-y-0.5">
                      {u.phone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3 h-3" /> {u.phone}</p>
                      )}
                      {u.address && (
                        <p className="text-muted-foreground truncate max-w-[200px]" title={u.address}>{u.address}</p>
                      )}
                      {!u.phone && !u.address && <span className="text-muted-foreground/60">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={u.role} onValueChange={(v) => onRoleChange(u, v)}>
                      <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="inspector">Inspector</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.created ? new Date(u.created).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="Reset password"
                        onClick={() => onPasswordReset(u)}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        title={isMe ? 'You cannot delete yourself' : 'Delete user'}
                        disabled={isMe}
                        onClick={() => onDelete(u)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Avatar = ({ user, role, name, size = 36, onUpload, busy }) => {
  const r = role || user?.role || 'customer';
  const meta = ROLE_META[r] || ROLE_META.customer;
  const displayName = name || user?.name || user?.email || '?';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const avatarUrl = user?.avatar && user?.collectionId && user?.id
    ? pb.files.getURL(user, user.avatar, { thumb: '72x72' })
    : null;
  return (
    <button
      type="button"
      onClick={onUpload ? () => onUpload(user) : undefined}
      disabled={!onUpload || busy}
      title={onUpload ? 'Upload new avatar' : displayName}
      style={{ width: size, height: size }}
      className={`relative rounded-full ${avatarUrl ? '' : meta.color} text-white flex items-center justify-center text-xs font-medium ring-2 ${meta.ring} overflow-hidden ${onUpload ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} disabled:opacity-50`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
      {busy && (
        <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-3 h-3 animate-spin" />
        </span>
      )}
      {onUpload && !busy && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow-sm border">
          <Camera className="w-2.5 h-2.5 text-foreground" />
        </span>
      )}
    </button>
  );
};

const OrgChart = ({ grouped, loading, currentUserId }) => {
  if (loading) {
    return (
      <div className="border rounded-xl bg-card p-12 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading org chart…
      </div>
    );
  }
  const lanes = [
    { role: 'admin',     subtitle: 'Owns settings, billing & every user' },
    { role: 'inspector', subtitle: 'Conducts on-site inspections' },
    { role: 'customer',  subtitle: 'Receives inspection reports' },
  ];
  return (
    <div className="border rounded-xl bg-card p-6 overflow-x-auto">
      <div className="space-y-10 min-w-[640px]">
        {lanes.map((lane, idx) => {
          const meta = ROLE_META[lane.role];
          const list = grouped[lane.role] || [];
          const { Icon } = meta;
          return (
            <div key={lane.role} className="relative">
              {/* Connector line from previous lane */}
              {idx > 0 && (
                <div className="absolute left-1/2 -top-7 w-px h-7 bg-border" aria-hidden />
              )}
              <div className="flex items-center justify-center mb-4">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${meta.color} text-white shadow-sm`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-medium">{meta.label}s · {list.length}</span>
                </div>
              </div>
              <p className="text-center text-[11px] text-muted-foreground uppercase tracking-wider mb-4">{lane.subtitle}</p>

              {list.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground italic">No {meta.label.toLowerCase()}s yet.</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-3">
                  {list.map((u) => (
                    <OrgChartNode key={u.id} user={u} isMe={u.id === currentUserId} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OrgChartNode = ({ user, isMe }) => {
  const meta = ROLE_META[user.role] || ROLE_META.customer;
  return (
    <div className={`w-56 border rounded-lg bg-background p-3 flex items-center gap-3 hover:shadow-md transition-shadow ${isMe ? 'ring-2 ring-secondary' : ''}`}>
      <Avatar user={user} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {user.name || '—'}
          {isMe && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-secondary">You</span>}
        </p>
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
          <Mail className="w-2.5 h-2.5" /> {user.email}
        </p>
        {user.phone && (
          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
            <Phone className="w-2.5 h-2.5" /> {user.phone}
          </p>
        )}
      </div>
    </div>
  );
};

export default AdminUserManagementPage;
