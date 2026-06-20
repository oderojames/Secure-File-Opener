import { useState } from 'react';
import { useLocation } from 'wouter';
import { Building2, Mail, Lock, User, Eye, EyeOff, AlertCircle, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { BUSINESS_TYPES } from '@/lib/businessTypes';

type Tab = 'signin' | 'signup';

export default function WholesalerAuthPage() {
  const [, navigate] = useLocation();
  const { signInWithEmail, signUpWithEmail, signOut, sendPasswordReset } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setResetError('Enter your email address above first.');
      setResetStatus('error');
      return;
    }
    setResetStatus('sending');
    setResetError(null);
    try {
      await sendPasswordReset(email.trim());
      setResetStatus('sent');
    } catch (e: any) {
      console.error('[ForgotPassword] Firebase error:', e?.code, e?.message);
      setResetStatus('error');
      const code = e?.code ?? '';
      if (code.includes('user-not-found')) {
        setResetError('No account found with this email address.');
      } else if (code.includes('invalid-email')) {
        setResetError('Please enter a valid email address.');
      } else if (code.includes('too-many-requests')) {
        setResetError('Too many attempts. Please wait a few minutes and try again.');
      } else if (code.includes('unauthorized-continue-uri') || code.includes('invalid-continue-uri')) {
        setResetError('Reset email could not be sent due to a configuration issue. Please contact support.');
      } else {
        setResetError(`Could not send reset email (${code || 'unknown error'}). Please try again.`);
      }
    }
  };

  const friendlyError = (code: string) => {
    if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential'))
      return 'Incorrect email or password. Please check your details and try again.';
    if (code.includes('email-already-in-use'))
      return 'An account with this email already exists. If it is your Retailer account, please sign in to the Retailer Portal instead.';
    if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (code.includes('invalid-email')) return 'Please enter a valid email address.';
    if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a few minutes and try again.';
    if (code.includes('network-request-failed') || code.includes('network')) return 'Network error. Please check your connection and try again.';
    if (code.includes('user-disabled')) return 'This account has been disabled. Please contact support.';
    return 'Something went wrong. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'signup') {
        if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        if (!businessType) { setError('Please select a business type.'); setLoading(false); return; }
        await signUpWithEmail(name.trim(), email, password, 'wholesaler', businessType);
      } else {
        const { role } = await signInWithEmail(email, password);
        if (role === 'retailer') {
          await signOut();
          navigate('/retailer');
          return;
        }
      }
    } catch (e: any) {
      setError(friendlyError(e.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">

      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 mb-4">
            <Building2 size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Doyang</h1>
          <p className="text-sm text-muted-foreground mt-1">Wholesaler Portal · M-Pesa Creditworthiness</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">

          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              Wholesaler Portal
            </span>
          </div>

          <div className="flex bg-muted rounded-lg p-1 mb-6">
            {(['signin', 'signup'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Business name" value={name} onChange={e => setName(e.target.value)}
                  className="pl-9 bg-background" required />
              </div>
            )}
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)} className="pl-9 bg-background" required />
            </div>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type={showPwd ? 'text' : 'password'} placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                className="pl-9 pr-10 bg-background" required />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {tab === 'signup' && (
              <div className="relative">
                <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
                <select
                  value={businessType}
                  onChange={e => setBusinessType(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background appearance-none"
                >
                  <option value="">Select business type…</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {tab === 'signin' && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  disabled={resetStatus === 'sending'}
                  onClick={handleForgotPassword}
                  className="text-xs text-amber-400 hover:underline disabled:opacity-50 transition-colors"
                >
                  {resetStatus === 'sending' ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
            )}

            {tab === 'signin' && resetStatus === 'sent' && (
              <div className="flex flex-col gap-0.5 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
                <span className="font-semibold">Reset email sent!</span>
                <span className="text-xs text-emerald-400/80">Check your inbox and spam/junk folder. The link expires in 1 hour.</span>
              </div>
            )}

            {tab === 'signin' && resetStatus === 'error' && resetError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-semibold bg-amber-500 hover:bg-amber-400 text-black border-0"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
                  {tab === 'signup' ? 'Creating account…' : 'Signing in…'}
                </span>
              ) : tab === 'signup' ? 'Create Wholesaler Account' : 'Sign In'}
            </Button>
          </form>

          {tab === 'signup' && (
            <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
              By creating an account you agree to our terms. Your M-Pesa statements are never stored — only the analysis report is saved.
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to home
          </button>
          <p className="text-xs text-muted-foreground">Doyang © {new Date().getFullYear()} · Wholesaler Portal</p>
        </div>
      </div>
    </div>
  );
}
