import type { ReactNode } from 'react';
import AnimatedNumber from './AnimatedNumber';
import Icon, { type IconName } from './Icon';

export type StatTone = 'primary' | 'review' | 'pending' | 'approved' | 'rejected' | 'neutral';

const TONES: Record<StatTone, string> = {
  primary: 'bg-clay-soft text-clay',
  review: 'bg-review-bg text-review-text',
  pending: 'bg-pending-bg text-pending-text',
  approved: 'bg-approved-bg text-approved-text',
  rejected: 'bg-rejected-bg text-rejected-text',
  neutral: 'bg-sidebar text-muted-text',
};

// Dashboard total: icon tile in its status colour, count-up number, hover lift.
export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  loading = false,
  as: Tag = 'article',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: IconName;
  tone?: StatTone;
  loading?: boolean;
  as?: 'article' | 'section' | 'div';
}) {
  return (
    <Tag className="ui-lift group relative overflow-hidden rounded-2xl border border-warm-border bg-card p-5 max-md:p-3.5">
      {/* Soft decorative ring in the card's tone, drifts slightly on hover. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 transition-transform duration-500 group-hover:scale-110 ${TONES[tone]}`}
      />
      <div className="relative flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-text">{label}</h2>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105 ${TONES[tone]}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="relative mt-3 font-serif text-[34px] leading-none text-warm-text max-md:mt-2 max-md:text-[27px]">
        {loading ? <span className="ui-skeleton inline-block h-8 w-14 rounded-lg align-middle" /> : typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </p>
      {hint && <p className="relative mt-3 text-[11px] text-muted-text max-md:mt-1.5">{hint}</p>}
    </Tag>
  );
}
