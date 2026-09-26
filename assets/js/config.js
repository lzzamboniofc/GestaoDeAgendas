/*
 * Gestão — configuração central do painel
 *
 * O nome do negócio não fica preso ao código: ele é definido no primeiro acesso.
 * Ajuste aqui apenas padrões globais, conta administrativa de teste, tema e serviços iniciais.
 */
window.GESTAO_CONFIG = {
  app: {
    genericName: 'Gestão',
    title: 'Gestão — Agenda e Financeiro',
    locale: 'pt-BR',
    currency: 'BRL',
    whatsappCountryCode: '55'
  },

  // Login local do MVP.
  // São permitidas somente 2 identidades: a proprietária criada no primeiro acesso
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

  theme: {
    background: '#f3f2f0',
    surface: '#ffffff',
    surfaceAlt: '#ece8e5',
    text: '#2f2926',
    muted: '#716963',
    line: 'rgba(65, 51, 44, 0.18)',
    accent: '#8a624e',
    accentDark: '#3b2a23',
    accentSoft: '#d8c1b3',
    navActive: '#cba996',
    fieldBorder: '#a99589',

    financeIncome: '#4f815f',
    financePending: '#c69b37',
    financeExpense: '#b75b5d',
    financeTicket: '#527cae',
    financeBorder: 'rgba(49, 40, 35, 0.34)'
  },

  defaults: {
    defaultGapMinutes: 15,
    returnDays: 21,
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

  services: [
    {
      id: 'srv_pedi_francesinha',
      name: 'Pedicure',
      description: 'Cuticulagem com francesinha',
      duration: null,
      price: 45,
      active: true
    },
    {
      id: 'srv_pedi_comum',
      name: 'Pedicure',
      description: 'Pedicure com esmaltação comum',
      duration: null,
      price: 40,
      active: true
    },
    {
      id: 'srv_mani_comum',
      name: 'Manicure',
      description: 'Cuticulagem com esmaltação comum',
      duration: null,
      price: 35,
      active: true
    },
    {
      id: 'srv_mani_francesinha',
      name: 'Manicure',
      description: 'Cuticulagem com francesinha',
      duration: null,
      price: 40,
      active: true
    }
  ]
};

// Compatibilidade temporária com versões anteriores do app.js.
window.NOVAES_NAILS_CONFIG = window.GESTAO_CONFIG;
