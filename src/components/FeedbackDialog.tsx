/**
 * Feedback dialog (HML-44) — opened from the settings menu.
 *
 * Submits in-app: the message POSTs to the /api/feedback Vercel function,
 * which files it as an issue in the SUPPORT team's Linear triage (see
 * src/lib/feedback.ts). Send is gated on connectivity — offline users get
 * a hint, and "Copy details" stays available as the universal fallback.
 *
 * A hidden `website` honeypot field rides along: bots that autofill it are
 * silently dropped server-side.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  collectFeedbackDiagnostics,
} from '@/lib/feedback-diagnostics';
import {
  FEEDBACK_MAX_MESSAGE_LENGTH,
  reportFeedbackEvent,
  submitFeedback,
  type FeedbackType,
} from '@/lib/feedback';
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
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const websiteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) reportFeedbackEvent('feedback.open');
  }, [open]);

  // Browser connectivity gates Send (the function can't be reached
  // offline); Copy details stays usable as the fallback either way.
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const trimmedMessage = message.trim();
  const canSend = isOnline && !isSending && trimmedMessage.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    setIsSending(true);
    try {
      await submitFeedback({
        type,
        message: trimmedMessage,
        language,
        website: websiteRef.current?.value ?? '',
      });
    } catch (error) {
      logWarn('[feedback] submit failed', error);
      toast.error(t('feedback.sendFailed'));
      return;
    } finally {
      setIsSending(false);
    }
    reportFeedbackEvent('feedback.send', type);
    toast.success(t('feedback.sent'));
    setMessage('');
    onOpenChange(false);
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(collectFeedbackDiagnostics(language));
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

        <form onSubmit={handleSubmit} className="grid gap-4">
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

          <div className="grid gap-2">
            <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
              {t('feedback.message')}
            </label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback.placeholder')}
              maxLength={FEEDBACK_MAX_MESSAGE_LENGTH}
              rows={4}
              required
            />
          </div>

          {/* Honeypot — visually hidden and out of the tab order; bots that
              autofill by field name are dropped server-side. The value rides
              to the API via websiteRef (submitFeedback). */}
          <input
            ref={websiteRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          {!isOnline && (
            <p role="status" className="text-sm text-destructive">
              {t('feedback.offlineHint')}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-11 flex-1" disabled={!canSend}>
              <Send aria-hidden="true" />
              {t('feedback.send')}
            </Button>
            <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={handleCopy}>
              <Copy aria-hidden="true" />
              {t('feedback.copy')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
