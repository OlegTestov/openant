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
    ghost_prefix?: string;
    nocodb_prefix?: string;
    n8n_prefix?: string;
    wizard_prefix?: string;
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
    default_link?: string;
    default_link_name?: string;
  };
  telegram?: {
    bot_token?: string;
    chat_id?: string;
  };
  social?: {
    make_webhook_url?: string;
    pinterest_enabled: boolean;
    threads_enabled: boolean;
    instagram_enabled?: boolean;
    linkedin_enabled?: boolean;
    board?: string;
    buffer_api_key?: string;
    buffer_pinterest_channel_id?: string;
    buffer_pinterest_board_id?: string;
    buffer_instagram_channel_id?: string;
    buffer_threads_channel_id?: string;
    buffer_linkedin_channel_id?: string;
    inro_api_key?: string;
    inro_keyword?: string;
    inro_tag_prefix?: string;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
