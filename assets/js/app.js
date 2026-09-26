(() => {
  const CONFIG = window.GESTAO_CONFIG || window.NOVAES_NAILS_CONFIG || {};
  const APP_CONFIG = CONFIG.app || {};
  const AUTH_CONFIG = CONFIG.auth || {};
  const THEME_CONFIG = CONFIG.theme || {};
  const DEFAULT_CONFIG = CONFIG.defaults || {};
  const STORAGE_KEY = 'gestao_negocio_mvp_v10';
  const LEGACY_STORAGE_KEY = 'novaes_nails_gestao_mvp_v3';
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

  const defaultState = () => ({
    settings: {
      defaultGap: Number(DEFAULT_CONFIG.defaultGapMinutes ?? 15),
      returnDays: Number(DEFAULT_CONFIG.returnDays ?? 21),
      agendaFields: {
        service: DEFAULT_CONFIG.agendaFields?.service ?? true,
        price: DEFAULT_CONFIG.agendaFields?.price ?? true,
        phone: DEFAULT_CONFIG.agendaFields?.phone ?? false,
        status: DEFAULT_CONFIG.agendaFields?.status ?? true,
        notes: DEFAULT_CONFIG.agendaFields?.notes ?? false,
      },
      financeCollapsed: {},
    },
    services: (CONFIG.services || [
      { id: 'srv_pedi_francesinha', name: 'Pedicure', description: 'Cuticulagem com francesinha', duration: null, price: 45, active: true },
      { id: 'srv_pedi_comum', name: 'Pedicure', description: 'Pedicure com esmaltação comum', duration: null, price: 40, active: true },
      { id: 'srv_mani_comum', name: 'Manicure', description: 'Cuticulagem com esmaltação comum', duration: null, price: 35, active: true },
      { id: 'srv_mani_francesinha', name: 'Manicure', description: 'Cuticulagem com francesinha', duration: null, price: 40, active: true },
    ]).map((service) => ({ ...service })),
    clients: [
      { id: 'cli_ana', name: 'Ana Martins', phone: '5511999991001', birthday: '1993-05-14', notes: 'Prefere esmaltes claros e costuma agendar no período da manhã.' },
      { id: 'cli_carla', name: 'Carla Souza', phone: '5511999991002', birthday: '1989-10-02', notes: 'Costuma confirmar o horário no dia anterior.' },
      { id: 'cli_mariana', name: 'Mariana Lopes', phone: '5511999991003', birthday: '1997-02-21', notes: 'Gosta de francesinha e normalmente já deixa o próximo retorno marcado.' },
      { id: 'cli_juliana', name: 'Juliana Mendes', phone: '5511999991004', birthday: '1991-12-08', notes: 'Prefere atendimento depois das 14h.' },
      { id: 'cli_beatriz', name: 'Beatriz Lima', phone: '5511999991005', birthday: '1995-08-30', notes: 'Cliente antiga. Costuma retornar a cada três semanas.' },
    ],
    appointments: [
      { id: 'apt_1', clientId: 'cli_ana', serviceId: 'srv_mani_francesinha', date: today, time: '09:00', status: 'done', notes: '', priceSnapshot: 40, paymentStatus: 'received', paymentMethod: 'Pix' },
      { id: 'apt_2', clientId: 'cli_carla', serviceId: 'srv_pedi_francesinha', date: today, time: '10:30', status: 'confirmed', notes: 'Confirmar se mantém francesinha.', priceSnapshot: 45, paymentStatus: null, paymentMethod: null },
      { id: 'apt_3', clientId: 'cli_mariana', serviceId: 'srv_mani_comum', date: today, time: '14:00', status: 'confirmed', notes: '', priceSnapshot: 35, paymentStatus: null, paymentMethod: null },
      { id: 'apt_4', clientId: 'cli_juliana', serviceId: 'srv_pedi_comum', date: today, time: '16:30', status: 'waiting', notes: '', priceSnapshot: 40, paymentStatus: null, paymentMethod: null },
      { id: 'apt_5', clientId: 'cli_beatriz', serviceId: 'srv_mani_francesinha', date: shiftDate(today, 1), time: '09:30', status: 'confirmed', notes: '', priceSnapshot: 40, paymentStatus: null, paymentMethod: null },
      { id: 'apt_h1', clientId: 'cli_beatriz', serviceId: 'srv_pedi_comum', date: shiftDate(today, -23), time: '14:00', status: 'done', notes: '', priceSnapshot: 40, paymentStatus: 'received', paymentMethod: 'Dinheiro' },
      { id: 'apt_h2', clientId: 'cli_ana', serviceId: 'srv_mani_comum', date: shiftDate(today, -18), time: '09:00', status: 'done', notes: '', priceSnapshot: 35, paymentStatus: 'received', paymentMethod: 'Pix' },
      { id: 'apt_h3', clientId: 'cli_mariana', serviceId: 'srv_mani_francesinha', date: shiftDate(today, -13), time: '15:00', status: 'done', notes: '', priceSnapshot: 40, paymentStatus: 'received', paymentMethod: 'Pix' },
      { id: 'apt_h4', clientId: 'cli_carla', serviceId: 'srv_pedi_francesinha', date: shiftDate(today, -28), time: '10:00', status: 'done', notes: '', priceSnapshot: 45, paymentStatus: 'received', paymentMethod: 'Cartão' },
      { id: 'apt_h5', clientId: 'cli_juliana', serviceId: 'srv_mani_comum', date: shiftDate(today, -25), time: '16:00', status: 'done', notes: '', priceSnapshot: 35, paymentStatus: 'received', paymentMethod: 'Pix' },
    ],
    expenses: [
      { id: 'exp_1', description: 'Reposição de esmaltes', amount: 180, date: shiftDate(today, -4) },
      { id: 'exp_2', description: 'Algodão e descartáveis', amount: 72.5, date: shiftDate(today, -9) },
    ],
  });

  let state = loadState();
  let agendaDate = today;
  let selectedClientId = state.clients[0]?.id || null;
  let toastTimer = null;
  let serviceEditingId = null;
  let deleteServiceArmed = false;
  let paymentAppointmentId = null;
  let paymentMode = 'complete';
  let cancellingAppointmentId = null;

  function genericAppName() {
    return APP_CONFIG.genericName || 'Gestão';
  }

  function workspaceName() {
    return workspace?.name?.trim() || genericAppName();
  }

  function workspaceInitials() {
    const name = workspaceName();
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return 'G';
    if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }

  function applyBranding() {
    const name = workspaceName();
    const initials = workspaceInitials();
    document.title = workspace?.name ? `${name} — Gestão` : (APP_CONFIG.title || 'Gestão — Agenda e Financeiro');

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

  function applyConfig() {
    const root = document.documentElement;
    const cssVars = {
      '--bg': THEME_CONFIG.background,
      '--surface': THEME_CONFIG.surface,
      '--surface-2': THEME_CONFIG.surfaceAlt,
      '--ink': THEME_CONFIG.text,
      '--muted': THEME_CONFIG.muted,
      '--line': THEME_CONFIG.line,
      '--accent': THEME_CONFIG.accent,
      '--accent-dark': THEME_CONFIG.accentDark,
      '--accent-soft': THEME_CONFIG.accentSoft,
      '--nav-active': THEME_CONFIG.navActive,
      '--field-border': THEME_CONFIG.fieldBorder,
    };
    Object.entries(cssVars).forEach(([key, value]) => { if (value) root.style.setProperty(key, value); });

    const financeView = document.getElementById('view-finance');
    if (financeView) {
      if (THEME_CONFIG.financeIncome) financeView.style.setProperty('--finance-green', THEME_CONFIG.financeIncome);
      if (THEME_CONFIG.financePending) financeView.style.setProperty('--finance-yellow', THEME_CONFIG.financePending);
      if (THEME_CONFIG.financeExpense) financeView.style.setProperty('--finance-red', THEME_CONFIG.financeExpense);
      if (THEME_CONFIG.financeTicket) financeView.style.setProperty('--finance-blue', THEME_CONFIG.financeTicket);
      if (THEME_CONFIG.financeBorder) financeView.style.setProperty('--finance-border', THEME_CONFIG.financeBorder);
    }

    applyBranding();
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && THEME_CONFIG.accentDark) themeMeta.setAttribute('content', THEME_CONFIG.accentDark);

    const returnSelect = document.getElementById('returnDaysSelect');
    if (returnSelect) {
      const options = CONFIG.returnDayOptions || [14, 21, 28, 30];
      returnSelect.innerHTML = options.map((days) => `<option value="${Number(days)}">${Number(days)} dias</option>`).join('');
    }

    const paymentSelect = document.getElementById('paymentMethod');
    if (paymentSelect) {
      const methods = CONFIG.paymentMethods || ['Pix', 'Dinheiro', 'Cartão', 'Outro'];
      paymentSelect.innerHTML = methods.map((method) => `<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('');
    }

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
    if (badge) badge.textContent = currentUser?.role === 'owner' ? 'Proprietária' : currentUser?.role === 'admin' ? 'Administrador' : 'Conta';
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
      authenticated = { username: user, displayName: owner.displayName || workspace?.ownerName || 'Proprietária', role: 'owner' };
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
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        settings: {
          ...base.settings,
          ...(parsed.settings || {}),
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
  function getAppointments(date) { return state.appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time)); }
  function servicePrice(appointment) { return Number(appointment.priceSnapshot ?? getService(appointment.serviceId)?.price ?? 0); }
  function appointmentRevenue(appointments) { return appointments.reduce((sum, item) => sum + servicePrice(item), 0); }

  function statusLabel(status) {
    return { confirmed: 'Confirmado', waiting: 'Aguardando', done: 'Concluído', cancelled: 'Cancelado' }[status] || status;
  }

  function paymentLabel(status) {
    return { received: 'Recebido', pending: 'Pagamento pendente', refunded: 'Devolvido', not_paid: 'Sem recebimento' }[status] || '';
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
    if (viewName === 'clients') renderClients();
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

  function appointmentCardMarkup(appointment, condensed = false) {
    const client = getClient(appointment.clientId) || { name: 'Cliente removida', phone: '' };
    const service = getService(appointment.serviceId) || { name: 'Serviço', description: '', price: servicePrice(appointment), duration: null };
    const f = state.settings.agendaFields;
    const meta = [];
    if (f.service) {
      const serviceText = service.description ? `${service.name} · ${service.description}` : service.name;
      meta.push(`<span>${escapeHtml(serviceText)}</span>`);
    }
    if (f.price) meta.push(`<span>${money(servicePrice(appointment))}</span>`);
    if (f.phone && client.phone) meta.push(`<span>${formatPhone(client.phone)}</span>`);
    if (f.status) meta.push(`<span>${statusLabel(appointment.status)}</span>`);
    if (appointment.paymentStatus === 'pending') meta.push('<span class="payment-pending-tag">Pagamento pendente</span>');
    if (appointment.paymentStatus === 'refunded') meta.push('<span class="payment-refunded-tag">Valor devolvido</span>');
    if (appointment.status === 'cancelled' && appointment.paymentStatus === 'received') meta.push('<span class="payment-retained-tag">Valor mantido</span>');
    if (f.notes && appointment.notes) meta.push(`<span>${escapeHtml(appointment.notes)}</span>`);

    const actions = condensed ? '' : `
      <div class="appointment-actions">
        ${client.phone ? `<button class="mini-action" data-whatsapp="${client.id}" data-appointment="${appointment.id}">WhatsApp</button>` : ''}
        ${appointment.status !== 'done' && appointment.status !== 'cancelled' ? `<button class="mini-action action-positive" data-complete="${appointment.id}">Concluir</button>` : ''}
        ${appointment.paymentStatus === 'pending' && appointment.status === 'done' ? `<button class="mini-action action-positive" data-mark-paid="${appointment.id}">Receber</button>` : ''}
        ${appointment.status !== 'cancelled' ? `<button class="mini-action action-danger" data-cancel="${appointment.id}">Cancelar</button>` : ''}
      </div>`;

    return `
      <div class="appointment-card status-${appointment.status}">
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

  function renderAgenda() {
    document.getElementById('agendaDateLabel').textContent = longDate(agendaDate);
    document.getElementById('agendaTimeline').innerHTML = timelineMarkup(getAppointments(agendaDate), false);
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
      </div>`).join('') : `<p class="muted-copy">Nenhuma cliente passou do período de retorno configurado.</p>`;
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
    }).join('') || '<div class="empty-state"><p>Nenhuma cliente encontrada.</p></div>';

    if (!selectedClientId || !state.clients.some((c) => c.id === selectedClientId)) selectedClientId = clients[0]?.id || null;
    renderClientDetail(selectedClientId);
  }

  function renderClientDetail(clientId) {
    const target = document.getElementById('clientDetail');
    const client = getClient(clientId);
    if (!client) {
      target.innerHTML = '<p class="muted-copy">Selecione uma cliente para ver os detalhes.</p>';
      return;
    }
    const history = state.appointments.filter((a) => a.clientId === client.id && a.status === 'done').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const spent = history.reduce((sum, a) => sum + servicePrice(a), 0);
    const last = history[0];
    target.innerHTML = `
      <div class="client-detail-header">
        <div><p class="eyebrow">Cliente</p><h2>${escapeHtml(client.name)}</h2><p>${client.phone ? formatPhone(client.phone) : 'Sem telefone cadastrado'}</p></div>
        ${client.phone ? `<button class="secondary-action" data-whatsapp="${client.id}">WhatsApp</button>` : ''}
      </div>
      <div class="client-stats">
        <div><strong>${history.length}</strong><small>atendimentos</small></div>
        <div><strong>${money(spent)}</strong><small>histórico</small></div>
        <div><strong>${last ? shortDate(last.date) : '—'}</strong><small>última visita</small></div>
        <div><strong>${client.birthday ? shortDate(`${today.slice(0, 4)}-${client.birthday.slice(5)}`) : '—'}</strong><small>aniversário</small></div>
      </div>
      <div class="note-box">${escapeHtml(client.notes || 'Sem observações registradas.')}</div>
      <div class="history-list">
        <div class="section-heading compact"><div><p class="eyebrow">Histórico</p><h3>Últimos atendimentos</h3></div></div>
        ${history.slice(0, 6).map((a) => {
          const service = getService(a.serviceId);
          return `<div class="history-item"><div><strong>${escapeHtml(service?.name || 'Serviço')}</strong><small>${shortDate(a.date)} · ${a.time}</small></div><strong>${money(servicePrice(a))}</strong></div>`;
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
    const received = state.appointments.filter((a) => a.paymentStatus === 'received' && a.date.startsWith(month));
    const pending = state.appointments.filter((a) => a.status === 'done' && a.paymentStatus === 'pending' && a.date.startsWith(month));
    const revenue = appointmentRevenue(received);
    const pendingValue = appointmentRevenue(pending);
    const expenses = state.expenses.filter((e) => e.date.startsWith(month)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const net = revenue - expenses;
    const ticket = received.length ? revenue / received.length : 0;

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
    received.forEach((a) => {
      const day = Number(a.date.slice(-2));
      const weekIndex = Math.min(4, Math.floor((day - 1) / 7));
      weekly[weekIndex].income += servicePrice(a);
    });
    state.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => {
      const day = Number(e.date.slice(-2));
      const weekIndex = Math.min(4, Math.floor((day - 1) / 7));
      weekly[weekIndex].expense += Number(e.amount || 0);
    });
    const maxWeekly = Math.max(1, ...weekly.flatMap((w) => [w.income, w.expense]));
    document.getElementById('financeWeekChart').innerHTML = weekly.map((week) => {
      const incomeHeight = Math.max(week.income > 0 ? 8 : 2, Math.round((week.income / maxWeekly) * 100));
      const expenseHeight = Math.max(week.expense > 0 ? 8 : 2, Math.round((week.expense / maxWeekly) * 100));
      return `<div class="week-chart-group">
        <div class="week-bars">
          <span class="week-bar income-bar" style="--bar-height:${incomeHeight}%" title="Entradas: ${money(week.income)}"><i></i></span>
          <span class="week-bar expense-bar" style="--bar-height:${expenseHeight}%" title="Despesas: ${money(week.expense)}"><i></i></span>
        </div>
        <strong>${week.label}</strong>
      </div>`;
    }).join('');

    document.getElementById('financeWeekValues').innerHTML = weekly.map((week) => `
      <div class="week-value-row">
        <strong class="week-value-period">${week.label}</strong>
        <span class="week-value-item week-value-income"><i></i><small>Entradas</small><b>${money(week.income)}</b></span>
        <span class="week-value-item week-value-expense"><i></i><small>Despesas</small><b>${money(week.expense)}</b></span>
      </div>`).join('');

    document.getElementById('financeRevenue').textContent = money(revenue);
    document.getElementById('financePending').textContent = money(pendingValue);
    document.getElementById('financeExpenses').textContent = money(expenses);
    document.getElementById('financeNet').textContent = money(net);
    document.getElementById('financeTicket').textContent = money(ticket);
    document.getElementById('financeRevenueNote').textContent = `${received.length} ${received.length === 1 ? 'recebimento confirmado' : 'recebimentos confirmados'} no mês`;
    document.getElementById('financePendingNote').textContent = `${pending.length} ${pending.length === 1 ? 'atendimento aguardando baixa' : 'atendimentos aguardando baixa'}`;
    document.getElementById('financeExpensesNote').textContent = `${state.expenses.filter((e) => e.date.startsWith(month)).length} ${state.expenses.filter((e) => e.date.startsWith(month)).length === 1 ? 'despesa lançada' : 'despesas lançadas'} no mês`;
    document.getElementById('financeNetNote').textContent = net >= 0 ? 'sobrou no caixa após as despesas' : 'mês em resultado negativo';
    document.getElementById('financeTicketNote').textContent = received.length ? `${received.length} ${received.length === 1 ? 'atendimento pago' : 'atendimentos pagos'} no cálculo` : 'sem atendimentos pagos no período';
    document.getElementById('financeNetCard').classList.toggle('is-negative', net < 0);
    document.getElementById('financeNetCard').classList.toggle('is-positive', net > 0);
    document.getElementById('financeNetCard').classList.toggle('is-neutral', net === 0);
    document.getElementById('financePendingCard').classList.toggle('has-value', pendingValue > 0);

    const pendingAlert = document.getElementById('pendingPaymentAlert');
    pendingAlert.hidden = pending.length === 0;
    document.getElementById('pendingPaymentsCount').textContent = pending.length;

    const transactions = [
      ...received.map((a) => ({
        date: a.date,
        time: a.time,
        description: `${getClient(a.clientId)?.name || 'Cliente'} · ${getService(a.serviceId)?.name || 'Serviço'}${a.status === 'cancelled' ? ' · cancelado, valor mantido' : ''}`,
        value: servicePrice(a),
        type: 'income',
      })),
      ...state.expenses.filter((e) => e.date.startsWith(month)).map((e) => ({ date: e.date, time: '00:00', description: e.description, value: Number(e.amount), type: 'expense' })),
    ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    document.getElementById('transactionsList').innerHTML = transactions.slice(0, 12).map((t) => `
      <div class="transaction-row">
        <div><strong>${escapeHtml(t.description)}</strong><small>${shortDate(t.date)}</small></div>
        <strong class="transaction-value ${t.type === 'expense' ? 'negative' : ''}">${t.type === 'expense' ? '− ' : '+ '}${money(t.value)}</strong>
      </div>`).join('') || '<p class="muted-copy">Nenhuma movimentação registrada neste mês.</p>';

    document.getElementById('pendingPaymentsList').innerHTML = pending.length ? pending.map((a) => {
      const client = getClient(a.clientId);
      const service = getService(a.serviceId);
      return `<div class="pending-payment-row">
        <div><strong>${escapeHtml(client?.name || 'Cliente')}</strong><small>${shortDate(a.date)} · ${escapeHtml(service?.name || 'Serviço')}</small></div>
        <div class="pending-payment-value"><strong>${money(servicePrice(a))}</strong><button class="mini-action action-positive" data-mark-paid="${a.id}">Marcar recebido</button></div>
      </div>`;
    }).join('') : '<p class="muted-copy">Nenhum pagamento pendente neste mês.</p>';

    const completed = state.appointments.filter((a) => a.status === 'done' && a.date.startsWith(month));
    const activeServices = getActiveServices();
    const counts = activeServices.map((service) => ({ service, count: completed.filter((a) => a.serviceId === service.id).length })).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...counts.map((x) => x.count));
    document.getElementById('serviceRanking').innerHTML = counts.map(({ service, count }) => `
      <div class="ranking-row">
        <div><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.description || '')}${service.description ? ' · ' : ''}${count} ${count === 1 ? 'atendimento' : 'atendimentos'}</small></div>
        <strong>${count}</strong>
        <div class="ranking-meter"><i style="width:${Math.round((count / max) * 100)}%"></i></div>
      </div>`).join('') || '<p class="muted-copy">Nenhum serviço ativo.</p>';

    applyFinanceCollapseState();
  }

  function renderSettings() {
    document.getElementById('defaultGapInput').value = String(state.settings.defaultGap ?? DEFAULT_CONFIG.defaultGapMinutes ?? 15);
    document.getElementById('returnDaysSelect').value = String(state.settings.returnDays ?? DEFAULT_CONFIG.returnDays ?? 21);
    const settingsName = document.getElementById('settingsWorkspaceName');
    const settingsOwner = document.getElementById('settingsOwnerDisplayName');
    const settingsWhatsapp = document.getElementById('settingsWorkspaceWhatsapp');
    if (settingsName) settingsName.value = workspace?.name || '';
    if (settingsOwner) settingsOwner.value = workspace?.ownerName || ownerAccount?.displayName || '';
    if (settingsWhatsapp) settingsWhatsapp.value = workspace?.whatsapp || '';
    updateCurrentUserUI();
    renderAgendaToggles();
    document.getElementById('servicesSettings').innerHTML = getActiveServices().map((service) => `
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
      </article>`).join('') || '<p class="muted-copy">Nenhum serviço ativo.</p>';
  }

  function saveWorkspaceSettings(event) {
    event.preventDefault();
    if (!workspace || !ownerAccount) {
      showToast('Configure primeiro o acesso da proprietária pela tela inicial.');
      return;
    }
    const name = document.getElementById('settingsWorkspaceName').value.trim();
    const ownerName = document.getElementById('settingsOwnerDisplayName').value.trim();
    const whatsapp = normalizePhone(document.getElementById('settingsWorkspaceWhatsapp').value);
    if (!name || !ownerName) {
      showToast('Informe o nome do negócio e da profissional.');
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

  function populateAppointmentForm(date = agendaDate) {
    document.getElementById('appointmentClient').innerHTML = state.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('appointmentService').innerHTML = getActiveServices().map((s) => `<option value="${s.id}">${escapeHtml(s.name)}${s.description ? ` — ${escapeHtml(s.description)}` : ''} · ${money(s.price)}</option>`).join('');
    document.getElementById('appointmentDate').value = date;
    document.getElementById('appointmentTime').value = '09:00';
    document.getElementById('appointmentStatus').value = 'confirmed';
    document.getElementById('appointmentNotes').value = '';
  }

  function openAppointmentDialog() {
    populateAppointmentForm(agendaDate || today);
    document.getElementById('appointmentDialog').showModal();
  }

  function saveAppointment(event) {
    event.preventDefault();
    const clientId = document.getElementById('appointmentClient').value;
    const serviceId = document.getElementById('appointmentService').value;
    const date = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTime').value;
    const service = getService(serviceId);
    if (!clientId || !serviceId || !date || !time || !service) return;
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
    showToast('Cliente cadastrada.');
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
    paymentMode = mode;
    document.getElementById('paymentDialogTitle').textContent = mode === 'settle' ? 'Registrar recebimento' : 'Concluir atendimento';
    document.getElementById('paymentClientName').textContent = client?.name || 'Cliente';
    document.getElementById('paymentAmount').textContent = money(servicePrice(appointment));
    document.getElementById('paymentMethod').value = appointment.paymentMethod || (CONFIG.paymentMethods?.[0] || 'Pix');
    const pendingBtn = document.getElementById('markPaymentPendingBtn');
    pendingBtn.textContent = mode === 'settle' ? 'Continuar pendente' : 'Pendente';
    document.getElementById('paymentDialog').showModal();
  }

  function setPaymentReceived() {
    const appointment = state.appointments.find((a) => a.id === paymentAppointmentId);
    if (!appointment) return;
    appointment.status = 'done';
    appointment.paymentStatus = 'received';
    appointment.paymentMethod = document.getElementById('paymentMethod').value;
    appointment.refundStatus = null;
    appointment.paidAt = new Date().toISOString();
    saveState();
    closeDialog('paymentDialog');
    renderAll();
    showToast(paymentMode === 'settle' ? 'Pagamento recebido e baixado.' : 'Atendimento concluído. Pagamento recebido.');
  }

  function setPaymentPending() {
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

  function openCancelDialog(id) {
    const appointment = state.appointments.find((a) => a.id === id);
    if (!appointment) return;
    const client = getClient(appointment.clientId);
    cancellingAppointmentId = id;
    document.getElementById('cancelClientName').textContent = client?.name || 'Cliente';
    document.getElementById('cancelAmount').textContent = money(servicePrice(appointment));
    document.getElementById('cancelDialog').showModal();
  }

  function applyCancellation(refunded) {
    const appointment = state.appointments.find((a) => a.id === cancellingAppointmentId);
    if (!appointment) return;
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
    let message = `Olá, ${firstName(client.name)}! 💅`;
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
    if (!name || !Number.isFinite(price) || price < 0 || (duration !== null && (!Number.isFinite(duration) || duration <= 0))) {
      return showToast('Confira nome, valor e duração do serviço.');
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

    if (event.target.closest('[data-action="new-appointment"]')) openAppointmentDialog();
    if (event.target.closest('[data-action="new-client"]')) document.getElementById('clientDialog').showModal();

    const closeBtn = event.target.closest('[data-close-dialog]');
    if (closeBtn) closeDialog(closeBtn.dataset.closeDialog, closeBtn.dataset.cancelMessage || '');

    const clientRow = event.target.closest('[data-client-id]');
    if (clientRow) {
      selectedClientId = clientRow.dataset.clientId;
      renderClients(document.getElementById('clientSearch')?.value || '');
    }

    const wa = event.target.closest('[data-whatsapp]');
    if (wa) openWhatsApp(wa.dataset.whatsapp, wa.dataset.appointment || null);

    const complete = event.target.closest('[data-complete]');
    if (complete) openPaymentDialog(complete.dataset.complete, 'complete');

    const markPaid = event.target.closest('[data-mark-paid]');
    if (markPaid) openPaymentDialog(markPaid.dataset.markPaid, 'settle');

    const cancel = event.target.closest('[data-cancel]');
    if (cancel) openCancelDialog(cancel.dataset.cancel);

    const editService = event.target.closest('[data-edit-service]');
    if (editService) openServiceDialog(editService.dataset.editService);

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
      if (dialog.id === 'appointmentDialog') closeDialog(dialog.id, 'Cadastro de novo atendimento cancelado.');
      else if (dialog.id === 'expenseDialog') closeDialog(dialog.id, 'Registro de despesa cancelado.');
      else closeDialog(dialog.id);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dialog.id === 'appointmentDialog') closeDialog(dialog.id, 'Cadastro de novo atendimento cancelado.');
      else if (dialog.id === 'expenseDialog') closeDialog(dialog.id, 'Registro de despesa cancelado.');
      else closeDialog(dialog.id);
    });
  });

  document.getElementById('prevDayBtn').addEventListener('click', () => { agendaDate = shiftDate(agendaDate, -1); renderAgenda(); });
  document.getElementById('nextDayBtn').addEventListener('click', () => { agendaDate = shiftDate(agendaDate, 1); renderAgenda(); });
  document.getElementById('appointmentForm').addEventListener('submit', saveAppointment);
  document.getElementById('clientForm').addEventListener('submit', saveClient);
  document.getElementById('expenseForm').addEventListener('submit', saveExpense);
  document.getElementById('serviceForm').addEventListener('submit', saveService);
  document.getElementById('clientSearch').addEventListener('input', (event) => renderClients(event.target.value));

  document.getElementById('newExpenseBtn').addEventListener('click', () => {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = today;
    document.getElementById('expenseDialog').showModal();
  });
  document.getElementById('addServiceBtn').addEventListener('click', () => openServiceDialog());
  document.getElementById('deleteServiceBtn').addEventListener('click', requestDeleteService);
  document.getElementById('markPaymentReceivedBtn').addEventListener('click', setPaymentReceived);
  document.getElementById('markPaymentPendingBtn').addEventListener('click', setPaymentPending);
  document.getElementById('cancelRefundBtn').addEventListener('click', () => applyCancellation(true));
  document.getElementById('cancelNoRefundBtn').addEventListener('click', () => applyCancellation(false));

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

  document.getElementById('brandSettingsBtn').addEventListener('click', () => switchView('settings'));
  document.getElementById('profileBtn').addEventListener('click', () => {
    if (window.matchMedia('(min-width: 1080px)').matches) switchView('settings');
  });

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
})();
