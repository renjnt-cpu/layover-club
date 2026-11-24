// QR Scanner page: opens the camera at once, and sends the scanned code to the verification screen.
import { h } from '../ui.js';
import { openScanner, tokenFromScan } from '../qr.js';

export async function render(ctx) {
  const open = () => openScanner((text) => { ctx.go('#/v/' + tokenFromScan(text)); });
  const manual = h('input', { class: 'input', type: 'text', autocomplete: 'off', 'aria-label': 'Membership ID, mobile number or name', placeholder: 'Or type membership ID, mobile or name', style: 'font-size:1.1rem;min-height:3.4rem' });
  const root = h('div', { class: 'space-y-4' }, h('h1', { class: 'text-2xl font-extrabold' }, 'Scan membership'),
    h('p', { class: 'muted' }, 'Ask the member to show their card (printed or on their phone) and scan the QR on the back.'),
    h('button', { class: 'btn btn-primary btn-lg w-full', type: 'button', onclick: open }, 'Open camera'),
    h('form', { class: 'card space-y-2', onsubmit: (e) => { e.preventDefault(); if (manual.value.trim()) ctx.go('#/v/' + encodeURIComponent(manual.value.trim())); } },
      h('div', { class: 'label' }, 'QR will not scan?'), manual, h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Verify')));
  setTimeout(open, 250);
  return root;
}
