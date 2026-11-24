// Redemption History. Cashiers see today at their own branch; managers and admins can pick dates, branch, and filter.
import { rpc } from '../api.js';
import { h, table, money, fmtTime, fmtDate, field, manilaToday, downloadCsv } from '../ui.js';

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  const out = h('div', { class: 'card' });
  const root = h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Redemption history'));

  if (!ctx.can('reports.view')) {
    root.append(h('p', { class: 'muted' }, `Today (${fmtDate(today)})${ctx.branchId() ? ' at ' + ctx.branchName() : ''}.`), out);
    try {
      const rows = await rpc('club_today_redemptions', { p_branch: ctx.branchId() });
      out.replaceChildren(table([
        { label: 'Time', render: (r) => fmtTime(r.at) }, { label: 'Member', render: (r) => r.name + ' · ' + r.member_no }, { label: 'Item', key: 'item' },
        { label: 'Discount', num: true, render: (r) => money(r.discount) }, { label: 'Item paid', num: true, render: (r) => money(r.final) }, { label: 'Transaction', key: 'receipt' }, { label: 'By', key: 'by' },
      ], rows, { empty: 'No redemptions yet today.' }), h('p', { class: 'hint mt-2' }, rows.length + ' redemption(s) today.'));
    } catch (e) { out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
    return root;
  }

  const fromIn = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'From' });
  const toIn = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'To' });
  const brSel = h('select', { class: 'input', 'aria-label': 'Branch' }, h('option', { value: '' }, 'All branches'), ...ctx.me.branches.map((b) => h('option', { value: b.id }, b.name)));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter by member, item or staff', 'aria-label': 'Filter' });
  let rows = [];
  const draw = () => {
    const s = search.value.toLowerCase();
    const list = rows.filter((r) => !s || Object.values(r).join(' ').toLowerCase().includes(s));
    out.replaceChildren(table([
      { label: 'Date', key: 'Date' }, { label: 'Time', key: 'Time' }, { label: 'Membership ID', key: 'Membership ID' }, { label: 'Member', key: 'Member' }, { label: 'Branch', key: 'Branch' }, { label: 'Product', key: 'Product' },
      { label: 'Original', num: true, render: (r) => money(r['Original price']) }, { label: 'Discount', num: true, render: (r) => money(r.Discount) }, { label: 'Net item', num: true, render: (r) => money(r['Net item revenue']) },
      { label: 'Staff', key: 'Staff' }, { label: 'Transaction #', key: 'Transaction #' }, { label: 'Identity', key: 'Identity check' }, { label: 'Flags', key: 'Flags' },
    ], list, { empty: 'No redemptions for these filters.' }), h('p', { class: 'hint mt-2' }, list.length + ' redemption(s).'));
  };
  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try { rows = (await rpc('club_report', { p_kind: 'redemptions', p_from: fromIn.value, p_to: toIn.value, p_branch: brSel.value || null })).rows; draw(); }
    catch (e) { out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }
  [fromIn, toIn, brSel].forEach((e) => e.addEventListener('change', load)); search.addEventListener('input', draw);
  root.append(h('div', { class: 'card space-y-2' }, h('div', { class: 'grid gap-2 sm:grid-cols-4' }, field('From', fromIn), field('To', toIn), field('Branch', brSel), field('Filter', search)),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCsv(`redemptions-${fromIn.value}-${toIn.value}.csv`, rows) }, 'Export CSV')), out);
  load();
  return root;
}
