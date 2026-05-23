import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AdminApprovalActions from '@/components/AdminApprovalActions.jsx';
import AdminDownloadReport from '@/components/AdminDownloadReport.jsx';
import ReportPreviewModal from '@/components/ReportPreviewModal.jsx';
import { MapPin, Calendar, User, Edit2, Save, X, Eye } from 'lucide-react';
import pb from '@/lib/pocketbaseClient.js';

const AdminInspectionDetailModal = ({ inspection, open, onOpenChange, onInspectionUpdated }) => {
  const [localData, setLocalData] = useState(inspection);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (inspection) {
      // Defensive coerce — historical/imported rows may have stored
      // `metadata` as null, a JSON string, or a non-object scalar. We need
      // it to be a plain object so the form bindings below never throw.
      let safeMeta = inspection.metadata;
      if (typeof safeMeta === 'string') {
        try { safeMeta = JSON.parse(safeMeta); } catch (_) { safeMeta = {}; }
      }
      if (!safeMeta || typeof safeMeta !== 'object') safeMeta = {};
      setLocalData({ ...inspection, metadata: safeMeta });
      setEditForm({
        preparedFor: safeMeta.preparedFor || '',
        propertyAddress: safeMeta.propertyAddress || ''
      });
    }
  }, [inspection]);

  if (!localData) return null;

  const handleStatusChange = (newStatus) => {
    setLocalData(prev => ({ ...prev, status: newStatus }));
    if (onInspectionUpdated) onInspectionUpdated();
  };

  const handleSaveEdits = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updatedMetadata = {
        ...(localData.metadata || {}),
        preparedFor: editForm.preparedFor,
        propertyAddress: editForm.propertyAddress,
      };
      await pb.collection('inspections').update(localData.id, { metadata: updatedMetadata });
      setLocalData(prev => ({ ...prev, metadata: updatedMetadata }));
      setIsEditing(false);
      toast.success('Inspection details updated');
      if (onInspectionUpdated) onInspectionUpdated();
    } catch (e) {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return <Badge className="badge-approved">Approved</Badge>;
      case 'rejected': return <Badge className="badge-rejected">Rejected</Badge>;
      case 'pending': return <Badge className="badge-pending">Pending</Badge>;
      default: return <Badge variant="outline">Draft</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center sticky top-0 z-10">
          <div>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              Inspection Details
              {getStatusBadge(localData.status)}
            </DialogTitle>
            <DialogDescription className="mt-1">
              ID: {localData.id} • Submitted by {localData.inspectorName}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-3">
            {localData.status === 'pending' && (
              <AdminApprovalActions inspection={localData} onStatusChanged={handleStatusChange} />
            )}
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="w-4 h-4 mr-2" /> Preview report
            </Button>
            <AdminDownloadReport inspection={localData} />
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 bg-background">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-6 w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2">Overview</TabsTrigger>
              <TabsTrigger value="rooms" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2">Rooms & Photos</TabsTrigger>
              <TabsTrigger value="areas" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2">Areas & Water</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <Card className="card-elevated shadow-sm border">
                <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4">
                  <CardTitle className="text-lg">Metadata</CardTitle>
                  {!isEditing ? (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      <Edit2 className="w-4 h-4 mr-2" /> Edit Details
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveEdits} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-sm">
                      <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-muted-foreground mb-1">Prepared For</p>
                        {isEditing ? (
                          <Input 
                            value={editForm.preparedFor} 
                            onChange={e => setEditForm(p => ({...p, preparedFor: e.target.value}))} 
                            className="h-8"
                          />
                        ) : (
                          <p className="text-base">{localData.metadata?.preparedFor}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-muted-foreground mb-1">Property Address</p>
                        {isEditing ? (
                          <Input 
                            value={editForm.propertyAddress} 
                            onChange={e => setEditForm(p => ({...p, propertyAddress: e.target.value}))} 
                            className="h-8"
                          />
                        ) : (
                          <p className="text-base">{localData.metadata?.propertyAddress}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-sm">
                      <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Inspection Date</p>
                        <p className="text-base">{localData.metadata?.inspectionDate}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Inspector</p>
                        <p className="text-base">{localData.inspectorName}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rooms" className="mt-0 space-y-6">
              {localData.roomInspections && localData.roomInspections.length > 0 ? (
                localData.roomInspections.map(room => (
                  <Card key={room.id} className="shadow-sm border">
                    <CardHeader className="bg-muted/20 border-b py-3">
                      <CardTitle className="text-lg">{room.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-6">
                      {room.cornerPhotos?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Corner Photos</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {room.cornerPhotos.map(photo => (
                              <div key={photo.id} className="relative aspect-video rounded-md overflow-hidden border bg-muted">
                                <img src={photo.url} alt={photo.corner} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] p-1 text-center truncate">
                                  {photo.corner}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {room.defects?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Defects</h4>
                          <div className="space-y-4">
                            {room.defects.map(defect => (
                              <div key={defect.id} className="bg-muted/30 p-4 rounded-lg border">
                                <p className="font-medium mb-3">{defect.description}</p>
                                {defect.photos?.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {defect.photos.map(p => (
                                      <div key={p.id} className="bg-background border rounded-md overflow-hidden">
                                        <div className="aspect-video relative bg-muted">
                                          <img
                                            src={p.url}
                                            className="w-full h-full object-cover"
                                            alt={`Defect photo: ${defect.description || 'Untitled defect'} (severity: ${p.severity || 'unspecified'})`}
                                          />
                                          <Badge className="absolute top-2 right-2 shadow-sm" variant="secondary">{p.severity}</Badge>
                                        </div>
                                        <div className="p-2 text-sm text-muted-foreground">
                                          {p.comment || 'No comment provided'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">No rooms inspected.</div>
              )}
            </TabsContent>

            <TabsContent value="areas" className="mt-0 space-y-6">
              <Card className="shadow-sm border">
                <CardHeader className="bg-muted/20 border-b py-3">
                  <CardTitle className="text-lg">Area Calculations</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {localData.areaCalculations?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="p-3 font-medium rounded-tl-md">Area</th>
                            <th className="p-3 font-medium">Length</th>
                            <th className="p-3 font-medium">Width</th>
                            <th className="p-3 font-medium rounded-tr-md">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {localData.areaCalculations.map((a, i) => (
                            <tr key={i}>
                              <td className="p-3 font-medium">{a.name}</td>
                              <td className="p-3">{a.length}</td>
                              <td className="p-3">{a.width}</td>
                              <td className="p-3 font-medium">{a.total} sq ft</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">No area calculations recorded.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border">
                <CardHeader className="bg-muted/20 border-b py-3">
                  <CardTitle className="text-lg">Water Quality</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {localData.waterQuality ? (
                    <div className="space-y-4">
                      <div className="flex gap-8">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">TDS Level</p>
                          <p className="text-xl font-semibold">{localData.waterQuality.tds || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">pH Level</p>
                          <p className="text-xl font-semibold">{localData.waterQuality.ph || 'N/A'}</p>
                        </div>
                      </div>
                      {localData.waterQuality.images?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Test Photos</p>
                          <div className="flex gap-4 overflow-x-auto pb-2">
                            {localData.waterQuality.images.map((img, i) => (
                              <img key={i} src={img.url || img} className="h-32 rounded border object-cover" alt="water test" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">No water quality data recorded.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
      <ReportPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        inspection={localData}
        onSaved={() => { if (onInspectionUpdated) onInspectionUpdated(); }}
      />
    </Dialog>
  );
};

export default AdminInspectionDetailModal;