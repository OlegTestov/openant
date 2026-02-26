export interface StepDefinition {
  id: string;
  label: string;
  required: boolean;
}

export const STEPS: StepDefinition[] = [
  { id: 'welcome', label: 'Welcome', required: true },
  { id: 'domain', label: 'Domain', required: true },
  { id: 'llm', label: 'LLM', required: true },
  { id: 'blog', label: 'Blog', required: true },
  { id: 'social', label: 'Social', required: false },
  { id: 'review', label: 'Review', required: true },
  { id: 'deploy', label: 'Deploy', required: true },
];
