'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

export default function Blog({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        title?: string;
        description?: string;
        language?: string;
        tone?: string;
        publish_interval_minutes?: number;
      }
    | undefined;
  const savedMinutes = initial?.publish_interval_minutes;
  const defaultUnit =
    savedMinutes && savedMinutes >= 60 && savedMinutes % 60 === 0 ? 'hours' : 'minutes';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [language, setLanguage] = useState(initial?.language ?? 'en');
  const [tone, setTone] = useState(initial?.tone ?? 'professional');
  const [interval, setInterval] = useState(
    savedMinutes ? (defaultUnit === 'hours' ? savedMinutes / 60 : savedMinutes) : 60,
  );
  const [unit, setUnit] = useState<'minutes' | 'hours'>(defaultUnit);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    const publishIntervalMinutes = unit === 'hours' ? interval * 60 : interval;

    try {
      const token = localStorage.getItem('setup_token');
      const res = await fetch('/api/setup/blog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description: description || undefined,
          language,
          tone,
          publish_interval_minutes: publishIntervalMinutes,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      onComplete({
        title,
        description: description || undefined,
        language,
        tone,
        publish_interval_minutes: publishIntervalMinutes,
      });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  const displayInterval =
    unit === 'hours'
      ? `${interval} hour${interval !== 1 ? 's' : ''}`
      : `${interval} minute${interval !== 1 ? 's' : ''}`;

  return (
    <StepLayout
      title={t.steps.blog.title}
      description={t.steps.blog.description}
      onNext={handleSubmit}
      onBack={onBack}
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div>
          <Label htmlFor="blog-title">{t.steps.blog.blogTitle} *</Label>
          <Input
            id="blog-title"
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="My Awesome Blog"
            aria-required="true"
          />
        </div>

        <div>
          <Label htmlFor="blog-description">{t.steps.blog.blogDescription}</Label>
          <Textarea
            id="blog-description"
            className="mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A blog about..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-language">{t.steps.blog.articleLanguage} *</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="blog-language" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="blog-tone">{t.steps.blog.writingTone} *</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger id="blog-tone" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="blog-interval">{t.steps.blog.publishInterval} *</Label>
          <p id="blog-interval-hint" className="text-muted-foreground text-sm">
            {t.steps.blog.publishIntervalHint}
          </p>
          <div className="mt-1 flex gap-2">
            <Input
              id="blog-interval"
              type="number"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              min={1}
              className="w-24"
              aria-describedby="blog-interval-hint"
              aria-required="true"
            />
            <Select value={unit} onValueChange={(v) => setUnit(v as 'minutes' | 'hours')}>
              <SelectTrigger className="w-32" aria-label={unit}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">{t.steps.blog.minutes}</SelectItem>
                <SelectItem value="hours">{t.steps.blog.hours}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-muted mt-4 p-4">
          <h3 className="text-lg font-bold">{title || 'Your Blog Title'}</h3>
          <p className="text-muted-foreground text-sm">{description || 'Blog description'}</p>
          <p className="mt-2 text-xs">Publishing every {displayInterval}</p>
        </Card>
      </div>
    </StepLayout>
  );
}
