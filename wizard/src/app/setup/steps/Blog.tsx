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
import {
  clampHoursToMinutes,
  minutesToHoursForDisplay,
  MIN_HOURS,
  MAX_HOURS,
} from '@/lib/normalize-interval';
import type { StepProps } from '@/types/step-props';

const DEFAULT_HOURS = 6;

export default function Blog({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        title?: string;
        description?: string;
        language?: string;
        tone?: string;
        publish_interval_minutes?: number;
        default_link?: string;
        default_link_name?: string;
      }
    | undefined;

  const initialHours =
    typeof initial?.publish_interval_minutes === 'number'
      ? minutesToHoursForDisplay(initial.publish_interval_minutes)
      : DEFAULT_HOURS;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [language, setLanguage] = useState(initial?.language ?? 'en');
  const [tone, setTone] = useState(initial?.tone ?? 'professional');
  const [intervalHours, setIntervalHours] = useState<number>(initialHours);
  const [defaultLink, setDefaultLink] = useState(initial?.default_link ?? '');
  const [defaultLinkName, setDefaultLinkName] = useState(initial?.default_link_name ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  function handleIntervalBlur() {
    const normalizedHours = clampHoursToMinutes(intervalHours) / 60;
    if (normalizedHours !== intervalHours) {
      setIntervalHours(normalizedHours);
    }
  }

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    const publishIntervalMinutes = clampHoursToMinutes(intervalHours);

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
          default_link: defaultLink || undefined,
          default_link_name: defaultLinkName || undefined,
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
        default_link: defaultLink || undefined,
        default_link_name: defaultLinkName || undefined,
      });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  const previewHours = minutesToHoursForDisplay(clampHoursToMinutes(intervalHours));
  const displayInterval = `${previewHours} ${t.steps.blog.hours}`;

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
            maxLength={200}
            placeholder="A blog about..."
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{description.length}/200</p>
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
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="blog-interval"
              type="number"
              value={Number.isFinite(intervalHours) ? intervalHours : ''}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              onBlur={handleIntervalBlur}
              min={MIN_HOURS}
              max={MAX_HOURS}
              step={1}
              className="w-24"
              aria-describedby="blog-interval-hint"
              aria-required="true"
            />
            <span className="text-muted-foreground text-sm">{t.steps.blog.hoursShort}</span>
          </div>
        </div>

        <div>
          <Label htmlFor="default-link">{t.steps.blog.defaultLink}</Label>
          <Input
            id="default-link"
            className="mt-1"
            value={defaultLink}
            onChange={(e) => setDefaultLink(e.target.value)}
            placeholder="https://..."
            aria-describedby="default-link-hint"
          />
          <p id="default-link-hint" className="text-muted-foreground mt-1 text-xs">
            {t.steps.blog.defaultLinkHint}
          </p>
        </div>

        {defaultLink && (
          <div>
            <Label htmlFor="default-link-name">{t.steps.blog.defaultLinkName}</Label>
            <Input
              id="default-link-name"
              className="mt-1"
              value={defaultLinkName}
              onChange={(e) => setDefaultLinkName(e.target.value)}
              maxLength={200}
              placeholder={t.steps.blog.defaultLinkNamePlaceholder}
              aria-describedby="default-link-name-hint"
            />
            <p id="default-link-name-hint" className="text-muted-foreground mt-1 text-xs">
              {t.steps.blog.defaultLinkNameHint}
            </p>
            <p className="text-muted-foreground mt-1 whitespace-pre-line text-xs">
              {t.steps.blog.defaultLinkNameExamples}
            </p>
          </div>
        )}

        <Card className="bg-muted mt-4 p-4">
          <h3 className="text-lg font-bold">{title || 'Your Blog Title'}</h3>
          <p className="text-muted-foreground text-sm">{description || 'Blog description'}</p>
          <p className="mt-2 text-xs">Publishing every {displayInterval}</p>
        </Card>
      </div>
    </StepLayout>
  );
}
