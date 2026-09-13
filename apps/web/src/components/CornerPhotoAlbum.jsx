import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import PhotoImg from '@/components/PhotoImg.jsx';
import ContinuousCamera from '@/components/ContinuousCamera.jsx';

export default function CornerPhotoAlbum({ photos, onAdd, onRemove, progress }) {
  const filesRef = useRef(null);
  const touchStart = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const reduceMotion = useReducedMotion();
  const active = Math.min(viewer ?? 0, Math.max(0, photos.length - 1));
  const receiveFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onAdd(files);
  };
  const move = (direction) => setViewer(Math.max(0, Math.min(photos.length - 1, active + direction)));
  const addMenu = (empty = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={progress.active}
          className={empty
            ? 'group flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed bg-background p-6 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
            : 'inline-flex h-11 items-center gap-2 rounded-full border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'}>
          <span className={empty ? 'flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary' : ''}><Plus className="h-5 w-5" /></span>
          <span>{empty ? 'Add corner photos' : 'Add photos'}</span>
          {empty && <span className="text-xs font-normal text-muted-foreground">Take a photo or choose several at once</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="w-56 rounded-2xl p-2">
        <DropdownMenuItem className="min-h-12 rounded-xl" onSelect={() => setCameraOpen(true)}><Camera />Take photos</DropdownMenuItem>
        <DropdownMenuItem className="min-h-12 rounded-xl" onSelect={() => filesRef.current?.click()}><Upload />Choose photos</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div aria-busy={progress.active} className="rounded-3xl border bg-muted/20 p-4 sm:p-6">
      {photos.length === 0 ? addMenu(true) : (
        <>
          <button type="button" onClick={() => setViewer(0)} aria-label={`Open room album, ${photos.length} photos`}
            className="group relative mx-auto mb-5 block aspect-[4/3] w-full max-w-[280px] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs">
            {photos.slice(0, 3).map((photo, index) => (
              <motion.div key={photo.id || photo.corner || index}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: index * 7, rotate: index * 3, scale: 1 - index * 0.035 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
                style={{ zIndex: 3 - index, transformOrigin: 'bottom center' }}
                className="absolute inset-2 overflow-hidden rounded-2xl border-4 border-background bg-background shadow-lg">
                <PhotoImg photo={photo} alt={index === 0 ? 'Corner 1' : ''} fit="cover" className="h-full w-full" />
                {index === 0 && <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 to-transparent p-4 pt-12 text-white"><span className="text-sm font-medium">Corner 1</span><span className="rounded-full bg-black/30 px-2.5 py-1 text-xs backdrop-blur-sm">View {photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span></div>}
              </motion.div>
            ))}
          </button>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Tap the stack to explore</p>{addMenu()}</div>
        </>
      )}
      <input ref={filesRef} type="file" accept="image/*" multiple className="hidden" onChange={receiveFiles} />
      {cameraOpen && <ContinuousCamera onClose={() => setCameraOpen(false)} onDone={onAdd} onChooseFiles={() => filesRef.current?.click()} />}
      {progress.active && <div className="mt-4 space-y-2" role="status" aria-live="polite">
        <div className="flex justify-between text-xs text-muted-foreground"><span>Adding photos…</span><span>{progress.done} / {progress.total}</span></div>
        <progress className="h-1.5 w-full accent-primary" value={progress.done} max={progress.total} aria-label="Photos processed" />
      </div>}
      <Dialog open={viewer !== null && photos.length > 0} onOpenChange={(next) => { if (!next) setViewer(null); }}>
        <DialogContent className="max-w-3xl rounded-3xl" onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
        }}>
          <div className="pr-12"><DialogTitle>Corner {active + 1}</DialogTitle><DialogDescription className="mt-1">{active + 1} of {photos.length} · Swipe or use the arrows</DialogDescription></div>
          <div className="overflow-hidden rounded-2xl bg-muted/30" style={{ touchAction: 'pan-y' }}
            onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
            onTouchEnd={(event) => { if (touchStart.current !== null) { const distance = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(distance) > 50) move(distance < 0 ? 1 : -1); } touchStart.current = null; }}>
            {photos[active] && <PhotoImg key={photos[active].id || active} photo={photos[active]} alt={`Corner ${active + 1}`} loading="eager" className="h-[45vh] w-full" />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={progress.active} onClick={() => { onRemove(active); if (photos.length === 1) setViewer(null); }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
            <div className="flex gap-2"><Button type="button" variant="outline" size="icon" aria-label="Previous photo" disabled={active === 0} onClick={() => move(-1)}><ChevronLeft className="h-5 w-5" /></Button><Button type="button" variant="outline" size="icon" aria-label="Next photo" disabled={active >= photos.length - 1} onClick={() => move(1)}><ChevronRight className="h-5 w-5" /></Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
