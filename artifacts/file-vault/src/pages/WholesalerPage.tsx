import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerAuthPage from '@/pages/WholesalerAuthPage';
import {
  Building2, LogOut, Users, TrendingUp, RefreshCw,
  CheckCircle2, AlertCircle, MinusCircle, Search, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectionGroup, getDocs, query, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TrustScore {
  score: number;
  grade: string;
  label: string;
  creditLimit: number;
  riskLevel: string;
  recommendation: string;
}

interface RetailerRecord {
  id: string;
  fileName: string;
  dateAdded: string;
  retailerUid: string;
  retailerName: string;
  retailerEmail: string;
  trustScore: TrustScore;
  totalIncome: number;
  totalExpenditure: number;
  netCashFlow: number;
  currency: string;
}

function scoreColor(score: number) {
  if (score >= 85) return { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30' };
  if (score >= 70) return { text: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' };
  if (score >= 55) return { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
  if (score >= 40) return { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' };
  return { text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' };
}

function fmt(n: number, currency = 'KES') {
  return `${currency} ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const c = scoreColor(score);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.text} ${c.bg} ${c.border}`}>
      <span>{grade}</span>
      <span className="font-normal opacity-80">{score}/100</span>
    </span>
  );
}

function RecommendationBadge({ rec }: { rec: string }) {
  const isApprove = rec?.toLowerCase().startsWith('approve');
  const isDecline = rec?.toLowerCase().startsWith('decline');
  const Icon = isApprove ? CheckCircle2 : isDecline ? AlertCircle : MinusCircle;
  const cls = isApprove
    ? 'text-green-400 bg-green-500/10 border-green-500/25'
    : isDecline
    ? 'text-red-400 bg-red-500/10 border-red-500/25'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      <Icon size={11} />
      {rec}
    </span>
  );
}

type SortKey = 'dateAdded' | 'score' | 'retailerName' | 'creditLimit';

function RetailersManagedTab() {
  const [records, setRecords] = useState<RetailerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        const q = query(collectionGroup(db, 'vault_analyses'), orderBy('dateAdded', 'desc'));
        const snap = await getDocs(q);

        const uidNameCache: Record<string, { name: string; email: string }> = {};

        const rows: RetailerRecord[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as any;
            const uid = d.ref.parent.parent?.id ?? 'unknown';

            let retailerName = data.retailerName;
            let retailerEmail = data.retailerEmail;

            if (!retailerName) {
              if (!uidNameCache[uid]) {
                try {
                  const userSnap = await getDoc(doc(db, 'users', uid));
                  const userData = userSnap.data();
                  uidNameCache[uid] = {
                    name: userData?.displayName || userData?.email?.split('@')[0] || 'Retailer',
                    email: userData?.email || '',
                  };
                } catch {
                  uidNameCache[uid] = { name: 'Retailer', email: '' };
                }
              }
              retailerName = uidNameCache[uid].name;
              retailerEmail = uidNameCache[uid].email;
            }

            return {
              id: data.id ?? d.id,
              fileName: data.name ?? 'Statement',
              dateAdded: data.dateAdded ?? '',
              retailerUid: uid,
              retailerName,
              retailerEmail: retailerEmail ?? '',
              trustScore: {
                score: data.result?.trustScore?.score ?? 0,
                grade: data.result?.trustScore?.grade ?? 'N/A',
                label: data.result?.trustScore?.label ?? '',
                creditLimit: data.result?.trustScore?.creditLimit ?? 0,
                riskLevel: data.result?.trustScore?.riskLevel ?? 'Unknown',
                recommendation: data.result?.trustScore?.recommendation ?? 'Review',
              },
              totalIncome: data.result?.summary?.totalIncome ?? 0,
              totalExpenditure: data.result?.summary?.totalExpenditure ?? 0,
              netCashFlow: data.result?.summary?.netCashFlow ?? 0,
              currency: data.result?.summary?.currency ?? 'KES',
            } as RetailerRecord;
          })
        );

        setRecords(rows);
      } catch (e: any) {
        setError(e.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  const filtered = records.filter(r =>
    r.retailerName.toLowerCase().includes(search.toLowerCase()) ||
    r.retailerEmail.toLowerCase().includes(search.toLowerCase()) ||
    r.fileName.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'dateAdded') cmp = a.dateAdded.localeCompare(b.dateAdded);
    else if (sortKey === 'score') cmp = a.trustScore.score - b.trustScore.score;
    else if (sortKey === 'retailerName') cmp = a.retailerName.localeCompare(b.retailerName);
    else if (sortKey === 'creditLimit') cmp = a.trustScore.creditLimit - b.trustScore.creditLimit;
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : <ChevronDown size={12} className="opacity-30" />;

  const avgScore = records.length ? Math.round(records.reduce((s, r) => s + r.trustScore.score, 0) / records.length) : 0;
  const approveCount = records.filter(r => r.trustScore.recommendation?.toLowerCase().startsWith('approve')).length;

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
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 p-6 pb-0">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Reports</p>
          <p className="text-2xl font-bold text-foreground">{records.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">across all retailers</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Average Credit Score</p>
          <p className="text-2xl font-bold" style={{ color: avgScore >= 70 ? '#22c55e' : avgScore >= 55 ? '#f59e0b' : '#ef4444' }}>
            {avgScore}<span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">portfolio average</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Approved</p>
          <p className="text-2xl font-bold text-green-400">{approveCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {records.length ? Math.round((approveCount / records.length) * 100) : 0}% approval rate
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by retailer name, email or file…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Users size={36} className="opacity-20" />
            <p className="text-sm">{search ? 'No results match your search.' : 'No retailer reports found yet.'}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3">
                    <button onClick={() => handleSort('retailerName')} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      Retailer <SortIcon k="retailerName" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => handleSort('score')} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      Credit Score <SortIcon k="score" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-semibold text-muted-foreground">Recommendation</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => handleSort('creditLimit')} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      Credit Limit <SortIcon k="creditLimit" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-semibold text-muted-foreground">Risk</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => handleSort('dateAdded')} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      Date <SortIcon k="dateAdded" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const riskMap: Record<string, string> = {
                    Low: 'text-green-400',
                    Medium: 'text-blue-400',
                    High: 'text-amber-400',
                    'Very High': 'text-red-400',
                  };
                  return (
                    <tr key={r.id + i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground text-sm">{r.retailerName}</p>
                          {r.retailerEmail && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{r.retailerEmail}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[180px]">{r.fileName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={r.trustScore.score} grade={r.trustScore.grade} />
                      </td>
                      <td className="px-4 py-3">
                        <RecommendationBadge rec={r.trustScore.recommendation} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-foreground">
                          {fmt(r.trustScore.creditLimit, r.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${riskMap[r.trustScore.riskLevel] ?? 'text-muted-foreground'}`}>
                          {r.trustScore.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{formatDate(r.dateAdded)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* Background */}
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-card/60 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Building2 size={16} className="text-amber-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Doyang</span>
            <span className="ml-2 text-xs text-amber-400 font-semibold">Wholesaler Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-amber-400">
                {(user?.displayName || user?.email || 'W')[0].toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{user?.displayName || user?.email?.split('@')[0]}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground hover:text-foreground text-xs">
            <LogOut size={13} /> Sign out
          </Button>
        </div>
      </header>

      {/* Page title */}
      <div className="relative z-10 px-6 pt-6 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Users size={17} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Retailers Managed</h1>
            <p className="text-xs text-muted-foreground">All credit score reports submitted by retailers</p>
          </div>
        </div>
      </div>

      {/* Content */}
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
