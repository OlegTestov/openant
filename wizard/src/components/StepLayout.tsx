'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

interface StepLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  showBack?: boolean;
  showNext?: boolean;
}

export function StepLayout({
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel,
  nextDisabled,
  isLoading,
  showBack,
  showNext,
}: StepLayoutProps) {
  const t = useTranslations();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="text-2xl font-bold">{title}</h2>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}

      <Card className="mt-6 p-6">{children}</Card>

      <div className="mt-6 flex justify-between">
        {showBack !== false && onBack ? (
          <Button variant="ghost" onClick={onBack} aria-label={t.common.back}>
            {t.common.back}
          </Button>
        ) : (
          <div />
        )}
        {showNext !== false && onNext && (
          <Button
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            aria-busy={isLoading || undefined}
          >
            {isLoading && (
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                data-testid="spinner"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {nextLabel || t.common.next}
          </Button>
        )}
      </div>
    </div>
  );
}
