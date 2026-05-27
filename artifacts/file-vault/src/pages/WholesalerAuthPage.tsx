import { useState } from 'react';
import { useLocation } from 'wouter';
import { Building2, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'signin' | 'signup';

export default function WholesalerAuthPage() {
  const [, navigate] = useLocation();
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendlyError = (code: string) => {
    if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential'))
      return 'Invalid email or password.';
    if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
    if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (code.includes('invalid-email')) return 'Please enter a valid email address.';
    if (code.includes('network')) return 'Network error. Please check your connection.';
    return 'Something went wrong. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'signup') {
        if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        await signUpWithEmail(name.trim(), email, password, 'wholesaler');
      } else {
        await signInWithEmail(email, password);
      }
    } catch (e: any) {
      setError(friendlyError(e.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">

      {/* Background subtle grid */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />

      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">

        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 mb-4">
            <Building2 size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Doyang</h1>
          <p className="text-sm text-muted-foreground mt-1">Wholesaler Portal · M-Pesa Creditworthiness</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">

          {/* Role badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              Wholesaler Portal
            </span>
          </div>

          {/* Tabs */}
          <div className="flex bg-muted rounded-lg p-1 mb-6">
            {(['signin', 'signup'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
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
                className="pl-9 pr-10 bg-background" required />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

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
