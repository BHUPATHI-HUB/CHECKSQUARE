import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, FileText, FileType2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { buildReportHTML, generatePDF, generateDOCX, buildDOCXBlob } from '@/utils/ReportGenerator.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';

/**
 * In-browser document preview with a small set of business-critical
 * fields exposed for inline editing (preparedFor, address, date, water
 * readings, inspector remarks, include-score toggle). Heavier edits
 * (rooms, defects, photos) still happen in the full inspection form.
 *
 * The preview iframe re-renders whenever the user clicks "Refresh preview"
 * or saves their updates.
 */
const ReportPreviewModal = ({ open, onOpenChange, inspection, onSaved }) => {
  const { settings } = useSettings();
  const { saveInspection } = useInspectionStatus();
  const { user } = useAuth();
  const { showSuccess } = useFeedback();

  const [draft, setDraft] = useState(inspection);
  const [previewKey, setPreviewKey] = useState(0); // bump to force iframe refresh
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null); // 'pdf' | 'docx' | null
  const [dirty, setDirty] = useState(false);
  // Which side of the preview the user is currently looking at — the HTML
  // source the PDF is built from, or a live DOCX render so the two formats
  // can be compared without leaving the modal.
  const [previewMode, setPreviewMode] = useState('pdf'); // 'pdf' | 'docx'
  const [docxRendering, setDocxRendering] = useState(false);
  const [docxError, setDocxError] = useState(null);
  const docxContainerRef = useRef(null);

  // When the modal opens (or a new inspection is passed in), reset the draft.
  useEffect(() => {
    if (open) {
      setDraft(inspection);
      setDirty(false);
      setPreviewKey((k) => k + 1);
      setPreviewMode('pdf');
      setDocxError(null);
    }
  }, [open, inspection]);

  // Render the DOCX into the side-by-side preview pane. We rebuild the
  // blob each time the draft / settings change or the user toggles back
  // to DOCX view so the preview always matches what would be downloaded.
  useEffect(() => {
    if (!open || previewMode !== 'docx' || !draft) return;
    let cancelled = false;
    const container = docxContainerRef.current;
    if (!container) return;
    setDocxRendering(true);
    setDocxError(null);
    container.innerHTML = '';
    (async () => {
      try {
        const [{ blob }, { renderAsync }] = await Promise.all([
          buildDOCXBlob(draft, settings),
          import('docx-preview'),
        ]);
        if (cancelled || !docxContainerRef.current) return;
        await renderAsync(blob, docxContainerRef.current, null, {
          className: 'docx',
          inWrapper: true,
          // Render pages at their true A4 size (794×1123 px) so the
          // DOCX preview matches the PDF iframe view pixel-for-pixel.
          // We previously stretched pages to 100% width which made the
          // two previews look noticeably different.
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          useBase64URL: true,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('DOCX preview failed', err);
          setDocxError(err?.message || String(err));
        }
      } finally {
        if (!cancelled) setDocxRendering(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewMode, draft, settings, previewKey]);

  const html = useMemo(
    () => (draft ? buildReportHTML(draft, settings) : ''),
    // previewKey forces recomputation even if draft reference is the same
    // (e.g. after a save where we mutated nested objects in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, settings, previewKey],
  );

  const patchMetadata = (field, value) => {
    setDraft((d) => ({ ...d, metadata: { ...(d.metadata || {}), [field]: value } }));
    setDirty(true);
  };
  const patchWater = (field, value) => {
    setDraft((d) => ({ ...d, waterQuality: { ...(d.waterQuality || {}), [field]: value } }));
    setDirty(true);
  };
  const patchOverrides = (field, value) => {
    setDraft((d) => ({
      ...d,
      scoreOverrides: {
        ...(d.scoreOverrides || {}),
        [field]: value,
        overriddenBy: user?.name || user?.email || 'Reviewer',
        overriddenAt: new Date().toISOString(),
      },
    }));
    setDirty(true);
  };
  const patchIncludeScore = (value) => {
    setDraft((d) => ({ ...d, includeScore: value }));
    setDirty(true);
  };

  const handleRefresh = () => setPreviewKey((k) => k + 1);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveInspection(
        {
          ...draft,
          inspector: draft.inspector,
          inspectorName: draft.inspectorName,
        },
        draft.id,
      );
      if (saved) {
        setDraft(saved);
        setDirty(false);
        setPreviewKey((k) => k + 1);
        if (onSaved) onSaved(saved);
        showSuccess('Changes saved', 'The preview now reflects your updates. Customers will see the latest version.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (format) => {
    if (!draft) return;
    setGenerating(format);
    toast.info(`Composing ${format.toUpperCase()}…`);
    try {
      if (format === 'pdf') await generatePDF(draft, settings);
      else await generateDOCX(draft, settings);
      toast.success('Report downloaded.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(null);
    }
  };

  if (!draft) return null;

  const overrides = draft.scoreOverrides || {};
  const meta = draft.metadata || {};
  const water = draft.waterQuality || {};
  const includeScore = draft.includeScore !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1280px] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <p className="editorial-eyebrow text-[10px]">Document · Preview</p>
          <DialogTitle className="font-display font-light text-2xl mt-1 leading-tight">
            Preview &amp; <em className="text-secondary font-display italic">refine.</em>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            See exactly what the customer will receive. Quick-edit the fields below for tweaks without re-opening the full form.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_320px] min-h-0">
          {/* Preview iframe / DOCX renderer */}
          <div className="bg-muted/30 md:border-r border-b md:border-b-0 overflow-hidden flex flex-col min-h-[55vh] md:min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-card gap-3">
              <div className="inline-flex rounded-md border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode('pdf')}
                  className={`px-3 py-1 text-[11px] uppercase tracking-[0.18em] rounded-sm transition-colors ${previewMode === 'pdf' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <FileText className="w-3 h-3 inline mr-1.5 -mt-0.5" /> PDF view
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('docx')}
                  className={`px-3 py-1 text-[11px] uppercase tracking-[0.18em] rounded-sm transition-colors ${previewMode === 'docx' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <FileType2 className="w-3 h-3 inline mr-1.5 -mt-0.5" /> DOCX view
                </button>
              </div>
              <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-7 text-xs">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
              </Button>
            </div>
            {previewMode === 'pdf' ? (
              <iframe
                key={previewKey}
                title="Report preview"
                srcDoc={html}
                className="flex-1 w-full bg-white"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex-1 min-h-0 overflow-auto bg-neutral-100 relative">
                {docxRendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Composing DOCX preview…
                    </div>
                  </div>
                )}
                {docxError && !docxRendering && (
                  <div className="p-6 text-sm text-red-600">
                    <p className="font-semibold">DOCX preview failed</p>
                    <p className="mt-1 text-xs">{docxError}</p>
                  </div>
                )}
                {/* docx-preview now renders pages at native A4 (794×1123
                    px) to match the PDF iframe view.  We let the
                    container scroll horizontally if the pane is narrower
                    than a page and centre the pages with a soft drop
                    shadow so the two previews feel visually identical. */}
                <style>{`
                  .docx-preview-wrapper .docx-wrapper { background: transparent !important; padding: 16px 0 24px 0 !important; display: flex; flex-direction: column; align-items: center; }
                  .docx-preview-wrapper section.docx { background: #fff !important; box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; margin: 0 auto 16px !important; }
                  .docx-preview-wrapper section.docx img { object-fit: cover; }
                `}</style>
                <div ref={docxContainerRef} className="docx-preview-wrapper w-full" />
              </div>
            )}
          </div>

          {/* Edit & action panel */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              <section className="space-y-3">
                <p className="editorial-eyebrow text-[10px]">Cover &amp; metadata</p>
                <div>
                  <Label className="text-xs">Prepared for</Label>
                  <Input
                    value={meta.preparedFor || ''}
                    onChange={(e) => patchMetadata('preparedFor', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Property address</Label>
                  <Input
                    value={meta.propertyAddress || ''}
                    onChange={(e) => patchMetadata('propertyAddress', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Inspection date</Label>
                  <Input
                    type="date"
                    value={meta.inspectionDate || ''}
                    onChange={(e) => patchMetadata('inspectionDate', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <p className="editorial-eyebrow text-[10px]">Environmental readings</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">TDS (ppm)</Label>
                    <Input
                      value={water.tds || ''}
                      onChange={(e) => patchWater('tds', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">pH</Label>
                    <Input
                      value={water.ph || ''}
                      onChange={(e) => patchWater('ph', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="editorial-eyebrow text-[10px]">Property score</p>
                <div className="flex items-center justify-between gap-3 border px-3 py-2.5 rounded-md">
                  <div>
                    <p className="text-sm font-medium">Show score page</p>
                    <p className="text-[11px] text-muted-foreground">Toggle off to omit the scoring summary from this report.</p>
                  </div>
                  <Switch checked={includeScore} onCheckedChange={patchIncludeScore} />
                </div>
                <div>
                  <Label className="text-xs">Inspector remarks <span className="text-muted-foreground">(appears on the score page)</span></Label>
                  <Textarea
                    rows={4}
                    value={overrides.remarks || ''}
                    onChange={(e) => patchOverrides('remarks', e.target.value)}
                    className="mt-1 resize-none"
                    placeholder="A short note shown alongside the property score…"
                  />
                </div>
              </section>

              <section className="space-y-2 text-[11px] text-muted-foreground border-t pt-4">
                <p className="uppercase tracking-[0.22em] text-[9px] font-semibold text-foreground">Need bigger changes?</p>
                <p>For rooms, defects, photos, or area calculations, use the full inspection form (Edit button on the dashboard).</p>
              </section>
            </div>

            <div className="border-t bg-card px-5 py-4 space-y-2.5">
              <Button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="w-full"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {dirty ? 'Save changes' : 'No changes to save'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownload('pdf')}
                  disabled={generating !== null}
                >
                  {generating === 'pdf' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                  PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownload('docx')}
                  disabled={generating !== null}
                >
                  {generating === 'docx' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileType2 className="w-4 h-4 mr-2" />}
                  DOCX
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportPreviewModal;
