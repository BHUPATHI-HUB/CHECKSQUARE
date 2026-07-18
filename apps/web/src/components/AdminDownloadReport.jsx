import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Download, FileText, FileType2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildReportHTML, buildDOCXBlob, generatePDF, generateDOCX,
} from '@/utils/ReportGenerator.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import dataService from '@/services/dataService.js';

/**
 * Admin "download report" dialog.
 *
 * Earlier this was a tiny two-button modal that fired a download
 * blind. Reviewers couldn't see what they were about to send to the
 * customer, so we expanded it into a side-by-side PDF + DOCX preview
 * sharing the same layout primitives as `ReportPreviewModal`. The
 * download buttons live in the toolbar so the operator can compare
 * the two outputs and pick the format that matches expectations.
 */
const AdminDownloadReport = ({ inspection, variant = 'icon' }) => {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(null); // 'pdf' | 'docx' | null
  // Which preview the operator is looking at right now.
  const [previewMode, setPreviewMode] = useState('pdf'); // 'pdf' | 'docx'
  const [docxRendering, setDocxRendering] = useState(false);
  const [docxError, setDocxError] = useState(null);
  const docxContainerRef = useRef(null);
  // The list query intentionally strips the heavy JSON fields
  // (`roomInspections`, `areaCalculations`, `waterQuality`, `scoreOverrides`)
  // to keep the dashboards fast. The report renderer NEEDS them, so we fetch
  // the full record on open and use that local copy from here on.
  const [fullInspection, setFullInspection] = useState(inspection);
  const [hydrating, setHydrating] = useState(false);

  // Reset preview mode every time the dialog opens so reviewers always
  // start on the PDF view (the "customer-facing" canonical render).
  useEffect(() => {
    if (open) {
      setPreviewMode('pdf');
      setDocxError(null);
    }
  }, [open]);

  // When the dialog opens, hydrate to a full record if the prop only has
  // the lean list-row fields (no `roomInspections` array yet).
  useEffect(() => {
    if (!open || !inspection?.id) return;
    const needsHydration = !Array.isArray(inspection.roomInspections);
    if (!needsHydration) {
      setFullInspection(inspection);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const full = await dataService.getInspection(inspection.id);
        if (!cancelled) setFullInspection(full);
      } catch (err) {
        console.error('Failed to hydrate inspection for report', err);
        if (!cancelled) toast.error('Could not load the full inspection. Please retry.');
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, inspection]);

  // Build the PDF-facing HTML once per (inspection, settings) pair so
  // the iframe doesn't reflow on unrelated re-renders.
  const html = useMemo(
    () => (fullInspection && !hydrating ? buildReportHTML(fullInspection, settings) : ''),
    [fullInspection, hydrating, settings],
  );

  // Render the DOCX into the right-hand pane when (and only when) the
  // operator switches to the DOCX tab.  We build a fresh blob each
  // switch so the preview always reflects the live inspection data.
  useEffect(() => {
    if (!open || previewMode !== 'docx' || !fullInspection || hydrating) return;
    let cancelled = false;
    const container = docxContainerRef.current;
    if (!container) return;
    setDocxRendering(true);
    setDocxError(null);
    container.innerHTML = '';
    (async () => {
      try {
        const [{ blob }, { renderAsync }] = await Promise.all([
          buildDOCXBlob(fullInspection, settings),
          import('docx-preview'),
        ]);
        if (cancelled || !docxContainerRef.current) return;
        await renderAsync(blob, docxContainerRef.current, null, {
          className: 'docx',
          inWrapper: true,
          // Render at true A4 (794×1123 px) so the DOCX page sits next
          // to the PDF iframe at identical proportions.
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
  }, [open, previewMode, fullInspection, hydrating, settings]);

  const handleDownload = async (format) => {
    if (!fullInspection) return;
    // If the user clicks Download before hydration finished, fetch on demand
    // so we never generate a report from the lean list-row data.
    let data = fullInspection;
    if (!Array.isArray(data.roomInspections) && inspection?.id) {
      try {
        data = await dataService.getInspection(inspection.id);
        setFullInspection(data);
      } catch (err) {
        console.error('Failed to fetch inspection for download', err);
        toast.error('Could not load the full inspection. Please retry.');
        return;
      }
    }
    setGenerating(format);
    toast.info(`Composing ${format.toUpperCase()}…`);
    try {
      if (format === 'pdf') await generatePDF(data, settings);
      else await generateDOCX(data, settings);
      toast.success('Report downloaded.');
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'icon' ? (
          <Button variant="ghost" size="icon" className="rounded-full" title="Download report">
            <Download className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-full">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-[95vw] w-[1280px] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <p className="editorial-eyebrow text-[10px]">Bind &amp; deliver</p>
          <DialogTitle className="font-display font-light text-2xl mt-1 leading-tight">
            Download the <em className="text-secondary font-display italic">report.</em>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Compare the PDF and DOCX renders side by side, then download the format your customer needs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col bg-muted/30">
          {/* Toolbar: preview switcher + download buttons */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-card gap-3 flex-wrap">
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

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload('pdf')}
                disabled={generating !== null || hydrating}
                className="rounded-full"
              >
                {generating === 'pdf'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <FileText className="w-3.5 h-3.5 mr-1.5" />}
                PDF
              </Button>
              <Button
                size="sm"
                onClick={() => handleDownload('docx')}
                disabled={generating !== null || hydrating}
                className="rounded-full"
              >
                {generating === 'docx'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <FileType2 className="w-3.5 h-3.5 mr-1.5" />}
                DOCX
              </Button>
            </div>
          </div>

          {/* Preview surface */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {hydrating && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-20">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading inspection details…
                </div>
              </div>
            )}
            {previewMode === 'pdf' ? (
              <iframe
                title="Report preview"
                srcDoc={html}
                className="w-full h-full bg-white"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="w-full h-full overflow-auto bg-neutral-100 relative">
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
                {/* Centre each native-A4 docx page with a soft shadow so
                    the DOCX preview matches the PDF iframe view. */}
                <style>{`
                  .admin-docx-wrapper .docx-wrapper { background: transparent !important; padding: 16px 0 24px 0 !important; display: flex; flex-direction: column; align-items: center; }
                  .admin-docx-wrapper section.docx { background: #fff !important; box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; margin: 0 auto 16px !important; }
                  .admin-docx-wrapper section.docx img { object-fit: cover; }
                `}</style>
                <div ref={docxContainerRef} className="admin-docx-wrapper w-full" />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminDownloadReport;
