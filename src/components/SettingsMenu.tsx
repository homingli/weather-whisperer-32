import { Menu, Sun, Moon, SunMoon, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, Language } from '@/contexts/LanguageContext';

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'tc', label: '繁體中文' },
];

export function SettingsMenu() {
  const { mode, setMode, resolvedTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  const themeLabels = {
    light: language === 'tc' ? '淺色模式' : 'Light',
    dark: language === 'tc' ? '深色模式' : 'Dark',
    auto: language === 'tc' ? '自動' : 'Auto',
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {language === 'tc' ? '主題' : 'Theme'}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setMode('light')} className="gap-2">
          <Sun className="h-4 w-4" />
          {themeLabels.light}
          {mode === 'light' && <Check className="h-4 w-4 ml-auto text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMode('dark')} className="gap-2">
          <Moon className="h-4 w-4" />
          {themeLabels.dark}
          {mode === 'dark' && <Check className="h-4 w-4 ml-auto text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMode('auto')} className="gap-2">
          <SunMoon className="h-4 w-4" />
          {themeLabels.auto}
          {mode === 'auto' && <Check className="h-4 w-4 ml-auto text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {language === 'tc' ? '語言' : 'Language'}
        </DropdownMenuLabel>
        {languages.map((l) => (
          <DropdownMenuItem key={l.value} onClick={() => setLanguage(l.value)} className="gap-2">
            <Globe className="h-4 w-4" />
            {l.label}
            {language === l.value && <Check className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
