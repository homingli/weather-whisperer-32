import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/contexts/LanguageContext';
import NotFound from './NotFound';

function render404() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <NotFound />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('NotFound page (WCAG 2.4.4 / 2.4.6 / 3.1.1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the localized 404 heading', () => {
    render404();
    expect(screen.getByRole('heading', { level: 1, name: '404' })).toBeInTheDocument();
  });

  it('renders the localized page-not-found message', () => {
    render404();
    expect(screen.getByText('Oops! Page not found')).toBeInTheDocument();
  });

  it('renders the localized return-home link', () => {
    render404();
    const link = screen.getByRole('link', { name: 'Return to Home' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('moves focus to the heading on mount so screen readers announce the 404', () => {
    render404();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveFocus();
  });

  it('uses focus-visible:outline-none so mouse focus does not show a ring (WCAG 2.4.7)', () => {
    render404();
    const heading = screen.getByRole('heading', { level: 1 });
    // focus-visible:outline-none class is present (Tailwind emits the class;
    // we just verify the class string is on the element so the focus ring
    // does not appear for mouse users while staying intact for keyboard).
    expect(heading.className).toContain('focus-visible:outline-none');
    expect(heading.className).not.toContain('focus:outline-none ');
  });
});

describe('NotFound page in Chinese', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('weather-language', 'tc');
  });

  it('renders the localized Chinese heading, message, and link', () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <NotFound />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '404' })).toBeInTheDocument();
    expect(screen.getByText('抱歉，找不到此頁面')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首頁' })).toBeInTheDocument();
  });
});
