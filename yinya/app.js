import { Synth } from '../synth/synth.ts';
import { AudioRenderer } from './render.js';
import { audioSong } from './song.js';
import { VOICES, voiceInfo, CHORD_VOICES, chordVoiceInfo, BASS_VOICES, bassVoiceInfo } from './voices.js';
import { TRACKS, PRESETS, GROUP_SIZE, BAR_COUNTS, NOTE_LENGTHS, MAX_BACKUP_BYTES, parseBackup, LONG_NOTE_TRACKS, CHORD_STYLES, chordStyleInfo, VELOCITIES, sectionChordStyle, setSectionChordStyle, setNoteVelocity, applyDrumPattern, setScale, setTranspose, shiftOctave, applyProgression, renameSection, setSectionTrack, insertSection, moveSection, deleteSection, trackAudibleAt, hasAudibleNotes, blank, preset, validate, resize, rangeHasNotes, copyGroup, copyBar, clearBar, pitchedNoteAt, setPitchedNote, removePitchedNote, encode, decode, songJSON, wavBuffer } from './model.js';
import { PITCH_VALUES, SCALES, PROGRESSIONS, scaleInfo, inScale, keyName, pitchName, chordName, pitchRows, chordRows } from './theory.js';
import { BASS_PATTERNS, ACCOMPANIMENT_STYLES, bassPatternInfo, accompanimentStyleInfo, generateAccompaniment, harmonicRuns } from './accompaniment.js';
import { MELODY_STYLES, MELODY_DENSITIES, melodyStyleInfo, melodyTarget, melodyHarmonyInfo, generateMelody } from './melody.js';
import { DRUM_PATTERNS } from './grooves.js';
import { PreviewPlayer } from './preview.js';
import { PlaybackFollower, playbackPosition, playbackRange, configurePlayback } from './playback.js';
import { sectionVoice, sectionGain, setSectionVoice, setSectionVolume, resetSectionOrchestration } from './model.js';
import { PhraseEditor } from './phrase-editor.js';
import { DynamicEditor } from './dynamic-editor.js';
import { dynamicLabel } from './dynamics.js';
import {DRUM_KITS,drumKitInfo,drumLevel} from './drum-kits.js';
import {sectionDrumKit,setSectionDrumKit,setDrumHit} from './model.js';
import {DrumEditor} from './drum-editor.js';
import {DrumWorkshop} from './drum-workshop.js';

const $ = id => document.getElementById(id);
const KEYS = { draft: 'yinya.v14.draft', library: 'yinya.v14.library', preferences: 'yinya.v1.preferences' };
const LEGACY_KEYS = [{draft:"yinya.v13.draft",library:"yinya.v13.library"}, {draft:"yinya.v12.draft",library:"yinya.v12.library"}, {draft:"yinya.v11.draft",library:"yinya.v11.library"}, {draft:"yinya.v10.draft",library:"yinya.v10.library"}, {draft:'yinya.v9.draft',library:'yinya.v9.library'}, { draft:'yinya.v8.draft',library:'yinya.v8.library' }, { draft: 'yinya.v7.draft', library: 'yinya.v7.library' }, { draft: 'yinya.v6.draft', library: 'yinya.v6.library' }, { draft: 'yinya.v5.draft', library: 'yinya.v5.library' }, { draft: 'yinya.v4.draft', library: 'yinya.v4.library' }, { draft: 'yinya.v3.draft', library: 'yinya.v3.library' }, { draft: 'yinya.v2.draft', library: 'yinya.v2.library' }, { draft: 'yinya.v1.draft', library: 'yinya.v1.library' }];
const clone = value => JSON.parse(JSON.stringify(value));
const history = [], future = [];
let state = preset('sprout'), activeId = null, selectedTrack = 0, library = [], storageWarning = '', exporting = false;
let synth = new Synth(), lastStep = -1, consumedShare = false;
let exportJob = null;
let pendingConfirmation = null;
let workshopSession = null, workshopPreview = null;
let melodySession = null, melodyPreview = null;
let selectedNote = null;
let phraseEditor = null, drumEditor = null, editorView = 'bar', newDrumVelocity=1;
function isDrumView(){return editorView==='phrase'&&selectedTrack===3;}
function isWideView(){return isPhraseView()||isDrumView();}
function isPhraseView(){return editorView==='phrase'&&LONG_NOTE_TRACKS.includes(selectedTrack);}
const newNoteLengths = { 0: 1, 2: 1 };
const newNoteVelocities = { 0: 1, 2: 1 };
let pitchRange = 'all', pitchNaming = 'solfege', chordPalette = 'recommended';
function gridRows() { return selectedTrack === 3 ? TRACKS[3].rows.map((label,id)=>({id,label})) : selectedTrack === 1 ? chordRows(state,follower.selectedBar,chordPalette==='all') : pitchRows(state,selectedTrack,follower.selectedBar,pitchRange,pitchNaming); }
let phraseActive = false, transportRange = null, wasPlaying = false;
let orchestrationActive = false;
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
function readLegacy(kind) {
  for (const keys of LEGACY_KEYS) { const value = read(keys[kind]); if (value !== undefined) return value; }
}
const rawLibrary = savedLibrary === undefined ? readLegacy('library') : savedLibrary;
let migratedDraft = false;
const preferences = read(KEYS.preferences);
editorView = preferences?.editorView==='phrase'?'phrase':'bar';
pitchRange = ['all','low','high'].includes(preferences?.pitchRange) ? preferences.pitchRange : 'all';
pitchNaming = preferences?.pitchNaming === 'notes' ? 'notes' : 'solfege';
let clickPreview = preferences?.clickPreview !== false;
let exportEnding = preferences?.exportEnding === 'loop' ? 'loop' : 'natural';
let phraseMode = preferences?.phraseMode === 'duet' ? 'duet' : 'melody';
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
    const currentDraft = read(KEYS.draft), draft = currentDraft === undefined ? readLegacy('draft') : currentDraft;
    if (draft) { state = validate(draft.state); activeId = library.some(i => i.id === draft.id) ? draft.id : null; }
    migratedDraft = currentDraft === undefined && Boolean(draft);
  }
} catch { storageWarning = '作品链接或草稿无法识别，已打开起步作品；原有存档仍可在「我的作品」中打开。'; }

function makeSong(snapshot = state) {
  const song = audioSong(songJSON(snapshot));
  snapshot.tracks.forEach((t, i) => { song.channels[i].muted = !t.enabled || t.volume === 0; });
  return song;
}
function syncAudio() {
  const head = synth.playhead;
  follower.setBarCount(state.barCount);
  synth.setSong(makeSong()); configurePlayback(synth, transportRange || playbackRange(state));
  synth.playhead = transportRange?.mode === 'section' && (head < transportRange.start || head >= transportRange.end) ? transportRange.start : Math.min(head, state.barCount - .0001);
  lastStep = -1;
}
function draftSave() {
  if (write(KEYS.draft, { id: activeId, state })) $('save-state').textContent = '草稿已保存在当前浏览器';
}
function snapshot() { return { state: clone(state), id: activeId, bar: follower.selectedBar }; }
function commit(next, message, id = activeId) {
  const clean = validate(next);
  if (workshopSession) closeWorkshop();
  if (melodySession) closeMelodyWorkshop();
  preview.stop();
  history.push(snapshot()); if (history.length > 100) history.shift(); future.length = 0;
  state = clean; activeId = id;
  syncAudio(); draftSave(); render(); if (message) status(message);
}
function restore(source, target) {
  if (!source.length) return;
  stop();
  target.push(snapshot()); const entry = source.pop(); state = entry.state; activeId = entry.id;
  follower.setBarCount(state.barCount); follower.select(Math.min(entry.bar ?? 0, state.barCount - 1));
  syncAudio(); draftSave(); render(); status('已恢复上一步作品内容。');
}
function button(text, action, cls = '') {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls; b.addEventListener('click', action); return b;
}
function renderPresets() {
  $('presets').replaceChildren(...PRESETS.map(p => {
    const b = button('', () => { stop(); selectedNote = null; commit(preset(p.id), `已打开「${p.name}」。改动几格，让它成为你的作品；撤销可返回上一段。`, null); }, 'preset');
    b.setAttribute('aria-label', `从${p.name}开始`);
    const pattern = document.createElement('span'); pattern.className = 'pattern'; pattern.setAttribute('aria-hidden', 'true');
    for (const height of [12, 22, 16, 27, 19, 24]) { const i = document.createElement('i'); i.style.height = height + 'px'; pattern.append(i); }
    const label = document.createElement('span'), name = document.createElement('b'), detail = document.createElement('small');
    name.textContent = p.name; detail.textContent = p.detail; label.append(name, detail);
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); b.append(pattern, label, arrow); return b;
  }));
  const empty = button('从空白开始', () => { stop(); selectedNote = null; commit(blank('未命名的音乐'), '从空白开始：先点几格旋律，再加上鼓点。撤销可以回到之前的作品。', null); }, 'quiet');
  empty.id = 'new-blank'; $('presets').append(empty);
}
function renderTracks() {
  $('tracks').replaceChildren(...TRACKS.map((t, i) => {
    const b = button('', () => { preview.stop(); selectedNote = null; selectedTrack = i; renderTracks(); renderGrid(); renderControls(); syncPlayback(); }, 'track');
    b.setAttribute('aria-pressed', String(selectedTrack === i)); b.setAttribute('aria-label', `编辑${t.name}`);
    const text = document.createElement('span'), dot = document.createElement('span'); dot.className = 'dot' + (!state.tracks[i].enabled ? ' off' : '');
    text.append(dot, t.name); const small = document.createElement('small'); small.textContent = !state.tracks[i].enabled ? '整曲关闭' : !state.sections[Math.floor(follower.selectedBar / GROUP_SIZE)].enabled[i] ? '本段关闭' : '已加入'; b.append(text, small); return b;
  }));
}
function renderControls() {
  const t = TRACKS[selectedTrack], layer = state.tracks[selectedTrack];
  $('editor-view-label').hidden = ![0,2,3].includes(selectedTrack); $('editor-view').value=editorView; $('editor-view').disabled=exporting;
  renderTheoryControls();
  $('open-drums').disabled = $('open-dynamics').disabled = $('open-workshop').disabled = $('open-melody').disabled = exporting;
  $('title').value = state.title; $('tempo').value = state.tempo;
  $('bar-count').value = state.barCount;
  $('length-fill').disabled = state.barCount === 32;
  $('copy-group').disabled = state.barCount === GROUP_SIZE;
  $('copy-group').title = state.barCount === GROUP_SIZE ? '先增加一个段落，再复制整段内容' : '将当前四小节的全部四声部复制到另一段';
  $('track-name').textContent = t.name; $('track-hint').textContent = t.hint;
  renderSectionControls();
  $('toggle-track').textContent = `整曲这一层：${layer.enabled ? '开启' : '关闭'}`; $('toggle-track').setAttribute('aria-pressed', String(layer.enabled));
  $('volume').value = layer.volume; $('volume-value').textContent = layer.volume + '%';
  $('voice-label').hidden = selectedTrack !== 0; $('voice').value = state.voice || 'triangle';
  $('voice-hint').textContent = voiceInfo(state.voice || 'triangle').hint + effectiveVoiceHint(0);
  $('voice-hint').hidden = selectedTrack !== 0;
  $('chord-voice-label').hidden = selectedTrack !== 1; $('chord-voice').value = state.chordVoice || 'rounded';
  $('chord-voice-hint').textContent = chordVoiceInfo(state.chordVoice || 'rounded').hint + effectiveVoiceHint(1);
  $('chord-voice-hint').hidden = selectedTrack !== 1;
  $('chord-style-label').hidden = selectedTrack !== 1; $('chord-style').value = state.chordStyle || 'block';
  $('chord-style-hint').hidden = selectedTrack !== 1; $('chord-style-hint').textContent = chordStyleInfo(state.chordStyle || 'block').hint;
  $('bass-voice-label').hidden = $('bass-voice-hint').hidden = selectedTrack !== 2; $('bass-voice').value = state.bassVoice; $('bass-voice-hint').textContent = bassVoiceInfo(state.bassVoice).hint + effectiveVoiceHint(2);
  $('drum-tools').hidden = selectedTrack !== 3; $('apply-drums').disabled = exporting;
  $('drum-kit-label').hidden=$('drum-kit-hint').hidden=selectedTrack!==3;$('drum-kit').value=state.drumKit;$('drum-kit').disabled=exporting;$('drum-hit-level').value=newDrumVelocity;$('drum-hit-level').disabled=exporting;
  $('drum-kit-hint').textContent=drumKitInfo(state.drumKit).hint+` 本段实际：${drumKitInfo(sectionDrumKit(state,follower.selectedBar)).name}（${state.sections[Math.floor(follower.selectedBar/4)].drumKit==='inherit'?'跟随整曲':'本段指定'}）。`;
  $('export-ending').value = exportEnding; $('export-ending').disabled = exporting;
  renderPhraseControls();
  renderNoteControls();
  $('undo').disabled = history.length === 0; $('redo').disabled = future.length === 0;
  $('library-count').textContent = library.length;
  $('click-preview').checked = clickPreview;
  $('grid-tip').textContent = LONG_NOTE_TRACKS.includes(selectedTrack) ? '点色块选中，调整时长或删除；方向键移动，Delete 删除。' : synth.playing ? '点亮或移除格子，直接改变循环；方向键可移动焦点。' : clickPreview ? '点亮即可试听，再点一次移除；方向键可移动焦点。' : '点击添加，再点一次移除；开启「点击试听」可听见单音。';
  $('play').textContent = synth.playing ? '暂停播放' : '播放循环'; $('play').setAttribute('aria-pressed', String(synth.playing));
  if(isPhraseView())$('grid-tip').textContent='拖动或使用按钮调整乐句；重叠和越界会整次取消，音符仍可一次撤销。';
  if(isDrumView())$('grid-tip').textContent='点空格写鼓点，点色块选中；支持框选、复制、批量移动和独立力度。';
  phraseEditor?.update();drumEditor?.update();
}
function phraseModeLabel() { return phraseMode === 'duet' ? '旋律＋和弦' : '仅旋律'; }
function renderPhraseControls() {
  const start = Math.floor(follower.selectedBar / GROUP_SIZE) * GROUP_SIZE;
  $('phrase-tools').hidden = selectedTrack > 1;
  $('phrase-mode').value = phraseMode; $('phrase-mode').disabled = exporting;
  $('preview-phrase').textContent = phraseActive ? '停止试听' : phraseMode === 'duet' ? '试听这段音乐' : '试听这段旋律';
  $('preview-phrase').setAttribute('aria-pressed', String(phraseActive));
  const audible = hasAudibleNotes(state, start, start + GROUP_SIZE, phraseMode === 'duet' ? [0, 1] : [0]);
  $('preview-phrase').disabled = exporting || !audible;
  $('phrase-range').textContent = `第 ${start + 1}–${start + GROUP_SIZE} 小节 · ${phraseModeLabel()}`;
}
function currentNote() {
  if (!selectedNote || !LONG_NOTE_TRACKS.includes(selectedTrack) || selectedNote.track !== selectedTrack || selectedNote.bar !== follower.selectedBar) return null;
  const note = pitchedNoteAt(state, selectedTrack, selectedNote.bar, selectedNote.start);
  if (!note || note.start !== selectedNote.start) { selectedNote = null; return null; }
  return note;
}
function renderNoteControls() {
  $('note-tools').hidden = !LONG_NOTE_TRACKS.includes(selectedTrack)||isPhraseView();
  if (!LONG_NOTE_TRACKS.includes(selectedTrack)) return;
  $('note-length').setAttribute('aria-label', `${TRACKS[selectedTrack].name}音符时长`);
  const note = currentNote(), duration = note?.duration || newNoteLengths[selectedTrack];
  const custom = $('note-length-custom'); custom.hidden = NOTE_LENGTHS.includes(duration); custom.value = duration; custom.textContent = `${duration} 格（自定义）`;
  $('note-length').value = duration;
  $('note-velocity').setAttribute('aria-label', `${TRACKS[selectedTrack].name}音符力度`);
  $('note-velocity').value = note ? state.tracks[selectedTrack].velocities[follower.selectedBar][note.start] : newNoteVelocities[selectedTrack];
  $('note-selection').textContent = note ? `已选：第 ${note.start + 1} 步 · ${pitchName(state,selectedTrack,note.pitch,pitchNaming)} · ${duration} 格` : `新音符：${newNoteLengths[selectedTrack]} 格`;
  $('delete-note').disabled = !note; $('deselect-note').disabled = !note;
}
function auditionNote(message) {
  const note = currentNote(); if (!note) return;
  status(message);
  if (synth.playing || !clickPreview || exporting || !trackAudibleAt(state, selectedTrack, follower.selectedBar)) { if (!synth.playing && !trackAudibleAt(state, selectedTrack, follower.selectedBar)) status(message + ' 当前声部在整曲或本段中未发声，暂不试听。'); return; }
  preview.play(state, selectedTrack, 0, { bar: follower.selectedBar, step: note.start, pitch: note.pitch }).catch(() => status('音符已保留，浏览器未能启动声音。可按「播放循环」重试。'));
}
function selectBar(bar) {
  preview.stop(); selectedNote = null; follower.select(bar, synth.playing); renderTracks(); renderSectionControls(); renderTheoryControls(); renderGrid(); renderNoteControls(); renderPhraseControls(); syncPlayback();
  if (synth.playing) status(`正在查看第 ${bar + 1} 小节，音乐继续播放。按「回到播放位置」恢复跟随。`);
}
function renderBars(view = { ...playbackPosition(synth.playhead, state.barCount), playing: synth.playing }) {
  const group = Math.floor(follower.selectedBar / GROUP_SIZE), start = group * GROUP_SIZE;
  $('section-cards').querySelectorAll('.section-card').forEach((card, i) => {
    card.classList.toggle('editing', i === group); card.classList.toggle('playing', view.playing && Math.floor(view.bar / GROUP_SIZE) === i);
    card.querySelector('button').setAttribute('aria-pressed', String(i === group));
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
  const choice = gridRows()[row]; if (!choice) return;
  if (LONG_NOTE_TRACKS.includes(selectedTrack)) {
    const pitch = choice.id, existing = pitchedNoteAt(state, selectedTrack, follower.selectedBar, col);
    if (existing?.pitch === pitch) {
      preview.stop(); if(existing.bar!==undefined)selectBar(existing.bar); selectedNote = { track: selectedTrack, bar: follower.selectedBar, start: existing.start }; renderGrid(); renderNoteControls(); syncPlayback();
      auditionNote(`已选第 ${existing.start + 1} 步的 ${existing.duration} 格音符，可调整时长或删除。`); return;
    }
    const result = setPitchedNote(state, selectedTrack, follower.selectedBar, col, pitch, newNoteLengths[selectedTrack], newNoteVelocities[selectedTrack]);
    selectedNote = { track: selectedTrack, bar: follower.selectedBar, start: col }; commit(result.state);
    $('grid').querySelector(`[data-row="${row}"][data-col="${col}"]`)?.focus({ preventScroll: true });
    auditionNote(`已添加 ${result.duration} 格${TRACKS[selectedTrack].name}音符${result.limited ? '；遇到后音或四小节段末尾，已自动收短' : ''}。`); return;
  }
  let next = clone(state);const t = next.tracks[selectedTrack], bar = t.bars[follower.selectedBar];
  let added;
  if (t.id === 'drums') {added=!(bar[col]&(1<<(2-row)));next=setDrumHit(state,follower.selectedBar,col,2-row,added,newDrumVelocity);}
  else { const value = choice.id; bar[col] = bar[col] === value ? -1 : value; added = bar[col] !== -1; }
  commit(next);
  const cell = $('grid').querySelector(`[data-row="${row}"][data-col="${col}"]`); if (cell) cell.focus({ preventScroll: true });
  const track = TRACKS[selectedTrack], label = `${track.name} · ${choice.label}`;
  if (synth.playing) { status(added ? `已添加${label}，将在循环中播放。` : `已移除${label}，循环已更新。`); return; }
  if (!added) { status(`已移除${label}。`); return; }
  if (!clickPreview || exporting) { status(`已添加${label}。${exporting ? '导出完成后可以试听。' : '点击试听已关闭。'}`); return; }
  if (!trackAudibleAt(state, selectedTrack, follower.selectedBar)) { status(`已添加${label}。${!t.enabled ? '整曲这一层已关闭' : t.volume === 0 ? '这一层音量为零' : '本段未加入这一层'}，暂不试听。`); return; }
  preview.play(state, selectedTrack, choice.id, selectedTrack === 1 && (choice.id >= 4 || !chordVoiceInfo(sectionVoice(state,1,follower.selectedBar)).legacy || sectionChordStyle(state,follower.selectedBar) !== 'block') ? { bar: follower.selectedBar, step: col } : { bar: follower.selectedBar, offsetStep: selectedTrack===1?col*4:col, ...(selectedTrack===3?{drumLane:2-row}:{}) }).then(started => {
    if (started) status(`试听${label}。再点一次移除。`);
  }).catch(() => status(`已添加${label}，浏览器未能启动声音。可按「播放循环」重试。`));
}
function renderGrid() {
  $('single-grid').hidden=isWideView();$('copy-bar').hidden=$('clear-bar').hidden=isWideView();phraseEditor?.update();drumEditor?.update();
  if(isWideView())return;
  const t = TRACKS[selectedTrack], bar = state.tracks[selectedTrack].bars[follower.selectedBar], cols = bar.length;
  const rows = gridRows();
  const grid = $('grid'), focused = grid.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
  grid.replaceChildren(); grid.className = 'grid' + (t.id === 'chords' ? ' chords' : '');
  grid.setAttribute('aria-label', `${t.name}第${follower.selectedBar + 1}小节音符网格`);
  for (let row = 0; row < rows.length; row++) {
    const label = document.createElement('span'); label.className = 'row-label'; label.textContent = rows[row].label; if(rows[row].outside){label.classList.add('outside-scale');label.title='已有音阶外音，切换音阶不会改变它';} grid.append(label);
    for (let col = 0; col < cols; col++) {
      const b = button('', () => editCell(row, col), 'cell' + (col % 4 === 0 ? ' beat' : ''));
      b.dataset.row = row; b.dataset.col = col;
      const held = LONG_NOTE_TRACKS.includes(selectedTrack) ? pitchedNoteAt(state, selectedTrack, follower.selectedBar, col) : null;
      const on = held ? held.pitch === rows[row].id : t.id === 'drums' ? Boolean(bar[col] & (1 << (2 - row))) : bar[col] === rows[row].id;
      b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${rows[row].label}，第${col + 1}${t.id === 'chords' ? '拍' : '步'}`);
      if(on&&selectedTrack===3){const level=drumLevel(state.tracks[3].drumVelocities[follower.selectedBar][col],2-row);b.classList.add(`velocity-${level}`);b.title=`力度：${VELOCITIES[level].name}`;b.setAttribute('aria-label',`${rows[row].label}，第${col+1}步，力度${VELOCITIES[level].name}，再点移除`);}
      if (on && held) {
        b.dataset.noteStart = held.start;
        const owner=held.bar??follower.selectedBar, localStart=(owner-follower.selectedBar)*16+held.start;
        const velocity = state.tracks[selectedTrack].velocities[owner][held.start]; b.classList.add(`velocity-${velocity}`);
        b.title = `力度：${VELOCITIES[velocity].name}`;
        if (held.duration > 1) b.classList.add(col === localStart ? 'note-start' : col === localStart + held.duration - 1 ? 'note-end' : 'note-middle');
        if (col === localStart) { const mark = document.createElement('span'); mark.textContent = '•'; mark.setAttribute('aria-hidden', 'true'); b.append(mark); }
        b.classList.toggle('note-selected', currentNote()?.start === held.start && owner===follower.selectedBar);
        b.setAttribute('aria-label', `${rows[row].label}，第${col + 1}步，${col === localStart ? '音符起点' : '延音'}，持续 ${held.duration} 格，力度${VELOCITIES[velocity].name}，${held.bar!==undefined?'点按回到起点并选中完整音符':'点按选中'}`);
      }
      b.addEventListener('keydown', e => {
        if (LONG_NOTE_TRACKS.includes(selectedTrack) && ['Delete', 'Backspace'].includes(e.key)) {
          e.preventDefault(); const note = pitchedNoteAt(state, selectedTrack, follower.selectedBar, col);
          if (note && note.pitch === rows[row].id) { selectedNote = null; commit(removePitchedNote(state, selectedTrack, follower.selectedBar, col), `${TRACKS[selectedTrack].name}音符已删除；撤销可以恢复。`); }
          return;
        }
        const shift = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]; if (!shift) return;
        e.preventDefault(); const nr = Math.max(0, Math.min(rows.length - 1, row + shift[0])), nc = Math.max(0, Math.min(cols - 1, col + shift[1]));
        grid.querySelector(`[data-row="${nr}"][data-col="${nc}"]`).focus();
      }); grid.append(b);
    }
  }
  grid.append(document.createElement('span'));
  for (let col = 0; col < cols; col++) { const n = document.createElement('span'); n.className = 'beat-label'; n.dataset.col = col; n.textContent = t.id === 'chords' ? `${col + 1} 拍` : col % 4 === 0 ? `${col / 4 + 1} 拍` : '·'; grid.append(n); }
  if (focused?.row !== undefined && focused?.col !== undefined) grid.querySelector(`[data-row="${focused.row}"][data-col="${focused.col}"]`)?.focus({ preventScroll: true });
  lastStep = -1;
}
function render() { follower.update(synth.playhead, synth.playing); renderTracks(); renderControls(); renderSections(); renderBars(); renderGrid(); syncPlayback(); }
function stop() { preview.stop(); synth.pause(); transportRange = null; configurePlayback(synth, playbackRange(state)); follower.stop(); wasPlaying = false; renderControls(); syncPlayback(); }
function syncPlayback() {
  const oldBar = follower.selectedBar, view = follower.update(synth.playhead, synth.playing);
  if (oldBar !== follower.selectedBar) { selectedNote = null; renderTracks(); renderSectionControls(); renderTheoryControls(); renderGrid(); renderNoteControls(); renderPhraseControls(); }
  renderBars(view);
  phraseEditor?.playback(view);drumEditor?.playback(view);
  const active = view.playing && view.bar === follower.selectedBar;
  $('position').textContent = view.playing ? `播放 ${view.bar + 1} / ${state.barCount} 节 · ${view.beat + 1} 拍${active ? '' : ` · 查看第 ${follower.selectedBar + 1} 节`}` : `编辑第 ${follower.selectedBar + 1} 节 · 循环 ${state.barCount} 小节`;
  const col = selectedTrack === 1 ? view.beat : view.step;
  $('grid').querySelectorAll('.cell').forEach(cell => cell.classList.toggle('playing', active && Number(cell.dataset.col) === col));
  $('grid').querySelectorAll('.beat-label').forEach(label => label.classList.toggle('playing', active && Number(label.dataset.col) === (selectedTrack === 1 ? view.beat : view.beat * 4)));
  lastStep = view.playing ? view.absolute : -1;
}
function playbackFrame() {
  if (wasPlaying && !synth.playing) { stop(); status('已播放到整曲结尾。'); }
  if (synth.playing && Math.floor(synth.playhead * 16) !== lastStep) syncPlayback();
  if(!synth.playing&&orchestrationActive){const seconds=preview.elapsedSeconds();if(seconds!==null){const steps=Math.floor(seconds*state.tempo/60*4),start=Math.floor(follower.selectedBar/GROUP_SIZE)*GROUP_SIZE;const view={playing:true,bar:start+Math.floor(steps/16),step:steps%16};phraseEditor?.playback(view);drumEditor?.playback(view);}}
  wasPlaying = synth.playing; requestAnimationFrame(playbackFrame);
}
function startTransport(mode) {
  preview.stop();
  try {
    transportRange = playbackRange(state, mode, follower.selectedBar); configurePlayback(synth, transportRange);
    if (mode !== 'song') { synth.playhead = transportRange.start; synth.resetEffects(); }
    follower.start(); synth.play(); wasPlaying = true; renderControls(); syncPlayback();
    status(mode === 'section' ? `循环第 ${transportRange.start + 1}–${transportRange.end} 小节；手动查看其他段不会改变循环范围。` : mode === 'from-section' ? `从第 ${transportRange.start + 1} 小节播放到结尾，一次结束。` : `${state.barCount} 小节完整循环播放中。`);
  } catch { stop(); status('浏览器未能启动音频，请检查声音权限后再次按播放。'); }
}
$('play').addEventListener('click', () => { if (synth.playing) { stop(); status('已暂停。可以继续修改格子。'); } else startTransport('song'); });
$('loop-section').addEventListener('click', () => {
  const current = state.sections[Math.floor(follower.selectedBar / GROUP_SIZE)].id;
  if (synth.playing && transportRange?.mode === 'section' && transportRange.sectionId === current) { stop(); status('已停止段落循环。'); }
  else startTransport('section');
});
$('play-from-section').addEventListener('click', () => startTransport('from-section'));
function savePreferences(message) {
  try { localStorage.setItem(KEYS.preferences, JSON.stringify({ clickPreview, followPlayback: follower.enabled, exportEnding, phraseMode, pitchRange, pitchNaming, editorView })); status(message); }
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
$('restart').addEventListener('click', () => { preview.stop(); synth.snapToStart(); if (transportRange?.mode === 'section') synth.playhead = transportRange.start; synth.resetEffects(); syncPlayback(); status('已回到第一小节开头。'); });
$('title').addEventListener('input', e => {
  history.push(snapshot()); if (history.length > 100) history.shift(); future.length = 0;
  state.title = e.target.value.slice(0, 60); draftSave();
  $('undo').disabled = false; $('redo').disabled = true;
});
$('title').addEventListener('blur', () => { if (!state.title.trim()) { state.title = '未命名的音乐'; $('title').value = state.title; draftSave(); } });
$('tempo').addEventListener('input', e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 60 && n <= 180 && n !== state.tempo) { const next = clone(state); next.tempo = n; commit(next); } });
$('tempo').addEventListener('change', e => { const n = Number(e.target.value); if (!Number.isInteger(n) || n < 60 || n > 180) { e.target.value = state.tempo; status('速度请设为 60–180 之间的整数。'); return; } const next = clone(state); next.tempo = n; commit(next); });
$('volume').addEventListener('input', e => { const next = clone(state); next.tracks[selectedTrack].volume = Number(e.target.value); commit(next); });
$('voice').addEventListener('change', e => { const next = clone(state); next.voice = e.target.value; commit(next, `整曲旋律音色设为「${voiceInfo(next.voice).name}」；跟随整曲的段落同步，本段指定音色保留。`); });
$('chord-voice').addEventListener('change', e => { const next = clone(state); next.chordVoice = e.target.value; commit(next, `整曲和弦音色设为「${chordVoiceInfo(next.chordVoice).name}」；本段指定音色保留。`); });
$('chord-style').addEventListener('change', e => { const next = clone(state); next.chordStyle = e.target.value; commit(next, `和弦改为${chordStyleInfo(next.chordStyle).name}。${chordStyleInfo(next.chordStyle).hint}选择「旋律＋和弦」试听效果。`); });
$('phrase-mode').addEventListener('change', e => { preview.stop(); phraseMode = e.target.value; renderPhraseControls(); savePreferences(`段落试听设为${phraseModeLabel()}。`); });
$('preview-phrase').addEventListener('click', () => {
  if (phraseActive) { preview.stop(); status('已停止段落试听。'); return; }
  stop();
  const start = Math.floor(follower.selectedBar / GROUP_SIZE) * GROUP_SIZE;
  status(`正在准备第 ${start + 1}–${start + GROUP_SIZE} 小节的${phraseModeLabel()}试听。`);
  preview.playPhrase(state, start, active => {
    const wasActive = phraseActive; phraseActive = active; renderPhraseControls();
    if (wasActive && !active) status('段落试听已结束。');
  }, phraseMode).then(started => { if (started) status(`正在试听第 ${start + 1}–${start + GROUP_SIZE} 小节 · ${phraseModeLabel()}；可再次点击停止。`); })
    .catch(() => status('无法开始段落试听，作品仍保留。请重试，或按「播放循环」。'));
});
$('export-ending').addEventListener('change', e => { exportEnding = e.target.value; savePreferences(exportEnding === 'natural' ? '导出采用自然收尾，保留乐器余音。' : '导出采用整段循环，严格按作品小节数截取。'); });
$('note-length').addEventListener('change', e => {
  const duration = Number(e.target.value); if (!NOTE_LENGTHS.includes(duration)) return;
  newNoteLengths[selectedTrack] = duration; const note = currentNote();
  if (!note) { preview.stop(); renderNoteControls(); status(`新音符设为 ${duration} 格。点空格添加，遇到后音或四小节段末尾会自动收短。`); return; }
  const result = setPitchedNote(state, selectedTrack, follower.selectedBar, note.start, note.pitch, duration);
  if (result.duration !== note.duration) commit(result.state);
  else { renderNoteControls(); }
  auditionNote(`音符时长为 ${result.duration} 格${result.limited ? '；遇到后音或四小节段末尾，已自动收短' : ''}。`);
});
$('deselect-note').addEventListener('click', () => { preview.stop(); selectedNote = null; renderGrid(); renderNoteControls(); syncPlayback(); status(`已取消选择，接下来添加 ${newNoteLengths[selectedTrack]} 格音符。`); });
$('delete-note').addEventListener('click', () => { const note = currentNote(); if (!note) return; const next = removePitchedNote(state, selectedTrack, follower.selectedBar, note.start); selectedNote = null; commit(next, `${TRACKS[selectedTrack].name}音符已删除；撤销可以恢复。`); });
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
  const apply = () => { stop(); selectedNote = null; commit(resize(state, count, fill), `作品已调整为 ${count} 小节；撤销可恢复原长度和内容。`); };
  if (count < state.barCount) {
    e.target.value = state.barCount;
    confirmChange(`缩短到 ${count} 小节会移除第 ${count + 1}–${state.barCount} 小节的段落和内容。之后可以撤销恢复。`, apply, '确定缩短'); return;
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
$('copy-bar').addEventListener('click', () => { try {const dest = (follower.selectedBar + 1) % state.barCount, next = copyBar(state, selectedTrack, follower.selectedBar, dest); selectedNote = null; follower.select(dest, synth.playing); commit(next, `已复制本小节内的内容到第 ${dest + 1} 小节；跨小节长音按边界截取；可撤销。`);}catch(error){status(error.message);} });
$('clear-bar').addEventListener('click', () => { const next=clearBar(state,selectedTrack,follower.selectedBar);selectedNote=null;commit(next,'这一小节及与其相交的完整长音已清空；撤销可以恢复。'); });

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
  try { if (file.size > MAX_BACKUP_BYTES) throw new Error(); const next = parseBackup(await file.text()); stop(); commit(next, '作品已导入为新草稿。保存会新增作品。', null); }
  catch { status('导入失败：请选择有效的音芽作品 JSON 文件（96 KB 以内）。当前作品已保留。'); }
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
  if (exporting) return; exporting = true; const snapshot = clone(state), renderer = new AudioRenderer(), ending = exportEnding;
  const job = { canceled: false, renderer, worker: null, reject: null }; exportJob = job;
  $('export').disabled = true; $('export-mp3').disabled = true; $('cancel-export').hidden = false; stop();
  try {
    for await (const progress of renderer.generate(snapshot, 44100, ending)) status(`正在合成 ${format.toUpperCase()} 的完整 ${snapshot.barCount} 小节：${Math.round(progress * 100)}%`);
    if (job.canceled) throw new DOMException('已取消', 'AbortError');
    const audio = format === 'mp3' ? await encodeInWorker(renderer.outputSamplesL, renderer.outputSamplesR, job) : wavBuffer(renderer.outputSamplesL, renderer.outputSamplesR, 44100);
    if (job.canceled) throw new DOMException('已取消', 'AbortError');
    // The rendered song is a snapshot; keep its name even if editing during export.
    const url = URL.createObjectURL(new Blob([audio], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' }));
    const a = $('export-link');
    if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
    a.href = url; a.dataset.url = url; a.download = (snapshot.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '音芽作品') + '.' + format; a.textContent = `下载 ${format.toUpperCase()}`; a.hidden = false;
    status(`${format.toUpperCase()} 已生成：完整 ${snapshot.barCount} 小节${renderer.tailSeconds ? ' · 含自然余音' : ''}${format === 'mp3' ? ' · 192 kbps 立体声' : ''}。点击「下载 ${format.toUpperCase()}」保存文件。`);
  } catch (error) { status(job.canceled || error?.name === 'AbortError' ? '已取消音频导出，作品内容保留。' : `${format.toUpperCase()} 导出失败，作品内容保留。${format === 'mp3' ? '可以尝试 WAV 导出或备份作品文件。' : '可以先备份作品文件。'}`); }
  finally { job.worker?.terminate(); exportJob = null; exporting = false; $('export').disabled = false; $('export-mp3').disabled = false; $('cancel-export').hidden = true; renderControls(); }
}
$('export').addEventListener('click', () => exportAudio('wav'));
$('export-mp3').addEventListener('click', () => exportAudio('mp3'));
$('cancel-export').addEventListener('click', () => {
  if (!exportJob) return;
  exportJob.canceled = true; exportJob.renderer.canceled = true; exportJob.worker?.terminate(); exportJob.reject?.(new DOMException('已取消', 'AbortError'));
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { preview.dispose(); if (workshopSession) workshopSession.request++; if (melodySession) melodySession.request++; if (synth.playing) { stop(); status('切到后台后已暂停，回来按播放即可继续。'); } } });
window.addEventListener('pagehide', () => preview.dispose());
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
});
for (const [id, choices] of [['workshop-bass', BASS_PATTERNS], ['workshop-style', ACCOMPANIMENT_STYLES], ['melody-style', MELODY_STYLES], ['melody-density', MELODY_DENSITIES]]) $(id).replaceChildren(...choices.map(choice => { const option = document.createElement('option'); option.value = choice.id; option.textContent = choice.name; return option; }));
$('scale').replaceChildren(...SCALES.map(scale=>{const o=document.createElement('option');o.value=scale.id;o.textContent=scale.name;return o;}));
$('transpose').replaceChildren(...Array.from({length:25},(_,i)=>{const n=i-12,o=document.createElement('option');o.value=n;o.textContent=`${n===0?'原调':n>0?`升 ${n} 半音`:`降 ${-n} 半音`} · ${keyName(n)}`;return o;}));
$('section-chord-style').replaceChildren(...['inherit',...CHORD_STYLES.map(s=>s.id)].map(id=>{const option=document.createElement('option');option.value=id;option.textContent=id==='inherit'?'跟随整曲':chordStyleInfo(id).name;return option;}));
$('bass-voice').replaceChildren(...BASS_VOICES.map(voice=>{const option=document.createElement('option');option.value=voice.id;option.textContent=voice.name;return option;}));
$('drum-kit').replaceChildren(...DRUM_KITS.map(k=>{const o=document.createElement('option');o.value=k.id;o.textContent=k.name;return o;}));
$('drum-kit').addEventListener('change',e=>{const next=clone(state);next.drumKit=e.target.value;commit(next,'整曲鼓组已更新；本段指定鼓组保留，可撤销。');});
$('drum-hit-level').addEventListener('change',e=>{newDrumVelocity=Number(e.target.value);preview.stop();status(`新鼓点力度：${VELOCITIES[newDrumVelocity].name}；已有鼓点的力度保留。`);});
$('drum-pattern').replaceChildren(...DRUM_PATTERNS.map(pattern=>{const option=document.createElement('option');option.value=pattern.id;option.textContent=pattern.name;return option;}));
$('chord-style').replaceChildren(...CHORD_STYLES.map(style => { const option = document.createElement('option'); option.value = style.id; option.textContent = style.name; return option; }));
$('chord-voice').replaceChildren(...CHORD_VOICES.map(voice => { const option = document.createElement('option'); option.value = voice.id; option.textContent = voice.name; return option; }));
$('voice').replaceChildren(...VOICES.map(voice => { const option = document.createElement('option'); option.value = voice.id; option.textContent = voice.name; return option; }));
phraseEditor = new PhraseEditor($('phrase-editor'),{
  get:()=>{const start=Math.floor(follower.selectedBar/GROUP_SIZE)*GROUP_SIZE;return {state,track:selectedTrack,start,active:isPhraseView(),disabled:exporting,range:pitchRange,naming:pitchNaming,auditioning:orchestrationActive,canAudition:hasAudibleNotes(state,start,start+GROUP_SIZE)};},
  beforeEdit:()=>stop(),status,
  commit:(next,message)=>{selectedNote=null;commit(next,message);},
  auditionPhrase:()=>$('preview-section').click(),
  auditionNote:note=>{if(note&&clickPreview&&!exporting&&!synth.playing){const start=Math.floor(follower.selectedBar/GROUP_SIZE)*GROUP_SIZE;preview.play(state,selectedTrack,0,{bar:start+Math.floor(note.step/16),step:note.step%16,pitch:note.pitch}).catch(()=>status('音符已保留，浏览器未能启动声音。'));}},
});
drumEditor=new DrumEditor($('drum-editor'),{get:()=>{const start=Math.floor(follower.selectedBar/4)*4;return {state,start,active:isDrumView(),disabled:exporting,auditioning:orchestrationActive,canAudition:hasAudibleNotes(state,start,start+4)};},beforeEdit:stop,status,commit,audition:()=>$('preview-section').click(),auditionHit:n=>{if(n&&clickPreview&&!exporting&&!synth.playing){const start=Math.floor(follower.selectedBar/4)*4;preview.play(state,3,2-n.lane,{bar:start+Math.floor(n.step/16),offsetStep:n.step%16,drumLane:n.lane}).catch(()=>status('鼓点已保留，浏览器未能启动声音。'));}}});
const drumWorkshop=new DrumWorkshop($('drum-dialog'),{get:()=>state,beforeEdit:stop,preview,commit,confirm:confirmChange});
$('open-drums').addEventListener('click',()=>{if(!exporting)drumWorkshop.open(Math.floor(follower.selectedBar/4));});
const dynamicEditor=new DynamicEditor($('dynamic-dialog'),{get:()=>state,beforeEdit:stop,preview,commit:(next,message)=>{selectedNote=null;commit(next,message);}});
$('open-dynamics').addEventListener('click',()=>{if(!exporting)dynamicEditor.open(Math.floor(follower.selectedBar/GROUP_SIZE));});
initOrchestrationControls(); renderPresets(); syncAudio(); render(); if (consumedShare || migratedDraft) draftSave();
status(clickPreview ? `点亮一个格子试听，或按「播放循环」听完整 ${state.barCount} 小节。` : `点击试听已关闭；可以安静编辑，或按「播放循环」听完整 ${state.barCount} 小节。`);
if (storageWarning) status(storageWarning); requestAnimationFrame(playbackFrame);

function effectiveVoiceHint(track) {
  const part=state.sections[Math.floor(follower.selectedBar/GROUP_SIZE)],id=sectionVoice(state,track,follower.selectedBar);
  return ` 本段实际：${[voiceInfo,chordVoiceInfo,bassVoiceInfo][track](id).name}（${part.voices[track]==='inherit'?'跟随整曲':'本段指定'}），相对音量 ${dynamicLabel(part.volumes[track],part.endVolumes[track])}。`;
}
function orchestrationDescription(index) {
  const part=state.sections[index];
  return TRACKS.flatMap((track,i)=>!trackAudibleAt(state,i,index*GROUP_SIZE)?[]:[`${track.name}${i<3?'：'+[voiceInfo,chordVoiceInfo,bassVoiceInfo][i](sectionVoice(state,i,index*GROUP_SIZE)).name:''}${part.volumes[i]!==100||part.endVolumes[i]!==100?` ${dynamicLabel(part.volumes[i],part.endVolumes[i])}`:''}`]).join(' · ')||'本段静音';
}
function initOrchestrationControls() {
  const container=$('orchestration-tracks');
  TRACKS.forEach((track,i)=>{
    const card=document.createElement('div');card.className='orchestration-track';
    const heading=document.createElement('b');heading.textContent=track.name;card.append(heading);
    if(i<3){
      const label=document.createElement('label');label.textContent='本段音色';const select=document.createElement('select');select.id=`section-voice-${i}`;select.setAttribute('aria-label',`本段${track.name}音色`);
      for(const choice of [{id:'inherit',name:'跟随整曲'},...[VOICES,CHORD_VOICES,BASS_VOICES][i]]){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.name;select.append(option);}
      select.addEventListener('change',()=>commit(setSectionVoice(state,Math.floor(follower.selectedBar/GROUP_SIZE),i,select.value),`本段${track.name}音色已更新；音符与其他段配器保留，可撤销。`));label.append(select);card.append(label);
    }else{const label=document.createElement('label');label.textContent='本段鼓组';const select=document.createElement('select');select.id='section-drum-kit';select.setAttribute('aria-label','本段鼓组');for(const k of [{id:'inherit',name:'跟随整曲'},...DRUM_KITS]){const o=document.createElement('option');o.value=k.id;o.textContent=k.name;select.append(o);}select.addEventListener('change',()=>commit(setSectionDrumKit(state,Math.floor(follower.selectedBar/4),select.value),'本段鼓组已更新；鼓点及力度保留，可撤销。'));label.append(select);card.append(label);}
    const label=document.createElement('label');label.textContent='本段相对音量 ';const output=document.createElement('output');output.id=`section-volume-value-${i}`;
    const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='5';input.id=`section-volume-${i}`;input.setAttribute('aria-label',`本段${track.name}相对音量`);input.title='调整会设为固定音量；起止渐变请打开动态编曲';
    input.addEventListener('input',()=>{output.value=input.value+'%';});
    input.addEventListener('change',()=>{const index=Math.floor(follower.selectedBar/GROUP_SIZE),volume=Number(input.value);if(volume!==state.sections[index].volumes[i])commit(setSectionVolume(state,index,i,volume),`本段${track.name}设为固定音量 ${volume}%；渐变恢复平稳，整曲音量保留，可撤销。`);});
    for(const control of [input,card.querySelector('select')])control.addEventListener('focus',()=>{if(synth.playing){follower.select(follower.selectedBar,true);syncPlayback();}});
    label.append(output,input);card.append(label);container.append(card);
  });
}
function renderOrchestrationControls(index) {
  phraseEditor?.setAudition(orchestrationActive);
  const part=state.sections[index];$('section-drum-kit').value=part.drumKit;$('section-drum-kit').disabled=exporting;drumEditor?.update();$('orchestration-summary').textContent=`「${part.name}」· ${(part.drumKit!=='inherit'||part.voices.some(id=>id!=='inherit'))?'独立音色':'跟随整曲'}`;
  TRACKS.forEach((_,i)=>{if(i<3){$(`section-voice-${i}`).value=part.voices[i];$(`section-voice-${i}`).disabled=exporting;}$(`section-volume-${i}`).value=part.volumes[i];$(`section-volume-${i}`).disabled=exporting;$(`section-volume-value-${i}`).value=dynamicLabel(part.volumes[i],part.endVolumes[i]);});
  $('reset-orchestration').disabled=exporting||(part.drumKit==='inherit'&&part.voices.every(id=>id==='inherit')&&part.volumes.every(n=>n===100)&&part.endVolumes.every(n=>n===100));
  $('preview-section').disabled=exporting||!hasAudibleNotes(state,index*GROUP_SIZE,(index+1)*GROUP_SIZE);
  $('preview-section').textContent=orchestrationActive?'停止试听':'试听本段配器';$('preview-section').setAttribute('aria-pressed',String(orchestrationActive));
}
$('reset-orchestration').addEventListener('click',()=>commit(resetSectionOrchestration(state,Math.floor(follower.selectedBar/GROUP_SIZE)),'本段音色已跟随整曲，起止音量恢复固定 100%；音符、声部开关及和弦演奏方式保留，可撤销。'));
$('preview-section').addEventListener('click',async()=>{
  if(orchestrationActive){preview.stop();return;}stop();const start=Math.floor(follower.selectedBar/GROUP_SIZE)*GROUP_SIZE;
  try{await preview.playSection(state,start,active=>{orchestrationActive=active;renderOrchestrationControls(Math.floor(follower.selectedBar/GROUP_SIZE));$('orchestration-message').textContent=active?'正在试听本段四声部配器。':'试听已停止。';});}
  catch{$('orchestration-message').textContent='浏览器未能启动试听，请重试。';}
});
function renderSections() {
  $('section-cards').replaceChildren(...state.sections.map((part, i) => {
    const card = document.createElement('article'); card.className = 'section-card';
    const choose = button(part.name, () => selectBar(i * GROUP_SIZE)); choose.setAttribute('aria-label', `编辑第 ${i + 1} 段：${part.name}`);
    const range = document.createElement('small'); range.textContent = `第 ${i * GROUP_SIZE + 1}–${(i + 1) * GROUP_SIZE} 小节`;
    const layers = document.createElement('small'); layers.textContent = orchestrationDescription(i);
    card.append(choose, range, layers); return card;
  }));
  renderSectionControls();
}
function renderSectionControls() {
  const index = Math.floor(follower.selectedBar / GROUP_SIZE), part = state.sections[index];
  renderOrchestrationControls(index);
  $('drum-kit-hint').textContent=drumKitInfo(state.drumKit).hint+` 本段实际：${drumKitInfo(sectionDrumKit(state,follower.selectedBar)).name}（${part.drumKit==='inherit'?'跟随整曲':'本段指定'}）。`;
  for(const [track,id] of [[0,'voice-hint'],[1,'chord-voice-hint'],[2,'bass-voice-hint']])$(id).textContent=[voiceInfo,chordVoiceInfo,bassVoiceInfo][track]([state.voice||'triangle',state.chordVoice,state.bassVoice][track]).hint+effectiveVoiceHint(track);
  $('section-summary').textContent = `${state.sections.length} 段 · ${state.barCount} 小节 · 约 ${Math.round(state.barCount * 240 / state.tempo)} 秒，每段四小节`;
  $('section-name').value = part.name;
  $('section-chord-style').value = part.chordStyle;
  $('section-accompaniment-hint').textContent = `本段和弦：${chordStyleInfo(sectionChordStyle(state,follower.selectedBar)).name}${part.chordStyle === 'inherit' ? '（跟随整曲）' : '（本段设置）'}。只改变演奏节奏，音符和音色保留。`;
  $('section-tracks').replaceChildren(...TRACKS.map((track, i) => {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = part.enabled[i]; input.setAttribute('aria-label', `本段${track.name}`);
    input.addEventListener('change', () => commit(setSectionTrack(state, index, i, input.checked), `${part.name}：${track.name}${input.checked ? '已加入' : '已关闭'}，音符保留。`));
    label.append(input, track.name); return label;
  }));
  const globalOff = TRACKS.filter((_, i) => !state.tracks[i].enabled || state.tracks[i].volume === 0).map(track => track.name);
  $('section-track-hint').textContent = globalOff.length ? `整曲静音：${globalOff.join('、')}。本段开关仍受整曲开关和音量控制。` : '本段开关只安排声部是否加入，关闭后音符仍可编辑。';
  $('section-track-note').hidden = part.enabled[selectedTrack] && Math.max(part.volumes[selectedTrack],part.endVolumes[selectedTrack])>0;
  $('section-track-note').textContent = `本段${TRACKS[selectedTrack].name}${part.enabled[selectedTrack]?'音量为 0%':'未加入'}；音符仍可编辑，请在段落配器中检查开关及音量。`;
  $('add-section').disabled = $('duplicate-section').disabled = state.barCount === 32 || exporting;
  $('move-section-left').disabled = index === 0 || exporting; $('move-section-right').disabled = index === state.sections.length - 1 || exporting;
  $('delete-section').disabled = state.sections.length === 1 || exporting;
  const looping = synth.playing && transportRange?.mode === 'section' && transportRange.sectionId === part.id;
  $('loop-section').textContent = looping ? '停止段落循环' : '循环这一段'; $('loop-section').setAttribute('aria-pressed', String(looping));
  $('loop-section').disabled = $('play-from-section').disabled = exporting;
  $('transport-range').textContent = !synth.playing ? '整曲导出包含全部段落；段落循环只改变播放范围。' : transportRange?.mode === 'section' ? `正在循环第 ${transportRange.start + 1}–${transportRange.end} 小节` : transportRange?.mode === 'from-section' ? `从第 ${transportRange.start + 1} 小节播放到整曲结尾` : '正在循环完整作品';
}
function applySectionEdit(next, selected, message) {
  stop(); selectedNote = null; commit(next, message); selectBar(selected * GROUP_SIZE);
}
for (const id of ['section-name', 'section-chord-style', 'note-length', 'note-velocity', 'scale', 'transpose', 'pitch-range', 'pitch-naming', 'octave-scope', 'progression', 'chord-palette']) $(id).addEventListener('focus', () => {
  if (synth.playing) { follower.select(follower.selectedBar, true); syncPlayback(); }
});
function saveSectionName(e) {
  const index = Math.floor(follower.selectedBar / GROUP_SIZE), name = e.target.value.trim();
  if (!name || name.length > 24) { e.target.value = state.sections[index].name; status('段落名称请填 1–24 个字。'); return; }
  if (name !== state.sections[index].name) commit(renameSection(state, index, name), '段落已重命名；撤销可恢复。');
}
$('section-name').addEventListener('change', saveSectionName);
$('section-name').addEventListener('blur', saveSectionName);
$('section-name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('add-section').addEventListener('click', () => { const index = Math.floor(follower.selectedBar / GROUP_SIZE); applySectionEdit(insertSection(state, index), index + 1, '已在当前段后新增空白段。'); });
$('duplicate-section').addEventListener('click', () => { const index = Math.floor(follower.selectedBar / GROUP_SIZE); applySectionEdit(insertSection(state, index, true), index + 1, '已复制为独立的新段，修改副本不会改变原段。'); });
for (const [id, shift] of [['move-section-left', -1], ['move-section-right', 1]]) $(id).addEventListener('click', () => { const index = Math.floor(follower.selectedBar / GROUP_SIZE); applySectionEdit(moveSection(state, index, index + shift), index + shift, '段落顺序已更新；四个声部与长音一起移动。'); });
$('delete-section').addEventListener('click', () => {
  const index = Math.floor(follower.selectedBar / GROUP_SIZE), name = state.sections[index].name;
  confirmChange(`删除「${name}」及其四小节内容？之后可以撤销恢复。`, () => applySectionEdit(deleteSection(state, index), Math.min(index, state.sections.length - 2), '段落已删除；撤销可恢复全部内容。'), '删除这一段');
});

$('section-chord-style').addEventListener('change',e=>commit(setSectionChordStyle(state,Math.floor(follower.selectedBar/GROUP_SIZE),e.target.value),'本段和弦伴奏已更新；其他段设置保留。'));
$('bass-voice').addEventListener('change',e=>{const next=clone(state);next.bassVoice=e.target.value;commit(next,`整曲贝斯音色设为「${bassVoiceInfo(next.bassVoice).name}」；本段指定音色保留。`);});
$('note-velocity').addEventListener('change',e=>{
  const level=Number(e.target.value); if(!VELOCITIES.some(v=>v.id===level))return;
  newNoteVelocities[selectedTrack]=level;const note=currentNote();
  if(!note){preview.stop();status(`新${TRACKS[selectedTrack].name}音符力度：${VELOCITIES[level].name}。`);return;}
  commit(setNoteVelocity(state,selectedTrack,follower.selectedBar,note.start,level));auditionNote(`所选音符力度：${VELOCITIES[level].name}。`);
});
$('apply-drums').addEventListener('click',()=>{
  const count=$('drum-scope').value==='section'?GROUP_SIZE:1;
  const start=count===GROUP_SIZE?Math.floor(follower.selectedBar/GROUP_SIZE)*GROUP_SIZE:follower.selectedBar;
  const id=$('drum-pattern').value,fill=$('drum-fill').checked,name=DRUM_PATTERNS.find(p=>p.id===id).name;
  const apply=()=>{selectedNote=null;commit(applyDrumPattern(state,start,count,id,fill),`已填入「${name}」${fill?'，最后一小节含过门':''}；可逐格修改，撤销可恢复。${!trackAudibleAt(state,3,start)?' 本段或整曲鼓点未发声，开启相应开关后可听见。':''}`);};
  if(state.tracks[3].bars.slice(start,start+count).some(bar=>bar.some(Boolean)))confirmChange(`将覆盖第 ${start+1}–${start+count} 小节已有鼓点，旋律、和弦和贝斯保留。之后可以撤销恢复。`,apply,'填入鼓点');else apply();
});

function renderTheoryControls() {
  $('scale').value=state.scale;$('transpose').value=state.transpose;
  $('transpose-down').disabled=state.transpose===-12||exporting;$('transpose-up').disabled=state.transpose===12||exporting;
  $('tonality-summary').textContent=`当前主音 ${keyName(state.transpose)} · ${scaleInfo(state.scale).name}。移调同步旋律、和弦与贝斯，鼓点不变。`;
  $('pitch-tools').hidden=!LONG_NOTE_TRACKS.includes(selectedTrack);
  $('harmony-tools').hidden=selectedTrack!==1;
  const previous=$('progression').value,mode=state.scale==='minor'?'minor':'major';
  const options=PROGRESSIONS.filter(p=>p.mode===mode);
  $('progression').replaceChildren(...options.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=`${p.name} · ${p.chords.map(id=>chordName(state,id)).join(' → ')}`;return o;}));
  if(options.some(p=>p.id===previous))$('progression').value=previous;
  $('apply-progression').disabled=exporting; $('chord-palette').value=chordPalette;
  $('pitch-range').value=pitchRange;$('pitch-naming').value=pitchNaming;
  $('octave-down').disabled=$('octave-up').disabled=exporting;
  if(LONG_NOTE_TRACKS.includes(selectedTrack)) {
    const track=state.tracks[selectedTrack],bar=track.bars[follower.selectedBar],visible=new Set(gridRows().map(r=>r.id));
    const outside=bar.filter(n=>n>=0&&!inScale(state,n)).length,hidden=bar.filter(n=>n>=0&&!visible.has(n)).length;
    $('pitch-hint').textContent=`${outside?`当前小节有 ${outside} 个音阶外音，已保留并标记。`:'当前小节音符均在所选音阶内。'}${hidden?`另有 ${hidden} 个音符在显示范围外，切换完整两八度查看。`:''}切换音阶或显示范围不会改动音符。`;
  }
}
$('scale').addEventListener('change',e=>{selectedNote=null;commit(setScale(state,e.target.value),'音阶已切换；已有音符保留，音阶外音会作提示。');});
function changeTranspose(n){try{commit(setTranspose(state,n),`整曲已移调：${keyName(n)}，旋律、和弦与贝斯同步变化；鼓点保留。`);}catch(error){status(error.message);}}
$('transpose').addEventListener('change',e=>changeTranspose(Number(e.target.value)));
$('transpose-down').addEventListener('click',()=>changeTranspose(state.transpose-1));$('transpose-up').addEventListener('click',()=>changeTranspose(state.transpose+1));
for(const id of ['pitch-range','pitch-naming'])$(id).addEventListener('change',e=>{preview.stop();selectedNote=null;if(id==='pitch-range')pitchRange=e.target.value;else pitchNaming=e.target.value;renderTheoryControls();renderGrid();renderNoteControls();syncPlayback();savePreferences('显示方式已更新；音符内容保持。');});
for(const [id,direction] of [['octave-down',-1],['octave-up',1]])$(id).addEventListener('click',()=>{
  const count=$('octave-scope').value==='section'?4:1,start=count===4?Math.floor(follower.selectedBar/4)*4:follower.selectedBar;
  try{const next=shiftOctave(state,selectedTrack,start,count,direction);selectedNote=null;commit(next,`当前${count===4?'四小节段':'小节'}的${TRACKS[selectedTrack].name}已${direction>0?'升':'降'}八度；相交长音整体移动，力度与时长保留；可撤销。`);}catch(error){status(error.message);}
});
$('apply-progression').addEventListener('click',()=>{
  const start=Math.floor(follower.selectedBar/4)*4,id=$('progression').value;
  const apply=()=>commit(applyProgression(state,start,id),'和弦走向已填入当前四小节段；旋律、贝斯与鼓点保留，可逐拍修改或撤销。');
  if(state.tracks[1].bars.slice(start,start+4).some(bar=>bar.some(n=>n>=0)))confirmChange(`将覆盖第 ${start+1}–${start+4} 小节的和弦音符，音色和演奏方式保留。之后可以撤销恢复。`,apply,'填入和弦');else apply();
});

$('chord-palette').addEventListener('change',e=>{preview.stop();chordPalette=e.target.value;renderGrid();syncPlayback();status('和弦显示范围已更新；已有和弦保留。');});

function closeWorkshop() {
  preview.stop(); workshopSession = null; workshopPreview = null;
  if ($('workshop-dialog').open) $('workshop-dialog').close();
}
function workshopSettings() {
  const bassOnly = $('workshop-mode').value === 'bass';
  return { mode: bassOnly ? 'bass' : 'ensemble', style: $('workshop-style').value, bassPattern: $('workshop-bass').value,
    harmony: bassOnly ? 'existing' : $('workshop-source').value,
    targets: bassOnly ? [false, true, false] : ['workshop-chords', 'workshop-bass-target', 'workshop-drums'].map(id => $(id).checked), enable: $('workshop-enable').checked };
}
function renderWorkshopPreview() {
  if (!workshopSession) return;
  const session = workshopSession;
  $('workshop-original').disabled = !hasAudibleNotes(session.base, session.start, session.start + GROUP_SIZE);
  $('workshop-candidate').disabled = !session.candidate || !hasAudibleNotes(session.candidate, session.start, session.start + GROUP_SIZE);
  $('workshop-original').setAttribute('aria-pressed', String(workshopPreview === 'original'));
  $('workshop-candidate').setAttribute('aria-pressed', String(workshopPreview === 'candidate'));
  $('workshop-stop').disabled = workshopPreview === null;
}
function updateWorkshop() {
  if (!workshopSession) return;
  preview.stop(); workshopPreview = null; workshopSession.request++;
  const session = workshopSession, bassOnly = $('workshop-mode').value === 'bass';
  $('workshop-dialog').classList.toggle('ensemble', !bassOnly);
  $('workshop-style-field').hidden = $('workshop-source-field').hidden = $('workshop-targets').hidden = bassOnly;
  if (!bassOnly && !$('workshop-chords').checked) $('workshop-source').value = 'existing';
  $('workshop-source').disabled = !bassOnly && !$('workshop-chords').checked;
  const options = workshopSettings(); session.settings = options; session.candidate = null;
  $('workshop-bass').disabled = !options.targets[1];
  $('workshop-bass-hint').textContent = options.targets[1] ? bassPatternInfo(options.bassPattern).hint + '每小节首个和弦前和全空小节留白。' : '贝斯保持原样；可勾选贝斯一起搭配。';
  $('workshop-summary').replaceChildren(); $('workshop-warning').textContent = '';
  try {
    const next = generateAccompaniment(session.base, session.start, options); session.candidate = next;
    const details = [];
    const count = (value, track) => value.tracks[track].bars.slice(session.start, session.start + GROUP_SIZE).flat().reduce((n, pitch) => n + (track === 3 ? Number(pitch > 0) : Number(pitch >= 0)), 0);
    if (options.targets[0]) details.push(options.harmony === 'style' ? `和弦：${next.tracks[1].bars.slice(session.start, session.start + GROUP_SIZE).map(bar => chordName(next, bar[0])).join(" → ")}，${chordStyleInfo(next.sections[session.start / GROUP_SIZE].chordStyle).name}。` : `和弦：保留现有音符，改用${chordStyleInfo(next.sections[session.start / GROUP_SIZE].chordStyle).name}。`);
    if (options.targets[1]) details.push(`贝斯：${count(session.base, 2)} → ${count(next, 2)} 个音符，${bassPatternInfo(options.bassPattern).name}。`);
    if (options.targets[2]) details.push(`鼓点：填入${accompanimentStyleInfo(options.style).name}节奏，并在最后一小节加过门。`);
    if (options.enable) details.push('本段开启所选声部。');
    details.push('旋律、其他段落与整曲设置保留。');
    $('workshop-summary').replaceChildren(...details.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    const warnings = [];
    const muted = options.targets.flatMap((chosen, index) => chosen && !trackAudibleAt(next, index + 1, session.start) ? [TRACKS[index + 1].name] : []);
    if (muted.length) warnings.push(`${muted.join('、')}当前静音：请检查整曲开关、音量及本段开关。`);
    if (options.targets[1]) { const silent = next.tracks[1].bars.slice(session.start, session.start + GROUP_SIZE).filter(bar => !harmonicRuns(bar).length).length; if (silent) warnings.push(`${silent} 个空白和弦小节的贝斯将留白。`); }
    $('workshop-warning').textContent = warnings.join(' ');
    const same = JSON.stringify(next) === session.serialized;
    $('workshop-apply').disabled = same;
    $('workshop-message').textContent = same ? '候选与原版相同，调整设置后再试。' : '候选已准备好，尚未改动作品。可先试听比较，再应用。';
  } catch (error) {
    $('workshop-apply').disabled = true; $('workshop-message').textContent = error.message;
  }
  renderWorkshopPreview();
}
$('open-workshop').addEventListener('click', () => {
  if (exporting) return;
  stop();
  const start = Math.floor(follower.selectedBar / GROUP_SIZE) * GROUP_SIZE, base = clone(state);
  workshopSession = { base, start, serialized: JSON.stringify(base), candidate: null, settings: null, request: 0 };
  workshopPreview = null;
  $('workshop-range').textContent = `「${base.sections[start / GROUP_SIZE].name}」· 第 ${start + 1}–${start + GROUP_SIZE} 小节`;
  updateWorkshop(); $('workshop-dialog').showModal();
});
$('close-workshop').addEventListener('click', closeWorkshop);
$('workshop-dialog').addEventListener('cancel', closeWorkshop);
$('workshop-dialog').addEventListener('close', () => { if (!$('workshop-dialog').open) closeWorkshop(); });
for (const id of ['workshop-bass', 'workshop-source', 'workshop-chords', 'workshop-bass-target', 'workshop-drums', 'workshop-enable']) $(id).addEventListener('change', updateWorkshop);
$('workshop-mode').addEventListener('change', () => { if ($('workshop-mode').value === 'ensemble') $('workshop-bass').value = accompanimentStyleInfo($('workshop-style').value).bass; updateWorkshop(); });
$('workshop-style').addEventListener('change', () => { $('workshop-bass').value = accompanimentStyleInfo($('workshop-style').value).bass; updateWorkshop(); });
async function auditionWorkshop(kind) {
  const session = workshopSession; if (!session) return;
  preview.stop(); const request = ++session.request;
  const value = kind === 'original' ? session.base : session.candidate;
  if (!value) return;
  $('workshop-message').textContent = `正在准备${kind === 'original' ? '原版' : '候选'}四小节试听…`;
  try {
    const started = await preview.playSection(value, session.start, active => {
      if (workshopSession !== session || session.request !== request) return;
      workshopPreview = active ? kind : null; renderWorkshopPreview();
      $('workshop-message').textContent = active ? `正在试听${kind === 'original' ? '原版' : '候选'}，作品尚未改动。` : '试听已停止，作品内容保留。';
    });
    if (!started && workshopSession === session && session.request === request && workshopPreview === null) $('workshop-message').textContent = '当前声部无可听内容，请检查本段开关、整曲开关及音量。';
  } catch {
    if (workshopSession === session && session.request === request) $('workshop-message').textContent = '浏览器未能启动试听；候选保留，可重试或应用后播放。';
  }
}
$('workshop-original').addEventListener('click', () => auditionWorkshop('original'));
$('workshop-candidate').addEventListener('click', () => auditionWorkshop('candidate'));
$('workshop-stop').addEventListener('click', () => { preview.stop(); if (workshopSession) workshopSession.request++; });
$('workshop-apply').addEventListener('click', () => {
  const session = workshopSession; if (!session?.candidate) return;
  preview.stop();
  const next = clone(session.candidate), options = session.settings;
  const apply = () => {
    if (workshopSession !== session || JSON.stringify(state) !== session.serialized) { closeWorkshop(); status('作品已变化，请重新打开伴奏工坊生成候选。'); return; }
    closeWorkshop(); selectedNote = null;
    commit(next, `伴奏已应用到第 ${session.start + 1}–${session.start + GROUP_SIZE} 小节；旋律保留，可继续编辑，撤销可恢复。`);
  };
  const existing = options.targets.some((chosen, index) => chosen && session.base.tracks[index + 1].bars.slice(session.start, session.start + GROUP_SIZE).some(bar => bar.some(n => index === 2 ? n > 0 : n >= 0)));
  if (existing) {
    const replaced = options.targets.flatMap((chosen, index) => chosen && (index !== 0 || options.harmony === 'style') ? [TRACKS[index + 1].name] : []);
    const detail = replaced.length ? `${replaced.join('、')}将替换为候选音符。` : '';
    confirmChange(`将更新第 ${session.start + 1}–${session.start + GROUP_SIZE} 小节的所选伴奏。${detail}${options.targets[0] && options.harmony === 'existing' ? '和弦音符保留，只改变演奏方式。' : ''}旋律与其他段落保留，之后可撤销。`, apply, '应用伴奏');
  } else apply();
});

function closeMelodyWorkshop() {
  preview.stop(); melodySession = null; melodyPreview = null;
  if ($('melody-dialog').open) $('melody-dialog').close();
}
function melodySettings() {
  return { mode: $('melody-mode').value, style: $('melody-style').value, density: $('melody-density').value, range: $('melody-range').value, variant: melodySession.variant, enable: $('melody-enable').checked };
}
function renderMelodyPreview() {
  const session = melodySession; if (!session) return;
  $('melody-original').disabled = !hasAudibleNotes(session.base, session.start, session.start + GROUP_SIZE);
  $('melody-candidate').disabled = !session.candidate || !hasAudibleNotes(session.candidate, session.start, session.start + GROUP_SIZE);
  for (const kind of ['original', 'candidate']) $('melody-' + kind).setAttribute('aria-pressed', String(melodyPreview === kind));
  $('melody-stop').disabled = melodyPreview === null;
}
function updateMelodyWorkshop() {
  const session = melodySession; if (!session) return;
  preview.stop(); melodyPreview = null; session.request++;
  const options = melodySettings(), target = melodyTarget(session.start, options.mode); session.settings = options; session.candidate = null;
  $('melody-density').disabled = options.mode === 'repitch';
  $('melody-variant').textContent = `候选 ${session.variant + 1}`;
  $('melody-hint').textContent = options.mode === 'repitch' ? '保留所有起点、休止、时长和力度；密度设置不影响本模式。' : options.mode === 'answer' ? '前两小节原样保留，借用原句的起伏续写后两小节。' : melodyStyleInfo(options.style).hint + '重拍优先选择当前和弦内的音，句尾作收束。';
  $('melody-summary').replaceChildren(); $('melody-bars').replaceChildren(); $('melody-warning').textContent = '';
  try {
    const next = generateMelody(session.base, session.start, options); session.candidate = next;
    const count = value => value.tracks[0].bars.slice(target.start, target.end).flat().filter(n => n >= 0).length;
    const details = [`第 ${target.start + 1}–${target.end} 小节旋律：${count(session.base)} → ${count(next)} 个音符。`, options.mode === 'repitch' ? '只调整音高，节奏、时长与力度保留。' : options.mode === 'answer' ? '前两小节旋律原样保留。' : '四小节采用所选风格与密度重新谱写。', '伴奏、其他段落及整曲设置保留。'];
    if (options.enable) details.push('本段开启旋律。');
    $('melody-summary').replaceChildren(...details.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    for (let bar = session.start; bar < session.start + GROUP_SIZE; bar++) {
      const notes = next.tracks[0].bars[bar].filter(n => n >= 0), card = document.createElement('div'), label = document.createElement('b'), amount = document.createElement('small'), span = document.createElement('small');
      card.className = 'melody-bar'; label.textContent = `第 ${bar + 1} 小节${bar < target.start ? ' · 保留' : ''}`; amount.textContent = `${notes.length} 个音符`;
      span.textContent = notes.length ? `${pitchName(next, 0, notes[0], 'notes')} → ${pitchName(next, 0, notes.at(-1), 'notes')}` : '休止'; card.append(label, amount, span); $('melody-bars').append(card);
    }
    const warnings = [];
    const harmony = melodyHarmonyInfo(next, target.start, target.end);
    if (harmony.emptyBars) warnings.push(`${harmony.emptyBars} 个无和弦小节按当前音阶谱写；已有伴奏保留。`);
    if (harmony.unmatchedChords.length) warnings.push(`${harmony.unmatchedChords.map(id => chordName(next, id)).join('、')}与当前音阶没有共同音，相关旋律优先使用音阶内音。`);
    if (!trackAudibleAt(next, 0, session.start)) warnings.push('旋律当前静音，请检查整曲开关、音量及本段开关。');
    if (options.mode === 'answer') {
      const preserved = next.tracks[0].bars.slice(session.start, session.start + 2).flat().filter(n => n >= 0);
      if (preserved.some(n => !inScale(next, n) || (options.range === 'low' && PITCH_VALUES[n] > 12) || (options.range === 'high' && PITCH_VALUES[n] < 12))) warnings.push('保留的原句含音阶外或生成音域外的音，已原样保留。');
    }
    $('melody-warning').textContent = warnings.join(' ');
    const same = JSON.stringify(next) === session.serialized; $('melody-apply').disabled = same; $('melody-next').disabled = false;
    $('melody-message').textContent = same ? '候选与原版相同，可以换一版或调整设置。' : '候选已准备好；反复试听保持同一版，尚未改动作品。';
  } catch (error) {
    $('melody-apply').disabled = $('melody-next').disabled = true; $('melody-message').textContent = error.message;
  }
  renderMelodyPreview();
}
$('open-melody').addEventListener('click', () => {
  if (exporting) return; stop();
  const start = Math.floor(follower.selectedBar / GROUP_SIZE) * GROUP_SIZE, base = clone(state);
  melodySession = { base, start, serialized: JSON.stringify(base), candidate: null, settings: null, variant: 0, request: 0 }; melodyPreview = null;
  $('melody-range-label').textContent = `「${base.sections[start / GROUP_SIZE].name}」· 第 ${start + 1}–${start + GROUP_SIZE} 小节 · ${keyName(base.transpose)} ${scaleInfo(base.scale).name}`;
  updateMelodyWorkshop(); $('melody-dialog').showModal();
});
$('close-melody').addEventListener('click', closeMelodyWorkshop);
$('melody-dialog').addEventListener('cancel', closeMelodyWorkshop);
$('melody-dialog').addEventListener('close', () => { if (!$('melody-dialog').open) closeMelodyWorkshop(); });
for (const id of ['melody-mode', 'melody-style', 'melody-density', 'melody-range', 'melody-enable']) $(id).addEventListener('change', updateMelodyWorkshop);
$('melody-next').addEventListener('click', () => { if (!melodySession) return; melodySession.variant = (melodySession.variant + 1) >>> 0; updateMelodyWorkshop(); });
async function auditionMelody(kind) {
  const session = melodySession; if (!session) return;
  preview.stop(); const request = ++session.request, value = kind === 'original' ? session.base : session.candidate; if (!value) return;
  $('melody-message').textContent = `正在准备${kind === 'original' ? '原版' : '候选'}四小节试听…`;
  try {
    const started = await preview.playSection(value, session.start, active => {
      if (melodySession !== session || session.request !== request) return;
      melodyPreview = active ? kind : null; renderMelodyPreview();
      $('melody-message').textContent = active ? `正在试听${kind === 'original' ? '原版' : '候选 ' + (session.variant + 1)}，作品尚未改动。` : '试听已停止，作品内容保留。';
    });
    if (!started && melodySession === session && session.request === request && melodyPreview === null) $('melody-message').textContent = '当前没有可听内容，请检查声部开关及音量。';
  } catch { if (melodySession === session && session.request === request) $('melody-message').textContent = '浏览器未能启动试听，候选保留，可以重试。'; }
}
$('melody-original').addEventListener('click', () => auditionMelody('original'));
$('melody-candidate').addEventListener('click', () => auditionMelody('candidate'));
$('melody-stop').addEventListener('click', () => { preview.stop(); if (melodySession) melodySession.request++; });
$('melody-apply').addEventListener('click', () => {
  const session = melodySession; if (!session?.candidate) return; preview.stop();
  const next = clone(session.candidate), options = session.settings, target = melodyTarget(session.start, options.mode);
  const apply = () => {
    if (melodySession !== session || JSON.stringify(state) !== session.serialized) { closeMelodyWorkshop(); status('作品已变化，请重新打开旋律工坊生成候选。'); return; }
    closeMelodyWorkshop(); selectedNote = null; selectedTrack = 0; pitchRange = options.range;
    const message = `旋律已应用到第 ${target.start + 1}–${target.end} 小节；伴奏保留，可继续编辑，撤销可恢复。`;
    commit(next, message); selectBar(target.start); savePreferences(message);
  };
  if (session.base.tracks[0].bars.slice(target.start, target.end).some(bar => bar.some(n => n >= 0))) confirmChange(`将${options.mode === 'repitch' ? '调整' : '替换'}第 ${target.start + 1}–${target.end} 小节的旋律${options.mode === 'repitch' ? '音高，节奏、时长与力度保留' : '音符'}。${options.mode === 'answer' ? '前两小节原样保留。' : ''}伴奏与其他段落保留，之后可以撤销。`, apply, '应用旋律'); else apply();
});

$('editor-view').addEventListener('change',e=>{preview.stop();selectedNote=null;editorView=e.target.value==='phrase'?'phrase':'bar';renderControls();renderGrid();syncPlayback();savePreferences(editorView==='phrase'?'已打开四小节编辑台；旋律、贝斯和鼓点分别显示自己的编辑网格。':'已回到单小节积木视图；作品内容保留。');});
