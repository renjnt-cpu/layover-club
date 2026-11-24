// Main Dashboard: membership and redemption statistics, alerts, branches, most redeemed items, staff activity. Money is on the Financial Analytics page.
import { rpc } from '../api.js';
import { h, money, num, fmtDate, table, field, manilaToday, addDays, section } from '../ui.js';

const first = (iso) => iso.slice(0, 8) + '01';
export function presets(today) {
  const prevEnd = addDays(first(today), -1);
  return [['Today', today, today], ['Last 7 days', addDays(today, -6), today], ['This month', first(today), today], ['Last month', first(prevEnd), prevEnd], ['Last 30 days', addDays(today, -29), today]];
}

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  let from = first(today), to = today, branch = '';
  const root = h('div', { class: 'space-y-5' });
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
      const [d, al] = await Promise.all([rpc('club_dashboard', { p_from: from, p_to: to, p_branch: branch || null }), rpc('club_alerts')]);
      draw(d, al);
    } catch (e) { body.replaceChildren(h('div', { class: 'card text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }

  function draw(d, al) {
    const k = d.kpi, range = `${fmtDate(d.range.from)} to ${fmtDate(d.range.to)}`;
    const alerts = [
      [al.pending_payments, 'payment(s) waiting to be verified'], [al.expires_today, 'expire today'], [al.expiring_3, 'expire within 3 days'], [al.expiring_7, 'expire within 7 days'], [al.expired_today, 'expired today'],
      [al.repeat_attempts, 'repeat attempts after a day was used (last 7 days)'], [al.overrides, 'manual overrides (last 7 days)'], [al.high_activity, 'very busy staff days (last 7 days)'], [al.open_flags, 'items need review'],
    ].filter(([n]) => n > 0);
    const maxN = Math.max(1, ...d.daily.map((x) => x.redemptions));
    body.replaceChildren(...[
      alerts.length ? h('div', { class: 'card border-amber-300 bg-amber-50', role: 'region', 'aria-label': 'Alerts' }, h('h2', { class: 'font-bold mb-1' }, 'Alerts'),
        h('ul', { class: 'flex flex-wrap gap-2' }, ...alerts.map(([n, t]) => h('li', {}, h('span', { class: 'badge b-orange' }, n + ' ' + t))))) : null,
      h('h2', { class: 'font-bold text-lg' }, 'Membership'),
      h('div', { class: 'grid gap-3 grid-cols-2 lg:grid-cols-4' },
        kpi('Total registered members', num(k.total_members)), kpi('Active members', num(k.active_members), `${k.expiring_soon} expiring soon`), kpi('Expired members', num(k.expired_members), `${k.suspended_members} suspended or cancelled`),
        kpi('New members today', num(k.new_today)), kpi('New members', num(k.new_memberships), range), kpi('Renewals', num(k.renewals), range),
        kpi('Membership collections', money(k.membership_revenue), range + ' (verified payments)'), kpi('Payments waiting', num(k.pending_payments), k.pending_amount ? money(k.pending_amount) + ' not counted yet' : '')),
      h('h2', { class: 'font-bold text-lg' }, 'Redemptions'),
      h('div', { class: 'grid gap-3 grid-cols-2 lg:grid-cols-4' },
        kpi("Today's redemptions", num(k.redemptions_today), k.open_holds ? k.open_holds + ' in checkout' : ''), kpi('Redemptions', num(k.redemptions_range), range),
        kpi('Total discount given', money(k.total_discount), k.avg_discount != null ? 'avg ' + money(k.avg_discount) + ' each' : ''), kpi('Average redemptions per member', k.avg_redemptions_per_member != null ? String(k.avg_redemptions_per_member) : '—', range)),
      h('p', { class: 'text-sm' }, 'Profitability (discounts, product cost, member spend and the Membership Contribution) is on the ', h('a', { class: 'underline font-bold', href: '#/financials' }, 'Financial analytics'), ' page.'),
      section('By branch', h('div', { class: 'card' }, table([
        { label: 'Branch', key: 'branch' }, { label: 'Memberships sold', num: true, key: 'new' }, { label: 'Renewals', num: true, key: 'renewals' },
        { label: 'Membership revenue', num: true, render: (r) => money(r.revenue) }, { label: 'Redemptions', num: true, key: 'redemptions' }, { label: 'Discount given', num: true, render: (r) => money(r.discount) },
        { label: 'Member sales', num: true, render: (r) => money(r.member_sales) }, { label: 'Avg member transaction', num: true, render: (r) => r.redemptions ? money(r.member_sales / r.redemptions) : '—' },
      ], d.by_branch, { empty: 'No branches.' }))),
      section('Most frequently redeemed items', h('div', { class: 'card' }, table([
        { label: 'Item', key: 'item' }, { label: 'Redemptions', num: true, key: 'redemptions' }, { label: 'Avg price', num: true, render: (r) => money(r.avg_price) }, { label: 'Discount given', num: true, render: (r) => money(r.discount) },
      ], d.top_products, { empty: 'No redemptions in this period.' }))),
      section('Redemptions per day', d.daily.length ? h('div', { class: 'card' }, h('div', { class: 'flex items-end gap-1', style: 'height:7rem', role: 'img', 'aria-label': 'Bar chart of redemptions per day: ' + d.daily.map((x) => `${x.date}: ${x.redemptions}`).join(', ') },
        ...d.daily.map((x) => h('div', { class: 'bar flex-1', title: `${fmtDate(x.date)}: ${x.redemptions} redemption(s), ${money(x.discount)} discount`, style: `height:${Math.round((x.redemptions / maxN) * 100)}%` }))),
        h('div', { class: 'flex justify-between hint mt-1' }, h('span', {}, fmtDate(d.daily[0].date)), h('span', {}, fmtDate(d.daily[d.daily.length - 1].date)))) : h('div', { class: 'empty' }, 'No redemptions in this period.')),
      section('Staff activity', h('div', { class: 'card' }, table([
        { label: 'Staff', key: 'name' }, { label: 'Memberships sold', num: true, key: 'registered' }, { label: 'Renewals', num: true, key: 'renewed' },
        { label: 'Redemptions processed', num: true, key: 'redemptions' }, { label: 'Blocked attempts', num: true, key: 'blocked_attempts' },
      ], d.staff, { empty: 'No staff activity in this period.', caption: 'Operational monitoring only. These counts are not meant for discipline or pay.' })))].filter(Boolean));
  }

  root.append(h('h1', { class: 'text-2xl font-extrabold' }, 'Main dashboard'),
    h('div', { class: 'card space-y-2' }, pre, h('div', { class: 'grid gap-2 sm:grid-cols-3' }, field('From', fromIn), field('To', toIn), field('Branch', brSel))), body);
  load();
  return root;
}
