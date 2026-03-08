import crypto from 'crypto';
import type {
  TableAdapter,
  TableConfig,
  TableSetupResult,
  ArticleRow,
  ArticleStatus,
  ArticleCreateInput,
  ArticleUpdateInput,
  PromptRow,
} from './types';
import { AdapterError } from '@/lib/errors';

const ALL_STATUSES: ArticleStatus[] = [
  'generating',
  'publishing',
  'published',
  'promoting',
  'completed',
  'error',
];

function getNocoDbUrl(): string {
  return process.env.NOCODB_INTERNAL_URL || 'http://nocodb:8080';
}

function getEnvOrThrow(name: string, operation: string): string {
  const value = process.env[name];
  if (!value) throw new AdapterError('nocodb', operation, `${name} not set`);
  return value;
}

async function nocoFetch(
  url: string,
  authToken: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'xc-auth': authToken,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

async function createBase(baseUrl: string, authToken: string): Promise<string> {
  const res = await nocoFetch(`${baseUrl}/api/v2/meta/bases/`, authToken, {
    method: 'POST',
    body: JSON.stringify({ title: 'openant' }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new AdapterError('nocodb', 'setup', `Failed to create base: ${res.status} ${error}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function createArticlesTable(
  baseUrl: string,
  authToken: string,
  baseId: string,
): Promise<string> {
  const tableRes = await nocoFetch(`${baseUrl}/api/v2/meta/bases/${baseId}/tables/`, authToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Articles',
      columns: [
        { title: 'Id', column_name: 'id', uidt: 'ID', dt: 'int4', pk: true, ai: true, rqd: true },
        { title: 'Topic', uidt: 'SingleLineText', pv: true },
        { title: 'Description', uidt: 'LongText' },
        { title: 'Link', uidt: 'URL' },
      ],
    }),
  });
  if (!tableRes.ok) {
    const error = await tableRes.text();
    throw new AdapterError(
      'nocodb',
      'setup',
      `Failed to create table: ${tableRes.status} ${error}`,
    );
  }

  const tableData = (await tableRes.json()) as { id: string };
  const tableId = tableData.id;

  // Create additional columns
  const additionalColumns = [
    {
      title: 'Status',
      uidt: 'SingleSelect',
      colOptions: {
        options: ALL_STATUSES.map((s) => ({ title: s })),
      },
    },
    { title: 'GhostURL', uidt: 'URL' },
    { title: 'PinURL', uidt: 'URL' },
    { title: 'Error', uidt: 'LongText' },
  ];

  for (const col of additionalColumns) {
    const colRes = await nocoFetch(`${baseUrl}/api/v2/meta/tables/${tableId}/columns/`, authToken, {
      method: 'POST',
      body: JSON.stringify(col),
    });
    if (!colRes.ok) {
      const error = await colRes.text();
      throw new AdapterError(
        'nocodb',
        'setup',
        `Failed to create column "${col.title}": ${colRes.status} ${error}`,
      );
    }
  }

  return tableId;
}

const DEFAULT_PROMPTS: Record<string, string> = {
  ArticleTitle: [
    '# ROLE',
    'You are a professional SEO headline copywriter. Your goal is to create one powerful, click-worthy article title.',
    '',
    '# LANGUAGE & TONE',
    'Write in {language}. Use a {tone} tone.',
    '',
    '# INSTRUCTIONS',
    'You will receive a Topic and an optional Description. Create exactly ONE title.',
    '',
    '# CRITICAL RULES',
    '1. LENGTH: Strictly 50–70 characters (including spaces). If it is longer — shorten it, remove filler words, tighten the phrasing.',
    '2. OUTPUT: Only the title text. No quotes, no introductory words, no period at the end.',
    '3. SEO: Place the primary keyword as close to the beginning as possible. Use power words (proven, essential, ultimate, secret, mistake) to boost CTR.',
    '4. STRUCTURE: Use one of these proven formats:',
    '   - "Number + Keyword + Benefit" (e.g., "7 Proven Ways to Boost Your Morning Productivity")',
    '   - "How to + Keyword + Outcome" (e.g., "How to Save Money on Groceries Without Coupons")',
    '   - "Keyword: Promise" (e.g., "Remote Work: The Complete Guide to Staying Productive")',
    '5. GRAMMAR: Correct grammar in {language}. Title case for English; sentence case for other languages.',
    '6. AVOID: Clickbait without substance, ALL CAPS, excessive punctuation, vague promises.',
  ].join('\n'),

  ArticleText: [
    '# ROLE',
    'You are an expert content writer and SEO specialist. You create in-depth, authoritative articles that rank well in search engines and genuinely help readers.',
    '',
    '# LANGUAGE & TONE',
    'Write in {language}. Use a {tone} tone throughout. Write as a knowledgeable practitioner sharing real insights — not as a generic content mill.',
    '',
    '# INPUT',
    'You will receive a Topic, an optional Description with details, and a Link to include naturally in the text.',
    '',
    '# FORMAT RULES',
    '1. OUTPUT: Return only HTML content. EVERY text paragraph MUST be wrapped in <p></p> tags — no bare text outside of tags. Use <h2> for section headings, <p> for paragraphs, <ul>/<li> for lists, <a> for links, <strong> for emphasis. No <html>, <head>, <body>, or <h1> tags.',
    '2. LENGTH: 800–1200 words minimum. Include at least 3 bulleted or numbered lists with concrete, actionable items.',
    '3. STRUCTURE:',
    '   - Hook (first 2–3 sentences): Start by acknowledging a common pain point or desire the reader likely has. Create intrigue — hint at a key insight revealed later.',
    '   - Body: 3–5 sections with <h2> subheadings. Each section delivers specific, fact-based value. Use concrete numbers, examples, and comparisons rather than vague statements.',
    '   - Transitions: Use natural bridging phrases between sections ("Here is the thing:", "But there is a catch:", "What most people miss:") to maintain reading flow.',
    '   - CTA Integration: Weave the provided Link naturally into the text as a resource, a deeper dive, or a next step. Do not force it.',
    '   - Conclusion: Paint a picture of the positive outcome the reader can achieve. Summarize the 2–3 most impactful takeaways.',
    '4. SEO: Use the primary keyword from the Topic in the first <h2>, in the first 100 words, and 2–3 more times naturally throughout. Use related terms and synonyms.',
    '5. QUALITY: Every paragraph must add value. No filler sentences, no "In today\'s fast-paced world" openers, no generic platitudes. Prefer specifics over generalities.',
    '6. AVOID: Mentioning that you are an AI. Using "In conclusion" literally. Repeating the same point in different words. Walls of text without lists or subheadings.',
  ].join('\n'),

  ArticleImage: [
    '# ROLE',
    'You are a professional illustrator creating blog cover images.',
    '',
    '# TASK',
    'Create a square blog cover image based on the provided Topic and Description.',
    '',
    '# IMAGE REQUIREMENTS',
    '1. FORMAT: Square 1:1.',
    '2. STYLE: Clean, modern, minimalist infographic. NOT a photograph. Use simplified icons, diagrams, structured blocks, and visual metaphors.',
    '3. COMPOSITION:',
    '   - Title area at the top or center with the topic text in large, bold sans-serif font.',
    '   - Below: 3–5 visual blocks/cards/icons representing key aspects of the topic, each with a short 1–4 word label.',
    '   - Leave whitespace — do not overcrowd.',
    '4. COLORS: Light neutral background (white, light gray, soft gradient). Primary elements in professional tones (navy, charcoal, teal). One accent color for highlights.',
    '5. TEXT ON IMAGE: All visible text MUST be in {language}. Large readable title from the Topic. Short labels for blocks.',
    '6. DO NOT include: logos, watermarks, branding, realistic photos of people, cluttered decorations, long text paragraphs.',
    '',
    '# OUTPUT',
    'Generate the image directly. Do not describe it — create it.',
  ].join('\n'),

  PinName: [
    '# ROLE',
    'You are a professional Pinterest copywriter. Your goal is to create one click-worthy pin title that will not be truncated in the feed.',
    '',
    '# LANGUAGE',
    'Write in {language}.',
    '',
    '# INSTRUCTIONS',
    'You will receive a Topic. Create exactly ONE pin title.',
    '',
    '# CRITICAL RULES',
    '1. LENGTH (PRIORITY #1): Strictly under 95 characters (including spaces and any hooks). This is a hard technical limit. If it is longer — shorten words, remove extra adjectives, tighten the phrase.',
    '2. OUTPUT: Only the title text. No quotes, no introductory words, no period at the end.',
    '3. SEO: Place the primary keyword within the first 3–5 words. Pinterest search is keyword-driven — front-load the most important terms.',
    '4. HOOKS: Add a short contextual tag in square brackets at the end when it enhances clarity: [Guide], [Tips], [Ideas], [Checklist], [Step-by-Step].',
    '5. STRUCTURE: Use proven formats:',
    '   - "Keyword: Number + Promise [Tag]" (e.g., "Budget Meals: 10 Recipes Under $5 [Meal Prep]")',
    '   - "Number + Keyword + Benefit" (e.g., "7 Small Bathroom Storage Ideas That Actually Work")',
    '   - "How to + Keyword + Outcome [Tag]" (e.g., "How to Organize Your Closet in One Weekend [Guide]")',
    '6. AVOID: Generic words without specifics, clickbait without substance, questions as titles.',
  ].join('\n'),

  PinText: [
    '# ROLE',
    'You are an expert in Pinterest user psychology and emotional copywriting. You understand not just the "topic" but the hidden fears, desires, and aspirations of the person searching for it.',
    '',
    '# LANGUAGE',
    'Write in {language}.',
    '',
    '# INSTRUCTIONS',
    'You will receive a Topic. Create exactly ONE pin description.',
    '',
    '# CRITICAL RULES',
    '1. LENGTH (PRIORITY #1): Strictly under 245 characters (including spaces). This is a hard technical limit.',
    '2. OUTPUT: Only the description text. No quotes, no labels, no introductory words.',
    '3. PSYCHOLOGY: Before writing, mentally answer: "What is this person afraid of?" or "What do they secretly dream about?". Use that in the first sentence. Write about feelings, safety, freedom, pride, relief — not dry facts.',
    '4. GRAMMAR: Natural, conversational {language}. As if a trusted friend is giving advice. No corporate speak, no robotic phrases.',
    '5. CTA (Call to Action):',
    '   - FORBIDDEN words: "article", "video", "blog", "post", "pdf", "channel", "website".',
    '   - USE universal action phrases: "Discover the full solution", "See how it works", "Get the complete idea", "Find out the details".',
    '6. FLOW: Pain/desire hook → Brief value promise → CTA. Three beats in under 245 characters.',
    '7. KEYWORDS: Naturally include 2–3 relevant search terms that Pinterest users would type.',
  ].join('\n'),

  PinImage: [
    '# ROLE',
    'You are a professional illustrator creating Pinterest pin images.',
    '',
    '# TASK',
    'Create a vertical Pinterest pin image based on the provided Topic and Description.',
    '',
    '# IMAGE REQUIREMENTS',
    '1. FORMAT: Vertical 2:3.',
    '2. STYLE: Always an infographic or technical visual, NOT a photograph. Allowed elements: simplified diagrams, icons, arrows, scales; structured blocks with numbers, bullets, cards; light conceptual 3D elements but NOT photorealism.',
    '3. COMPOSITION:',
    '   - Top area: large title based on Topic in bold sans-serif font in {language}, readable even as a small thumbnail.',
    '   - Middle: 3–7 blocks/cards/icons, each representing one key point from the Description. Each block gets a short 1–4 word label in {language}.',
    '   - Bottom-left: small rounded CTA banner with contextual word in white bold font on dark background.',
    '   - Leave breathing room — title not pressed to edges, blocks not cramped.',
    '4. COLORS: Light neutral background (white, light gray, soft gradient). Primary elements in professional grays. One accent color (blue, teal, or warm orange) for highlights and the CTA banner. High contrast for feed readability.',
    '5. TEXT ON IMAGE: All visible text MUST be in {language}. Never copy long sentences — the pin is a compressed summary.',
    '6. DO NOT include: logos, watermarks, branding, realistic photos of people, visual clutter, long text paragraphs.',
    '',
    '# OUTPUT',
    'Generate the image directly. Do not describe it — create it.',
  ].join('\n'),

  ThreadText: [
    '# ROLE',
    'You are a social media content creator who writes engaging, shareable posts that drive traffic to full articles.',
    '',
    '# LANGUAGE & TONE',
    'Write in {language}. Use a {tone} tone.',
    '',
    '# INSTRUCTIONS',
    'You will receive a Topic, an optional Description, and a Link to the full article.',
    '',
    '# RULES',
    '1. LENGTH: 1–2 short paragraphs. Maximum 280 characters for the first paragraph (hook), up to 500 characters total.',
    '2. STRUCTURE:',
    '   - Hook: Start with a bold claim, surprising fact, or relatable pain point that stops the scroll.',
    '   - Value tease: Hint at what the reader will learn — but do not give away everything.',
    '   - CTA: End with a clear call to action pointing to the Link. Use action verbs: "Read the full breakdown", "See the complete guide", "Get all the details".',
    '3. OUTPUT: Only the post text with the Link naturally integrated. No hashtags unless explicitly relevant. No emojis unless the tone calls for casual or playful.',
    '4. AVOID: Generic "Check out my new article!" openers. Sounding promotional or salesy. Repeating the article title word-for-word.',
  ].join('\n'),
};

async function createPromptsTable(
  baseUrl: string,
  authToken: string,
  baseId: string,
  language?: string,
  tone?: string,
): Promise<string> {
  const tableRes = await nocoFetch(`${baseUrl}/api/v2/meta/bases/${baseId}/tables/`, authToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Prompts',
      columns: [
        { title: 'Id', column_name: 'id', uidt: 'ID', dt: 'int4', pk: true, ai: true, rqd: true },
        { title: 'ArticleTitle', uidt: 'LongText', pv: true },
        { title: 'ArticleText', uidt: 'LongText' },
        { title: 'ArticleImage', uidt: 'LongText' },
      ],
    }),
  });
  if (!tableRes.ok) {
    const error = await tableRes.text();
    throw new AdapterError(
      'nocodb',
      'setup',
      `Failed to create Prompts table: ${tableRes.status} ${error}`,
    );
  }

  const tableData = (await tableRes.json()) as { id: string };
  const promptsTableId = tableData.id;

  // Create remaining columns (NocoDB limits columns at table creation)
  const additionalColumns = [
    { title: 'PinName', uidt: 'LongText' },
    { title: 'PinText', uidt: 'LongText' },
    { title: 'PinImage', uidt: 'LongText' },
    { title: 'ThreadText', uidt: 'LongText' },
  ];

  for (const col of additionalColumns) {
    const colRes = await nocoFetch(
      `${baseUrl}/api/v2/meta/tables/${promptsTableId}/columns/`,
      authToken,
      { method: 'POST', body: JSON.stringify(col) },
    );
    if (!colRes.ok) {
      const error = await colRes.text();
      throw new AdapterError(
        'nocodb',
        'setup',
        `Failed to create Prompts column "${col.title}": ${colRes.status} ${error}`,
      );
    }
  }

  // Substitute {language} and {tone} into prompts before inserting
  const filledPrompts: Record<string, string> = {};
  for (const [key, template] of Object.entries(DEFAULT_PROMPTS)) {
    filledPrompts[key] = template
      .replace(/\{language\}/g, language || 'English')
      .replace(/\{tone\}/g, tone || 'professional');
  }

  await nocoFetch(`${baseUrl}/api/v2/tables/${promptsTableId}/records`, authToken, {
    method: 'POST',
    body: JSON.stringify(filledPrompts),
  });

  return promptsTableId;
}

function mapRowToArticle(row: Record<string, unknown>): ArticleRow {
  return {
    id: String(row.Id),
    topic: row.Topic as string,
    description: (row.Description as string) || undefined,
    link: (row.Link as string) || undefined,
    status: (row.Status as ArticleStatus) || 'queue',
    ghostUrl: (row.GhostURL as string) || undefined,
    pinUrl: (row.PinURL as string) || undefined,
    error: (row.Error as string) || undefined,
    createdAt: row.CreatedAt as string,
  };
}

function mapArticleInputToRow(input: ArticleCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = { Topic: input.topic };
  if (input.description) body.Description = input.description;
  if (input.link) body.Link = input.link;
  return body;
}

export function createNocoDBAdapter(): TableAdapter {
  return {
    async healthCheck() {
      try {
        const res = await fetch(`${getNocoDbUrl()}/api/v1/health`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async setup(config: TableConfig): Promise<TableSetupResult> {
      const baseUrl = getNocoDbUrl();
      const password =
        config.adminPassword ||
        process.env.NOCODB_ADMIN_PASSWORD ||
        crypto
          .createHash('sha256')
          .update(`nocodb-admin-${process.env.SETUP_TOKEN || 'openant-default'}`)
          .digest('hex')
          .slice(0, 32);

      // Step 1: Sign up user (or skip if already exists)
      const signupRes = await fetch(`${baseUrl}/api/v1/auth/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.adminEmail,
          password,
        }),
      });

      if (!signupRes.ok) {
        const errorText = await signupRes.text();
        const isUserExists = errorText.includes('User already exist');
        if (!isUserExists) {
          throw new AdapterError(
            'nocodb',
            'setup',
            `Signup failed: ${signupRes.status} ${errorText}`,
          );
        }
      }

      // Step 2: Sign in to get auth token
      const signinRes = await fetch(`${baseUrl}/api/v1/auth/user/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.adminEmail,
          password,
        }),
      });

      if (!signinRes.ok) {
        const error = await signinRes.text();
        throw new AdapterError('nocodb', 'setup', `Signin failed: ${signinRes.status} ${error}`);
      }

      const signinData = (await signinRes.json()) as { token: string };
      const authToken = signinData.token;

      // Step 3: Check for existing "openant" base, or create one
      let baseId: string;
      let allBases: Array<{ id: string; title: string }> = [];
      const listBasesRes = await nocoFetch(`${baseUrl}/api/v2/meta/bases/`, authToken);
      if (listBasesRes.ok) {
        const listData = (await listBasesRes.json()) as {
          list?: Array<{ id: string; title: string }>;
        };
        allBases = listData.list ?? [];
        const existing = allBases.find((b) => b.title === 'openant');
        if (existing) {
          baseId = existing.id;
        } else {
          baseId = await createBase(baseUrl, authToken);
        }
      } else {
        baseId = await createBase(baseUrl, authToken);
      }

      // Remove default bases (e.g. "Getting Started") to keep workspace clean
      for (const base of allBases) {
        if (base.id !== baseId) {
          await nocoFetch(`${baseUrl}/api/v2/meta/bases/${base.id}`, authToken, {
            method: 'DELETE',
          });
        }
      }

      // Step 4: List existing tables
      let existingTables: Array<{ id: string; title: string }> = [];
      const listTablesRes = await nocoFetch(
        `${baseUrl}/api/v2/meta/bases/${baseId}/tables/`,
        authToken,
      );
      if (listTablesRes.ok) {
        const tablesData = (await listTablesRes.json()) as {
          list?: Array<{ id: string; title: string }>;
        };
        existingTables = tablesData.list ?? [];
      }

      // Step 5: Check for existing "Articles" table, or create one
      let tableId: string;
      let tableCreated = false;
      const existingArticles = existingTables.find((t) => t.title === 'Articles');
      if (existingArticles) {
        tableId = existingArticles.id;
      } else {
        tableId = await createArticlesTable(baseUrl, authToken, baseId);
        tableCreated = true;
      }

      // Step 6: Insert a sample row so the user sees table structure
      if (tableCreated) {
        await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
          method: 'POST',
          body: JSON.stringify({
            Topic: 'Example: 10 Tips for Productive Remote Work',
            Description:
              'A practical guide covering workspace setup, time management, and communication best practices for remote teams.',
            Link: 'https://example.com/remote-work-tips',
          }),
        });
      }

      // Step 7: Check for existing "Prompts" table, or create one
      const existingPrompts = existingTables.find((t) => t.title === 'Prompts');
      const promptsTableId = existingPrompts
        ? existingPrompts.id
        : await createPromptsTable(
            baseUrl,
            authToken,
            baseId,
            config.blogLanguage,
            config.blogTone,
          );

      return { authToken, projectId: baseId, tableId, promptsTableId };
    },

    async getNextQueued(): Promise<ArticleRow | null> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'getNextQueued');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'getNextQueued');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(
        `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,blank)&sort=CreatedAt&limit=1`,
        authToken,
        { method: 'GET' },
      );

      if (!res.ok) {
        throw new AdapterError('nocodb', 'getNextQueued', `NocoDB error: ${res.status}`);
      }

      const data = (await res.json()) as {
        list?: Array<Record<string, unknown>>;
      };

      if (!data.list || data.list.length === 0) return null;

      const row = data.list[0];
      return {
        id: String(row.Id),
        topic: row.Topic as string,
        description: (row.Description as string) || undefined,
        link: (row.Link as string) || undefined,
        status: (row.Status as ArticleStatus) || 'queue',
        ghostUrl: (row.GhostURL as string) || undefined,
        pinUrl: (row.PinURL as string) || undefined,
        error: (row.Error as string) || undefined,
        createdAt: row.CreatedAt as string,
      };
    },

    async updateStatus(
      rowId: string,
      status: ArticleStatus,
      extra?: Partial<ArticleRow>,
    ): Promise<void> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'updateStatus');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'updateStatus');
      const baseUrl = getNocoDbUrl();

      const body: Record<string, unknown> = { Id: Number(rowId), Status: status };
      if (extra?.ghostUrl) body.GhostURL = extra.ghostUrl;
      if (extra?.pinUrl) body.PinURL = extra.pinUrl;
      if (extra?.error) body.Error = extra.error;

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'updateStatus', `NocoDB PATCH error: ${res.status}`);
      }
    },

    async getStats(): Promise<Record<ArticleStatus, number>> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'getStats');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'getStats');
      const baseUrl = getNocoDbUrl();

      // Count rows with blank status as "queue" (pending)
      const queueRes = await nocoFetch(
        `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,blank)&limit=1`,
        authToken,
        { method: 'GET' },
      );
      if (!queueRes.ok) {
        throw new AdapterError('nocodb', 'getStats', `NocoDB error: ${queueRes.status}`);
      }
      const queueData = (await queueRes.json()) as {
        pageInfo?: { totalRows?: number };
      };

      const results = await Promise.all(
        ALL_STATUSES.map(async (status) => {
          const res = await nocoFetch(
            `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,eq,${status})&limit=1`,
            authToken,
            { method: 'GET' },
          );

          if (!res.ok) {
            throw new AdapterError('nocodb', 'getStats', `NocoDB error: ${res.status}`);
          }

          const data = (await res.json()) as {
            pageInfo?: { totalRows?: number };
          };
          return [status, data.pageInfo?.totalRows ?? 0] as const;
        }),
      );

      return {
        ...Object.fromEntries(results),
        queue: queueData.pageInfo?.totalRows ?? 0,
      } as Record<ArticleStatus, number>;
    },

    async listArticles(): Promise<ArticleRow[]> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'listArticles');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'listArticles');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(
        `${baseUrl}/api/v2/tables/${tableId}/records?sort=-CreatedAt&limit=200`,
        authToken,
        { method: 'GET' },
      );

      if (!res.ok) {
        throw new AdapterError('nocodb', 'listArticles', `NocoDB error: ${res.status}`);
      }

      const data = (await res.json()) as {
        list?: Array<Record<string, unknown>>;
      };

      return (data.list ?? []).map(mapRowToArticle);
    },

    async createArticle(input: ArticleCreateInput): Promise<ArticleRow> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'createArticle');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'createArticle');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'POST',
        body: JSON.stringify(mapArticleInputToRow(input)),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'createArticle', `NocoDB error: ${res.status}`);
      }

      return mapRowToArticle((await res.json()) as Record<string, unknown>);
    },

    async createArticlesBulk(inputs: ArticleCreateInput[]): Promise<ArticleRow[]> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'createArticlesBulk');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'createArticlesBulk');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'POST',
        body: JSON.stringify(inputs.map(mapArticleInputToRow)),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'createArticlesBulk', `NocoDB error: ${res.status}`);
      }

      const rows = (await res.json()) as Record<string, unknown>[];
      return rows.map(mapRowToArticle);
    },

    async updateArticle(rowId: string, input: ArticleUpdateInput): Promise<void> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'updateArticle');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'updateArticle');
      const baseUrl = getNocoDbUrl();

      const body: Record<string, unknown> = { Id: Number(rowId) };
      if (input.topic !== undefined) body.Topic = input.topic;
      if (input.description !== undefined) body.Description = input.description;
      if (input.link !== undefined) body.Link = input.link;

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'updateArticle', `NocoDB PATCH error: ${res.status}`);
      }
    },

    async deleteArticle(rowId: string): Promise<void> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'deleteArticle');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'deleteArticle');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'DELETE',
        body: JSON.stringify({ Id: Number(rowId) }),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'deleteArticle', `NocoDB DELETE error: ${res.status}`);
      }
    },

    async getPrompts(): Promise<PromptRow | null> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'getPrompts');
      const promptsTableId = getEnvOrThrow('NOCODB_PROMPTS_TABLE_ID', 'getPrompts');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(
        `${baseUrl}/api/v2/tables/${promptsTableId}/records?limit=1`,
        authToken,
        { method: 'GET' },
      );

      if (!res.ok) {
        throw new AdapterError('nocodb', 'getPrompts', `NocoDB error: ${res.status}`);
      }

      const data = (await res.json()) as {
        list?: Array<Record<string, unknown>>;
      };

      if (!data.list || data.list.length === 0) return null;

      const row = data.list[0];
      return {
        id: String(row.Id),
        articleTitle: (row.ArticleTitle as string) || '',
        articleText: (row.ArticleText as string) || '',
        articleImage: (row.ArticleImage as string) || '',
        pinName: (row.PinName as string) || '',
        pinText: (row.PinText as string) || '',
        pinImage: (row.PinImage as string) || '',
        threadText: (row.ThreadText as string) || '',
      };
    },

    async updatePrompts(prompts: Partial<Omit<PromptRow, 'id'>>): Promise<void> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'updatePrompts');
      const promptsTableId = getEnvOrThrow('NOCODB_PROMPTS_TABLE_ID', 'updatePrompts');
      const baseUrl = getNocoDbUrl();

      // Get the existing row ID first
      const getRes = await nocoFetch(
        `${baseUrl}/api/v2/tables/${promptsTableId}/records?limit=1&fields=Id`,
        authToken,
        { method: 'GET' },
      );

      if (!getRes.ok) {
        throw new AdapterError('nocodb', 'updatePrompts', `NocoDB error: ${getRes.status}`);
      }

      const getData = (await getRes.json()) as {
        list?: Array<Record<string, unknown>>;
      };

      if (!getData.list || getData.list.length === 0) {
        throw new AdapterError('nocodb', 'updatePrompts', 'No prompts row found');
      }

      const rowId = getData.list[0].Id;
      const body: Record<string, unknown> = { Id: Number(rowId) };
      if (prompts.articleTitle !== undefined) body.ArticleTitle = prompts.articleTitle;
      if (prompts.articleText !== undefined) body.ArticleText = prompts.articleText;
      if (prompts.articleImage !== undefined) body.ArticleImage = prompts.articleImage;
      if (prompts.pinName !== undefined) body.PinName = prompts.pinName;
      if (prompts.pinText !== undefined) body.PinText = prompts.pinText;
      if (prompts.pinImage !== undefined) body.PinImage = prompts.pinImage;
      if (prompts.threadText !== undefined) body.ThreadText = prompts.threadText;

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${promptsTableId}/records`, authToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'updatePrompts', `NocoDB PATCH error: ${res.status}`);
      }
    },
  };
}
