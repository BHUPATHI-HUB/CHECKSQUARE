import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Trash2, Plus, X, Camera, Upload, Lock, ShieldAlert } from 'lucide-react';
import WebcamCaptureModal from '@/components/WebcamCaptureModal.jsx';
import { toast } from 'sonner';
import { normalizeCommentLibrary, getClassifications } from '@/utils/commentLibrary';
import {
  uploadInspectionPhoto,
  getInspectionPhotoUrl,
  deleteInspectionPhoto,
} from '@/lib/supabasePhotoStorage.js';
import PhotoImg from '@/components/PhotoImg.jsx';

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
 * PhotoSlot — single capture-or-upload widget with two clearly separated
 * actions. iOS/Android show the camera UI only when `capture` is set; some
 * desktop browsers ignore `capture` entirely and fall back to file picker.
 */
const PhotoSlot = ({ label, photo, onChange, onRemove, compact = false, ariaLabel, inspectionId, roomKey }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);

  // Mobile UA detection — on phones the native file-input `capture` attribute
  // is the best UX. On desktop we open our own webcam modal because browsers
  // ignore `capture` and just show a file picker.
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const consumeFile = async (file) => {
    if (!file) return;
    try {
      // Supabase-first: uploads to inspection-photos bucket and returns
      // { id, storageKey, capturedAt }.  Falls back to legacy base64 when
      // Supabase isn't configured (see lib/supabasePhotoStorage.js).
      const record = await uploadInspectionPhoto(file, {
        inspectionId: inspectionId || 'draft',
        roomKey: roomKey || 'misc',
      });
      onChange(record);
      toast.success('Photo added');
    } catch (e) {
      console.error(e);
      toast.error('Failed to read photo');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    consumeFile(file);
  };

  return (
    <div className={`border rounded-xl p-3 bg-background ${compact ? '' : ''}`}>
      {label && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>}
      {photo ? (
        <div className="relative aspect-video rounded-lg overflow-hidden group">
          <PhotoImg photo={photo} alt={label || ariaLabel || 'photo'} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={() => { deleteInspectionPhoto(photo); onRemove(); toast.success('Photo removed'); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed rounded-lg bg-muted/30">
            <Camera className="w-6 h-6 text-muted-foreground/60" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => (isMobile ? camRef.current?.click() : setCamOpen(true))}
            >
              <Camera className="w-4 h-4 mr-1.5" /> Capture
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" /> Upload
            </Button>
          </div>
          {/* Camera capture: presence of capture attribute opens rear camera on mobile */}
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          {/* File upload: no capture attribute -> opens file picker on every device */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <WebcamCaptureModal open={camOpen} onOpenChange={setCamOpen} onCapture={consumeFile} />
        </div>
      )}
    </div>
  );
};

/**
 * DefectPhotoGallery — multi-image grid for a defect. Each image has its own
 * caption field; the defect's `description` acts as the shared note.
 */
const DefectPhotoGallery = ({ defect, onAdd, onUpdate, onRemove }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  // Backwards compat: derive photos from legacy beforePhoto/afterPhoto if needed
  const photos = (defect.photos && defect.photos.length > 0)
    ? defect.photos
    : [
        defect.beforePhoto && { id: 'legacy_b', url: defect.beforePhoto.url, caption: '' },
        defect.afterPhoto  && { id: 'legacy_a', url: defect.afterPhoto.url,  caption: '' },
      ].filter(Boolean);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onAdd(file);
    e.target.value = '';
  };

  return (
    <div className="border rounded-xl p-4 bg-background">
      <div className="flex items-center justify-between mb-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Photographs ({photos.length})
        </Label>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => (isMobile ? camRef.current?.click() : setCamOpen(true))}>
            <Camera className="w-4 h-4 mr-1.5" /> Capture
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Upload
          </Button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <WebcamCaptureModal open={camOpen} onOpenChange={setCamOpen} onCapture={onAdd} />
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-muted-foreground/20 rounded-lg">
          <p className="text-xs text-muted-foreground">No photographs yet. Capture or upload one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {photos.map((p, i) => (
            <div key={p.id} className="border rounded-lg overflow-hidden bg-muted/30">
              <div className="relative">
                <PhotoImg photo={p} alt={`Defect photo ${i + 1}`} className="w-full h-44 object-cover" />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => { deleteInspectionPhoto(p); onRemove(p.id); }}
                  title="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
                <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/60 text-white text-[10px] uppercase tracking-wider rounded">
                  #{String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="p-2">
                <Input
                  value={p.caption || ''}
                  onChange={(e) => onUpdate(p.id, { caption: e.target.value })}
                  placeholder="Caption for this photo…"
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RoomPhotoManager = ({ open, onOpenChange, room, onSave }) => {
  const { settings } = useSettings();
  const [cornerPhotos, setCornerPhotos] = useState(room?.cornerPhotos || []);
  const [defects, setDefects] = useState(room?.defects || []);

  useEffect(() => {
    setCornerPhotos(room?.cornerPhotos || []);
    setDefects(room?.defects || []);
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

  // Spec update: corners are now numbered (Corner 1..N). Default to 4 slots
  // but inspector can add more without limit.
  const [extraCornerCount, setExtraCornerCount] = useState(0);
  const totalSlots = Math.max(4 + extraCornerCount, cornerPhotos.length);
  const cornerSlots = useMemo(
    () => Array.from({ length: totalSlots }, (_, i) => `Corner ${i + 1}`),
    [totalSlots],
  );

  const setCornerPhoto = (cornerLabel, newPhoto) => {
    setCornerPhotos(prev => {
      const filtered = prev.filter(p => p.corner !== cornerLabel);
      if (!newPhoto) return filtered;
      return [...filtered, { ...newPhoto, corner: cornerLabel }];
    });
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
        ? { ...d, photos: [...(d.photos || []), { id: `p_${Date.now()}`, url, caption: '' }] }
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

  const handleSave = () => {
    try {
      // Normalize legacy beforePhoto/afterPhoto into the new photos[] schema
      const normalized = defects.map(d => {
        if (d.photos && d.photos.length > 0) return d;
        const migrated = [];
        if (d.beforePhoto) migrated.push({ id: `m_${Date.now()}_b`, url: d.beforePhoto.url, caption: '' });
        if (d.afterPhoto)  migrated.push({ id: `m_${Date.now()}_a`, url: d.afterPhoto.url, caption: '' });
        return migrated.length ? { ...d, photos: migrated, beforePhoto: undefined, afterPhoto: undefined } : { ...d, photos: [] };
      });
      onSave({ ...room, cornerPhotos, defects: normalized });
      toast.success('Room saved successfully');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save room: ' + (err?.message || 'unknown error'));
    }
  };

  const severityFor = (name) => severities.find(s => s.name === name) || severities[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto border-l">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl">{room?.name} — Photo Manager</SheetTitle>
          <SheetDescription>
            Phase A captures ambient context of the room. Phase B unlocks automatically once at least one corner photo exists.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-8">
          {/* ───────── Phase A ───────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" /> Phase A — Corner Photos
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Wide-angle baseline shots. Add as many as needed.
                </p>
              </div>
              <Badge variant={cornerPhotos.length > 0 ? 'secondary' : 'destructive'} className="text-xs">
                {cornerPhotos.length} captured
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cornerSlots.map((cornerLabel) => {
                const existing = cornerPhotos.find(p => p.corner === cornerLabel);
                return (
                  <div key={cornerLabel} className="border rounded-xl p-4 bg-muted/30">
                    <p className="font-medium text-sm mb-2">{cornerLabel}</p>
                    <PhotoSlot
                      label={null}
                      photo={existing}
                      onChange={(photo) => setCornerPhoto(cornerLabel, photo)}
                      onRemove={() => setCornerPhoto(cornerLabel, null)}
                      ariaLabel={cornerLabel}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExtraCornerCount(c => c + 1)}
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add another corner slot
              </Button>
            </div>
          </section>

          {/* ───────── Phase B / Room Defects ───────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-primary" /> Room Defects
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Document each issue with a photo and notes. All fields are optional except the photo.
                </p>
              </div>
              <Button onClick={addDefect} size="sm" disabled={phaseBLocked}>
                <Plus className="w-4 h-4 mr-2" /> Add Defect
              </Button>
            </div>

            {phaseBLocked && (
              <div className="mb-4 p-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 text-amber-900 flex items-center gap-3 text-sm">
                <Lock className="w-5 h-5 flex-shrink-0" />
                <p>
                  Please upload at least one Phase A corner photo to establish environmental context
                  before logging defects.
                </p>
              </div>
            )}

            <fieldset disabled={phaseBLocked} className={phaseBLocked ? 'opacity-50 pointer-events-none space-y-6' : 'space-y-6'}>
              {defects.map((defect, idx) => {
                const sev = severityFor(defect.severity);
                return (
                  <Card
                    key={defect.id}
                    className="overflow-hidden border-l-4 shadow-sm bg-background"
                    style={{ borderLeftColor: sev?.color || '#9ca3af' }}
                  >
                    {/* Header strip — defect number, severity badge, delete */}
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-2.5 border-b"
                      style={{ background: `${sev?.color || '#9ca3af'}10` }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: sev?.color || '#9ca3af' }}
                          title={sev?.definition}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wider border-0 text-white"
                          style={{ background: sev?.color || '#9ca3af' }}
                        >
                          {sev?.name || 'Defect'}
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
                      <div>
                        <Label className="text-xs text-muted-foreground">Title (optional)</Label>
                        <Input
                          value={defect.title}
                          onChange={e => updateDefect(defect.id, { title: e.target.value })}
                          placeholder="Short label e.g. Cracked tile near doorway"
                          className="mt-1.5"
                        />
                      </div>

                      {/* Classify / Comment / Severity */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <div>
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
                        onUpdate={(pid, patch) => updateDefectPhoto(defect.id, pid, patch)}
                        onRemove={(pid) => removeDefectPhoto(defect.id, pid)}
                      />
                    </CardContent>
                  </Card>
                );
              })}

              {!phaseBLocked && defects.length === 0 && (
                <div className="text-center py-8 bg-muted/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground text-sm">No defects recorded yet.</p>
                </div>
              )}
            </fieldset>
          </section>
        </div>

        <SheetFooter className="mt-8 border-t pt-4 sticky bottom-0 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default RoomPhotoManager;
