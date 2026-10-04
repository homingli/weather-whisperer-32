import { memo, useState } from 'react';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { PartyPopper } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { HolidayCountdown } from '@/lib/holidays/nextHoliday';

/**
 * HolidayBadge — the HK holiday countdown as a compact header control,
 * replacing the old static chip that rode at the end of the at-a-glance
 * strip. The badge shows only "{n}d" + an icon next to the clock (calendar
 * metadata belongs on the date line), and the holiday's name — the part
 * that needs room — moves into a details dialog, reusing the WeatherAlerts
 * icon-button → Dialog pattern.
 *
 * Same self-hiding contract as before: `undefined` (non-HK city, loading,
 * or fetch failure) renders nothing.
 *
 * Tap target: ~28 px tall (px-1.5 py-1 with negative margins, like the
 * strip's rain chip) — meets WCAG 2.5.8 AA (24 px) but not the alerts'
 * 2.5.5 AAA 44 px, which would inflate the slim date row the badge shares
 * with the clock.
 */
export const HolidayBadge = memo(({ holiday }: HolidayBadgeProps) => {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);

  if (!holiday) return null;

  const name = language === 'tc' ? holiday.holiday.nameTc : holiday.holiday.nameEn;
  const sentence = holiday.isToday
    ? formatString(t('glance.holidayToday'), name)
    : holiday.daysUntil === 1
      ? formatString(t('glance.holidayTomorrow'), name)
      : formatString(t('glance.holidayIn'), holiday.daysUntil, name);

  // Local-midnight parse: `holiday.date` is a plain `yyyy-MM-dd` calendar
  // date, so appending T00:00:00 keeps date-fns from shifting it a day via
  // a UTC parse on negative-offset timezones.
  const dateText = format(new Date(`${holiday.holiday.date}T00:00:00`), language === 'tc' ? 'yyyy年M月d日' : 'MMM d, yyyy', { locale: language === 'tc' ? zhTW : undefined });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('glance.holidayDetails')}
        aria-label={formatString(t('glance.holidayBadgeAria'), sentence)}
        className="inline-flex items-center gap-x-1 px-1.5 py-1 -mx-1.5 -my-1 rounded text-xs font-medium text-primary tabular-nums hover:bg-primary/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PartyPopper className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {holiday.isToday ? t('daily.today') : `${holiday.daysUntil}d`}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex items-start gap-3">
            <PartyPopper className="h-8 w-8 shrink-0 mt-0.5 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <div className="min-w-0">
              <DialogTitle className="font-semibold text-foreground">{name}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {dateText} · {t('glance.holidayRegion')}
              </DialogDescription>
            </div>
          </div>
          <p className="text-sm text-foreground/90">{sentence}</p>
        </DialogContent>
      </Dialog>
    </>
  );
});

HolidayBadge.displayName = 'HolidayBadge';

interface HolidayBadgeProps {
  /** Next HK holiday countdown. Undefined hides the badge. */
  holiday?: HolidayCountdown;
}
