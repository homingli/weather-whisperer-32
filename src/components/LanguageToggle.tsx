import { useLanguage, Language } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Check, Globe } from 'lucide-react';

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'tc', label: '繁體中文' },
];

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const currentLanguage = languages.find(l => l.value === language) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
          <Globe className="h-3 w-3" />
          <span className="text-xs">{currentLanguage.label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[120px]">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => setLanguage(l.value)}
            className="flex items-center justify-between gap-2"
          >
            <span className="font-medium">{l.label}</span>
            {language === l.value && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
