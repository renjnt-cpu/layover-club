// Financial Analytics: is the membership contributing? Membership collections are NEVER shown as profit.
import { rpc } from '../api.js';
import { h, money, num, fmtDate, table, field, manilaToday, section, downloadCsv } from '../ui.js';
import { presets } from './dashboard.js';

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  let from = today.slice(0, 8) + '01', to = today, branch = '';
  const body = h('div', { class: 'space-y-5' });
  const fromIn = h('input', { class: 'input', type: 'date', value: from, 'aria-label': 'From' });
  const toIn = h('input', { class: 'input', type: 'date', value: to, 'aria-label': 'To' });
  const scoped = !!ctx.me.branch_id && ctx.me.role !== 'admin' && ctx.me.role !== 'owner';
  const brSel = h('select', { class: 'input', 'aria-label': 'Branch' }, ...(scoped ? [] : [h('option', { value: '' }, 'ALL BRANCHES')]), ...ctx.me.branches.filter((b) => !scoped || b.id === ctx.me.branch_id).map((b) => h('option', { value: b.id }, b.name)));
  const apply = () => { from = fromIn.value; to = toIn.value; branch = brSel.value; load(); };
  [fromIn, toIn, brSel].forEach((e) => e.addEventListener('change', apply));
  const pre = h('div', { class: 'flex gap-2 flex-wrap' }, ...presets(today).map(([l, f, t]) => h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { fromIn.value = f; toIn.value = t; apply(); } }, l)));
  const kpi = (label, value, sub) => h('div', { class: 'card' }, h('div', { class: 'hint font-bold' }, label), h('div', { class: 'kpi mt-1' }, value), sub ? h('div', { class: 'hint mt-1' }, sub) : null);

  async function load() {
    body.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const [d, prof] = await Promise.all([rpc('club_dashboard', { p_from: from, p_to: to, p_branch: branch || null }), rpc('club_report', { p_kind: 'profitability', p_from: from, p_to: to, p_branch: branch || null })]);
      draw(d, prof.rows);
    } catch (e) { body.replaceChildren(h('div', { class: 'card text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }

  function draw(d, perMember) {
    const k = d.kpi, p = d.profit, range = `${fmtDate(d.range.from)} to ${fmtDate(d.range.to)}`;
    const line = (label, value, cls) => h('div', { class: 'flex justify-between gap-3 py-1.5 border-b border-slate-100 ' + (cls || '') }, h('span', {}, label), h('span', { class: 'font-bold tabular-nums' }, value));
    const maxC = Math.max(1, ...d.collections_daily.map((x) => Number(x.amount)));
    body.replaceChildren(...[
      h('div', { class: 'grid gap-3 grid-cols-2 lg:grid-cols-4' },
        kpi('Membership fee collections', money(p.membership_fees), range + ' (verified payments only)'), kpi('Discounted product revenue', money(p.discounted_product_revenue), 'what members paid for the discounted items'),
        kpi('Total discounts granted', money(p.discounts_given), k.avg_discount != null ? 'avg ' + money(k.avg_discount) + ' per redemption' : ''),
        kpi('Avg additional purchase per redemption', k.avg_additional_purchase != null ? money(k.avg_additional_purchase) : '—', 'the rest of the order, beyond the discounted item')),
      h('div', { class: 'card space-y-2' },
        h('h2', { class: 'font-extrabold text-lg' }, 'Estimated gross contribution'),
        line('Membership fee collections', money(p.membership_fees)),
        line('+ Revenue from member orders, at regular price', money(p.member_sales_full_price)),
        line('− Membership discounts granted', '−' + money(p.discounts_given)),
        line('− Cost of the discounted items (actual cost data)', p.cost_of_discounted_items ? '−' + money(p.cost_of_discounted_items) : money(0), p.redemptions_without_cost ? 'text-amber-800' : ''),
        line('− Estimated cost of the rest of the member orders (ESTIMATE)', p.cost_of_other_items == null ? 'not included' : '−' + money(p.cost_of_other_items)),
        h('div', { class: 'flex justify-between gap-3 pt-2 text-lg font-black' }, h('span', {}, 'Estimated gross contribution'), h('span', { class: 'tabular-nums' }, money(p.contribution))),
        p.contribution_per_member != null ? h('div', { class: 'flex justify-between gap-3 text-base font-bold' }, h('span', {}, 'Estimated contribution per member'), h('span', { class: 'tabular-nums' }, money(p.contribution_per_member))) : null,
        h('p', { class: 'hint' }, 'Membership collections are not profit. This is a contribution figure, NOT net profit: rent, wages, utilities and other operating costs are not included.'),
        p.partial ? h('div', { class: 'text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2', role: 'note' },
          'Estimate. ', p.other_cost_pct == null ? 'The cost of the other items in member orders is not included (set a % under Settings → Rules). ' : `The cost of other items is estimated at ${p.other_cost_pct}% of their price. `,
          p.redemptions_without_cost ? `${p.redemptions_without_cost} redemption(s) have no product cost saved (add costs under Settings → Menu). ` : '', 'The real figure is lower until the missing costs are filled in.') : h('div', { class: 'text-sm font-semibold hint' }, p.other_cost_pct != null ? `Cost of the rest of each member order is an estimate (${p.other_cost_pct}% of its price).` : ''),
        p.breakeven_redemptions != null ? h('p', { class: 'text-sm' }, `At the average discount of ${money(k.avg_discount)} per redemption, the ${money(p.fee)} fee is used up after about ${p.breakeven_redemptions} redemptions. Members who redeem more than that need enough extra spending to stay profitable.`) : null),
      section('Membership collections over time', d.collections_daily.length ? h('div', { class: 'card' }, h('div', { class: 'flex items-end gap-1', style: 'height:7rem', role: 'img', 'aria-label': 'Bar chart of collections per day: ' + d.collections_daily.map((x) => `${x.date}: ${money(x.amount)}`).join(', ') },
        ...d.collections_daily.map((x) => h('div', { class: 'bar flex-1', title: `${fmtDate(x.date)}: ${money(x.amount)}`, style: `height:${Math.round((Number(x.amount) / maxC) * 100)}%` }))),
        h('div', { class: 'flex justify-between hint mt-1' }, h('span', {}, fmtDate(d.collections_daily[0].date)), h('span', {}, fmtDate(d.collections_daily[d.collections_daily.length - 1].date)))) : h('div', { class: 'empty' }, 'No verified payments in this period.')),
      section('Profitability per member', h('div', { class: 'card space-y-2' }, table([
        { label: 'Membership ID', key: 'Membership ID' }, { label: 'Member', key: 'Member' }, { label: 'Fees', num: true, render: (r) => money(r['Fees collected']) }, { label: 'Redemptions', num: true, key: 'Redemptions' },
        { label: 'Discounts', num: true, render: (r) => money(r['Discounts given']) }, { label: 'Member orders', num: true, render: (r) => money(r['Member order totals']) }, { label: 'Product cost', num: true, render: (r) => money(r['Product cost (known)']) },
        { label: 'Contribution', num: true, render: (r) => money(r.Contribution) }, { label: 'Basis', key: 'Basis' },
      ], perMember.slice(0, 100), { empty: 'No members in this period.' }), h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => downloadCsv(`profitability-${from}-${to}.csv`, perMember) }, 'Export CSV'))),
    ].filter(Boolean));
  }

  const root = h('div', { class: 'space-y-5' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Financial analytics'),
    h('div', { class: 'card space-y-2' }, pre, h('div', { class: 'grid gap-2 sm:grid-cols-3' }, field('From', fromIn), field('To', toIn), field('Branch', brSel))), body);
  load();
  return root;
}
