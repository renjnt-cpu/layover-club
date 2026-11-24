// Member photos. Optional, taken by staff WITH the member's consent, stored in a PRIVATE bucket, shown through short-lived signed links,
// and only ever compared with the person at the counter by a human. There is no face matching of any kind.
import { sb, rpc } from './api.js';
import { h, modal, toast } from './ui.js';

const BUCKET = 'club-photos';

// Shrinks a picture to at most 480 px and makes a small JPEG (the bucket accepts only JPEG up to 600 KB).
export function toJpeg(source, max = 480, quality = 0.72) {
  const w0 = source.videoWidth || source.naturalWidth || source.width, h0 = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', quality));
}

// Opens the camera (or a file picker where there is no camera). Returns a JPEG Blob only after the consent box is ticked, otherwise null.
export function captureMemberPhoto(memberName) {
  let stream = null, blob = null;
  const video = h('video', { class: 'w-full rounded-lg bg-black', playsinline: 'true', muted: 'true', 'aria-label': 'Camera view' });
  const preview = h('img', { class: 'w-full rounded-lg', alt: 'Photo preview', style: 'display:none' });
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'input', 'aria-label': 'Choose a photo' });
  const consent = h('input', { type: 'checkbox', style: 'width:1.6rem;height:1.6rem;flex:none' });
  const snap = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Take photo');
  const note = h('p', { class: 'hint' }, 'Ask the member to look at the camera. This photo is only for staff to check the person at the counter.');
  const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const show = (b) => { blob = b; preview.src = URL.createObjectURL(b); preview.style.display = ''; video.style.display = 'none'; };
  snap.onclick = async () => { try { show(await toJpeg(video)); stop(); snap.textContent = 'Retake'; snap.onclick = retake; } catch (e) { toast(e.message, 'err'); } };
  const retake = async () => { blob = null; preview.style.display = 'none'; video.style.display = ''; snap.textContent = 'Take photo'; snap.onclick = snapNow; await start(); };
  const snapNow = snap.onclick;
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const img = await createImageBitmap(f); show(await toJpeg(img)); } catch (e) { toast('That picture could not be read.', 'err'); } };
  const start = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { video.style.display = 'none'; snap.style.display = 'none'; note.textContent = 'This browser cannot open the camera here. Choose a picture instead.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); video.srcObject = stream; await video.play(); }
    catch (_) { video.style.display = 'none'; snap.style.display = 'none'; note.textContent = 'The camera is not available or permission was refused. Choose a picture instead.'; }
  };
  const body = h('div', { class: 'space-y-3' }, h('p', { class: 'font-bold' }, memberName ? `Photo for ${memberName}` : 'Member photo'), video, preview, snap, field2('Or choose a picture', file), note,
    h('label', { class: 'flex items-start gap-3 font-semibold text-sm' }, consent,
      h('span', {}, 'The member has been told how the photo is used (to check their identity at the counter), that it is stored privately, that we do not use facial recognition, and agrees to the photo being taken.')));
  function field2(l, i) { return h('label', { class: 'block' }, h('span', { class: 'label' }, l), i); }
  start();
  return modal({ title: 'Member photo', submitLabel: 'Use this photo', body, onSubmit: async () => {
    if (!blob) throw new Error('Take or choose a photo first.');
    if (!consent.checked) throw new Error('The member must agree to the photo first.');
    stop(); return { blob };
  } }).then((r) => { stop(); return r && r.blob ? r.blob : null; });
}

export async function saveMemberPhoto(memberId, blob) {
  const path = `${memberId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('The photo could not be saved: ' + error.message);
  return rpc('club_member_set_photo', { p_member: memberId, p_path: path, p_consent: true });
}

export async function removeMemberPhoto(memberId, reason) {
  const r = await rpc('club_member_clear_photo', { p_member: memberId, p_reason: reason });
  if (r.old_path) await sb.storage.from(BUCKET).remove([r.old_path]);
  return r;
}

export async function photoUrl(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
  return error || !data ? null : data.signedUrl;
}

// A picture box that loads the signed link by itself. Shows "No photo on file" when there is none.
export function photoBox(path) {
  const box = h('div', { class: 'photo photo-empty', role: 'img', 'aria-label': path ? 'Member photo' : 'No photo on file' }, path ? 'Loading photo…' : 'No photo on file. Check an ID instead.');
  if (path) photoUrl(path).then((url) => {
    if (!url) { box.textContent = 'Photo unavailable'; return; }
    const img = h('img', { class: 'photo', src: url, alt: 'Registered member photo (compare with the person at the counter)' });
    box.replaceWith(img);
  });
  return box;
}
