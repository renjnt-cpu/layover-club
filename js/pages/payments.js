// Membership Payments: verify or reject pending payments. A membership (or renewal) starts ONLY when its payment is verified.
import { rpc } from '../api.js';
import { h, toast, busy, table, money, badge, fmtDateTime, field, manilaToday, addDays, reasonModal, METHOD, modal } from '../ui.js';
import { cardPair } from '../card.js';

const PAY = { verified: ['Verified', 'green'], pending: ['Waiting to be verified', 'yellow'], rejected: ['Rejected', 'red'] };

export async function render(ctx) {
  const today = ctx.me.rules.today || manilaToday();
  const status = h('select', { class: 'input', 'aria-label': 'Status' }, ...[['', 'All'], ['pending', 'Waiting to be verified'], ['verified', 'Verified'], ['rejected', 'Rejected']].map(([v, l]) => h('option', { value: v }, l)));
  status.value = 'pending';
  const fromIn = h('input', { class: 'input', type: 'date', value: addDays(today, -60), 'aria-label': 'From' });
  const toIn = h('input', { class: 'input', type: 'date', value: today, 'aria-label': 'To' });
  const brSel = h('select', { class: 'input', 'aria-label': 'Branch' }, h('option', { value: '' }, 'All branches'), ...ctx.me.branches.map((b) => h('option', { value: b.id }, b.name)));
  const out = h('div', { class: 'card' });
  const canVerify = ctx.can('payment.verify');

  async function verify(p, btn) {
    await busy(btn, async () => {
      try {
        const r = await rpc('club_payment_verify', { p_payment: p.id });
        toast(`${p.name} is now ACTIVE.`);
        if (r.qr_token) await modal({ title: 'Payment verified: card issued', submitLabel: 'Done', body: h('div', { class: 'space-y-3' }, cardPair(r.member, r.qr_token, ctx.me.rules)), onSubmit: async () => true });
        load();
      } catch (e) { toast(e.message, 'err'); }
    });
  }
  async function load() {
    out.replaceChildren(h('div', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    try {
      const rows = await rpc('club_payments_list', { p_status: status.value || null, p_from: fromIn.value, p_to: toIn.value, p_branch: brSel.value || null });
      out.replaceChildren(table([
        { label: 'Recorded', render: (p) => fmtDateTime(p.recorded_at) }, { label: 'Member', render: (p) => h('a', { class: 'font-bold underline', href: ctx.can('member.list') ? '#/members/' + p.member_id : '#/payments' }, p.name) },
        { label: 'ID', key: 'member_no' }, { label: 'Type', render: (p) => p.kind === 'new' ? 'Membership' : 'Renewal' }, { label: 'Amount', num: true, render: (p) => money(p.amount) },
        { label: 'Paid by', render: (p) => METHOD[p.method] || p.method }, { label: 'Reference', key: 'reference' }, { label: 'Branch', key: 'branch' },
        { label: 'Status', render: (p) => badge(...(PAY[p.status] || [p.status, 'gray'])) }, { label: 'Recorded by', key: 'recorded_by' },
        { label: 'Verified by', render: (p) => (p.verified_by || '') + (p.reject_reason ? ': ' + p.reject_reason : '') },
        { label: '', render: (p) => p.status === 'pending' && canVerify ? h('div', { class: 'flex gap-2' },
            (() => { const b = h('button', { class: 'btn btn-success btn-sm', type: 'button' }, 'Verify payment'); b.onclick = () => verify(p, b); return b; })(),
            h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => { const r = await reasonModal('Reject this payment', 'Why? (for example: reference not found)', 'Reject payment', true); if (r) { try { await rpc('club_payment_reject', { p_payment: p.id, p_reason: r.reason }); toast('Payment rejected.'); load(); } catch (e) { toast(e.message, 'err'); } } } }, 'Reject')) : '' },
      ], rows, { empty: 'No payments for these filters.' }), h('p', { class: 'hint mt-2' }, rows.length + ' payment(s). Check the reference against the wallet or bank statement before verifying.'));
    } catch (e) { out.replaceChildren(h('div', { class: 'text-red-800 font-semibold', role: 'alert' }, e.message)); }
  }
  [status, fromIn, toIn, brSel].forEach((e) => e.addEventListener('change', load));
  load();
  return h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Membership payments'),
    h('p', { class: 'muted' }, 'Cash is verified at the counter. GCash, Maya, card and bank payments wait here. The membership starts, and the card is issued, only when you verify the payment.'),
    h('div', { class: 'card grid gap-2 sm:grid-cols-4' }, field('Status', status), field('From', fromIn), field('To', toIn), field('Branch', brSel)), out);
}
