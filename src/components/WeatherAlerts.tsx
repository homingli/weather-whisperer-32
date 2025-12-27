import { HKOWarning, getWarningIcon } from '@/lib/hko-weather';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface WeatherAlertsProps {
  warnings: HKOWarning[];
}

export function WeatherAlerts({ warnings }: WeatherAlertsProps) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const { language, t } = useLanguage();
  const locale = language === 'tc' ? zhTW : undefined;

  if (!warnings || warnings.length === 0) {
    return null;
  }

  const toggleItem = (key: string) => {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="font-semibold text-foreground">{t('alerts.title')}</h3>
      </div>
      
      <div className="space-y-2">
        {warnings.map((warning, index) => {
          const itemKey = warning.code + index;
          const hasDetails = warning.details?.contents && warning.details.contents.length > 0;
          const isOpen = openItems[itemKey];

          return (
            <Collapsible
              key={itemKey}
              open={isOpen}
              onOpenChange={() => hasDetails && toggleItem(itemKey)}
            >
              <CollapsibleTrigger
                className={`w-full text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!hasDetails}
              >
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 transition-colors ${
                    hasDetails ? 'hover:bg-destructive/15' : ''
                  }`}
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
                      {t('alerts.issued')}: {format(new Date(warning.issueTime), 'MMM d, h:mm a', { locale })}
                    </div>
                  </div>
                  {hasDetails && (
                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </div>
              </CollapsibleTrigger>
              
              {hasDetails && (
                <CollapsibleContent>
                  <div className="mt-1 ml-11 p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground space-y-2">
                    {warning.details!.contents!.map((content, i) => (
                      <p key={i}>{content}</p>
                    ))}
                  </div>
                </CollapsibleContent>
              )}
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
