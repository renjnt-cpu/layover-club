// Membership Renewal page: shows the current expiry and the new period BEFORE confirming, then records the payment.
import { rpc } from '../api.js';
import { h, toast, busy, money, fmtDate } from '../ui.js';
import { renewPanel, renewMessage } from '../actions.js';

export async function render(ctx) {
  const id = ctx.param;
  if (!ctx.branchId()) return h('div', { class: 'card' }, 'Choose your branch at the top of the screen first, then open this page again.');
  const plan = await rpc('club_renew_preview', { p_member: id });
  const panel = renewPanel(ctx, plan);
  const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
  const confirm = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, `Confirm ${money(plan.fee)}`);
  confirm.onclick = () => busy(confirm, async () => {
    err.textContent = '';
    try {
      const r = await panel.submit();
      toast(renewMessage(r), r.activated ? 'ok' : 'warn');
      ctx.go(ctx.can('member.list') ? '#/members/' + id : '#/');
    } catch (e) { err.textContent = e.message; }
  });
  return h('div', { class: 'space-y-4 max-w-xl' }, h('a', { href: ctx.can('member.list') ? '#/members/' + id : '#/', class: 'underline text-sm' }, '← Back'),
    h('h1', { class: 'text-2xl font-extrabold' }, plan.period_no === 1 ? 'Membership payment' : 'Renew membership'),
    h('div', { class: 'card space-y-3' }, panel.node, err, confirm));
}
