import { HKOWarning, getWarningIcon } from '@/lib/hko-weather';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface WeatherAlertsProps {
  warnings: HKOWarning[];
}

export function WeatherAlerts({ warnings }: WeatherAlertsProps) {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="font-semibold text-foreground">Weather Alerts</h3>
      </div>
      
      <div className="space-y-2">
        {warnings.map((warning, index) => (
          <div
            key={warning.code + index}
            className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <span className="text-2xl" role="img" aria-label={warning.name}>
              {getWarningIcon(warning.code)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">
                {warning.name}
                {warning.type && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({warning.type})
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Issued: {format(new Date(warning.issueTime), 'MMM d, h:mm a')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
