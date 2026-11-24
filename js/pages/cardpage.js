// Digital Membership Card page: front and back, downloadable as images, printable at 85.6 x 54 mm.
import { rpc } from '../api.js';
import { h } from '../ui.js';
import { cardPair, stateBanner } from '../card.js';

export async function render(ctx) {
  const d = await rpc('club_card', { p_member: ctx.param });
  const m = d.member;
  return h('div', { class: 'space-y-4' }, h('a', { href: ctx.can('member.list') ? '#/members/' + m.id : '#/', class: 'underline text-sm no-print' }, '← Back'),
    h('h1', { class: 'text-2xl font-extrabold no-print' }, 'Digital membership card'), h('div', { class: 'no-print' }, stateBanner(m)),
    cardPair(m, d.qr_token, { app_url: d.app_url, qr_as_url: d.qr_as_url }),
    h('div', { class: 'card text-sm space-y-1 no-print' }, h('div', { class: 'font-bold' }, 'About this card'),
      h('p', {}, 'The QR holds only a secret code. It never contains the name, phone number, photo or payment details, and scanning it with a phone camera only opens the staff login.'),
      h('p', {}, 'The same card keeps working after every renewal. If it is lost, shared or compromised, replace the QR from the member profile and the old QR stops working at once.')));
}
