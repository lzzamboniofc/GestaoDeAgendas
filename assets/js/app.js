(() => {
  const CONFIG = window.GESTAO_CONFIG || {};
  const APP_CONFIG = CONFIG.app || {};
  const AUTH_CONFIG = CONFIG.auth || {};
  const BRANDING_CONFIG = CONFIG.branding || {};
  const THEMES_CONFIG = CONFIG.themes || {};
  const FINANCE_THEME_CONFIG = CONFIG.financeTheme || {};
  const DEFAULT_CONFIG = CONFIG.defaults || {};
  const STORAGE_KEY = 'gestao_negocio_mvp_v12';
  const WORKSPACE_KEY = 'gestao_workspace_v1';
  const OWNER_ACCOUNT_KEY = 'gestao_owner_account_v1';
  const AUTH_SESSION_KEY = 'gestao_auth_session_v2';

  const pad = (value) => String(value).padStart(2, '0');
  const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateFromKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const shiftDate = (key, days) => {
    const d = dateFromKey(key);
    d.setDate(d.getDate() + days);
    return localDateKey(d);
  };
  const money = (value) => new Intl.NumberFormat(APP_CONFIG.locale || 'pt-BR', { style: 'currency', currency: APP_CONFIG.currency || 'BRL' }).format(Number(value) || 0);
  const shortDate = (key) => dateFromKey(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const longDate = (key) => dateFromKey(key).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'Cliente';
  const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const today = localDateKey();

  let workspace = loadWorkspace();
  let ownerAccount = loadOwnerAccount();
  let currentUser = readAuthSession();

  const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  function defaultAvailability() {
    const source = DEFAULT_CONFIG.availability || {};
    const fallbackDays = {
      0: { enabled: false, start: '08:00', end: '18:30', breakEnabled: false, breakStart: '12:00', breakEnd: '13:00' },
      1: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
      2: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
      3: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
      4: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
      5: { enabled: true, start: '08:00', end: '18:30', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00' },
      6: { enabled: true, start: '08:00', end: '12:00', breakEnabled: false, breakStart: '12:00', breakEnd: '13:00' },
    };
    const days = {};
    for (let day = 0; day <= 6; day += 1) days[day] = { ...fallbackDays[day], ...(source.days?.[day] || source.days?.[String(day)] || {}) };
    return {
      enabled: Boolean(source.enabled),
      slotMinutes: Math.max(15, Number(source.slotMinutes) || 60),
      blockedDates: Array.isArray(source.blockedDates) ? [...new Set(source.blockedDates.filter(Boolean))] : [],
      days,
    };
  }

  const defaultState = () => ({
    settings: {
      defaultGap: Number(DEFAULT_CONFIG.defaultGapMinutes ?? 15),
      returnDays: Number(DEFAULT_CONFIG.returnDays ?? 21),
      themeId: THEMES_CONFIG[DEFAULT_CONFIG.themeId] ? DEFAULT_CONFIG.themeId : (Object.keys(THEMES_CONFIG)[0] || 'brand'),
      agendaOverviewMode: ['week', 'month'].includes(DEFAULT_CONFIG.agendaOverviewMode) ? DEFAULT_CONFIG.agendaOverviewMode : 'week',
      agendaDayPosition: ['above', 'below'].includes(DEFAULT_CONFIG.agendaDayPosition) ? DEFAULT_CONFIG.agendaDayPosition : 'above',
      availability: defaultAvailability(),
      agendaFields: {
        service: DEFAULT_CONFIG.agendaFields?.service ?? true,
        price: DEFAULT_CONFIG.agendaFields?.price ?? true,
        phone: DEFAULT_CONFIG.agendaFields?.phone ?? false,
        status: DEFAULT_CONFIG.agendaFields?.status ?? true,
        notes: DEFAULT_CONFIG.agendaFields?.notes ?? false,
      },
      financeCollapsed: {},
    },
    services: (CONFIG.services || []).map((service) => ({ ...service })),
    packageTemplates: [],
    clientPackages: [],
    paymentMethods: (CONFIG.paymentMethods || ['Pix', 'Dinheiro', 'Cartão', 'Outro']).map((method, index) => {
      if (typeof method === 'string') return { id: `pay_${index}_${method.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name: method, active: true };
      return { id: method.id || uid('pay'), name: method.name || 'Pagamento', active: method.active !== false };
    }),
    clients: [],
    appointments: [],
    expenses: [],
  });

  let state = loadState();
  let agendaDate = today;
  let agendaOverviewMode = state.settings.agendaOverviewMode === 'month' ? 'month' : 'week';
  let selectedClientId = state.clients[0]?.id || null;
  let toastTimer = null;
  let serviceEditingId = null;
  let deleteServiceArmed = false;
  let registryTab = 'clients';
  let packageEditingId = null;
  let deletePackageArmed = false;
  let packagePaymentId = null;
  let cancellingMode = 'payment';
  let paymentMethodEditingId = null;
  let deletePaymentMethodArmed = false;
  let paymentAppointmentId = null;
  let paymentMode = 'complete';
  let cancellingAppointmentId = null;
  let appointmentEditingId = null;
  let packageScheduleDraft = [];
  let debtWarningApprovedClientId = null;
  let dynamicBrandTheme = null;

  function genericAppName() {
    return APP_CONFIG.genericName || 'Painel';
  }

  function workspaceName() {
    return workspace?.name?.trim() || genericAppName();
  }

  function workspaceInitials() {
    const name = workspaceName();
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return 'P';
    if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }

  function applyBranding() {
    const name = workspaceName();
    const initials = workspaceInitials();
    document.title = workspace?.name ? `${name} — Painel` : (APP_CONFIG.title || 'Painel — Agenda e Financeiro');

    const brandName = document.getElementById('brandNameLabel');
    if (brandName) brandName.textContent = name;
    const desktopMark = document.querySelector('#desktopBrandMark span');
    if (desktopMark) desktopMark.textContent = initials;
    const desktopBrand = document.getElementById('desktopBrandMark');
    if (desktopBrand) desktopBrand.setAttribute('aria-label', name);
    const avatar = document.getElementById('profileBtn');
    if (avatar) avatar.textContent = (currentUser?.displayName || workspace?.ownerName || name).trim().charAt(0).toUpperCase() || initials.charAt(0);

    const settingsName = document.getElementById('settingsWorkspaceName');
    const settingsOwner = document.getElementById('settingsOwnerDisplayName');
    const settingsWhatsapp = document.getElementById('settingsWorkspaceWhatsapp');
    if (settingsName) settingsName.value = workspace?.name || '';
    if (settingsOwner) settingsOwner.value = workspace?.ownerName || ownerAccount?.displayName || '';
    if (settingsWhatsapp) settingsWhatsapp.value = workspace?.whatsapp || '';
  }


  function mixRgb(rgb, target, amount) {
    return rgb.map((value, index) => Math.round(value + (target[index] - value) * amount));
  }

  function rgbCss(rgb) {
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  function applyLoginPalette(accent) {
    const root = document.documentElement;
    const base = Array.isArray(accent) ? accent : [83, 98, 115];
    root.style.setProperty('--login-accent', rgbCss(base));
    root.style.setProperty('--login-accent-dark', rgbCss(mixRgb(base, [12, 15, 20], .52)));
    root.style.setProperty('--login-accent-soft', rgbCss(mixRgb(base, [255, 255, 255], .84)));
  }

  function extractLogoAccent(img) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      const chosen = [];
      const fallback = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 180) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const light = (max + min) / 510;
        const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
        if (light > .1 && light < .9) fallback.push([r, g, b]);
        if (saturation > .24 && light > .16 && light < .82) chosen.push([r, g, b]);
      }
      const pixels = chosen.length >= 12 ? chosen : fallback;
      if (!pixels.length) return null;
      return [0, 1, 2].map((channel) => Math.round(pixels.reduce((sum, px) => sum + px[channel], 0) / pixels.length));
    } catch {
      return null;
    }
  }

  function applyLoginBranding() {
    const root = document.documentElement;
    root.style.setProperty('--login-accent', BRANDING_CONFIG.loginFallbackAccent || '#536273');
    root.style.setProperty('--login-accent-dark', BRANDING_CONFIG.loginFallbackDark || '#171b20');
    root.style.setProperty('--login-accent-soft', BRANDING_CONFIG.loginFallbackSoft || '#e9edf1');
    const logoUrl = BRANDING_CONFIG.logoUrl;
    if (!logoUrl) return;
    ['loginBrandLogo', 'loginMobileLogo', 'onboardingBrandLogo'].forEach((id) => {
      const img = document.getElementById(id);
      if (!img) return;
      img.addEventListener('load', () => img.parentElement?.classList.add('has-logo'), { once: true });
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
      img.src = logoUrl;
    });
    if (BRANDING_CONFIG.deriveLoginPalette === false) return;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      const accent = extractLogoAccent(probe);
      if (accent) {
        applyLoginPalette(accent);
        dynamicBrandTheme = brandThemeFromRgb(accent);
        if ((state?.settings?.themeId || DEFAULT_CONFIG.themeId) === 'brand') applyPanelTheme('brand');
      }
    };
    probe.src = logoUrl;
  }

  function brandThemeFromRgb(rgb) {
    const base = Array.isArray(rgb) ? rgb : [83, 98, 115];
    const dark = mixRgb(base, [20, 22, 25], .58);
    const soft = mixRgb(base, [255, 255, 255], .76);
    const nav = mixRgb(base, [255, 255, 255], .62);
    const field = mixRgb(base, [110, 110, 110], .35);
    return {
      ...(THEMES_CONFIG.brand || {}),
      accent: rgbCss(base),
      accentDark: rgbCss(dark),
      accentSoft: rgbCss(soft),
      navActive: rgbCss(nav),
      fieldBorder: rgbCss(field),
      line: `rgba(${dark[0]}, ${dark[1]}, ${dark[2]}, .25)`,
    };
  }

  function getTheme(themeId = state?.settings?.themeId) {
    if (themeId === 'brand' && dynamicBrandTheme) return dynamicBrandTheme;
    return THEMES_CONFIG[themeId] || THEMES_CONFIG[DEFAULT_CONFIG.themeId] || THEMES_CONFIG.brand || {};
  }

  function applyPanelTheme(themeId = state?.settings?.themeId, { persist = false } = {}) {
    const resolvedId = THEMES_CONFIG[themeId] ? themeId : (DEFAULT_CONFIG.themeId || Object.keys(THEMES_CONFIG)[0] || 'brand');
    const theme = getTheme(resolvedId);
    const root = document.documentElement;
    const cssVars = {
      '--bg': theme.background,
      '--surface': theme.surface,
      '--surface-2': theme.surfaceAlt,
      '--ink': theme.text,
      '--muted': theme.muted,
      '--line': theme.line,
      '--accent': theme.accent,
      '--accent-dark': theme.accentDark,
      '--accent-soft': theme.accentSoft,
      '--nav-active': theme.navActive,
      '--field-border': theme.fieldBorder,
    };
    Object.entries(cssVars).forEach(([key, value]) => { if (value) root.style.setProperty(key, value); });
    if (state?.settings) state.settings.themeId = resolvedId;
    if (persist) saveState();

    const financeView = document.getElementById('view-finance');
    if (financeView) {
      if (FINANCE_THEME_CONFIG.financeIncome) financeView.style.setProperty('--finance-green', FINANCE_THEME_CONFIG.financeIncome);
      if (FINANCE_THEME_CONFIG.financePending) financeView.style.setProperty('--finance-yellow', FINANCE_THEME_CONFIG.financePending);
      if (FINANCE_THEME_CONFIG.financeExpense) financeView.style.setProperty('--finance-red', FINANCE_THEME_CONFIG.financeExpense);
      if (FINANCE_THEME_CONFIG.financeTicket) financeView.style.setProperty('--finance-blue', FINANCE_THEME_CONFIG.financeTicket);
      if (FINANCE_THEME_CONFIG.financeBorder) financeView.style.setProperty('--finance-border', FINANCE_THEME_CONFIG.financeBorder);
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && theme.accentDark) themeMeta.setAttribute('content', theme.accentDark);
    renderThemeOptions();
  }

  function renderThemeOptions() {
    const target = document.getElementById('themeOptions');
    if (!target) return;
    const selected = state?.settings?.themeId || DEFAULT_CONFIG.themeId || 'brand';
    target.innerHTML = Object.entries(THEMES_CONFIG).map(([id, baseTheme]) => {
      const theme = id === 'brand' && dynamicBrandTheme ? dynamicBrandTheme : baseTheme;
      return `<button type="button" class="theme-option${selected === id ? ' is-selected' : ''}" data-theme-id="${escapeHtml(id)}" aria-pressed="${selected === id ? 'true' : 'false'}">
        <span class="theme-preview" style="--theme-dark:${escapeHtml(theme.accentDark || '#222')};--theme-accent:${escapeHtml(theme.accent || '#666')};--theme-soft:${escapeHtml(theme.accentSoft || '#ddd')}">
          <i></i><i></i><i></i>
        </span>
        <span class="theme-copy"><strong>${escapeHtml(baseTheme.label || id)}</strong><small>${escapeHtml(baseTheme.description || '')}</small></span>
        <span class="theme-check" aria-hidden="true">✓</span>
      </button>`;
    }).join('');
  }

  function applyConfig() {
    applyLoginBranding();
    applyPanelTheme(state?.settings?.themeId || DEFAULT_CONFIG.themeId || 'brand');
    applyBranding();

    const returnSelect = document.getElementById('returnDaysSelect');
    if (returnSelect) {
      const options = CONFIG.returnDayOptions || [14, 21, 28, 30];
      returnSelect.innerHTML = options.map((days) => `<option value="${Number(days)}">${Number(days)} dias</option>`).join('');
    }

    renderPaymentMethodSelect();

    updateFirstAccessUI();
  }

  function loadWorkspace() {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY)) || null; } catch { return null; }
  }

  function saveWorkspace(nextWorkspace) {
    workspace = nextWorkspace;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(nextWorkspace));
    applyBranding();
    updateFirstAccessUI();
  }

  function loadOwnerAccount() {
    try { return JSON.parse(localStorage.getItem(OWNER_ACCOUNT_KEY)) || null; } catch { return null; }
  }

  function saveOwnerAccount(account) {
    ownerAccount = account;
    localStorage.setItem(OWNER_ACCOUNT_KEY, JSON.stringify(account));
  }

  function readAuthSession() {
    const raw = localStorage.getItem(AUTH_SESSION_KEY) || sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.username ? parsed : null;
    } catch {
      return null;
    }
  }

  function hasAuthSession() {
    if (AUTH_CONFIG.enabled === false) return true;
    currentUser = readAuthSession();
    return Boolean(currentUser);
  }

  function saveAuthSession(user, remember) {
    const payload = JSON.stringify(user);
    localStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(AUTH_SESSION_KEY, payload);
    currentUser = user;
  }

  function updateFirstAccessUI() {
    const box = document.getElementById('firstAccessBox');
    if (box) box.hidden = Boolean(workspace && ownerAccount);
  }

  function updateCurrentUserUI() {
    const line = document.getElementById('currentUserLine');
    const badge = document.getElementById('currentRoleBadge');
    if (line) line.textContent = currentUser ? `Conectado como ${currentUser.displayName || currentUser.username}.` : '';
    if (badge) badge.textContent = currentUser?.role === 'owner' ? 'Responsável' : currentUser?.role === 'admin' ? 'Administrador' : 'Conta';
  }

  function openAuthenticatedApp() {
    const loginScreen = document.getElementById('loginScreen');
    const onboardingScreen = document.getElementById('onboardingScreen');
    const appShell = document.getElementById('appShell');
    if (loginScreen) loginScreen.hidden = true;
    if (onboardingScreen) onboardingScreen.hidden = true;
    if (appShell) appShell.hidden = false;
    document.body.classList.remove('auth-locked');
    applyBranding();
    updateCurrentUserUI();
    renderAll();
  }

  function openLoginScreen(message = '') {
    const loginScreen = document.getElementById('loginScreen');
    const onboardingScreen = document.getElementById('onboardingScreen');
    const appShell = document.getElementById('appShell');
    if (appShell) appShell.hidden = true;
    if (onboardingScreen) onboardingScreen.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
    document.body.classList.add('auth-locked');
    const error = document.getElementById('loginError');
    if (error) error.textContent = message;
    const remember = document.getElementById('rememberLogin');
    if (remember) remember.checked = AUTH_CONFIG.rememberByDefault !== false;
    updateFirstAccessUI();
    setTimeout(() => document.getElementById('loginUser')?.focus(), 60);
  }

  function openOnboardingScreen() {
    if (workspace || ownerAccount) {
      openLoginScreen('O primeiro acesso já foi configurado. Use uma das contas autorizadas.');
      return;
    }
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('appShell').hidden = true;
    document.getElementById('onboardingScreen').hidden = false;
    document.body.classList.add('auth-locked');
    document.getElementById('onboardingError').textContent = '';
    setTimeout(() => document.getElementById('workspaceName')?.focus(), 60);
  }

  function handleOnboarding(event) {
    event.preventDefault();
    if (workspace || ownerAccount) {
      openLoginScreen('O primeiro acesso já foi configurado.');
      return;
    }

    const businessName = document.getElementById('workspaceName').value.trim();
    const displayName = document.getElementById('ownerDisplayName').value.trim();
    const whatsapp = normalizePhone(document.getElementById('workspaceWhatsapp').value);
    const username = document.getElementById('ownerUsername').value.trim();
    const password = document.getElementById('ownerPassword').value;
    const confirm = document.getElementById('ownerPasswordConfirm').value;
    const error = document.getElementById('onboardingError');
    const adminUser = String(AUTH_CONFIG.admin?.username || 'admin');

    if (!businessName || !displayName || username.length < 3 || password.length < 4) {
      error.textContent = 'Preencha o nome do negócio, seu nome, um usuário com 3 caracteres e uma senha com pelo menos 4.';
      return;
    }
    if (username.toLowerCase() === adminUser.toLowerCase()) {
      error.textContent = 'Esse usuário está reservado para a conta administrativa. Escolha outro.';
      return;
    }
    if (password !== confirm) {
      error.textContent = 'As senhas não coincidem.';
      return;
    }

    saveWorkspace({
      name: businessName,
      ownerName: displayName,
      whatsapp,
      createdAt: new Date().toISOString(),
    });
    saveOwnerAccount({ username, password, displayName, role: 'owner', createdAt: new Date().toISOString() });

    // O primeiro cadastro começa com dados operacionais limpos, mantendo apenas serviços e preferências padrão.
    state = defaultState();
    state.clients = [];
    state.appointments = [];
    state.expenses = [];
    saveState();

    saveAuthSession({ username, displayName, role: 'owner' }, true);
    document.getElementById('onboardingForm')?.reset();
    openAuthenticatedApp();
    showToast(`Espaço “${businessName}” criado.`);
  }

  function handleLogin(event) {
    event.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value;
    const error = document.getElementById('loginError');
    const admin = AUTH_CONFIG.admin || { username: 'admin', password: '1234', displayName: 'Administrador', role: 'admin' };
    const owner = ownerAccount;

    let authenticated = null;
    if (user === String(admin.username || '') && password === String(admin.password || '')) {
      authenticated = { username: user, displayName: admin.displayName || 'Administrador', role: 'admin' };
    } else if (owner && user === String(owner.username || '') && password === String(owner.password || '')) {
      authenticated = { username: user, displayName: owner.displayName || workspace?.ownerName || 'Responsável', role: 'owner' };
    }

    if (!authenticated) {
      error.textContent = 'Usuário ou senha incorretos. O acesso é restrito às contas autorizadas.';
      document.getElementById('loginForm')?.classList.remove('login-shake');
      requestAnimationFrame(() => document.getElementById('loginForm')?.classList.add('login-shake'));
      document.getElementById('loginPassword')?.select();
      return;
    }

    const remember = document.getElementById('rememberLogin').checked;
    saveAuthSession(authenticated, remember);
    error.textContent = '';
    document.getElementById('loginForm')?.classList.remove('login-shake');
    openAuthenticatedApp();
  }

  function logout() {
    localStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    currentUser = null;
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    switchView('today');
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    openLoginScreen('');
  }

  function toggleLoginPassword() {
    const input = document.getElementById('loginPassword');
    const button = document.getElementById('togglePasswordBtn');
    if (!input || !button) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        settings: {
          ...base.settings,
          ...(parsed.settings || {}),
          themeId: THEMES_CONFIG[parsed.settings?.themeId] ? parsed.settings.themeId : base.settings.themeId,
          agendaOverviewMode: ['week', 'month'].includes(parsed.settings?.agendaOverviewMode) ? parsed.settings.agendaOverviewMode : base.settings.agendaOverviewMode,
          agendaDayPosition: ['above', 'below'].includes(parsed.settings?.agendaDayPosition) ? parsed.settings.agendaDayPosition : base.settings.agendaDayPosition,
          availability: {
            ...base.settings.availability,
            ...(parsed.settings?.availability || {}),
            blockedDates: Array.isArray(parsed.settings?.availability?.blockedDates) ? [...new Set(parsed.settings.availability.blockedDates.filter(Boolean))] : base.settings.availability.blockedDates,
            days: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, {
              ...base.settings.availability.days[day],
              ...(parsed.settings?.availability?.days?.[day] || parsed.settings?.availability?.days?.[String(day)] || {}),
            }])),
          },
          agendaFields: { ...base.settings.agendaFields, ...(parsed.settings?.agendaFields || {}) },
          financeCollapsed: { ...base.settings.financeCollapsed, ...(parsed.settings?.financeCollapsed || {}) },
        },
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getClient(id) { return state.clients.find((c) => c.id === id); }
  function getService(id) { return state.services.find((s) => s.id === id); }
  function getActiveServices() { return state.services.filter((s) => s.active !== false); }
  function getPaymentMethod(id) { return state.paymentMethods.find((method) => method.id === id); }
  function getActivePaymentMethods() { return state.paymentMethods.filter((method) => method.active !== false); }
  function getPackageTemplate(id) { return state.packageTemplates.find((item) => item.id === id); }
  function getActivePackageTemplates() { return state.packageTemplates.filter((item) => item.active !== false); }
  function getClientPackage(id) { return state.clientPackages.find((item) => item.id === id); }

  function packageTemplateItemLabel(item) {
    const service = getService(item.serviceId);
    return `${Number(item.quantity) || 0}× ${service?.name || item.serviceNameSnapshot || 'Serviço'}`;
  }

  function packageTemplateVisits(template) {
    const items = (template?.items || [])
      .map((item) => ({ ...item, quantity: Math.max(0, Number(item.quantity) || 0) }))
      .filter((item) => item.quantity > 0);
    const visitCount = Math.max(0, ...items.map((item) => item.quantity));
    return Array.from({ length: visitCount }, (_, index) => ({
      number: index + 1,
      items: items
        .filter((item) => item.quantity > index)
        .map((item) => ({
          serviceId: item.serviceId,
          serviceNameSnapshot: getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço',
        })),
    }));
  }

  function appointmentServiceItems(appointment) {
    if (Array.isArray(appointment?.packageVisitItems) && appointment.packageVisitItems.length) return appointment.packageVisitItems;
    if (!appointment?.serviceId) return [];
    return [{ serviceId: appointment.serviceId, serviceNameSnapshot: getService(appointment.serviceId)?.name || 'Serviço' }];
  }

  function appointmentServiceLabel(appointment) {
    const names = appointmentServiceItems(appointment).map((item) => getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço');
    return names.join(' + ') || 'Serviço';
  }

  function appointmentRawDurationMinutes(appointment) {
    const items = appointmentServiceItems(appointment);
    if (!items.length) return 30;
    return Math.max(15, items.reduce((sum, item) => sum + Math.max(15, Number(getService(item.serviceId)?.duration) || 30), 0));
  }

  function packageVisitBlockMinutes(visit) {
    const availability = availabilitySettings();
    const duration = Math.max(15, (visit?.items || []).reduce((sum, item) => sum + Math.max(15, Number(getService(item.serviceId)?.duration) || 30), 0));
    return Math.max(Number(availability.slotMinutes) || 60, duration, 15);
  }

  function clientPackageRemaining(item) {
    return Math.max(0, Number(item.total || 0) - Number(item.used || 0));
  }

  function clientPackageStatus(pkg, referenceDate = today) {
    if (!pkg) return 'inactive';
    if (pkg.cancelled) return 'cancelled';
    if (pkg.paymentStatus === 'pending') return 'pending-payment';
    const allUsed = (pkg.items || []).length > 0 && pkg.items.every((item) => clientPackageRemaining(item) <= 0);
    if (allUsed) return 'completed';
    if (pkg.expiresAt && pkg.expiresAt < referenceDate) return 'expired';
    return 'active';
  }

  function usableClientPackage(clientId, serviceId, dateKey = today) {
    return state.clientPackages
      .filter((pkg) => pkg.clientId === clientId && pkg.paymentStatus === 'received' && !pkg.cancelled)
      .filter((pkg) => (!pkg.purchaseDate || pkg.purchaseDate <= dateKey) && (!pkg.expiresAt || pkg.expiresAt >= dateKey))
      .filter((pkg) => (pkg.items || []).some((item) => item.serviceId === serviceId && clientPackageRemaining(item) > 0))
      .sort((a, b) => String(a.expiresAt || '').localeCompare(String(b.expiresAt || '')))[0] || null;
  }

  function clientPackageItem(pkg, serviceId) {
    return pkg?.items?.find((item) => item.serviceId === serviceId) || null;
  }

  function clientFinancialPending(clientId) {
    const appointments = state.appointments.filter((appointment) => appointment.clientId === clientId && appointment.status === 'done' && appointment.paymentStatus === 'pending');
    const packages = state.clientPackages.filter((pkg) => pkg.clientId === clientId && pkg.paymentStatus === 'pending' && !pkg.cancelled);
    const appointmentValue = appointments.reduce((sum, appointment) => sum + servicePrice(appointment), 0);
    const packageValue = packages.reduce((sum, pkg) => sum + Number(pkg.priceSnapshot || 0), 0);
    return {
      appointments,
      packages,
      count: appointments.length + packages.length,
      value: appointmentValue + packageValue,
    };
  }

  function getAppointments(date) { return state.appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time)); }
  function servicePrice(appointment) { return Number(appointment.priceSnapshot ?? getService(appointment.serviceId)?.price ?? 0); }
  function appointmentRevenue(appointments) { return appointments.reduce((sum, item) => sum + servicePrice(item), 0); }

  function timeToMinutes(value = '') {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function minutesToTime(total) {
    const normalized = Math.max(0, Math.min(1439, Number(total) || 0));
    return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
  }

  function intervalsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
  }

  function availabilitySettings() {
    if (!state.settings.availability) state.settings.availability = defaultAvailability();
    return state.settings.availability;
  }

  function dayAvailability(dateKey) {
    const weekday = dateFromKey(dateKey).getDay();
    return availabilitySettings().days?.[weekday] || defaultAvailability().days[weekday];
  }

  function isBlockedDate(dateKey) {
    return Boolean(dateKey && availabilitySettings().blockedDates?.includes(dateKey));
  }

  function isWorkingDate(dateKey) {
    return Boolean(dateKey && dayAvailability(dateKey)?.enabled && !isBlockedDate(dateKey));
  }

  function serviceBlockMinutes(serviceId) {
    const availability = availabilitySettings();
    const service = getService(serviceId);
    const duration = Number(service?.duration) || 0;
    return Math.max(Number(availability.slotMinutes) || 60, duration || 0, 15);
  }

  function appointmentBlockMinutes(appointment) {
    if (Array.isArray(appointment?.packageVisitItems) && appointment.packageVisitItems.length) {
      return Math.max(Number(availabilitySettings().slotMinutes) || 60, appointmentRawDurationMinutes(appointment), 15);
    }
    return serviceBlockMinutes(appointment.serviceId);
  }

  function theoreticalSlotsForDay(dayConfig, blockMinutes = null) {
    const availability = availabilitySettings();
    if (!dayConfig?.enabled) return [];
    const start = timeToMinutes(dayConfig.start);
    const end = timeToMinutes(dayConfig.end);
    const step = Math.max(15, Number(availability.slotMinutes) || 60);
    const block = Math.max(15, Number(blockMinutes) || step);
    if (start === null || end === null || end <= start) return [];
    const breakStart = dayConfig.breakEnabled ? timeToMinutes(dayConfig.breakStart) : null;
    const breakEnd = dayConfig.breakEnabled ? timeToMinutes(dayConfig.breakEnd) : null;
    const hasBreak = breakStart !== null && breakEnd !== null && breakEnd > breakStart;
    const slots = [];
    for (let cursor = start; cursor + block <= end; cursor += step) {
      const slotEnd = cursor + block;
      if (hasBreak && intervalsOverlap(cursor, slotEnd, breakStart, breakEnd)) continue;
      slots.push(minutesToTime(cursor));
    }
    return slots;
  }

  function availableSlotsForBlock(dateKey, blockMinutes, excludeAppointmentId = null, extraReservations = []) {
    const availability = availabilitySettings();
    if (!availability.enabled || !isWorkingDate(dateKey)) return [];
    const dayConfig = dayAvailability(dateKey);
    const block = Math.max(15, Number(blockMinutes) || Number(availability.slotMinutes) || 60);
    const theoretical = theoreticalSlotsForDay(dayConfig, block);
    const existing = getAppointments(dateKey)
      .filter((appointment) => appointment.status !== 'cancelled' && appointment.id !== excludeAppointmentId)
      .map((appointment) => ({ time: appointment.time, block: appointmentBlockMinutes(appointment) }));
    const reservations = [...existing, ...extraReservations.filter((item) => item?.time && item?.date === dateKey)];
    return theoretical.filter((time) => {
      const start = timeToMinutes(time);
      const end = start + block;
      return !reservations.some((reservation) => {
        const existingStart = timeToMinutes(reservation.time);
        if (existingStart === null) return false;
        const existingEnd = existingStart + Math.max(15, Number(reservation.block) || Number(availability.slotMinutes) || 60);
        return intervalsOverlap(start, end, existingStart, existingEnd);
      });
    });
  }

  function availableSlotsFor(dateKey, serviceId, excludeAppointmentId = null) {
    return availableSlotsForBlock(dateKey, serviceBlockMinutes(serviceId), excludeAppointmentId);
  }

  function statusLabel(status) {
    return { confirmed: 'Confirmado', waiting: 'Aguardando', done: 'Concluído', cancelled: 'Cancelado' }[status] || status;
  }

  function paymentLabel(status) {
    return { received: 'Recebido', pending: 'Pagamento pendente', refunded: 'Devolvido', not_paid: 'Sem recebimento', package: 'Pacote', package_reversed: 'Uso devolvido ao pacote' }[status] || '';
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function closeDialog(dialogId, message = '') {
    const dialog = document.getElementById(dialogId);
    if (dialog?.open) dialog.close();
    if (message) showToast(message);
  }

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-visible', v.id === `view-${viewName}`));
    document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === viewName));
    const view = document.getElementById(`view-${viewName}`);
    document.getElementById('viewTitle').textContent = view?.dataset.title || genericAppName();
    const todayDateLabel = document.getElementById('todayDate');
    const topbarNewAppointment = document.getElementById('topbarNewAppointment');
    if (todayDateLabel) todayDateLabel.hidden = viewName !== 'today';
    if (topbarNewAppointment) topbarNewAppointment.hidden = viewName !== 'today';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'agenda') renderAgenda();
    if (viewName === 'clients') renderRegistries();
    if (viewName === 'finance') renderFinance();
    if (viewName === 'settings') renderSettings();
  }

  function renderToday() {
    document.getElementById('todayDate').textContent = longDate(today);
    const items = getAppointments(today);
    const visibleItems = items.filter((a) => a.status !== 'cancelled');
    const pending = items.filter((a) => ['confirmed', 'waiting'].includes(a.status));
    const next = pending[0];
    document.getElementById('summaryAppointments').textContent = visibleItems.length;
    document.getElementById('summaryPending').textContent = `${pending.length} ${pending.length === 1 ? 'pendente' : 'pendentes'}`;
    document.getElementById('summaryRevenue').textContent = money(appointmentRevenue(visibleItems));
    document.getElementById('summaryNext').textContent = next?.time || '—';
    document.getElementById('summaryNextClient').textContent = next ? firstName(getClient(next.clientId)?.name) : 'Sem atendimento';
    document.getElementById('todayTimeline').innerHTML = timelineMarkup(items, true);
    renderReturnClients();
    renderTomorrow();
  }

  function appointmentWindow(appointment) {
    const durationMinutes = appointmentRawDurationMinutes(appointment);
    const [hour, minute] = String(appointment.time || '00:00').split(':').map(Number);
    const start = dateFromKey(appointment.date);
    start.setHours(hour || 0, minute || 0, 0, 0);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    return { start, end, durationMinutes };
  }

  function appointmentVisualState(appointment, now = new Date()) {
    if (appointment.status === 'cancelled') return { key: 'cancelled', label: 'Cancelado' };
    if (appointment.paymentStatus === 'pending') return { key: 'payment-pending', label: 'Pagamento pendente' };
    if (appointment.paymentStatus === 'refunded') return { key: 'refunded', label: 'Valor devolvido' };

    const { start, end } = appointmentWindow(appointment);
    const isDone = appointment.status === 'done';
    const isPaid = appointment.paymentStatus === 'received';
    const isPackage = appointment.paymentStatus === 'package';

    if (isDone && isPackage) return { key: 'paid', label: 'Concluído · pacote' };
    if (isDone && isPaid) return { key: 'paid', label: 'Concluído · pago' };
    if (isDone && !isPaid) return { key: 'payment-pending', label: 'Concluído · aguardando baixa' };
    if (now < start) return { key: 'upcoming', label: 'Ainda vai ocorrer' };
    if (now >= start && now < end) return { key: 'in-progress', label: 'Em andamento' };
    if (isPaid) return { key: 'paid', label: 'Realizado · pago' };
    return { key: 'past-unsettled', label: 'Horário passado · aguardando baixa' };
  }

  function appointmentStatusChipMarkup(appointment) {
    const visual = appointmentVisualState(appointment);
    return `<span class="appointment-state-chip state-${visual.key}">${escapeHtml(visual.label)}</span>`;
  }

  function appointmentCardMarkup(appointment, condensed = false) {
    const client = getClient(appointment.clientId) || { name: 'Cliente removido', phone: '' };
    const service = getService(appointment.serviceId) || { name: 'Serviço', description: '', price: servicePrice(appointment), duration: null };
    const f = state.settings.agendaFields;
    const meta = [];
    if (f.service) {
      if (appointment.clientPackageId || appointment.packageVisitItems?.length) {
        meta.push(`<span>${escapeHtml(appointment.packageNameSnapshot || 'Pacote')} · ${escapeHtml(appointmentServiceLabel(appointment))}</span>`);
      } else {
        const serviceText = service.description ? `${service.name} · ${service.description}` : service.name;
        meta.push(`<span>${escapeHtml(serviceText)}</span>`);
      }
    }
    if (f.price) meta.push(`<span>${appointment.clientPackageId || appointment.paymentStatus === 'package' ? 'Incluso no pacote' : money(servicePrice(appointment))}</span>`);
    if (f.phone && client.phone) meta.push(`<span>${formatPhone(client.phone)}</span>`);
    if (f.status) meta.push(appointmentStatusChipMarkup(appointment));
    if (appointment.paymentStatus === 'package') meta.push('<span class="package-payment-tag">Pacote utilizado</span>');
    else if (appointment.clientPackageId) meta.push('<span class="package-scheduled-tag">Pacote agendado</span>');
    if (appointment.paymentStatus === 'package_reversed') meta.push('<span class="package-reversed-tag">Uso devolvido</span>');
    if (Number(appointment.rescheduleCount || 0) > 0 && appointment.status !== 'cancelled') meta.push('<span class="rescheduled-tag">Reagendado</span>');
    if (appointment.paymentStatus === 'refunded') meta.push('<span class="payment-refunded-tag">Valor devolvido</span>');
    if (appointment.status === 'cancelled' && appointment.paymentStatus === 'received') meta.push('<span class="payment-retained-tag">Valor mantido</span>');
    if (f.notes && appointment.notes) meta.push(`<span>${escapeHtml(appointment.notes)}</span>`);

    const actions = condensed ? '' : `
      <div class="appointment-actions">
        ${appointment.status !== 'done' && appointment.status !== 'cancelled' ? `<button class="mini-action" data-edit-appointment="${appointment.id}">Editar</button>` : ''}
        ${client.phone ? `<button class="mini-action" data-whatsapp="${client.id}" data-appointment="${appointment.id}">WhatsApp</button>` : ''}
        ${appointment.status !== 'done' && appointment.status !== 'cancelled' ? `<button class="mini-action action-positive" data-complete="${appointment.id}">Concluir</button>` : ''}
        ${appointment.paymentStatus === 'pending' && appointment.status === 'done' ? `<button class="mini-action action-positive" data-mark-paid="${appointment.id}">Receber</button>` : ''}
        ${appointment.status !== 'cancelled' ? `<button class="mini-action action-danger" data-cancel="${appointment.id}">Cancelar</button>` : ''}
      </div>`;

    const visualState = appointmentVisualState(appointment);
    return `
      <div class="appointment-card status-${appointment.status} visual-${visualState.key}">
        <h4>${escapeHtml(client.name)}</h4>
        <div class="appointment-meta">${meta.join('')}</div>
        ${actions}
      </div>`;
  }

  function timelineMarkup(items, condensed = false) {
    if (!items.length) {
      return `<div class="empty-state"><p>Nenhum atendimento marcado para este dia.</p><button class="text-button" data-action="new-appointment">Adicionar atendimento</button></div>`;
    }
    return items.map((item) => `
      <div class="timeline-row">
        <div class="timeline-time">${item.time}</div>
        <span class="timeline-line"></span>
        ${appointmentCardMarkup(item, condensed)}
      </div>`).join('');
  }

  function startOfWeekKey(key) {
    const date = dateFromKey(key);
    const day = date.getDay();
    const mondayOffset = (day + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return localDateKey(date);
  }

  function shiftMonthKey(key, amount) {
    const date = dateFromKey(key);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return localDateKey(date);
  }

  function compactWeekday(key) {
    return dateFromKey(key).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  }

  function overviewWeekMarkup() {
    const start = startOfWeekKey(agendaDate);
    return Array.from({ length: 7 }, (_, index) => shiftDate(start, index)).map((key) => {
      const items = getAppointments(key).filter((a) => a.status !== 'cancelled');
      const selected = key === agendaDate ? ' is-selected' : '';
      const todayClass = key === today ? ' is-today' : '';
      const preview = items.slice(0, 4).map((appointment) => {
        const client = getClient(appointment.clientId);
        const service = getService(appointment.serviceId);
        const visual = appointmentVisualState(appointment);
        return `<span class="week-appointment visual-${visual.key}" title="${escapeHtml(visual.label)}"><b>${appointment.time}</b><em>${escapeHtml(client?.name || 'Cliente')}</em><small>${escapeHtml(service?.name || 'Serviço')}</small><i class="week-state-dot" aria-label="${escapeHtml(visual.label)}"></i></span>`;
      }).join('');
      return `<button type="button" class="week-day-card${selected}${todayClass}" data-agenda-date="${key}">
        <span class="week-day-top"><span><b>${compactWeekday(key)}</b><strong>${dateFromKey(key).getDate()}</strong></span><i>${items.length}</i></span>
        <span class="week-day-list">${preview || '<span class="week-empty">Sem horários</span>'}${items.length > 4 ? `<small class="week-more">+${items.length - 4} horário${items.length - 4 === 1 ? '' : 's'}</small>` : ''}</span>
      </button>`;
    }).join('');
  }

  function overviewMonthMarkup() {
    const date = dateFromKey(agendaDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push('<span class="month-day-spacer" aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      const items = getAppointments(key).filter((a) => a.status !== 'cancelled');
      const classes = `${key === agendaDate ? ' is-selected' : ''}${key === today ? ' is-today' : ''}`;
      const stateDots = items.slice(0, 4).map((appointment) => `<i class="month-state-dot visual-${appointmentVisualState(appointment).key}"></i>`).join('');
      cells.push(`<button type="button" class="month-day${classes}" data-agenda-date="${key}" data-month-day="true">
        <span class="month-day-number">${day}</span>
        ${items.length ? `<span class="month-day-count">${items.length}</span><span class="month-state-dots">${stateDots}</span>` : '<span class="month-day-count is-empty">0</span>'}
      </button>`);
    }
    return `<div class="month-weekdays">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d) => `<span>${d}</span>`).join('')}</div><div class="month-grid">${cells.join('')}</div>`;
  }

  function applyAgendaSectionOrder() {
    const dayPanel = document.getElementById('agendaDayPanel');
    const overviewPanel = document.getElementById('agendaOverviewPanel');
    if (!dayPanel || !overviewPanel) return;
    const dayFirst = state.settings.agendaDayPosition !== 'below';
    dayPanel.style.order = dayFirst ? '1' : '2';
    overviewPanel.style.order = dayFirst ? '2' : '1';
  }

  function renderAgendaOverview() {
    const mode = agendaOverviewMode === 'month' ? 'month' : 'week';
    document.querySelectorAll('[data-agenda-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.agendaMode === mode));
    const weekView = document.getElementById('agendaWeekView');
    const monthView = document.getElementById('agendaMonthView');
    if (weekView) {
      weekView.hidden = mode !== 'week';
      weekView.innerHTML = overviewWeekMarkup();
    }
    if (monthView) {
      monthView.hidden = mode !== 'month';
      monthView.innerHTML = overviewMonthMarkup();
    }
    const label = document.getElementById('agendaOverviewLabel');
    if (label) {
      if (mode === 'week') {
        const start = startOfWeekKey(agendaDate);
        const end = shiftDate(start, 6);
        const startDate = dateFromKey(start);
        const endDate = dateFromKey(end);
        const sameMonth = startDate.getMonth() === endDate.getMonth();
        label.textContent = sameMonth
          ? `${startDate.getDate()}–${endDate.getDate()} de ${endDate.toLocaleDateString('pt-BR', { month: 'long' })}`
          : `${shortDate(start)} – ${shortDate(end)}`;
      } else {
        label.textContent = dateFromKey(agendaDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      }
    }
    applyAgendaSectionOrder();
  }

  function setAgendaOverviewMode(mode, { persistDefault = false } = {}) {
    if (!['week', 'month'].includes(mode)) return;
    agendaOverviewMode = mode;
    if (persistDefault) {
      state.settings.agendaOverviewMode = mode;
      saveState();
    }
    renderAgendaOverview();
  }

  function renderAgenda() {
    document.getElementById('agendaDateLabel').textContent = longDate(agendaDate);
    const dayHeading = document.getElementById('agendaDayHeading');
    if (dayHeading) dayHeading.textContent = dateFromKey(agendaDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    document.getElementById('agendaTimeline').innerHTML = timelineMarkup(getAppointments(agendaDate), false);
    renderAgendaOverview();
  }

  function renderAgendaToggles() {
    const labels = { service: 'Serviço', price: 'Valor', phone: 'Telefone', status: 'Status', notes: 'Observações' };
    document.getElementById('agendaFieldToggles').innerHTML = Object.entries(labels).map(([key, label]) => `
      <label class="toggle-item">
        <span>${label}</span>
        <input type="checkbox" data-agenda-field="${key}" ${state.settings.agendaFields[key] ? 'checked' : ''} />
      </label>`).join('');
  }

  function daysSince(key) {
    const a = dateFromKey(key);
    const b = dateFromKey(today);
    return Math.floor((b - a) / 86400000);
  }

  function lastCompletedForClient(clientId) {
    return state.appointments
      .filter((a) => a.clientId === clientId && a.status === 'done' && a.date <= today)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] || null;
  }

  function renderReturnClients() {
    const threshold = Number(state.settings.returnDays || 21);
    const candidates = state.clients.map((client) => {
      const last = lastCompletedForClient(client.id);
      return { client, last, days: last ? daysSince(last.date) : null };
    }).filter((x) => x.days !== null && x.days >= threshold).sort((a, b) => b.days - a.days);

    document.getElementById('returnCount').textContent = candidates.length;
    document.getElementById('returnClients').innerHTML = candidates.length ? candidates.slice(0, 4).map(({ client, days }) => `
      <div class="compact-client">
        <div><strong>${escapeHtml(client.name)}</strong><small>Último atendimento há ${days} dias</small></div>
        <button class="whatsapp-link" data-whatsapp="${client.id}">Chamar</button>
      </div>`).join('') : `<p class="muted-copy">Nenhum cliente passou do período de retorno configurado.</p>`;
  }

  function renderTomorrow() {
    const item = getAppointments(shiftDate(today, 1)).find((a) => a.status !== 'cancelled');
    const target = document.getElementById('tomorrowPreview');
    if (!item) {
      target.innerHTML = '<p>Nenhum horário marcado para amanhã.</p>';
      return;
    }
    const client = getClient(item.clientId);
    const service = getService(item.serviceId);
    target.innerHTML = `<strong>${item.time} · ${escapeHtml(client?.name || 'Cliente')}</strong><span>${escapeHtml(service?.name || 'Serviço')}</span>`;
  }

  function setRegistryTab(tab) {
    registryTab = ['clients', 'services', 'packages', 'payments'].includes(tab) ? tab : 'clients';
    document.querySelectorAll('[data-registry-tab]').forEach((button) => {
      const active = button.dataset.registryTab === registryTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-registry-panel]').forEach((panel) => {
      const active = panel.dataset.registryPanel === registryTab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (registryTab === 'clients') renderClients(document.getElementById('clientSearch')?.value || '');
    if (registryTab === 'services') renderServicesRegistry();
    if (registryTab === 'packages') renderPackagesRegistry();
    if (registryTab === 'payments') renderPaymentMethods();
  }

  function renderRegistries() {
    setRegistryTab(registryTab);
  }

  function renderServicesRegistry() {
    const target = document.getElementById('servicesSettings');
    if (!target) return;
    target.innerHTML = getActiveServices().map((service) => `
      <article class="service-setting">
        <div class="service-main">
          <strong>${escapeHtml(service.name)}</strong>
          <span class="service-description">${escapeHtml(service.description || 'Sem descrição')}</span>
          <div class="service-meta">
            <span class="service-price">${money(service.price)}</span>
            ${service.duration ? `<span class="service-duration">${service.duration} min</span>` : '<span class="service-duration muted-duration">Duração não definida</span>'}
          </div>
        </div>
        <button class="service-edit-button" data-edit-service="${service.id}" aria-label="Editar ${escapeHtml(service.name)}">
          <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          <span>Editar</span>
        </button>
      </article>`).join('') || '<div class="empty-state registry-empty"><p>Nenhum serviço cadastrado.</p><button class="text-button" type="button" data-open-service>Novo serviço</button></div>';
  }

  function renderPackagesRegistry() {
    const target = document.getElementById('packagesList');
    if (!target) return;
    target.innerHTML = getActivePackageTemplates().map((pkg) => {
      const items = (pkg.items || []).map((item) => packageTemplateItemLabel(item)).join(' · ');
      return `<article class="package-setting">
        <div class="package-setting-main">
          <div class="package-title-row"><strong>${escapeHtml(pkg.name)}</strong><span>${money(pkg.price)}</span></div>
          <span class="package-description">${escapeHtml(pkg.description || items || 'Pacote sem descrição')}</span>
          <div class="package-meta">
            <span>${escapeHtml(items || 'Nenhum serviço')}</span>
            <span>${Number(pkg.validityDays) || 30} dias</span>
            ${pkg.frequency ? `<span>${escapeHtml(pkg.frequency)}</span>` : ''}
          </div>
        </div>
        <button class="service-edit-button" data-edit-package="${pkg.id}" aria-label="Editar ${escapeHtml(pkg.name)}">
          <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>Editar</span>
        </button>
      </article>`;
    }).join('') || '<div class="empty-state registry-empty"><p>Nenhum pacote cadastrado.</p><p class="muted-copy">Crie um modelo combinando os serviços e quantidades que você oferece.</p><button class="text-button" type="button" data-open-package>Novo pacote</button></div>';
  }

  function renderPaymentMethodSelect(selectedValue = '') {
    const paymentSelect = document.getElementById('paymentMethod');
    if (!paymentSelect || !state) return;
    const methods = getActivePaymentMethods();
    paymentSelect.innerHTML = methods.map((method) => `<option value="${escapeHtml(method.name)}">${escapeHtml(method.name)}</option>`).join('');
    if (selectedValue && methods.some((method) => method.name === selectedValue)) paymentSelect.value = selectedValue;
  }

  function renderPaymentMethods() {
    const target = document.getElementById('paymentMethodsList');
    if (!target) return;
    target.innerHTML = state.paymentMethods.map((method) => `
      <article class="payment-method-row${method.active === false ? ' is-inactive' : ''}">
        <div class="payment-method-main">
          <span class="payment-method-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M3 10h18"/><path d="M7 15h3"/></svg></span>
          <div><strong>${escapeHtml(method.name)}</strong><small>${method.active === false ? 'Inativa — não aparece nas novas baixas' : 'Disponível nas baixas de atendimento'}</small></div>
        </div>
        <button class="service-edit-button" data-edit-payment-method="${method.id}" aria-label="Editar ${escapeHtml(method.name)}">
          <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>Editar</span>
        </button>
      </article>`).join('') || '<div class="empty-state registry-empty"><p>Nenhuma forma de pagamento cadastrada.</p><button class="text-button" type="button" data-open-payment-method>Adicionar forma</button></div>';
  }

  function renderClients(filter = '') {
    const normalized = filter.toLocaleLowerCase('pt-BR').trim();
    const clients = state.clients.filter((c) => `${c.name} ${c.phone}`.toLocaleLowerCase('pt-BR').includes(normalized));
    document.getElementById('clientList').innerHTML = clients.map((client) => {
      const last = lastCompletedForClient(client.id);
      return `<button class="client-row ${selectedClientId === client.id ? 'is-selected' : ''}" data-client-id="${client.id}">
        <span class="client-initial">${escapeHtml(client.name.charAt(0).toUpperCase())}</span>
        <span><strong>${escapeHtml(client.name)}</strong><small>${last ? `Última visita: ${shortDate(last.date)}` : 'Sem histórico'}</small></span>
        <span class="chevron">›</span>
      </button>`;
    }).join('') || '<div class="empty-state"><p>Nenhum cliente encontrado.</p></div>';

    if (!selectedClientId || !state.clients.some((c) => c.id === selectedClientId)) selectedClientId = clients[0]?.id || null;
    renderClientDetail(selectedClientId);
  }

  function renderClientDetail(clientId) {
    const target = document.getElementById('clientDetail');
    const client = getClient(clientId);
    if (!client) {
      target.innerHTML = '<p class="muted-copy">Selecione um cliente para ver os detalhes.</p>';
      return;
    }
    const history = state.appointments.filter((a) => a.clientId === client.id && a.status === 'done').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const appointmentPaid = history.filter((a) => a.paymentStatus === 'received').reduce((sum, a) => sum + servicePrice(a), 0);
    const clientPackages = state.clientPackages.filter((pkg) => pkg.clientId === client.id).sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')));
    const packagePaid = clientPackages.filter((pkg) => pkg.paymentStatus === 'received').reduce((sum, pkg) => sum + Number(pkg.priceSnapshot || 0), 0);
    const spent = appointmentPaid + packagePaid;
    const last = history[0];
    const packagesMarkup = clientPackages.length ? clientPackages.map((pkg) => {
      const status = clientPackageStatus(pkg);
      const statusLabels = {
        active: 'Ativo',
        completed: 'Utilizado',
        expired: 'Vencido',
        'pending-payment': 'Aguardando pagamento',
        cancelled: 'Cancelado',
      };
      const itemMarkup = (pkg.items || []).map((item) => {
        const remaining = clientPackageRemaining(item);
        return `<span class="client-package-balance${remaining <= 0 ? ' is-empty' : ''}"><b>${remaining}</b> de ${Number(item.total) || 0} · ${escapeHtml(item.serviceNameSnapshot || getService(item.serviceId)?.name || 'Serviço')}</span>`;
      }).join('');
      return `<article class="client-package-card package-status-${status}">
        <div class="client-package-head">
          <div><strong>${escapeHtml(pkg.nameSnapshot || getPackageTemplate(pkg.templateId)?.name || 'Pacote')}</strong><small>${shortDate(pkg.purchaseDate)} → ${shortDate(pkg.expiresAt)}</small></div>
          <span class="client-package-status">${statusLabels[status] || status}</span>
        </div>
        <div class="client-package-balances">${itemMarkup}</div>
        <div class="client-package-foot">
          <span>${money(pkg.priceSnapshot)} · ${pkg.paymentStatus === 'received' ? `Pago${pkg.paymentMethod ? ` · ${escapeHtml(pkg.paymentMethod)}` : ''}` : 'Pagamento pendente'}</span>
          ${pkg.paymentStatus === 'pending' ? `<button class="mini-action action-positive" data-mark-package-paid="${pkg.id}">Dar baixa</button>` : ''}
        </div>
      </article>`;
    }).join('') : '<p class="muted-copy">Nenhum pacote vinculado a este cliente.</p>';

    target.innerHTML = `
      <div class="client-detail-header">
        <div><p class="eyebrow">Cliente</p><h2>${escapeHtml(client.name)}</h2><p>${client.phone ? formatPhone(client.phone) : 'Sem telefone cadastrado'}</p></div>
        ${client.phone ? `<button class="secondary-action" data-whatsapp="${client.id}">WhatsApp</button>` : ''}
      </div>
      <div class="client-stats">
        <div><strong>${history.length}</strong><small>atendimentos</small></div>
        <div><strong>${money(spent)}</strong><small>total pago</small></div>
        <div><strong>${last ? shortDate(last.date) : '—'}</strong><small>última visita</small></div>
        <div><strong>${client.birthday ? shortDate(`${today.slice(0, 4)}-${client.birthday.slice(5)}`) : '—'}</strong><small>aniversário</small></div>
      </div>
      <div class="note-box">${escapeHtml(client.notes || 'Sem observações registradas.')}</div>
      <div class="client-packages-section">
        <div class="section-heading compact">
          <div><p class="eyebrow">Pacotes</p><h3>Pacotes do cliente</h3></div>
          ${getActivePackageTemplates().length ? `<button class="secondary-action compact-action" data-schedule-package="${client.id}">+ Agendar pacote</button>` : `<button class="text-button" data-open-packages-registry>Cadastrar pacotes</button>`}
        </div>
        <div class="client-packages-list">${packagesMarkup}</div>
      </div>
      <div class="history-list">
        <div class="section-heading compact"><div><p class="eyebrow">Histórico</p><h3>Últimos atendimentos</h3></div></div>
        ${history.slice(0, 6).map((a) => {
          const label = a.clientPackageId ? `${a.packageNameSnapshot || 'Pacote'} · ${appointmentServiceLabel(a)}` : appointmentServiceLabel(a);
          const value = a.paymentStatus === 'package' ? 'Pacote' : money(servicePrice(a));
          return `<div class="history-item"><div><strong>${escapeHtml(label)}</strong><small>${shortDate(a.date)} · ${a.time}${a.paymentStatus === 'package' ? ' · uso de pacote' : ''}</small></div><strong>${value}</strong></div>`;
        }).join('') || '<p class="muted-copy">Ainda não há atendimentos concluídos.</p>'}
      </div>`;
  }

  function applyFinanceCollapseState() {
    document.querySelectorAll('#view-finance [data-collapse-key]').forEach((section) => {
      const key = section.dataset.collapseKey;
      const collapsed = Boolean(state.settings.financeCollapsed?.[key]);
      section.classList.toggle('is-collapsed', collapsed);
      const button = section.querySelector(`[data-collapse-toggle="${key}"]`);
      if (button) {
        button.setAttribute('aria-expanded', String(!collapsed));
        const action = collapsed ? 'Expandir' : 'Recolher';
        const current = button.getAttribute('aria-label') || 'seção';
        const subject = current.replace(/^(Recolher|Expandir)\s+/i, '');
        button.setAttribute('aria-label', `${action} ${subject}`);
      }
    });
  }

  function toggleFinanceSection(key) {
    if (!key) return;
    state.settings.financeCollapsed = state.settings.financeCollapsed || {};
    state.settings.financeCollapsed[key] = !state.settings.financeCollapsed[key];
    saveState();
    applyFinanceCollapseState();
  }

  function renderFinance() {
    const month = today.slice(0, 7);
    const receivedAppointments = state.appointments.filter((a) => a.paymentStatus === 'received' && a.date.startsWith(month));
    const pendingAppointments = state.appointments.filter((a) => a.status === 'done' && a.paymentStatus === 'pending' && a.date.startsWith(month));
    const receivedPackages = state.clientPackages.filter((pkg) => pkg.paymentStatus === 'received' && String(pkg.purchaseDate || '').startsWith(month));
    const pendingPackages = state.clientPackages.filter((pkg) => pkg.paymentStatus === 'pending' && String(pkg.purchaseDate || '').startsWith(month));
    const appointmentRevenueValue = appointmentRevenue(receivedAppointments);
    const packageRevenueValue = receivedPackages.reduce((sum, pkg) => sum + Number(pkg.priceSnapshot || 0), 0);
    const revenue = appointmentRevenueValue + packageRevenueValue;
    const pendingValue = appointmentRevenue(pendingAppointments) + pendingPackages.reduce((sum, pkg) => sum + Number(pkg.priceSnapshot || 0), 0);
    const expenses = state.expenses.filter((e) => e.date.startsWith(month)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const net = revenue - expenses;
    const receivedCount = receivedAppointments.length + receivedPackages.length;
    const pendingCount = pendingAppointments.length + pendingPackages.length;
    const ticket = receivedCount ? revenue / receivedCount : 0;

    const monthName = dateFromKey(`${month}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    document.getElementById('financeMonthLabel').textContent = `Resumo de ${monthLabel}`;
    document.getElementById('financeHeroNet').textContent = money(net);
    document.getElementById('financeHeroRevenue').textContent = money(revenue);
    document.getElementById('financeHeroExpenses').textContent = money(expenses);
    document.getElementById('financeHeroPending').textContent = money(pendingValue);

    const hero = document.querySelector('.finance-dashboard-hero');
    hero?.classList.toggle('is-negative', net < 0);
    hero?.classList.toggle('is-positive', net > 0);
    hero?.classList.toggle('is-neutral', net === 0);

    const heroStatus = document.getElementById('financeHeroStatus');
    if (net > 0) {
      heroStatus.textContent = pendingValue > 0
        ? `${money(net)} permaneceram após as despesas. Ainda há ${money(pendingValue)} para receber.`
        : `${money(net)} permaneceram após descontar todas as despesas registradas.`;
    } else if (net < 0) {
      heroStatus.textContent = pendingValue > 0
        ? `As despesas superam o que já foi recebido em ${money(Math.abs(net))}. Há ${money(pendingValue)} pendentes.`
        : `As despesas superam os recebimentos em ${money(Math.abs(net))} neste mês.`;
    } else {
      heroStatus.textContent = pendingValue > 0
        ? `Receitas e despesas estão equilibradas. Há ${money(pendingValue)} ainda pendentes.`
        : 'Receitas e despesas estão equilibradas neste mês.';
    }

    const weekly = Array.from({ length: 5 }, (_, index) => ({
      label: index < 4 ? `${index * 7 + 1}–${index * 7 + 7}` : '29+',
      income: 0,
      expense: 0,
    }));
    receivedAppointments.forEach((a) => {
      const day = Number(a.date.slice(-2));
      weekly[Math.min(4, Math.floor((day - 1) / 7))].income += servicePrice(a);
    });
    receivedPackages.forEach((pkg) => {
      const day = Number(String(pkg.purchaseDate).slice(-2));
      weekly[Math.min(4, Math.floor((day - 1) / 7))].income += Number(pkg.priceSnapshot || 0);
    });
    state.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => {
      const day = Number(e.date.slice(-2));
      weekly[Math.min(4, Math.floor((day - 1) / 7))].expense += Number(e.amount || 0);
    });
    const maxWeekly = Math.max(1, ...weekly.flatMap((w) => [w.income, w.expense]));
    document.getElementById('financeWeekChart').innerHTML = weekly.map((week) => {
      const incomeHeight = Math.max(week.income > 0 ? 8 : 2, Math.round((week.income / maxWeekly) * 100));
      const expenseHeight = Math.max(week.expense > 0 ? 8 : 2, Math.round((week.expense / maxWeekly) * 100));
      return `<div class="week-chart-group"><div class="week-bars"><span class="week-bar income-bar" style="--bar-height:${incomeHeight}%" title="Entradas: ${money(week.income)}"><i></i></span><span class="week-bar expense-bar" style="--bar-height:${expenseHeight}%" title="Despesas: ${money(week.expense)}"><i></i></span></div><strong>${week.label}</strong></div>`;
    }).join('');
    document.getElementById('financeWeekValues').innerHTML = weekly.map((week) => `<div class="week-value-row"><strong class="week-value-period">${week.label}</strong><span class="week-value-item week-value-income"><i></i><small>Entradas</small><b>${money(week.income)}</b></span><span class="week-value-item week-value-expense"><i></i><small>Despesas</small><b>${money(week.expense)}</b></span></div>`).join('');

    document.getElementById('financeRevenue').textContent = money(revenue);
    document.getElementById('financePending').textContent = money(pendingValue);
    document.getElementById('financeExpenses').textContent = money(expenses);
    document.getElementById('financeNet').textContent = money(net);
    document.getElementById('financeTicket').textContent = money(ticket);
    document.getElementById('financeRevenueNote').textContent = `${receivedCount} ${receivedCount === 1 ? 'recebimento confirmado' : 'recebimentos confirmados'} no mês`;
    document.getElementById('financePendingNote').textContent = `${pendingCount} ${pendingCount === 1 ? 'recebimento aguardando baixa' : 'recebimentos aguardando baixa'}`;
    document.getElementById('financeExpensesNote').textContent = `${state.expenses.filter((e) => e.date.startsWith(month)).length} ${state.expenses.filter((e) => e.date.startsWith(month)).length === 1 ? 'despesa lançada' : 'despesas lançadas'} no mês`;
    document.getElementById('financeNetNote').textContent = net >= 0 ? 'sobrou no caixa após as despesas' : 'mês em resultado negativo';
    document.getElementById('financeTicketNote').textContent = receivedCount ? `${receivedCount} ${receivedCount === 1 ? 'recebimento' : 'recebimentos'} no cálculo` : 'sem recebimentos no período';
    document.getElementById('financeNetCard').classList.toggle('is-negative', net < 0);
    document.getElementById('financeNetCard').classList.toggle('is-positive', net > 0);
    document.getElementById('financeNetCard').classList.toggle('is-neutral', net === 0);
    document.getElementById('financePendingCard').classList.toggle('has-value', pendingValue > 0);

    const pendingAlert = document.getElementById('pendingPaymentAlert');
    pendingAlert.hidden = pendingCount === 0;
    document.getElementById('pendingPaymentsCount').textContent = pendingCount;

    const transactions = [
      ...receivedAppointments.map((a) => ({
        date: a.date,
        time: a.time,
        description: `${getClient(a.clientId)?.name || 'Cliente'} · ${getService(a.serviceId)?.name || 'Serviço'}${a.status === 'cancelled' ? ' · cancelado, valor mantido' : ''}`,
        value: servicePrice(a),
        type: 'income',
      })),
      ...receivedPackages.map((pkg) => ({
        date: pkg.purchaseDate,
        time: '00:01',
        description: `${getClient(pkg.clientId)?.name || 'Cliente'} · Pacote ${pkg.nameSnapshot || 'contratado'}`,
        value: Number(pkg.priceSnapshot || 0),
        type: 'income',
      })),
      ...state.expenses.filter((e) => e.date.startsWith(month)).map((e) => ({ date: e.date, time: '00:00', description: e.description, value: Number(e.amount), type: 'expense' })),
    ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    document.getElementById('transactionsList').innerHTML = transactions.slice(0, 12).map((t) => `<div class="transaction-row"><div><strong>${escapeHtml(t.description)}</strong><small>${shortDate(t.date)}</small></div><strong class="transaction-value ${t.type === 'expense' ? 'negative' : ''}">${t.type === 'expense' ? '− ' : '+ '}${money(t.value)}</strong></div>`).join('') || '<p class="muted-copy">Nenhuma movimentação registrada neste mês.</p>';

    const pendingRows = [
      ...pendingAppointments.map((a) => ({ type: 'appointment', id: a.id, clientId: a.clientId, date: a.date, label: getService(a.serviceId)?.name || 'Serviço', value: servicePrice(a) })),
      ...pendingPackages.map((pkg) => ({ type: 'package', id: pkg.id, clientId: pkg.clientId, date: pkg.purchaseDate, label: `Pacote ${pkg.nameSnapshot || ''}`.trim(), value: Number(pkg.priceSnapshot || 0) })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    document.getElementById('pendingPaymentsList').innerHTML = pendingRows.length ? pendingRows.map((item) => `<div class="pending-payment-row"><div><strong>${escapeHtml(getClient(item.clientId)?.name || 'Cliente')}</strong><small>${shortDate(item.date)} · ${escapeHtml(item.label)}</small></div><div class="pending-payment-value"><strong>${money(item.value)}</strong><button class="mini-action action-positive" ${item.type === 'package' ? `data-mark-package-paid="${item.id}"` : `data-mark-paid="${item.id}"`}>Marcar recebido</button></div></div>`).join('') : '<p class="muted-copy">Nenhum pagamento pendente neste mês.</p>';

    const completed = state.appointments.filter((a) => a.status === 'done' && a.date.startsWith(month));
    const activeServices = getActiveServices();
    const counts = activeServices.map((service) => ({ service, count: completed.filter((a) => a.serviceId === service.id).length })).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...counts.map((x) => x.count));
    document.getElementById('serviceRanking').innerHTML = counts.map(({ service, count }) => `<div class="ranking-row"><div><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.description || '')}${service.description ? ' · ' : ''}${count} ${count === 1 ? 'atendimento' : 'atendimentos'}</small></div><strong>${count}</strong><div class="ranking-meter"><i style="width:${Math.round((count / max) * 100)}%"></i></div></div>`).join('') || '<p class="muted-copy">Nenhum serviço ativo.</p>';

    applyFinanceCollapseState();
  }

  function renderAvailabilitySettings() {
    const availability = availabilitySettings();
    const enabledInput = document.getElementById('availabilityEnabled');
    const config = document.getElementById('availabilityConfig');
    const fixedConfig = document.getElementById('availabilityFixedConfig');
    const slotInput = document.getElementById('availabilitySlotMinutes');
    const daysTarget = document.getElementById('availabilityDays');
    const preview = document.getElementById('availabilityPreview');
    const blockedTarget = document.getElementById('availabilityBlockedDates');
    const blockedDateInput = document.getElementById('availabilityBlockedDate');
    if (!enabledInput || !config || !fixedConfig || !slotInput || !daysTarget || !preview || !blockedTarget) return;

    enabledInput.checked = Boolean(availability.enabled);
    config.hidden = false;
    fixedConfig.hidden = !availability.enabled;
    slotInput.value = String(Math.max(15, Number(availability.slotMinutes) || 60));
    if (blockedDateInput && !blockedDateInput.value) blockedDateInput.min = today;

    daysTarget.innerHTML = WEEKDAY_LABELS.map((label, day) => {
      const dayConfig = availability.days?.[day] || defaultAvailability().days[day];
      const slots = availability.enabled ? theoreticalSlotsForDay(dayConfig, Math.max(15, Number(availability.slotMinutes) || 60)) : [];
      const subtitle = !dayConfig.enabled
        ? 'Sem atendimento'
        : availability.enabled
          ? `${slots.length} ${slots.length === 1 ? 'horário' : 'horários'} na grade`
          : 'Atende neste dia · horário livre';
      return `<article class="availability-day${dayConfig.enabled ? ' is-enabled' : ''}" data-availability-day="${day}">
        <div class="availability-day-head">
          <div><strong>${label}</strong><small>${subtitle}</small></div>
          <label class="toggle-item availability-day-toggle"><span>${dayConfig.enabled ? 'Ativo' : 'Fechado'}</span><input type="checkbox" data-availability-field="enabled" ${dayConfig.enabled ? 'checked' : ''}></label>
        </div>
        <div class="availability-day-fields" ${dayConfig.enabled && availability.enabled ? '' : 'hidden'}>
          <div class="availability-time-pair"><label>Início<input type="time" data-availability-field="start" value="${escapeHtml(dayConfig.start || '08:00')}"></label><label>Fim<input type="time" data-availability-field="end" value="${escapeHtml(dayConfig.end || '18:00')}"></label></div>
          <label class="toggle-item availability-break-toggle"><span>Usar pausa / almoço</span><input type="checkbox" data-availability-field="breakEnabled" ${dayConfig.breakEnabled ? 'checked' : ''}></label>
          <div class="availability-time-pair availability-break-fields" ${dayConfig.breakEnabled ? '' : 'hidden'}><label>Início da pausa<input type="time" data-availability-field="breakStart" value="${escapeHtml(dayConfig.breakStart || '12:00')}"></label><label>Fim da pausa<input type="time" data-availability-field="breakEnd" value="${escapeHtml(dayConfig.breakEnd || '13:00')}"></label></div>
        </div>
      </article>`;
    }).join('');

    const blockedDates = [...new Set(availability.blockedDates || [])].sort();
    blockedTarget.innerHTML = blockedDates.length
      ? blockedDates.map((dateKey) => `<div class="blocked-date-chip"><span>${escapeHtml(dateFromKey(dateKey).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', ''))}</span><button type="button" data-remove-blocked-date="${escapeHtml(dateKey)}" aria-label="Remover data bloqueada">×</button></div>`).join('')
      : '<span class="availability-empty-blocks">Nenhuma data específica bloqueada.</span>';

    if (!availability.enabled) {
      preview.innerHTML = '<strong>Horário livre nos dias ativos</strong><span>Ao criar um atendimento, você escolhe qualquer horário. Dias fechados e datas bloqueadas continuam sendo respeitados.</span>';
      return;
    }

    const firstEnabledDay = Object.entries(availability.days || {}).find(([, item]) => item?.enabled);
    if (!firstEnabledDay) {
      preview.innerHTML = '<strong>Nenhum dia ativo</strong><span>Ative pelo menos um dia para gerar horários disponíveis.</span>';
      return;
    }
    const [dayKey, dayConfig] = firstEnabledDay;
    const slots = theoreticalSlotsForDay(dayConfig, Math.max(15, Number(availability.slotMinutes) || 60));
    preview.innerHTML = `<div><strong>Exemplo · ${WEEKDAY_LABELS[Number(dayKey)]}</strong><span>${slots.length} ${slots.length === 1 ? 'horário disponível' : 'horários disponíveis'} na grade</span></div><div class="availability-preview-slots">${slots.slice(0, 10).map((slot) => `<span>${slot}</span>`).join('')}${slots.length > 10 ? `<span>+${slots.length - 10}</span>` : ''}</div>`;
  }

  function updateAvailabilityDayFromInput(input) {
    const card = input.closest('[data-availability-day]');
    if (!card) return;
    const day = Number(card.dataset.availabilityDay);
    if (!Number.isInteger(day) || day < 0 || day > 6) return;
    const availability = availabilitySettings();
    const dayConfig = availability.days[day] || (availability.days[day] = { ...defaultAvailability().days[day] });
    const field = input.dataset.availabilityField;
    if (!field) return;
    if (field === 'enabled' || field === 'breakEnabled') dayConfig[field] = input.checked;
    else dayConfig[field] = input.value;

    const start = timeToMinutes(dayConfig.start);
    const end = timeToMinutes(dayConfig.end);
    if (dayConfig.enabled && start !== null && end !== null && end <= start) {
      showToast('O horário final precisa ser maior que o horário inicial.');
      dayConfig.end = minutesToTime(Math.min(1439, start + 60));
    }
    const breakStart = timeToMinutes(dayConfig.breakStart);
    const breakEnd = timeToMinutes(dayConfig.breakEnd);
    if (dayConfig.breakEnabled && breakStart !== null && breakEnd !== null && breakEnd <= breakStart) {
      showToast('O fim da pausa precisa ser maior que o início.');
      dayConfig.breakEnd = minutesToTime(Math.min(1439, breakStart + 60));
    }
    saveState();
    renderAvailabilitySettings();
  }

  function renderSettings() {
    document.getElementById('defaultGapInput').value = String(state.settings.defaultGap ?? DEFAULT_CONFIG.defaultGapMinutes ?? 15);
    document.getElementById('returnDaysSelect').value = String(state.settings.returnDays ?? DEFAULT_CONFIG.returnDays ?? 21);
    const agendaDayPositionSelect = document.getElementById('agendaDayPositionSelect');
    const agendaOverviewModeSelect = document.getElementById('agendaOverviewModeSelect');
    if (agendaDayPositionSelect) agendaDayPositionSelect.value = state.settings.agendaDayPosition || 'above';
    if (agendaOverviewModeSelect) agendaOverviewModeSelect.value = state.settings.agendaOverviewMode || 'week';
    const settingsName = document.getElementById('settingsWorkspaceName');
    const settingsOwner = document.getElementById('settingsOwnerDisplayName');
    const settingsWhatsapp = document.getElementById('settingsWorkspaceWhatsapp');
    if (settingsName) settingsName.value = workspace?.name || '';
    if (settingsOwner) settingsOwner.value = workspace?.ownerName || ownerAccount?.displayName || '';
    if (settingsWhatsapp) settingsWhatsapp.value = workspace?.whatsapp || '';
    updateCurrentUserUI();
    renderThemeOptions();
    renderAgendaToggles();
    renderAvailabilitySettings();
  }

  function saveWorkspaceSettings(event) {
    event.preventDefault();
    if (!workspace || !ownerAccount) {
      showToast('Configure primeiro o acesso do responsável pela tela inicial.');
      return;
    }
    const name = document.getElementById('settingsWorkspaceName').value.trim();
    const ownerName = document.getElementById('settingsOwnerDisplayName').value.trim();
    const whatsapp = normalizePhone(document.getElementById('settingsWorkspaceWhatsapp').value);
    if (!name || !ownerName) {
      showToast('Informe o nome do negócio e do responsável.');
      return;
    }
    saveWorkspace({ ...workspace, name, ownerName, whatsapp, updatedAt: new Date().toISOString() });
    saveOwnerAccount({ ...ownerAccount, displayName: ownerName });
    if (currentUser?.role === 'owner') {
      currentUser = { ...currentUser, displayName: ownerName };
      const remember = Boolean(localStorage.getItem(AUTH_SESSION_KEY));
      saveAuthSession(currentUser, remember);
    }
    renderSettings();
    renderToday();
    showToast('Identidade do espaço atualizada.');
  }

  function nextWorkingDate(startKey, maxDays = 14) {
    let key = startKey || today;
    for (let offset = 0; offset <= maxDays; offset += 1) {
      const candidate = offset ? shiftDate(key, offset) : key;
      if (isWorkingDate(candidate)) return candidate;
    }
    return key;
  }

  function syncPackageScheduleDraftFromDom() {
    document.querySelectorAll('[data-package-visit-row]').forEach((row) => {
      const index = Number(row.dataset.packageVisitRow);
      if (!Number.isInteger(index) || !packageScheduleDraft[index]) return;
      const dateInput = row.querySelector('[data-package-visit-date]');
      const timeInput = row.querySelector('[data-package-visit-time]');
      if (dateInput?.value) packageScheduleDraft[index].date = dateInput.value;
      if (timeInput?.value) packageScheduleDraft[index].time = timeInput.value;
    });
  }

  function buildPackageScheduleDraft(template, baseDate = agendaDate || today) {
    const visits = packageTemplateVisits(template);
    const first = nextWorkingDate(baseDate || today, 21);
    packageScheduleDraft = visits.map((visit, index) => {
      const target = nextWorkingDate(shiftDate(first, index * 7), 7);
      return { ...visit, date: target, time: '09:00' };
    });
  }

  function renderAppointmentPackageSchedule() {
    const target = document.getElementById('appointmentPackageSchedule');
    if (!target) return;
    const availability = availabilitySettings();
    const reservations = [];
    let invalid = false;
    target.innerHTML = packageScheduleDraft.map((visit, index) => {
      const block = packageVisitBlockMinutes(visit);
      const serviceNames = visit.items.map((item) => getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço').join(' + ');
      const dateKey = visit.date || today;
      const dayValid = isWorkingDate(dateKey);
      let timeControl = '';
      let helper = `${block} min reservados`;
      if (availability.enabled) {
        const slots = dayValid ? availableSlotsForBlock(dateKey, block, null, reservations) : [];
        const selected = slots.includes(visit.time) ? visit.time : (slots[0] || '');
        packageScheduleDraft[index].time = selected;
        if (selected) reservations.push({ date: dateKey, time: selected, block });
        if (!slots.length) invalid = true;
        const optionHtml = slots.length ? slots.map((slot) => `<option value="${slot}" ${slot === selected ? 'selected' : ''}>${slot}</option>`).join('') : `<option value="">${dayValid ? 'Nenhum horário disponível' : 'Dia sem atendimento'}</option>`;
        timeControl = `<select data-package-visit-time ${slots.length ? '' : 'disabled'}>${optionHtml}</select>`;
        helper = slots.length ? `${slots.length} opções · ${block} min reservados` : (isBlockedDate(dateKey) ? 'Data bloqueada nos Ajustes' : 'Sem horário disponível para esta visita');
      } else {
        const selected = visit.time || '09:00';
        packageScheduleDraft[index].time = selected;
        if (!dayValid) invalid = true;
        reservations.push({ date: dateKey, time: selected, block });
        timeControl = `<input type="time" data-package-visit-time value="${selected}" ${dayValid ? '' : 'disabled'} />`;
        helper = dayValid ? `${block} min estimados` : (isBlockedDate(dateKey) ? 'Data bloqueada nos Ajustes' : 'Esse dia está marcado como sem atendimento');
      }
      return `<article class="package-schedule-row" data-package-visit-row="${index}">
        <div class="package-schedule-row-head"><div><strong>Visita ${visit.number}</strong><span>${escapeHtml(serviceNames)}</span></div><span class="package-visit-badge">${visit.items.length} ${visit.items.length === 1 ? 'serviço' : 'serviços'}</span></div>
        <div class="form-row"><label>Data<input type="date" data-package-visit-date value="${dateKey}" /></label><label>Horário${timeControl}<small class="field-help">${escapeHtml(helper)}</small></label></div>
      </article>`;
    }).join('') || '<div class="empty-state"><p>Este pacote ainda não possui serviços configurados.</p></div>';
    const saveButton = document.getElementById('saveAppointmentBtn');
    if (saveButton && document.getElementById('appointmentType')?.value === 'package') saveButton.disabled = invalid || !packageScheduleDraft.length;
  }

  function updateAppointmentPackagePreview(resetSchedule = false) {
    const template = getPackageTemplate(document.getElementById('appointmentPackageTemplate')?.value);
    const preview = document.getElementById('appointmentPackagePreview');
    if (!template || !preview) {
      if (preview) preview.innerHTML = '<p class="muted-copy">Cadastre um pacote em Cadastros para utilizá-lo aqui.</p>';
      packageScheduleDraft = [];
      renderAppointmentPackageSchedule();
      return;
    }
    preview.innerHTML = `<div><strong>${escapeHtml(template.name)}</strong><span>${money(template.price)} · validade de ${Number(template.validityDays) || 30} dias${template.frequency ? ` · ${escapeHtml(template.frequency)}` : ''}</span></div><div class="package-purchase-items">${(template.items || []).map((item) => `<span>${packageTemplateItemLabel(item)}</span>`).join('')}</div>`;
    document.getElementById('appointmentPackagePaymentMethodWrap').hidden = document.getElementById('appointmentPackagePaymentStatus').value !== 'received';
    if (resetSchedule || !packageScheduleDraft.length) buildPackageScheduleDraft(template, agendaDate || today);
    renderAppointmentPackageSchedule();
  }

  function updateAppointmentMode(resetPackageSchedule = false) {
    const editing = Boolean(appointmentEditingId);
    const appointment = editing ? state.appointments.find((item) => item.id === appointmentEditingId) : null;
    const typeSelect = document.getElementById('appointmentType');
    const typeWrap = document.getElementById('appointmentTypeWrap');
    const serviceFields = document.getElementById('appointmentServiceFields');
    const packageFields = document.getElementById('appointmentPackageFields');
    const serviceSelect = document.getElementById('appointmentService');
    const packageSelect = document.getElementById('appointmentPackageTemplate');
    const packageEditHint = document.getElementById('appointmentPackageEditHint');

    if (editing) {
      if (typeWrap) typeWrap.hidden = true;
      if (typeSelect) typeSelect.value = 'service';
      if (serviceFields) serviceFields.hidden = false;
      if (packageFields) packageFields.hidden = true;
      if (serviceSelect) serviceSelect.disabled = Boolean(appointment?.clientPackageId);
      if (packageEditHint) {
        packageEditHint.hidden = !appointment?.clientPackageId;
        packageEditHint.innerHTML = appointment?.clientPackageId ? `<strong>${escapeHtml(appointment.packageNameSnapshot || 'Pacote')}</strong><span>${escapeHtml(appointmentServiceLabel(appointment))} · altere apenas data, horário, status ou observação.</span>` : '';
      }
      updateAppointmentTimeControl(appointment?.time || null);
      return;
    }

    if (typeWrap) typeWrap.hidden = false;
    if (serviceSelect) serviceSelect.disabled = false;
    if (packageEditHint) packageEditHint.hidden = true;
    const type = typeSelect?.value === 'package' ? 'package' : 'service';
    if (serviceFields) serviceFields.hidden = type !== 'service';
    if (packageFields) packageFields.hidden = type !== 'package';
    if (serviceSelect) serviceSelect.required = type === 'service';
    if (packageSelect) packageSelect.required = type === 'package';
    if (type === 'service') {
      updateAppointmentTimeControl();
    } else {
      updateAppointmentPackagePreview(resetPackageSchedule);
    }
  }

  function updateAppointmentTimeControl(preferredTime = null) {
    const availability = availabilitySettings();
    const freeWrap = document.querySelector('.appointment-time-free-wrap');
    const freeInput = document.getElementById('appointmentTime');
    const slotWrap = document.getElementById('appointmentTimeSlotWrap');
    const slotSelect = document.getElementById('appointmentTimeSlot');
    const help = document.getElementById('appointmentTimeHelp');
    const saveButton = document.getElementById('saveAppointmentBtn');
    if (!freeWrap || !freeInput || !slotWrap || !slotSelect || !help || !saveButton) return;

    const manualToggleWrap = document.getElementById('appointmentManualTimeWrap');
    const manualToggle = document.getElementById('appointmentManualTimeOverride');
    const usingManualOverride = Boolean(availability.enabled && appointmentEditingId && manualToggle?.checked);
    if (manualToggleWrap) manualToggleWrap.hidden = !(availability.enabled && appointmentEditingId);

    if (!availability.enabled || usingManualOverride) {
      freeWrap.hidden = false;
      slotWrap.hidden = true;
      freeInput.disabled = false;
      freeInput.required = true;
      slotSelect.disabled = true;
      slotSelect.required = false;
      if (preferredTime) freeInput.value = preferredTime;

      const date = document.getElementById('appointmentDate').value;
      if (date && isBlockedDate(date)) {
        saveButton.disabled = true;
        help.textContent = 'Essa data foi marcada como folga ou indisponível nos Ajustes.';
        return;
      }
      if (date && !dayAvailability(date)?.enabled) {
        saveButton.disabled = true;
        help.textContent = 'Esse dia da semana está marcado como sem atendimento nos Ajustes.';
        return;
      }
      saveButton.disabled = false;
      help.textContent = usingManualOverride ? 'Ajuste manual ativo: o horário pode ficar fora da grade padrão.' : (date ? 'Horário livre dentro de um dia ativo.' : 'Escolha a data e informe o horário.');
      return;
    }

    freeWrap.hidden = true;
    slotWrap.hidden = false;
    freeInput.disabled = true;
    freeInput.required = false;
    slotSelect.disabled = false;
    slotSelect.required = true;

    const date = document.getElementById('appointmentDate').value;
    const serviceId = document.getElementById('appointmentService').value;
    const editingAppointment = appointmentEditingId ? state.appointments.find((item) => item.id === appointmentEditingId) : null;
    const dayConfig = date ? dayAvailability(date) : null;
    const packageEditBlock = editingAppointment?.clientPackageId ? appointmentBlockMinutes(editingAppointment) : null;
    const slots = date
      ? (packageEditBlock ? availableSlotsForBlock(date, packageEditBlock, appointmentEditingId) : (serviceId ? availableSlotsFor(date, serviceId, appointmentEditingId) : []))
      : [];
    const previous = preferredTime || slotSelect.value;

    if (date && isBlockedDate(date)) {
      slotSelect.innerHTML = '<option value="">Data bloqueada</option>';
      slotSelect.value = '';
      slotSelect.disabled = true;
      saveButton.disabled = true;
      help.textContent = 'Essa data foi marcada como folga ou indisponível nos Ajustes.';
      return;
    }

    if (!dayConfig?.enabled) {
      slotSelect.innerHTML = '<option value="">Dia sem atendimento configurado</option>';
      slotSelect.value = '';
      slotSelect.disabled = true;
      saveButton.disabled = true;
      help.textContent = 'Esse dia está marcado como fechado nos Ajustes.';
      return;
    }

    if (!slots.length) {
      slotSelect.innerHTML = '<option value="">Nenhum horário disponível</option>';
      slotSelect.value = '';
      slotSelect.disabled = true;
      saveButton.disabled = true;
      help.textContent = 'Todos os horários estão ocupados ou não comportam a duração deste serviço.';
      return;
    }

    slotSelect.innerHTML = slots.map((slot) => `<option value="${slot}">${slot}</option>`).join('');
    slotSelect.value = slots.includes(previous) ? previous : slots[0];
    slotSelect.disabled = false;
    saveButton.disabled = false;
    const block = packageEditBlock || serviceBlockMinutes(serviceId);
    help.textContent = `${slots.length} ${slots.length === 1 ? 'horário disponível' : 'horários disponíveis'} · bloco reservado de ${block} min.`;
  }

  function updateAppointmentDebtHint() {
    const hint = document.getElementById('appointmentDebtHint');
    if (!hint) return;
    const clientId = document.getElementById('appointmentClient')?.value;
    const pending = clientId ? clientFinancialPending(clientId) : { count: 0, value: 0 };
    hint.hidden = !pending.count || Boolean(appointmentEditingId);
    if (pending.count) {
      hint.innerHTML = `<strong>Pendência financeira</strong><span>Há ${money(pending.value)} em ${pending.count} ${pending.count === 1 ? 'recebimento pendente' : 'recebimentos pendentes'}.</span>`;
    } else {
      hint.innerHTML = '';
    }
  }

  function populateAppointmentForm(date = agendaDate, appointment = null) {
    const clients = state.clients;
    const services = getActiveServices();
    const packages = getActivePackageTemplates();
    document.getElementById('appointmentClient').innerHTML = clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('appointmentService').innerHTML = services.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}${s.description ? ` — ${escapeHtml(s.description)}` : ''} · ${money(s.price)}</option>`).join('');
    document.getElementById('appointmentPackageTemplate').innerHTML = packages.length
      ? packages.map((pkg) => `<option value="${pkg.id}">${escapeHtml(pkg.name)} · ${money(pkg.price)}</option>`).join('')
      : '<option value="">Nenhum pacote cadastrado</option>';
    document.getElementById('appointmentClient').value = appointment?.clientId || clients[0]?.id || '';
    document.getElementById('appointmentService').value = appointment?.serviceId || services[0]?.id || '';
    document.getElementById('appointmentDate').value = appointment?.date || date;
    document.getElementById('appointmentTime').value = appointment?.time || '09:00';
    document.getElementById('appointmentStatus').value = appointment?.status === 'waiting' ? 'waiting' : 'confirmed';
    document.getElementById('appointmentNotes').value = appointment?.notes || '';
    document.getElementById('appointmentType').value = 'service';
    document.getElementById('appointmentPackagePurchaseDate').value = date || today;
    document.getElementById('appointmentPackagePaymentStatus').value = 'received';
    const methods = getActivePaymentMethods();
    document.getElementById('appointmentPackagePaymentMethod').innerHTML = methods.length
      ? methods.map((method) => `<option value="${escapeHtml(method.name)}">${escapeHtml(method.name)}</option>`).join('')
      : '<option value="">Nenhuma forma cadastrada</option>';
    packageScheduleDraft = [];
    const manualToggle = document.getElementById('appointmentManualTimeOverride');
    if (manualToggle) manualToggle.checked = false;
    debtWarningApprovedClientId = null;
    updateAppointmentMode(true);
    updateAppointmentDebtHint();
  }

  function setAppointmentDialogMode(editing = false) {
    const title = document.getElementById('appointmentDialogTitle');
    const saveButton = document.getElementById('saveAppointmentBtn');
    const closeButton = document.querySelector('#appointmentDialog [data-close-dialog="appointmentDialog"]');
    const cancelButton = document.querySelector('#appointmentDialog .dialog-actions [data-close-dialog="appointmentDialog"]');
    const message = editing ? 'Edição do atendimento cancelada.' : 'Cadastro de novo atendimento cancelado.';
    if (title) title.textContent = editing ? 'Editar atendimento' : 'Novo atendimento';
    if (saveButton) saveButton.textContent = editing ? 'Salvar alterações' : 'Salvar atendimento';
    if (closeButton) closeButton.dataset.cancelMessage = message;
    if (cancelButton) cancelButton.dataset.cancelMessage = message;
  }

  function openAppointmentDialog() {
    if (!state.clients.length) {
      showToast('Cadastre pelo menos um cliente antes de criar um atendimento.');
      return;
    }
    if (!getActiveServices().length && !getActivePackageTemplates().length) {
      showToast('Cadastre pelo menos um serviço ou pacote em Cadastros antes de criar um atendimento.');
      return;
    }
    appointmentEditingId = null;
    setAppointmentDialogMode(false);
    populateAppointmentForm(agendaDate || today);
    if (!getActiveServices().length && getActivePackageTemplates().length) {
      document.getElementById('appointmentType').value = 'package';
      updateAppointmentMode(true);
    }
    document.getElementById('appointmentDialog').showModal();
  }

  function openEditAppointmentDialog(id) {
    const appointment = state.appointments.find((item) => item.id === id);
    if (!appointment || appointment.status === 'done' || appointment.status === 'cancelled') return;
    appointmentEditingId = id;
    setAppointmentDialogMode(true);
    populateAppointmentForm(appointment.date, appointment);
    document.getElementById('appointmentDialog').showModal();
  }

  function openDebtWarning(clientId) {
    const client = getClient(clientId);
    const pending = clientFinancialPending(clientId);
    if (!client || !pending.count) return false;
    document.getElementById('debtWarningClientName').textContent = client.name;
    document.getElementById('debtWarningAmount').textContent = money(pending.value);
    document.getElementById('debtWarningCount').textContent = `${pending.count} ${pending.count === 1 ? 'pendência' : 'pendências'} sem baixa`;
    const details = [
      ...pending.appointments.map((appointment) => `${shortDate(appointment.date)} · ${getService(appointment.serviceId)?.name || 'Serviço'} · ${money(servicePrice(appointment))}`),
      ...pending.packages.map((pkg) => `${shortDate(pkg.purchaseDate || today)} · Pacote ${pkg.nameSnapshot || ''} · ${money(pkg.priceSnapshot || 0)}`),
    ];
    document.getElementById('debtWarningItems').innerHTML = details.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
    document.getElementById('debtWarningDialog').showModal();
    return true;
  }

  function savePackageAppointmentFlow() {
    const clientId = document.getElementById('appointmentClient').value;
    const template = getPackageTemplate(document.getElementById('appointmentPackageTemplate').value);
    const purchaseDate = document.getElementById('appointmentPackagePurchaseDate').value;
    const paymentStatus = document.getElementById('appointmentPackagePaymentStatus').value;
    const paymentMethod = paymentStatus === 'received' ? document.getElementById('appointmentPackagePaymentMethod').value : null;
    const status = document.getElementById('appointmentStatus').value;
    const notes = document.getElementById('appointmentNotes').value.trim();
    const client = getClient(clientId);
    if (!client || !template || !purchaseDate) return showToast('Confira cliente, pacote e data da venda.');
    if (paymentStatus === 'received' && !paymentMethod) return showToast('Cadastre uma forma de pagamento para registrar o pacote como recebido.');

    syncPackageScheduleDraftFromDom();
    if (!packageScheduleDraft.length) return showToast('Este pacote não possui visitas para agendar.');

    if (debtWarningApprovedClientId !== clientId) {
      const pending = clientFinancialPending(clientId);
      if (pending.count && openDebtWarning(clientId)) return;
    }

    const expiresAt = shiftDate(purchaseDate, Math.max(1, Number(template.validityDays) || 30));
    const availability = availabilitySettings();
    const reservations = [];
    for (const visit of packageScheduleDraft) {
      if (!visit.date || !visit.time) return showToast(`Defina data e horário da visita ${visit.number}.`);
      if (!isWorkingDate(visit.date)) return showToast(`A visita ${visit.number} está em um dia sem atendimento.`);
      if (visit.date < purchaseDate) return showToast(`A visita ${visit.number} está antes da data da venda do pacote.`);
      if (visit.date > expiresAt) return showToast(`A visita ${visit.number} ultrapassa a validade do pacote.`);
      if (availability.enabled) {
        const block = packageVisitBlockMinutes(visit);
        const validSlots = availableSlotsForBlock(visit.date, block, null, reservations);
        if (!validSlots.includes(visit.time)) return showToast(`O horário da visita ${visit.number} não está mais disponível.`);
        reservations.push({ date: visit.date, time: visit.time, block });
      }
    }

    const clientPackage = {
      id: uid('cpkg'),
      clientId: client.id,
      templateId: template.id,
      nameSnapshot: template.name,
      descriptionSnapshot: template.description || '',
      priceSnapshot: Number(template.price || 0),
      purchaseDate,
      expiresAt,
      frequencySnapshot: template.frequency || '',
      paymentStatus,
      paymentMethod,
      paidAt: paymentStatus === 'received' ? new Date().toISOString() : null,
      items: (template.items || []).map((item) => ({
        serviceId: item.serviceId,
        serviceNameSnapshot: getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço',
        total: Number(item.quantity) || 0,
        used: 0,
      })),
      createdAt: new Date().toISOString(),
    };
    state.clientPackages.push(clientPackage);

    const totalVisits = packageScheduleDraft.length;
    packageScheduleDraft.forEach((visit) => {
      const firstItem = visit.items[0];
      state.appointments.push({
        id: uid('apt'),
        clientId,
        serviceId: firstItem?.serviceId || null,
        packageVisitItems: visit.items.map((item) => ({ ...item })),
        clientPackageId: clientPackage.id,
        packageTemplateId: template.id,
        packageNameSnapshot: template.name,
        packageVisitNumber: visit.number,
        packageVisitTotal: totalVisits,
        date: visit.date,
        time: visit.time,
        status,
        notes,
        priceSnapshot: 0,
        paymentStatus: null,
        paymentMethod: null,
        createdAt: new Date().toISOString(),
      });
    });

    agendaDate = packageScheduleDraft[0]?.date || purchaseDate;
    packageScheduleDraft = [];
    debtWarningApprovedClientId = null;
    saveState();
    closeDialog('appointmentDialog');
    renderAll();
    showToast(`${template.name}: ${totalVisits} ${totalVisits === 1 ? 'visita agendada' : 'visitas agendadas'}.`);
  }

  function saveAppointment(event) {
    event.preventDefault();
    if (!appointmentEditingId && document.getElementById('appointmentType')?.value === 'package') {
      savePackageAppointmentFlow();
      return;
    }
    const clientId = document.getElementById('appointmentClient').value;
    const serviceId = document.getElementById('appointmentService').value;
    const date = document.getElementById('appointmentDate').value;
    const availability = availabilitySettings();
    const manualOverride = Boolean(availability.enabled && appointmentEditingId && document.getElementById('appointmentManualTimeOverride')?.checked);
    const time = (availability.enabled && !manualOverride) ? document.getElementById('appointmentTimeSlot').value : document.getElementById('appointmentTime').value;
    const service = getService(serviceId);
    if (!clientId || !serviceId || !date || !time || !service) return;
    if (!isWorkingDate(date)) {
      updateAppointmentTimeControl(time);
      showToast(isBlockedDate(date) ? 'Essa data está bloqueada nos Ajustes.' : 'Esse dia está marcado como sem atendimento.');
      return;
    }
    const editingAppointment = appointmentEditingId ? state.appointments.find((item) => item.id === appointmentEditingId) : null;
    const validTime = !availability.enabled || manualOverride || (editingAppointment?.clientPackageId
      ? availableSlotsForBlock(date, appointmentBlockMinutes(editingAppointment), appointmentEditingId).includes(time)
      : availableSlotsFor(date, serviceId, appointmentEditingId).includes(time));
    if (!validTime) {
      updateAppointmentTimeControl(time);
      showToast('Esse horário não está mais disponível. Escolha outro horário.');
      return;
    }

    if (!appointmentEditingId && debtWarningApprovedClientId !== clientId) {
      const pending = clientFinancialPending(clientId);
      if (pending.count && openDebtWarning(clientId)) return;
    }

    if (appointmentEditingId) {
      const appointment = state.appointments.find((item) => item.id === appointmentEditingId);
      if (!appointment) return;
      const wasRescheduled = appointment.date !== date || appointment.time !== time;
      const serviceChanged = !appointment.clientPackageId && appointment.serviceId !== serviceId;
      Object.assign(appointment, {
        clientId,
        serviceId,
        date,
        time,
        status: document.getElementById('appointmentStatus').value,
        notes: document.getElementById('appointmentNotes').value.trim(),
        priceSnapshot: appointment.clientPackageId ? 0 : (serviceChanged ? Number(service.price || 0) : Number(appointment.priceSnapshot ?? service.price ?? 0)),
        updatedAt: new Date().toISOString(),
        rescheduleCount: Number(appointment.rescheduleCount || 0) + (wasRescheduled ? 1 : 0),
      });
      agendaDate = date;
      saveState();
      appointmentEditingId = null;
      closeDialog('appointmentDialog');
      renderAll();
      showToast(wasRescheduled ? 'Atendimento reagendado.' : 'Atendimento atualizado.');
      return;
    }

    state.appointments.push({
      id: uid('apt'),
      clientId,
      serviceId,
      date,
      time,
      status: document.getElementById('appointmentStatus').value,
      notes: document.getElementById('appointmentNotes').value.trim(),
      priceSnapshot: Number(service.price || 0),
      paymentStatus: null,
      paymentMethod: null,
    });
    agendaDate = date;
    debtWarningApprovedClientId = null;
    saveState();
    closeDialog('appointmentDialog');
    renderAll();
    showToast('Atendimento adicionado à agenda.');
  }

  function saveClient(event) {
    event.preventDefault();
    const name = document.getElementById('clientName').value.trim();
    if (!name) return;
    const client = {
      id: uid('cli'),
      name,
      phone: normalizePhone(document.getElementById('clientPhone').value),
      birthday: document.getElementById('clientBirthday').value,
      notes: document.getElementById('clientNotes').value.trim(),
    };
    state.clients.push(client);
    selectedClientId = client.id;
    saveState();
    closeDialog('clientDialog');
    document.getElementById('clientForm').reset();
    renderAll();
    switchView('clients');
    showToast('Cliente cadastrado.');
  }

  function saveExpense(event) {
    event.preventDefault();
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    if (!description || !amount || !date) return;
    state.expenses.push({ id: uid('exp'), description, amount, date });
    saveState();
    closeDialog('expenseDialog');
    document.getElementById('expenseForm').reset();
    renderFinance();
    showToast('Despesa registrada.');
  }

  function openPaymentDialog(id, mode = 'complete') {
    const appointment = state.appointments.find((a) => a.id === id);
    if (!appointment) return;
    const client = getClient(appointment.clientId);
    paymentAppointmentId = id;
    packagePaymentId = null;
    paymentMode = mode;
    document.getElementById('paymentDialogTitle').textContent = mode === 'settle' ? 'Registrar recebimento' : 'Concluir atendimento';
    document.getElementById('paymentClientName').textContent = client?.name || 'Cliente';
    document.getElementById('paymentAmount').textContent = appointment.clientPackageId ? 'Pacote' : money(servicePrice(appointment));
    const preferredMethod = appointment.paymentMethod || getActivePaymentMethods()[0]?.name || '';
    renderPaymentMethodSelect(preferredMethod);
    const pendingBtn = document.getElementById('markPaymentPendingBtn');
    pendingBtn.hidden = false;
    pendingBtn.textContent = mode === 'settle' ? 'Continuar pendente' : 'Pendente';
    document.getElementById('paymentQuestion').textContent = mode === 'settle' ? 'Pagamento recebido?' : 'Como deseja concluir?';
    document.getElementById('paymentHelpText').textContent = mode === 'settle'
      ? 'Dê baixa quando o pagamento entrar.'
      : 'Você pode usar um pacote disponível ou registrar o pagamento deste atendimento.';
    document.getElementById('paymentMethodWrap').hidden = false;
    const packageOption = document.getElementById('paymentPackageOption');
    const scheduledPackage = mode === 'complete' && appointment.clientPackageId ? getClientPackage(appointment.clientPackageId) : null;
    const usable = scheduledPackage || (mode === 'complete' ? usableClientPackage(appointment.clientId, appointment.serviceId, appointment.date) : null);
    packageOption.hidden = !usable;
    if (usable) {
      if (scheduledPackage) {
        const balances = appointmentServiceItems(appointment).map((visitItem) => {
          const item = clientPackageItem(usable, visitItem.serviceId);
          return `${clientPackageRemaining(item)}× ${getService(visitItem.serviceId)?.name || visitItem.serviceNameSnapshot || 'Serviço'}`;
        }).join(' · ');
        const paymentNote = usable.paymentStatus === 'pending' ? ' · pagamento do pacote pendente' : '';
        document.getElementById('paymentPackageCopy').textContent = `${usable.nameSnapshot || 'Pacote'} · ${balances}${paymentNote}`;
        document.getElementById('paymentQuestion').textContent = 'Concluir visita do pacote?';
        document.getElementById('paymentHelpText').textContent = 'Esta visita já pertence ao pacote. Ao concluir, o saldo dos serviços desta visita será descontado.';
        document.getElementById('paymentMethodWrap').hidden = true;
        pendingBtn.hidden = true;
        document.getElementById('usePackageBtn').textContent = 'Concluir com pacote';
      } else {
        const item = clientPackageItem(usable, appointment.serviceId);
        document.getElementById('paymentPackageCopy').textContent = `${usable.nameSnapshot || 'Pacote'} · ${clientPackageRemaining(item)} uso(s) disponível(is) deste serviço.`;
        document.getElementById('usePackageBtn').textContent = 'Usar pacote';
      }
      packageOption.dataset.packageId = usable.id;
    } else {
      document.getElementById('usePackageBtn').textContent = 'Usar pacote';
      delete packageOption.dataset.packageId;
    }
    document.getElementById('paymentDialog').showModal();
  }

  function openPackagePaymentDialog(id) {
    const pkg = getClientPackage(id);
    if (!pkg) return;
    const client = getClient(pkg.clientId);
    packagePaymentId = id;
    paymentAppointmentId = null;
    paymentMode = 'package-settle';
    document.getElementById('paymentDialogTitle').textContent = 'Receber pacote';
    document.getElementById('paymentClientName').textContent = client?.name || 'Cliente';
    document.getElementById('paymentAmount').textContent = money(pkg.priceSnapshot);
    renderPaymentMethodSelect(pkg.paymentMethod || getActivePaymentMethods()[0]?.name || '');
    document.getElementById('paymentPackageOption').hidden = true;
    document.getElementById('paymentQuestion').textContent = 'Pagamento do pacote recebido?';
    document.getElementById('paymentHelpText').textContent = 'Ao registrar o recebimento, o pacote fica liberado para uso nos atendimentos.';
    document.getElementById('paymentMethodWrap').hidden = false;
    const pendingBtn = document.getElementById('markPaymentPendingBtn');
    pendingBtn.hidden = false;
    pendingBtn.textContent = 'Continuar pendente';
    document.getElementById('paymentDialog').showModal();
  }

  function setPaymentReceived() {
    const selectedMethod = document.getElementById('paymentMethod').value;
    if (!selectedMethod) {
      showToast('Cadastre uma forma de pagamento em Cadastros para registrar o recebimento.');
      return;
    }
    if (packagePaymentId) {
      const pkg = getClientPackage(packagePaymentId);
      if (!pkg) return;
      pkg.paymentStatus = 'received';
      pkg.paymentMethod = selectedMethod;
      pkg.paidAt = new Date().toISOString();
      saveState();
      closeDialog('paymentDialog');
      packagePaymentId = null;
      renderAll();
      showToast('Pagamento do pacote recebido. Saldo liberado para uso.');
      return;
    }
    const appointment = state.appointments.find((a) => a.id === paymentAppointmentId);
    if (!appointment) return;
    appointment.status = 'done';
    appointment.paymentStatus = 'received';
    appointment.paymentMethod = selectedMethod;
    appointment.refundStatus = null;
    appointment.paidAt = new Date().toISOString();
    saveState();
    closeDialog('paymentDialog');
    renderAll();
    showToast(paymentMode === 'settle' ? 'Pagamento recebido e baixado.' : 'Atendimento concluído. Pagamento recebido.');
  }

  function setPaymentPending() {
    if (packagePaymentId) {
      closeDialog('paymentDialog');
      packagePaymentId = null;
      showToast('Pagamento do pacote continua pendente.');
      return;
    }
    const appointment = state.appointments.find((a) => a.id === paymentAppointmentId);
    if (!appointment) return;
    if (paymentMode === 'settle') {
      closeDialog('paymentDialog');
      showToast('Pagamento continua pendente.');
      return;
    }
    appointment.status = 'done';
    appointment.paymentStatus = 'pending';
    appointment.paymentMethod = null;
    appointment.refundStatus = null;
    saveState();
    closeDialog('paymentDialog');
    renderAll();
    showToast('Atendimento concluído com pagamento pendente.');
  }

  function usePackageForAppointment() {
    const appointment = state.appointments.find((a) => a.id === paymentAppointmentId);
    const packageOption = document.getElementById('paymentPackageOption');
    const pkg = getClientPackage(packageOption?.dataset.packageId);
    if (!appointment || !pkg) return showToast('Nenhum pacote disponível para este atendimento.');

    const usageItems = appointment.clientPackageId
      ? appointmentServiceItems(appointment)
      : [{ serviceId: appointment.serviceId, serviceNameSnapshot: getService(appointment.serviceId)?.name || 'Serviço' }];
    const packageItems = usageItems.map((usage) => clientPackageItem(pkg, usage.serviceId));
    if (packageItems.some((item) => !item || clientPackageRemaining(item) <= 0)) return showToast('O saldo necessário deste pacote não está disponível.');

    packageItems.forEach((item) => { item.used = Number(item.used || 0) + 1; });
    appointment.status = 'done';
    appointment.paymentStatus = 'package';
    appointment.paymentMethod = 'Pacote';
    appointment.packageId = pkg.id;
    appointment.packageUsageItems = usageItems.map((item) => item.serviceId);
    appointment.packageUsageReversed = false;
    appointment.paidAt = null;
    saveState();
    closeDialog('paymentDialog');
    renderAll();
    showToast(pkg.paymentStatus === 'pending'
      ? `Uso registrado em ${pkg.nameSnapshot || 'pacote'}. O pagamento do pacote continua pendente.`
      : `Atendimento concluído usando ${pkg.nameSnapshot || 'pacote'}.`);
  }

  function openCancelDialog(id) {
    const appointment = state.appointments.find((a) => a.id === id);
    if (!appointment) return;
    const client = getClient(appointment.clientId);
    cancellingAppointmentId = id;
    cancellingMode = appointment.paymentStatus === 'package' ? 'package' : 'payment';
    document.getElementById('cancelClientName').textContent = client?.name || 'Cliente';
    document.getElementById('cancelAmount').textContent = appointment.paymentStatus === 'package' ? 'Pacote' : money(servicePrice(appointment));
    if (cancellingMode === 'package') {
      document.getElementById('cancelDialogTitle').textContent = 'Cancelar atendimento';
      document.getElementById('cancelQuestion').textContent = 'Devolver este uso ao pacote?';
      document.getElementById('cancelHelpText').textContent = '“Sim” devolve 1 utilização ao saldo do pacote. “Não” mantém o uso consumido, por exemplo em caso de falta cobrada.';
      document.getElementById('cancelNoRefundBtn').textContent = 'Não, manter uso';
      document.getElementById('cancelRefundBtn').textContent = 'Sim, devolver uso';
    } else {
      document.getElementById('cancelDialogTitle').textContent = 'Cancelar atendimento';
      document.getElementById('cancelQuestion').textContent = 'Dinheiro foi devolvido?';
      document.getElementById('cancelHelpText').textContent = 'Se já houver um recebimento registrado, “Sim” retira o valor do financeiro e “Não” mantém o valor recebido.';
      document.getElementById('cancelNoRefundBtn').textContent = 'Não, manter';
      document.getElementById('cancelRefundBtn').textContent = 'Sim, devolvido';
    }
    document.getElementById('cancelDialog').showModal();
  }

  function applyCancellation(refunded) {
    const appointment = state.appointments.find((a) => a.id === cancellingAppointmentId);
    if (!appointment) return;
    if (cancellingMode === 'package') {
      appointment.status = 'cancelled';
      const pkg = getClientPackage(appointment.packageId);
      const usageServiceIds = Array.isArray(appointment.packageUsageItems) && appointment.packageUsageItems.length ? appointment.packageUsageItems : [appointment.serviceId];
      if (refunded && pkg && !appointment.packageUsageReversed) {
        usageServiceIds.forEach((serviceId) => {
          const item = clientPackageItem(pkg, serviceId);
          if (item) item.used = Math.max(0, Number(item.used || 0) - 1);
        });
        appointment.packageUsageReversed = true;
        appointment.paymentStatus = 'package_reversed';
      }
      saveState();
      closeDialog('cancelDialog');
      renderAll();
      showToast(refunded ? 'Atendimento cancelado. Uso devolvido ao pacote.' : 'Atendimento cancelado. O uso do pacote foi mantido.');
      return;
    }
    const wasReceived = appointment.paymentStatus === 'received';
    appointment.status = 'cancelled';
    if (refunded) {
      appointment.paymentStatus = 'refunded';
      appointment.refundStatus = 'refunded';
      appointment.paymentMethod = appointment.paymentMethod || null;
    } else {
      appointment.refundStatus = 'not_refunded';
      if (!wasReceived) appointment.paymentStatus = 'not_paid';
    }
    saveState();
    closeDialog('cancelDialog');
    renderAll();
    if (refunded) showToast('Atendimento cancelado. Valor retirado do financeiro.');
    else if (wasReceived) showToast('Atendimento cancelado. Valor mantido no financeiro.');
    else showToast('Atendimento cancelado. Não havia valor recebido.');
  }

  function openWhatsApp(clientId, appointmentId = null) {
    const client = getClient(clientId);
    if (!client?.phone) return showToast('Cliente sem telefone cadastrado.');
    let message = `Olá, ${firstName(client.name)}!`;
    if (appointmentId) {
      const apt = state.appointments.find((a) => a.id === appointmentId);
      if (apt) message += ` Passando para lembrar do seu horário em ${dateFromKey(apt.date).toLocaleDateString('pt-BR')} às ${apt.time} na ${workspaceName()}.`;
    } else {
      message += ` Tudo bem? Passando para saber se você gostaria de reservar seu próximo horário na ${workspaceName()}.`;
    }
    window.open(`https://wa.me/${client.phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  function openServiceDialog(id = null) {
    serviceEditingId = id;
    deleteServiceArmed = false;
    const service = id ? getService(id) : null;
    document.getElementById('serviceDialogTitle').textContent = service ? 'Editar serviço' : 'Novo serviço';
    document.getElementById('serviceName').value = service?.name || '';
    document.getElementById('serviceDescription').value = service?.description || '';
    document.getElementById('servicePrice').value = service?.price ?? '';
    document.getElementById('serviceDuration').value = service?.duration ?? '';
    const deleteBtn = document.getElementById('deleteServiceBtn');
    deleteBtn.hidden = !service;
    deleteBtn.textContent = 'Excluir serviço';
    document.getElementById('serviceDialog').showModal();
  }

  function saveService(event) {
    event.preventDefault();
    const name = document.getElementById('serviceName').value.trim();
    const description = document.getElementById('serviceDescription').value.trim();
    const price = Number(document.getElementById('servicePrice').value);
    const durationRaw = document.getElementById('serviceDuration').value.trim();
    const duration = durationRaw ? Number(durationRaw) : null;
    if (!name || !Number.isFinite(price) || price < 0 || (duration !== null && (!Number.isFinite(duration) || duration < 15))) {
      return showToast('Confira os dados. A duração mínima é de 15 minutos.');
    }
    if (serviceEditingId) {
      const service = getService(serviceEditingId);
      if (!service) return;
      Object.assign(service, { name, description, price, duration, active: true });
      showToast('Serviço atualizado.');
    } else {
      state.services.push({ id: uid('srv'), name, description, price, duration, active: true });
      showToast('Serviço adicionado.');
    }
    saveState();
    closeDialog('serviceDialog');
    renderAll();
  }

  function requestDeleteService() {
    if (!serviceEditingId) return;
    const button = document.getElementById('deleteServiceBtn');
    if (!deleteServiceArmed) {
      deleteServiceArmed = true;
      button.textContent = 'Confirmar exclusão';
      showToast('Toque novamente para confirmar a exclusão.');
      setTimeout(() => {
        if (!deleteServiceArmed) return;
        deleteServiceArmed = false;
        if (button) button.textContent = 'Excluir serviço';
      }, 3500);
      return;
    }
    const service = getService(serviceEditingId);
    if (!service) return;
    service.active = false;
    saveState();
    closeDialog('serviceDialog');
    renderAll();
    showToast('Serviço removido da lista. O histórico foi preservado.');
  }

  function renderPackageServiceRows(existingItems = []) {
    const target = document.getElementById('packageServiceRows');
    if (!target) return;
    const services = getActiveServices();
    if (!services.length) {
      target.innerHTML = '<p class="muted-copy">Cadastre pelo menos um serviço antes de criar um pacote.</p>';
      return;
    }
    const quantities = Object.fromEntries(existingItems.map((item) => [item.serviceId, Number(item.quantity) || 0]));
    target.innerHTML = services.map((service) => `<label class="package-service-row">
      <span><strong>${escapeHtml(service.name)}</strong><small>${service.description ? escapeHtml(service.description) : `${money(service.price)} avulso`}</small></span>
      <input type="number" min="0" step="1" inputmode="numeric" data-package-service="${service.id}" value="${quantities[service.id] || 0}" aria-label="Quantidade de ${escapeHtml(service.name)}">
    </label>`).join('');
  }

  function openPackageDialog(id = null) {
    if (!getActiveServices().length) {
      setRegistryTab('services');
      showToast('Cadastre pelo menos um serviço antes de criar um pacote.');
      return;
    }
    packageEditingId = id;
    deletePackageArmed = false;
    const pkg = id ? getPackageTemplate(id) : null;
    document.getElementById('packageDialogTitle').textContent = pkg ? 'Editar pacote' : 'Novo pacote';
    document.getElementById('packageName').value = pkg?.name || '';
    document.getElementById('packageDescription').value = pkg?.description || '';
    document.getElementById('packagePrice').value = pkg?.price ?? '';
    document.getElementById('packageValidityDays').value = String(pkg?.validityDays || 30);
    document.getElementById('packageFrequency').value = pkg?.frequency || '';
    renderPackageServiceRows(pkg?.items || []);
    const deleteBtn = document.getElementById('deletePackageBtn');
    deleteBtn.hidden = !pkg;
    deleteBtn.textContent = 'Excluir pacote';
    document.getElementById('packageDialog').showModal();
  }

  function savePackage(event) {
    event.preventDefault();
    const name = document.getElementById('packageName').value.trim();
    const description = document.getElementById('packageDescription').value.trim();
    const price = Number(document.getElementById('packagePrice').value);
    const validityDays = Math.max(1, Number(document.getElementById('packageValidityDays').value) || 30);
    const frequency = document.getElementById('packageFrequency').value.trim();
    const items = Array.from(document.querySelectorAll('[data-package-service]')).map((input) => {
      const quantity = Math.max(0, Math.floor(Number(input.value) || 0));
      const service = getService(input.dataset.packageService);
      return { serviceId: input.dataset.packageService, serviceNameSnapshot: service?.name || 'Serviço', quantity };
    }).filter((item) => item.quantity > 0);
    if (!name || !Number.isFinite(price) || price < 0) return showToast('Confira nome e valor do pacote.');
    if (!items.length) return showToast('Inclua pelo menos um serviço no pacote.');
    if (packageEditingId) {
      const pkg = getPackageTemplate(packageEditingId);
      if (!pkg) return;
      Object.assign(pkg, { name, description, price, validityDays, frequency, items, active: true });
      showToast('Pacote atualizado. Pacotes já vendidos mantêm o saldo original.');
    } else {
      state.packageTemplates.push({ id: uid('pkg'), name, description, price, validityDays, frequency, items, active: true });
      showToast('Pacote cadastrado.');
    }
    saveState();
    closeDialog('packageDialog');
    renderPackagesRegistry();
  }

  function requestDeletePackage() {
    if (!packageEditingId) return;
    const button = document.getElementById('deletePackageBtn');
    if (!deletePackageArmed) {
      deletePackageArmed = true;
      button.textContent = 'Confirmar exclusão';
      showToast('Toque novamente para confirmar a exclusão.');
      setTimeout(() => {
        if (!deletePackageArmed) return;
        deletePackageArmed = false;
        if (button) button.textContent = 'Excluir pacote';
      }, 3500);
      return;
    }
    const pkg = getPackageTemplate(packageEditingId);
    if (!pkg) return;
    pkg.active = false;
    saveState();
    closeDialog('packageDialog');
    renderPackagesRegistry();
    showToast('Pacote removido do catálogo. Pacotes já vendidos foram preservados.');
  }

  function updatePackagePurchasePreview() {
    const template = getPackageTemplate(document.getElementById('packagePurchaseTemplate').value);
    const preview = document.getElementById('packagePurchasePreview');
    if (!template || !preview) return;
    document.getElementById('packagePurchaseAmount').textContent = money(template.price);
    preview.innerHTML = `<div><strong>${escapeHtml(template.name)}</strong><span>${Number(template.validityDays) || 30} dias${template.frequency ? ` · ${escapeHtml(template.frequency)}` : ''}</span></div><div class="package-purchase-items">${(template.items || []).map((item) => `<span>${Number(item.quantity) || 0}× ${escapeHtml(getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço')}</span>`).join('')}</div>`;
    const status = document.getElementById('packagePurchasePaymentStatus').value;
    document.getElementById('packagePurchasePaymentMethodWrap').hidden = status !== 'received';
  }

  function openPackagePurchaseDialog(clientId) {
    const client = getClient(clientId);
    const templates = getActivePackageTemplates();
    if (!client) return;
    if (!templates.length) {
      setRegistryTab('packages');
      showToast('Cadastre um pacote antes de adicioná-lo ao cliente.');
      return;
    }
    selectedClientId = clientId;
    document.getElementById('packagePurchaseClientName').textContent = client.name;
    document.getElementById('packagePurchaseTemplate').innerHTML = templates.map((pkg) => `<option value="${pkg.id}">${escapeHtml(pkg.name)} · ${money(pkg.price)}</option>`).join('');
    document.getElementById('packagePurchaseDate').value = today;
    document.getElementById('packagePurchasePaymentStatus').value = 'received';
    const methods = getActivePaymentMethods();
    document.getElementById('packagePurchasePaymentMethod').innerHTML = methods.map((method) => `<option value="${escapeHtml(method.name)}">${escapeHtml(method.name)}</option>`).join('');
    updatePackagePurchasePreview();
    document.getElementById('packagePurchaseDialog').showModal();
  }

  function savePackagePurchase(event) {
    event.preventDefault();
    const template = getPackageTemplate(document.getElementById('packagePurchaseTemplate').value);
    const client = getClient(selectedClientId);
    const purchaseDate = document.getElementById('packagePurchaseDate').value;
    const paymentStatus = document.getElementById('packagePurchasePaymentStatus').value;
    const paymentMethod = paymentStatus === 'received' ? document.getElementById('packagePurchasePaymentMethod').value : null;
    if (!template || !client || !purchaseDate) return;
    if (paymentStatus === 'received' && !paymentMethod) return showToast('Cadastre uma forma de pagamento para registrar o pacote como recebido.');
    const clientPackage = {
      id: uid('cpkg'),
      clientId: client.id,
      templateId: template.id,
      nameSnapshot: template.name,
      descriptionSnapshot: template.description || '',
      priceSnapshot: Number(template.price || 0),
      purchaseDate,
      expiresAt: shiftDate(purchaseDate, Math.max(1, Number(template.validityDays) || 30)),
      frequencySnapshot: template.frequency || '',
      paymentStatus,
      paymentMethod,
      paidAt: paymentStatus === 'received' ? new Date().toISOString() : null,
      items: (template.items || []).map((item) => ({
        serviceId: item.serviceId,
        serviceNameSnapshot: getService(item.serviceId)?.name || item.serviceNameSnapshot || 'Serviço',
        total: Number(item.quantity) || 0,
        used: 0,
      })),
      createdAt: new Date().toISOString(),
    };
    state.clientPackages.push(clientPackage);
    saveState();
    closeDialog('packagePurchaseDialog');
    renderAll();
    showToast(paymentStatus === 'received' ? 'Pacote adicionado e pagamento registrado.' : 'Pacote adicionado com pagamento pendente.');
  }

  function openPaymentMethodDialog(id = null) {
    paymentMethodEditingId = id;
    deletePaymentMethodArmed = false;
    const method = id ? getPaymentMethod(id) : null;
    document.getElementById('paymentMethodDialogTitle').textContent = method ? 'Editar forma de pagamento' : 'Nova forma de pagamento';
    document.getElementById('paymentMethodName').value = method?.name || '';
    document.getElementById('paymentMethodActive').checked = method?.active !== false;
    const deleteBtn = document.getElementById('deletePaymentMethodBtn');
    deleteBtn.hidden = !method;
    deleteBtn.textContent = 'Excluir';
    document.getElementById('paymentMethodDialog').showModal();
  }

  function savePaymentMethod(event) {
    event.preventDefault();
    const name = document.getElementById('paymentMethodName').value.trim();
    const active = document.getElementById('paymentMethodActive').checked;
    if (!name) return showToast('Informe o nome da forma de pagamento.');
    const duplicate = state.paymentMethods.some((method) => method.id !== paymentMethodEditingId && method.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
    if (duplicate) return showToast('Já existe uma forma de pagamento com esse nome.');
    if (paymentMethodEditingId) {
      const method = getPaymentMethod(paymentMethodEditingId);
      if (!method) return;
      method.name = name;
      method.active = active;
      showToast('Forma de pagamento atualizada.');
    } else {
      state.paymentMethods.push({ id: uid('pay'), name, active });
      showToast('Forma de pagamento adicionada.');
    }
    saveState();
    closeDialog('paymentMethodDialog');
    renderPaymentMethods();
    renderPaymentMethodSelect();
  }

  function requestDeletePaymentMethod() {
    if (!paymentMethodEditingId) return;
    const button = document.getElementById('deletePaymentMethodBtn');
    if (!deletePaymentMethodArmed) {
      deletePaymentMethodArmed = true;
      button.textContent = 'Confirmar exclusão';
      showToast('Toque novamente para confirmar a exclusão.');
      setTimeout(() => {
        if (!deletePaymentMethodArmed) return;
        deletePaymentMethodArmed = false;
        if (button) button.textContent = 'Excluir';
      }, 3500);
      return;
    }
    state.paymentMethods = state.paymentMethods.filter((method) => method.id !== paymentMethodEditingId);
    saveState();
    closeDialog('paymentMethodDialog');
    renderPaymentMethods();
    renderPaymentMethodSelect();
    showToast('Forma de pagamento removida. O histórico financeiro foi preservado.');
  }

  function formatPhone(phone = '') {
    const digits = phone.replace(/\D/g, '').replace(/^55/, '');
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return phone;
  }

  function normalizePhone(value = '') {
    let digits = value.replace(/\D/g, '');
    const countryCode = String(APP_CONFIG.whatsappCountryCode || '55');
    if (digits && !digits.startsWith(countryCode)) digits = `${countryCode}${digits}`;
    return digits;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
  }

  function renderAll() {
    renderToday();
    renderAgenda();
    renderClients(document.getElementById('clientSearch')?.value || '');
    renderServicesRegistry();
    renderPackagesRegistry();
    renderPaymentMethods();
    renderFinance();
    renderSettings();
  }

  document.addEventListener('click', (event) => {
    const collapseBtn = event.target.closest('[data-collapse-toggle]');
    if (collapseBtn) {
      toggleFinanceSection(collapseBtn.dataset.collapseToggle);
      return;
    }

    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn) switchView(viewBtn.dataset.view);

    const jump = event.target.closest('[data-view-jump]');
    if (jump) switchView(jump.dataset.viewJump);

    const registryButton = event.target.closest('[data-registry-tab]');
    if (registryButton) {
      setRegistryTab(registryButton.dataset.registryTab);
      return;
    }

    if (event.target.closest('[data-open-service]')) {
      openServiceDialog();
      return;
    }
    if (event.target.closest('[data-open-payment-method]')) {
      openPaymentMethodDialog();
      return;
    }
    if (event.target.closest('[data-open-package]')) {
      openPackageDialog();
      return;
    }
    if (event.target.closest('[data-open-packages-registry]')) {
      setRegistryTab('packages');
      return;
    }

    const themeButton = event.target.closest('[data-theme-id]');
    if (themeButton) {
      applyPanelTheme(themeButton.dataset.themeId, { persist: true });
      renderSettings();
      showToast(`Tema ${THEMES_CONFIG[themeButton.dataset.themeId]?.label || ''} aplicado.`.trim());
      return;
    }

    const agendaModeButton = event.target.closest('[data-agenda-mode]');
    if (agendaModeButton) {
      setAgendaOverviewMode(agendaModeButton.dataset.agendaMode);
      return;
    }

    const agendaDateButton = event.target.closest('[data-agenda-date]');
    if (agendaDateButton) {
      agendaDate = agendaDateButton.dataset.agendaDate;
      if (agendaDateButton.dataset.monthDay === 'true') {
        agendaOverviewMode = 'week';
      }
      renderAgenda();
      const target = agendaDateButton.dataset.monthDay === 'true' ? document.getElementById('agendaOverviewPanel') : document.getElementById('agendaDayPanel');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (event.target.closest('[data-action="new-appointment"]')) openAppointmentDialog();
    if (event.target.closest('[data-action="new-client"]')) document.getElementById('clientDialog').showModal();

    const closeBtn = event.target.closest('[data-close-dialog]');
    if (closeBtn) closeDialog(closeBtn.dataset.closeDialog, closeBtn.dataset.cancelMessage || '');

    const clientRow = event.target.closest('[data-client-id]');
    if (clientRow) {
      selectedClientId = clientRow.dataset.clientId;
      renderClients(document.getElementById('clientSearch')?.value || '');
    }

    const schedulePackage = event.target.closest('[data-schedule-package]');
    if (schedulePackage) {
      openAppointmentDialog();
      const dialog = document.getElementById('appointmentDialog');
      if (dialog?.open) {
        document.getElementById('appointmentClient').value = schedulePackage.dataset.schedulePackage;
        document.getElementById('appointmentType').value = 'package';
        debtWarningApprovedClientId = null;
        updateAppointmentDebtHint();
        updateAppointmentMode(true);
      }
      return;
    }

    const sellPackage = event.target.closest('[data-sell-package]');
    if (sellPackage) openPackagePurchaseDialog(sellPackage.dataset.sellPackage);

    const wa = event.target.closest('[data-whatsapp]');
    if (wa) openWhatsApp(wa.dataset.whatsapp, wa.dataset.appointment || null);

    const editAppointment = event.target.closest('[data-edit-appointment]');
    if (editAppointment) openEditAppointmentDialog(editAppointment.dataset.editAppointment);

    const complete = event.target.closest('[data-complete]');
    if (complete) openPaymentDialog(complete.dataset.complete, 'complete');

    const markPaid = event.target.closest('[data-mark-paid]');
    if (markPaid) openPaymentDialog(markPaid.dataset.markPaid, 'settle');

    const markPackagePaid = event.target.closest('[data-mark-package-paid]');
    if (markPackagePaid) openPackagePaymentDialog(markPackagePaid.dataset.markPackagePaid);

    const cancel = event.target.closest('[data-cancel]');
    if (cancel) openCancelDialog(cancel.dataset.cancel);

    const editService = event.target.closest('[data-edit-service]');
    if (editService) openServiceDialog(editService.dataset.editService);

    const editPackage = event.target.closest('[data-edit-package]');
    if (editPackage) openPackageDialog(editPackage.dataset.editPackage);

    const editPaymentMethod = event.target.closest('[data-edit-payment-method]');
    if (editPaymentMethod) openPaymentMethodDialog(editPaymentMethod.dataset.editPaymentMethod);

    if (event.target.closest('[data-scroll-pending]')) {
      state.settings.financeCollapsed = state.settings.financeCollapsed || {};
      state.settings.financeCollapsed.pendingList = false;
      saveState();
      applyFinanceCollapseState();
      document.getElementById('pendingPaymentsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      if (dialog.id === 'appointmentDialog') closeDialog(dialog.id, appointmentEditingId ? 'Edição do atendimento cancelada.' : 'Cadastro de novo atendimento cancelado.');
      else if (dialog.id === 'expenseDialog') closeDialog(dialog.id, 'Registro de despesa cancelado.');
      else closeDialog(dialog.id);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dialog.id === 'appointmentDialog') closeDialog(dialog.id, appointmentEditingId ? 'Edição do atendimento cancelada.' : 'Cadastro de novo atendimento cancelado.');
      else if (dialog.id === 'expenseDialog') closeDialog(dialog.id, 'Registro de despesa cancelado.');
      else closeDialog(dialog.id);
    });
  });

  document.getElementById('prevDayBtn').addEventListener('click', () => { agendaDate = shiftDate(agendaDate, -1); renderAgenda(); });
  document.getElementById('nextDayBtn').addEventListener('click', () => { agendaDate = shiftDate(agendaDate, 1); renderAgenda(); });
  document.getElementById('prevOverviewBtn').addEventListener('click', () => {
    agendaDate = agendaOverviewMode === 'month' ? shiftMonthKey(agendaDate, -1) : shiftDate(agendaDate, -7);
    renderAgenda();
  });
  document.getElementById('nextOverviewBtn').addEventListener('click', () => {
    agendaDate = agendaOverviewMode === 'month' ? shiftMonthKey(agendaDate, 1) : shiftDate(agendaDate, 7);
    renderAgenda();
  });
  document.getElementById('appointmentForm').addEventListener('submit', saveAppointment);
  document.getElementById('appointmentClient').addEventListener('change', () => { debtWarningApprovedClientId = null; updateAppointmentDebtHint(); });
  document.getElementById('appointmentType').addEventListener('change', () => updateAppointmentMode(true));
  document.getElementById('appointmentService').addEventListener('change', () => updateAppointmentTimeControl());
  document.getElementById('appointmentDate').addEventListener('change', () => updateAppointmentTimeControl());
  document.getElementById('appointmentPackageTemplate').addEventListener('change', () => updateAppointmentPackagePreview(true));
  document.getElementById('appointmentPackagePaymentStatus').addEventListener('change', () => updateAppointmentPackagePreview(false));
  document.getElementById('appointmentPackageSchedule').addEventListener('change', (event) => {
    syncPackageScheduleDraftFromDom();
    if (event.target.matches('[data-package-visit-date]')) renderAppointmentPackageSchedule();
  });
  document.getElementById('appointmentManualTimeOverride').addEventListener('change', () => updateAppointmentTimeControl(document.getElementById('appointmentTime').value));
  document.getElementById('clientForm').addEventListener('submit', saveClient);
  document.getElementById('expenseForm').addEventListener('submit', saveExpense);
  document.getElementById('serviceForm').addEventListener('submit', saveService);
  document.getElementById('packageForm').addEventListener('submit', savePackage);
  document.getElementById('packagePurchaseForm').addEventListener('submit', savePackagePurchase);
  document.getElementById('paymentMethodForm').addEventListener('submit', savePaymentMethod);
  document.getElementById('clientSearch').addEventListener('input', (event) => renderClients(event.target.value));

  document.getElementById('newExpenseBtn').addEventListener('click', () => {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = today;
    document.getElementById('expenseDialog').showModal();
  });
  document.getElementById('addServiceBtn').addEventListener('click', () => openServiceDialog());
  document.getElementById('deleteServiceBtn').addEventListener('click', requestDeleteService);
  document.getElementById('addPackageBtn').addEventListener('click', () => openPackageDialog());
  document.getElementById('deletePackageBtn').addEventListener('click', requestDeletePackage);
  document.getElementById('addPaymentMethodBtn').addEventListener('click', () => openPaymentMethodDialog());
  document.getElementById('deletePaymentMethodBtn').addEventListener('click', requestDeletePaymentMethod);
  document.getElementById('markPaymentReceivedBtn').addEventListener('click', setPaymentReceived);
  document.getElementById('markPaymentPendingBtn').addEventListener('click', setPaymentPending);
  document.getElementById('usePackageBtn').addEventListener('click', usePackageForAppointment);
  document.getElementById('cancelRefundBtn').addEventListener('click', () => applyCancellation(true));
  document.getElementById('cancelNoRefundBtn').addEventListener('click', () => applyCancellation(false));
  document.getElementById('debtWarningContinueBtn').addEventListener('click', () => {
    debtWarningApprovedClientId = document.getElementById('appointmentClient').value;
    closeDialog('debtWarningDialog');
    document.getElementById('appointmentForm').requestSubmit();
  });

  document.getElementById('packagePurchaseTemplate').addEventListener('change', updatePackagePurchasePreview);
  document.getElementById('packagePurchasePaymentStatus').addEventListener('change', updatePackagePurchasePreview);

  document.getElementById('agendaFieldToggles').addEventListener('change', (event) => {
    const key = event.target.dataset.agendaField;
    if (!key) return;
    state.settings.agendaFields[key] = event.target.checked;
    saveState();
    renderToday();
    renderAgenda();
    showToast('Visibilidade da agenda atualizada.');
  });

  document.getElementById('defaultGapInput').addEventListener('change', (event) => {
    const fallback = Number(DEFAULT_CONFIG.defaultGapMinutes ?? 15);
    const parsed = Number(event.target.value);
    state.settings.defaultGap = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    event.target.value = String(state.settings.defaultGap);
    saveState();
    showToast(`Intervalo padrão definido em ${state.settings.defaultGap} min.`);
  });

  document.getElementById('returnDaysSelect').addEventListener('change', (event) => {
    state.settings.returnDays = Number(event.target.value);
    saveState();
    renderReturnClients();
    showToast('Período de retorno atualizado.');
  });

  document.getElementById('availabilityEnabled').addEventListener('change', (event) => {
    availabilitySettings().enabled = event.target.checked;
    saveState();
    renderAvailabilitySettings();
    showToast(event.target.checked ? 'Grade de horários ativada.' : 'Grade desligada. Os dias ativos continuam sendo respeitados.');
  });

  document.getElementById('availabilitySlotMinutes').addEventListener('change', (event) => {
    const parsed = Number(event.target.value);
    const value = Number.isFinite(parsed) ? Math.max(15, Math.round(parsed / 5) * 5) : 60;
    availabilitySettings().slotMinutes = value;
    event.target.value = String(value);
    saveState();
    renderAvailabilitySettings();
    showToast(`Grade de horários definida a cada ${value} min.`);
  });

  document.getElementById('availabilityDays').addEventListener('change', (event) => {
    const input = event.target.closest('[data-availability-field]');
    if (input) updateAvailabilityDayFromInput(input);
  });

  document.getElementById('addBlockedDateBtn').addEventListener('click', () => {
    const input = document.getElementById('availabilityBlockedDate');
    const dateKey = input.value;
    if (!dateKey) return showToast('Escolha uma data para bloquear.');
    const availability = availabilitySettings();
    availability.blockedDates = [...new Set([...(availability.blockedDates || []), dateKey])].sort();
    input.value = '';
    saveState();
    renderAvailabilitySettings();
    showToast('Data bloqueada para novos atendimentos.');
  });

  document.getElementById('availabilityBlockedDates').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-blocked-date]');
    if (!button) return;
    const dateKey = button.dataset.removeBlockedDate;
    const availability = availabilitySettings();
    availability.blockedDates = (availability.blockedDates || []).filter((item) => item !== dateKey);
    saveState();
    renderAvailabilitySettings();
    showToast('Data liberada novamente.');
  });

  document.getElementById('agendaDayPositionSelect').addEventListener('change', (event) => {
    state.settings.agendaDayPosition = event.target.value === 'below' ? 'below' : 'above';
    saveState();
    applyAgendaSectionOrder();
    showToast('Posição da agenda do dia atualizada.');
  });

  document.getElementById('agendaOverviewModeSelect').addEventListener('change', (event) => {
    setAgendaOverviewMode(event.target.value, { persistDefault: true });
    showToast('Visualização padrão da agenda atualizada.');
  });

  document.getElementById('brandSettingsBtn').addEventListener('click', () => switchView('settings'));
  document.getElementById('profileBtn').addEventListener('click', () => switchView('settings'));

  document.getElementById('workspaceSettingsForm').addEventListener('submit', saveWorkspaceSettings);
  document.getElementById('onboardingForm').addEventListener('submit', handleOnboarding);
  document.getElementById('openOnboardingBtn').addEventListener('click', openOnboardingScreen);
  document.getElementById('closeOnboardingBtn').addEventListener('click', () => openLoginScreen(''));
  document.getElementById('cancelOnboardingBtn').addEventListener('click', () => openLoginScreen(''));

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('togglePasswordBtn').addEventListener('click', toggleLoginPassword);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('loginUser').addEventListener('input', () => { document.getElementById('loginError').textContent = ''; });
  document.getElementById('loginPassword').addEventListener('input', () => { document.getElementById('loginError').textContent = ''; });
  document.querySelectorAll('#onboardingForm input').forEach((input) => input.addEventListener('input', () => { document.getElementById('onboardingError').textContent = ''; }));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }

  applyConfig();
  if (hasAuthSession()) openAuthenticatedApp();
  else openLoginScreen();

  // Atualiza estados como “em andamento” automaticamente enquanto o painel estiver aberto.
  window.setInterval(() => {
    if (!hasAuthSession()) return;
    renderToday();
    renderAgenda();
  }, 60000);
})();
