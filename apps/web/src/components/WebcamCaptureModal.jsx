import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCw, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * WebcamCaptureModal — desktop-class camera capture using getUserMedia.
 * On mobile we still prefer the native file-input `capture` attribute (faster,
 * uses the OS camera UI), but on desktop browsers that attribute is ignored
 * and the user just gets a file picker. This modal fills that gap so the
 * "Capture" button actually opens the laptop webcam.
 *
 * onCapture receives a File (jpeg) ready to be passed to existing handlers.
 */
const WebcamCaptureModal = ({ open, onOpenChange, onCapture, facingMode = 'environment' }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [activeFacing, setActiveFacing] = useState(facingMode);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startStream = async (preferredFacing) => {
    setReady(false);
    setError(null);
    stopStream();
    // Try strict facingMode first (forces back camera on mobile if available),
    // then fall back to a non-strict preference so desktops without a
    // matching camera still get *some* stream.
    const attempts = [
      { video: { facingMode: { exact: preferredFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: preferredFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // eslint-disable-next-line no-await-in-loop
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
        return;
      } catch (err) {
        lastErr = err;
        // OverconstrainedError on the strict attempt is expected on devices
        // with only a front camera — fall through to the next attempt.
        if (err?.name === 'NotAllowedError') break;
      }
    }
    console.error('Camera open failed', lastErr);
    setError(
      lastErr?.name === 'NotAllowedError'
        ? 'Camera access denied. Allow it in your browser settings, or use Upload instead.'
        : lastErr?.name === 'NotFoundError'
          ? 'No camera detected on this device. Use Upload instead.'
          : 'Could not open the camera. Use Upload instead.',
    );
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      setSnapshotUrl(null);
      setReady(false);
      setError(null);
      return;
    }
    startStream(activeFacing);
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFlip = () => {
    const next = activeFacing === 'environment' ? 'user' : 'environment';
    setActiveFacing(next);
    startStream(next);
  };

  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast.error('Camera not ready yet, try again.');
      return;
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    setSnapshotUrl(canvas.toDataURL('image/jpeg', 0.92));
  };

  const handleRetake = () => setSnapshotUrl(null);

  const handleAccept = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Could not capture image.');
        return;
      }
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture?.(file);
      onOpenChange(false);
    }, 'image/jpeg', 0.92);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" /> Capture from camera
          </DialogTitle>
          <DialogDescription>
            Position your subject in frame and tap the shutter. Use “Flip” to switch front/back cameras.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white">
              <Camera className="w-10 h-10 mb-3 opacity-60" />
              <p className="text-sm">{error}</p>
            </div>
          ) : snapshotUrl ? (
            <img src={snapshotUrl} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {snapshotUrl ? (
            <>
              <Button variant="ghost" onClick={handleRetake}>
                <RotateCw className="w-4 h-4 mr-1.5" /> Retake
              </Button>
              <Button onClick={handleAccept}>
                <Check className="w-4 h-4 mr-1.5" /> Use this photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleFlip} disabled={!ready}>
                  <RotateCw className="w-4 h-4 mr-1.5" /> Flip
                </Button>
                <Button onClick={handleSnap} disabled={!ready}>
                  <Camera className="w-4 h-4 mr-1.5" /> Capture
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WebcamCaptureModal;
