import type { HKOWarning } from '@/lib/hko-types';
import { getWarningIcon, getWarningColor } from '@/lib/hko-weather';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useState, memo, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface WeatherAlertsProps {
  warnings: HKOWarning[];
}

function getBorderClass(code: string): string {
  const color = getWarningColor(code);
  if (color === 'destructive') return 'border-l-red-500';
  if (color === 'warning') return 'border-l-yellow-500';
  return 'border-l-orange-500';
}

export const WeatherAlerts = memo(function WeatherAlerts({ warnings }: WeatherAlertsProps) {
  const [selectedWarning, setSelectedWarning] = useState<HKOWarning | null>(null);
  const { language } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  // Filter out cancelled warnings and sort by issue time (most recent first)
  const activeWarnings = useMemo(() => {
    return (warnings || [])
      .filter(w => {
        if (w.actionCode === 'Cancel') return false;
        // Hide warnings whose detail text explicitly says cancelled
        if (w.details?.contents?.some(c => /cancelled|取消/i.test(c))) return false;
        return true;
      })
      .sort((a, b) => new Date(b.issueTime).getTime() - new Date(a.issueTime).getTime());
  }, [warnings]);

  if (activeWarnings.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1">
        {activeWarnings.map((warning, index) => (
          <button
            key={warning.code + index}
            onClick={() => setSelectedWarning(warning)}
            className="h-9 w-9 flex items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
            title={warning.name}
          >
            <img
              src={getWarningIcon(warning.code)}
              alt={warning.name}
              className="object-contain w-7 h-7 drop-shadow-sm"
            />
          </button>
        ))}
      </div>

      <Dialog open={!!selectedWarning} onOpenChange={(open) => { if (!open) setSelectedWarning(null); }}>
        {selectedWarning && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">{selectedWarning.name}</DialogTitle>
            <div className={`pl-4 -ml-6 border-l-4 ${getBorderClass(selectedWarning.code)}`}>
              <div className="flex items-start gap-3">
                <img
                  src={getWarningIcon(selectedWarning.code)}
                  alt={selectedWarning.name}
                  className="object-contain w-8 h-8 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">
                    {selectedWarning.name}
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
