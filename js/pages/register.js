// Register a new member at the counter: details, the privacy notice and the terms (verbatim) with "I Agree", payment, optional photo, then the card.
// A membership activates only when its payment is verified: cash is verified at the counter, other payments wait for a manager.
import { rpc } from '../api.js';
import { h, toast, busy, money, field, METHOD, fmtDate, manilaToday, addDays } from '../ui.js';
import { cardPair } from '../card.js';
import { payNote, takePhoto } from '../actions.js';

export async function render(ctx) {
  const rules = ctx.me.rules;
  const root = h('div', { class: 'space-y-4' });
  const name = h('input', { class: 'input', type: 'text', required: true, maxlength: 120, autocomplete: 'off', 'aria-label': 'Full name' });
  const mobile = h('input', { class: 'input', type: 'tel', required: true, inputmode: 'numeric', placeholder: '09XX XXX XXXX', autocomplete: 'off', 'aria-label': 'Mobile number' });
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'off', placeholder: 'Optional', 'aria-label': 'Email' });
  const birthday = h('input', { class: 'input', type: 'date', 'aria-label': 'Birthday', max: manilaToday() });
  const method = h('select', { class: 'input', 'aria-label': 'Payment method' }, ...Object.entries(METHOD).map(([k, v]) => h('option', { value: k }, v)));
  const ref = h('input', { class: 'input', type: 'text', maxlength: 60, 'aria-label': 'Payment reference' });
  const refWrap = field('Payment reference number', ref, 'Needed for anything other than cash. The same reference cannot be used twice.');
  const syncRef = () => { refWrap.style.display = method.value === 'cash' ? 'none' : ''; }; method.addEventListener('change', syncRef); syncRef();
  const fee = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', value: String(rules.fee), 'aria-label': 'Membership fee' });
  const canFee = ctx.can('fee.override');
  if (!canFee) fee.setAttribute('readonly', 'true');
  const start = h('input', { class: 'input', type: 'date', value: rules.today || manilaToday(), min: rules.today || manilaToday(), max: addDays(rules.today || manilaToday(), 60), 'aria-label': 'Start date' });
  const agree = h('input', { type: 'checkbox', id: 'agree', style: 'width:1.6rem;height:1.6rem;flex:none', required: true });
  const privacy = h('input', { type: 'checkbox', id: 'privacy', style: 'width:1.6rem;height:1.6rem;flex:none', required: true });
  const err = h('p', { class: 'text-sm text-red-700 font-semibold', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, `Register and record ${money(rules.fee)} payment`);

  const terms = h('div', { class: 'border-2 border-slate-300 rounded-lg p-3 bg-slate-50 text-sm max-h-56 overflow-y-auto', tabindex: '0', role: 'region', 'aria-label': 'Layover Club membership terms' },
    h('div', { class: 'font-extrabold mb-1' }, 'LAYOVER CLUB MEMBERSHIP TERMS'),
    h('ol', { class: 'list-decimal pl-5 space-y-1' }, ...ctx.me.terms.clauses.map((c) => h('li', {}, c))));
  const privacyBox = h('div', { class: 'border-2 border-slate-300 rounded-lg p-3 bg-slate-50 text-sm max-h-48 overflow-y-auto', tabindex: '0', role: 'region', 'aria-label': 'Privacy notice' }, ctx.me.privacy_notice);

  const form = h('form', { class: 'card space-y-4', onsubmit: (e) => {
    e.preventDefault(); err.textContent = '';
    if (!ctx.branchId()) { err.textContent = 'Choose your branch at the top of the screen first.'; return; }
    busy(submit, async () => {
      try {
        const r = await rpc('club_register', {
          p_name: name.value, p_mobile: mobile.value, p_email: email.value || null, p_birthday: birthday.value || null, p_branch: ctx.branchId(),
          p_method: method.value, p_ref: ref.value || null, p_terms_accepted: agree.checked, p_privacy_ack: privacy.checked, p_fee: canFee ? Number(fee.value) : null, p_start: start.value || null,
        });
        showResult(r);
      } catch (ex) { err.textContent = ex.message; }
    });
  } },
    h('h2', { class: 'font-extrabold text-lg' }, 'Member details'),
    h('div', { class: 'grid gap-3 sm:grid-cols-2' }, field('Full name', name), field('Mobile number', mobile), field('Email (optional)', email), field('Birthday (optional)', birthday)),
    h('h2', { class: 'font-extrabold text-lg' }, 'Payment'),
    h('div', { class: 'grid gap-3 sm:grid-cols-2' },
      field('Membership fee (₱)', fee, canFee ? 'You can change the fee as a Super Admin.' : `Fixed at ${money(rules.fee)} for ${rules.validity_days} days.`),
      field('Starts on', start, `Valid for ${rules.validity_days} calendar days from the day it is activated (not earlier than this date).`),
      field('Payment method', method), refWrap),
    h('p', { class: 'hint' }, payNote(rules)),
    h('h2', { class: 'font-extrabold text-lg' }, 'Privacy notice'), privacyBox,
    h('label', { class: 'flex items-center gap-3 font-bold', for: 'privacy' }, privacy, 'The member has been shown the privacy notice'),
    h('h2', { class: 'font-extrabold text-lg' }, 'Membership terms'), terms,
    h('label', { class: 'flex items-center gap-3 font-bold', for: 'agree' }, agree, 'The member says: I Agree to the Membership Terms'),
    h('p', { class: 'hint' }, 'A member photo is optional and is taken after registration, only with the member\'s consent.'),
    err, submit);

  function showResult(r) {
    const m = r.member;
    const pending = !r.activated;
    const photoBtn = ctx.can('member.photo') ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { if (await takePhoto(ctx, m)) { b.textContent = 'Photo saved'; } else b.disabled = false; } catch (ex) { toast(ex.message, 'err'); b.disabled = false; } } }, 'Take member photo (optional)') : null;
    root.replaceChildren(...[
      h('h1', { class: 'text-2xl font-extrabold' }, pending ? 'Registered: payment waiting' : 'Membership created'),
      pending
        ? h('div', { class: 'state st-pending', role: 'status' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '◷'),
            h('div', {}, h('div', { class: 'big' }, `${m.name} (${m.member_no}) is registered, NOT ACTIVE YET`), h('div', { class: 'sub' }, 'The membership starts and the card is issued only after a manager verifies the payment. Nothing can be redeemed until then.')))
        : h('div', { class: 'state st-available', role: 'status' }, h('div', { class: 'icon', 'aria-hidden': 'true' }, '✔'),
            h('div', {}, h('div', { class: 'big' }, `${m.name} is now a Layover Club member`), h('div', { class: 'sub' }, `${m.member_no} · valid ${fmtDate(m.period.start)} to ${fmtDate(m.period.end)} · ${m.days_total} days`))),
      pending ? cardPair(m, null, rules) : cardPair(m, r.qr_token, rules),
      pending ? null : h('p', { class: 'hint max-w-md' }, 'Give the member their card: print it, or download the PNG and send it. The same card keeps working after renewals. The QR holds only a secret code.'),
      h('div', { class: 'flex gap-2 flex-wrap' }, photoBtn,
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.refresh() }, 'Register another member'),
        pending && ctx.can('payment.view') ? h('a', { class: 'btn btn-primary', href: '#/payments' }, 'Go to payments') : null,
        h('a', { class: 'btn btn-secondary', href: '#/' }, 'Back to home'))].filter(Boolean));
  }

  root.append(h('h1', { class: 'text-2xl font-extrabold' }, 'Register a member'),
    h('p', { class: 'muted' }, `Layover Club · ${money(rules.fee)} · ${rules.validity_days} days · ${rules.discount_pct}% off one eligible item a day. Collect the payment first.`), form);
  return root;
}
