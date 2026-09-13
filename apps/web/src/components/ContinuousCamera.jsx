import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCw, Trash2, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Mounted only for an active session. Shots stay in memory until Done; the
// existing album handler owns local processing and persistence afterwards.
export default function ContinuousCamera({ onClose, onDone, onChooseFiles }) {
  const video = useRef(null);
  const shotsRef = useRef([]);
  const alive = useRef(true);
  const snapping = useRef(false);
  const [shots, setShots] = useState([]);
  const [facing, setFacing] = useState('environment');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [discard, setDiscard] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      shotsRef.current.forEach(shot => URL.revokeObjectURL(shot.url));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream;
    setReady(false);
    setError('');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
      } catch (err) {
        if (cancelled) return;
        stream?.getTracks().forEach(track => track.stop());
        setReady(false);
        setError(err.name === 'NotAllowedError'
          ? 'Camera access is blocked. Allow camera access in your browser settings, or choose photos.'
          : 'Camera unavailable. You can still choose photos from your device.');
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [facing]);

  const capture = () => {
    const source = video.current;
    if (snapping.current || !ready || !source?.videoWidth) return;
    snapping.current = true;
    setError('');
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const release = () => { snapping.current = false; if (alive.current) setBusy(false); };
    try {
      canvas.getContext('2d').drawImage(source, 0, 0);
      canvas.toBlob(blob => {
        if (!alive.current) return;
        if (blob) {
          const shot = { file: new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }), url: URL.createObjectURL(blob) };
          shotsRef.current = [...shotsRef.current, shot];
          setShots(shotsRef.current);
        } else setError('Could not capture this photo. Please try again.');
        release();
      }, 'image/jpeg', 0.92);
    } catch {
      setError('Could not capture this photo. Please try again.');
      release();
    }
  };
  const close = () => {
    if (snapping.current) return;
    if (shots.length) setDiscard(true); else onClose();
  };
  const remove = () => {
    URL.revokeObjectURL(shots[review].url);
    shotsRef.current = shots.filter((_, i) => i !== review);
    setShots(shotsRef.current);
    setReview(null);
  };
  return (
    <Dialog open onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className="max-w-2xl rounded-2xl" onInteractOutside={event => event.preventDefault()}>
        <div className="pr-12"><DialogTitle>Take room photos</DialogTitle><DialogDescription className="mt-1">Keep shooting. Tap Done when you have every angle.</DialogDescription></div>
        <div className="relative h-[40vh] overflow-hidden rounded-2xl bg-stone-950">
          <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} className="h-full w-full object-contain" />
          {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-white" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Opening camera…</div>}
          {review !== null && shots[review] && <img src={shots[review].url} alt={`Captured photo ${review + 1}`} className="absolute inset-0 h-full w-full bg-black object-contain" />}
          {busy && <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-4 border-white/80" />}
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white" role="status">{shots.length} captured</span>
        </div>
        {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p>{shots.length === 0 && <Button variant="outline" onClick={() => { onChooseFiles(); onClose(); }}>Choose photos</Button>}</div>}
        {shots.length > 0 && <div className="flex gap-2 overflow-x-auto py-1" aria-label="Captured photos">
          {shots.map((shot, i) => <button type="button" key={shot.url} aria-label={`Review photo ${i + 1}`} aria-pressed={review === i} onClick={() => setReview(i)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: review === i ? 'currentColor' : 'transparent' }}><img src={shot.url} alt="" className="h-full w-full object-cover" /></button>)}
        </div>}
        {discard ? <div className="space-y-3 rounded-xl border p-3"><p className="text-sm">Discard these {shots.length} photos?</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>Keep shooting</Button><Button variant="destructive" onClick={onClose}>Discard</Button></div></div> : <div className="flex flex-wrap items-center justify-between gap-2">
          {review !== null ? <><Button variant="ghost" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Remove</Button><Button variant="outline" onClick={() => setReview(null)}>Back to camera</Button></> : <><Button variant="ghost" size="icon" aria-label="Switch camera" disabled={!ready || busy} onClick={() => setFacing(prev => prev === 'environment' ? 'user' : 'environment')}><RotateCw className="h-5 w-5" /></Button><button type="button" aria-label="Take photo" disabled={!ready || busy} onClick={capture} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-stone-300 bg-stone-900 text-white transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none"><Camera className="h-6 w-6" /></button></>}
          <Button disabled={!shots.length || busy} onClick={() => { onDone(shots.map(shot => shot.file)); onClose(); }}><Check className="mr-1 h-4 w-4" />Done · {shots.length}</Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
