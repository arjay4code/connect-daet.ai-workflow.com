'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Dashboard header card: time-of-day greeting, title, and soft decorative
// circles drawn from the existing cream and accent tints.
export default function PageHero({
  eyebrow,
  title,
  description,
  icon = 'sparkles',
  actions,
  greet = true,
  className = 'mb-8 max-md:mb-5',
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  /** Show the time-of-day greeting (dashboards). Off for secondary pages. */
  greet?: boolean;
  /** Outer spacing; pass 'mb-0' inside containers that already space children. */
  className?: string;
}) {
  // Computed after mount so server and client render the same markup.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    if (!greet) return;
    const frame = requestAnimationFrame(() => setGreeting(greetingFor(new Date().getHours())));
    return () => cancelAnimationFrame(frame);
  }, [greet]);

  return (
    <header className={`ui-fade-up relative overflow-hidden rounded-3xl border border-warm-border bg-card px-7 py-7 max-md:rounded-2xl max-md:px-4 max-md:py-5 ${className}`}>
      <svg
        aria-hidden="true"
        className="ui-float pointer-events-none absolute -right-10 -top-16 h-64 w-64 max-md:-right-20 max-md:h-48 max-md:w-48"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="78" fill="none" className="stroke-clay-soft" strokeWidth="26" />
        <circle cx="100" cy="100" r="34" className="fill-promo-panel" />
        <circle cx="152" cy="40" r="7" className="fill-clay-border" />
      </svg>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-medium text-muted-text max-md:mb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-clay-soft text-clay">
              <Icon name={icon} size={14} />
            </span>
            {greeting && <span className="font-semibold uppercase tracking-[0.12em] text-clay">{greeting}</span>}
            {greeting && <span aria-hidden="true">·</span>}
            <span>{eyebrow}</span>
          </p>
          <h1 className="font-serif text-[32px] leading-tight text-warm-text max-md:text-[26px]">{title}</h1>
          {description && <div className="mt-2 text-xs text-muted-text">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-md:w-full">{actions}</div>}
      </div>
    </header>
  );
}
