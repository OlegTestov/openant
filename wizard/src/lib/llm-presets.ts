export interface LLMPreset {
  id: string;
  label: string;
  apiUrl: string;
  defaultModel: string;
  defaultImageModel: string;
}

export const LLM_PRESETS: readonly LLMPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash-preview',
    defaultImageModel: 'google/gemini-2.0-flash-exp:free',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultImageModel: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    defaultImageModel: 'deepseek-chat',
  },
  { id: 'custom', label: 'Custom', apiUrl: '', defaultModel: '', defaultImageModel: '' },
] as const;
