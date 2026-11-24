// Actions that more than one page needs: show the card, renew, report a void/refund, edit contact details, photo.
import { rpc } from './api.js';
import { h, modal, field, money, fmtDate, toast, METHOD, reasonModal } from './ui.js';
import { cardPair } from './card.js';
import { captureMemberPhoto, saveMemberPhoto, removeMemberPhoto } from './photo.js';

export async function openCard(ctx, memberId) {
  const data = await rpc('club_card', { p_member: memberId });
  const rules = { app_url: data.app_url, qr_as_url: data.qr_as_url };
  return modal({
    title: 'Membership card', submitLabel: 'Done',
    body: h('div', { class: 'space-y-3' }, cardPair(data.member, data.qr_token, rules),
      h('p', { class: 'hint' }, 'The QR holds only a secret code, never the name, phone or photo. A phone camera that scans it just opens the staff login. Physical and digital cards are the same membership.')),
    onSubmit: async () => true,
  });
}

export function paymentFields() {
  const method = h('select', { class: 'input', 'aria-label': 'Payment method' }, ...Object.entries(METHOD).map(([k, v]) => h('option', { value: k }, v)));
  const ref = h('input', { class: 'input', type: 'text', maxlength: 60, 'aria-label': 'Payment reference' });
  const refWrap = field('Payment reference number', ref, 'Needed for anything other than cash. The same reference cannot be used twice.');
  const sync = () => { refWrap.style.display = method.value === 'cash' ? 'none' : ''; };
  method.addEventListener('change', sync); sync();
  return { method, ref, node: h('div', { class: 'space-y-3' }, field('Payment method', method), refWrap) };
}

export const payNote = (rules) => (rules && rules.cash_auto_verify === false) ? 'Every payment waits for a manager to verify it.'
  : 'Cash is verified at the counter and activates at once. GCash, Maya, card and bank payments wait until a manager verifies them.';

export function renewMessage(r) {
  return r.activated ? 'Membership renewed.' : 'Payment recorded. The new period starts only after a manager verifies the payment.';
}

// The renewal form body, used in a dialog and on the Renewal page.
export function renewPanel(ctx, plan) {
  const branch = ctx.branchId();
  const pay = paymentFields();
  const line = (a, b) => h('div', { class: 'flex justify-between gap-3 py-1 border-b border-slate-100' }, h('span', { class: 'muted' }, a), h('span', { class: 'font-bold text-right' }, b));
  const first = plan.period_no === 1;
  const node = h('div', { class: 'space-y-3' },
    h('p', { class: 'font-bold' }, `${plan.name} (${plan.member_no})`),
    h('div', {}, line('Current expiry', plan.current_end ? fmtDate(plan.current_end) : 'No paid period yet'), line(first ? 'First membership period' : 'New membership period', `${fmtDate(plan.new_start)} to ${fmtDate(plan.new_end)}`),
      line('Days', `${plan.validity_days} calendar days`), line(first ? 'Membership fee' : 'Renewal fee', money(plan.fee))),
    plan.mode === 'after_expiry' ? h('p', { class: 'hint' }, 'The member keeps the rest of the current period. The new period starts the day after it ends. Nothing is overwritten and the same card keeps working.') : null,
    plan.mode === 'expired' ? h('p', { class: 'hint' }, first ? 'The period starts when the payment is verified.' : 'The membership already ended, so the new period starts when the payment is verified.') : null,
    plan.cuts_current ? h('p', { class: 'text-sm font-bold text-orange-800' }, 'Setting: renewal starts today. The days left in the current period will be cut short (recorded in the audit log).') : null,
    pay.node, h('p', { class: 'hint' }, payNote(ctx.me.rules)));
  return {
    node: h('div', {}, ...[node].filter(Boolean)),
    submit: async () => {
      if (!branch) throw new Error('Choose your branch at the top of the screen first.');
      return rpc('club_renew', { p_member: plan.member_id, p_branch: branch, p_method: pay.method.value, p_ref: pay.ref.value.trim() || null, p_expected_start: plan.new_start });
    },
  };
}

export async function openRenew(ctx, memberId) {
  if (!ctx.branchId()) { toast('Choose your branch at the top of the screen first.', 'warn'); return null; }
  const plan = await rpc('club_renew_preview', { p_member: memberId });
  const panel = renewPanel(ctx, plan);
  return modal({ title: plan.period_no === 1 ? 'Take the membership payment' : 'Renew membership', submitLabel: `Confirm ${money(plan.fee)}`, body: panel.node, onSubmit: async () => { const r = await panel.submit(); toast(renewMessage(r), r.activated ? 'ok' : 'warn'); return true; } });
}

export function openReversal(ctx, redemptionId, onDone) {
  const kind = h('select', { class: 'input', 'aria-label': 'What happened' }, h('option', { value: 'void' }, 'The whole order was voided'), h('option', { value: 'refund' }, 'The order was refunded after it was completed'));
  const reason = h('textarea', { class: 'input', rows: 3, required: true, placeholder: 'What happened?' });
  return modal({
    title: 'Order voided or refunded', submitLabel: 'Report to a manager',
    body: h('div', { class: 'space-y-3' }, field('What happened', kind), field('Reason', reason),
      h('p', { class: 'hint' }, 'This does not give the day back by itself. A manager reviews it (a void can be restored automatically only if the Super Admin turned that setting on).')),
    onSubmit: async () => {
      const r = await rpc('club_report_reversal', { p_id: redemptionId, p_kind: kind.value, p_reason: reason.value.trim() });
      toast(r.restored ? 'Reported and the day was given back.' : 'Reported for review.');
      if (onDone) onDone();
      return true;
    },
  });
}

export function openEditContact(ctx, m) {
  const name = h('input', { class: 'input', type: 'text', required: true, maxlength: 120, value: m.name });
  const mobile = h('input', { class: 'input', type: 'tel', required: true, inputmode: 'numeric', value: m.mobile });
  const email = h('input', { class: 'input', type: 'email', value: m.email || '' });
  const birthday = h('input', { class: 'input', type: 'date', value: m.birthday || '' });
  const reason = h('input', { class: 'input', type: 'text', required: true, placeholder: 'Why is this being changed?' });
  return modal({ title: 'Update contact details', submitLabel: 'Save changes',
    body: h('div', { class: 'space-y-3' }, field('Full name', name), field('Mobile number', mobile), field('Email', email), field('Birthday', birthday), field('Reason (kept in the audit log)', reason)),
    onSubmit: async () => { await rpc('club_member_update', { p_member: m.id, p_name: name.value, p_mobile: mobile.value, p_email: email.value || null, p_birthday: birthday.value || null, p_reason: reason.value }); toast('Saved.'); return true; } });
}

export async function takePhoto(ctx, m) {
  const blob = await captureMemberPhoto(m.name);
  if (!blob) return false;
  await saveMemberPhoto(m.id, blob);
  toast('Photo saved privately.');
  return true;
}

export async function dropPhoto(ctx, m) {
  const r = await reasonModal('Remove the photo', 'Reason (for example: the member withdrew consent)', 'Remove photo', true);
  if (!r) return false;
  await removeMemberPhoto(m.id, r.reason);
  toast('Photo removed.');
  return true;
}
