export type Locale = 'en' | 'ru';

export interface Translations {
  steps: {
    welcome: {
      title: string;
      description: string;
      getStarted: string;
      selectLanguage: string;
    };
    domain: {
      title: string;
      description: string;
      hasDomain: string;
      enterDomain: string;
      pointDns: string;
      subdomains: string;
      dnsOk: string;
      dnsWrong: string;
      dnsNoResolve: string;
      ipMode: string;
      noHttps: string;
    };
    llm: {
      title: string;
      description: string;
      provider: string;
      apiUrl: string;
      apiKey: string;
      model: string;
      testConnection: string;
      connected: string;
      latency: string;
    };
    blog: {
      title: string;
      description: string;
      blogTitle: string;
      blogDescription: string;
      articleLanguage: string;
      writingTone: string;
      publishInterval: string;
      publishIntervalHint: string;
      minutes: string;
      hours: string;
      preview: string;
    };
    social: {
      title: string;
      description: string;
      optional: string;
      optionalHint: string;
      webhookUrl: string;
      webhookHint: string;
      pinterest: string;
      threads: string;
    };
    review: {
      title: string;
      description: string;
      domain: string;
      llm: string;
      blog: string;
      social: string;
      ipMode: string;
      notConfigured: string;
      edit: string;
      webhook: string;
      noWebhook: string;
      applyConfiguration: string;
    };
    deploy: {
      title: string;
      deploy: string;
      retry: string;
      complete: string;
      serviceAccess: string;
      goToDashboard: string;
      errorAt: string;
      tokenNotFound: string;
      serverError: string;
      networkError: string;
    };
  };
  common: {
    next: string;
    back: string;
    save: string;
    edit: string;
    loading: string;
    error: string;
    failedToSave: string;
  };
  dashboard: {
    title: string;
    services: string;
    serviceAccess: string;
    articles: string;
    inQueue: string;
    published: string;
    completed: string;
    errors: string;
    reconfigure: string;
    confirmReconfigure: string;
    openBlog: string;
    openAdmin: string;
    openTable: string;
    openAutomation: string;
    managedBySaas: string;
  };
  services: {
    ghost: string;
    ghostDesc: string;
    nocodb: string;
    nocodbDesc: string;
    n8n: string;
    n8nDesc: string;
  };
}

const en: Translations = {
  steps: {
    welcome: {
      title: 'Welcome to openant',
      description: 'Self-hosted content automation platform',
      getStarted: 'Get Started',
      selectLanguage: 'Select language',
    },
    domain: {
      title: 'Domain Configuration',
      description: 'Configure how your services will be accessed',
      hasDomain: 'I have a domain',
      enterDomain: 'example.com',
      pointDns: 'Point DNS A-record to:',
      subdomains: 'Subdomains: table.*, auto.*, setup.*',
      dnsOk: 'DNS configured correctly',
      dnsWrong: 'DNS points to {ip}, expected {serverIp}',
      dnsNoResolve: 'DNS does not resolve',
      ipMode: 'Services will be available at: http://{ip}:PORT',
      noHttps: 'HTTPS will not be available without a domain.',
    },
    llm: {
      title: 'LLM Provider',
      description: 'Connect your AI provider',
      provider: 'Provider',
      apiUrl: 'API URL',
      apiKey: 'API Key',
      model: 'Model',
      testConnection: 'Test Connection',
      connected: 'Connected!',
      latency: 'Latency:',
    },
    blog: {
      title: 'Blog Settings',
      description: 'Configure your blog',
      blogTitle: 'Blog Title',
      blogDescription: 'Description',
      articleLanguage: 'Article Language',
      writingTone: 'Writing Tone',
      publishInterval: 'Publish Interval',
      publishIntervalHint: 'How often to publish the next article from queue',
      minutes: 'minutes',
      hours: 'hours',
      preview: 'Preview',
    },
    social: {
      title: 'Social Distribution',
      description: 'Optional: automate social media posting',
      optional: 'This step is optional',
      optionalHint: 'You can configure social distribution later.',
      webhookUrl: 'Make.com Webhook URL',
      webhookHint: 'Create a scenario in Make.com and paste the webhook URL here',
      pinterest: 'Pinterest',
      threads: 'Threads',
    },
    review: {
      title: 'Review Configuration',
      description: 'Check your settings before applying',
      domain: 'Domain',
      llm: 'LLM',
      blog: 'Blog',
      social: 'Social',
      ipMode: 'IP mode',
      notConfigured: 'Not configured',
      edit: 'Edit',
      webhook: 'Webhook',
      noWebhook: 'No webhook',
      applyConfiguration: 'Apply Configuration',
    },
    deploy: {
      title: 'Deploy',
      deploy: 'Deploy Configuration',
      retry: 'Retry from this step',
      complete: 'Setup complete!',
      serviceAccess: 'Service Access',
      goToDashboard: 'Go to Dashboard',
      errorAt: 'Error at step {step}: {message}',
      tokenNotFound: 'Setup token not found. Please reload the page with the original URL.',
      serverError: 'Server error: {status} {statusText}',
      networkError: 'Network error: {message}',
    },
  },
  common: {
    next: 'Next',
    back: 'Back',
    save: 'Save',
    edit: 'Edit',
    loading: 'Loading...',
    error: 'Error',
    failedToSave: 'Failed to save settings',
  },
  dashboard: {
    title: 'openant Dashboard',
    services: 'Services',
    serviceAccess: 'Service Access',
    articles: 'Articles',
    inQueue: 'In Queue',
    published: 'Published',
    completed: 'Completed',
    errors: 'Errors',
    reconfigure: 'Reconfigure',
    confirmReconfigure: 'This will reset your setup. Are you sure?',
    openBlog: 'Open blog',
    openAdmin: 'Open admin',
    openTable: 'Open articles table',
    openAutomation: 'Open automations',
    managedBySaas: 'Managed by openant SaaS',
  },
  services: {
    ghost: 'Ghost',
    ghostDesc: 'Edit pages, design, settings',
    nocodb: 'NocoDB',
    nocodbDesc: 'Topic queue, article statuses',
    n8n: 'n8n',
    n8nDesc: 'Automation workflows',
  },
};

const ru: Translations = {
  steps: {
    welcome: {
      title: 'Добро пожаловать в openant',
      description: 'Платформа автоматизации контента',
      getStarted: 'Начать',
      selectLanguage: 'Выберите язык',
    },
    domain: {
      title: 'Настройка домена',
      description: 'Настройте доступ к сервисам',
      hasDomain: 'У меня есть домен',
      enterDomain: 'example.com',
      pointDns: 'Настройте DNS A-запись на:',
      subdomains: 'Поддомены: table.*, auto.*, setup.*',
      dnsOk: 'DNS настроен правильно',
      dnsWrong: 'DNS указывает на {ip}, ожидается {serverIp}',
      dnsNoResolve: 'DNS не резолвится',
      ipMode: 'Сервисы будут доступны по: http://{ip}:PORT',
      noHttps: 'HTTPS недоступен без домена.',
    },
    llm: {
      title: 'Провайдер LLM',
      description: 'Подключите AI-провайдер',
      provider: 'Провайдер',
      apiUrl: 'URL API',
      apiKey: 'API-ключ',
      model: 'Модель',
      testConnection: 'Проверить соединение',
      connected: 'Подключено!',
      latency: 'Задержка:',
    },
    blog: {
      title: 'Настройки блога',
      description: 'Настройте свой блог',
      blogTitle: 'Название блога',
      blogDescription: 'Описание',
      articleLanguage: 'Язык статей',
      writingTone: 'Стиль написания',
      publishInterval: 'Интервал публикации',
      publishIntervalHint: 'Как часто публиковать следующую статью из очереди',
      minutes: 'минуты',
      hours: 'часы',
      preview: 'Предпросмотр',
    },
    social: {
      title: 'Дистрибуция в соцсетях',
      description: 'Опционально: автоматизация постинга',
      optional: 'Этот шаг необязателен',
      optionalHint: 'Вы можете настроить дистрибуцию позже.',
      webhookUrl: 'URL вебхука Make.com',
      webhookHint: 'Создайте сценарий в Make.com и вставьте URL вебхука',
      pinterest: 'Pinterest',
      threads: 'Threads',
    },
    review: {
      title: 'Проверка конфигурации',
      description: 'Проверьте настройки перед применением',
      domain: 'Домен',
      llm: 'LLM',
      blog: 'Блог',
      social: 'Соцсети',
      ipMode: 'Режим IP',
      notConfigured: 'Не настроено',
      edit: 'Изменить',
      webhook: 'Вебхук',
      noWebhook: 'Нет вебхука',
      applyConfiguration: 'Применить конфигурацию',
    },
    deploy: {
      title: 'Развёртывание',
      deploy: 'Развернуть конфигурацию',
      retry: 'Повторить с этого шага',
      complete: 'Настройка завершена!',
      serviceAccess: 'Доступ к сервисам',
      goToDashboard: 'Перейти к панели',
      errorAt: 'Ошибка на шаге {step}: {message}',
      tokenNotFound: 'Токен не найден. Перезагрузите страницу с оригинальным URL.',
      serverError: 'Ошибка сервера: {status} {statusText}',
      networkError: 'Ошибка сети: {message}',
    },
  },
  common: {
    next: 'Далее',
    back: 'Назад',
    save: 'Сохранить',
    edit: 'Изменить',
    loading: 'Загрузка...',
    error: 'Ошибка',
    failedToSave: 'Не удалось сохранить настройки',
  },
  dashboard: {
    title: 'Панель openant',
    services: 'Сервисы',
    serviceAccess: 'Доступ к сервисам',
    articles: 'Статьи',
    inQueue: 'В очереди',
    published: 'Опубликовано',
    completed: 'Завершено',
    errors: 'Ошибки',
    reconfigure: 'Перенастроить',
    confirmReconfigure: 'Это сбросит настройки. Вы уверены?',
    openBlog: 'Открыть блог',
    openAdmin: 'Открыть админку',
    openTable: 'Открыть таблицу статей',
    openAutomation: 'Открыть автоматизации',
    managedBySaas: 'Управляется openant SaaS',
  },
  services: {
    ghost: 'Ghost',
    ghostDesc: 'Страницы, дизайн, настройки',
    nocodb: 'NocoDB',
    nocodbDesc: 'Очередь тем, статусы статей',
    n8n: 'n8n',
    n8nDesc: 'Автоматизации',
  },
};

const translations: Record<Locale, Translations> = { en, ru };

export function getTranslations(locale?: Locale): Translations {
  return translations[locale || 'en'];
}

export function useTranslations(): Translations {
  const locale =
    (typeof window !== 'undefined' ? (localStorage.getItem('language') as Locale) : 'en') || 'en';
  return translations[locale] || translations.en;
}
