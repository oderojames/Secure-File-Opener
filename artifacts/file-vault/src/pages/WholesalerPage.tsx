import { useLocation } from 'wouter';

export default function WholesalerPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">

      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary/20 border border-border mb-2">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--secondary-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Wholesaler Portal</h1>
          <p className="text-muted-foreground mt-2">Coming soon — this portal is under construction.</p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to home
        </button>
      </div>
    </div>
  );
}
