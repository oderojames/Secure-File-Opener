import { useState } from 'react';
import { Phone, X } from 'lucide-react';
import contactIcon from '@assets/image_1781984218822.png';

const SUPPORT_NUMBERS = ['0114458799', '0721628310'];

export default function ContactWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/10">
            <img src={contactIcon} alt="" className="w-5 h-5 object-contain dark:invert" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground leading-tight">Customer Support</p>
              <p className="text-[11px] text-muted-foreground">We're here to help with any issues or enquiries</p>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {SUPPORT_NUMBERS.map(num => (
              <a
                key={num}
                href={`tel:${num}`}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted transition-colors group"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary shrink-0">
                  <Phone size={16} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground tracking-wide">{num}</span>
                  <span className="text-[11px] text-muted-foreground group-hover:text-primary transition-colors">Tap to call</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close contact support' : 'Contact support'}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-lg shadow-black/30 ring-1 ring-black/5 hover:scale-105 transition-transform"
      >
        {open ? (
          <X size={22} className="text-foreground" />
        ) : (
          <img src={contactIcon} alt="Contact support" className="w-7 h-7 object-contain" />
        )}
      </button>
    </div>
  );
}
