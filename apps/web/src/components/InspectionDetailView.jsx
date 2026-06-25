
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import RoomPhotoManager from '@/components/RoomPhotoManager.jsx';
import PhotoImg from '@/components/PhotoImg.jsx';
import { toast } from 'sonner';
import { generatePDF, generateDOCX } from '@/utils/ReportGenerator.jsx';
import { Edit, Download, CheckCircle, XCircle, AlertCircle, FileText, Image as ImageIcon, Trash2 } from 'lucide-react';

const InspectionDetailView = ({ inspection, onUpdate }) => {
  const { user, role } = useAuth();
  const { settings } = useSettings();
  const { updateInspectionStatus, softDeleteInspection, saveInspection } = useInspectionStatus();
  const navigate = useNavigate();
  const [localInspection, setLocalInspection] = useState(inspection);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const isAdmin = role === 'admin';
  const canEdit = isAdmin || (user?.id === inspection.inspectorId && inspection.status !== 'approved');
  const canDownload = inspection.status === 'approved' || isAdmin;

  const handleApprove = () => updateStatus('approved');
  const handleReject = () => updateStatus('rejected');

  // Persist status via PocketBase (previously wrote to a non-existent
  // `inspections` localStorage key, so approvals silently disappeared on
  // reload). The hook handles audit fields (approvedBy/approvedAt etc.)
  // and customer notifications server-side.
  const updateStatus = async (status) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await updateInspectionStatus(inspection.id, status, user);
      if (ok) {
        setLocalInspection((prev) => ({ ...prev, status }));
        toast.success(`Inspection ${status}`);
        if (onUpdate) onUpdate();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEditRoom = (room) => {
    setSelectedRoom(room);
    setManagerOpen(true);
  };

  // Persist room photo edits to PB via saveInspection (same path the wizard
  // uses). Previously written only to localStorage which the dashboards
  // never read from.
  const handleSaveRoom = async (updatedRoom) => {
    const newRoomInspections = (localInspection.roomInspections || []).map((r) =>
      r.id === updatedRoom.id ? updatedRoom : r,
    );
    const next = { ...localInspection, roomInspections: newRoomInspections };
    setLocalInspection(next);
    try {
      const saved = await saveInspection(next, localInspection.id);
      if (saved) {
        setLocalInspection(saved);
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Save room failed', err);
      toast.error('Failed to save room changes');
    }
  };

  const handleDeleteReport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await softDeleteInspection(inspection.id, user, 'Manual Admin Deletion');
      if (ok) {
        toast.success('Report moved to deleted archive');
        navigate('/admin/dashboard');
      }
    } finally {
      setBusy(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleDownload = async (format) => {
    setGenerating(true);
    toast.info(`Generating ${format.toUpperCase()}...`);
    try {
      if (format === 'pdf') {
        await generatePDF(localInspection, settings);
      } else {
        await generateDOCX(localInspection, settings);
      }
      toast.success('Report downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return <Badge className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge className="badge-error"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'pending': return <Badge className="badge-warning"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      default: return <Badge variant="outline">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inspection Details</h1>
          <p className="text-muted-foreground mt-1">
            {localInspection.metadata?.propertyAddress}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {getStatusBadge(localInspection.status)}
          {canEdit && (
            <Button onClick={() => navigate(isAdmin ? `/admin/inspection/${inspection.id}/edit` : `/inspector/inspection/${inspection.id}/edit`)} variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              Edit Form
            </Button>
          )}
          {canDownload && (
            <>
              <Button onClick={() => handleDownload('pdf')} disabled={generating}>
                <Download className="w-4 h-4 mr-2" />
                {generating ? 'Processing...' : 'PDF'}
              </Button>
              <Button onClick={() => handleDownload('docx')} variant="outline" disabled={generating}>
                <FileText className="w-4 h-4 mr-2" />
                DOCX
              </Button>
            </>
          )}
          {isAdmin && (
            <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
        </div>
      </div>

      {isAdmin && localInspection.status === 'pending' && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Admin Actions</h3>
                <p className="text-sm text-muted-foreground">Review and approve or reject this inspection</p>
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleReject}>Reject</Button>
                <Button onClick={handleApprove}>Approve</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room Inspections */}
      <h2 className="text-2xl font-semibold mt-8">Rooms & Photos</h2>
      {localInspection.roomInspections?.length > 0 ? (
        <div className="space-y-8">
          {localInspection.roomInspections.map((room) => (
            <Card key={room.id} className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{room.name}</CardTitle>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => handleEditRoom(room)}>
                    <ImageIcon className="w-4 h-4 mr-2" /> Manage Photos
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-8">
                
                {/* Room Spaces Gallery Display */}
                {room.roomSpaces?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3 uppercase tracking-wider">Room Spaces</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {room.roomSpaces.map((space) => (
                        <div key={space.id} className="bg-background rounded-lg border overflow-hidden shadow-sm">
                          <div className="aspect-[4/3] relative">
                            <PhotoImg photo={space} alt="Room space" className="w-full h-full" />
                          </div>
                          {space.caption && (
                            <div className="p-3 border-t bg-muted/20">
                              <p className="text-sm">{space.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Defects Display */}
                {room.defects?.length > 0 ? (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-3 uppercase tracking-wider">Defects</h4>
                    <div className="space-y-4">
                      {room.defects.map(defect => (
                        <div key={defect.id} className="bg-muted/40 rounded-xl p-4 border">
                          <p className="font-medium mb-3">{defect.description}</p>
                          {defect.photos?.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {defect.photos.map(dp => {
                                const sevInfo = settings.severityLevels.find(s => s.name === dp.severity) || {};
                                return (
                                  <div key={dp.id} className="bg-background rounded-lg border overflow-hidden shadow-sm">
                                    <div className="aspect-video relative">
                                      <PhotoImg photo={dp} alt="defect" className="w-full h-full" />
                                      <Badge className="absolute top-2 right-2 shadow-sm" style={{ backgroundColor: sevInfo.color || '#333' }}>
                                        {dp.severity}
                                      </Badge>
                                      {dp.annotation && (
                                        <Badge variant="secondary" className="absolute top-2 left-2 shadow-sm opacity-90">
                                          {dp.annotation}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="p-3">
                                      <p className="text-sm text-muted-foreground">{dp.comment}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No defects recorded.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="card-muted text-center py-12">
          <p className="text-muted-foreground">No rooms added yet.</p>
        </Card>
      )}

      {selectedRoom && (
        <RoomPhotoManager
          open={managerOpen}
          onOpenChange={setManagerOpen}
          room={selectedRoom}
          onSave={handleSaveRoom}
        />
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Inspection Report</DialogTitle>
            <DialogDescription>
              Are you sure? This action cannot be undone. The report will be moved to the Deleted Reports archive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteReport}>Delete Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionDetailView;
