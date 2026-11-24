// Reports with filters and CSV / Excel / PDF export. Date range and branch are applied by the database (branch managers only ever get their own branch);
// product / staff / member filters narrow the rows on screen, and the exports contain exactly what you see.
import { rpc } from '../api.js';
import { h, field, table, money, downloadCsv, manilaToday } from '../ui.js';
import { exportXlsx, exportPdf } from '../exporters.js';

const TABS = [
  ['registrations', 'Registrations'], ['payments', 'Payments'], ['purchases', 'Memberships sold'], ['renewals', 'Renewals'], ['redemptions', 'Daily redemptions'], ['monthly', 'Monthly redemptions'],
  ['branches', 'Branch performance'], ['utilization', 'Discount utilization'], ['profitability', 'Profitability'], ['expiring', 'Expiring soon'], ['products', 'Products'], ['staff', 'Staff activity'], ['attempts', 'Blocked & failed attempts'],
];
const MONEY = new Set(['Fee', 'Amount', 'Original price', 'Discount', 'Net item revenue', 'Order total', 'Original sales value', 'Discount given', 'Revenue after discount', 'Member sales processed', 'Collections', 'Member order totals',
  'Discount received', 'Fee paid', 'Fees collected', 'Discounts given', 'Product cost (known)', 'Estimated cost of other items', 'Contribution']);

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  let kind = 'registrations', rows = [];
  const fromIn = h('input', { class: 'input', type: 'date', value: today.slice(0, 8) + '01', 'aria-label': 'From' });
  const toIn = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'To' });
  const scoped = !!ctx.me.branch_id && ctx.me.role !== 'admin' && ctx.me.role !== 'owner';
  const brSel = h('select', { class: 'input', 'aria-label': 'Branch' }, ...(scoped ? [] : [h('option', { value: '' }, 'All branches')]), ...ctx.me.branches.filter((b) => !scoped || b.id === ctx.me.branch_id).map((b) => h('option', { value: b.id }, b.name)));
  const fProduct = h('input', { class: 'input', type: 'search', placeholder: 'Product', 'aria-label': 'Filter by product' });
  const fStaff = h('input', { class: 'input', type: 'search', placeholder: 'Staff', 'aria-label': 'Filter by staff' });
  const fMember = h('input', { class: 'input', type: 'search', placeholder: 'Member or ID', 'aria-label': 'Filter by member' });
  const tabBar = h('div', { class: 'flex gap-2 flex-wrap', role: 'tablist', 'aria-label': 'Reports' });
  const out = h('div', { class: 'card' });
  const count = h('p', { class: 'hint' });
  const label = () => (TABS.find(([k]) => k === kind) || [, kind])[1];

  const filtered = () => {
    const p = fProduct.value.toLowerCase(), s = fStaff.value.toLowerCase(), m = fMember.value.toLowerCase();
    return rows.filter((r) => (!p || String(r.Product || r.Item || '').toLowerCase().includes(p)) && (!s || String(r.Staff || r['Recorded by'] || '').toLowerCase().includes(s))
      && (!m || (String(r.Member || r.Name || '') + ' ' + String(r['Membership ID'] || '')).toLowerCase().includes(m)));
  };
  const cap = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) : s);
  function draw() {
    const list = filtered();
    count.textContent = list.length + ' row(s)' + (list.length !== rows.length ? ' (filtered from ' + rows.length + ')' : '');
    if (!list.length) { out.replaceChildren(h('div', { class: 'empty' }, 'No rows for these filters.')); return; }
    const cols = Object.keys(list[0]).map((c) => ({ label: c, num: MONEY.has(c) || typeof list[0][c] === 'number',
      render: (r) => (MONEY.has(c) && r[c] != null && r[c] !== '' ? money(r[c]) : (['Paid by', 'Type', 'Channel', 'Result', 'Status', 'Identity check'].includes(c) ? cap(r[c]) : (r[c] ?? ''))) }));
    out.replaceChildren(...[table(cols, list.slice(0, 500)), list.length > 500 ? h('p', { class: 'hint mt-2' }, 'Showing the first 500 rows. Export for everything.') : null].filter(Boolean));
  }
  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const r = await rpc('club_report', { p_kind: kind, p_from: fromIn.value, p_to: toIn.value, p_branch: brSel.value || null });
      rows = r.rows || []; draw();
    } catch (e) { rows = []; count.textContent = ''; out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }
  const drawTabs = () => tabBar.replaceChildren(...TABS.map(([k, l]) => h('button', { class: 'btn btn-sm ' + (k === kind ? 'btn-primary' : 'btn-secondary'), type: 'button', role: 'tab', 'aria-selected': String(k === kind), onclick: () => { kind = k; drawTabs(); load(); } }, l)));
  drawTabs();
  [fromIn, toIn, brSel].forEach((e) => e.addEventListener('change', load));
  [fProduct, fStaff, fMember].forEach((e) => e.addEventListener('input', draw));
  const fname = () => `layover-club-${kind}-${fromIn.value}-${toIn.value}`;
  const exports = h('div', { class: 'flex gap-2 flex-wrap items-center' },
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCsv(fname() + '.csv', filtered()) }, 'Export CSV'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => exportXlsx(fname(), filtered()) }, 'Export Excel'),
    h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => exportPdf(fname(), `Layover Club: ${label()} (${fromIn.value} to ${toIn.value})`, filtered()) }, 'Export PDF'), count);
  load();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Reports'), tabBar,
    h('div', { class: 'card space-y-2' }, h('div', { class: 'grid gap-2 sm:grid-cols-3' }, field('From', fromIn), field('To', toIn), field('Branch', brSel)),
      h('div', { class: 'grid gap-2 sm:grid-cols-3' }, field('Product', fProduct), field('Staff', fStaff), field('Member', fMember)), exports), out);
}
