import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { 
  File, 
  Lock, 
  Trash2, 
  UploadCloud, 
  Download, 
  ZoomIn, 
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface StoredFile {
  id: string;
  name: string;
  size: number;
  dateAdded: string;
  data: string; // base64
  isEncrypted?: boolean;
}

export default function Vault() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordCallback, setPasswordCallback] = useState<((pwd: string) => void) | null>(null);
  
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const stored = localStorage.getItem('vault_files');
    if (stored) {
      try {
        setFiles(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse vault files', e);
      }
    }
  }, []);

  const saveFiles = (newFiles: StoredFile[]) => {
    setFiles(newFiles);
    localStorage.setItem('vault_files', JSON.stringify(newFiles));
  };

  const handleFileAdd = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Invalid file', description: 'Please upload a PDF document.', variant: 'destructive' });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        dateAdded: new Date().toISOString(),
        data: base64
      };
      saveFiles([...files, newFile]);
      setSelectedFileId(newFile.id);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (selectedFileId) return; // Only if we're in the upload state
    const items = e.clipboardData?.items;
    for (const item of Array.from(items || [])) {
      if (item.type === 'application/pdf') {
        const file = item.getAsFile();
        if (file) handleFileAdd(file);
      }
    }
  }, [selectedFileId, files]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const loadPdf = async (base64Data: string, password?: string) => {
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const arrayBuffer = array.buffer;

    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, password: password || '' });
      loadingTask.onPassword = (updatePassword, reason) => {
        setPasswordRequired(true);
        setPasswordError(reason === 2 ? 'Incorrect password' : null);
        setPasswordCallback(() => updatePassword);
      };
      
      const doc = await loadingTask.promise;
      setPdfDocument(doc);
      setPasswordRequired(false);
      setPasswordError(null);
      setPageNumber(1);
      
      // Update file entry as encrypted if it wasn't marked
      if (password && selectedFileId) {
        const file = files.find(f => f.id === selectedFileId);
        if (file && !file.isEncrypted) {
          const updated = files.map(f => f.id === selectedFileId ? { ...f, isEncrypted: true } : f);
          saveFiles(updated);
        }
      }
      
    } catch (err: any) {
      if (err.name === 'PasswordException') {
        setPasswordRequired(true);
        setPasswordError(err.code === 2 ? 'Incorrect password' : null);
        
        // Mark as encrypted if we just discovered it
        if (selectedFileId) {
          const file = files.find(f => f.id === selectedFileId);
          if (file && !file.isEncrypted) {
            const updated = files.map(f => f.id === selectedFileId ? { ...f, isEncrypted: true } : f);
            saveFiles(updated);
          }
        }
      } else {
        toast({ title: 'Error loading PDF', description: err.message, variant: 'destructive' });
      }
    }
  };

  useEffect(() => {
    if (selectedFileId) {
      const file = files.find(f => f.id === selectedFileId);
      if (file) {
        setPdfDocument(null);
        setPasswordRequired(false);
        setPasswordError(null);
        setPasswordInput('');
        loadPdf(file.data);
      }
    } else {
      setPdfDocument(null);
    }
  }, [selectedFileId]);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current) return;
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      } catch (err) {
        console.error('Render error', err);
      }
    };
    renderPage();
  }, [pdfDocument, pageNumber, scale]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordCallback) {
      passwordCallback(passwordInput);
    } else if (selectedFileId) {
      const file = files.find(f => f.id === selectedFileId);
      if (file) loadPdf(file.data, passwordInput);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileAdd(e.dataTransfer.files[0]);
    }
  };

  const downloadSelected = () => {
    if (!selectedFileId) return;
    const file = files.find(f => f.id === selectedFileId);
    if (!file) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${file.data}`;
    link.download = file.name;
    link.click();
  };

  const formatSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
            <Lock size={18} />
          </div>
          <h1 className="font-semibold tracking-wide text-lg text-sidebar-foreground">VAULT</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {files.length === 0 ? (
            <div className="text-center p-6 text-muted-foreground">
              <ShieldAlert className="mx-auto mb-3 opacity-20" size={32} />
              <p className="text-sm">No files in vault.</p>
              <p className="text-xs mt-1">Upload a PDF to secure it.</p>
            </div>
          ) : (
            files.map(f => (
              <div 
                key={f.id} 
                onClick={() => setSelectedFileId(f.id)}
                className={`group flex items-center p-3 rounded-md cursor-pointer transition-colors ${selectedFileId === f.id ? 'bg-primary/10 border-primary/30 border' : 'hover:bg-accent border border-transparent'}`}
              >
                <div className="mr-3 text-muted-foreground group-hover:text-foreground">
                  {f.isEncrypted ? <Lock size={16} /> : <File size={16} />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatSize(f.size)} &middot; {new Date(f.dateAdded).toLocaleDateString()}</div>
                </div>
                <Button
                  variant="ghost" 
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 h-8 w-8 text-muted-foreground hover:text-destructive transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newFiles = files.filter(file => file.id !== f.id);
                    saveFiles(newFiles);
                    if (selectedFileId === f.id) setSelectedFileId(null);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-border">
          <Button 
            className="w-full" 
            variant="outline"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/pdf';
              input.onchange = (e: any) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileAdd(e.target.files[0]);
                }
              };
              input.click();
            }}
          >
            Add Document
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-background/50">
        {!selectedFileId ? (
          <div 
            className="flex-1 flex items-center justify-center p-8"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="max-w-md w-full border-2 border-dashed border-border rounded-xl p-12 text-center bg-card shadow-sm hover:border-primary/50 transition-colors">
              <UploadCloud className="mx-auto text-muted-foreground mb-4" size={48} />
              <h2 className="text-xl font-medium mb-2">Drop secure PDF here</h2>
              <p className="text-sm text-muted-foreground mb-6">Or press Ctrl+V to paste from clipboard</p>
              <Button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'application/pdf';
                  input.onchange = (e: any) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileAdd(e.target.files[0]);
                    }
                  };
                  input.click();
                }}
              >
                Browse Files
              </Button>
            </div>
          </div>
        ) : passwordRequired ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full bg-card border border-border rounded-xl p-8 shadow-lg">
              <div className="flex justify-center mb-6 text-primary">
                <Lock size={48} />
              </div>
              <h2 className="text-xl font-semibold text-center mb-2">Document is locked</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Enter the password to decrypt and view "{selectedFile?.name}"
              </p>
              <form onSubmit={submitPassword} className="space-y-4">
                <div>
                  <Input 
                    type="password" 
                    placeholder="Enter password..." 
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    autoFocus
                    className="bg-background"
                  />
                  {passwordError && <p className="text-destructive text-sm mt-2 font-medium">{passwordError}</p>}
                </div>
                <Button type="submit" className="w-full">Unlock Vault</Button>
              </form>
            </div>
          </div>
        ) : pdfDocument ? (
          <>
            <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-10 shadow-sm">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium truncate max-w-[200px]">{selectedFile?.name}</span>
                <div className="h-4 w-px bg-border"></div>
                <div className="flex items-center space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <div className="flex items-center text-sm">
                    <Input 
                      value={pageNumber} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 1 && val <= pdfDocument.numPages) {
                          setPageNumber(val);
                        }
                      }}
                      className="w-12 h-8 text-center mx-1 bg-background"
                    />
                    <span className="text-muted-foreground mx-1">/ {pdfDocument.numPages}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => setPageNumber(Math.min(pdfDocument.numPages, pageNumber + 1))}
                    disabled={pageNumber >= pdfDocument.numPages}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(scale - 0.25)} disabled={scale <= 0.5}>
                  <ZoomOut size={16} />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(scale + 0.25)} disabled={scale >= 3}>
                  <ZoomIn size={16} />
                </Button>
                <div className="h-4 w-px bg-border mx-2"></div>
                <Button variant="outline" size="sm" onClick={downloadSelected} className="h-8">
                  <Download size={14} className="mr-2" /> Download
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 p-8 flex justify-center items-start">
              <canvas 
                ref={canvasRef} 
                className="bg-white shadow-xl max-w-full"
                style={{ direction: 'ltr' }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-muted-foreground font-medium">Decrypting vault contents...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}