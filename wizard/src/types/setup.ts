export interface SetupState {
  currentStep: string;
  deployed: boolean;
  steps: Record<string, { completed: boolean }>;
  welcome?: {
    language: string;
  };
  domain?: {
    use_domain: boolean;
    domain?: string;
  };
  llm?: {
    provider: string;
    api_url: string;
    api_key: string;
    model: string;
    image_model?: string;
  };
  blog?: {
    title: string;
    description?: string;
    language: string;
    tone: string;
    publish_interval_minutes: number;
  };
  social?: {
    make_webhook_url?: string;
    pinterest_enabled: boolean;
    threads_enabled: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
