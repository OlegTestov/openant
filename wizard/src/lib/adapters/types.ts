// ── Blog ──────────────────────────────────────────
export interface BlogAdapter {
  healthCheck(): Promise<boolean>;
  setup(config: BlogConfig): Promise<BlogSetupResult>;
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
}

export interface TableConfig {
  adminEmail: string;
  adminPassword?: string;
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
  blogLanguage: string;
  blogTone: string;
  makeWebhookUrl?: string;
  nocodbBaseId?: string;
  nocodbTableId?: string;
  ghostAdminApiKey?: string;
  ghostUrl?: string;
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
