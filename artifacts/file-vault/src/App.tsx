import { useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Vault from "@/pages/Vault";
import AuthPage from "@/pages/AuthPage";
import HomePage from "@/pages/HomePage";
import WholesalerPage from "@/pages/WholesalerPage";
import CompleteProfileScreen from "@/components/CompleteProfileScreen";
import NotFound from "@/pages/not-found";
import { Building2, ShieldCheck, Mail, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

const queryClient = new QueryClient();

function WrongPortalScreen({
  accountRole,
  targetPortal,
  targetHref,
  targetIcon,
  targetColor,
}: {
  accountRole: 'retailer' | 'wholesaler';
  targetPortal: string;
  targetHref: string;
  targetIcon: React.ReactNode;
  targetColor: string;
}) {
  const { signOut } = useAuth();
  const [, navigate] = useLocation();
  const portalLabel = accountRole === 'wholesaler' ? 'Wholesaler' : 'Retailer';
  const wrongLabel  = accountRole === 'wholesaler' ? 'Retailer'   : 'Wholesaler';

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border ${targetColor}`}>
          {targetIcon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Wrong Portal</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Your account is registered as a{' '}
            <span className="font-semibold text-foreground">{portalLabel}</span>.
            This is the <span className="font-semibold text-foreground">{wrongLabel} Portal</span>.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href={targetHref}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
          >
            {targetIcon}
            Go to {targetPortal}
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

function EmailVerificationScreen({ accentClass = 'text-primary', borderClass = 'border-primary/30', bgClass = 'bg-primary/20' }: { accentClass?: string; borderClass?: string; bgClass?: string }) {
  const { user, signOut, sendVerificationEmail, reloadUser } = useAuth();
  const [, navigate] = useLocation();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'not-yet'>('idle');

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await sendVerificationEmail();
      setResendStatus('sent');
      setTimeout(() => setResendStatus('idle'), 4000);
    } catch {
      setResendStatus('error');
      setTimeout(() => setResendStatus('idle'), 3000);
    }
  };

  const handleContinue = async () => {
    setCheckStatus('checking');
    const verified = await reloadUser();
    if (!verified) {
      setCheckStatus('not-yet');
      setTimeout(() => setCheckStatus('idle'), 3000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${bgClass} border ${borderClass} mx-auto`}>
            <Mail size={30} className={accentClass} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-semibold text-foreground">{user?.email}</span>.
              <br />Open it to activate your account, then click <em>Continue</em>.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={handleContinue}
              disabled={checkStatus === 'checking'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm disabled:opacity-60"
            >
              {checkStatus === 'checking' ? (
                <><RefreshCw size={14} className="animate-spin" /> Checking…</>
              ) : (
                <><CheckCircle2 size={14} /> I've verified — Continue</>
              )}
            </button>

            {checkStatus === 'not-yet' && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 justify-center">
                <AlertCircle size={13} />
                Email not verified yet. Please click the link in your inbox first.
              </div>
            )}

            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending' || resendStatus === 'sent'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium py-2.5 px-4 transition-colors text-sm disabled:opacity-60"
            >
              {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? '✓ Email resent!' : 'Resend verification email'}
            </button>

            <button
              onClick={async () => { await signOut(); navigate('/'); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RetailerPortal() {
  const { user, loading, profileComplete } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (!user.emailVerified) return <EmailVerificationScreen />;

  if (profileComplete === false) return <CompleteProfileScreen role="retailer" />;

  if (user.role === 'wholesaler') {
    return (
      <WrongPortalScreen
        accountRole="wholesaler"
        targetPortal="Wholesaler Portal"
        targetHref="/wholesaler"
        targetIcon={<Building2 size={28} className="text-amber-400" />}
        targetColor="bg-amber-500/20 border-amber-500/30"
      />
    );
  }

  return <Vault />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/retailer" component={RetailerPortal} />
      <Route path="/wholesaler" component={WholesalerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
