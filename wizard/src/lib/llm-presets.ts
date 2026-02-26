export interface LLMPreset {
  id: string;
  label: string;
  apiUrl: string;
  defaultModel: string;
}

export const LLM_PRESETS: readonly LLMPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  { id: 'custom', label: 'Custom', apiUrl: '', defaultModel: '' },
] as const;
