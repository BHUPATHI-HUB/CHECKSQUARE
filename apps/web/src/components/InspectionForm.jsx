
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import RoomPhotoManager from '@/components/RoomPhotoManager.jsx';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { computeInspectionScore, gradeFor, PROPCHK_PRIORITY_META } from '@/utils/scoring';
import WebcamCaptureModal from '@/components/WebcamCaptureModal.jsx';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertCircle, FileImage as ImageIcon, Camera, Upload, Droplets, X, Calendar as CalendarIcon, User as UserIcon, MapPin, Home as HomeIcon } from 'lucide-react';

const PREDEFINED_ROOMS = [
  'Living Room',
  'Dining Room',
  'Family Room',
  'Kitchen',
  'Pantry',
  'Master Bedroom',
  'Bedroom 2',
  'Bedroom 3',
  'Bedroom 4',
  'Guest Bedroom',
  'Kids Room',
  'Study Room',
  'Home Office',
  'Pooja Room',
  'Master Bathroom',
  'Bathroom 2',
  'Powder Room',
  'Common Bathroom',
  'Foyer / Entrance',
  'Hallway / Corridor',
  'Staircase',
  'Balcony',
  'Balcony 2',
  'Terrace',
  'Utility / Laundry',
  'Servant Room',
  'Store Room',
  'Garage / Parking',
  'Basement',
  'Attic',
  'Garden / Yard',
];
const PROPERTY_TYPES = ['Villa', 'Apartment', 'Gated Community', 'Commercial', 'Residential'];

// Unit conversion to square feet — single source of truth for the geometric
// engine (Spec §2). All inputs normalize into sft for the final report.
const UNIT_FACTOR_TO_FEET = {
  ft: 1,
  in: 1 / 12,
  m: 3.28084,
  cm: 0.0328084,
};
const computeAreaSft = (length, width, lengthUnit = 'ft', widthUnit = 'ft') => {
  const L = parseFloat(length) || 0;
  const W = parseFloat(width) || 0;
  const lf = L * (UNIT_FACTOR_TO_FEET[lengthUnit] || 1);
  const wf = W * (UNIT_FACTOR_TO_FEET[widthUnit] || 1);
  return Math.round(lf * wf * 100) / 100;
};

// Hardware brand catalog is now admin-editable in Settings; this is only used
// as a defensive default if settings haven't loaded yet.
const DEFAULT_BRAND_CATALOG = {
  Switchboards: ['Legrand', 'Schneider Electric', 'Anchor', 'Havells', 'Crabtree'],
  Plumbing:     ['Kohler', 'Jaquar', 'Hindware', 'Cera', 'Grohe', 'Roca'],
  Appliances:   ['Whirlpool', 'GE', 'LG', 'Samsung', 'Bosch', 'IFB'],
  Tiles:        ['Kajaria', 'Somany', 'Asian Granito', 'Nitco', 'Johnson'],
  Paints:       ['Asian Paints', 'Berger', 'Nerolac', 'Dulux'],
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/**
 * BrandPhotoRow — selected-brand chip with Capture + Upload buttons that map
 * to two separate hidden file inputs so mobile camera & file picker each work
 * deterministically.
 */
const BrandPhotoRow = ({ brand, onSetPhoto, onRemoveBrand }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const consumeFile = async (file) => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      onSetPhoto({ id: `brand_${Date.now()}`, url, capturedAt: new Date().toISOString() });
    } catch {
      toast.error('Failed to read photo');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    consumeFile(file);
  };

  return (
    <div className="border rounded-xl p-3 bg-background flex items-center gap-3">
      <div className="flex-shrink-0">
        {brand.photo ? (
          <div className="relative w-16 h-16 rounded-lg overflow-hidden">
            <img src={brand.photo.url} alt={brand.name} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onSetPhoto(null)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
              title="Remove photo"
            >×</button>
          </div>
        ) : (
          <div className="w-16 h-16 rounded-lg border-2 border-dashed bg-muted/40 flex items-center justify-center">
            <Camera className="w-5 h-5 text-muted-foreground/60" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{brand.name}</p>
          <Badge variant="outline" className="text-[10px]">{brand.category || 'Other'}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => (isMobile ? camRef.current?.click() : setCamOpen(true))}>
            <Camera className="w-3.5 h-3.5 mr-1" /> Capture
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload
          </Button>
        </div>
        <input ref={camRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={fileRef} type="file" accept="image/*"                       className="hidden" onChange={handleFile} />
        <WebcamCaptureModal open={camOpen} onOpenChange={setCamOpen} onCapture={consumeFile} />
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemoveBrand} title="Remove brand">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
};

/**
 * WaterQualityPhotos — capture or upload one or more photos of the water test
 * (TDS meter, pH strip, source tap, etc.). Images are stored as data-URLs in
 * `waterQuality.images: [{ id, url, capturedAt }]` and rendered on the PDF.
 */
const WaterQualityPhotos = ({ images, onChange }) => {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const addImage = async (file) => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      onChange([...(images || []), { id: `water_${Date.now()}`, url, capturedAt: new Date().toISOString() }]);
    } catch {
      toast.error('Failed to read photo');
    }
  };

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await addImage(f);
    }
  };

  const remove = (id) => onChange((images || []).filter((p) => p.id !== id));

  return (
    <div className="border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Water test photos</p>
          <p className="text-xs text-muted-foreground">TDS meter reading, pH strip, source tap — capture or upload as evidence.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => (isMobile ? camRef.current?.click() : setCamOpen(true))}>
            <Camera className="w-4 h-4 mr-1" /> Capture
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Upload
          </Button>
        </div>
      </div>
      <input ref={camRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={fileRef} type="file" accept="image/*" multiple                className="hidden" onChange={handleFile} />
      <WebcamCaptureModal open={camOpen} onOpenChange={setCamOpen} onCapture={addImage} />

      {(images || []).length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded">
          No water photos yet — add at least one for a more credible report.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative aspect-square rounded overflow-hidden border group">
              <img src={img.url} alt="Water test" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(img.id)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                title="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const InspectionForm = ({ existingInspection = null, isEditing = false }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { saveInspection } = useInspectionStatus();
  const { showSuccess } = useFeedback();
  const navigate = useNavigate();
  const [currentPhase, setCurrentPhase] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [missingDialog, setMissingDialog] = useState({ open: false, issues: [] });

  const [formData, setFormData] = useState(existingInspection || {
    metadata: { preparedFor: '', propertyAddress: '', inspectionDate: new Date().toISOString().split('T')[0] },
    areaCalculations: [],
    propertyMetrics: [
      { id: 'metric_door', label: 'Door Height', value: '', unit: 'ft' },
      { id: 'metric_ceiling', label: 'Ceiling Height', value: '', unit: 'ft' },
    ],
    waterQuality: { tds: '', ph: '', images: [], brands: [] },
    roomInspections: [],
    propertyType: 'Residential',
    includeScore: settings?.scoring?.enabled !== false,
    scoreOverrides: {},
  });

  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [customRoomName, setCustomRoomName] = useState('');

  // Server-side auto-draft id. Once auto-save creates a row in the
  // `inspections` collection we reuse it for every subsequent update so the
  // draft is discoverable from the dashboard's drafts list and editable later.
  const [draftId, setDraftId] = useState(existingInspection?.id || null);
  const autoSavingRef = useRef(false);

  useEffect(() => {
    if (!existingInspection) {
      const saved = localStorage.getItem('inspection-draft');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Defensive shape check — a corrupted draft (e.g. a stray string)
          // would otherwise crash every field render below. Validate the
          // minimum required shape and discard anything we can't trust.
          if (parsed && typeof parsed === 'object' && parsed.metadata && typeof parsed.metadata === 'object') {
            setFormData(parsed);
          } else {
            console.warn('Discarding malformed inspection-draft from localStorage');
            localStorage.removeItem('inspection-draft');
          }
        } catch (e) {
          console.warn('Failed to parse inspection-draft from localStorage; clearing it.', e);
          try { localStorage.removeItem('inspection-draft'); } catch (_) {}
        }
      }
    }
  }, [existingInspection]);

  useEffect(() => {
    if (!existingInspection) {
      try {
        localStorage.setItem('inspection-draft', JSON.stringify(formData));
      } catch (e) {
        // QuotaExceededError (very large drafts with embedded data-URL photos)
        // — fail silently. Server-side auto-draft is the authoritative store.
        console.warn('Could not persist draft to localStorage:', e?.message || e);
      }
    }
  }, [formData, existingInspection]);

  // ---- Silent auto-save as draft (server-side) -----------------------------
  // Once the user has typed enough to make the row meaningful (an address or
  // prepared-for name), debounce-save the form to PocketBase as a draft. This
  // ensures that even if they navigate away or close the tab, the work is
  // recoverable from the dashboard's drafts list with an Edit action.
  useEffect(() => {
    // Only auto-draft inside the inspector/admin "new inspection" flow.
    // Edits to existing records save through the normal submit path.
    if (existingInspection) return;
    if (!user) return;

    const address = (formData.metadata?.propertyAddress || '').trim();
    const preparedFor = (formData.metadata?.preparedFor || '').trim();
    // Threshold: don't create a backend row until at least one meaningful
    // identifier exists. Prevents empty drafts from polluting the dashboard.
    if (address.length < 3 && preparedFor.length < 2) return;

    const handle = setTimeout(async () => {
      if (autoSavingRef.current) return;
      if (submitting) return;
      autoSavingRef.current = true;
      try {
        const payload = {
          ...formData,
          inspector: user.id,
          inspectorName: user.name,
          status: 'draft',
        };
        const saved = await saveInspection(payload, draftId);
        if (saved && !draftId) setDraftId(saved.id);
      } catch (_) {
        // Network or validation failures are silent — the user can still hit
        // the explicit "Save as Draft" button which surfaces errors.
      } finally {
        autoSavingRef.current = false;
      }
    }, 2500);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, existingInspection, user, draftId]);

  const updateMetadata = (field, value) => {
    setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, [field]: value } }));
  };

  // ---- Phase 2: area calculations -----------------------------------------
  const addArea = () => {
    const id = `area_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFormData(prev => ({
      ...prev,
      areaCalculations: [
        ...prev.areaCalculations,
        { id, room: '', length: '', width: '', lengthUnit: 'ft', widthUnit: 'ft' },
      ],
    }));
  };
  const updateArea = (id, patch) => {
    setFormData(prev => ({
      ...prev,
      areaCalculations: prev.areaCalculations.map(a => a.id === id ? { ...a, ...patch } : a),
    }));
  };
  const removeArea = (id) => {
    setFormData(prev => ({
      ...prev,
      areaCalculations: prev.areaCalculations.filter(a => a.id !== id),
    }));
  };

  // ---- Phase 2: property metrics (door height, ceiling height, wall height, etc.) ----
  const addMetric = () => {
    const id = `metric_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFormData(prev => ({
      ...prev,
      propertyMetrics: [
        ...(prev.propertyMetrics || []),
        { id, label: '', value: '', unit: 'ft' },
      ],
    }));
  };
  const updateMetric = (id, patch) => {
    setFormData(prev => ({
      ...prev,
      propertyMetrics: (prev.propertyMetrics || []).map(m => m.id === id ? { ...m, ...patch } : m),
    }));
  };
  const removeMetric = (id) => {
    setFormData(prev => ({
      ...prev,
      propertyMetrics: (prev.propertyMetrics || []).filter(m => m.id !== id),
    }));
  };

  const totalSft = useMemo(
    () => formData.areaCalculations.reduce(
      (sum, a) => sum + computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit),
      0,
    ),
    [formData.areaCalculations],
  );

  // ---- Phase 3: water quality & brands ------------------------------------
  const updateWater = (field, value) => {
    setFormData(prev => ({ ...prev, waterQuality: { ...prev.waterQuality, [field]: value } }));
  };

  // Active brand catalog comes from admin settings; fall back to defaults.
  const brandCatalog = useMemo(
    () => (settings?.brandCatalog && Object.keys(settings.brandCatalog).length > 0)
      ? settings.brandCatalog
      : DEFAULT_BRAND_CATALOG,
    [settings?.brandCatalog],
  );

  // Keep backward-compat: old data stored `brands: string[]`. Migrate lazily.
  const selectedBrands = useMemo(() => {
    const wq = formData.waterQuality || {};
    if (Array.isArray(wq.brandSelections)) return wq.brandSelections;
    if (Array.isArray(wq.brands)) {
      return wq.brands.map(name => ({ name, category: 'Other', photo: null }));
    }
    return [];
  }, [formData.waterQuality]);

  const isBrandSelected = (name) => selectedBrands.some(b => b.name === name);

  const toggleBrand = (name, category = 'Other') => {
    setFormData(prev => {
      const wq = prev.waterQuality || {};
      const current = Array.isArray(wq.brandSelections)
        ? wq.brandSelections
        : (Array.isArray(wq.brands) ? wq.brands.map(n => ({ name: n, category: 'Other', photo: null })) : []);
      const exists = current.some(b => b.name === name);
      const next = exists
        ? current.filter(b => b.name !== name)
        : [...current, { name, category, photo: null }];
      toast.success(exists ? `Removed ${name}` : `Added ${name}`);
      return { ...prev, waterQuality: { ...wq, brandSelections: next, brands: next.map(b => b.name) } };
    });
  };

  const setBrandPhoto = (name, photo) => {
    setFormData(prev => {
      const wq = prev.waterQuality || {};
      const current = Array.isArray(wq.brandSelections) ? wq.brandSelections : [];
      const next = current.map(b => b.name === name ? { ...b, photo } : b);
      return { ...prev, waterQuality: { ...wq, brandSelections: next } };
    });
    if (photo) toast.success(`Photo attached to ${name}`);
    else toast.success(`Photo removed from ${name}`);
  };

  const [customBrand, setCustomBrand] = useState('');
  const addCustomBrand = () => {
    const trimmed = customBrand.trim();
    if (!trimmed) {
      toast.error('Enter a brand name first');
      return;
    }
    if (isBrandSelected(trimmed)) {
      toast.error(`${trimmed} is already added`);
      return;
    }
    toggleBrand(trimmed, 'Custom');
    setCustomBrand('');
  };

  // ---- Phase 4: rooms ------------------------------------------------------
  const addRoom = (name = 'New Room', { openManager = true } = {}) => {
    const newRoom = {
      id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name,
      roomSpaces: [],
      cornerPhotos: [],
      defects: [],
    };
    setFormData(prev => ({ ...prev, roomInspections: [...prev.roomInspections, newRoom] }));
    setSelectedRoomId(newRoom.id);
    if (openManager) setManagerOpen(true);
    toast.success(`Added ${name}`);
    return newRoom;
  };

  const handleAddPredefinedRoom = (name) => {
    addRoom(name);
    setRoomPickerOpen(false);
  };

  const handleAddCustomRoom = () => {
    const trimmed = customRoomName.trim();
    if (!trimmed) {
      toast.error('Enter a room name first');
      return;
    }
    addRoom(trimmed);
    setCustomRoomName('');
    setRoomPickerOpen(false);
  };

  const updateRoomName = (id, name) => {
    setFormData(prev => ({
      ...prev,
      roomInspections: prev.roomInspections.map(r => r.id === id ? { ...r, name } : r)
    }));
  };

  const removeRoom = (id) => {
    setFormData(prev => ({
      ...prev,
      roomInspections: prev.roomInspections.filter(r => r.id !== id)
    }));
  };

  const handleSaveRoom = (updatedRoom) => {
    setFormData(prev => ({
      ...prev,
      roomInspections: prev.roomInspections.map(r => r.id === updatedRoom.id ? updatedRoom : r)
    }));
  };

  const validatePhase = (phase) => {
    if (phase === 1) return formData.metadata.preparedFor && formData.metadata.propertyAddress && formData.metadata.inspectionDate;
    return true;
  };

  // Collects every missing/invalid required field across all phases so the
  // submit popup can tell the user exactly what to fix instead of failing
  // silently on the server. Each issue carries the phase to jump back to.
  const collectMissingFields = () => {
    const issues = [];
    const m = formData.metadata || {};
    if (!m.preparedFor?.trim())      issues.push({ phase: 1, label: 'Prepared For (customer name)' });
    if (!m.propertyAddress?.trim())  issues.push({ phase: 1, label: 'Property Address' });
    if (!m.inspectionDate)           issues.push({ phase: 1, label: 'Inspection Date' });
    if (!formData.propertyType)      issues.push({ phase: 1, label: 'Property Type' });

    const rooms = formData.roomInspections || [];
    if (rooms.length === 0) {
      issues.push({ phase: 4, label: 'At least one room must be added' });
    } else {
      rooms.forEach((r, i) => {
        const label = r.name || `Room ${i + 1}`;
        if (!r.name?.trim()) {
          issues.push({ phase: 4, label: `Room ${i + 1}: name is required` });
        }
        if ((r.defects?.length || 0) > 0 && (r.cornerPhotos?.length || 0) === 0) {
          issues.push({ phase: 4, label: `"${label}": has defects but no ambient/corner photos` });
        }
      });
    }
    return issues;
  };

  const nextPhase = () => {
    if (validatePhase(currentPhase)) setCurrentPhase(p => Math.min(p + 1, 5));
    else toast.error('Complete required fields');
  };

  const handleSubmit = async (saveMode = 'submit') => {
    if (submitting) return;

    // Full submission must satisfy every required field across all phases.
    // Drafts intentionally bypass the popup so in-progress work can be parked.
    if (saveMode === 'submit') {
      const issues = collectMissingFields();
      if (issues.length > 0) {
        setMissingDialog({ open: true, issues });
        return;
      }
    } else {
      // Drafts only need a minimum identifier so the row is meaningful in
      // the dashboard. Allows saving at any phase without rooms yet.
      const address = (formData.metadata?.propertyAddress || '').trim();
      const preparedFor = (formData.metadata?.preparedFor || '').trim();
      if (address.length < 1 && preparedFor.length < 1) {
        toast.error('Add a property address or "Prepared For" name before saving a draft.');
        return;
      }
    }

    setSubmitting(true);

    // Admin creating a brand-new inspection: self-approve in one shot.
    const isAdminSelfCreate = !isEditing && user.role === 'admin' && saveMode === 'submit';

    let nextStatus;
    if (saveMode === 'draft') {
      nextStatus = 'draft';
    } else if (isAdminSelfCreate) {
      nextStatus = 'approved';
    } else {
      nextStatus = 'pending';
    }

    const inspectionPayload = {
      ...formData,
      inspector: user.id,
      inspectorName: user.name,
      status: nextStatus,
      ...(isAdminSelfCreate && {
        approvedBy: user.name || user.email || 'Admin',
        approvedAt: new Date().toISOString(),
      }),
      // Resubmitting from a rejected state clears the prior rejection so the
      // admin queue shows a clean "pending" row again.
      ...(nextStatus === 'pending' && existingInspection?.status === 'rejected' && {
        rejectedBy: null,
        rejectedAt: null,
      }),
      // Resubmitting an inspection that was previously approved (inspector
      // re-opened it to make a correction) clears the approval trail so it
      // goes back through review.
      ...(nextStatus === 'pending' && existingInspection?.status === 'approved' && {
        approvedBy: null,
        approvedAt: null,
      }),
    };

    const saved = await saveInspection(inspectionPayload, existingInspection?.id || draftId || null);
    setSubmitting(false);

    if (!saved) return; // hook already toasted the error

    localStorage.removeItem('inspection-draft');
    const successTitle =
      saveMode === 'draft' ? 'Draft saved' :
      isAdminSelfCreate    ? 'Inspection approved' :
      isEditing            ? 'Inspection updated' :
                             'Submitted for approval';
    const successDesc =
      saveMode === 'draft'
        ? 'Your progress is stored. You can keep editing anytime from your dashboard.'
        : isAdminSelfCreate
          ? 'The report is now visible to the customer.'
          : isEditing
            ? 'Your changes have been saved.'
            : 'Your inspection has been sent to the admin queue for review.';
    showSuccess(successTitle, successDesc);
    navigate(user.role === 'admin' ? '/admin/dashboard' : '/inspector/dashboard');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">{isEditing ? 'Edit Inspection' : 'New Inspection Report'}</CardTitle>
          <CardDescription>Phase {currentPhase} of 5</CardDescription>
          <Progress value={(currentPhase / 5) * 100} className="mt-4" />
        </CardHeader>
        <CardContent className="space-y-6">

          {currentPhase === 1 && (
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold text-foreground">Inspection details</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These fields appear on the report cover and the property details page.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="preparedFor" className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-muted-foreground" /> Prepared For <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="preparedFor"
                    value={formData.metadata.preparedFor}
                    onChange={e => updateMetadata('preparedFor', e.target.value)}
                    placeholder="Client / homeowner name"
                    className="mt-1.5 h-11"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="propertyAddress" className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Property Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="propertyAddress"
                    value={formData.metadata.propertyAddress}
                    onChange={e => updateMetadata('propertyAddress', e.target.value)}
                    placeholder="Flat / house, street, city"
                    className="mt-1.5 h-11"
                  />
                </div>

                <div>
                  <Label htmlFor="inspectionDate" className="flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" /> Inspection Date <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="inspectionDate"
                      type="date"
                      value={formData.metadata.inspectionDate}
                      onChange={e => updateMetadata('inspectionDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="pl-9 h-11"
                    />
                  </div>
                  {formData.metadata.inspectionDate && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {new Date(formData.metadata.inspectionDate).toLocaleDateString(undefined, {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="propertyType" className="flex items-center gap-1.5">
                    <HomeIcon className="w-3.5 h-3.5 text-muted-foreground" /> Property Type
                  </Label>
                  <Select value={formData.propertyType} onValueChange={v => setFormData(p => ({ ...p, propertyType: v }))}>
                    <SelectTrigger id="propertyType" className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {currentPhase === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Area Calculations</h3>
                  <p className="text-xs text-muted-foreground">Length × Width per room/section. Mixed units OK — totals normalize to sft.</p>
                </div>
                <Button onClick={addArea} size="sm"><Plus className="w-4 h-4 mr-2" /> Add Area</Button>
              </div>

              {formData.areaCalculations.length === 0 ? (
                <div className="text-center py-10 bg-muted/30 rounded-xl border border-dashed text-muted-foreground text-sm">
                  No areas yet. Click "Add Area" to begin.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.areaCalculations.map(area => {
                    const sft = computeAreaSft(area.length, area.width, area.lengthUnit, area.widthUnit);
                    return (
                      <Card key={area.id} className="card-muted">
                        <CardContent className="pt-5 grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 md:col-span-3">
                            <Label className="text-xs">Room / Section</Label>
                            <Input
                              value={area.room}
                              onChange={e => updateArea(area.id, { room: e.target.value })}
                              placeholder="e.g. Master Bedroom"
                              list={`rooms_${area.id}`}
                            />
                            <datalist id={`rooms_${area.id}`}>
                              {PREDEFINED_ROOMS.map(r => <option key={r} value={r} />)}
                            </datalist>
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Length</Label>
                            <Input type="number" inputMode="decimal" min="0" step="0.01"
                              value={area.length} onChange={e => updateArea(area.id, { length: e.target.value })} />
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Unit</Label>
                            <Select value={area.lengthUnit} onValueChange={v => updateArea(area.id, { lengthUnit: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ft">ft</SelectItem>
                                <SelectItem value="in">in</SelectItem>
                                <SelectItem value="m">m</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Width</Label>
                            <Input type="number" inputMode="decimal" min="0" step="0.01"
                              value={area.width} onChange={e => updateArea(area.id, { width: e.target.value })} />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <Label className="text-xs">Unit</Label>
                            <Select value={area.widthUnit} onValueChange={v => updateArea(area.id, { widthUnit: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ft">ft</SelectItem>
                                <SelectItem value="in">in</SelectItem>
                                <SelectItem value="m">m</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-8 md:col-span-12 flex items-center justify-between pt-2 border-t mt-1">
                            <span className="text-sm font-semibold">{sft.toLocaleString()} sft</span>
                            <Button variant="ghost" size="sm" onClick={() => removeArea(area.id)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-1" /> Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  <div className="flex items-center justify-end gap-3 px-2">
                    <span className="text-sm text-muted-foreground">Property total</span>
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      {totalSft.toLocaleString()} sft
                    </Badge>
                  </div>
                </div>
              )}

              {/* Dynamic property metrics — door height, ceiling height, wall height, etc. */}
              <div className="pt-6 border-t">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">Property Metrics</h3>
                    <p className="text-xs text-muted-foreground">Heights and other property-level measurements that aren't tied to a single room.</p>
                  </div>
                  <Button onClick={addMetric} size="sm" variant="outline"><Plus className="w-4 h-4 mr-2" /> Add Metric</Button>
                </div>
                {(!formData.propertyMetrics || formData.propertyMetrics.length === 0) ? (
                  <div className="text-center py-6 bg-muted/30 rounded-xl border border-dashed text-muted-foreground text-sm">
                    No metrics yet. Click "Add Metric" to add door height, ceiling height, etc.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.propertyMetrics.map(m => (
                      <Card key={m.id} className="card-muted">
                        <CardContent className="pt-4 grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 md:col-span-5">
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={m.label}
                              onChange={e => updateMetric(m.id, { label: e.target.value })}
                              placeholder="e.g. Door Height, Ceiling Height, Wall Height"
                              list={`metric_presets_${m.id}`}
                            />
                            <datalist id={`metric_presets_${m.id}`}>
                              <option value="Door Height" />
                              <option value="Ceiling Height" />
                              <option value="Wall Height" />
                              <option value="Window Height" />
                              <option value="Plinth Height" />
                              <option value="Slab Thickness" />
                              <option value="Beam Depth" />
                              <option value="Parapet Height" />
                            </datalist>
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <Label className="text-xs">Value</Label>
                            <Input type="number" inputMode="decimal" min="0" step="0.01"
                              value={m.value} onChange={e => updateMetric(m.id, { value: e.target.value })} />
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Unit</Label>
                            <Select value={m.unit || 'ft'} onValueChange={v => updateMetric(m.id, { unit: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ft">ft</SelectItem>
                                <SelectItem value="in">in</SelectItem>
                                <SelectItem value="m">m</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                                <SelectItem value="mm">mm</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-12 md:col-span-2 flex md:justify-end">
                            <Button variant="ghost" size="sm" onClick={() => removeMetric(m.id)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-1" /> Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentPhase === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-primary" /> Water Quality
                </h3>
                <p className="text-xs text-muted-foreground">Capture TDS (ppm) and pH readings from the property water test.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>TDS (ppm)</Label>
                  <Input type="number" inputMode="decimal" min="0" value={formData.waterQuality.tds}
                    onChange={e => updateWater('tds', e.target.value)} placeholder="e.g. 180" />
                </div>
                <div>
                  <Label>pH</Label>
                  <Input type="number" inputMode="decimal" min="0" max="14" step="0.1" value={formData.waterQuality.ph}
                    onChange={e => updateWater('ph', e.target.value)} placeholder="e.g. 7.2" />
                </div>
              </div>

              <WaterQualityPhotos
                images={formData.waterQuality.images || []}
                onChange={(images) => updateWater('images', images)}
              />

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-2">Hardware Brand Checklist</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Categories are managed by the admin in Settings. Tap a brand to toggle, then attach a photo (capture or upload) per selected brand.
                </p>

                {Object.entries(brandCatalog).map(([category, brands]) => (
                  <div key={category} className="mb-5">
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {brands.map(brand => {
                        const selected = isBrandSelected(brand);
                        return (
                          <button
                            key={brand}
                            type="button"
                            onClick={() => toggleBrand(brand, category)}
                            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-muted border-input'
                            }`}
                          >
                            {brand}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 mt-4">
                  <Input
                    placeholder="Add a custom brand name"
                    value={customBrand}
                    onChange={e => setCustomBrand(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomBrand(); } }}
                  />
                  <Button type="button" variant="secondary" onClick={addCustomBrand}>Add</Button>
                </div>

                {selectedBrands.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Selected brands ({selectedBrands.length}) — attach evidence photo
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedBrands.map(b => (
                        <BrandPhotoRow
                          key={b.name}
                          brand={b}
                          onSetPhoto={(photo) => setBrandPhoto(b.name, photo)}
                          onRemoveBrand={() => toggleBrand(b.name, b.category)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentPhase === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Room Inspections</h3>
                  <p className="text-xs text-muted-foreground">Phase A: upload corner / ambient photos first. Phase B: defects unlock automatically.</p>
                </div>
                <Button onClick={() => setRoomPickerOpen(true)} size="sm"><Plus className="w-4 h-4 mr-2" /> Add Room</Button>
              </div>

              {formData.roomInspections.length === 0 && (
                <div className="text-center py-10 bg-muted/30 rounded-xl border border-dashed text-muted-foreground text-sm">
                  No rooms yet. Add a room to begin the walkthrough.
                </div>
              )}

              {formData.roomInspections.map(room => {
                const ambientCount = room.cornerPhotos?.length || 0;
                const defectCount = room.defects?.length || 0;
                const gateOpen = ambientCount > 0;
                return (
                  <Card key={room.id} className="card-muted">
                    <CardContent className="pt-6 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                      <div className="w-full sm:w-1/3">
                        <Input
                          value={room.name}
                          onChange={e => updateRoomName(room.id, e.target.value)}
                          placeholder="Room name"
                          list={`predef_rooms_${room.id}`}
                        />
                        <datalist id={`predef_rooms_${room.id}`}>
                          {PREDEFINED_ROOMS.map(r => <option key={r} value={r} />)}
                        </datalist>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2">
                        <Badge variant={gateOpen ? 'secondary' : 'destructive'} className="text-xs">
                          <Camera className="w-3 h-3 mr-1" /> {ambientCount} ambient photo{ambientCount === 1 ? '' : 's'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{defectCount} defect{defectCount === 1 ? '' : 's'}</Badge>
                        {!gateOpen && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">
                            Phase A required
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedRoomId(room.id); setManagerOpen(true); }}>
                          <ImageIcon className="w-4 h-4 mr-2" /> Edit Room
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => removeRoom(room.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {currentPhase === 5 && (
            <div className="space-y-6">
              <div className="p-4 bg-accent text-accent-foreground rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <h3 className="font-semibold">Review your inspection</h3>
                  <p className="text-sm">Please verify information before submitting</p>
                </div>
              </div>
              <Card className="card-muted">
                <CardContent className="pt-6 space-y-2 text-sm">
                  <p><strong>Prepared For:</strong> {formData.metadata.preparedFor || '—'}</p>
                  <p><strong>Address:</strong> {formData.metadata.propertyAddress || '—'}</p>
                  <p><strong>Date:</strong> {formData.metadata.inspectionDate || '—'}</p>
                  <p><strong>Property Type:</strong> {formData.propertyType}</p>
                  <p><strong>Total Area:</strong> {totalSft.toLocaleString()} sft across {formData.areaCalculations.length} section(s)</p>
                  <p><strong>Water:</strong> TDS {formData.waterQuality.tds || '—'} ppm, pH {formData.waterQuality.ph || '—'}</p>
                  <p><strong>Brands tagged:</strong> {(formData.waterQuality.brands || []).length}</p>
                  <p><strong>Rooms:</strong> {formData.roomInspections.length}</p>
                  <p><strong>Total Defects:</strong> {formData.roomInspections.reduce((s, r) => s + (r.defects?.length || 0), 0)}</p>
                </CardContent>
              </Card>

              {settings?.scoring?.enabled !== false && (() => {
                const summary = computeInspectionScore({ ...formData, includeScore: true }, settings);
                const overall = summary.overall;
                const priorityColor =
                  summary.priority === 'Urgent' ? PROPCHK_PRIORITY_META.Urgent.color :
                  summary.priority === 'Watch'  ? PROPCHK_PRIORITY_META.Watch.color  :
                                                   PROPCHK_PRIORITY_META.Clean.color;
                // Donut geometry — single ring with two arcs (filled vs remainder).
                const radius = 60;
                const circumference = 2 * Math.PI * radius;
                const filled = (overall / 100) * circumference;
                // Bar chart geometry
                const maxBars = Math.max(1, summary.factors.length);
                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{(settings?.appName || 'CheckSquare')} Property Score</CardTitle>
                          <CardDescription>
                            Severity-weighted per-room scoring · {summary.itemsPerRoom} items/room ·
                            weights {(summary.severityNames || ['Major', 'Minor', 'Cosmetic']).map((nm) => `${nm[0]} ${(Number(summary.severityWeights?.[nm]) || 0).toFixed(2)}`).join(' / ')}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label htmlFor="include-score" className="text-sm">Include in report</Label>
                          <Switch
                            id="include-score"
                            checked={formData.includeScore !== false}
                            onCheckedChange={(v) => setFormData(prev => ({ ...prev, includeScore: !!v }))}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* ── Hero: donut + grade + severity totals ── */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center justify-center">
                          <svg viewBox="0 0 160 160" className="w-40 h-40">
                            <circle cx="80" cy="80" r={radius} fill="none" stroke="#f0f0eb" strokeWidth="18" />
                            <circle
                              cx="80" cy="80" r={radius} fill="none"
                              stroke={priorityColor} strokeWidth="18" strokeLinecap="round"
                              strokeDasharray={`${filled} ${circumference - filled}`}
                              transform="rotate(-90 80 80)"
                            />
                            <text x="80" y="78" textAnchor="middle" fontSize="28" fontWeight="700" fill={priorityColor}>
                              {overall}%
                            </text>
                            <text x="80" y="98" textAnchor="middle" fontSize="9" letterSpacing="2" fill="#666">
                              AVERAGE
                            </text>
                          </svg>
                        </div>
                        <div className="text-center md:text-left">
                          <div className="text-3xl font-serif italic" style={{ color: summary.grade.color }}>
                            {summary.grade.letter} · {summary.grade.label}
                          </div>
                          <div className="text-xs uppercase tracking-widest text-muted-foreground mt-2">Priority</div>
                          <div className="mt-1">
                            <Badge style={{ background: priorityColor, color: '#fff' }}>{summary.priority}</Badge>
                          </div>
                        </div>
                        <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${Math.max(1, (summary.severityNames || []).length || 3)}, minmax(0, 1fr))` }}>
                          {(summary.severityNames || ['Major', 'Minor', 'Cosmetic']).map((nm) => {
                            const meta = (settings?.severityLevels || []).find((s) => s?.name === nm);
                            const color = meta?.color
                              || (nm === 'Major' ? '#c0392b' : nm === 'Minor' ? '#b8741b' : nm === 'Cosmetic' ? '#666' : '#475569');
                            // 14%-opacity tint for the tile background so each severity
                            // tile picks up its configured colour even for new severities.
                            const tint = `${color}22`;
                            const count = summary.totals?.byName?.[nm] ?? 0;
                            return (
                              <div key={nm} className="rounded-md p-2" style={{ background: tint }}>
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">{nm}</div>
                                <div className="text-2xl font-semibold" style={{ color }}>{count}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Per-room bar chart ── */}
                      {summary.factors.length > 0 && (
                        <div>
                          <Label className="text-base font-semibold">Health score by room</Label>
                          <div className="mt-3 space-y-2">
                            {summary.factors.map((f) => (
                              <div key={f.key} className="grid grid-cols-12 items-center gap-2 text-sm">
                                <div className="col-span-3 truncate" title={f.name}>{f.name}</div>
                                <div className="col-span-7 h-5 rounded bg-muted/50 overflow-hidden">
                                  <div
                                    className="h-full rounded transition-all"
                                    style={{ width: `${Math.max(0, Math.min(100, f.value))}%`, background: f.color }}
                                  />
                                </div>
                                <div className="col-span-1 text-right font-mono text-xs">{f.value}</div>
                                <div className="col-span-1 flex justify-end">
                                  <span
                                    className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
                                    style={{ background: f.color }}
                                  >
                                    {f.priority}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Axis hint */}
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-1 pl-[25%] pr-[16%]">
                            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                          </div>
                        </div>
                      )}

                      {/* ── Per-room detail table (severity counts + override) ── */}
                      {summary.factors.length > 0 && (
                        <div>
                          {(() => {
                            const sevNames = summary.severityNames && summary.severityNames.length
                              ? summary.severityNames
                              : ['Major', 'Minor', 'Cosmetic'];
                            // Build a CSS grid-template so any number of severities fits.
                            // Room | (severity columns)* | Auto | Override | Action
                            const gridCols = `1.6fr ${sevNames.map(() => '0.55fr').join(' ')} 1fr 1.2fr 1fr`;
                            const sevHeader = (
                              <div className="grid gap-2 items-center text-xs uppercase tracking-wider text-muted-foreground border-b pb-2" style={{ gridTemplateColumns: gridCols }}>
                                <div>Room</div>
                                {sevNames.map((nm) => (
                                  <div key={nm} className="text-center">{nm.slice(0, 3)}</div>
                                ))}
                                <div className="text-center">Auto</div>
                                <div className="text-center">Override</div>
                                <div className="text-right">Action</div>
                              </div>
                            );
                            const rows = summary.factors.map((f) => {
                              const overrideValue = formData.scoreOverrides?.[f.key];
                              const hasOverride = typeof overrideValue === 'number';
                              return (
                                <div key={f.key} className="grid gap-2 items-center text-sm border-b py-2" style={{ gridTemplateColumns: gridCols }}>
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: f.color }} />
                                    <span className="truncate">{f.name}</span>
                                  </div>
                                  {sevNames.map((nm) => {
                                    const meta = (settings?.severityLevels || []).find((s) => s?.name === nm);
                                    const color = meta?.color
                                      || (nm === 'Major' ? '#c0392b' : nm === 'Minor' ? '#b8741b' : nm === 'Cosmetic' ? '#6b7280' : '#475569');
                                    const count = f.counts?.[nm] ?? 0;
                                    return (
                                      <div key={nm} className="text-center font-medium" style={{ color }}>{count}</div>
                                    );
                                  })}
                                  <div className="text-center">
                                    <strong>{f.auto}</strong>
                                    <span className="text-muted-foreground">/100</span>
                                  </div>
                                  <div>
                                    <Input
                                      type="number" min="0" max="100"
                                      disabled={!hasOverride}
                                      value={hasOverride ? overrideValue : f.auto}
                                      onChange={(e) => {
                                        const n = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                                        setFormData(prev => ({ ...prev, scoreOverrides: { ...(prev.scoreOverrides || {}), [f.key]: n } }));
                                      }}
                                      className="h-8"
                                    />
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      variant={hasOverride ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => {
                                        setFormData(prev => {
                                          const next = { ...(prev.scoreOverrides || {}) };
                                          if (hasOverride) delete next[f.key];
                                          else next[f.key] = f.auto;
                                          return { ...prev, scoreOverrides: next };
                                        });
                                      }}
                                    >
                                      {hasOverride ? 'Reset' : 'Override'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            });
                            return <>{sevHeader}{rows}</>;
                          })()}
                        </div>
                      )}
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Override final overall score</Label>
                          <Switch
                            checked={typeof formData.scoreOverrides?.overall === 'number'}
                            onCheckedChange={(v) => {
                              setFormData(prev => {
                                const next = { ...(prev.scoreOverrides || {}) };
                                if (v) next.overall = summary.overall;
                                else delete next.overall;
                                return { ...prev, scoreOverrides: next };
                              });
                            }}
                          />
                        </div>
                        {typeof formData.scoreOverrides?.overall === 'number' && (
                          <Input
                            type="number" min="0" max="100"
                            value={formData.scoreOverrides.overall}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                              setFormData(prev => ({ ...prev, scoreOverrides: { ...(prev.scoreOverrides || {}), overall: n } }));
                            }}
                          />
                        )}
                        <Label className="text-sm">Inspector remarks (optional)</Label>
                        <Textarea
                          rows={3}
                          value={formData.scoreOverrides?.remarks || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, scoreOverrides: { ...(prev.scoreOverrides || {}), remarks: e.target.value } }))}
                          placeholder="Context for the score, judgement calls, anything the report should carry…"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-6 border-t">
            <Button variant="outline" onClick={() => setCurrentPhase(p => Math.max(1, p - 1))} disabled={currentPhase === 1}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => handleSubmit('draft')}
                disabled={submitting}
                title="Save your progress without submitting for review"
              >
                {submitting ? 'Saving…' : 'Save as Draft'}
              </Button>
              {currentPhase < 5 ? (
                <Button onClick={nextPhase}>Next <ChevronRight className="w-4 h-4 ml-2" /></Button>
              ) : (
                <Button onClick={() => handleSubmit('submit')} disabled={submitting}>
                  {submitting ? 'Saving...' : (isEditing ? 'Update & Submit' : 'Submit')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedRoomId && (
        <RoomPhotoManager
          open={managerOpen}
          onOpenChange={setManagerOpen}
          room={formData.roomInspections.find(r => r.id === selectedRoomId)}
          onSave={handleSaveRoom}
        />
      )}

      <Dialog
        open={missingDialog.open}
        onOpenChange={(open) => setMissingDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> Can't submit yet
            </DialogTitle>
            <DialogDescription>
              Please complete the following before submitting the report:
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {missingDialog.issues.map((issue, idx) => (
              <li
                key={idx}
                className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-destructive/10 px-1.5 text-xs font-semibold text-destructive">
                    {issue.phase}
                  </span>
                  <span>{issue.label}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCurrentPhase(issue.phase);
                    setMissingDialog({ open: false, issues: [] });
                  }}
                >
                  Fix
                </Button>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMissingDialog({ open: false, issues: [] })}
            >
              Close
            </Button>
            {missingDialog.issues[0] && (
              <Button
                onClick={() => {
                  setCurrentPhase(missingDialog.issues[0].phase);
                  setMissingDialog({ open: false, issues: [] });
                }}
              >
                Go to first issue
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roomPickerOpen} onOpenChange={setRoomPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a room</DialogTitle>
            <DialogDescription>
              Pick from the list below, or add a custom room name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Predefined rooms
              </p>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_ROOMS.map(r => {
                  const alreadyAdded = formData.roomInspections.some(
                    room => room.name.toLowerCase() === r.toLowerCase()
                  );
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleAddPredefinedRoom(r)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        alreadyAdded
                          ? 'bg-muted text-muted-foreground border-muted'
                          : 'bg-background hover:bg-primary hover:text-primary-foreground border-input'
                      }`}
                      title={alreadyAdded ? 'Already added — click to add another' : `Add ${r}`}
                    >
                      <Plus className="w-3 h-3 mr-1 inline" />{r}
                      {alreadyAdded && <span className="ml-1 text-xs">(added)</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Custom / Other
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Home Theatre, Wine Cellar"
                  value={customRoomName}
                  onChange={e => setCustomRoomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomRoom(); } }}
                />
                <Button type="button" onClick={handleAddCustomRoom}>Add</Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomPickerOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionForm;
