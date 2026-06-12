import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerAuthPage from '@/pages/WholesalerAuthPage';
import { Building2, LogOut, Users, RefreshCw, AlertCircle, Search, Copy, Check, Trash2, Lock, Calendar, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function EmailVerificationBanner() {
  const { user, signOut, sendVerificationEmail, reloadUser } = useAuth();
  const [, navigate] = useLocation();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'not-yet'>('idle');

  const handleResend = async () => {
    setResendStatus('sending');
    try { await sendVerificationEmail(); setResendStatus('sent'); setTimeout(() => setResendStatus('idle'), 4000); }
    catch { setResendStatus('idle'); }
  };

  const handleContinue = async () => {
    setCheckStatus('checking');
    const ok = await reloadUser();
    if (!ok) { setCheckStatus('not-yet'); setTimeout(() => setCheckStatus('idle'), 3000); }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 mx-auto">
            <Mail size={30} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a verification link to <span className="font-semibold text-foreground">{user?.email}</span>.
              <br />Open it to activate your account, then click <em>Continue</em>.
            </p>
          </div>
          <div className="space-y-2 pt-1">
            <button onClick={handleContinue} disabled={checkStatus === 'checking'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 px-4 transition-colors text-sm disabled:opacity-60">
              {checkStatus === 'checking'
                ? <><RefreshCw size={14} className="animate-spin" /> Checking…</>
                : <><CheckCircle2 size={14} /> I've verified — Continue</>}
            </button>
            {checkStatus === 'not-yet' && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 justify-center">
                <AlertCircle size={13} />
                Email not verified yet. Please click the link in your inbox first.
              </div>
            )}
            <button onClick={handleResend} disabled={resendStatus !== 'idle'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium py-2.5 px-4 transition-colors text-sm disabled:opacity-60">
              {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? '✓ Email resent!' : 'Resend verification email'}
            </button>
            <button onClick={async () => { await signOut(); navigate('/'); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReportSummary {
  id: string;
  customerName?: string | null;
  customerPhone?: string | null;
  retailerName: string;
  retailerEmail: string;
  fileName: string;
  dateAdded: string;
  score: number;
  grade: string;
  label: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  visibility?: 'public' | 'private';
  allowedWholesalers?: string[];
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

function formatPeriod(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function RetailersManagedTab({ wholesalerUid }: { wholesalerUid: string }) {
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
      const all = snap.docs.map(d => d.data() as ReportSummary);
      // Show: public reports (or old ones with no visibility field), OR private ones explicitly shared with this wholesaler
      const visible = all.filter(r =>
        !r.visibility || r.visibility === 'public' ||
        (r.visibility === 'private' && r.allowedWholesalers?.includes(wholesalerUid))
      );
      setReports(visible);
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [wholesalerUid]);

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
      <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2 shrink-0">
          <RefreshCw size={13} /> <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Count */}
      <div className="px-4 sm:px-6 pb-3">
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'report' : 'reports'} found
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Users size={36} className="opacity-20" />
            <p className="text-sm">
              {search ? 'No results match your search.' : 'No retailer reports yet.'}
            </p>
            {!search && (
              <p className="text-xs opacity-60 text-center">Reports appear here once retailers submit M-Pesa statements.</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Mobile card list (< sm) ── */}
            <div className="sm:hidden space-y-3">
              {filtered.map((r, i) => {
                const s = scoreStyle(r.score);
                return (
                  <div key={r.id + i} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: name + details */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {r.customerName || r.retailerName || '—'}
                        </p>
                        {r.customerName && r.retailerName && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            <span className="text-muted-foreground/60">Business:</span> {r.retailerName}
                          </p>
                        )}
                        {r.customerPhone && (
                          <p className="text-[11px] text-amber-400/80 truncate">
                            <span className="text-muted-foreground/60">
                              {r.customerName ? 'Owner:' : 'Contact:'}
                            </span>{' '}
                            {r.customerPhone}
                          </p>
                        )}
                        {r.retailerEmail && (
                          <div className="flex items-center gap-1">
                            <p className="text-[11px] text-muted-foreground truncate">{r.retailerEmail}</p>
                            <button
                              onClick={() => copyEmail(r.id, r.retailerEmail)}
                              title="Copy email"
                              className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
                            >
                              {copiedId === r.id
                                ? <Check size={11} className="text-green-400" />
                                : <Copy size={11} />}
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground pt-0.5">{formatDate(r.dateAdded)}</p>
                        {formatPeriod(r.periodStart, r.periodEnd) && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Calendar size={9} className="text-amber-400/70 shrink-0" />
                            <p className="text-[10px] text-amber-400/80">{formatPeriod(r.periodStart, r.periodEnd)}</p>
                          </div>
                        )}
                      </div>

                      {/* Right: score gauge */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="relative w-10 h-10">
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>
                          {r.grade}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table (≥ sm) ── */}
            <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
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
                    <div className="min-w-0 pr-4 space-y-0.5">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {r.customerName || r.retailerName || '—'}
                      </p>
                      {r.customerName && r.retailerName && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          <span className="text-muted-foreground/60">Business:</span> {r.retailerName}
                        </p>
                      )}
                      {r.customerPhone && (
                        <p className="text-[11px] text-amber-400/80 truncate">
                          <span className="text-muted-foreground/60">
                            {r.customerName ? 'Contact Owner:' : 'Contact Business:'}
                          </span>{' '}
                          {r.customerPhone}
                        </p>
                      )}
                      {r.retailerEmail ? (
                        <div className="flex items-center gap-1 group">
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

                    {/* Date + Period */}
                    <div className="space-y-0.5">
                      <span className="text-xs text-muted-foreground">{formatDate(r.dateAdded)}</span>
                      {formatPeriod(r.periodStart, r.periodEnd) && (
                        <div className="flex items-center gap-1">
                          <Calendar size={9} className="text-amber-400/70 shrink-0" />
                          <span className="text-[10px] text-amber-400/80">{formatPeriod(r.periodStart, r.periodEnd)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WholesalerDashboard() {
  const { user, signOut, deleteAccount } = useAuth();
  const [, navigate] = useLocation();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) { setDeleteError('Please enter your password to confirm.'); return; }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setDeleteError('Incorrect password. Please try again.');
      } else if (code.includes('too-many-requests')) {
        setDeleteError('Too many attempts. Please wait before trying again.');
      } else {
        setDeleteError('Failed to delete account. Please try again.');
      }
      setDeleteLoading(false);
    }
  };

  return (<>
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-card/60 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Building2 size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-bold text-foreground">Doyang</span>
          <span className="text-xs text-amber-400 font-semibold hidden xs:inline">· Wholesaler</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[140px]">
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <Button variant="ghost" size="sm" onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(null); }} className="gap-1.5 text-muted-foreground hover:text-destructive text-xs px-2" title="Delete account">
            <Trash2 size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-muted-foreground hover:text-foreground text-xs px-2 sm:px-3">
            <LogOut size={13} /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Page heading */}
      <div className="relative z-10 px-4 sm:px-6 pt-5 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Users size={17} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-foreground">Retailers Managed</h1>
            <p className="text-xs text-muted-foreground">Credit results submitted by retailers</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <RetailersManagedTab wholesalerUid={user!.uid} />
      </div>
    </div>

    {showDeleteModal && (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}>
        <div className="bg-card border border-destructive/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Delete Account</h3>
              <p className="text-xs text-muted-foreground">This cannot be undone</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            This will permanently delete your wholesaler account and all associated data. Enter your password to confirm.
          </p>
          <div className="relative mb-3">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              placeholder="Your password"
              value={deletePassword}
              onChange={e => { setDeletePassword(e.target.value); setDeleteError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-destructive"
              autoFocus
            />
          </div>
          {deleteError && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={12} className="shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteLoading}
              className="flex-1 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-destructive hover:bg-destructive/90 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {deleteLoading ? (
                <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</>
              ) : (
                <><Trash2 size={12} />Delete My Account</>
              )}
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

export default function WholesalerPage() {
  const { user, loading, signOut } = useAuth();
  const [, navigate] = useLocation();

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

  if (!user.emailVerified) return <EmailVerificationBanner />;

  if (user.role === 'retailer') {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30">
            <Building2 size={28} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Wrong Portal</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your account is registered as a{' '}
              <span className="font-semibold text-foreground">Retailer</span>.
              This is the <span className="font-semibold text-foreground">Wholesaler Portal</span>.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href="/retailer"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
            >
              <Building2 size={15} />
              Go to Retailer Portal
            </a>
            <button
              onClick={async () => { await signOut(); navigate('/'); }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
            >
              Sign out &amp; switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <WholesalerDashboard />;
}
