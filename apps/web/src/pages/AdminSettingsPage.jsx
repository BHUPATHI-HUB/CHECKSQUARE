
import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Plus, Trash2, AlertCircle, Upload, Image as ImageIcon, FileSpreadsheet, Download } from 'lucide-react';
import DisclaimerEditor from '@/components/DisclaimerEditor.jsx';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PROPCHK_WEIGHTS, PROPCHK_ITEMS_PER_ROOM, DEFAULT_SCORE_EXPLANATION_HTML, DEFAULT_ROOM_SCORE_EXPR, DEFAULT_PRIORITY_EXPR, compileScoreExpression, computeRoomScore } from '@/utils/scoring';
import { buildReportHTML } from '@/utils/ReportGenerator.jsx';
import { Eye, ArrowUp, ArrowDown, GripVertical, Pencil } from 'lucide-react';
import {
  normalizeCommentLibrary,
  parseCSV,
  csvRowsToLibrary,
  libraryToCSV,
  downloadCSV,
  STARTER_COMMENT_LIBRARY,
} from '@/utils/commentLibrary';

const ROOM_TYPES = ['Master Bedroom', 'Kitchen', 'Bathroom', 'Living Room', 'General'];

/**
 * BrandCatalogEditor — CRUD UI for the admin-managed hardware brand catalog.
 * Top level keys are categories (e.g. "Switchboards"); each value is an array
 * of brand names. Inspectors get one-tap pills + custom-brand input on-site.
 */
const BrandCatalogEditor = ({ catalog, onChange }) => {
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState({}); // { [category]: 'name' }

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) {
      toast.error('Enter a category name');
      return;
    }
    if (catalog[trimmed]) {
      toast.error(`Category "${trimmed}" already exists`);
      return;
    }
    onChange({ ...catalog, [trimmed]: [] });
    toast.success(`Category "${trimmed}" added`);
    setNewCategory('');
  };

  const removeCategory = (category) => {
    const next = { ...catalog };
    delete next[category];
    onChange(next);
    toast.success(`Category "${category}" removed`);
  };

  const addBrand = (category) => {
    const trimmed = (newBrand[category] || '').trim();
    if (!trimmed) {
      toast.error('Enter a brand name');
      return;
    }
    if ((catalog[category] || []).includes(trimmed)) {
      toast.error(`${trimmed} is already in ${category}`);
      return;
    }
    onChange({ ...catalog, [category]: [...(catalog[category] || []), trimmed] });
    toast.success(`${trimmed} added to ${category}`);
    setNewBrand({ ...newBrand, [category]: '' });
  };

  const removeBrand = (category, brand) => {
    onChange({ ...catalog, [category]: (catalog[category] || []).filter(b => b !== brand) });
    toast.success(`${brand} removed from ${category}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          placeholder="New category name (e.g. Doors & Hardware)"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
        />
        <Button type="button" onClick={addCategory}><Plus className="w-4 h-4 mr-1" /> Category</Button>
      </div>

      {Object.entries(catalog).length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
          No categories yet. Add your first brand category above.
        </div>
      )}

      {Object.entries(catalog).map(([category, brands]) => (
        <div key={category} className="border rounded-xl p-4 bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold uppercase tracking-wider text-sm">{category}</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => removeCategory(category)}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Remove category
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(brands || []).map(brand => (
              <Badge key={brand} variant="secondary" className="text-xs gap-1">
                {brand}
                <button
                  type="button"
                  onClick={() => removeBrand(category, brand)}
                  className="ml-1 hover:text-destructive"
                  title="Remove brand"
                >×</button>
              </Badge>
            ))}
            {(brands || []).length === 0 && (
              <span className="text-xs text-muted-foreground">No brands yet.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newBrand[category] || ''}
              onChange={e => setNewBrand({ ...newBrand, [category]: e.target.value })}
              placeholder={`Add brand to ${category}`}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBrand(category); } }}
              className="bg-background"
            />
            <Button type="button" variant="secondary" onClick={() => addBrand(category)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminSettingsPage = () => {
  const { settings, updateSettings, loading } = useSettings();
  const [localSettings, setLocalSettings] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState('General');
  const [newComment, setNewComment] = useState('');
  const [hasError, setHasError] = useState(false);
  // Comment library staging state — flat array of {id, classify, text, severity}
  const [libDraft, setLibDraft] = useState([]);
  const [libFilter, setLibFilter] = useState('All');
  const [newRow, setNewRow] = useState({ classify: '', text: '', severity: 'Minor' });
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = React.useRef(null);

  // Keep libDraft synced with the current settings whenever they (re)load.
  useEffect(() => {
    if (settings) {
      setLibDraft(normalizeCommentLibrary(settings.commentLibrary));
    }
  }, [settings]);

  useEffect(() => {
    if (!loading && settings) {
      try {
        setLocalSettings(JSON.parse(JSON.stringify(settings))); 
      } catch (err) {
        setHasError(true);
      }
    }
  }, [settings, loading]);

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  // ── Live preview of the admin's custom score formula ───────────────
  // Evaluated against a small synthetic room so admins can see the
  // impact of an edit without leaving the page. Declared before the
  // early loading/error returns so hook order stays stable.
  const formulaPreview = useMemo(() => {
    if (!localSettings?.scoring) return null;
    const sampleRoom = {
      name: 'Sample Room',
      defects: [
        { severity: 'Major' }, { severity: 'Major' },
        { severity: 'Minor' }, { severity: 'Minor' }, { severity: 'Minor' },
        { severity: 'Cosmetic' }, { severity: 'Cosmetic' },
      ],
    };
    try {
      const res = computeRoomScore(sampleRoom, {
        weights:       localSettings.scoring.weights || PROPCHK_WEIGHTS,
        itemsPerRoom:  localSettings.scoring.itemsPerRoom || PROPCHK_ITEMS_PER_ROOM,
        roomScoreExpr: localSettings.scoring.roomScoreExpr || DEFAULT_ROOM_SCORE_EXPR,
        priorityExpr:  localSettings.scoring.priorityExpr  || DEFAULT_PRIORITY_EXPR,
      });
      const scoreCompiled    = compileScoreExpression(localSettings.scoring.roomScoreExpr || DEFAULT_ROOM_SCORE_EXPR);
      const priorityCompiled = compileScoreExpression(localSettings.scoring.priorityExpr  || DEFAULT_PRIORITY_EXPR);
      return { ...res, scoreError: scoreCompiled.error, priorityError: priorityCompiled.error };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  }, [localSettings?.scoring]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (hasError || !localSettings) {
    return <div className="min-h-screen flex items-center justify-center"><p>Error loading settings. Please refresh.</p></div>;
  }

  const handleSave = () => {
    const result = updateSettings(localSettings);
    if (result.success) {
      toast.success('Settings updated successfully');
    } else {
      toast.error(result.error || 'Failed to update settings');
    }
  };

  const handleAppChange = (field, value) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  // Nested updater for the reportImages group (crop/resize/quality controls).
  const handleImageChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      reportImages: { ...(prev.reportImages || {}), [key]: value },
    }));
  };

  // ── PDF report-section ordering & toggles ─────────────────────────
  // `reportSections` is stored as an ordered array of
  //   { key, enabled, title?, html? }
  // — built-in keys are reserved; custom sections use `custom:<id>` and
  // carry their own title + HTML body.
  const BUILTIN_SECTION_LABELS = {
    cover:            'Cover page',
    propertyDetails:  'Property details',
    score:            'Score dashboard · chart + average donut',
    scoreTable:       'Score table · room-by-room breakdown',
    disclaimers:      'Disclaimer pages',
    severityTaxonomy: 'Severity taxonomy reference',
    areaCalculations: 'Area calculations',
    environmental:    'Environmental readings',
    rooms:            'Room-by-room inspection',
    signoff:          'Closing details · signatures & document of record (on Thank-You page)',
    scoreExplanation: 'Score methodology (optional)',
    thankYou:         'Closing / thank-you page',
  };
  const DEFAULT_SECTION_ORDER = [
    { key: 'cover',            enabled: true },
    { key: 'propertyDetails',  enabled: true },
    { key: 'score',            enabled: true },
    { key: 'scoreTable',       enabled: true },
    { key: 'disclaimers',      enabled: true },
    { key: 'severityTaxonomy', enabled: true },
    { key: 'areaCalculations', enabled: true },
    { key: 'environmental',    enabled: true },
    { key: 'rooms',            enabled: true },
    { key: 'thankYou',         enabled: true },
    { key: 'signoff',          enabled: true },
  ];
  const currentSections = (() => {
    const saved = Array.isArray(localSettings.reportSections)
      ? localSettings.reportSections
      : DEFAULT_SECTION_ORDER;
    // Inject any newly-added built-in keys (e.g. `scoreTable`) that
    // aren't yet present in the saved order so admins always see the
    // full set of toggles after an app update.
    const present = new Set(saved.map((s) => s && s.key));
    const merged = [];
    let cursor = 0;
    for (const def of DEFAULT_SECTION_ORDER) {
      if (!present.has(def.key)) merged.push({ key: def.key, enabled: true });
      while (cursor < saved.length && saved[cursor] && (saved[cursor].key === def.key || !DEFAULT_SECTION_ORDER.some((d) => d.key === saved[cursor].key))) {
        merged.push(saved[cursor]);
        cursor += 1;
      }
    }
    while (cursor < saved.length) {
      merged.push(saved[cursor]);
      cursor += 1;
    }
    return merged;
  })();
  const setSections = (next) => handleAppChange('reportSections', next);
  const moveSection = (idx, dir) => {
    const next = [...currentSections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
  };
  const toggleSectionEnabled = (idx, value) => {
    const next = currentSections.map((s, i) => i === idx ? { ...s, enabled: !!value } : s);
    setSections(next);
  };
  const updateSectionField = (idx, field, value) => {
    const next = currentSections.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    setSections(next);
  };
  const deleteSection = (idx) => {
    setSections(currentSections.filter((_, i) => i !== idx));
  };
  const addCustomSection = () => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    setSections([
      ...currentSections,
      { key: `custom:${id}`, enabled: true, title: 'New section', html: '<p>Write the content of this section here. Plain HTML is allowed.</p>' },
    ]);
  };
  const resetSectionsToDefault = () => setSections(DEFAULT_SECTION_ORDER);

  const handleFileUpload = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => handleAppChange(field, reader.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <Helmet>
        <title>Admin Settings - {localSettings.appName}</title>
      </Helmet>
      
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        
        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-14 lg:py-16">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="editorial-eyebrow">Studio configuration</p>
                <h1 className="editorial-headline mt-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                  Platform <em>settings.</em>
                </h1>
                <p className="editorial-deck mt-5 max-w-2xl">
                  Brand voice, report typography, comment library, severity scale. Adjustments here propagate everywhere.
                </p>
              </motion.div>
            </div>
          </section>

          <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
          <Tabs defaultValue="branding" className="space-y-8">
            <div className="overflow-x-auto -mx-6 px-6 lg:mx-0 lg:px-0 border-b">
              <TabsList className="inline-flex bg-transparent rounded-none p-0 h-auto gap-1">
                {[
                  ['branding','Global branding'],
                  ['pdf','PDF export'],
                  ['images','Report images'],
                  ['disclaimers','Disclaimer pages'],
                  ['comments','Comment library'],
                  ['severity','Severity levels'],
                  ['brands','Brand catalogue'],
                  ['scoring','Property scoring'],
                  ['legal','Legal & info'],
                ].map(([v,l]) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 sm:px-5 pb-2 sm:pb-3 font-display text-sm sm:text-base"
                  >{l}</TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="branding">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Global Branding</CardTitle>
                  <CardDescription>Set the main application name, colors, and logos used across the app interface.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label>Application Name</Label>
                        <Input value={localSettings.appName} onChange={e => handleAppChange('appName', e.target.value)} />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Primary Brand Color</Label>
                          <div className="flex gap-2">
                            <Input type="color" value={localSettings.primaryBrandColor || '#003366'} onChange={e => handleAppChange('primaryBrandColor', e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
                            <Input value={localSettings.primaryBrandColor || '#003366'} onChange={e => handleAppChange('primaryBrandColor', e.target.value)} className="font-mono text-xs uppercase" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Secondary Brand Color</Label>
                          <div className="flex gap-2">
                            <Input type="color" value={localSettings.secondaryBrandColor || '#173f6b'} onChange={e => handleAppChange('secondaryBrandColor', e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
                            <Input value={localSettings.secondaryBrandColor || '#173f6b'} onChange={e => handleAppChange('secondaryBrandColor', e.target.value)} className="font-mono text-xs uppercase" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label>Global Logo (Navbar & Login)</Label>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl border bg-muted flex items-center justify-center overflow-hidden relative">
                            {localSettings.customLogo ? (
                              <img src={localSettings.customLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                            ) : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'customLogo')} />
                          </div>
                          <div className="flex-1">
                            <Button variant="outline" size="sm" onClick={() => handleAppChange('customLogo', null)} disabled={!localSettings.customLogo}>Remove</Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Browser Favicon</Label>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center overflow-hidden relative">
                            {localSettings.favicon ? (
                              <img src={localSettings.favicon} alt="Favicon" className="w-full h-full object-cover" />
                            ) : <ImageIcon className="w-4 h-4 text-muted-foreground" />}
                            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'favicon')} />
                          </div>
                          <div className="flex-1">
                            <Button variant="outline" size="sm" onClick={() => handleAppChange('favicon', null)} disabled={!localSettings.favicon}>Remove</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t bg-muted/30 py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Global Branding</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="pdf">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>PDF Export Customization</CardTitle>
                  <CardDescription>Configure company details and colors specifically for PDF generation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Reuse existing PDF fields logic here, condensed */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2"><Label>PDF Company Name</Label><Input value={localSettings.companyName} onChange={e => handleAppChange('companyName', e.target.value)} /></div>
                    <div className="space-y-2"><Label>PDF Email</Label><Input value={localSettings.companyEmail} onChange={e => handleAppChange('companyEmail', e.target.value)} /></div>
                    <div className="space-y-2"><Label>PDF Phone 1</Label><Input value={localSettings.companyPhone1} onChange={e => handleAppChange('companyPhone1', e.target.value)} /></div>
                    <div className="space-y-2"><Label>PDF Phone 2</Label><Input value={localSettings.companyPhone2} onChange={e => handleAppChange('companyPhone2', e.target.value)} /></div>
                    <div className="space-y-2"><Label>PDF Primary Color</Label><Input type="color" value={localSettings.primaryColor} onChange={e => handleAppChange('primaryColor', e.target.value)} /></div>
                    <div className="space-y-2"><Label>PDF Accent Color</Label><Input type="color" value={localSettings.accentColor} onChange={e => handleAppChange('accentColor', e.target.value)} /></div>
                  </div>

                  {/* ── Cover page image ─────────────────────────────────────── */}
                  <div className="pt-6 border-t space-y-3">
                    <div>
                      <Label className="text-base font-semibold">Default cover page image</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        This image fills the first page of every exported PDF (210&nbsp;×&nbsp;297&nbsp;mm A4 frame, image is auto-fit to cover). Recommended: portrait JPG/PNG, at least 800&nbsp;×&nbsp;1130&nbsp;px, under 2&nbsp;MB. Leave blank to use <code>public/report-cover.jpg</code> or the built-in CheckSquare cover.
                      </p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-40 h-56 border rounded-md overflow-hidden bg-muted flex items-center justify-center relative flex-shrink-0">
                        {localSettings.coverImage ? (
                          <img src={localSettings.coverImage} alt="Cover preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground text-center px-2">
                            No custom cover
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="relative inline-block">
                          <Button variant="outline" size="sm" className="pointer-events-none">
                            <Plus className="w-4 h-4 mr-2" /> Upload cover image
                          </Button>
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={e => handleFileUpload(e, 'coverImage')}
                          />
                        </div>
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleAppChange('coverImage', null)}
                            disabled={!localSettings.coverImage}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Remove custom cover
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          File is stored as base64 in app settings — changes take effect immediately in both Preview and downloaded PDF/DOCX.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Section ordering, toggles & custom sections ─────────── */}
                  <div className="pt-6 border-t">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <Label className="text-base font-semibold">Report sections (drag-free reorder)</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use the up / down arrows to reorder pages in the customer PDF. Toggle the switch to hide a page without losing its position. Add custom sections to inject extra pages anywhere in the document.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={addCustomSection}>
                          <Plus className="w-4 h-4 mr-2" /> Add section
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPdfPreviewOpen(true)}>
                          <Eye className="w-4 h-4 mr-2" /> Preview report
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {currentSections.map((section, idx) => {
                        const isCustom = section.key?.startsWith('custom:');
                        const label = isCustom
                          ? (section.title || 'Custom section')
                          : (BUILTIN_SECTION_LABELS[section.key] || section.key);
                        return (
                          <div key={section.key} className={`border rounded-md ${section.enabled === false ? 'bg-muted/40 opacity-70' : 'bg-card'}`}>
                            <div className="flex items-center gap-2 px-3 py-2">
                              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="w-6 text-xs text-muted-foreground tabular-nums">{idx + 1}.</span>
                              <span className="flex-1 text-sm font-medium truncate">
                                {label}
                                {isCustom && <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-secondary">Custom</span>}
                              </span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveSection(idx, -1)}>
                                <ArrowUp className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === currentSections.length - 1} onClick={() => moveSection(idx, +1)}>
                                <ArrowDown className="w-4 h-4" />
                              </Button>
                              <Switch
                                checked={section.enabled !== false}
                                onCheckedChange={(v) => toggleSectionEnabled(idx, v)}
                              />
                              {isCustom && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSection(idx)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            {isCustom && (
                              <div className="px-3 pb-3 pt-1 space-y-2 border-t">
                                <div>
                                  <Label className="text-xs">Page title</Label>
                                  <Input
                                    value={section.title || ''}
                                    onChange={(e) => updateSectionField(idx, 'title', e.target.value)}
                                    placeholder="e.g. Maintenance recommendations"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Body HTML</Label>
                                  <Textarea
                                    rows={4}
                                    className="font-mono text-xs"
                                    value={section.html || ''}
                                    onChange={(e) => updateSectionField(idx, 'html', e.target.value)}
                                    placeholder="<p>Section content. Plain HTML is supported.</p>"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={resetSectionsToDefault}>
                        Reset to default order
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t bg-muted/30 py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save PDF Settings</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="disclaimers"><DisclaimerEditor /></TabsContent>
            <TabsContent value="comments">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Comment Library</CardTitle>
                  <CardDescription>
                    Master list of defect comments grouped by classification (Flooring, Skirting, Dado Tiles, etc.).
                    Severity auto-fills in the inspector form whenever a comment is selected.
                    Import from Excel via CSV — the format matches the CHECK SQUARE CHECK LIST sheet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImportBusy(true);
                        try {
                          const text = await file.text();
                          const rows = parseCSV(text);
                          const imported = csvRowsToLibrary(rows);
                          if (imported.length === 0) {
                            toast.error('No valid comment rows found. Expected columns: S.no, Classify, Comment, Type');
                          } else {
                            // Append-only: never overwrite existing entries. Dedupe on
                            // (classify + comment) case-insensitive so re-importing the
                            // same sheet is a no-op. Users delete unwanted rows via the UI.
                            setLibDraft(prev => {
                              const key = (e) => `${(e.classify || '').trim().toLowerCase()}||${(e.text || '').trim().toLowerCase()}`;
                              const existing = new Set(prev.map(key));
                              const added = [];
                              for (const row of imported) {
                                if (!existing.has(key(row))) {
                                  existing.add(key(row));
                                  added.push(row);
                                }
                              }
                              if (added.length === 0) {
                                toast.info(`All ${imported.length} rows already exist — nothing appended.`);
                                return prev;
                              }
                              toast.success(`Appended ${added.length} new comment${added.length === 1 ? '' : 's'} (${imported.length - added.length} duplicate${imported.length - added.length === 1 ? '' : 's'} skipped). Click "Save Library" to apply.`);
                              return [...prev, ...added];
                            });
                          }
                        } catch (err) {
                          toast.error('Failed to read file: ' + (err?.message || 'unknown'));
                        } finally {
                          setImportBusy(false);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }
                      }}
                    />
                    <Button
                      variant="default"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importBusy}
                    >
                      <Upload className="w-4 h-4 mr-2" /> {importBusy ? 'Reading…' : 'Import CSV (Append)'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => downloadCSV('comment-library.csv', libraryToCSV(libDraft))}
                    >
                      <Download className="w-4 h-4 mr-2" /> Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => downloadCSV(
                        'comment-library-template.csv',
                        'S.no,Classify,Comment,Type\n1,Flooring,Crack observed on floor tiles,MAJOR\n2,Flooring,Offset observed in floor tiles,MINOR\n3,Frame and Shutter,Scratches observed on shutter,COSMETIC\n',
                      )}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Download Template
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (!confirm('Replace the current library with the built-in CHECK SQUARE starter set? Unsaved edits will be lost.')) return;
                        setLibDraft(normalizeCommentLibrary(STARTER_COMMENT_LIBRARY));
                        toast.success('Loaded starter library');
                      }}
                    >
                      Load Starter Set
                    </Button>
                    <div className="ml-auto text-xs text-muted-foreground">
                      {libDraft.length} comments · {Array.from(new Set(libDraft.map(e => e.classify))).length} classifications
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Excel users: in Excel, choose <em>File → Save As → CSV UTF-8</em> with columns
                    <code className="mx-1 px-1 bg-muted rounded">S.no, Classify, Comment, Type</code>
                    (Type accepts MAJOR / MINOR / COSMETIC). Empty Classify cells inherit the row above (matches merged-cell layout).
                  </p>

                  {/* Visible standard format reference */}
                  <div className="border rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Standard Excel / CSV format
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Your spreadsheet must use exactly these 4 columns in this order. Save as <strong>CSV UTF-8 (*.csv)</strong> before importing.
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-md border bg-background">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-emerald-600 text-white">
                            <th className="px-3 py-2 text-left font-semibold border-r border-emerald-500">S.no</th>
                            <th className="px-3 py-2 text-left font-semibold border-r border-emerald-500">Classify</th>
                            <th className="px-3 py-2 text-left font-semibold border-r border-emerald-500">Comment</th>
                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          <tr><td className="px-3 py-1.5 border-r">1</td><td className="px-3 py-1.5 border-r font-medium">Flooring</td><td className="px-3 py-1.5 border-r">Crack observed on floor tiles</td><td className="px-3 py-1.5 font-bold" style={{color:'#dc2626'}}>MAJOR</td></tr>
                          <tr><td className="px-3 py-1.5 border-r">2</td><td className="px-3 py-1.5 border-r text-muted-foreground italic">(blank — inherits "Flooring")</td><td className="px-3 py-1.5 border-r">Offset observed in floor tiles</td><td className="px-3 py-1.5 font-bold" style={{color:'#16a34a'}}>MINOR</td></tr>
                          <tr><td className="px-3 py-1.5 border-r">3</td><td className="px-3 py-1.5 border-r text-muted-foreground italic">(blank)</td><td className="px-3 py-1.5 border-r">Hollow sound in floor tiles</td><td className="px-3 py-1.5 font-bold" style={{color:'#16a34a'}}>MINOR</td></tr>
                          <tr><td className="px-3 py-1.5 border-r">4</td><td className="px-3 py-1.5 border-r font-medium">Skirting</td><td className="px-3 py-1.5 border-r">Skirting tile not in level</td><td className="px-3 py-1.5 font-bold" style={{color:'#ca8a04'}}>COSMETIC</td></tr>
                          <tr><td className="px-3 py-1.5 border-r">5</td><td className="px-3 py-1.5 border-r font-medium">Frame and Shutter</td><td className="px-3 py-1.5 border-r">Scratches observed on shutter</td><td className="px-3 py-1.5 font-bold" style={{color:'#ca8a04'}}>COSMETIC</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                        <span><strong>S.no</strong> — any number (used for ordering only). Will be regenerated on export.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                        <span><strong>Classify</strong> — group name. Blank cells inherit the previous row (merged-cell style).</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                        <span><strong>Comment</strong> — the exact defect text inspectors will pick.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                        <span><strong>Type</strong> — one of <code className="px-1 bg-muted rounded">MAJOR</code> · <code className="px-1 bg-muted rounded">MINOR</code> · <code className="px-1 bg-muted rounded">COSMETIC</code> (case-insensitive).</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadCSV(
                          'comment-library-template.csv',
                          'S.no,Classify,Comment,Type\n1,Flooring,Crack observed on floor tiles,MAJOR\n2,,Offset observed in floor tiles,MINOR\n3,,Hollow sound in floor tiles,MINOR\n4,Skirting,Skirting tile not in level,COSMETIC\n5,Frame and Shutter,Scratches observed on shutter,COSMETIC\n',
                        )}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download this template
                      </Button>
                      <span className="text-xs text-muted-foreground">Open in Excel, add your rows, save as CSV, then click <strong>Import</strong>. New rows are <strong>appended</strong> to the existing library — duplicates (same Classify + Comment) are skipped. Delete unwanted entries from the table below.</span>
                    </div>
                  </div>

                  {/* Filter + add row */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end pt-3 border-t">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Filter by class</Label>
                      <Select value={libFilter} onValueChange={setLibFilter}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All classes</SelectItem>
                          {Array.from(new Set(libDraft.map(e => e.classify))).sort().map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs">Classify</Label>
                      <Input
                        value={newRow.classify}
                        onChange={e => setNewRow({ ...newRow, classify: e.target.value })}
                        placeholder="e.g. Flooring"
                        list="lib_classify_presets"
                      />
                      <datalist id="lib_classify_presets">
                        {Array.from(new Set(libDraft.map(e => e.classify))).sort().map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div className="md:col-span-5">
                      <Label className="text-xs">Comment</Label>
                      <Input
                        value={newRow.text}
                        onChange={e => setNewRow({ ...newRow, text: e.target.value })}
                        placeholder="e.g. Crack observed on floor tiles"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!newRow.text.trim() || !newRow.classify.trim()) {
                              toast.error('Classify and Comment are required');
                              return;
                            }
                            setLibDraft(prev => [
                              ...prev,
                              { id: `cl_${Date.now()}`, classify: newRow.classify.trim(), text: newRow.text.trim(), severity: newRow.severity },
                            ]);
                            setNewRow({ classify: newRow.classify, text: '', severity: newRow.severity });
                          }
                        }}
                      />
                    </div>
                    <div className="md:col-span-1">
                      <Label className="text-xs">Severity</Label>
                      <Select value={newRow.severity} onValueChange={v => setNewRow({ ...newRow, severity: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {((localSettings.severityLevels || []).length
                            ? localSettings.severityLevels
                            : [{ name: 'Major' }, { name: 'Minor' }, { name: 'Cosmetic' }]
                          ).filter(s => s && s.name).map((s) => (
                            <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-1">
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (!newRow.text.trim() || !newRow.classify.trim()) {
                            toast.error('Classify and Comment are required');
                            return;
                          }
                          setLibDraft(prev => [
                            ...prev,
                            { id: `cl_${Date.now()}`, classify: newRow.classify.trim(), text: newRow.text.trim(), severity: newRow.severity },
                          ]);
                          setNewRow({ classify: newRow.classify, text: '', severity: newRow.severity });
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wider">
                      <div className="col-span-1">#</div>
                      <div className="col-span-3">Classify</div>
                      <div className="col-span-6">Comment</div>
                      <div className="col-span-1">Severity</div>
                      <div className="col-span-1 text-right">Del</div>
                    </div>
                    <div className="max-h-[460px] overflow-y-auto divide-y">
                      {libDraft
                        .filter(e => libFilter === 'All' || e.classify === libFilter)
                        .map((entry, idx) => {
                          const realIdx = libDraft.indexOf(entry);
                          // Look up severity color from settings.severityLevels so
                          // admin-defined colors propagate here. Falls back to the
                          // legacy hardcoded palette if no match (e.g. a stale entry
                          // referencing a severity that has since been deleted).
                          const sevMeta = (localSettings.severityLevels || []).find(s => s?.name === entry.severity);
                          const sevColor = sevMeta?.color
                            || (entry.severity === 'Major'    ? '#dc2626'
                              : entry.severity === 'Minor'    ? '#16a34a'
                              : entry.severity === 'Cosmetic' ? '#ca8a04'
                              : '#9ca3af');
                          const sevOptions = ((localSettings.severityLevels || []).length
                            ? localSettings.severityLevels
                            : [{ name: 'Major' }, { name: 'Minor' }, { name: 'Cosmetic' }]
                          ).filter(s => s && s.name);
                          return (
                            <div key={entry.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm hover:bg-muted/40">
                              <div className="col-span-1 text-muted-foreground">{idx + 1}</div>
                              <div className="col-span-3">
                                <Input
                                  value={entry.classify}
                                  onChange={(e) => {
                                    setLibDraft(prev => prev.map((x, i) => i === realIdx ? { ...x, classify: e.target.value } : x));
                                  }}
                                  className="h-8"
                                />
                              </div>
                              <div className="col-span-6">
                                <Input
                                  value={entry.text}
                                  onChange={(e) => {
                                    setLibDraft(prev => prev.map((x, i) => i === realIdx ? { ...x, text: e.target.value } : x));
                                  }}
                                  className="h-8"
                                />
                              </div>
                              <div className="col-span-1">
                                <Select
                                  value={entry.severity || 'Minor'}
                                  onValueChange={(v) => {
                                    setLibDraft(prev => prev.map((x, i) => i === realIdx ? { ...x, severity: v } : x));
                                  }}
                                >
                                  <SelectTrigger className="h-8 px-2" style={{ color: sevColor, fontWeight: 700 }}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sevOptions.map((s) => (
                                      <SelectItem key={s.name} value={s.name}>{s.name.toUpperCase()}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setLibDraft(prev => prev.filter((_, i) => i !== realIdx))}
                                  className="text-destructive h-8 w-8"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      {libDraft.length === 0 && (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                          Library is empty. Click <strong>Load Starter Set</strong> or import a CSV.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t py-4 justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setLibDraft(normalizeCommentLibrary(settings.commentLibrary))}
                  >
                    Discard
                  </Button>
                  <Button
                    onClick={() => {
                      handleAppChange('commentLibrary', libDraft);
                      handleSave();
                    }}
                  >
                    <Save className="w-4 h-4 mr-2" /> Save Library
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="severity">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Severity Levels</CardTitle>
                  <CardDescription>
                    Defect severity tiers with their visual indicator color and definition.
                    Used everywhere — defect form, dashboards, and PDF report.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(localSettings.severityLevels || []).map((sev, idx) => (
                    <div key={sev.id || idx} className="grid grid-cols-12 gap-3 items-end p-3 rounded-lg border bg-muted/30">
                      <div className="col-span-12 sm:col-span-2">
                        <Label className="text-xs">Color</Label>
                        <Input
                          type="color"
                          value={sev.color || '#888'}
                          onChange={(e) => {
                            const next = [...localSettings.severityLevels];
                            next[idx] = { ...next[idx], color: e.target.value };
                            handleAppChange('severityLevels', next);
                          }}
                          className="h-10 cursor-pointer"
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={sev.name}
                          onChange={(e) => {
                            const next = [...localSettings.severityLevels];
                            next[idx] = { ...next[idx], name: e.target.value };
                            handleAppChange('severityLevels', next);
                          }}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-6">
                        <Label className="text-xs">Definition</Label>
                        <Textarea
                          value={sev.definition || ''}
                          onChange={(e) => {
                            const next = [...localSettings.severityLevels];
                            next[idx] = { ...next[idx], definition: e.target.value };
                            handleAppChange('severityLevels', next);
                          }}
                          rows={4}
                          placeholder="Long-form description shown in the PDF taxonomy page and as the defect-pill tooltip."
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            const next = (localSettings.severityLevels || []).filter((_, i) => i !== idx);
                            handleAppChange('severityLevels', next);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = [
                        ...(localSettings.severityLevels || []),
                        { id: `sev_${Date.now()}`, name: 'New', color: '#666', definition: '' },
                      ];
                      handleAppChange('severityLevels', next);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Severity Tier
                  </Button>
                </CardContent>
                <CardFooter className="border-t py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Severities</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="brands">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Hardware Brand Catalog</CardTitle>
                  <CardDescription>
                    Categories and brand suggestions shown to inspectors in Phase 3 (Water Quality + Brands).
                    The inspector can still type custom brands on-site, but everything you add here appears as a one-tap pill.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <BrandCatalogEditor
                    catalog={localSettings.brandCatalog || {}}
                    onChange={(next) => handleAppChange('brandCatalog', next)}
                  />
                </CardContent>
                <CardFooter className="border-t py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Brand Catalog</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="scoring">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Property Scoring System</CardTitle>
                  <CardDescription>
                    Configure the PropChk severity model used for the 0–100 Property Score on every report.
                    Each room is rated against an N-item checklist and penalised by the count and severity of defects.
                    Inspectors may toggle scoring on/off per inspection and override individual room scores.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div>
                      <Label className="text-base font-semibold">Enable property scoring globally</Label>
                      <p className="text-sm text-muted-foreground mt-1">When off, the score page is hidden from all reports regardless of inspector preference.</p>
                    </div>
                    <Switch
                      checked={localSettings.scoring?.enabled !== false}
                      onCheckedChange={(v) => handleAppChange('scoring', {
                        ...(localSettings.scoring || { weights: { ...PROPCHK_WEIGHTS }, itemsPerRoom: PROPCHK_ITEMS_PER_ROOM, explanation: DEFAULT_SCORE_EXPLANATION_HTML }),
                        enabled: !!v,
                      })}
                    />
                  </div>

                  <div>
                    {(() => {
                      const sevList = (localSettings.severityLevels || []).filter(s => s && s.name);
                      const sevKeys = sevList.length ? sevList.map(s => s.name) : ['Major', 'Minor', 'Cosmetic'];
                      const totalW = sevKeys.reduce((s, k) => s + (Number(localSettings.scoring?.weights?.[k]) || 0), 0);
                      return (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-base font-semibold">Severity weights</Label>
                            <span className="text-sm text-muted-foreground">
                              Total: {totalW.toFixed(2)}
                              {Math.abs(totalW - 1) > 0.001 && (
                                <span className="text-destructive ml-2">(should sum to 1.00)</span>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">
                            Each room's score = Σ weight × satisfaction over every severity defined in the Severity Taxonomy above. Per-severity satisfaction = max(0, (items − count) / items) × 100. PropChk defaults: Major 0.70, Minor 0.25, Cosmetic 0.05. Adding a new severity in the taxonomy creates a new row here automatically.
                          </p>
                          <div className="space-y-2">
                            {sevKeys.map((key) => {
                              const sev = sevList.find(s => s.name === key) || {};
                              const color = sev.color || (key === 'Major' ? '#dc2626' : key === 'Minor' ? '#f59e0b' : key === 'Cosmetic' ? '#a3a3a3' : '#9ca3af');
                              const desc = sev.definition || '—';
                              const fallback = PROPCHK_WEIGHTS[key] != null ? PROPCHK_WEIGHTS[key] : 0;
                              return (
                                <div key={key} className="grid grid-cols-12 gap-3 items-center">
                                  <div className="col-span-8 flex items-center gap-2 text-sm">
                                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
                                    <div>
                                      <div className="font-medium">{key}</div>
                                      <div className="text-xs text-muted-foreground">{desc}</div>
                                    </div>
                                  </div>
                                  <div className="col-span-4 flex items-center gap-2">
                                    <Input
                                      type="number" min="0" max="1" step="0.01"
                                      value={localSettings.scoring?.weights?.[key] ?? fallback}
                                      onChange={(e) => {
                                        const n = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                                        handleAppChange('scoring', {
                                          ...(localSettings.scoring || { enabled: true, itemsPerRoom: PROPCHK_ITEMS_PER_ROOM, explanation: DEFAULT_SCORE_EXPLANATION_HTML }),
                                          weights: { ...PROPCHK_WEIGHTS, ...(localSettings.scoring?.weights || {}), [key]: n },
                                        });
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-3">
                            <Button
                              variant="outline" size="sm"
                              onClick={() => handleAppChange('scoring', {
                                ...(localSettings.scoring || { enabled: true, itemsPerRoom: PROPCHK_ITEMS_PER_ROOM, explanation: DEFAULT_SCORE_EXPLANATION_HTML }),
                                weights: { ...PROPCHK_WEIGHTS },
                              })}
                            >Reset weights to defaults</Button>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    <Label className="text-base font-semibold">Items per room (checklist size)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      The denominator in the satisfaction formula. Lower values make each defect hurt more; higher values are more forgiving. Default: 20 (matches the PropChk macro).
                    </p>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number" min="1" max="200"
                        className="max-w-[140px]"
                        value={localSettings.scoring?.itemsPerRoom ?? PROPCHK_ITEMS_PER_ROOM}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || PROPCHK_ITEMS_PER_ROOM));
                          handleAppChange('scoring', {
                            ...(localSettings.scoring || { enabled: true, weights: { ...PROPCHK_WEIGHTS }, explanation: DEFAULT_SCORE_EXPLANATION_HTML }),
                            itemsPerRoom: n,
                          });
                        }}
                      />
                      <span className="text-xs text-muted-foreground">items</span>
                    </div>
                  </div>

                  {/* ── Custom score formula (admin power-tool) ─────────────── */}
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <Label className="text-base font-semibold">Custom score formula <span className="ml-2 text-xs font-normal text-muted-foreground">(advanced)</span></Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      JavaScript expression evaluated per room. Available variables:
                      {' '}<code className="text-[11px]">major</code>, <code className="text-[11px]">minor</code>, <code className="text-[11px]">cosmetic</code>, <code className="text-[11px]">items</code>,
                      {' '}<code className="text-[11px]">satMajor</code>, <code className="text-[11px]">satMinor</code>, <code className="text-[11px]">satCosmetic</code>,
                      {' '}<code className="text-[11px]">roomName</code>, <code className="text-[11px]">propertyType</code>, <code className="text-[11px]">Math</code>.
                      {' '}Must return a number 0–100. Falls back to the default formula on any error.
                    </p>
                    <Textarea
                      rows={3}
                      className="mt-3 font-mono text-xs"
                      value={localSettings.scoring?.roomScoreExpr ?? DEFAULT_ROOM_SCORE_EXPR}
                      onChange={(e) => handleAppChange('scoring', {
                        ...(localSettings.scoring || {}),
                        roomScoreExpr: e.target.value,
                      })}
                    />
                    <Label className="text-sm font-semibold mt-4 block">Priority formula</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Must return one of <code className="text-[11px]">'Urgent'</code>, <code className="text-[11px]">'Watch'</code>, or <code className="text-[11px]">'Clean'</code>.
                    </p>
                    <Textarea
                      rows={2}
                      className="mt-2 font-mono text-xs"
                      value={localSettings.scoring?.priorityExpr ?? DEFAULT_PRIORITY_EXPR}
                      onChange={(e) => handleAppChange('scoring', {
                        ...(localSettings.scoring || {}),
                        priorityExpr: e.target.value,
                      })}
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleAppChange('scoring', {
                          ...(localSettings.scoring || {}),
                          roomScoreExpr: DEFAULT_ROOM_SCORE_EXPR,
                          priorityExpr:  DEFAULT_PRIORITY_EXPR,
                        })}
                      >Reset formulas to defaults</Button>
                    </div>

                    {/* Live preview */}
                    <div className="mt-4 rounded-md border bg-background p-3 text-xs">
                      <div className="font-semibold mb-2">Live preview · Sample room (2 Major, 3 Minor, 2 Cosmetic)</div>
                      {formulaPreview?.error ? (
                        <div className="text-destructive">Error: {formulaPreview.error}</div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div><div className="text-muted-foreground">Score</div><div className="text-2xl font-display">{formulaPreview?.scorePct?.toFixed(1)}%</div></div>
                          <div><div className="text-muted-foreground">Score (0–10)</div><div className="text-2xl font-display">{formulaPreview?.score10?.toFixed(1)}</div></div>
                          <div><div className="text-muted-foreground">Priority</div><div className="text-2xl font-display">{formulaPreview?.priority}</div></div>
                          <div><div className="text-muted-foreground">satMajor / satMinor / satCosmetic</div><div className="font-mono">{formulaPreview?.satMajor?.toFixed(1)} / {formulaPreview?.satMinor?.toFixed(1)} / {formulaPreview?.satCosmetic?.toFixed(1)}</div></div>
                        </div>
                      )}
                      {(formulaPreview?.scoreError || formulaPreview?.priorityError) && (
                        <div className="mt-2 text-destructive">
                          {formulaPreview.scoreError    && <div>Score formula parse error: {formulaPreview.scoreError}</div>}
                          {formulaPreview.priorityError && <div>Priority formula parse error: {formulaPreview.priorityError}</div>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-base font-semibold">Score-page explanation (HTML)</Label>
                    <p className="text-sm text-muted-foreground mt-1 mb-2">
                      This content renders on the Property Score · Methodology page of the PDF, below an auto-generated live summary block. Headings, paragraphs, and lists are allowed. You can embed live tokens that are replaced with the current scoring config &amp; this report's numbers at render time — so editing the formula or weights automatically updates the prose.
                    </p>
                    <details className="mt-2 mb-2 text-xs border rounded p-3 bg-muted/40">
                      <summary className="cursor-pointer font-semibold text-foreground">Available tokens (click to expand)</summary>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
                        <div><code>&#123;&#123;averageScore&#125;&#125;</code> — e.g. 87</div>
                        <div><code>&#123;&#123;averageScoreOf10&#125;&#125;</code> — e.g. 8.7</div>
                        <div><code>&#123;&#123;grade&#125;&#125;</code> — e.g. B · Good</div>
                        <div><code>&#123;&#123;gradeLetter&#125;&#125;</code> — e.g. B</div>
                        <div><code>&#123;&#123;gradeLabel&#125;&#125;</code> — e.g. Good</div>
                        <div><code>&#123;&#123;overallPriority&#125;&#125;</code> — Clean / Watch / Urgent</div>
                        <div><code>&#123;&#123;totalRooms&#125;&#125;</code></div>
                        <div><code>&#123;&#123;totalDefects&#125;&#125;</code></div>
                        <div><code>&#123;&#123;totalMajor&#125;&#125;</code></div>
                        <div><code>&#123;&#123;totalMinor&#125;&#125;</code></div>
                        <div><code>&#123;&#123;totalCosmetic&#125;&#125;</code></div>
                        <div><code>&#123;&#123;itemsPerRoom&#125;&#125;</code></div>
                        <div><code>&#123;&#123;weightMajor&#125;&#125;</code> — 0.70</div>
                        <div><code>&#123;&#123;weightMinor&#125;&#125;</code> — 0.25</div>
                        <div><code>&#123;&#123;weightCosmetic&#125;&#125;</code> — 0.05</div>
                        <div><code>&#123;&#123;weightMajorPct&#125;&#125;</code> — 70%</div>
                        <div><code>&#123;&#123;weightMinorPct&#125;&#125;</code> — 25%</div>
                        <div><code>&#123;&#123;weightCosmeticPct&#125;&#125;</code> — 5%</div>
                        <div><code>&#123;&#123;roomScoreFormula&#125;&#125;</code></div>
                        <div><code>&#123;&#123;priorityFormula&#125;&#125;</code></div>
                      </div>
                    </details>
                    <Textarea
                      rows={16}
                      value={localSettings.scoring?.explanation || DEFAULT_SCORE_EXPLANATION_HTML}
                      onChange={(e) => handleAppChange('scoring', {
                        ...(localSettings.scoring || { enabled: true, weights: { ...PROPCHK_WEIGHTS }, itemsPerRoom: PROPCHK_ITEMS_PER_ROOM }),
                        explanation: e.target.value,
                      })}
                      className="mt-2 font-mono text-xs"
                    />
                    <div className="mt-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleAppChange('scoring', {
                          ...(localSettings.scoring || { enabled: true, weights: { ...PROPCHK_WEIGHTS }, itemsPerRoom: PROPCHK_ITEMS_PER_ROOM }),
                          explanation: DEFAULT_SCORE_EXPLANATION_HTML,
                        })}
                      >Restore default copy</Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Scoring Settings</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="legal">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Legal &amp; Info Pages</CardTitle>
                  <CardDescription>
                    Edit the content shown on the public Privacy Policy, Terms of Service, and About pages.
                    Plain HTML is allowed (headings, paragraphs, lists). Changes go live immediately for all sessions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="text-sm font-semibold">Privacy Policy</Label>
                    <Textarea
                      value={localSettings.privacyPolicy || ''}
                      onChange={(e) => handleAppChange('privacyPolicy', e.target.value)}
                      rows={10}
                      className="mt-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Terms of Service</Label>
                    <Textarea
                      value={localSettings.termsOfService || ''}
                      onChange={(e) => handleAppChange('termsOfService', e.target.value)}
                      rows={10}
                      className="mt-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">About / Info</Label>
                    <Textarea
                      value={localSettings.aboutInfo || ''}
                      onChange={(e) => handleAppChange('aboutInfo', e.target.value)}
                      rows={8}
                      className="mt-2 font-mono text-xs"
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Legal Pages</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="images">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Report Images</CardTitle>
                  <CardDescription>
                    Control how inspection photos are cropped, compressed and sized across every report and the Excel export. Changes apply on every device the moment you save.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <Label>Photo fit</Label>
                      <Select
                        value={localSettings.reportImages?.fit || 'contain'}
                        onValueChange={v => handleImageChange('fit', v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contain">Contain — whole photo, letterboxed (no distortion)</SelectItem>
                          <SelectItem value="cover">Cover — fill the box, crop the overflow</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Applies to PDF, DOCX, Excel and on-screen galleries.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Report photo quality (JPEG)</Label>
                      <Input
                        type="number" min={0.4} max={1} step={0.02}
                        value={localSettings.reportImages?.quality ?? 0.86}
                        onChange={e => handleImageChange('quality', Math.min(1, Math.max(0.4, parseFloat(e.target.value) || 0.86)))}
                      />
                      <p className="text-xs text-muted-foreground">0.4 (smaller file) → 1.0 (best quality). Default 0.86.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Resize new photos — max edge (px)</Label>
                      <Input
                        type="number" min={0} step={100}
                        value={localSettings.reportImages?.uploadMaxEdge ?? 1600}
                        onChange={e => handleImageChange('uploadMaxEdge', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      />
                      <p className="text-xs text-muted-foreground">New uploads are shrunk so the longest edge ≤ this. 0 = keep original (uses more storage). Default 1600.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Upload compression (JPEG)</Label>
                      <Input
                        type="number" min={0.4} max={1} step={0.02}
                        value={localSettings.reportImages?.uploadQuality ?? 0.85}
                        onChange={e => handleImageChange('uploadQuality', Math.min(1, Math.max(0.4, parseFloat(e.target.value) || 0.85)))}
                      />
                      <p className="text-xs text-muted-foreground">Quality applied when a new photo is resized. Default 0.85.</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Excel photo width (cm)</Label>
                      <Input
                        type="number" min={1} max={25} step={0.05}
                        value={localSettings.reportImages?.boxWidthCm ?? 8.45}
                        onChange={e => handleImageChange('boxWidthCm', Math.max(1, parseFloat(e.target.value) || 8.45))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Excel photo height (cm)</Label>
                      <Input
                        type="number" min={1} max={25} step={0.05}
                        value={localSettings.reportImages?.boxHeightCm ?? 6.4}
                        onChange={e => handleImageChange('boxHeightCm', Math.max(1, parseFloat(e.target.value) || 6.4))}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Excel embeds each photo at exactly the width × height above (at 96 DPI, 8.45 × 6.4 cm ≈ 319 × 242 px). Resizing only affects photos taken after you save — existing photos are unchanged.
                  </p>
                </CardContent>
                <CardFooter className="border-t py-4 justify-end">
                  <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Image Settings</Button>
                </CardFooter>
              </Card>
            </TabsContent>

          </Tabs>
          </section>
        </main>
        <Footer />
      </div>

      {/* PDF preview — uses a synthetic sample inspection so admins can
          see the effect of section toggles & formula edits without
          needing a real inspection in the database. */}
      <PdfSectionsPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        settings={localSettings}
      />
    </>
  );
};

// ── Synthetic inspection used to power the admin PDF preview ──────────
const SAMPLE_INSPECTION = {
  id: 'preview-sample',
  metadata: {
    preparedFor: 'Sample Client',
    propertyAddress: '12 Editorial Way, Sample City',
    inspectionDate: new Date().toISOString().slice(0, 10),
  },
  propertyType: 'Apartment',
  totalSft: 1200,
  waterQuality: { tds: '180', ph: '7.2' },
  roomInspections: [
    {
      id: 'r1', name: 'Living Room',
      spaces: ['Walls', 'Ceiling', 'Floor'],
      defects: [
        { severity: 'Major',    description: 'Cracked tile near entry.' },
        { severity: 'Minor',    description: 'Loose switch plate.' },
        { severity: 'Cosmetic', description: 'Scuff mark on wall.' },
      ],
    },
    {
      id: 'r2', name: 'Kitchen',
      spaces: ['Counters', 'Cabinets', 'Sink'],
      defects: [
        { severity: 'Major',    description: 'Leak under sink.' },
        { severity: 'Minor',    description: 'Cabinet hinge loose.' },
      ],
    },
  ],
  includeScore: true,
};

// Build a synthetic inspection with N rooms so admins can stress-test
// pagination & adaptive chart behavior on the Score dashboard page.
const SAMPLE_ROOM_NAMES = [
  'Living Room', 'Kitchen', 'Master Bedroom', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4',
  'Master Bath', 'Guest Bath', 'Powder Room', 'Dining Room', 'Family Room', 'Study',
  'Home Office', 'Laundry', 'Foyer', 'Hallway', 'Pantry', 'Walk-in Closet',
  'Balcony', 'Terrace', 'Garage', 'Basement', 'Attic', 'Sunroom',
  'Mudroom', 'Library', 'Game Room', 'Wine Cellar', 'Media Room', 'Gym',
  'Servant Quarters', 'Pooja Room', 'Storage', 'Utility', 'Patio', 'Deck',
  'Greenhouse', 'Workshop', 'Bar', 'Conservatory',
];
const buildSampleInspection = (roomCount) => {
  const n = Math.max(1, Math.min(roomCount || 2, SAMPLE_ROOM_NAMES.length));
  const roomInspections = Array.from({ length: n }).map((_, i) => {
    // Vary defect counts so charts/bars/donut/priority pills exercise their full range.
    const major = (i % 5 === 0) ? 4 : (i % 3 === 0) ? 2 : (i % 2 === 0) ? 1 : 0;
    const minor = (i % 4) + 1;
    const cosmetic = ((i + 1) % 4);
    const defects = [
      ...Array.from({ length: major }).map((__, k) => ({ severity: 'Major', description: `Major issue #${k + 1}` })),
      ...Array.from({ length: minor }).map((__, k) => ({ severity: 'Minor', description: `Minor issue #${k + 1}` })),
      ...Array.from({ length: cosmetic }).map((__, k) => ({ severity: 'Cosmetic', description: `Cosmetic issue #${k + 1}` })),
    ];
    return {
      id: `r${i + 1}`,
      name: SAMPLE_ROOM_NAMES[i],
      spaces: ['Walls', 'Ceiling', 'Floor'],
      defects,
    };
  });
  return { ...SAMPLE_INSPECTION, roomInspections };
};

const PREVIEW_ROOM_CHOICES = [2, 6, 10, 14, 20, 30, 40];

const PdfSectionsPreviewModal = ({ open, onOpenChange, settings }) => {
  const [roomCount, setRoomCount] = useState(2);
  const sample = useMemo(() => buildSampleInspection(roomCount), [roomCount]);
  const html = useMemo(() => {
    if (!open) return '';
    try { return buildReportHTML(sample, settings); }
    catch (err) { return `<pre style="padding:24px;color:#dc2626;font-family:monospace">${(err && err.message) || String(err)}</pre>`; }
  }, [open, settings, sample]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1280px] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="editorial-eyebrow text-[10px]">Report · Preview</p>
              <DialogTitle className="font-display font-light text-xl sm:text-2xl mt-1 leading-tight">
                Customer report <em className="text-secondary font-display italic">preview.</em>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Stress-test pagination & adaptive charts by changing the synthetic room count.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Rooms</Label>
              <Select value={String(roomCount)} onValueChange={(v) => setRoomCount(Number(v))}>
                <SelectTrigger className="w-[110px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREVIEW_ROOM_CHOICES.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} rooms</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>
        <iframe
          title="PDF preview"
          srcDoc={html}
          className="flex-1 w-full bg-white"
          sandbox="allow-same-origin"
        />
      </DialogContent>
    </Dialog>
  );
};

export default AdminSettingsPage;
