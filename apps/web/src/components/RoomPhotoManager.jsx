import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Plus, X, Camera, Upload, Lock, ShieldAlert, Check } from 'lucide-react';
import ContinuousCamera from '@/components/ContinuousCamera.jsx';
import { toast } from 'sonner';
import { normalizeCommentLibrary, getClassifications } from '@/utils/commentLibrary';
import {
  uploadInspectionPhoto,
  deleteInspectionPhoto,
} from '@/lib/supabasePhotoStorage.js';
import PhotoImg from '@/components/PhotoImg.jsx';
import CornerPhotoAlbum from '@/components/CornerPhotoAlbum.jsx';
import { normalizePhoto, photoCompletion } from '@/utils/defectTaxonomy.js';

const DEFAULT_SEVERITIES = [
  { id: 'major',    name: 'Major',    color: '#dc2626', definition: 'Compromises safety, structure or habitability.' },
  { id: 'minor',    name: 'Minor',    color: '#f97316', definition: 'No immediate risk; preventive maintenance needed.' },
  { id: 'cosmetic', name: 'Cosmetic', color: '#eab308', definition: 'Surface / aesthetic only.' },
];

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/**
 * DefectPhotoGallery — multi-image grid for a defect. Each image has its own
 * caption field; the defect's `description` acts as the shared note.
 */
const DefectPhotoGallery = ({ defect, onAdd, onUpdate, onRemove, classifications = [], severities = [], libraryEntries = [], organization = {} }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Backwards compat: derive photos from legacy beforePhoto/afterPhoto if needed
  const photos = (defect.photos && defect.photos.length > 0)
    ? defect.photos.map((photo) => normalizePhoto(photo, defect))
    : [
        defect.beforePhoto && { id: 'legacy_b', url: defect.beforePhoto.url, caption: '' },
        defect.afterPhoto  && { id: 'legacy_a', url: defect.afterPhoto.url,  caption: '' },
      ].filter(Boolean);
  const classificationOrder = new Map((organization.mode === 'custom' ? [...new Set([...(organization.classificationOrder || []), ...classifications])] : classifications).map((value, index) => [value, index]));
  const configuredSeverityOrder = Array.isArray(organization.severityOrder) && organization.severityOrder.length ? organization.severityOrder : severities.map((value) => value.name || value);
  const severityOrder = new Map(configuredSeverityOrder.map((value, index) => [value, index]));
  const originalNumbers = new Map(photos.map((photo, index) => [photo.id, index + 1]));
  const sortedPhotos = [...photos].sort((a, b) => {
    const severity = (severityOrder.get(a.severity) ?? 999) - (severityOrder.get(b.severity) ?? 999);
    const classification = (classificationOrder.get(a.classify) ?? 999) - (classificationOrder.get(b.classify) ?? 999);
    const primary = (organization.mode === 'classification-first' || (organization.mode === 'custom' && organization.primary === 'classification')) ? classification || severity : severity || classification;
    return primary || (a.photoNumber || 0) - (b.photoNumber || 0);
  });

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await onAdd(file);
    }
  };

  useEffect(() => {
    if (!selectedId || !sortedPhotos.some((p) => p.id === selectedId)) setSelectedId(sortedPhotos[0]?.id || null);
  }, [selectedId, sortedPhotos]);
  const selected = sortedPhotos.find((p) => p.id === selectedId) || sortedPhotos[0];

  return (
    <div className="rounded-2xl border bg-muted/20 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Issue photos
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">Select a photo to review or caption it.</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setCamOpen(true)}>
            <Camera className="w-4 h-4 mr-1.5" /> Take photos
          </Button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />
          {camOpen && <ContinuousCamera onClose={() => setCamOpen(false)} onDone={async (files) => { for (const file of files) { await onAdd(file); } }} onChooseFiles={() => fileRef.current?.click()} />}
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed bg-background text-center">
          <p className="text-xs text-muted-foreground">Add the first photo for this issue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
          <div className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto pr-1" aria-label="Issue photo list">
          {sortedPhotos.map((p, i) => (
              <button type="button" key={p.id} onClick={() => setSelectedId(p.id)} aria-label={`Select issue photo ${i + 1}`} aria-pressed={selected?.id === p.id}
                className={`group relative aspect-square shrink-0 overflow-hidden rounded-xl border-2 bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === p.id ? 'border-foreground shadow-md' : photoCompletion(p) === 'complete' ? 'border-emerald-500 opacity-100' : photoCompletion(p) === 'partial' ? 'border-amber-400 opacity-90' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                <PhotoImg photo={p} alt={`Issue photo ${i + 1}`} fit="cover" className="h-full w-full" />
                <span className="absolute bottom-1 left-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{String(p.photoNumber || originalNumbers.get(p.id) || i + 1).padStart(2, '0')}</span>
              </button>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-square shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="h-5 w-5" /><span className="text-[10px]">Add</span></button>
          </div>
          <div className="min-w-0 space-y-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-background">
              {selected ? <PhotoImg photo={selected} alt="Selected issue photo" className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Select a photo</div>}
              {selected && <Button type="button" size="icon" variant="destructive" className="absolute right-2 top-2 h-8 w-8 shadow" onClick={() => { deleteInspectionPhoto(selected); onRemove(selected.id); }} title="Remove selected photo"><X className="h-4 w-4" /></Button>}
            </div>
            {selected && <div className="space-y-3 rounded-xl border bg-background p-3">
              <div><Label className="text-xs text-muted-foreground">Photo title</Label><Input value={selected.title || ''} onChange={(e) => onUpdate(selected.id, { title: e.target.value })} placeholder="What does this photo show?" className="mt-1 h-9 text-xs" /></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><Label className="text-xs text-muted-foreground">Classify</Label><Select value={selected.classify || ''} onValueChange={(value) => onUpdate(selected.id, { classify: value })}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Select class…" /></SelectTrigger><SelectContent>{classifications.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs text-muted-foreground">Severity</Label><Select value={selected.severity || ''} onValueChange={(value) => onUpdate(selected.id, { severity: value })}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Select severity…" /></SelectTrigger><SelectContent>{severities.map((value) => <SelectItem key={value.name || value} value={value.name || value}>{value.name || value}</SelectItem>)}</SelectContent></Select></div></div>
              <div><Label className="text-xs text-muted-foreground">Comment preset</Label><Select value={selected.description || ''} onValueChange={(value) => { const match = libraryEntries.find((entry) => entry.text === value); onUpdate(selected.id, { description: value, caption: value, classify: match?.classify || selected.classify || '', severity: match?.severity || selected.severity || '' }); }}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder={libraryEntries.length ? 'Pick a comment…' : 'No presets configured'} /></SelectTrigger><SelectContent>{libraryEntries.filter((entry) => !selected.classify || entry.classify === selected.classify).map((entry) => <SelectItem key={entry.id} value={entry.text}>{entry.text}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs text-muted-foreground">Comment / notes</Label><Textarea value={selected.description || selected.caption || ''} onChange={(e) => onUpdate(selected.id, { description: e.target.value, caption: e.target.value })} placeholder="Describe what this photo shows…" className="mt-1 text-xs" rows={2} /></div>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
};

const RoomPhotoManager = ({ open, onOpenChange, room, onSave }) => {
  const { settings } = useSettings();
  const [cornerPhotos, setCornerPhotos] = useState(room?.cornerPhotos || []);
  const [defects, setDefects] = useState(room?.defects || []);
  const [activeTab, setActiveTab] = useState('photos');
  const uploadBusy = useRef(false);
  const [cornerUpload, setCornerUpload] = useState({ active: false, done: 0, total: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCornerPhotos(room?.cornerPhotos || []);
    setDefects(room?.defects || []);
    setActiveTab('photos');
    setSaving(false);
  }, [room?.id, open]);

  const severities = useMemo(() => {
    const fromSettings = settings?.severityLevels;
    if (Array.isArray(fromSettings) && fromSettings.length > 0) {
      return fromSettings.map((s, i) => ({
        id: s.id || String(i),
        name: s.name,
        color: s.color || DEFAULT_SEVERITIES[i % DEFAULT_SEVERITIES.length].color,
        definition: s.definition || '',
      }));
    }
    return DEFAULT_SEVERITIES;
  }, [settings?.severityLevels]);

  const roomKey = room?.name || 'General';
  const libraryEntries = useMemo(
    () => normalizeCommentLibrary(settings?.commentLibrary),
    [settings?.commentLibrary],
  );
  const classifications = useMemo(
    () => getClassifications(libraryEntries),
    [libraryEntries],
  );
  // Legacy room-keyed presets (only used as a last-resort fallback if
  // someone migrated old object-shape data that we couldn't classify).
  const commentSuggestions = useMemo(() => {
    if (libraryEntries.length > 0) return [];
    const lib = settings?.commentLibrary || {};
    if (Array.isArray(lib)) return [];
    return lib[roomKey] || lib['General'] || [];
  }, [settings?.commentLibrary, roomKey, libraryEntries.length]);

  const addCornerPhotos = async (files) => {
    const picked = Array.from(files || []).filter(Boolean);
    if (!picked.length || uploadBusy.current) return;
    uploadBusy.current = true;
    setCornerUpload({ active: true, done: 0, total: picked.length });
    let added = 0;
    try {
      for (let i = 0; i < picked.length; i += 1) {
        try {
          const record = await uploadInspectionPhoto(picked[i], {
            inspectionId: room?.id || 'draft', roomKey,
            maxEdge: settings?.reportImages?.uploadMaxEdge ?? 1600,
            quality: settings?.reportImages?.uploadQuality ?? 0.85,
          });
          setCornerPhotos(prev => [...prev, { ...record, corner: `Corner ${prev.length + 1}` }]);
          added += 1;
        } catch {
          // Keep successful photos when one file cannot be processed.
        }
        setCornerUpload({ active: true, done: i + 1, total: picked.length });
      }
      if (added) toast.success(`${added} corner photo${added === 1 ? '' : 's'} added`);
      if (added < picked.length) toast.error(`${picked.length - added} photos could not be added. Choose those files again to retry.`);
    } finally {
      uploadBusy.current = false;
      setCornerUpload({ active: false, done: 0, total: 0 });
    }
  };

  const removeCornerPhoto = (index) => {
    if (uploadBusy.current) return;
    // Removing from the draft must not destroy a saved photo if Cancel is used.
    setCornerPhotos(prev => prev.filter((_, i) => i !== index).map((photo, i) => ({ ...photo, corner: `Corner ${i + 1}` })));
  };
  const changeOpen = (next) => {
    if (!next && uploadBusy.current) {
      toast.info('Please wait until the photos finish adding.');
      return;
    }
    onOpenChange(next);
  };
  const phaseBLocked = cornerPhotos.length === 0;

  const addDefect = () => {
    if (phaseBLocked) {
      toast.error('Upload at least one ambient/corner photo first.');
      return;
    }
    setDefects(prev => [
      ...prev,
      {
        id: `defect_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        title: '',
        description: '',
        severity: severities[0]?.name || 'Minor',
        photos: [],
      },
    ]);
    toast.success('Defect row added');
  };

  const updateDefect = (id, patch) => {
    setDefects(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const addDefectPhoto = async (defectId, file) => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setDefects(prev => prev.map(d => d.id === defectId
        ? { ...d, photos: [...(d.photos || []), { id: `p_${Date.now()}`, photoNumber: (d.photos || []).reduce((max, p, i) => Math.max(max, Number(p.photoNumber) || i + 1), 0) + 1, url, caption: '' }] }
        : d));
      toast.success('Photo added to defect');
    } catch {
      toast.error('Failed to read photo');
    }
  };

  const updateDefectPhoto = (defectId, photoId, patch) => {
    setDefects(prev => prev.map(d => d.id === defectId
      ? { ...d, photos: (d.photos || []).map(p => p.id === photoId ? { ...p, ...patch } : p) }
      : d));
  };

  const removeDefectPhoto = (defectId, photoId) => {
    setDefects(prev => prev.map(d => d.id === defectId
      ? { ...d, photos: (d.photos || []).filter(p => p.id !== photoId) }
      : d));
    toast.success('Photo removed');
  };

  const removeDefect = (id) => {
    setDefects(prev => prev.filter(d => d.id !== id));
    toast.success('Defect removed');
  };

  const handleSave = async () => {
    if (uploadBusy.current || saving) return;
    setSaving(true);
    try {
      // Normalize legacy beforePhoto/afterPhoto into the new photos[] schema
      const normalized = defects.map(d => {
        if (d.photos && d.photos.length > 0) return d;
        const migrated = [];
        if (d.beforePhoto) migrated.push({ id: `m_${Date.now()}_b`, url: d.beforePhoto.url, caption: '' });
        if (d.afterPhoto)  migrated.push({ id: `m_${Date.now()}_a`, url: d.afterPhoto.url, caption: '' });
        return migrated.length ? { ...d, photos: migrated, beforePhoto: undefined, afterPhoto: undefined } : { ...d, photos: [] };
      });
      // Keep the dialog open until the parent has accepted the update. This
      // also handles future async persistence without reporting false success.
      await Promise.resolve(onSave({ ...room, cornerPhotos, defects: normalized }));
      toast.success('Room saved successfully');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save room: ' + (err?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const severityFor = (name) => severities.find(s => s.name === name) || severities[0];

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 overflow-hidden border-l bg-stone-50 p-0 [&>button]:top-5 [&>button]:right-5 [&>button]:border-0 [&>button]:shadow-none">
        <SheetHeader className="shrink-0 space-y-1 border-b bg-background px-6 py-5 pr-20 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Room inspection</p>
          <SheetTitle className="text-2xl font-semibold tracking-tight">{room?.name}</SheetTitle>
          <SheetDescription className="text-xs">Capture the room. Record what needs attention.</SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 bg-background px-6 py-3">
            <TabsList aria-label="Room sections" className="grid h-11 w-full grid-cols-2 rounded-xl bg-stone-100">
              <TabsTrigger value="photos" className="h-9 gap-2 rounded-lg"><Camera className="h-4 w-4" />Photos<span className="text-xs opacity-60">{cornerPhotos.length}</span></TabsTrigger>
              <TabsTrigger value="defects" className="h-9 gap-2 rounded-lg"><ShieldAlert className="h-4 w-4" />Defects<span className="text-xs opacity-60">{defects.length}</span></TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <TabsContent value="photos" forceMount hidden={activeTab !== 'photos'} className="mt-0 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold tracking-tight">Your room album</h3><p className="mt-1 text-xs text-muted-foreground">Wide-angle photos from each corner.</p></div>
            </div>
            <CornerPhotoAlbum photos={cornerPhotos} onAdd={addCornerPhotos} onRemove={removeCornerPhoto} progress={cornerUpload} />
          </TabsContent>
          <TabsContent value="defects" forceMount hidden={activeTab !== 'defects'} className="mt-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  Room defects
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Photograph each issue, then add the details.
                </p>
              </div>
              <Button onClick={addDefect} size="sm" disabled={phaseBLocked}>
                <Plus className="w-4 h-4 mr-2" /> Add Defect
              </Button>
            </div>

            {phaseBLocked && (
              <div className="mb-4 p-4 rounded-xl border bg-background text-muted-foreground flex items-center gap-3 text-sm">
                <Lock className="w-5 h-5 flex-shrink-0" />
                <p>
                  Add a corner photo in the Photos tab to start recording defects.
                </p>
              </div>
            )}

            <fieldset disabled={phaseBLocked} className={phaseBLocked ? 'opacity-50 pointer-events-none space-y-6' : 'space-y-6'}>
              {defects.map((defect, idx) => {
                const sev = severityFor(defect.severity);
                return (
                  <Card
                    key={defect.id}
                    className="overflow-hidden rounded-2xl border border-stone-200 shadow-sm bg-background"
                  >
                    {/* Header strip — defect number, severity badge, delete */}
                    <div
                      className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-stone-900 text-[11px] font-semibold text-white"
                          title={sev?.definition}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <Badge
                          variant="outline"
                          className="gap-1.5 rounded-full border-stone-200 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sev?.color || '#9ca3af' }} /> {sev?.name || 'Defect'}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          {defect.title || defect.classify || 'Untitled defect'}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDefect(defect.id)}
                        title="Remove defect"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <CardContent className="pt-5 space-y-5">
                      {/* Optional title */}
                      <div className="hidden">
                        <Label className="text-xs text-muted-foreground">Title (optional)</Label>
                        <Input
                          value={defect.title}
                          onChange={e => updateDefect(defect.id, { title: e.target.value })}
                          placeholder="Short label e.g. Cracked tile near doorway"
                          className="mt-1.5"
                        />
                      </div>

                      {/* Classify / Comment / Severity */}
                      <div className="hidden grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Classify</Label>
                          <Select
                            value={defect.classify || ''}
                            onValueChange={(v) => updateDefect(defect.id, { classify: v, description: '', severity: defect.severity })}
                          >
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder={classifications.length === 0 ? 'No classes' : 'Select class...'} />
                            </SelectTrigger>
                            <SelectContent>
                              {classifications.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Comment preset</Label>
                          <Select
                            value={defect.description || ''}
                            onValueChange={(v) => {
                              const match = libraryEntries.find(
                                (e) => e.text === v && (!defect.classify || e.classify === defect.classify),
                              ) || libraryEntries.find((e) => e.text === v);
                              updateDefect(defect.id, {
                                description: v,
                                classify: match?.classify || defect.classify || '',
                                severity: match?.severity || defect.severity,
                              });
                            }}
                          >
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder={
                                libraryEntries.length === 0
                                  ? (commentSuggestions.length === 0 ? 'No presets' : 'Pick preset...')
                                  : (defect.classify ? 'Select comment...' : 'Pick a class first')
                              } />
                            </SelectTrigger>
                            <SelectContent>
                              {libraryEntries
                                .filter((e) => !defect.classify || e.classify === defect.classify)
                                .map((e) => (
                                  <SelectItem key={e.id} value={e.text}>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="inline-block w-2 h-2 rounded-full"
                                        style={{ backgroundColor: severityFor(e.severity)?.color || '#9ca3af' }}
                                      />
                                      <span>{e.text}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              {libraryEntries.length === 0 && commentSuggestions.map((c, i) => (
                                <SelectItem key={`${c}_${i}`} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Severity</Label>
                          <Select
                            value={defect.severity}
                            onValueChange={(v) => updateDefect(defect.id, { severity: v })}
                          >
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {severities.map(s => (
                                <SelectItem key={s.id} value={s.name}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></div>
                                    {s.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Description / notes */}
                      <div className="hidden">
                        <Label className="text-xs text-muted-foreground">
                          Description / notes <span className="text-[10px] italic">(shown under each photo)</span>
                        </Label>
                        <Textarea
                          value={defect.description}
                          onChange={e => updateDefect(defect.id, { description: e.target.value })}
                          placeholder="Describe the issue. You can edit a preset comment freely."
                          className="mt-1.5"
                          rows={2}
                        />
                      </div>

                      {/* Photo gallery */}
                      <DefectPhotoGallery
                        defect={defect}
                        onAdd={(file) => addDefectPhoto(defect.id, file)}
                        onUpdate={(pid, patch) => { updateDefectPhoto(defect.id, pid, patch); updateDefect(defect.id, { title: patch.title ?? defect.title, classify: patch.classify ?? defect.classify, description: patch.description ?? defect.description, severity: patch.severity ?? defect.severity }); }}
                        onRemove={(pid) => removeDefectPhoto(defect.id, pid)}
                        classifications={classifications}
                        severities={severities}
                        libraryEntries={libraryEntries}
                        organization={settings?.inspectionOrganization || {}}
                      />
                    </CardContent>
                  </Card>
                );
              })}

              {!phaseBLocked && defects.length === 0 && (
                <div className="text-center py-12 bg-background rounded-2xl border">
                  <ShieldAlert className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium text-sm">No defects recorded</p><p className="mt-1 text-xs text-muted-foreground">Found something? Use Add Defect to document it.</p>
                </div>
              )}
            </fieldset>
          </TabsContent>
          </div>
        </Tabs>

        <SheetFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t bg-background px-6 py-4 sm:justify-between sm:space-x-0">
          <Button variant="ghost" className="h-11 px-3 text-muted-foreground" disabled={cornerUpload.active || saving} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button className="h-11 min-w-36 rounded-xl bg-stone-900 text-white hover:bg-stone-800" disabled={cornerUpload.active || saving} onClick={handleSave}>
            <Check className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save room'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default RoomPhotoManager;
