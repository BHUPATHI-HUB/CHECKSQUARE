
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, GripVertical, ImagePlus, Camera, UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import WebcamCaptureModal from '@/components/WebcamCaptureModal.jsx';
import PhotoImg from '@/components/PhotoImg.jsx';
import { toast } from 'sonner';

const RoomSpaceGallery = ({ roomSpaces = [], onUpdate }) => {
  const { role } = useAuth();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Mobile UA → native camera (faster). Desktop → in-app webcam modal.
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const canDelete = role === 'admin' || role === 'inspector';

  const handleFileChange = (e) => {
    handleFiles(Array.from(e.target.files));
  };

  const handleFiles = (files) => {
    if (!files.length) return;
    setUploading(true);
    
    const readers = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          url: reader.result,
          caption: '',
          uploadedAt: new Date().toISOString()
        });
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then(newPhotos => {
      onUpdate([...roomSpaces, ...newPhotos]);
      setUploading(false);
      setIsPromptOpen(false);
      toast.success(`${newPhotos.length} photo(s) added to Room Spaces`);
    });
  };

  const updateCaption = (id, caption) => {
    onUpdate(roomSpaces.map(space => space.id === id ? { ...space, caption } : space));
  };

  const deletePhoto = (id) => {
    onUpdate(roomSpaces.filter(space => space.id !== id));
  };

  // Drag and Drop reordering
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('dragIndex', index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('dragIndex'), 10);
    if (dragIndex === dropIndex) return;

    const newSpaces = [...roomSpaces];
    const [draggedItem] = newSpaces.splice(dragIndex, 1);
    newSpaces.splice(dropIndex, 0, draggedItem);
    onUpdate(newSpaces);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-lg">Room Spaces</h4>
          <p className="text-sm text-muted-foreground">Add general photos of the room before documenting specific defects.</p>
        </div>
        <Button onClick={() => setIsPromptOpen(true)} size="sm" variant="secondary">
          <ImagePlus className="w-4 h-4 mr-2" /> Add Photos
        </Button>
      </div>

      <Dialog open={isPromptOpen} onOpenChange={setIsPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How would you like to add photos?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Button 
              className="h-24 flex flex-col items-center justify-center gap-2" 
              variant="outline"
              onClick={() => {
                setIsPromptOpen(false);
                if (isMobile) {
                  cameraInputRef.current?.click();
                } else {
                  setCamOpen(true);
                }
              }}
            >
              <Camera className="w-8 h-8 text-primary" />
              <span>Take Photo</span>
            </Button>
            <Button 
              className="h-24 flex flex-col items-center justify-center gap-2" 
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="w-8 h-8 text-primary" />
              <span>Choose from Device</span>
            </Button>
          </div>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            multiple 
            className="hidden" 
            ref={cameraInputRef} 
            onChange={handleFileChange} 
          />
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
        </DialogContent>
      </Dialog>

      {/* Desktop webcam capture modal */}
      <WebcamCaptureModal
        open={camOpen}
        onOpenChange={setCamOpen}
        onCapture={(file) => handleFiles([file])}
      />

      {uploading && (
        <div className="h-32 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
            <span>Uploading photos...</span>
          </div>
        </div>
      )}

      {roomSpaces.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {roomSpaces.map((space, index) => (
            <div 
              key={space.id} 
              className="group relative bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="absolute top-2 left-2 z-10 p-1.5 bg-black/40 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>
              
              {canDelete && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 z-10 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deletePhoto(space.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              
              <div className="aspect-[4/3] bg-muted relative">
                <PhotoImg photo={space} alt="Room Space" className="w-full h-full" />
              </div>
              <div className="p-3 bg-card border-t">
                <Input 
                  placeholder="Add a caption..." 
                  value={space.caption || ''} 
                  onChange={(e) => updateCaption(space.id, e.target.value)}
                  className="h-8 text-sm bg-transparent border-transparent focus-visible:border-input hover:border-input px-2"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        !uploading && (
          <div className="py-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
            <p className="text-muted-foreground text-sm">No room space photos added yet.</p>
          </div>
        )
      )}
    </div>
  );
};

export default RoomSpaceGallery;
