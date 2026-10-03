/**
 * Feedback dialog (HML-44) — opened from the settings menu.
 *
 * Intake is a prefilled mailto: to the SUPPORT team's Linear intake
 * address (see src/lib/feedback.ts): the user picks a type, their email
 * app opens with subject + device diagnostics ready, and the email lands
 * in Linear triage as an issue. "Copy details" is the fallback for devices
 * with no mail handler — paste the diagnostics into any channel.
 *
 * No network handling here on purpose: mailto: composes locally and works
 * offline; the page itself sends nothing.
 */
import { useEffect, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFeedbackDraft, reportFeedbackEvent, type FeedbackType } from '@/lib/feedback';
import { logWarn } from '@/lib/log';
import { toast } from 'sonner';

const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'feature', 'question'];

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { language, t } = useLanguage();
  const [type, setType] = useState<FeedbackType>('bug');

  useEffect(() => {
    if (open) reportFeedbackEvent('feedback.open');
  }, [open]);

  const draft = buildFeedbackDraft(type, language);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(draft.diagnostics);
      reportFeedbackEvent('feedback.copy', type);
      toast.success(t('feedback.copied'));
    } catch (error) {
      logWarn('[feedback] clipboard write failed', error);
      toast.error(t('feedback.copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('feedback.title')}</DialogTitle>
          <DialogDescription>{t('feedback.description')}</DialogDescription>
        </DialogHeader>

        {/* Native radio inputs (fieldset/legend): arrow-key cycling and
            screen-reader semantics come free — the same a11y contract as
            the hand-rolled radiogroup pills in SettingsMenu, without
            duplicating their keyboard logic. Focus ring rides the card via
            has-focus-visible since the input itself is sr-only. */}
        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-sm font-medium text-foreground">{t('feedback.type')}</legend>
          <div className="grid gap-2">
            {FEEDBACK_TYPES.map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors has-checked:border-primary has-checked:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="feedback-type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="sr-only"
                />
                {t(`feedback.type.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11 flex-1">
            <a href={draft.href} onClick={() => reportFeedbackEvent('feedback.email', type)}>
              <Mail aria-hidden="true" />
              {t('feedback.send')}
            </a>
          </Button>
          <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={handleCopy}>
            <Copy aria-hidden="true" />
            {t('feedback.copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
