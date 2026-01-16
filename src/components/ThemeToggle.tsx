import { Sun, Moon, SunMoon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

export function ThemeToggle() {
  const { mode, setMode, resolvedTheme } = useTheme();
  const { language } = useLanguage();

  const labels = {
    light: language === 'tc' ? '淺色模式' : 'Light',
    dark: language === 'tc' ? '深色模式' : 'Dark',
    auto: language === 'tc' ? '自動（日出/日落）' : 'Auto (Sunrise/Sunset)',
  };

  const getIcon = () => {
    if (mode === 'auto') {
      return <SunMoon className="h-5 w-5" />;
    }
    return resolvedTheme === 'dark' ? (
      <Moon className="h-5 w-5" />
    ) : (
      <Sun className="h-5 w-5" />
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {getIcon()}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background border-border">
        <DropdownMenuItem 
          onClick={() => setMode('light')}
          className={mode === 'light' ? 'bg-accent' : ''}
        >
          <Sun className="mr-2 h-4 w-4" />
          {labels.light}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setMode('dark')}
          className={mode === 'dark' ? 'bg-accent' : ''}
        >
          <Moon className="mr-2 h-4 w-4" />
          {labels.dark}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setMode('auto')}
          className={mode === 'auto' ? 'bg-accent' : ''}
        >
          <SunMoon className="mr-2 h-4 w-4" />
          {labels.auto}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
