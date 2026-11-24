import { sb, rpc } from './api.js';
import { h, toast, busy } from './ui.js';
import { LOGIN_DOMAIN } from './config.js';

// One list drives the menu, the routes and the permission checks. The server checks every permission again.
const PAGES = [
  { key: '', label: 'Home', perm: 'member.verify', mod: () => import('./pages/home.js') },
  { key: 'scan', label: 'Scan', perm: 'member.verify', mod: () => import('./pages/scan.js') },
  { key: 'verify', label: 'Verify', perm: 'member.verify', mod: () => import('./pages/verify.js') },
  { key: 'v', label: 'Verify', perm: 'member.verify', hidden: true, mod: () => import('./pages/verify.js') },
  { key: 'register', label: 'Register', perm: 'member.register', mod: () => import('./pages/register.js') },
  { key: 'today', label: 'Redemptions', perm: 'redemption.use', mod: () => import('./pages/today.js') },
  { key: 'members', label: 'Members', perm: 'member.list', mod: () => import('./pages/members.js') },
  { key: 'payments', label: 'Payments', perm: 'payment.view', mod: () => import('./pages/payments.js') },
  { key: 'dashboard', label: 'Dashboard', perm: 'dashboard.view', mod: () => import('./pages/dashboard.js') },
  { key: 'financials', label: 'Financials', perm: 'financial.view', mod: () => import('./pages/financials.js') },
  { key: 'reports', label: 'Reports', perm: 'reports.view', mod: () => import('./pages/reports.js') },
  { key: 'review', label: 'Needs Review', perm: 'review.view', mod: () => import('./pages/review.js') },
  { key: 'branches', label: 'Branches', perm: 'branch.manage', mod: () => import('./pages/branches.js') },
  { key: 'staff', label: 'Staff', perm: 'staff.manage', mod: () => import('./pages/staff.js') },
  { key: 'settings', label: 'Settings', perm: ['settings.edit', 'products.edit'], mod: () => import('./pages/settings.js') },
  { key: 'audit', label: 'Audit logs', perm: 'audit.view', mod: () => import('./pages/audit.js') },
  { key: 'card', label: 'Card', perm: 'member.card', hidden: true, mod: () => import('./pages/cardpage.js') },
  { key: 'renew', label: 'Renew', perm: 'member.renew', hidden: true, mod: () => import('./pages/renew.js') },
];

const app = document.getElementById('app');
let me = null;
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private window */ } } };

function can(perm) { return !!me && (Array.isArray(perm) ? perm.some((p) => (me.perms || []).includes(p)) : (me.perms || []).includes(perm)); }

function branchId() {
  if (me.branch_id) return me.branch_id;
  const saved = store.get('club-branch');
  return me.branches.some((b) => b.id === saved) ? saved : null;
}
function branchName() { const b = me.branches.find((x) => x.id === branchId()); return b ? b.name : ''; }

// ---------------------------------------------------------------- sessions end after a period of inactivity (and on the server when the token expires)
let idleTimer = null;
function armIdle() {
  clearTimeout(idleTimer);
  if (!me) return;
  const mins = (me.rules && me.rules.idle_minutes) || 30;
  idleTimer = setTimeout(async () => { await sb.auth.signOut(); me = null; renderLogin('You were signed out because the screen was idle. Please sign in again.'); }, mins * 60000);
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (me) armIdle(); }, { passive: true }));

function renderLogin(message) {
  const id = h('input', { class: 'input', type: 'text', autocomplete: 'username', placeholder: 'Employee ID or email', required: true, 'aria-label': 'Employee ID or email' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true, 'aria-label': 'Password' });
  const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' }, message || '');
  const btn = h('button', { class: 'btn btn-primary w-full', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'space-y-3', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    await busy(btn, async () => {
      const raw = id.value.trim();
      const email = raw.includes('@') ? raw : `${raw.toLowerCase()}@${LOGIN_DOMAIN}`;
      const { error } = await sb.auth.signInWithPassword({ email, password: pw.value });
      if (error) { err.textContent = 'That sign-in did not work. Check your ID and password.'; return; }
      boot();
    });
  } }, id, pw, err, btn);
  app.replaceChildren(h('main', { id: 'main', class: 'min-h-screen flex items-center justify-center p-4' },
    h('div', { class: 'card w-full max-w-sm space-y-4' },
      h('div', {}, h('div', { class: 'text-xs font-extrabold tracking-widest', style: 'color:#0642B8' }, 'LAYOVER DESSERT CAFÉ'), h('h1', { class: 'text-2xl font-extrabold', style: 'color:#0642B8' }, 'Layover Club'), h('p', { class: 'text-sm muted' }, 'Staff only. Sign in to verify members and record redemptions.')),
      form)));
}

function renderMessage(title, text) {
  app.replaceChildren(h('main', { id: 'main', class: 'min-h-screen flex items-center justify-center p-4' },
    h('div', { class: 'card w-full max-w-md space-y-3' }, h('h1', { class: 'text-lg font-bold' }, title), h('p', { class: 'text-sm muted' }, text),
      h('button', { class: 'btn btn-secondary', onclick: async () => { await sb.auth.signOut(); me = null; renderLogin(); } }, 'Sign out'))));
}

function hashParts() { return location.hash.replace(/^#\/?/, '').split('/'); }
function visiblePages() { return PAGES.filter((p) => !p.hidden && can(p.perm)); }

function branchControl() {
  if (me.branch_id) return h('span', { class: 'badge b-blue', title: 'Your branch' }, 'Branch: ' + me.branch_name);
  const sel = h('select', { class: 'input', style: 'min-height:2.75rem;width:auto', 'aria-label': 'Branch you are working at', onchange: () => { store.set('club-branch', sel.value); route(); } },
    h('option', { value: '' }, 'Choose branch…'),
    ...me.branches.map((b) => h('option', { value: b.id, selected: b.id === branchId() }, b.name)));
  return sel;
}

function layout(content) {
  const key = hashParts()[0];
  const items = visiblePages();
  const activeKey = key === 'v' ? 'verify' : (key === 'card' || key === 'renew') ? (can('member.list') ? 'members' : '') : key;
  const link = (p, cls) => h('a', { href: '#/' + p.key, class: cls + (p.key === activeKey ? ' active' : ''), 'aria-current': p.key === activeKey ? 'page' : null }, p.label);
  const signOut = () => h('button', { class: 'underline text-sm', style: 'min-height:2.75rem;min-width:2.75rem;padding:0 .5rem', onclick: async () => { await sb.auth.signOut(); me = null; clearTimeout(idleTimer); location.hash = ''; boot(); } }, 'Sign out');
  const offline = h('div', { id: 'offline-bar', class: 'bg-red-700 text-white text-center text-sm font-bold p-2', role: 'alert', style: navigator.onLine === false ? '' : 'display:none' },
    'No internet. Membership checks and redemptions are paused until it is back.');
  return h('div', { class: 'min-h-screen md:flex' },
    h('aside', { class: 'hidden md:flex md:w-56 shrink-0 flex-col gap-1 p-3 border-r border-slate-200 bg-white no-print' },
      h('div', { class: 'px-2 py-3' }, h('div', { class: 'text-[10px] font-extrabold tracking-widest', style: 'color:#0642B8' }, 'LAYOVER DESSERT CAFÉ'), h('div', { class: 'font-black tracking-wide', style: 'color:#0642B8' }, 'LAYOVER CLUB')),
      h('nav', { 'aria-label': 'Main' }, ...items.map((p) => link(p, 'nav-link'))),
      h('div', { class: 'mt-auto px-2 pt-4 text-xs muted' }, me.name, h('br'), me.role_label, h('br'), signOut())),
    h('div', { class: 'flex-1 min-w-0' },
      offline,
      h('header', { class: 'flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200 no-print' },
        h('span', { class: 'md:hidden font-black tracking-wide', style: 'color:#0642B8' }, 'LAYOVER CLUB'),
        h('span', { class: 'hidden md:inline text-sm muted' }, 'Staff only'), h('div', { class: 'flex items-center gap-3' }, branchControl(), h('span', { class: 'md:hidden' }, signOut()))),
      h('main', { id: 'main', class: 'p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto space-y-5' }, content)),
    h('nav', { class: 'bottom-nav md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex no-print', 'aria-label': 'Main' }, ...items.map((p) => link(p, ''))));
}

async function route() {
  const parts = hashParts();
  const key = parts[0];
  const page = PAGES.find((p) => p.key === key) || PAGES[0];
  if (!can(page.perm)) { const first = visiblePages()[0]; if (first && first.key !== key) { location.hash = '#/' + first.key; return; } }
  const ctx = { me, can, param: parts[1] ? decodeURIComponent(parts[1]) : null, branchId, branchName, go: (hash) => { location.hash = hash; }, refresh: route };
  app.replaceChildren(layout(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…')));
  try {
    const mod = await page.mod();
    const content = await mod.render(ctx);
    app.replaceChildren(layout(content));
  } catch (e) {
    app.replaceChildren(layout(h('div', { class: 'card text-red-800 font-semibold', role: 'alert' }, 'This page could not load: ' + (e.message || e))));
  }
}

// Arriving from an emailed "set your password" / invite link: the person picks their OWN password here. Nobody else ever sees it.
let arrivedByLink = /[#&?]type=(recovery|invite)/.test(location.hash + location.search);

let settingPassword = false;
sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' && !settingPassword) { arrivedByLink = true; showSetPassword(); } });

async function showSetPassword() {
  if (settingPassword) return;
  settingPassword = true;
  const { data } = await sb.auth.getSession();   // supabase-js reads the tokens from the link and signs the person in
  if (!data.session) { settingPassword = false; arrivedByLink = false; history.replaceState(null, '', location.pathname); renderLogin('That link has expired or was already used. Ask the Super Admin to send a new one.'); return; }
  const pw1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: 10, placeholder: 'New password (at least 10 characters)', 'aria-label': 'New password' });
  const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: 10, placeholder: 'Type it again', 'aria-label': 'New password again' });
  const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary w-full', type: 'submit' }, 'Save my password');
  const form = h('form', { class: 'space-y-3', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (pw1.value.length < 10) { err.textContent = 'Use at least 10 characters.'; return; }
    if (pw1.value !== pw2.value) { err.textContent = 'The two passwords are not the same.'; return; }
    await busy(btn, async () => {
      const { error } = await sb.auth.updateUser({ password: pw1.value });
      if (error) { err.textContent = error.message || 'The password could not be saved.'; return; }
      settingPassword = false; arrivedByLink = false; history.replaceState(null, '', location.pathname);
      toast('Password saved. You are signed in.');
      boot();
    });
  } }, pw1, pw2, err, btn);
  app.replaceChildren(h('main', { id: 'main', class: 'min-h-screen flex items-center justify-center p-4' },
    h('div', { class: 'card w-full max-w-sm space-y-4' },
      h('div', {}, h('div', { class: 'text-xs font-extrabold tracking-widest', style: 'color:#0642B8' }, 'LAYOVER DESSERT CAFÉ'), h('h1', { class: 'text-2xl font-extrabold', style: 'color:#0642B8' }, 'Set your password'), h('p', { class: 'text-sm muted' }, 'Choose a password only you know. Use it with your login to sign in.')),
      form)));
}

export async function boot() {
  if (arrivedByLink) { await showSetPassword(); return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) { renderLogin(); return; }
  try { me = await rpc('club_me'); }
  catch (e) { renderMessage('We could not load your account', e.message); return; }
  if (!me || !me.role) { renderMessage('No access yet', 'Your login is not on the Layover Club staff list. Ask the Super Admin to add you.'); return; }
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { const b = document.getElementById('offline-bar'); if (b) b.style.display = 'none'; });
  window.addEventListener('offline', () => { const b = document.getElementById('offline-bar'); if (b) b.style.display = ''; });
  armIdle();
  route();
}

window.addEventListener('error', (e) => toast('Something went wrong: ' + e.message, 'err'));
boot();
