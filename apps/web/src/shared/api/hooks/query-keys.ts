export const queryKeys = {
  root: ['apss'] as const,
  auth: {
    all: ['apss', 'auth'] as const,
    session: ['apss', 'auth', 'session'] as const,
    profile: (userId: string) => ['apss', 'auth', 'profile', userId] as const,
  },
  levels: {
    all: ['apss', 'levels'] as const,
    list: (filters: { search?: string; active?: string }) =>
      ['apss', 'levels', 'list', filters] as const,
    detail: (id: string) => ['apss', 'levels', id] as const,
    usage: (id: string) => ['apss', 'levels', 'usage', id] as const,
    resourceAccess: (id: string) => ['apss', 'levels', 'resource-access', id] as const,
  },
  companies: {
    all: ['apss', 'companies'] as const,
    list: (filters: {
      search?: string
      accessStatus?: string
      levelId?: string
      balanceFilter?: string
      sortBy?: string
    }) => ['apss', 'companies', 'list', filters] as const,
    detail: (id: string) => ['apss', 'companies', id] as const,
    comments: (id: string) => ['apss', 'companies', id, 'comments'] as const,
  },
  representatives: {
    all: ['apss', 'representatives'] as const,
    list: (filters: { search?: string; companyId?: string; active?: string; primary?: string }) =>
      ['apss', 'representatives', 'list', filters] as const,
    detail: (id: string) => ['apss', 'representatives', id] as const,
    byCompany: (companyId: string) => ['apss', 'representatives', 'company', companyId] as const,
  },
  materials: {
    all: ['apss', 'materials'] as const,
    list: (filters: { search?: string; status?: string; levelId?: string; categoryId?: string }) =>
      ['apss', 'materials', 'list', filters] as const,
    detail: (id: string) => ['apss', 'materials', id] as const,
    bySlug: (slug: string) => ['apss', 'materials', 'slug', slug] as const,
    documents: (sectionId: string) => ['apss', 'materials', 'documents', sectionId] as const,
    cabinetList: ['apss', 'materials', 'cabinet', 'list'] as const,
    cabinetBySlug: (slug: string) => ['apss', 'materials', 'cabinet', 'slug', slug] as const,
    moderation: (status: string) => ['apss', 'materials', 'moderation', status] as const,
    categories: ['apss', 'materials', 'categories'] as const,
    categoriesList: (filters: { search?: string; active?: string }) =>
      ['apss', 'materials', 'categories', 'list', filters] as const,
    categoriesModeration: (status: string) =>
      ['apss', 'materials', 'categories', 'moderation', status] as const,
    categoryUsage: (id: string) => ['apss', 'materials', 'categories', 'usage', id] as const,
  },
  companyProducts: {
    all: ['apss', 'company-products'] as const,
    byCompany: (companyId: string) => ['apss', 'company-products', 'company', companyId] as const,
    moderation: (status: string) => ['apss', 'company-products', 'moderation', status] as const,
  },
  invoices: {
    all: ['apss', 'invoices'] as const,
    list: (filters: { search?: string; status?: string; companyId?: string }) =>
      ['apss', 'invoices', 'list', filters] as const,
    detail: (id: string) => ['apss', 'invoices', id] as const,
    cabinet: (companyId: string) => ['apss', 'invoices', 'cabinet', companyId] as const,
  },
  notifications: {
    all: ['apss', 'notifications'] as const,
    list: (filters: { unreadOnly?: boolean }) =>
      ['apss', 'notifications', 'list', filters] as const,
    unreadCount: ['apss', 'notifications', 'unread-count'] as const,
  },
  productCategories: {
    all: ['apss', 'product-categories'] as const,
    active: ['apss', 'product-categories', 'active'] as const,
    suggestions: (status: string) =>
      ['apss', 'product-category-suggestions', status] as const,
  },
  okpd2Codes: {
    all: ['apss', 'okpd2-codes'] as const,
    active: ['apss', 'okpd2-codes', 'active'] as const,
  },
  productNotes: {
    all: ['apss', 'product-notes'] as const,
    active: ['apss', 'product-notes', 'active'] as const,
  },
  workGroups: {
    all: ['apss', 'work-groups'] as const,
    list: (filters: { search?: string; status?: string; categoryId?: string }) =>
      ['apss', 'work-groups', 'list', filters] as const,
    detail: (id: string) => ['apss', 'work-groups', id] as const,
    members: (id: string) => ['apss', 'work-groups', id, 'members'] as const,
    messengers: (id: string) => ['apss', 'work-groups', id, 'messengers'] as const,
    messages: (id: string) => ['apss', 'work-groups', id, 'messages'] as const,
    botChannels: (platform: string) => ['apss', 'messenger-bot-channels', platform] as const,
    links: (id: string) => ['apss', 'work-groups', id, 'links'] as const,
    categories: ['apss', 'work-groups', 'categories'] as const,
    categoriesList: (filters: { search?: string; active?: string }) =>
      ['apss', 'work-groups', 'categories', 'list', filters] as const,
    categoryUsage: (id: string) => ['apss', 'work-groups', 'categories', 'usage', id] as const,
    cabinetList: ['apss', 'work-groups', 'cabinet', 'list'] as const,
    cabinetDetail: (id: string) => ['apss', 'work-groups', 'cabinet', id] as const,
    membershipRequests: (status: string) =>
      ['apss', 'work-groups', 'membership-requests', status] as const,
  },
  messages: {
    all: ['apss', 'messages'] as const,
    list: (filters: {
      search?: string
      workGroupId?: string
      source?: string
      externalChatId?: string
      deliveryStatus?: string
      page?: number
      pageSize?: number
    }) => ['apss', 'messages', 'list', filters] as const,
    detail: (id: string) => ['apss', 'messages', id] as const,
  },
  audit: {
    all: ['apss', 'audit'] as const,
    list: (filters: {
      search?: string
      action?: string
      entityType?: string
      userId?: string
      from?: string
      to?: string
      page?: number
      pageSize?: number
    }) => ['apss', 'audit', 'list', filters] as const,
    actionOptions: ['apss', 'audit', 'actions'] as const,
    entityTypeOptions: ['apss', 'audit', 'entity-types'] as const,
  },
  polls: {
    all: ['apss', 'polls'] as const,
    list: (filters: { search?: string; status?: string; voteMode?: string }) =>
      ['apss', 'polls', 'list', filters] as const,
    detail: (id: string) => ['apss', 'polls', id] as const,
    active: ['apss', 'polls', 'active'] as const,
    cabinetList: ['apss', 'polls', 'cabinet', 'list'] as const,
    cabinetDetail: (id: string) => ['apss', 'polls', 'cabinet', id] as const,
    results: (id: string) => ['apss', 'polls', id, 'results'] as const,
    votes: (id: string) => ['apss', 'polls', id, 'votes'] as const,
  },
  registrations: {
    all: ['apss', 'registrations'] as const,
    pending: ['apss', 'registrations', 'pending'] as const,
    list: (filters: { status?: string; search?: string }) =>
      ['apss', 'registrations', 'list', filters] as const,
    detail: (userId: string) => ['apss', 'registrations', 'detail', userId] as const,
    representatives: (search?: string) =>
      ['apss', 'registrations', 'representatives', search ?? ''] as const,
    companies: (search?: string) => ['apss', 'registrations', 'companies', search ?? ''] as const,
  },
  directory: {
    all: ['apss', 'directory'] as const,
    list: ['apss', 'directory', 'list'] as const,
  },
  staff: {
    all: ['apss', 'staff'] as const,
    list: ['apss', 'staff', 'list'] as const,
    candidates: (search?: string) => ['apss', 'staff', 'candidates', search ?? ''] as const,
  },
  registeredUsers: {
    all: ['apss', 'registered-users'] as const,
    list: (filters: { search?: string; role?: string; status?: string }) =>
      ['apss', 'registered-users', 'list', filters] as const,
  },
  cabinetMeta: {
    pollAccessHint: ['apss', 'cabinet', 'poll-access-hint'] as const,
  },
  cabinet: {
    resourceAccess: ['apss', 'cabinet', 'resource-access'] as const,
  },
} as const
