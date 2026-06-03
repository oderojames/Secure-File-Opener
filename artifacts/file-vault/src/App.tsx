import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Vault from "@/pages/Vault";
import AuthPage from "@/pages/AuthPage";
import HomePage from "@/pages/HomePage";
import WholesalerPage from "@/pages/WholesalerPage";
import NotFound from "@/pages/not-found";
import { Building2, ShieldCheck } from "lucide-react";

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

function RetailerPortal() {
  const { user, loading } = useAuth();

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
