import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Lock,
  Trash2,
  UploadCloud,
  ShieldAlert,
  TrendingUp,
  Calendar,
  BarChart3,
  Star,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  FileText,
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
  data: string;
  isEncrypted?: boolean;
}

interface DailyIncome {
  date: string;
  amount: number;
  transactionCount: number;
}

interface MonthlyIncome {
  month: string;
  label: string;
  amount: number;
  transactionCount: number;
}

interface TrustFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
}

interface TrustScore {
  score: number;
  label: string;
  reasoning: string;
  factors: TrustFactor[];
}

interface Summary {
  totalIncome: number;
  averageMonthlyIncome: number;
  averageDailyIncome: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  totalTransactions: number;
}

interface AnalysisResult {
  dailyIncome: DailyIncome[];
  monthlyIncome: MonthlyIncome[];
  trustScore: TrustScore;
  summary: Summary;
}

function fmt(n: number, currency = 'KES') {
  return `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TrustGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? '#22c55e' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 54;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="54" fill="none" stroke="hsl(220 15% 18%)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r="54" fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="28" fontWeight="700">{score}</text>
        <text x="70" y="85" textAnchor="middle" fill="#94a3b8" fontSize="11">{label}</text>
      </svg>
    </div>
  );
}

function BarChartSimple({ data, currency }: { data: MonthlyIncome[]; currency: string }) {
  if (!data.length) return <p className="text-muted-foreground text-sm text-center py-4">No monthly data</p>;
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="flex items-end gap-2 h-36 w-full overflow-x-auto pb-1">
      {data.map((d) => {
        const pct = (d.amount / max) * 100;
        return (
          <div key={d.month} className="flex flex-col items-center gap-1 min-w-[40px] flex-1">
            <span className="text-[10px] text-muted-foreground">{fmt(d.amount, currency).split(' ')[1]}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, background: 'hsl(221 83% 53%)' }} />
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label.substring(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Vault() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordCallback, setPasswordCallback] = useState<((pwd: string) => void) | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const stored = localStorage.getItem('vault_files');
    if (stored) {
      try { setFiles(JSON.parse(stored)); } catch {}
    }
  }, []);

  const saveFiles = (newFiles: StoredFile[]) => {
    setFiles(newFiles);
    localStorage.setItem('vault_files', JSON.stringify(newFiles));
  };

  const extractTextFromPdf = async (base64Data: string, password?: string): Promise<string> => {
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

    const loadingTask = pdfjsLib.getDocument({ data: array.buffer, password: password || '' });

    loadingTask.onPassword = (updatePassword: (pwd: string) => void, reason: number) => {
      setPasswordRequired(true);
      setPasswordError(reason === 2 ? 'Incorrect password' : null);
      setPasswordCallback(() => updatePassword);
    };

    const doc = await loadingTask.promise;
    setPasswordRequired(false);
    setPasswordError(null);

    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  const analyzeText = async (text: string) => {
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const res = await fetch('/api/analyze/mpesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data: AnalysisResult = await res.json();
      setAnalysisResult(data);
    } catch (err: any) {
      setAnalysisError(err.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadAndAnalyze = async (fileId: string, password?: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    setAnalysisResult(null);
    setAnalysisError(null);
    try {
      const text = await extractTextFromPdf(file.data, password);
      if (password && !file.isEncrypted) {
        saveFiles(files.map(f => f.id === fileId ? { ...f, isEncrypted: true } : f));
      }
      await analyzeText(text);
    } catch (err: any) {
      if (err.name === 'PasswordException') {
        setPasswordRequired(true);
        setPasswordError(err.code === 2 ? 'Incorrect password' : null);
        saveFiles(files.map(f => f.id === fileId ? { ...f, isEncrypted: true } : f));
      } else {
        setAnalysisError(err.message || 'Failed to read PDF');
      }
    }
  };

  useEffect(() => {
    if (selectedFileId) {
      setPasswordRequired(false);
      setPasswordError(null);
      setPasswordInput('');
      setPasswordCallback(null);
      loadAndAnalyze(selectedFileId);
    } else {
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  }, [selectedFileId]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordCallback) {
      setPasswordCallback(null);
      passwordCallback(passwordInput);
      if (selectedFileId) analyzeText('').catch(() => {});
    } else if (selectedFileId) {
      setPasswordRequired(false);
      loadAndAnalyze(selectedFileId, passwordInput);
    }
  };

  const handleFileAdd = useCallback((file: File) => {
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
        data: base64,
      };
      const updated = [...files, newFile];
      saveFiles(updated);
      setSelectedFileId(newFile.id);
    };
    reader.readAsDataURL(file);
  }, [files]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    for (const item of Array.from(items || [])) {
      if (item.type === 'application/pdf') {
        const file = item.getAsFile();
        if (file) handleFileAdd(file);
      }
    }
  }, [handleFileAdd]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFileAdd(e.dataTransfer.files[0]);
  };

  const openFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e: any) => {
      if (e.target.files?.[0]) handleFileAdd(e.target.files[0]);
    };
    input.click();
  };

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  const selectedFile = files.find(f => f.id === selectedFileId);
  const currency = analysisResult?.summary?.currency || 'KES';

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">

      {/* Sidebar */}
      <div className="w-72 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
            <Lock size={18} />
          </div>
          <div>
            <h1 className="font-bold tracking-widest text-sm text-foreground">FILE VAULT</h1>
            <p className="text-[10px] text-muted-foreground">M-Pesa Statement Analyzer</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {files.length === 0 ? (
            <div className="text-center p-6 text-muted-foreground">
              <ShieldAlert className="mx-auto mb-3 opacity-20" size={32} />
              <p className="text-sm">No statements added.</p>
              <p className="text-xs mt-1">Upload an M-Pesa PDF to begin.</p>
            </div>
          ) : (
            files.map(f => (
              <div
                key={f.id}
                data-testid={`file-item-${f.id}`}
                onClick={() => setSelectedFileId(f.id)}
                className={`group flex items-center p-3 rounded-lg cursor-pointer transition-all ${selectedFileId === f.id ? 'bg-primary/15 border border-primary/30' : 'hover:bg-accent border border-transparent'}`}
              >
                <div className="mr-3 text-muted-foreground">
                  {f.isEncrypted ? <Lock size={15} className="text-amber-400" /> : <FileText size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{formatSize(f.size)}</div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  data-testid={`remove-file-${f.id}`}
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = files.filter(x => x.id !== f.id);
                    saveFiles(next);
                    if (selectedFileId === f.id) setSelectedFileId(null);
                  }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button className="w-full" variant="outline" onClick={openFilePicker} data-testid="add-document-btn">
            Add Statement
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedFileId ? (
          /* Upload zone */
          <div
            className="flex-1 flex items-center justify-center p-8"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              data-testid="drop-zone"
              className={`max-w-lg w-full border-2 border-dashed rounded-2xl p-16 text-center transition-all ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
            >
              <UploadCloud className="mx-auto text-muted-foreground mb-5" size={52} />
              <h2 className="text-2xl font-semibold mb-2">Drop M-Pesa Statement</h2>
              <p className="text-sm text-muted-foreground mb-2">Supports password-protected PDFs</p>
              <p className="text-xs text-muted-foreground mb-8">Or press Ctrl+V to paste from clipboard</p>
              <Button onClick={openFilePicker} size="lg" data-testid="browse-files-btn">Browse Files</Button>
            </div>
          </div>

        ) : passwordRequired ? (
          /* Password prompt */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-8 shadow-xl">
              <div className="flex justify-center mb-5 text-amber-400">
                <Lock size={44} />
              </div>
              <h2 className="text-xl font-semibold text-center mb-1">Statement is encrypted</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Enter the password to unlock "{selectedFile?.name}"
              </p>
              <form onSubmit={submitPassword} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Enter password..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoFocus
                  data-testid="password-input"
                  className="bg-background"
                />
                {passwordError && (
                  <p className="text-destructive text-sm font-medium flex items-center gap-1">
                    <AlertCircle size={14} /> {passwordError}
                  </p>
                )}
                <Button type="submit" className="w-full" data-testid="unlock-btn">Unlock & Analyze</Button>
              </form>
            </div>
          </div>

        ) : analyzing ? (
          /* Loading */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-lg">Analyzing Statement</p>
              <p className="text-sm text-muted-foreground mt-1">Reading transactions and computing income...</p>
            </div>
          </div>

        ) : analysisError ? (
          /* Error */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <AlertCircle className="mx-auto mb-4 text-destructive" size={48} />
              <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground text-sm mb-6">{analysisError}</p>
              <Button onClick={() => selectedFileId && loadAndAnalyze(selectedFileId)} variant="outline">
                Try Again
              </Button>
            </div>
          </div>

        ) : analysisResult ? (
          /* Results */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedFile?.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {analysisResult.summary.periodStart} — {analysisResult.summary.periodEnd} &middot; {analysisResult.summary.totalTransactions} transactions
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => selectedFileId && loadAndAnalyze(selectedFileId)}>
                Re-analyze
              </Button>
            </div>

            {/* Top stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <TrendingUp size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Total Income</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{fmt(analysisResult.summary.totalIncome, currency)}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Calendar size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Avg Monthly</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{fmt(analysisResult.summary.averageMonthlyIncome, currency)}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <BarChart3 size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Avg Daily</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{fmt(analysisResult.summary.averageDailyIncome, currency)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Trust Score */}
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-muted-foreground self-start">
                  <Star size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Trust Score</span>
                </div>
                <TrustGauge score={analysisResult.trustScore.score} label={analysisResult.trustScore.label} />
                <p className="text-xs text-muted-foreground text-center leading-relaxed">{analysisResult.trustScore.reasoning}</p>
                <div className="w-full space-y-2 mt-1">
                  {analysisResult.trustScore.factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {f.impact === 'positive' ? (
                        <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                      ) : f.impact === 'negative' ? (
                        <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                      ) : (
                        <MinusCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-medium">{f.name}: </span>
                        <span className="text-xs text-muted-foreground">{f.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Income Chart */}
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <BarChart3 size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Monthly Income</span>
                </div>
                <BarChartSimple data={analysisResult.monthlyIncome} currency={currency} />
                <div className="mt-4 divide-y divide-border">
                  {analysisResult.monthlyIncome.map((m) => (
                    <div key={m.month} className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{m.transactionCount} txns</span>
                        <span className="text-sm font-semibold">{fmt(m.amount, currency)}</span>
                      </div>
                    </div>
                  ))}
                  {!analysisResult.monthlyIncome.length && (
                    <p className="text-sm text-muted-foreground py-3 text-center">No monthly data found</p>
                  )}
                </div>
              </div>
            </div>

            {/* Daily Income */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <Calendar size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Daily Income Breakdown</span>
              </div>
              {analysisResult.dailyIncome.length > 0 ? (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {analysisResult.dailyIncome.map((d) => (
                    <div key={d.date} className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-muted-foreground">{d.date}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{d.transactionCount} txn{d.transactionCount !== 1 ? 's' : ''}</span>
                        <span className="text-sm font-semibold text-green-400">{fmt(d.amount, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No daily breakdown available</p>
              )}
            </div>
          </div>

        ) : (
          /* Initial state after selecting — shouldn't normally show */
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
