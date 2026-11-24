// Staff Management: who can use Layover Club, with which role, at which branch. Nobody sees the Club without being on this list.
import { rpc } from '../api.js';
import { h, toast, busy, field, table, badge } from '../ui.js';

export async function render(ctx) {
  const list = await rpc('club_staff_list');
  const login = h('input', { class: 'input', type: 'text', required: true, placeholder: 'Employee ID or email', 'aria-label': 'Login' });
  const nm = h('input', { class: 'input', type: 'text', placeholder: 'Name shown in records', 'aria-label': 'Name' });
  const role = h('select', { class: 'input', 'aria-label': 'Role' },
    h('option', { value: 'cashier' }, 'Cashier: scan, verify, redeem, register, renew, photo'),
    h('option', { value: 'manager' }, 'Branch Manager: + members, payments, reports, review, restore'),
    ...(ctx.me.role === 'owner' ? [h('option', { value: 'admin' }, 'Super Admin: + settings, branches, staff, audit logs')] : []));
  const br = h('select', { class: 'input', 'aria-label': 'Branch' }, h('option', { value: '' }, 'Either branch'), ...ctx.me.branches.map((b) => h('option', { value: b.id }, 'Only ' + b.name)));
  const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
  const add = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add or update');
  const form = h('form', { class: 'card space-y-3', onsubmit: (e) => { e.preventDefault(); err.textContent = ''; busy(add, async () => {
    try { await rpc('club_staff_set', { p_login: login.value, p_role: role.value, p_branch: br.value || null, p_name: nm.value, p_active: true }); toast('Saved.'); ctx.refresh(); } catch (ex) { err.textContent = ex.message; } }); } },
    h('h2', { class: 'font-extrabold text-lg' }, 'Give someone access'),
    h('p', { class: 'hint' }, 'Create their login first in Supabase Authentication (the same login the Staff Ops app uses), then add it here. A branch manager fixed to one branch only ever sees that branch. Sessions end after a period of inactivity.'),
    h('div', { class: 'grid gap-3 sm:grid-cols-2' }, field('Login', login), field('Name', nm), field('Role', role), field('Works at', br)), err, add);
  const ROLE = { cashier: 'Cashier', manager: 'Branch Manager', admin: 'Super Admin' };
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Staff management'), form, h('div', { class: 'card' }, table([
    { label: 'Name', key: 'name' }, { label: 'Login', key: 'login' }, { label: 'Role', render: (r) => ROLE[r.role] || r.role }, { label: 'Branch', render: (r) => r.branch || 'Either' },
    { label: 'Active', render: (r) => r.active ? badge('Active', 'green') : badge('Off', 'gray') },
    { label: '', render: (r) => h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => { try { await rpc('club_staff_set', { p_login: r.login, p_role: r.role, p_branch: r.branch_id, p_name: r.name, p_active: !r.active }); ctx.refresh(); } catch (e) { toast(e.message, 'err'); } } }, r.active ? 'Turn off' : 'Turn on') },
  ], list, { empty: 'Only the Super Admin (owner) has access so far.' })));
}
