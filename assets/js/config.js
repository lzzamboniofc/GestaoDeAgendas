/*
 * Painel — configuração central
 *
 * O produto nasce genérico: nome do negócio, responsável e serviços são definidos
 * no primeiro acesso. A identidade do login usa a logo indicada em branding.logoUrl.
 */
window.GESTAO_CONFIG = {
  app: {
    genericName: 'Painel',
    title: 'Painel — Agenda e Financeiro',
    locale: 'pt-BR',
    currency: 'BRL',
    whatsappCountryCode: '55'
  },

  branding: {
    logoUrl: 'https://avatars.githubusercontent.com/u/326558902?v=4&size=512',
    deriveLoginPalette: true,
    loginFallbackAccent: '#536273',
    loginFallbackDark: '#171b20',
    loginFallbackSoft: '#e9edf1'
  },

  // Login local do MVP.
  // São permitidas somente 2 identidades: o responsável criado no primeiro acesso
  // e esta conta administrativa/teste. Não existe cadastro público adicional.
  // IMPORTANTE: esta camada é apenas para protótipo; autenticação real deve usar Supabase Auth.
  auth: {
    enabled: true,
    maxUsers: 2,
    rememberByDefault: true,
    admin: {
      username: 'admin',
      password: '1234',
      displayName: 'Administrador',
      role: 'admin'
    }
  },

  // Temas visuais do painel. O primeiro usa a cor da marca como base e pode
  // ser refinado automaticamente a partir da logo quando o navegador permitir.
  themes: {
    brand: {
      label: 'Marca',
      description: 'Baseada na identidade da logo',
      background: '#f3f5f6',
      surface: '#ffffff',
      surfaceAlt: '#e8edf1',
      text: '#252a2f',
      muted: '#66717a',
      line: 'rgba(55, 68, 78, 0.28)',
      accent: '#536273',
      accentDark: '#202933',
      accentSoft: '#d7dfe6',
      navActive: '#c4d0da',
      fieldBorder: '#8997a3'
    },
    earth: {
      label: 'Terra',
      description: 'Marrom quente e acolhedor',
      background: '#f3f2f0',
      surface: '#ffffff',
      surfaceAlt: '#ece8e5',
      text: '#2f2926',
      muted: '#716963',
      line: 'rgba(65, 51, 44, 0.28)',
      accent: '#8a624e',
      accentDark: '#3b2a23',
      accentSoft: '#d8c1b3',
      navActive: '#cba996',
      fieldBorder: '#927d70'
    },
    sage: {
      label: 'Sálvia',
      description: 'Verde sóbrio e natural',
      background: '#f2f5f1',
      surface: '#ffffff',
      surfaceAlt: '#e5ece3',
      text: '#29312a',
      muted: '#687268',
      line: 'rgba(52, 72, 54, 0.27)',
      accent: '#68836c',
      accentDark: '#2f4333',
      accentSoft: '#d2dfd2',
      navActive: '#bdd0be',
      fieldBorder: '#8da08e'
    },
    ocean: {
      label: 'Oceano',
      description: 'Azul profissional e limpo',
      background: '#f1f5f8',
      surface: '#ffffff',
      surfaceAlt: '#e4edf4',
      text: '#25303a',
      muted: '#65727d',
      line: 'rgba(48, 72, 92, 0.27)',
      accent: '#4e7896',
      accentDark: '#263f52',
      accentSoft: '#d1e0ea',
      navActive: '#b8d0df',
      fieldBorder: '#829bad'
    },
    wine: {
      label: 'Vinho',
      description: 'Vinho elegante e contrastado',
      background: '#f6f2f3',
      surface: '#ffffff',
      surfaceAlt: '#eee3e6',
      text: '#34272b',
      muted: '#75666a',
      line: 'rgba(86, 48, 59, 0.27)',
      accent: '#8c5363',
      accentDark: '#4a2933',
      accentSoft: '#e2cbd2',
      navActive: '#d2adb8',
      fieldBorder: '#a47b87'
    }
  },

  financeTheme: {
    financeIncome: '#4f815f',
    financePending: '#c69b37',
    financeExpense: '#b75b5d',
    financeTicket: '#527cae',
    financeBorder: 'rgba(49, 40, 35, 0.38)'
  },

  defaults: {
    defaultGapMinutes: 15,
    returnDays: 21,
    themeId: 'brand',
    agendaOverviewMode: 'week',
    agendaDayPosition: 'above',
    availability: {
      enabled: false,
      slotMinutes: 60,
      blockedDates: [],
      days: {
        0: { enabled: false, start: '08:00', end: '18:30', breakEnabled: false, breakStart: '12:00', breakEnd: '13:00' },
        1: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
        2: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
        3: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
        4: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
        5: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
        6: { enabled: true, start: '08:00', end: '12:00', breakEnabled: false, breakStart: '12:00', breakEnd: '13:00' }
      }
    },
    agendaFields: {
      service: true,
      price: true,
      phone: false,
      status: true,
      notes: false
    }
  },

  returnDayOptions: [14, 21, 28, 30],
  paymentMethods: ['Pix', 'Dinheiro', 'Cartão', 'Outro'],

  // Catálogo vazio de propósito: o sistema não assume nenhum segmento de negócio.
  services: []
};
