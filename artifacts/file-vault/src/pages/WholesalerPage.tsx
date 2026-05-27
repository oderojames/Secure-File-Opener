import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerAuthPage from '@/pages/WholesalerAuthPage';
import { Building2, LogOut, Users, RefreshCw, AlertCircle, Search, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ReportSummary {
  id: string;
  customerName?: string | null;
  retailerName: string;
  retailerEmail: string;
  fileName: string;
  dateAdded: string;
  score: number;
  grade: string;
  label: string;
}

function scoreStyle(score: number) {
  if (score >= 85) return { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30', bar: '#22c55e' };
  if (score >= 70) return { text: 'text-blue-400',  bg: 'bg-blue-500/15',  border: 'border-blue-500/30',  bar: '#3b82f6' };
  if (score >= 55) return { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', bar: '#f59e0b' };
  if (score >= 40) return { text: 'text-orange-400',bg: 'bg-orange-500/15',border: 'border-orange-500/30',bar: '#f97316' };
  return              { text: 'text-red-400',   bg: 'bg-red-500/15',   border: 'border-red-500/30',   bar: '#ef4444' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RetailersManagedTab() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyEmail = (id: string, email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const snap = await getDocs(
        query(collection(db, 'retailer_reports'), orderBy('dateAdded', 'desc'))
      );
      setReports(snap.docs.map(d => d.data() as ReportSummary));
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const filtered = reports.filter(r => {
    const q = search.toLowerCase();
    return (
      r.customerName?.toLowerCase().includes(q) ||
      r.retailerName?.toLowerCase().includes(q) ||
      r.retailerEmail?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Fetching retailer data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle size={40} className="text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchReports}>
          <RefreshCw size={14} className="mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Search + refresh */}
      <div className="px-6 py-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by retailer name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2 shrink-0">
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>

      {/* Count */}
      <div className="px-6 pb-3">
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'report' : 'reports'} found
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Users size={36} className="opacity-20" />
            <p className="text-sm">
              {search ? 'No results match your search.' : 'No retailer reports yet.'}
            </p>
            {!search && (
              <p className="text-xs opacity-60">Reports will appear here once retailers submit M-Pesa statements.</p>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_160px_100px] border-b border-border bg-muted/40 px-5 py-3">
              <span className="text-xs font-semibold text-muted-foreground">Retailer</span>
              <span className="text-xs font-semibold text-muted-foreground">Credit Score</span>
              <span className="text-xs font-semibold text-muted-foreground">Date</span>
            </div>

            {/* Rows */}
            {filtered.map((r, i) => {
              const s = scoreStyle(r.score);
              return (
                <div
                  key={r.id + i}
                  className="grid grid-cols-[1fr_160px_100px] items-center px-5 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Customer / retailer name */}
                  <div className="min-w-0 pr-4">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {r.customerName || r.retailerName || '—'}
                    </p>
                    {r.retailerEmail ? (
                      <div className="flex items-center gap-1 mt-0.5 group">
                        <p className="text-[11px] text-muted-foreground truncate">{r.retailerEmail}</p>
                        <button
                          onClick={() => copyEmail(r.id, r.retailerEmail)}
                          title="Copy email"
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === r.id
                            ? <Check size={11} className="text-green-400" />
                            : <Copy size={11} />}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Credit score */}
                  <div className="flex items-center gap-3">
                    {/* Mini gauge */}
                    <div className="relative w-10 h-10 shrink-0">
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(220 15% 18%)" strokeWidth="4" />
                        <circle
                          cx="20" cy="20" r="16" fill="none"
                          stroke={s.bar} strokeWidth="4"
                          strokeDasharray={`${(r.score / 100) * (2 * Math.PI * 16)} ${2 * Math.PI * 16}`}
                          strokeLinecap="round"
                          transform="rotate(-90 20 20)"
                        />
                        <text x="20" y="24" textAnchor="middle" fill="white" fontSize="9" fontWeight="800">{r.score}</text>
                      </svg>
                    </div>
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${s.text} ${s.bg} ${s.border}`}>
                        {r.grade}
                      </span>
                      <p className={`text-[10px] mt-0.5 ${s.text}`}>{r.label}</p>
                    </div>
                  </div>

                  {/* Date */}
                  <span className="text-xs text-muted-foreground">{formatDate(r.dateAdded)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WholesalerDashboard() {
  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-card/60 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Building2 size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-bold text-foreground">Doyang</span>
          <span className="text-xs text-amber-400 font-semibold">· Wholesaler</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground hover:text-foreground text-xs">
            <LogOut size={13} /> Sign out
          </Button>
        </div>
      </header>

      {/* Page heading */}
      <div className="relative z-10 px-6 pt-6 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Users size={17} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Retailers Managed</h1>
            <p className="text-xs text-muted-foreground">Credit score results submitted by retailers</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <RetailersManagedTab />
      </div>
    </div>
  );
}

export default function WholesalerPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <WholesalerAuthPage />;
  return <WholesalerDashboard />;
}
