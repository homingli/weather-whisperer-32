import type { HKOWarning } from '@/lib/hko-types';
import { getWarningIcon, getWarningColor } from '@/lib/hko-weather';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useState, memo, useMemo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface WeatherAlertsProps {
  warnings: unknown[];
  /** Increments on each new-warning diff; replays the pulse animation on matching badges. */
  pulseTrigger?: number;
  /** Set of warning codes that were just added — only these badges should pulse. */
  pulseCodes?: Set<string>;
  /** When set, opens the modal with the matching warning pre-selected. */
  selectedWarningCode?: string | null;
  /** Called after the modal consumes the selectedWarningCode prop. */
  onConsumed?: () => void;
}

function getBorderClass(code: string): string {
  const color = getWarningColor(code);
  if (color === 'destructive') return 'border-l-red-500';
  if (color === 'warning') return 'border-l-yellow-500';
  return 'border-l-orange-500';
}

export const WeatherAlerts = memo(function WeatherAlerts({
  warnings,
  pulseTrigger,
  pulseCodes,
  selectedWarningCode,
  onConsumed,
}: WeatherAlertsProps) {
  const [selectedWarning, setSelectedWarning] = useState<HKOWarning | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  // Filter out cancelled warnings and sort by issue time (most recent first).
  // Cancellation is detected via actionCode === 'Cancel' — the canonical HKO
  // signal (see HKO warnsum schema). A previous detail-text regex
  // (`/cancelled|取消/i`) was removed because the TC3 bulletin's precautionary
  // text contains "outdoor activities be cancelled" / "取消所有戶外活動",
  // which falsely hid the active warning.
  const activeWarnings = useMemo(() => {
    return (warnings || [])
      .filter((w): w is HKOWarning => w.actionCode !== 'Cancel')
      .sort((a, b) => new Date(b.issueTime).getTime() - new Date(a.issueTime).getTime());
  }, [warnings]);

  // Pre-select warning when parent sets selectedWarningCode (e.g. toast action)
  useEffect(() => {
    if (!selectedWarningCode) return;
    const match = activeWarnings.find(w => w.code === selectedWarningCode);
    if (match) {
      setSelectedWarning(match);
      onConsumed?.();
    } else {
      // Code refers to a warning that's no longer active; still close out the prop
      onConsumed?.();
    }
  }, [selectedWarningCode, activeWarnings, onConsumed]);

  // Pulse animation trigger — replayed on every pulseTrigger change.
  useEffect(() => {
    if (pulseTrigger === undefined) return;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), 1500);
    return () => clearTimeout(timer);
  }, [pulseTrigger]);

  if (activeWarnings.length === 0) return null;

  return (
    <>
      <div className="flex items-stretch gap-1 self-stretch h-full">
        {activeWarnings.map((warning) => {
          const shouldPulse = pulsing && pulseCodes?.has(warning.code);
          return (
            <button
              key={warning.code}
              onClick={() => setSelectedWarning(warning)}
              className={cn(
                'min-h-[3rem] w-12 flex items-center justify-center rounded-md transition-colors hover:bg-red-500/10',
                shouldPulse && 'animate-warning-pulse',
              )}
              title={t(`warnings.${warning.code}`, warning.name)}
              aria-label={t(`warnings.${warning.code}`, warning.name)}
            >
              <img
                src={getWarningIcon(warning.code)}
                alt={warning.name}
                className="object-contain w-8 h-8 drop-shadow-sm"
              />
            </button>
          );
        })}
      </div>

      <Dialog open={!!selectedWarning} onOpenChange={(open) => { if (!open) setSelectedWarning(null); }}>
        {selectedWarning && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">{t(`warnings.${selectedWarning.code}`, selectedWarning.name)}</DialogTitle>
            <div className={`pl-4 -ml-6 border-l-4 ${getBorderClass(selectedWarning.code)}`}>
              <div className="flex items-start gap-3">
                <img
                  src={getWarningIcon(selectedWarning.code)}
                  alt={t(`warnings.${selectedWarning.code}`, selectedWarning.name)}
                  className="object-contain w-8 h-8 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">
                    {t(`warnings.${selectedWarning.code}`, selectedWarning.name)}
                    {selectedWarning.type && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({selectedWarning.type})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(selectedWarning.issueTime), language === 'tc' ? 'M月d日 HH:mm' : 'MMM d, h:mm a', { locale })}
                  </div>
                  {selectedWarning.details?.contents && selectedWarning.details.contents.length > 0 && (
                    <div className="mt-4 text-sm text-foreground/90 space-y-2 leading-relaxed">
                      {selectedWarning.details.contents.map((content, i) => (
                        <p key={i}>{content}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
});