// Audit Logs: every sensitive change (who, when, why, before and after). Super Admin only.
import { rpc } from '../api.js';
import { h, field, table, manilaToday, addDays, downloadCsv } from '../ui.js';

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  const fromIn = h('input', { class: 'input', type: 'date', value: addDays(today, -30), 'aria-label': 'From' });
  const toIn = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'To' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter (person, action, reason)', 'aria-label': 'Filter' });
  const out = h('div', { class: 'card' });
  let rows = [];
  const draw = () => {
    const s = search.value.toLowerCase();
    const list = rows.filter((r) => !s || Object.values(r).join(' ').toLowerCase().includes(s));
    out.replaceChildren(table([{ label: 'When', key: 'When' }, { label: 'Who', key: 'Who' }, { label: 'Action', render: (r) => String(r.Action).replace('club.', '').replace(/_/g, ' ') }, { label: 'Reason', key: 'Reason' }, { label: 'Before', key: 'Before' }, { label: 'After', key: 'After' }],
      list.slice(0, 500), { empty: 'No changes in this period.' }), h('p', { class: 'hint mt-2' }, list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') + '.'));
  };
  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try { rows = (await rpc('club_report', { p_kind: 'audit', p_from: fromIn.value, p_to: toIn.value, p_branch: null })).rows; draw(); }
    catch (e) { out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }
  [fromIn, toIn].forEach((e) => e.addEventListener('change', load)); search.addEventListener('input', draw);
  load();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Audit logs'),
    h('p', { class: 'muted' }, 'Registrations, payments verified or rejected, renewals, redemptions, restored days, suspensions, replaced cards, contact changes, photos, settings, branches and staff.'),
    h('div', { class: 'card space-y-2' }, h('div', { class: 'grid gap-2 sm:grid-cols-3' }, field('From', fromIn), field('To', toIn), field('Filter', search)),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCsv(`audit-${fromIn.value}-${toIn.value}.csv`, rows) }, 'Export CSV')), out);
}
