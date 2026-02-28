'use client';

import { useState } from 'react';
import { StepLayout } from '@/components/StepLayout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { LLM_PRESETS } from '@/lib/llm-presets';
import { useTranslations } from '@/lib/i18n';
import type { StepProps } from '@/types/step-props';

interface TestResult {
  connected: boolean;
  model_response?: string;
  latency_ms?: number;
  error?: string;
}

export default function LLM({ onComplete, onBack, initialData }: StepProps) {
  const initial = initialData as
    | {
        provider?: string;
        api_url?: string;
        api_key?: string;
        model?: string;
        image_model?: string;
      }
    | undefined;
  const [provider, setProvider] = useState(initial?.provider ?? 'openrouter');
  const [apiUrl, setApiUrl] = useState(initial?.api_url ?? LLM_PRESETS[0].apiUrl);
  const [apiKey, setApiKey] = useState(initial?.api_key ?? '');
  const [model, setModel] = useState(initial?.model ?? LLM_PRESETS[0].defaultModel);
  const [imageModel, setImageModel] = useState(
    initial?.image_model ?? LLM_PRESETS[0].defaultImageModel,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations();

  function handlePresetSelect(presetId: string) {
    setProvider(presetId);
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setApiUrl(preset.apiUrl);
      setModel(preset.defaultModel);
      setImageModel(preset.defaultImageModel);
    }
  }

  async function submitData() {
    const token = localStorage.getItem('setup_token');
    const res = await fetch('/api/setup/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider,
        api_url: apiUrl,
        api_key: apiKey,
        model,
        image_model: imageModel,
      }),
    });
    return res.json();
  }

  async function testConnection() {
    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const data = await submitData();

      if (!data.success) {
        setError(data.error);
        return;
      }

      if (data.data?.test_result) {
        setTestResult(data.data.test_result);
      }
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    try {
      const data = await submitData();

      if (!data.success) {
        setError(data.error);
        return;
      }

      if (data.data?.test_result) {
        setTestResult(data.data.test_result);
      }

      onComplete({ provider, api_url: apiUrl, api_key: '***', model, image_model: imageModel });
    } catch {
      setError(t.common.failedToSave);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <StepLayout
      title={t.steps.llm.title}
      description={t.steps.llm.description}
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
          <Label htmlFor="llm-provider">{t.steps.llm.provider}</Label>
          <Select value={provider} onValueChange={handlePresetSelect}>
            <SelectTrigger id="llm-provider" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LLM_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="llm-api-url">{t.steps.llm.apiUrl}</Label>
          <Input
            id="llm-api-url"
            className="mt-1"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div>
          <Label htmlFor="llm-api-key">{t.steps.llm.apiKey}</Label>
          <Input
            id="llm-api-key"
            className="mt-1"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div>
          <Label htmlFor="llm-model">{t.steps.llm.model}</Label>
          <Input
            id="llm-model"
            className="mt-1"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>

        <div>
          <Label htmlFor="llm-image-model">{t.steps.llm.imageModel}</Label>
          <Input
            id="llm-image-model"
            className="mt-1"
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            placeholder="dall-e-3"
          />
        </div>

        <Button variant="outline" onClick={testConnection} disabled={isTesting}>
          {isTesting && (
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              data-testid="test-spinner"
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
          {t.steps.llm.testConnection}
        </Button>

        {testResult && (
          <Alert variant={testResult.connected ? 'default' : 'destructive'}>
            <AlertDescription>
              {testResult.connected ? (
                <p>
                  <span className="font-bold text-green-600">{t.steps.llm.connected}</span>{' '}
                  {t.steps.llm.latency} {testResult.latency_ms}ms
                </p>
              ) : (
                <p>{testResult.error}</p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </StepLayout>
  );
}
