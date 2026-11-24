// Cashier home: six big buttons. Cashiers never see reports, the full member list or settings.
import { rpc } from '../api.js';
import { h, num } from '../ui.js';

export async function render(ctx) {
  const tiles = [
    ['SCAN MEMBERSHIP', 'Open the camera and scan the QR', '#/scan', 'member.verify', false],
    ['VERIFY MEMBER', 'Search by membership ID, mobile or name', '#/verify', 'member.verify', true],
    ['REDEEM DISCOUNT', 'Verify first, then hold and complete the sale', '#/verify', 'redemption.use', false],
    ["VIEW TODAY'S REDEMPTIONS", 'What was redeemed today', '#/today', 'redemption.use', true],
    ['REGISTER NEW MEMBER', 'Sign up and take the payment', '#/register', 'member.register', false],
    ['CHECK MEMBERSHIP STATUS', 'Is the card active? When does it expire?', '#/verify', 'member.verify', true],
  ].filter(([, , , perm]) => ctx.can(perm));
  const root = h('div', { class: 'space-y-4' });
  root.append(h('h1', { class: 'text-2xl font-extrabold' }, 'Layover Club'),
    h('p', { class: 'muted' }, `Signed in as ${ctx.me.name} (${ctx.me.role_label}). ${ctx.branchId() ? 'Branch: ' + ctx.branchName() + '.' : 'Choose your branch at the top of the screen.'}`),
    h('div', { class: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' }, ...tiles.map(([t, s, href, , alt]) => h('a', { class: 'tile' + (alt ? ' alt' : ''), href }, h('span', {}, t), h('span', { class: 'sub' }, s)))));
  if (ctx.can('dashboard.view')) {
    const box = h('div', {});
    root.append(box);
    rpc('club_alerts').then((a) => {
      const items = [[a.pending_payments, 'payment(s) waiting to be verified', '#/payments'], [a.open_flags, 'item(s) need review', '#/review'], [a.expires_today, 'membership(s) expire today', '#/reports'], [a.expiring_7, 'expire within 7 days', '#/reports']].filter(([n]) => n > 0);
      if (items.length) box.replaceChildren(h('div', { class: 'card border-amber-300 bg-amber-50 space-y-2' }, h('h2', { class: 'font-bold' }, 'Needs attention'),
        h('ul', { class: 'flex flex-wrap gap-2' }, ...items.map(([n, t, href]) => h('li', {}, h('a', { class: 'badge b-orange', style: 'min-height:2.75rem;padding:.4rem .9rem', href }, num(n) + ' ' + t))))));
    }).catch(() => {});
  }
  return root;
}
