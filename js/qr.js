// QR drawing (no network call, no data leaves the page) and QR scanning with the camera.
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
import jsQR from 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
import { h, toast } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return { n: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

// Returns an <svg> element for the text. Built from the module matrix with DOM calls, never innerHTML.
export function qrSvg(text, px) {
  const { n, dark } = qrMatrix(text), quiet = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + quiet * 2} ${n + quiet * 2}`);
  if (px) { svg.setAttribute('width', px); svg.setAttribute('height', px); }
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}

// The text inside the QR. The secret code alone is enough; with an app link, a phone camera opens the staff app straight to the member.
export function qrPayload(token, rules) {
  const base = (rules && rules.app_url) || (location.origin + location.pathname);
  return rules && rules.qr_as_url === false ? token : base.replace(/#.*$/, '') + '#/v/' + token;
}
export const groupCode = (t) => String(t || '').replace(/(.{4})/g, '$1 ').trim();

// Pulls the secret code out of whatever was scanned (a link or the bare code).
export function tokenFromScan(text) {
  const m = String(text || '').match(/([0-9a-fA-F]{16})\s*$/);
  return m ? m[1].toLowerCase() : String(text || '').trim();
}

// Camera scanner in a dialog. onCode(text) is called once with whatever the QR holds. Needs HTTPS (or localhost) and camera permission.
export function openScanner(onCode) {
  const video = h('video', { class: 'w-full rounded-lg bg-black', playsinline: 'true', muted: 'true', 'aria-label': 'Camera view' });
  const note = h('p', { class: 'text-sm muted', role: 'status' }, 'Point the camera at the member\'s QR code.');
  let stream = null, stopped = false, timer = null;
  const stop = () => { stopped = true; clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') stop(); };
  const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scan QR code' },
    h('div', { class: 'modal space-y-3' }, h('h2', { class: 'font-extrabold text-lg' }, 'Scan the member QR'), video, note,
      h('div', { class: 'flex justify-end' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: stop }, 'Close'))));
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { note.textContent = 'This browser cannot open the camera here. Type the membership ID or mobile number instead.'; return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then((s) => {
    if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s; video.srcObject = s; video.play().catch(() => {});
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const found = (text) => { if (stopped || !text) return; stop(); onCode(String(text)); };
    timer = setInterval(async () => {
      if (stopped || video.readyState < 2) return;
      try {
        if (detector) { const codes = await detector.detect(video); if (codes.length) return found(codes[0].rawValue); }
        const w = video.videoWidth, hh = video.videoHeight; if (!w) return;
        canvas.width = w; canvas.height = hh; ctx.drawImage(video, 0, 0, w, hh);
        const img = ctx.getImageData(0, 0, w, hh);
        const code = jsQR(img.data, w, hh, { inversionAttempts: 'dontInvert' });
        if (code) found(code.data);
      } catch (_) { /* keep trying */ }
    }, 200);
  }).catch(() => { note.textContent = 'The camera is not available or permission was refused. Type the membership ID or mobile number instead.'; toast('Camera not available.', 'warn'); });
}
