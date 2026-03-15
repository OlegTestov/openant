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
      optional: string;
      optionalHint: string;
      currentAccess: string;
      hasDomain: string;
      enterDomain: string;
      serviceRouting: string;
      ghostPrefix: string;
      nocodbPrefix: string;
      n8nPrefix: string;
      wizardPrefix: string;
      rootDomainHint: string;
      requiredRecords: string;
      dnsType: string;
      dnsName: string;
      dnsValue: string;
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
      imageModel: string;
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
    telegram: {
      title: string;
      description: string;
      optional: string;
      optionalHint: string;
      botToken: string;
      botTokenInstructions: string;
      botTokenStep1: string;
      botTokenStep2: string;
      botTokenStep3: string;
      botTokenPlaceholder: string;
      chatId: string;
      chatIdHint: string;
      chatIdPlaceholder: string;
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
      board: string;
      boardHint: string;
      downloadTemplate: string;
      downloadHint: string;
      webhookRequired: string;
      boardRequired: string;
    };
    review: {
      title: string;
      description: string;
      domain: string;
      llm: string;
      blog: string;
      telegram: string;
      telegramAutoDetect: string;
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
    tools: string;
    downloadMakeTemplate: string;
    makeTemplateHint: string;
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
      optional: 'This step is optional',
      optionalHint: 'Your services are already available at:',
      currentAccess: 'Your services are available at: {domain}',
      hasDomain: 'I have a domain',
      enterDomain: 'example.com',
      serviceRouting: 'Service Routing',
      ghostPrefix: 'Blog (Ghost)',
      nocodbPrefix: 'NocoDB',
      n8nPrefix: 'n8n',
      wizardPrefix: 'Setup (Wizard)',
      rootDomainHint: 'Leave empty for root domain',
      requiredRecords: 'Required DNS records',
      dnsType: 'Type',
      dnsName: 'Name',
      dnsValue: 'Value',
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
      imageModel: 'Image Model',
      testConnection: 'Test Connection',
      connected: 'Connected!',
      latency: 'Latency:',
    },
    blog: {
      title: 'Blog Settings',
      description: 'Configure your blog',
      blogTitle: 'Blog Title',
      blogDescription: 'Blog Tagline',
      articleLanguage: 'Article Language',
      writingTone: 'Writing Tone',
      publishInterval: 'Publish Interval',
      publishIntervalHint: 'How often to publish the next article from queue',
      minutes: 'minutes',
      hours: 'hours',
      preview: 'Preview',
    },
    telegram: {
      title: 'Telegram Bot',
      description: 'Optional: get notifications and create content via Telegram',
      optional: 'This step is optional',
      optionalHint: 'You can configure Telegram notifications later.',
      botToken: 'Bot Token',
      botTokenInstructions: 'Get a token:',
      botTokenStep1: 'Open @BotFather in Telegram',
      botTokenStep2: 'Send /newbot and follow the prompts',
      botTokenStep3: 'Copy the token and paste it here',
      botTokenPlaceholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chatId: 'Chat ID',
      chatIdHint: 'Leave empty to auto-detect when you send /start to the bot',
      chatIdPlaceholder: '123456789',
    },
    social: {
      title: 'Social Distribution',
      description: 'Optional: automate social media posting',
      optional: 'This step is optional',
      optionalHint: 'You can configure social distribution later.',
      webhookUrl: 'Make.com Webhook URL',
      webhookHint: 'Paste the webhook URL from your Make.com scenario here',
      pinterest: 'Pinterest',
      threads: 'Threads',
      board: 'Pinterest Board',
      boardHint: 'Name of the Pinterest board to publish pins to (must match exactly)',
      downloadTemplate: 'Download Make.com Template',
      downloadHint:
        '1. Download the template above\n2. Go to make.com → Scenarios → Create a new scenario → Import Blueprint → upload the file\n3. Click the Pinterest module → Add connection → authorize your Pinterest account\n4. Click the webhook module (first circle) → Create a webhook → Save\n5. Copy address to clipboard → Save\n6. Paste the URL into the field below\n7. Save the scenario (floppy disk icon at the bottom)\n8. Turn on the scenario (ON/OFF toggle next to the floppy disk)\n9. In the scheduling dialog select "Immediately" → Save',
      webhookRequired: 'Webhook URL is required when Pinterest or Threads is enabled',
      boardRequired: 'Board name is required when Pinterest is enabled',
    },
    review: {
      title: 'Review Configuration',
      description: 'Check your settings before applying',
      domain: 'Domain',
      llm: 'LLM',
      blog: 'Blog',
      telegram: 'Telegram',
      telegramAutoDetect: 'Auto-detect from /start',
      social: 'Social',
      ipMode: 'IP mode',
      notConfigured: 'Not configured',
      edit: 'Edit',
      webhook: 'Webhook',
      noWebhook: 'No webhook',
      applyConfiguration: 'Apply Configuration',
    },
    deploy: {
      title: 'Apply Configuration',
      deploy: 'Apply Configuration',
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
    tools: 'Tools',
    downloadMakeTemplate: 'Download Make.com Pinterest Template',
    makeTemplateHint:
      'Import this file into Make.com (Scenarios → Import Blueprint), connect your Pinterest account, and enable the scenario',
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
      optional: 'Этот шаг необязателен',
      optionalHint: 'Ваши сервисы уже доступны по адресу:',
      currentAccess: 'Ваши сервисы доступны по адресу: {domain}',
      hasDomain: 'У меня есть домен',
      enterDomain: 'example.com',
      serviceRouting: 'Маршрутизация сервисов',
      ghostPrefix: 'Блог (Ghost)',
      nocodbPrefix: 'NocoDB',
      n8nPrefix: 'n8n',
      wizardPrefix: 'Настройка (Wizard)',
      rootDomainHint: 'Оставьте пустым для корневого домена',
      requiredRecords: 'Необходимые DNS-записи',
      dnsType: 'Тип',
      dnsName: 'Имя',
      dnsValue: 'Значение',
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
      imageModel: 'Модель для изображений',
      testConnection: 'Проверить соединение',
      connected: 'Подключено!',
      latency: 'Задержка:',
    },
    blog: {
      title: 'Настройки блога',
      description: 'Настройте свой блог',
      blogTitle: 'Название блога',
      blogDescription: 'Заголовок блога',
      articleLanguage: 'Язык статей',
      writingTone: 'Стиль написания',
      publishInterval: 'Интервал публикации',
      publishIntervalHint: 'Как часто публиковать следующую статью из очереди',
      minutes: 'минуты',
      hours: 'часы',
      preview: 'Предпросмотр',
    },
    telegram: {
      title: 'Telegram-бот',
      description: 'Опционально: уведомления и создание контента через Telegram',
      optional: 'Этот шаг необязателен',
      optionalHint: 'Вы можете настроить Telegram-уведомления позже.',
      botToken: 'Токен бота',
      botTokenInstructions: 'Получите токен:',
      botTokenStep1: 'Откройте @BotFather в Telegram',
      botTokenStep2: 'Отправьте /newbot и следуйте инструкциям',
      botTokenStep3: 'Скопируйте токен и вставьте сюда',
      botTokenPlaceholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chatId: 'ID чата',
      chatIdHint: 'Оставьте пустым для автоопределения при отправке /start боту',
      chatIdPlaceholder: '123456789',
    },
    social: {
      title: 'Дистрибуция в соцсетях',
      description: 'Опционально: автоматизация постинга',
      optional: 'Этот шаг необязателен',
      optionalHint: 'Вы можете настроить дистрибуцию позже.',
      webhookUrl: 'URL вебхука Make.com',
      webhookHint: 'Вставьте URL вебхука из вашего сценария Make.com',
      pinterest: 'Pinterest',
      threads: 'Threads',
      board: 'Доска Pinterest',
      boardHint: 'Название доски Pinterest для публикации пинов (должно совпадать точно)',
      downloadTemplate: 'Скачать шаблон Make.com',
      downloadHint:
        '1. Скачайте шаблон выше\n2. Откройте make.com → Scenarios → Create a new scenario → Import Blueprint → загрузите файл\n3. Нажмите на модуль Pinterest → Add connection → авторизуйте аккаунт Pinterest\n4. Нажмите на модуль вебхука (первый кружок) → Create a webhook → Save\n5. Copy address to clipboard → Save\n6. Вставьте URL в поле ниже\n7. Сохраните сценарий (иконка дискеты внизу)\n8. Включите сценарий (переключатель ON/OFF рядом с дискетой)\n9. В диалоге расписания выберите «Immediately» → Save',
      webhookRequired: 'URL вебхука обязателен, если Pinterest или Threads включён',
      boardRequired: 'Название доски обязательно, если Pinterest включён',
    },
    review: {
      title: 'Проверка конфигурации',
      description: 'Проверьте настройки перед применением',
      domain: 'Домен',
      llm: 'LLM',
      blog: 'Блог',
      telegram: 'Telegram',
      telegramAutoDetect: 'Автоопределение по /start',
      social: 'Соцсети',
      ipMode: 'Режим IP',
      notConfigured: 'Не настроено',
      edit: 'Изменить',
      webhook: 'Вебхук',
      noWebhook: 'Нет вебхука',
      applyConfiguration: 'Применить конфигурацию',
    },
    deploy: {
      title: 'Применить конфигурацию',
      deploy: 'Применить конфигурацию',
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
    tools: 'Инструменты',
    downloadMakeTemplate: 'Скачать шаблон Make.com для Pinterest',
    makeTemplateHint:
      'Импортируйте файл в Make.com (Scenarios → Import Blueprint), подключите аккаунт Pinterest и включите сценарий',
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
