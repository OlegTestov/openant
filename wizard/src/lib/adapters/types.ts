// ── Blog ──────────────────────────────────────────
export interface BlogAdapter {
  healthCheck(): Promise<boolean>;
  setup(config: BlogConfig): Promise<BlogSetupResult>;
  uploadTheme(themePath: string): Promise<void>;
  publishPost(post: PostData): Promise<PublishedPost>;
  getPostUrl(postId: string): Promise<string>;
}

export interface BlogConfig {
  title: string;
  description: string;
  language: string;
  url: string;
  adminEmail: string;
}

export interface PostData {
  title: string;
  html: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  featureImage?: string;
}

export interface PublishedPost {
  id: string;
  url: string;
  slug: string;
}

export interface BlogSetupResult {
  adminApiKey: string;
  contentApiKey: string;
}

// ── Table ─────────────────────────────────────────
export interface TableAdapter {
  healthCheck(): Promise<boolean>;
  setup(config: TableConfig): Promise<TableSetupResult>;
  getNextQueued(): Promise<ArticleRow | null>;
  updateStatus(rowId: string, status: ArticleStatus, extra?: Partial<ArticleRow>): Promise<void>;
  getStats(): Promise<Record<ArticleStatus, number>>;
  listArticles(): Promise<ArticleRow[]>;
  createArticle(input: ArticleCreateInput): Promise<ArticleRow>;
  createArticlesBulk(inputs: ArticleCreateInput[]): Promise<ArticleRow[]>;
  updateArticle(rowId: string, input: ArticleUpdateInput): Promise<void>;
  deleteArticle(rowId: string): Promise<void>;
  getPrompts(): Promise<PromptRow | null>;
  updatePrompts(prompts: Partial<Omit<PromptRow, 'id'>>): Promise<void>;
}

export interface TableConfig {
  adminEmail: string;
  adminPassword?: string;
  blogLanguage?: string;
  blogTone?: string;
}

export interface TableSetupResult {
  authToken: string;
  projectId: string;
  tableId: string;
  promptsTableId: string;
}

export interface ArticleRow {
  id: string;
  topic: string;
  description?: string;
  link?: string;
  status: ArticleStatus;
  ghostUrl?: string;
  pinUrl?: string;
  error?: string;
  createdAt: string;
}

export type ArticleStatus =
  | 'queue'
  | 'generating'
  | 'publishing'
  | 'published'
  | 'promoting'
  | 'completed'
  | 'error';

export interface ArticleCreateInput {
  topic: string;
  description?: string;
  link?: string;
}

export interface ArticleUpdateInput {
  topic?: string;
  description?: string;
  link?: string;
}

export interface PromptRow {
  id: string;
  articleTitle: string;
  articleText: string;
  articleImage: string;
  pinName: string;
  pinText: string;
  pinImage: string;
  threadText: string;
}

// ── Automation ────────────────────────────────────
export interface AutomationAdapter {
  healthCheck(): Promise<boolean>;
  setup(config: AutomationConfig): Promise<AutomationSetupResult>;
  createCredential(cred: CredentialData): Promise<string>;
  importWorkflow(template: object, params: WorkflowParams): Promise<string>;
  activateWorkflow(workflowId: string): Promise<void>;
}

export interface AutomationConfig {
  adminEmail: string;
}

export interface AutomationSetupResult {
  apiKey: string;
}

export interface CredentialData {
  name: string;
  type: string;
  data: Record<string, string>;
}

export interface WorkflowParams {
  credentialIds: Record<string, string>;
  scheduleIntervalMinutes: number;
  llmModel: string;
  llmApiUrl?: string;
  llmApiKey?: string;
  llmImageModel?: string;
  blogLanguage: string;
  blogTone: string;
  makeWebhookUrl?: string;
  pinterestBoard?: string;
  nocodbBaseId?: string;
  nocodbTableId?: string;
  nocodbPromptsTableId?: string;
  ghostAdminApiKey?: string;
  ghostUrl?: string;
  ghostInternalUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  nocodbAuthToken?: string;
}

// ── Distribution ──────────────────────────────────
export interface DistributionAdapter {
  readonly channelName: string;
  healthCheck(): Promise<boolean>;
  send(content: DistributionContent): Promise<DistributionResult>;
}

export interface DistributionContent {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
}

export interface DistributionResult {
  success: boolean;
  externalUrl?: string;
  error?: string;
}
