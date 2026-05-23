import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, Undo, Save, Eye, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const RichTextEditor = ({ value, onChange, placeholder }) => {
  const editorRef = useRef(null);

  // Force <p> as the default block element so execCommand('justifyLeft'…)
  // and formatBlock have a real block to attach the style to. Without this,
  // Chromium emits bare text or <div>s and alignment changes do not persist.
  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    // If the incoming value is empty, seed it with an empty paragraph so the
    // very first toolbar click has a block-level element to act on.
    const next = value && value.trim() ? value : '<p><br></p>';
    if (editorRef.current.innerHTML !== next) {
      editorRef.current.innerHTML = next;
    }
  }, [value]);

  const execCommand = (command, value = null) => {
    // Ensure the editor owns the selection before running the command. The
    // toolbar wrapper's onMouseDown preventDefault keeps the caret in place,
    // but we still need focus() so document.execCommand targets this node.
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* onMouseDown preventDefault keeps the contenteditable selection alive
          when a toolbar button is clicked — without this, execCommand has no
          selection to act on and most buttons appear broken. */}
      <div
        className="flex items-center gap-1 border-b bg-muted/30 p-2 flex-wrap"
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button variant="ghost" size="icon" onClick={() => execCommand('bold')} title="Bold">
          <Bold className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('italic')} title="Italic">
          <Italic className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('underline')} title="Underline">
          <Underline className="w-4 h-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="icon" onClick={() => execCommand('insertUnorderedList')} title="Bullet List">
          <List className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('insertOrderedList')} title="Numbered List">
          <ListOrdered className="w-4 h-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="sm" onClick={() => execCommand('formatBlock', 'H2')} className="text-xs font-semibold px-2">
          <Heading2 className="w-4 h-4 mr-1" /> H2
        </Button>
        <Button variant="ghost" size="sm" onClick={() => execCommand('formatBlock', 'H3')} className="text-xs font-semibold px-2">
          <Heading3 className="w-4 h-4 mr-1" /> H3
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="icon" onClick={() => execCommand('justifyLeft')} title="Align left">
          <AlignLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('justifyCenter')} title="Align center">
          <AlignCenter className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('justifyRight')} title="Align right">
          <AlignRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => execCommand('justifyFull')} title="Justify">
          <AlignJustify className="w-4 h-4" />
        </Button>
      </div>
      <div 
        ref={editorRef}
        className="editor-content"
        contentEditable
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  );
};

const DisclaimerEditor = () => {
  const { settings, updateSettings, resetDisclaimers } = useSettings();
  const [page1Content, setPage1Content] = useState(settings.disclaimerPage1 || '');
  const [page2Content, setPage2Content] = useState(settings.disclaimerPage2 || '');
  const [activeTab, setActiveTab] = useState('page1');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleSave = () => {
    const result = updateSettings({
      disclaimerPage1: page1Content,
      disclaimerPage2: page2Content
    });
    
    if (result.success) {
      toast.success('Disclaimers saved successfully');
    } else {
      toast.error('Failed to save disclaimers');
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset both disclaimer pages to their default text? This cannot be undone.')) {
      const result = resetDisclaimers();
      if (result.success) {
        setPage1Content(result.disclaimerPage1);
        setPage2Content(result.disclaimerPage2);
        toast.success('Disclaimers reset to defaults');
      } else {
        toast.error('Failed to reset disclaimers');
      }
    }
  };

  const charCount1 = (page1Content || '').replace(/<[^>]*>?/gm, '').length;
  const charCount2 = (page2Content || '').replace(/<[^>]*>?/gm, '').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border shadow-sm">
        <div>
          <h3 className="text-lg font-semibold">Disclaimer Content</h3>
          <p className="text-sm text-muted-foreground">Manage the legal text that appears on pages 2 and 3 of the PDF report.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Eye className="w-4 h-4 mr-2" /> Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Disclaimer Preview</DialogTitle>
              </DialogHeader>
              <div className="bg-muted p-6 rounded-md">
                <div className="disclaimer-page max-w-3xl mx-auto shadow-md border px-10 py-12">
                  <h1 className="disclaimer-title">DISCLAIMER</h1>
                  <div dangerouslySetInnerHTML={{ __html: activeTab === 'page1' ? page1Content : page2Content }} />
                  <div className="disclaimer-separator"></div>
                  <p className="disclaimer-footer">{settings.companyName} • Page {activeTab === 'page1' ? '1' : '2'} of Disclaimers</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleReset}>
            <Undo className="w-4 h-4 mr-2" /> Reset Defaults
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="page1">Disclaimer Page 1</TabsTrigger>
          <TabsTrigger value="page2">Disclaimer Page 2</TabsTrigger>
        </TabsList>
        <TabsContent value="page1" className="mt-4">
          <div className="space-y-2">
            <RichTextEditor 
              value={page1Content} 
              onChange={setPage1Content} 
              placeholder="Enter text for the first disclaimer page..."
            />
            <div className="text-right text-xs text-muted-foreground">
              {charCount1} characters
            </div>
          </div>
        </TabsContent>
        <TabsContent value="page2" className="mt-4">
          <div className="space-y-2">
            <RichTextEditor 
              value={page2Content} 
              onChange={setPage2Content} 
              placeholder="Enter text for the second disclaimer page..."
            />
            <div className="text-right text-xs text-muted-foreground">
              {charCount2} characters
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DisclaimerEditor;