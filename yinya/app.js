import { Song, Synth } from '../synth/synth.ts';
import { SongRenderer } from '../editor/SongRenderer.ts';
import { TRACKS, PRESETS, GROUP_SIZE, blank, preset, validate, resize, rangeHasNotes, copyGroup, encode, decode, songJSON, wavBuffer } from './model.js';
import { PreviewPlayer } from './preview.js';
import { PlaybackFollower, playbackPosition } from './playback.js';

const $ = id => document.getElementById(id);
const KEYS = { draft: 'yinya.v2.draft', library: 'yinya.v2.library', preferences: 'yinya.v1.preferences' };
const LEGACY_KEYS = { draft: 'yinya.v1.draft', library: 'yinya.v1.library' };
const clone = value => JSON.parse(JSON.stringify(value));
const history = [], future = [];
let state = preset('sprout'), activeId = null, selectedTrack = 0, library = [], storageWarning = '', exporting = false;
let synth = new Synth(), lastStep = -1, consumedShare = false;
let exportJob = null;
let pendingConfirmation = null;
const preview = new PreviewPlayer();

function read(key) {
  try { const text = localStorage.getItem(key); return text === null ? undefined : JSON.parse(text); }
  catch { storageWarning = '无法读取本地存档，请使用备份文件保存作品。'; return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { $('save-state').textContent = '本地保存失败，请导出备份文件'; status('浏览器存储不可用或已满，作品仍在页面中，请先备份文件。'); return false; }
}
function status(message) { $('status').textContent = message; }
const savedLibrary = read(KEYS.library);
// Only fall back when the new key is absent, not when its data is unreadable.
const rawLibrary = savedLibrary === undefined ? read(LEGACY_KEYS.library) : savedLibrary;
let migratedDraft = false;
const preferences = read(KEYS.preferences);
let clickPreview = preferences?.clickPreview !== false;
const follower = new PlaybackFollower(preferences?.followPlayback !== false);
function parseLibrary(raw) {
  const items = [];
  if (Array.isArray(raw)) for (const item of raw.slice(0, 100)) {
    try {
      if (typeof item.id !== 'string' || typeof item.updated !== 'string' || !Number.isFinite(Date.parse(item.updated))) throw new Error();
      items.push({ id: item.id, updated: item.updated, state: validate(item.state) });
    } catch { storageWarning = '部分本地作品数据无法识别，其余作品已保留；请检查你的备份文件。'; }
  }
  return items;
}
library = parseLibrary(rawLibrary);
if (savedLibrary === undefined && Array.isArray(rawLibrary)) write(KEYS.library, library);
try {
  if (location.hash) { state = decode(location.hash); consumedShare = true; window.history.replaceState(null, '', location.pathname + location.search); storageWarning = '已载入分享作品。可以试听、改编，再保存成自己的版本。'; }
  else {
    const currentDraft = read(KEYS.draft), draft = currentDraft === undefined ? read(LEGACY_KEYS.draft) : currentDraft;
    if (draft) { state = validate(draft.state); activeId = library.some(i => i.id === draft.id) ? draft.id : null; }
    migratedDraft = currentDraft === undefined && Boolean(draft);
  }
} catch { storageWarning = '作品链接或草稿无法识别，已打开起步作品；原有存档仍可在「我的作品」中打开。'; }

function makeSong(snapshot = state) {
  const song = new Song(); song.fromJsonObject(songJSON(snapshot));
  snapshot.tracks.forEach((t, i) => { song.channels[i].muted = !t.enabled || t.volume === 0; });
  return song;
}
function syncAudio() {
  const head = synth.playhead;
  follower.setBarCount(state.barCount);
  synth.setSong(makeSong()); synth.playhead = Math.min(head, state.barCount - .0001);
  lastStep = -1;
}
function draftSave() {
  if (write(KEYS.draft, { id: activeId, state })) $('save-state').textContent = '草稿已保存在当前浏览器';
}
function snapshot() { return { state: clone(state), id: activeId }; }
function commit(next, message, id = activeId) {
  const clean = validate(next);
  preview.stop();
  history.push(snapshot()); if (history.length > 100) history.shift(); future.length = 0;
  state = clean; activeId = id;
  syncAudio(); draftSave(); render(); if (message) status(message);
}
function restore(source, target) {
  if (!source.length) return;
  preview.stop();
  target.push(snapshot()); const entry = source.pop(); state = entry.state; activeId = entry.id;
  syncAudio(); draftSave(); render(); status('已恢复上一步作品内容。');
}
function button(text, action, cls = '') {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls; b.addEventListener('click', action); return b;
}
function renderPresets() {
  $('presets').replaceChildren(...PRESETS.map(p => {
    const b = button('', () => { stop(); commit(preset(p.id), `已打开「${p.name}」。改动几格，让它成为你的作品；撤销可返回上一段。`, null); }, 'preset');
    b.setAttribute('aria-label', `从${p.name}开始`);
    const pattern = document.createElement('span'); pattern.className = 'pattern'; pattern.setAttribute('aria-hidden', 'true');
    for (const height of [12, 22, 16, 27, 19, 24]) { const i = document.createElement('i'); i.style.height = height + 'px'; pattern.append(i); }
    const label = document.createElement('span'), name = document.createElement('b'), detail = document.createElement('small');
    name.textContent = p.name; detail.textContent = p.detail; label.append(name, detail);
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); b.append(pattern, label, arrow); return b;
  }));
  const empty = button('从空白开始', () => { stop(); commit(blank('未命名的音乐'), '从空白开始：先点几格旋律，再加上鼓点。撤销可以回到之前的作品。', null); }, 'quiet');
  empty.id = 'new-blank'; $('presets').append(empty);
}
function renderTracks() {
  $('tracks').replaceChildren(...TRACKS.map((t, i) => {
    const b = button('', () => { preview.stop(); selectedTrack = i; renderTracks(); renderGrid(); renderControls(); syncPlayback(); }, 'track');
    b.setAttribute('aria-pressed', String(selectedTrack === i)); b.setAttribute('aria-label', `编辑${t.name}`);
    const text = document.createElement('span'), dot = document.createElement('span'); dot.className = 'dot' + (!state.tracks[i].enabled ? ' off' : '');
    text.append(dot, t.name); const small = document.createElement('small'); small.textContent = state.tracks[i].enabled ? '已加入' : '已关闭'; b.append(text, small); return b;
  }));
}
function renderControls() {
  const t = TRACKS[selectedTrack], layer = state.tracks[selectedTrack];
  $('title').value = state.title; $('tempo').value = state.tempo;
  $('bar-count').value = state.barCount;
  $('length-fill').disabled = state.barCount === 16;
  $('copy-group').disabled = state.barCount === GROUP_SIZE;
  $('copy-group').title = state.barCount === GROUP_SIZE ? '先扩展至 8 或 16 小节，再复制整段' : '将当前四小节的全部四声部复制到另一段';
  $('track-name').textContent = t.name; $('track-hint').textContent = t.hint;
  $('toggle-track').textContent = `这一层：${layer.enabled ? '开启' : '关闭'}`; $('toggle-track').setAttribute('aria-pressed', String(layer.enabled));
  $('volume').value = layer.volume; $('volume-value').textContent = layer.volume + '%';
  $('voice-label').hidden = selectedTrack !== 0; $('voice').value = state.voice || 'triangle';
  $('undo').disabled = history.length === 0; $('redo').disabled = future.length === 0;
  $('library-count').textContent = library.length;
  $('click-preview').checked = clickPreview;
  $('grid-tip').textContent = synth.playing ? '点亮或移除格子，直接改变循环；方向键可移动焦点。' : clickPreview ? '点亮即可试听，再点一次移除；方向键可移动焦点。' : '点击添加，再点一次移除；开启「点击试听」可听见单音。';
  $('play').textContent = synth.playing ? '暂停播放' : '播放循环'; $('play').setAttribute('aria-pressed', String(synth.playing));
}
function selectBar(bar) {
  preview.stop(); follower.select(bar, synth.playing); renderGrid(); syncPlayback();
  if (synth.playing) status(`正在查看第 ${bar + 1} 小节，音乐继续播放。按「回到播放位置」恢复跟随。`);
}
function renderBars(view = { ...playbackPosition(synth.playhead, state.barCount), playing: synth.playing }) {
  const group = Math.floor(follower.selectedBar / GROUP_SIZE), start = group * GROUP_SIZE;
  const groups = $('bar-groups'); groups.hidden = state.barCount === GROUP_SIZE;
  if (Number(groups.dataset.count) !== state.barCount) {
    groups.replaceChildren(...Array.from({ length: state.barCount / GROUP_SIZE }, (_, i) => {
      const b = button(`${i * GROUP_SIZE + 1}–${(i + 1) * GROUP_SIZE} 节`, () => selectBar(i * GROUP_SIZE));
      b.setAttribute('aria-label', `查看第 ${i * GROUP_SIZE + 1} 至 ${(i + 1) * GROUP_SIZE} 小节`); return b;
    }));
    groups.dataset.count = state.barCount;
  }
  groups.querySelectorAll('button').forEach((b, i) => {
    b.setAttribute('aria-pressed', String(i === group));
    b.classList.toggle('playing', view.playing && Math.floor(view.bar / GROUP_SIZE) === i);
  });
  if (!$('bars').children.length || Number($('bars').dataset.start) !== start) {
    $('bars').replaceChildren(...Array.from({ length: GROUP_SIZE }, (_, offset) => {
      const i = start + offset;
      const b = button(`第 ${i + 1} 节`, () => selectBar(i));
      b.dataset.bar = i; return b;
    }));
    $('bars').dataset.start = start;
  }
  $('bars').querySelectorAll('button').forEach(b => {
    const i = Number(b.dataset.bar);
    const playing = view.playing && i === view.bar;
    b.setAttribute('aria-pressed', String(i === follower.selectedBar));
    b.classList.toggle('playing', playing);
    if (playing) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.title = `${i === follower.selectedBar ? '当前编辑' : '查看'}第 ${i + 1} 小节${playing ? ' · 正在播放' : ''}`;
  });
  $('follow-playback').checked = follower.following;
  $('return-to-playback').hidden = !synth.playing || follower.following;
}
function editCell(row, col) {
  const next = clone(state), t = next.tracks[selectedTrack], bar = t.bars[follower.selectedBar];
  let added;
  if (t.id === 'drums') { bar[col] ^= (1 << (2 - row)); added = Boolean(bar[col] & (1 << (2 - row))); }
  else { const value = t.id === 'chords' ? row : 7 - row; bar[col] = bar[col] === value ? -1 : value; added = bar[col] !== -1; }
  commit(next);
  const cell = $('grid').querySelector(`[data-row="${row}"][data-col="${col}"]`); if (cell) cell.focus({ preventScroll: true });
  const track = TRACKS[selectedTrack], label = `${track.name} · ${track.rows[row]}`;
  if (synth.playing) { status(added ? `已添加${label}，将在循环中播放。` : `已移除${label}，循环已更新。`); return; }
  if (!added) { status(`已移除${label}。`); return; }
  if (!clickPreview || exporting) { status(`已添加${label}。${exporting ? '导出完成后可以试听。' : '点击试听已关闭。'}`); return; }
  if (!t.enabled || t.volume === 0) { status(`已添加${label}。${!t.enabled ? '这一层已关闭' : '这一层音量为零'}，暂不试听。`); return; }
  preview.play(state, selectedTrack, row).then(started => {
    if (started) status(`试听${label}。再点一次移除。`);
  }).catch(() => status(`已添加${label}，浏览器未能启动声音。可按「播放循环」重试。`));
}
function renderGrid() {
  const t = TRACKS[selectedTrack], bar = state.tracks[selectedTrack].bars[follower.selectedBar], cols = bar.length;
  const grid = $('grid'), focused = grid.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
  grid.replaceChildren(); grid.className = 'grid' + (t.id === 'chords' ? ' chords' : '');
  grid.setAttribute('aria-label', `${t.name}第${follower.selectedBar + 1}小节音符网格`);
  for (let row = 0; row < t.rows.length; row++) {
    const label = document.createElement('span'); label.className = 'row-label'; label.textContent = t.rows[row]; grid.append(label);
    for (let col = 0; col < cols; col++) {
      const b = button('', () => editCell(row, col), 'cell' + (col % 4 === 0 ? ' beat' : ''));
      b.dataset.row = row; b.dataset.col = col;
      const on = t.id === 'drums' ? Boolean(bar[col] & (1 << (2 - row))) : bar[col] === (t.id === 'chords' ? row : 7 - row);
      b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${t.rows[row]}，第${col + 1}${t.id === 'chords' ? '拍' : '步'}`);
      b.addEventListener('keydown', e => {
        const shift = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]; if (!shift) return;
        e.preventDefault(); const nr = Math.max(0, Math.min(t.rows.length - 1, row + shift[0])), nc = Math.max(0, Math.min(cols - 1, col + shift[1]));
        grid.querySelector(`[data-row="${nr}"][data-col="${nc}"]`).focus();
      }); grid.append(b);
    }
  }
  grid.append(document.createElement('span'));
  for (let col = 0; col < cols; col++) { const n = document.createElement('span'); n.className = 'beat-label'; n.dataset.col = col; n.textContent = t.id === 'chords' ? `${col + 1} 拍` : col % 4 === 0 ? `${col / 4 + 1} 拍` : '·'; grid.append(n); }
  if (focused?.row !== undefined && focused?.col !== undefined) grid.querySelector(`[data-row="${focused.row}"][data-col="${focused.col}"]`)?.focus({ preventScroll: true });
  lastStep = -1;
}
function render() { follower.update(synth.playhead, synth.playing); renderTracks(); renderControls(); renderBars(); renderGrid(); syncPlayback(); }
function stop() { preview.stop(); synth.pause(); follower.stop(); renderControls(); syncPlayback(); }
function syncPlayback() {
  const oldBar = follower.selectedBar, view = follower.update(synth.playhead, synth.playing);
  if (oldBar !== follower.selectedBar) renderGrid();
  renderBars(view);
  const active = view.playing && view.bar === follower.selectedBar;
  $('position').textContent = view.playing ? `播放 ${view.bar + 1} / ${state.barCount} 节 · ${view.beat + 1} 拍${active ? '' : ` · 查看第 ${follower.selectedBar + 1} 节`}` : `编辑第 ${follower.selectedBar + 1} 节 · 循环 ${state.barCount} 小节`;
  const col = selectedTrack === 1 ? view.beat : view.step;
  $('grid').querySelectorAll('.cell').forEach(cell => cell.classList.toggle('playing', active && Number(cell.dataset.col) === col));
  $('grid').querySelectorAll('.beat-label').forEach(label => label.classList.toggle('playing', active && Number(label.dataset.col) === (selectedTrack === 1 ? view.beat : view.beat * 4)));
  lastStep = view.playing ? view.absolute : -1;
}
function playbackFrame() {
  if (synth.playing && Math.floor(synth.playhead * 16) !== lastStep) syncPlayback();
  requestAnimationFrame(playbackFrame);
}
$('play').addEventListener('click', () => {
  if (synth.playing) { stop(); status('已暂停。可以继续修改格子。'); return; }
  preview.stop();
  try { follower.start(); synth.play(); renderControls(); syncPlayback(); status(follower.following ? `${state.barCount} 小节循环播放中，网格自动跟随。手动选择小节可暂停跟随。` : `${state.barCount} 小节循环播放中。点格子会直接改变音乐，也可开启「跟随播放」。`); }
  catch { synth.pause(); renderControls(); status('浏览器未能启动音频，请检查声音权限后再次按播放。'); }
});
function savePreferences(message) {
  try { localStorage.setItem(KEYS.preferences, JSON.stringify({ clickPreview, followPlayback: follower.enabled })); status(message); }
  catch { status(message + ' 这次设置未能保存到浏览器。'); }
}
$('click-preview').addEventListener('change', e => {
  clickPreview = e.target.checked; preview.stop(); renderControls();
  const message = clickPreview ? '点击试听已开启：暂停时点亮格子，就能听见这个音。' : '点击试听已关闭，可以安静编辑；播放循环仍可使用。';
  savePreferences(message);
});
$('follow-playback').addEventListener('change', e => {
  follower.setEnabled(e.target.checked); syncPlayback();
  savePreferences(follower.enabled ? '跟随播放已开启，播放时网格显示正在播放的小节。' : '跟随播放已关闭，可以留在当前小节编辑。');
});
$('return-to-playback').addEventListener('click', () => { follower.setEnabled(true); syncPlayback(); savePreferences('已回到播放位置，网格继续跟随。'); });
$('restart').addEventListener('click', () => { preview.stop(); synth.snapToStart(); synth.resetEffects(); syncPlayback(); status('已回到第一小节开头。'); });
$('title').addEventListener('input', e => {
  history.push(snapshot()); if (history.length > 100) history.shift(); future.length = 0;
  state.title = e.target.value.slice(0, 60); draftSave();
  $('undo').disabled = false; $('redo').disabled = true;
});
$('title').addEventListener('blur', () => { if (!state.title.trim()) { state.title = '未命名的音乐'; $('title').value = state.title; draftSave(); } });
$('tempo').addEventListener('input', e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 60 && n <= 180 && n !== state.tempo) { const next = clone(state); next.tempo = n; commit(next); } });
$('tempo').addEventListener('change', e => { const n = Number(e.target.value); if (!Number.isInteger(n) || n < 60 || n > 180) { e.target.value = state.tempo; status('速度请设为 60–180 之间的整数。'); return; } const next = clone(state); next.tempo = n; commit(next); });
$('volume').addEventListener('input', e => { const next = clone(state); next.tracks[selectedTrack].volume = Number(e.target.value); commit(next); });
$('voice').addEventListener('change', e => { const next = clone(state); next.voice = e.target.value; commit(next, '旋律音色已更新。'); });
$('toggle-track').addEventListener('click', () => { const next = clone(state), t = next.tracks[selectedTrack]; t.enabled = !t.enabled; commit(next, `${TRACKS[selectedTrack].name}${t.enabled ? '已加入' : '已关闭'}。音符内容仍然保留。`); });
$('undo').addEventListener('click', () => restore(history, future)); $('redo').addEventListener('click', () => restore(future, history));
function confirmChange(message, action, label) {
  pendingConfirmation = action;
  $('confirm-message').textContent = message; $('confirm-action').textContent = label;
  $('confirm-dialog').showModal();
}
$('cancel-change').addEventListener('click', () => { pendingConfirmation = null; $('confirm-dialog').close(); });
// A queued close event from the previous prompt must not clear a newly opened one.
$('confirm-dialog').addEventListener('close', () => { if (!$('confirm-dialog').open) pendingConfirmation = null; });
$('confirm-dialog').addEventListener('cancel', () => { pendingConfirmation = null; });
$('confirm-action').addEventListener('click', () => {
  const action = pendingConfirmation; pendingConfirmation = null;
  $('confirm-dialog').close(); action?.();
});
$('bar-count').addEventListener('change', e => {
  const count = Number(e.target.value), fill = $('length-fill').value;
  if (count === state.barCount) return;
  const apply = () => commit(resize(state, count, fill), `作品已调整为 ${count} 小节；撤销可恢复原长度和内容。`);
  if (count < state.barCount && rangeHasNotes(state, count, state.barCount)) {
    e.target.value = state.barCount;
    confirmChange(`缩短到 ${count} 小节会移除第 ${count + 1}–${state.barCount} 小节的内容。之后可以撤销恢复。`, apply, '确定缩短'); return;
  }
  apply();
});
$('copy-group').addEventListener('click', () => {
  const source = Math.floor(follower.selectedBar / GROUP_SIZE) * GROUP_SIZE;
  $('copy-source').textContent = `将第 ${source + 1}–${source + GROUP_SIZE} 小节的旋律、和弦、贝斯和鼓点一起复制。`;
  $('copy-destination').replaceChildren(...Array.from({ length: state.barCount / GROUP_SIZE }, (_, i) => i * GROUP_SIZE).filter(i => i !== source).map(i => {
    const option = document.createElement('option'); option.value = i; option.textContent = `第 ${i + 1}–${i + GROUP_SIZE} 小节`; return option;
  }));
  $('copy-destination').value = (source + GROUP_SIZE) % state.barCount;
  $('copy-dialog').dataset.source = source; $('copy-dialog').showModal();
});
$('close-copy').addEventListener('click', () => $('copy-dialog').close());
$('confirm-copy').addEventListener('click', () => {
  const source = Number($('copy-dialog').dataset.source), destination = Number($('copy-destination').value);
  $('copy-dialog').close();
  const apply = () => {
    const next = copyGroup(state, source, destination);
    follower.select(destination, synth.playing);
    commit(next, `已将第 ${source + 1}–${source + GROUP_SIZE} 小节复制到第 ${destination + 1}–${destination + GROUP_SIZE} 小节；撤销可恢复原内容。`);
  };
  if (rangeHasNotes(state, destination, destination + GROUP_SIZE)) confirmChange(`第 ${destination + 1}–${destination + GROUP_SIZE} 小节已有内容，将覆盖全部四个声部。之后可以撤销恢复。`, apply, '覆盖并复制');
  else apply();
});
$('copy-bar').addEventListener('click', () => { const next = clone(state), dest = (follower.selectedBar + 1) % state.barCount; next.tracks[selectedTrack].bars[dest] = [...next.tracks[selectedTrack].bars[follower.selectedBar]]; commit(next, `已复制到第 ${dest + 1} 小节；撤销可恢复原内容。`); follower.select(dest, synth.playing); renderGrid(); syncPlayback(); });
$('clear-bar').addEventListener('click', () => { const next = clone(state), t = next.tracks[selectedTrack]; t.bars[follower.selectedBar].fill(t.id === 'drums' ? 0 : -1); commit(next, '这一节已清空；撤销可以恢复。'); });

function renderLibrary() {
  const list = $('library-list'); list.replaceChildren();
  if (!library.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '还没有保存的作品。改好一段音乐，点击「保存作品」即可。'; list.append(p); }
  for (const item of [...library].sort((a, b) => b.updated.localeCompare(a.updated))) {
    const row = document.createElement('div'); row.className = 'library-item'; const label = document.createElement('div'), name = document.createElement('b'), detail = document.createElement('small');
    name.textContent = item.state.title; detail.textContent = `${item.state.barCount} 小节 · ${item.state.tempo} BPM · ${new Date(item.updated).toLocaleString('zh-CN')}`; label.append(name, detail);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('打开', () => { stop(); commit(item.state, `已打开「${item.state.title}」。再次保存会更新这份作品。`, item.id); $('library').close(); }), button('另存改编', () => { stop(); const next = clone(item.state); next.title = (next.title + ' · 改编').slice(0, 60); commit(next, '已创建改编草稿。保存时会新增作品，原作品保留。', null); $('library').close(); }));
    row.append(label, actions); list.append(row);
  }
}
$('save').addEventListener('click', () => {
  library = parseLibrary(read(KEYS.library));
  if (!activeId && library.length >= 100) { status('已保存 100 个作品。请先用备份文件保留新作品。'); return; }
  const id = activeId || crypto.randomUUID(), next = library.filter(i => i.id !== id);
  next.push({ id, state: clone(state), updated: new Date().toISOString() });
  if (!write(KEYS.library, next)) return;
  library = next; activeId = id; draftSave(); renderControls(); $('save-state').textContent = '作品已保存 · 后续修改会自动保存为草稿'; status(`「${state.title}」已保存到我的作品。`);
});
$('open-library').addEventListener('click', () => { renderLibrary(); $('library').showModal(); }); $('close-library').addEventListener('click', () => $('library').close());
$('share').addEventListener('click', () => {
  const url = new URL(location.href); url.hash = encode(state); $('share-link').value = url.href;
  $('local-share-note').textContent = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? '当前是本机预览地址：链接可在这台电脑验证。部署到公开网址后，朋友才能直接打开。' : '链接包含当前作品的快照；后续修改不会改变已经发出的链接。';
  $('copy-status').textContent = ''; $('share-dialog').showModal();
});
$('close-share').addEventListener('click', () => $('share-dialog').close());
$('copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('share-link').value); $('copy-status').textContent = '作品链接已复制。'; } catch { $('share-link').focus(); $('share-link').select(); $('copy-status').textContent = '请按 Ctrl+C 或长按选择复制链接。'; } });
window.addEventListener('hashchange', () => { if (!location.hash) return; try { const next = decode(location.hash); stop(); commit(next, '已载入分享作品，保存时会创建自己的版本。', null); window.history.replaceState(null, '', location.pathname + location.search); } catch { status('无法读取这个作品链接，当前作品已保留。'); } });
window.addEventListener('storage', e => { if (e.key === KEYS.library) { library = parseLibrary(read(KEYS.library)); renderControls(); if ($('library').open) renderLibrary(); } });
function download(blob, suffix) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = (state.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '音芽作品') + suffix; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('backup').addEventListener('click', () => { download(new Blob([JSON.stringify(validate(state), null, 2)], { type: 'application/json' }), '.yinya.json'); status('作品备份文件已生成，可在另一台设备导入。'); });
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (file.size > 20000) throw new Error(); const next = validate(JSON.parse(await file.text())); stop(); commit(next, '作品已导入为新草稿。保存会新增作品。', null); }
  catch { status('导入失败：请选择有效的音芽作品 JSON 文件（20 KB 以内）。当前作品已保留。'); }
  finally { e.target.value = ''; }
});
function encodeInWorker(left, right, job) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./assets/mp3-worker.js', document.baseURI), { type: 'module' });
    job.worker = worker; job.reject = reject;
    worker.onmessage = event => {
      if (typeof event.data.progress === 'number') status(`正在压缩 MP3：${Math.round(event.data.progress * 100)}%`);
      if (event.data.error) { worker.terminate(); reject(new Error(event.data.error)); }
      if (event.data.data) { worker.terminate(); resolve(event.data.data); }
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('MP3 编码器无法载入')); };
    worker.postMessage({ left, right }, [left.buffer, right.buffer]);
  });
}
async function exportAudio(format) {
  if (exporting) return; exporting = true; const snapshot = clone(state), renderer = new SongRenderer();
  const job = { canceled: false, renderer, worker: null, reject: null }; exportJob = job;
  $('export').disabled = true; $('export-mp3').disabled = true; $('cancel-export').hidden = false; stop();
  try {
    for await (const progress of renderer.generate(makeSong(snapshot), 44100, false, false, 1)) status(`正在合成 ${format.toUpperCase()} 的完整 ${snapshot.barCount} 小节：${Math.round(progress * 100)}%`);
    if (job.canceled) throw new DOMException('已取消', 'AbortError');
    const audio = format === 'mp3' ? await encodeInWorker(renderer.outputSamplesL, renderer.outputSamplesR, job) : wavBuffer(renderer.outputSamplesL, renderer.outputSamplesR, 44100);
    if (job.canceled) throw new DOMException('已取消', 'AbortError');
    // The rendered song is a snapshot; keep its name even if editing during export.
    const url = URL.createObjectURL(new Blob([audio], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' }));
    const a = $('export-link');
    if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
    a.href = url; a.dataset.url = url; a.download = (snapshot.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '音芽作品') + '.' + format; a.textContent = `下载 ${format.toUpperCase()}`; a.hidden = false;
    status(`${format.toUpperCase()} 已生成：完整 ${snapshot.barCount} 小节${format === 'mp3' ? ' · 192 kbps 立体声' : ''}。点击「下载 ${format.toUpperCase()}」保存文件。`);
  } catch (error) { status(job.canceled || error?.name === 'AbortError' ? '已取消音频导出，作品内容保留。' : `${format.toUpperCase()} 导出失败，作品内容保留。${format === 'mp3' ? '可以尝试 WAV 导出或备份作品文件。' : '可以先备份作品文件。'}`); }
  finally { job.worker?.terminate(); exportJob = null; exporting = false; $('export').disabled = false; $('export-mp3').disabled = false; $('cancel-export').hidden = true; }
}
$('export').addEventListener('click', () => exportAudio('wav'));
$('export-mp3').addEventListener('click', () => exportAudio('mp3'));
$('cancel-export').addEventListener('click', () => {
  if (!exportJob) return;
  exportJob.canceled = true; exportJob.renderer.canceled = true; exportJob.worker?.terminate(); exportJob.reject?.(new DOMException('已取消', 'AbortError'));
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { preview.dispose(); if (synth.playing) { stop(); status('切到后台后已暂停，回来按播放即可继续。'); } } });
window.addEventListener('pagehide', () => preview.dispose());
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
});
renderPresets(); syncAudio(); render(); if (consumedShare || migratedDraft) draftSave();
status(clickPreview ? `点亮一个格子试听，或按「播放循环」听完整 ${state.barCount} 小节。` : `点击试听已关闭；可以安静编辑，或按「播放循环」听完整 ${state.barCount} 小节。`);
if (storageWarning) status(storageWarning); requestAnimationFrame(playbackFrame);
