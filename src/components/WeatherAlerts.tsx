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
    <div className="animate-fade-in px-2">
      <div className="flex items-center gap-2 mb-3 px-1">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="font-semibold text-base text-foreground">{t('alerts.title')}</h3>
      </div>
      
      <div className="flex flex-col border border-border/20 rounded-lg bg-background/30 backdrop-blur-sm overflow-hidden">
        {warnings.map((warning, index) => {
          const itemKey = warning.code + index;
          const hasDetails = warning.details?.contents && warning.details.contents.length > 0;
          const isOpen = openItems[itemKey];

          return (
            <Collapsible
              key={itemKey}
              open={isOpen}
              onOpenChange={() => hasDetails && toggleItem(itemKey)}
              className="border-b border-border/20 last:border-0"
            >
              <CollapsibleTrigger
                className={`w-full text-left group ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!hasDetails}
              >
                <div
                  className={`flex items-center gap-3 py-2 px-3 transition-colors ${
                    hasDetails ? 'hover:bg-foreground/5' : ''
                  }`}
                >
                  <span className="text-xl shrink-0" role="img" aria-label={warning.name}>
                    {getWarningIcon(warning.code)}
                  </span>
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <div className="font-medium text-foreground text-sm truncate pr-2">
                      <span className="truncate">{warning.name}</span>
                      {warning.type && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground shrink-0">
                          ({warning.type})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(warning.issueTime), language === 'tc' ? 'M月d日 HH:mm' : 'MMM d, h:mm a', { locale })}
                      </span>
                      {hasDetails ? (
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      ) : (
                        <div className="w-4" />
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              {hasDetails && (
                <CollapsibleContent>
                  <div className="mb-3 mx-3 ml-11 p-3 rounded-md text-xs text-foreground/80 space-y-2 border-l-2 border-destructive/40 bg-foreground/5">
                    {warning.details!.contents!.map((content, i) => (
                      <p key={i} className="leading-relaxed">{content}</p>
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
