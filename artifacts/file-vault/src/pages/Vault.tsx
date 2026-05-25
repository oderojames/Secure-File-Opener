import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Lock, Trash2, UploadCloud, ShieldAlert, TrendingUp, Calendar,
  BarChart3, AlertCircle, CheckCircle2, MinusCircle, FileText,
  ShieldCheck, BadgeAlert, ThumbsUp, ThumbsDown, Minus,
  ArrowDownLeft, ArrowUpRight, Lightbulb, AlertTriangle, XCircle,
  Banknote, Phone, CreditCard, RefreshCw, ShoppingBag, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface StoredFile {
  id: string; name: string; size: number; dateAdded: string; data: string; isEncrypted?: boolean;
}

interface DailyIncome { date: string; amount: number; transactionCount: number; }
interface MonthlyIncome { month: string; label: string; amount: number; transactionCount: number; }
interface TrustFactor { name: string; score: number; weight: number; impact: 'positive' | 'negative' | 'neutral'; detail: string; }

interface TrustScore {
  score: number; grade: string; label: string; creditLimit: number;
  reasoning: string; factors: TrustFactor[];
  riskLevel: string; recommendation: string;
}

interface Summary {
  totalIncome: number; totalExpenditure: number; netCashFlow: number; cashFlowRatio: number;
  averageMonthlyIncome: number; averageDailyIncome: number;
  peakIncomeMonth: string; lowestIncomeMonth: string; currency: string;
  periodStart: string; periodEnd: string; totalTransactions: number;
  incomeTransactions: number; expenditureTransactions: number;
}

interface BehavioralInsight {
  type: 'positive' | 'negative' | 'warning';
  title: string;
  description: string;
}

interface RecentTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
}

interface AnalysisResult {
  dailyIncome: DailyIncome[]; monthlyIncome: MonthlyIncome[];
  trustScore: TrustScore; summary: Summary;
  behavioralInsights?: BehavioralInsight[];
  recentTransactions?: RecentTransaction[];
}

function fmt(n: number, currency = 'KES') {
  return `${currency} ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gradeColor(grade: string) {
  if (grade?.startsWith('A')) return '#22c55e';
  if (grade?.startsWith('B')) return '#3b82f6';
  if (grade?.startsWith('C')) return '#f59e0b';
  if (grade?.startsWith('D')) return '#f97316';
  return '#ef4444';
}

function scoreColor(score: number) {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#3b82f6';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function CreditGauge({ score, grade, label }: { score: number; grade: string; label: string }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 52;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r="52" fill="none" stroke="hsl(220 15% 18%)" strokeWidth="14" />
        <circle cx="74" cy="74" r="52" fill="none" stroke={color} strokeWidth="14"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
          transform="rotate(-90 74 74)" style={{ transition: 'stroke-dasharray 1.2s ease' }} />
        <text x="74" y="64" textAnchor="middle" fill="white" fontSize="30" fontWeight="800">{score}</text>
        <text x="74" y="82" textAnchor="middle" fill={color} fontSize="15" fontWeight="700">{grade}</text>
        <text x="74" y="97" textAnchor="middle" fill="#94a3b8" fontSize="10">{label}</text>
      </svg>
    </div>
  );
}

function FactorBar({ factor }: { factor: TrustFactor }) {
  const color = factor.impact === 'positive' ? '#22c55e' : factor.impact === 'negative' ? '#ef4444' : '#f59e0b';
  const Icon = factor.impact === 'positive' ? ThumbsUp : factor.impact === 'negative' ? ThumbsDown : Minus;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon size={11} style={{ color }} />
          <span className="font-medium text-foreground">{factor.name}</span>
          <span className="text-muted-foreground">({factor.weight}%)</span>
        </div>
        <span className="font-bold" style={{ color }}>{factor.score}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${factor.score}%`, background: color }} />
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{factor.detail}</p>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.FC<{ size: number; className?: string }>> = {
  Income: TrendingUp, 'Bill Payment': Building2, Transfer: ArrowUpRight,
  Withdrawal: Banknote, Airtime: Phone, Loan: CreditCard,
  Business: ShoppingBag, Other: RefreshCw,
};

function InsightCard({ insight }: { insight: BehavioralInsight }) {
  const isPos = insight.type === 'positive';
  const isNeg = insight.type === 'negative';
  const Icon = isPos ? Lightbulb : isNeg ? XCircle : AlertTriangle;
  const colors = isPos
    ? { border: 'border-green-500/30', bg: 'bg-green-500/8', icon: 'text-green-400', title: 'text-green-300' }
    : isNeg
    ? { border: 'border-red-500/30', bg: 'bg-red-500/8', icon: 'text-red-400', title: 'text-red-300' }
    : { border: 'border-amber-500/30', bg: 'bg-amber-500/8', icon: 'text-amber-400', title: 'text-amber-300' };
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${colors.border} ${colors.bg}`}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${colors.icon}`} />
      <div>
        <p className={`text-xs font-semibold mb-0.5 ${colors.title}`}>{insight.title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.description}</p>
      </div>
    </div>
  );
}

function TxRow({ tx, currency }: { tx: RecentTransaction; currency: string }) {
  const isCredit = tx.type === 'credit';
  const CatIcon = CATEGORY_ICONS[tx.category] ?? RefreshCw;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isCredit ? 'bg-green-500/15' : 'bg-red-500/12'}`}>
        {isCredit
          ? <ArrowDownLeft size={13} className="text-green-400" />
          : <ArrowUpRight size={13} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{tx.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <CatIcon size={10} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{tx.category}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{tx.date}</span>
        </div>
      </div>
      <span className={`text-xs font-bold shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
        {isCredit ? '+' : '-'}{fmt(tx.amount, currency)}
      </span>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Low: 'bg-green-500/15 text-green-400 border-green-500/30',
    Medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    High: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Very High': 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${map[level] || map.High}`}>{level} Risk</span>;
}

function RecommendationBadge({ rec }: { rec: string }) {
  const isApprove = rec?.toLowerCase().startsWith('approve');
  const isDecline = rec?.toLowerCase().startsWith('decline');
  const cls = isApprove ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : isDecline ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  const Icon = isApprove ? CheckCircle2 : isDecline ? AlertCircle : MinusCircle;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${cls}`}>
      <Icon size={15} /> {rec}
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
    if (stored) { try { setFiles(JSON.parse(stored)); } catch {} }
  }, []);

  const saveFiles = (f: StoredFile[]) => { setFiles(f); localStorage.setItem('vault_files', JSON.stringify(f)); };

  const extractText = async (base64: string, password?: string): Promise<string> => {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const task = pdfjsLib.getDocument({ data: arr.buffer, password: password || '' });
    task.onPassword = (cb: (pwd: string) => void, reason: number) => {
      setPasswordRequired(true);
      setPasswordError(reason === 2 ? 'Incorrect password' : null);
      setPasswordCallback(() => cb);
    };
    const doc = await task.promise;
    setPasswordRequired(false); setPasswordError(null);
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((x: any) => x.str).join(' ') + '\n';
    }
    return text;
  };

  const analyzeText = async (text: string) => {
    setAnalyzing(true); setAnalysisError(null); setAnalysisResult(null);
    try {
      const res = await fetch('/api/analyze/mpesa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Unknown error' })); throw new Error(e.error || `Error ${res.status}`); }
      setAnalysisResult(await res.json());
    } catch (e: any) {
      setAnalysisError(e.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadAndAnalyze = async (fileId: string, password?: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    setAnalysisResult(null); setAnalysisError(null);
    try {
      const text = await extractText(file.data, password);
      if (password && !file.isEncrypted) saveFiles(files.map(f => f.id === fileId ? { ...f, isEncrypted: true } : f));
      await analyzeText(text);
    } catch (e: any) {
      if (e.name === 'PasswordException') {
        setPasswordRequired(true);
        setPasswordError(e.code === 2 ? 'Incorrect password' : null);
        saveFiles(files.map(f => f.id === fileId ? { ...f, isEncrypted: true } : f));
      } else { setAnalysisError(e.message || 'Failed to read PDF'); }
    }
  };

  useEffect(() => {
    if (selectedFileId) {
      setPasswordRequired(false); setPasswordError(null); setPasswordInput(''); setPasswordCallback(null);
      loadAndAnalyze(selectedFileId);
    } else { setAnalysisResult(null); setAnalysisError(null); }
  }, [selectedFileId]);

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordCallback) { setPasswordCallback(null); passwordCallback(passwordInput); }
    else if (selectedFileId) { setPasswordRequired(false); loadAndAnalyze(selectedFileId, passwordInput); }
  };

  const handleFileAdd = useCallback((file: File) => {
    if (file.type !== 'application/pdf') { toast({ title: 'Invalid file', description: 'Please upload a PDF.', variant: 'destructive' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const nf: StoredFile = { id: crypto.randomUUID(), name: file.name, size: file.size, dateAdded: new Date().toISOString(), data: base64 };
      const updated = [...files, nf];
      saveFiles(updated);
      setSelectedFileId(nf.id);
    };
    reader.readAsDataURL(file);
  }, [files]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData?.items || [])) {
      if (item.type === 'application/pdf') { const f = item.getAsFile(); if (f) handleFileAdd(f); }
    }
  }, [handleFileAdd]);

  useEffect(() => { window.addEventListener('paste', handlePaste); return () => window.removeEventListener('paste', handlePaste); }, [handlePaste]);

  const openPicker = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf'; i.onchange = (e: any) => { if (e.target.files?.[0]) handleFileAdd(e.target.files[0]); }; i.click(); };
  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';
  const selectedFile = files.find(f => f.id === selectedFileId);
  const currency = analysisResult?.summary?.currency || 'KES';
  const ts = analysisResult?.trustScore;
  const sm = analysisResult?.summary;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">

      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
            <ShieldCheck size={17} />
          </div>
          <div>
            <h1 className="font-bold tracking-widest text-xs text-foreground">CREDIT VAULT</h1>
            <p className="text-[10px] text-muted-foreground">M-Pesa Creditworthiness</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {files.length === 0 ? (
            <div className="text-center p-6 text-muted-foreground">
              <ShieldAlert className="mx-auto mb-3 opacity-20" size={28} />
              <p className="text-sm">No statements.</p>
              <p className="text-xs mt-1">Upload an M-Pesa PDF.</p>
            </div>
          ) : files.map(f => (
            <div key={f.id} data-testid={`file-${f.id}`} onClick={() => setSelectedFileId(f.id)}
              className={`group flex items-center p-2.5 rounded-lg cursor-pointer transition-all ${selectedFileId === f.id ? 'bg-primary/15 border border-primary/30' : 'hover:bg-accent border border-transparent'}`}>
              <div className="mr-2.5 text-muted-foreground">
                {f.isEncrypted ? <Lock size={13} className="text-amber-400" /> : <FileText size={13} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">{formatSize(f.size)}</div>
              </div>
              <Button variant="ghost" size="icon" data-testid={`remove-${f.id}`}
                className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={e => { e.stopPropagation(); const n = files.filter(x => x.id !== f.id); saveFiles(n); if (selectedFileId === f.id) setSelectedFileId(null); }}>
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border">
          <Button className="w-full text-xs" variant="outline" onClick={openPicker} size="sm" data-testid="add-btn">
            Add Statement
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {!selectedFileId ? (
          <div className="flex-1 flex items-center justify-center p-8"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleFileAdd(e.dataTransfer.files[0]); }}>
            <div data-testid="drop-zone"
              className={`max-w-lg w-full border-2 border-dashed rounded-2xl p-16 text-center transition-all ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
              <UploadCloud className="mx-auto text-muted-foreground mb-5" size={48} />
              <h2 className="text-2xl font-bold mb-2">Upload M-Pesa Statement</h2>
              <p className="text-sm text-muted-foreground mb-1">AI will analyze your transactions and generate</p>
              <p className="text-sm font-semibold text-primary mb-8">a detailed creditworthiness report</p>
              <div className="flex items-center justify-center gap-3 mb-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Password-protected PDFs</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Secure & private</span>
              </div>
              <Button onClick={openPicker} size="lg" data-testid="browse-btn">Browse Files</Button>
              <p className="text-xs text-muted-foreground mt-4">Or press Ctrl+V to paste</p>
            </div>
          </div>

        ) : passwordRequired ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-8 shadow-xl">
              <div className="flex justify-center mb-5 text-amber-400"><Lock size={44} /></div>
              <h2 className="text-xl font-semibold text-center mb-1">Statement is encrypted</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">Enter the password to unlock "{selectedFile?.name}"</p>
              <form onSubmit={submitPassword} className="space-y-4">
                <Input type="password" placeholder="Enter password..." value={passwordInput} onChange={e => setPasswordInput(e.target.value)} autoFocus data-testid="pwd-input" className="bg-background" />
                {passwordError && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={13} />{passwordError}</p>}
                <Button type="submit" className="w-full" data-testid="unlock-btn">Unlock & Analyze</Button>
              </form>
            </div>
          </div>

        ) : analyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-bold text-xl">Analyzing Statement</p>
              <p className="text-sm text-muted-foreground mt-2">Scanning transactions · Computing credit score · Assessing risk</p>
            </div>
          </div>

        ) : analysisError ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <AlertCircle className="mx-auto mb-4 text-destructive" size={48} />
              <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground text-sm mb-6">{analysisError}</p>
              <Button onClick={() => selectedFileId && loadAndAnalyze(selectedFileId)} variant="outline">Try Again</Button>
            </div>
          </div>

        ) : analysisResult && ts && sm ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{selectedFile?.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{sm.periodStart} — {sm.periodEnd} · {sm.totalTransactions} total transactions</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => selectedFileId && loadAndAnalyze(selectedFileId)}>Re-analyze</Button>
            </div>

            {/* Credit score hero + recommendation */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <CreditGauge score={ts.score} grade={ts.grade} label={ts.label} />
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-bold">Credit Assessment</h3>
                      <RiskBadge level={ts.riskLevel} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{ts.reasoning}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <RecommendationBadge rec={ts.recommendation} />
                    <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested Credit Limit</p>
                      <p className="text-base font-bold text-primary">{fmt(ts.creditLimit, currency)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Cash Flow Ratio — primary signal, highlighted */}
              <div className="col-span-2 sm:col-span-1 bg-card border-2 rounded-xl p-4"
                style={{ borderColor: (sm.cashFlowRatio >= 1.5 ? '#22c55e' : sm.cashFlowRatio >= 1.0 ? '#f59e0b' : '#ef4444') + '60' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 size={13} className="text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cash Flow Ratio</span>
                </div>
                <div className="text-2xl font-black" style={{ color: sm.cashFlowRatio >= 1.5 ? '#22c55e' : sm.cashFlowRatio >= 1.0 ? '#f59e0b' : '#ef4444' }}>
                  {(sm.cashFlowRatio || 0).toFixed(2)}×
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {sm.cashFlowRatio >= 2.0 ? 'Strong surplus' : sm.cashFlowRatio >= 1.2 ? 'Healthy surplus' : sm.cashFlowRatio >= 1.0 ? 'Break-even' : 'Spending > earning'}
                </div>
              </div>
              {[
                { label: 'Total Income', value: fmt(sm.totalIncome, currency), icon: TrendingUp, color: 'text-green-400' },
                { label: 'Total Expenditure', value: fmt(sm.totalExpenditure, currency), icon: BadgeAlert, color: 'text-red-400' },
                { label: 'Net Cash Flow', value: fmt(sm.netCashFlow, currency), icon: MinusCircle, color: sm.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Avg Monthly Income', value: fmt(sm.averageMonthlyIncome, currency), icon: Calendar, color: 'text-blue-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={13} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                  </div>
                  <div className={`text-sm font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Credit score factors */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Credit Score Factors</h3>
                <div className="space-y-4">
                  {ts.factors.map((f, i) => <FactorBar key={i} factor={f} />)}
                </div>
              </div>

              {/* Behavioral Insights */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb size={14} className="text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behavioral Insights</h3>
                </div>
                {analysisResult.behavioralInsights && analysisResult.behavioralInsights.length > 0 ? (
                  <div className="space-y-2.5">
                    {analysisResult.behavioralInsights.map((insight, i) => (
                      <InsightCard key={i} insight={insight} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No behavioral data available</p>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Transactions</h3>
                </div>
                {analysisResult.recentTransactions && analysisResult.recentTransactions.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{analysisResult.recentTransactions.length} shown</span>
                )}
              </div>
              {analysisResult.recentTransactions && analysisResult.recentTransactions.length > 0 ? (
                <div className="max-h-72 overflow-y-auto pr-1">
                  {analysisResult.recentTransactions.map((tx, i) => (
                    <TxRow key={i} tx={tx} currency={currency} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No transaction data available</p>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
