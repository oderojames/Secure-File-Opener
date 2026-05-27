import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerAuthPage from '@/pages/WholesalerAuthPage';
import { Building2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

function WholesalerDashboard() {
  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">

      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Building2 size={16} className="text-amber-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Doyang</span>
            <span className="text-xs text-muted-foreground ml-2">Wholesaler Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground hover:text-foreground">
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main content placeholder */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

        <div className="relative z-10 text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 mb-6">
            <Building2 size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-muted-foreground text-sm">
            Your wholesaler dashboard is being set up. More features are coming soon.
          </p>
        </div>
      </main>
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
