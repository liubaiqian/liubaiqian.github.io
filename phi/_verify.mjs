// 临时验证脚本：在 Node 里用最小 DOM/WebAudio 桩运行 player.html 的内联脚本，
// 检查「解析 → 判定线事件 → 局部坐标渲染 → 速度事件 → 音效 → 暂停 → 音乐同步」。
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('player.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('未找到内联脚本');
const code = m[1];

/* ---------- canvas 2d 桩：记录所有调用 ---------- */
const DATA_PROPS = new Set(['fillStyle', 'strokeStyle', 'font', 'lineWidth', 'textBaseline', 'globalAlpha', 'lineCap', 'textAlign', 'filter']);
const records = [];
const ctxTarget = {};
const ctx = new Proxy(ctxTarget, {
  get(t, p) {
    if (DATA_PROPS.has(p)) return t[p];
    if (!(p in t)) t[p] = (...args) => records.push({ op: p, args, fillStyle: t.fillStyle, strokeStyle: t.strokeStyle, globalAlpha: t.globalAlpha, filter: t.filter, font: t.font });
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; },
});

/* ---------- Audio / URL 桩 ---------- */
const audioInstances = [];
class AudioStub {
  constructor(src) {
    this.src = src || '';
    this._time = 0;
    this._t0 = null;                 // 开始播放时的 fakeNow
    this.paused = true;
    this.readyState = 4;
    this.duration = 0;
    this.error = null;
    this.preload = '';
    audioInstances.push(this);
  }
  // 播放中 currentTime 跟随假时钟前进（与真实 Audio 行为一致）
  get currentTime() {
    return this._t0 === null ? this._time : this._time + (fakeNow - this._t0) / 1000;
  }
  set currentTime(v) {
    this._time = v;
    this._t0 = this.paused ? null : fakeNow;
  }
  play() {
    this.paused = false;
    this._t0 = fakeNow;
    this.playCount = (this.playCount || 0) + 1;
    return Promise.resolve();
  }
  pause() {
    this._time = this.currentTime;
    this._t0 = null;
    this.paused = true;
  }
  addEventListener(type, fn) { (this._listeners || (this._listeners = {}))[type] = fn; }
  fire(type) { const f = this._listeners && this._listeners[type]; if (f) f(); }
}
let blobSeq = 0;
const URLStub = {
  createObjectURL: (file) => 'blob:fake-' + (++blobSeq) + '-' + (file && file.name),
  revokeObjectURL: () => {},
};

/* ---------- DOM 桩 ---------- */
let onFileChange = null, onMusicChange = null, onPlayClick = null, onPauseClick = null, onKeyDown = null;
const statusEl = { textContent: '', classList: { toggle() {} } };
const diagEl = { textContent: '' };
const playButton = { disabled: true, textContent: '', classList: { toggle() {} }, blur() {}, addEventListener(t, fn) { if (t === 'click') onPlayClick = fn; } };
const pauseButton = { disabled: true, textContent: '暂停', classList: { toggle() {} }, blur() {}, addEventListener(t, fn) { if (t === 'click') onPauseClick = fn; } };
const fileInput = { files: [], addEventListener(t, fn) { if (t === 'change') onFileChange = fn; } };
const musicInput = { files: [], addEventListener(t, fn) { if (t === 'change') onMusicChange = fn; } };
let onFlipSides = null, onIgnoreSpeed = null, onZoom = null;
const flipEl = { checked: false, addEventListener(t, fn) { if (t === 'change') onFlipSides = fn; } };
const ignoreSpeedEl = { checked: false, addEventListener(t, fn) { if (t === 'change') onIgnoreSpeed = fn; } };
const zoomEl = { value: '1', addEventListener(t, fn) { if (t === 'input') onZoom = fn; } };
const zoomLabelEl = { textContent: '×1.00' };
let onSeekInput = null, onSeekChange = null;
const seekEl = { value: '0', max: '100', addEventListener(t, fn) { if (t === 'input') onSeekInput = fn; if (t === 'change') onSeekChange = fn; } };
const seekLabelEl = { textContent: '0.00 s' };
let onFitClick = null;
const fitButton = { blur() {}, addEventListener(t, fn) { if (t === 'click') onFitClick = fn; } };
let onCullFar = null;
const cullFarEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onCullFar = fn; } };
let onShowHud = null, onShowDiag = null, onShowCombo = null;
const showHudEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onShowHud = fn; } };
const showDiagEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onShowDiag = fn; } };
const showComboEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onShowCombo = fn; } };
let onShowAcc = null;
const showAccEl = { checked: false, addEventListener(t, fn) { if (t === 'change') onShowAcc = fn; } };

let onSfxChange = null, onSongImageChange = null, onArtBlur = null, onClearImageClick = null, onRetroSfx = null;
const sfxEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onSfxChange = fn; } };
const retroSfxEl = { checked: false, addEventListener(t, fn) { if (t === 'change') onRetroSfx = fn; } };
const songImageInput = { files: [], addEventListener(t, fn) { if (t === 'change') onSongImageChange = fn; } };
const artBlurEl = { value: '4', addEventListener(t, fn) { if (t === 'input') onArtBlur = fn; } };
const artBlurLabelEl = { textContent: '4px' };
const clearImageButton = { blur() {}, addEventListener(t, fn) { if (t === 'click') onClearImageClick = fn; } };

let onHitFxChange = null, onNoteScale = null;
const hitFxEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onHitFxChange = fn; } };
const noteScaleEl = { value: '1', addEventListener(t, fn) { if (t === 'input') onNoteScale = fn; } };
const noteScaleLabelEl = { textContent: '×1.00' };
let onChordBorder = null, onAutoJudge = null;
const chordBorderEl = { checked: true, addEventListener(t, fn) { if (t === 'change') onChordBorder = fn; } };
const autoJudgeEl = { value: 'perfect', addEventListener(t, fn) { if (t === 'change') onAutoJudge = fn; } };
let onNoteTexture = null;
// 测试里默认关闭音符贴图 → 几何测试走简单色块；需要时再打开验证贴图
const noteTextureEl = { checked: false, addEventListener(t, fn) { if (t === 'change') onNoteTexture = fn; } };
let onTitleInput = null, onDifficultyInput = null;
const titleInput = { value: '', addEventListener(t, fn) { if (t === 'input') onTitleInput = fn; } };
const difficultyInput = { value: '', addEventListener(t, fn) { if (t === 'input') onDifficultyInput = fn; } };

// Image 桩：给 src 赋值即同步触发 onload；音符贴图按真实文件的尺寸报告
const NOTE_IMG_SIZES = {
  'tap.png': [989, 100], 'tapHL.png': [1089, 200],
  'drag.png': [989, 60], 'dragHL.png': [1089, 160],
  'flick.png': [989, 200], 'flickHL.png': [1089, 300],
  'hold.png': [989, 2000], 'holdHL.png': [1062, 2048],
};
class ImageStub {
  constructor() {
    this.naturalWidth = 1000;
    this.naturalHeight = 1000;
    this.complete = true;
    this.isImageStub = true;
    this._src = '';
  }
  set src(v) {
    this._src = v;
    for (const name of Object.keys(NOTE_IMG_SIZES)) {
      if (String(v).endsWith(name)) {
        this.naturalWidth = NOTE_IMG_SIZES[name][0];
        this.naturalHeight = NOTE_IMG_SIZES[name][1];
        break;
      }
    }
    if (typeof this.onload === 'function') this.onload();
  }
  get src() { return this._src; }
}

// 离屏 canvas 桩（染色用）：上下文静默，不污染绘制记录
function makeSilentCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, p) { return (p in t) ? t[p] : () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeOffscreenCanvas() {
  return { isTintedCanvas: true, width: 0, height: 0, getContext: () => makeSilentCtx() };
}
let canvasClickHandler = null;
let canvasRect = { left: 0, top: 0, width: 1600, height: 900 };
const canvasEl = {
  width: 1600,
  height: 900,
  getContext: () => ctx,
  addEventListener(t, fn) { if (t === 'click') canvasClickHandler = fn; },
  getBoundingClientRect: () => canvasRect,
};

let fakeNow = 1000;
let rafQueue = [];
let rafSeq = 0;

const sandbox = {
  console,
  document: {
    getElementById: (id) => ({ stage: canvasEl, fileInput, musicInput, playButton, pauseButton, status: statusEl, diag: diagEl, debugFlipSides: flipEl, debugIgnoreSpeed: ignoreSpeedEl, zoom: zoomEl, zoomLabel: zoomLabelEl, seek: seekEl, seekLabel: seekLabelEl, fitView: fitButton, cullFar: cullFarEl,
    showHud: showHudEl, showDiag: showDiagEl, showCombo: showComboEl, showAcc: showAccEl,
    sfx: sfxEl, retroSfx: retroSfxEl, songImageInput, artBlur: artBlurEl, artBlurLabel: artBlurLabelEl, clearSongImage: clearImageButton,
    hitFx: hitFxEl, noteScale: noteScaleEl, noteScaleLabel: noteScaleLabelEl,
    chordBorder: chordBorderEl, autoJudge: autoJudgeEl, noteTexture: noteTextureEl,
    titleInput, difficultyInput }[id]),
    createElement: () => makeOffscreenCanvas(),
  },
  performance: { now: () => fakeNow },
  requestAnimationFrame: (fn) => { rafQueue.push({ id: ++rafSeq, fn }); return rafSeq; },
  cancelAnimationFrame: (id) => { rafQueue = rafQueue.filter(j => j.id !== id); },
  Audio: AudioStub,
  Image: ImageStub,
  URL: URLStub,
  window: { addEventListener(t, fn) { if (t === 'keydown') onKeyDown = fn; } },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

/* ---------- 工具 ---------- */
const checks = [];
const assert = (name, cond, extra = '') => checks.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const alphaOf = (r) => (r.globalAlpha === undefined ? 1 : r.globalAlpha);
// 打击特效 = 判定色（Perfect 黄 / Good 蓝 / Miss 红）的 strokeRect，用来和多押金边区分
const FX_COLORS = ['#FFE14D', '#4DA6FF', '#FF5A5A'];
const isFx = (r) => r.op === 'strokeRect' && FX_COLORS.includes(r.strokeStyle);
// 帧图特效：drawImage(图片, x, y, 260, 260)
const isFxDraw = (r) => r.op === 'drawImage' && near(r.args[3], 260) && near(r.args[4], 260);
const hasRect = (x, y, w, h, color, alpha) => records.some(r =>
  r.op === 'fillRect' && near(r.args[0], x) && near(r.args[1], y) && r.args[2] === w && near(r.args[3], h) &&
  (!color || r.fillStyle === color) && (alpha === undefined || near(alphaOf(r), alpha, 1e-9)));
const hasNoNoteRectAt = (x) => !records.some(r => r.op === 'fillRect' && near(r.args[0], x) && r.args[2] === 90 && r.args[3] === 20);
const hasTranslate = (x, y) => records.some(r => r.op === 'translate' && near(r.args[0], x) && near(r.args[1], y));
const hasRotate = (rad) => records.some(r => r.op === 'rotate' && near(r.args[0], rad, 1e-9));
const sfxCount = (file) => audioInstances.filter(a => a.src.includes(file)).reduce((n, a) => n + (a.playCount || 0), 0);

function runFrameIn(deltaMs) {
  fakeNow += deltaMs;
  records.length = 0;
  const jobs = rafQueue; rafQueue = [];
  for (const job of jobs) job.fn(fakeNow);
}
async function uploadChart(fileName, text) {
  const f = { name: fileName, text: async () => text };
  fileInput.files = [f];
  await onFileChange({ target: { files: [f] } });
  return statusEl.textContent;
}
const readSample = (name) => fs.readFileSync(name, 'utf8');
const PI = Math.PI;

/* =====================================================================
 * A. sample-chart.json（两条判定线、上下两侧音符、长条、无旋转）
 * ===================================================================== */
const statusA = await uploadChart('sample-chart.json', readSample('sample-chart.json'));
console.log('[A 状态栏] ' + statusA);
assert('A 解析：14 个音符（Tap 7 / Drag 3 / Flick 3 / Hold 1）',
  /音符 14 个/.test(statusA) && /Tap 7/.test(statusA) && /Drag 3/.test(statusA) &&
  /Flick 3/.test(statusA) && /Hold 1/.test(statusA), statusA);
assert('A 状态栏不再输出「末音符 / 多押 / floorPosition 校验」这些调试信息',
  !/最后一个音符|多押 \d+ 个|floorPosition/.test(statusA), statusA);
assert('A 末音符与 floorPosition 校验改到诊断面板里输出',
  /末音符 9\.000 s/.test(diagEl.textContent) &&
  /【校验】floorPosition：14 个样本，与自算积分完全一致/.test(diagEl.textContent), '');
assert('A 解析后 play 可用 / pause 禁用', playButton.disabled === false && pauseButton.disabled === true, '');
console.log('[A 诊断面板]\n' + diagEl.textContent);
assert('A 诊断面板：谱面概况（上 9 / 下 5、线 2 条）',
  /【谱面】formatVersion=3[\s\S]*判定线 2 条[\s\S]*（上 9 \/ 下 5）/.test(diagEl.textContent), '');
assert('A 诊断面板：全局音符分布（首音符 1.000s / 末音符 9.000s）',
  /【全局】首音符 1\.000 s\s+末音符 9\.000 s\s+未来 2s 内音符 \d+ 个/.test(diagEl.textContent),
  diagEl.textContent.split('\n').find(l => l.startsWith('【全局】')) || '');
assert('A 时间轴 max 设为末音符 + 1 = 10', seekEl.max === '10', seekEl.max);
assert('A 诊断面板：线0 的 bpm、速度事件、事件列表、未来音符',
  /【线0】bpm=120/.test(diagEl.textContent) && /速度 1 个/.test(diagEl.textContent) &&
  /移动 1 个/.test(diagEl.textContent) && /未来 \d+ 个音符/.test(diagEl.textContent) &&
  /距判定线=/.test(diagEl.textContent), '');

fakeNow = 1000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                       // t = 1.00 s
console.log('[A t=1.0 音符] ' + JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1], r.args[3]])));
assert('A 打击音效：Tap(time=64→1.0s) 响了 1 次', sfxCount('Tap.wav') === 1, '实际 ' + sfxCount('Tap.wav'));
assert('A 官方规则：相对地板位置 = 0 的音符（time=64→1.0s，恰在判定线上）仍然渲染',
  hasRect(-45, -10, 90, 20, '#1E90FF'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1]])));

runFrameIn(1000);                       // t = 2.00 s
console.log('[A t=2.0 判定线] ' + JSON.stringify(records.filter(r => r.op === 'translate').map(r => r.args)));
assert('A 判定线位置（官方原点在左下角、y 轴向上）：线1 值(0.5,0.5) → 屏幕(800,450)；线2 值(0.5,0.25) → 屏幕(800,675)',
  hasTranslate(800, 450) && hasTranslate(800, 675), JSON.stringify(records.filter(r => r.op === 'translate').map(r => r.args)));
const halfLine = 5.76 * 900 / 2;   // 官方实测：判定线长 = 5.76 × 画面高 → 半长 2592
assert('A 判定线本体：局部坐标下从 −2592 到 +2592（5.76 × 画面高）',
  records.some(r => r.op === 'moveTo' && near(r.args[0], -halfLine, 1e-9) && near(r.args[1], 0)) &&
  records.some(r => r.op === 'lineTo' && near(r.args[0], halfLine, 1e-9) && near(r.args[1], 0)), '');
assert('A 旋转事件缺失时角度为 0', hasRotate(0), JSON.stringify(records.filter(r => r.op === 'rotate').map(r => r.args)));

assert('A 长条：time=4.0s、holdTime=64(1.0s)、speed=1 → 长度 1.0×1.0×540 = 540px，位于判定线上方 1080~1620px',
  hasRect(-45, -1620, 90, 540, '#1E90FF'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90 && r.args[3] > 20).map(r => [r.args[0], r.args[1], r.args[3]])));
assert('A Flick(time=3.0s, positionX=2)：离判定线 540px，局部 (−45+180, −540−10)',
  hasRect(135, -550, 90, 20, '#FF3B3B'), '');
assert('A 官方规则：time=2.0s 的 Drag 此刻相对位置 = 0，停在判定线上仍然渲染',
  hasRect(-225, -10, 90, 20, '#FFD400'), '');
assert('A 线上方音符的局部 y 为负、下方为正：线2 的下方 Tap(time=3.75s) 局部 y = +945−10',
  hasRect(90, 935, 90, 20, '#1E90FF'), '');
assert('A 官方 2H 剔除（默认开）：距离 2160px 的 Tap(time=6.0s) 不渲染',
  !hasRect(315, -2170, 90, 20), '');
records.length = 0;
cullFarEl.checked = false; onCullFar();
assert('A 关掉 2H 剔除（全部渲染）：该音符被画出来（局部 y=−2170）',
  hasRect(315, -2170, 90, 20, '#1E90FF'), '');
records.length = 0;
cullFarEl.checked = true; onCullFar();
assert('A 重新打开 2H 剔除后恢复官方渲染', !hasRect(315, -2170, 90, 20), '');

const hudLineA = records.filter(r => r.op === 'fillText').map(r => r.args[0]).find(s => s.includes('画布内')) || '';
console.log('[A 屏幕统计] ' + hudLineA);
assert('A 屏幕统计：t=2.0 时画布内有 2 个音符（线2 的 Flick + 停在判定线上的 Drag）',
  /画布内 2 ·/.test(hudLineA), hudLineA);

records.length = 0;
onFitClick({ currentTarget: fitButton });
const fitScales = records.filter(r => r.op === 'scale').map(r => r.args[0]);
console.log('[A 适应视图] scale=' + JSON.stringify(fitScales));
assert('A 适应视图：自动缩小到能把本帧全部音符框进画面（0.002 < scale < 1）',
  fitScales.length === 1 && fitScales[0] > 0.002 && fitScales[0] < 1, JSON.stringify(fitScales));
assert('A 适应视图后诊断面板给出屏幕包围盒',
  /【屏幕】本帧画出 \d+ 个音符，其中落在画布内 \d+ 个\s+包围盒 x\[/.test(diagEl.textContent),
  (diagEl.textContent.split('\n').find(l => l.startsWith('【屏幕】')) || ''));
records.length = 0;
zoomEl.value = '1'; onZoom();   // 复原，后面的断言按 ×1 计算

/* ---------- A1b. 缩放：把屏幕外的东西露出来 ---------- */
records.length = 0;
zoomEl.value = '0.5'; onZoom();
console.log('[A 缩放] ' + JSON.stringify(records.filter(r => r.op === 'scale').map(r => r.args)));
assert('A 缩放到 ×0.5 时对画布应用 scale(0.5, 0.5)',
  records.some(r => r.op === 'scale' && near(r.args[0], 0.5) && near(r.args[1], 0.5)), '');
assert('A 缩放时画出真实屏幕边界（1600×900 虚线矩形）',
  records.some(r => r.op === 'strokeRect' && r.args[2] === 1600 && r.args[3] === 900), '');
assert('A 缩放不改变绘制内容（本来就是全部渲染）',
  hasRect(315, -2170, 90, 20, '#1E90FF'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1]])));
records.length = 0;
zoomEl.value = '1'; onZoom();
assert('A 缩放回到 ×1.0 后不再画屏幕边界',
  !records.some(r => r.op === 'strokeRect' && near(r.args[2], 1600) && near(r.args[3], 900)), '');

/* ---------- A2. 非 Hold 音符的 speed 倍率 ---------- */
runFrameIn(200);                        // t = 2.20 s
assert('A 越过判定线后隐藏：Drag(time=2.0s) 相对地板位置 −0.2 < −0.001 → 不再渲染',
  !hasRect(-225, -10, 90, 20), '');
runFrameIn(5800);                       // t = 8.00 s
const flickAt8 = records.filter(r => r.op === 'fillRect' && r.args[2] === 90 && r.args[3] === 20)
  .map(r => [r.args[0], r.args[1], r.fillStyle]);
console.log('[A t=8.0 音符] ' + JSON.stringify(flickAt8));
assert('A speed=2 的 Flick(time=9.0s)：地板距离 540px，视觉距离 540×2 = 1080px（局部 y=+1080−10）',
  hasRect(-225, 1070, 90, 20, '#FF3B3B'), JSON.stringify(flickAt8));

const combosAt8 = records.filter(r => r.op === 'fillText' && near(r.args[1], 800)).map(r => r.args[0]);
console.log('[A Combo] ' + JSON.stringify(combosAt8));
assert('A Combo：t=8.0 s 时 13 个音符已到线 → 顶部居中显示「13」与「combo」',
  combosAt8.includes('13') && combosAt8.includes('combo'), JSON.stringify(combosAt8));
assert('A Combo 数字在 combo 字样上方（数字 y=64、combo y=100）',
  records.some(r => r.op === 'fillText' && r.args[0] === '13' && near(r.args[1], 800) && near(r.args[2], 64)) &&
  records.some(r => r.op === 'fillText' && r.args[0] === 'combo' && near(r.args[1], 800) && near(r.args[2], 100)), '');

// —— 实时分数 / Acc ——
const liveScoreTexts = records.filter(r => r.op === 'fillText' && r.args[1] === 1560).map(r => String(r.args[0]));
console.log('[A 实时分数] ' + JSON.stringify(liveScoreTexts));
assert('A 游玩界面右上角实时显示分数（官方补零格式）：13/14 个 Perfect → 0928571',
  liveScoreTexts.includes('0928571'), JSON.stringify(liveScoreTexts));
assert('A Acc 默认关闭：分数下方不显示百分比',
  !liveScoreTexts.some(s => s.endsWith('%')), JSON.stringify(liveScoreTexts));

records.length = 0;
showAccEl.checked = true; onShowAcc();
const accTexts = records.filter(r => r.op === 'fillText' && r.args[1] === 1560).map(r => String(r.args[0]));
console.log('[A Acc] ' + JSON.stringify(accTexts));
assert('A 打开 Acc 后显示在分数下方（y=84）：92.8571%',
  accTexts.includes('92.8571%') &&
  records.some(r => r.op === 'fillText' && r.args[0] === '92.8571%' && near(r.args[2], 84)),
  JSON.stringify(accTexts));
records.length = 0;
showAccEl.checked = false; onShowAcc();

// —— 顶部进度条 / 时间 / 时间轴同步 ——
const barFills = records.filter(r => r.op === 'fillRect' && r.args[1] === 0 && near(r.args[3], 4)).map(r => [r.args[2], r.fillStyle]);
console.log('[A 进度条] ' + JSON.stringify(barFills));
assert('A 顶部白色细进度条：轨道满宽 + 已播放部分宽 = 1600 × 8/10.5',
  barFills.some(r => near(r[0], 1600)) &&
  barFills.some(r => r[1] === 'rgba(255,255,255,.92)' && near(r[0], 1600 * 8 / 10.5, 2)),
  JSON.stringify(barFills));

assert('A 左上角不再显示秒数（已删除）',
  !records.some(r => r.op === 'fillText' && near(r.args[1], 40) && String(r.args[0]).endsWith(' s')), '');

// —— 底部曲名 / 难度 ——
const bottomTexts = records.filter(r => r.op === 'fillText' && near(r.args[2], 874)).map(r => String(r.args[0]));
console.log('[A 底部信息] ' + JSON.stringify(bottomTexts));
assert('A 左下角曲名：没有音频文件、输入框留空 → unknown',
  bottomTexts.includes('unknown'), JSON.stringify(bottomTexts));
assert('A 左下角 | 符号（稍粗，x=40）',
  records.some(r => r.op === 'fillText' && r.args[0] === '|' && near(r.args[1], 40) && near(r.args[2], 874)), '');
assert('A 右下角难度：留空 → SP Lv.?',
  records.some(r => r.op === 'fillText' && r.args[0] === 'SP Lv.?' && near(r.args[1], 1560) && near(r.args[2], 874)), '');
assert('A 右下角难度字号比曲名大（22px vs 17px）',
  records.some(r => r.op === 'fillText' && r.args[0] === 'SP Lv.?' && String(r.font).startsWith('22px')) &&
  records.some(r => r.op === 'fillText' && r.args[0] === 'unknown' && String(r.font).startsWith('17px')),
  JSON.stringify(records.filter(r => r.op === 'fillText' && near(r.args[2], 874)).map(r => [String(r.args[0]), r.font])));

assert('A 时间轴与进度实时同步：t=8.00 s → 滑杆值 8、标签 8.00 s',
  near(Number(seekEl.value), 8) && seekLabelEl.textContent === '8.00 s',
  seekEl.value + ' / ' + seekLabelEl.textContent);
assert('A 时间轴 max = 谱面总时长（无音乐时 = 末音符 9 + 1.5）',
  near(Number(seekEl.max), 10.5, 0.01), seekEl.max);

/* ---------- A3. 暂停 / 继续 ---------- */
onPauseClick({ currentTarget: pauseButton });
console.log('[A 状态栏] ' + statusEl.textContent);
assert('A 暂停后不再排队新帧', rafQueue.length === 0, '队列 ' + rafQueue.length);
assert('A 暂停后按钮变「继续」', pauseButton.textContent === '继续' && pauseButton.disabled === false, '');
assert('A 状态栏显示暂停时刻 8.00 s', /已暂停于 8\.00 s/.test(statusEl.textContent), statusEl.textContent);

fakeNow += 20000;
assert('A 暂停 20 s 期间画面定格（无新帧）', rafQueue.length === 0, '队列 ' + rafQueue.length);

/* ---------- A4. 调试开关 ---------- */
records.length = 0;
flipEl.checked = true; onFlipSides();
assert('A 调试开关「翻转上下侧」：同一条音符改画到判定线另一侧（+1070 → −1090）',
  hasRect(-225, -1090, 90, 20, '#FF3B3B'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1]])));
records.length = 0;
flipEl.checked = false; onFlipSides();
assert('A 关闭调试开关后恢复原样', hasRect(-225, 1070, 90, 20, '#FF3B3B'), '');

records.length = 0;
ignoreSpeedEl.checked = true; onIgnoreSpeed();
assert('A 调试开关「忽略音符 speed」：speed=2 的音符距离回到 540（局部 y=+530）',
  hasRect(-225, 530, 90, 20, '#FF3B3B'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1]])));
records.length = 0;
ignoreSpeedEl.checked = false; onIgnoreSpeed();

/* ---------- A4b. 显示开关 / Combo ---------- */
records.length = 0;
showHudEl.checked = false; onShowHud();
assert('A 设置开关：关掉调试 HUD 后画布左上角不再有文字',
  !records.some(r => r.op === 'fillText' && r.args[1] === 16), '');
records.length = 0;
showHudEl.checked = true; onShowHud();
assert('A 重新打开调试 HUD 后文字回来', records.some(r => r.op === 'fillText' && r.args[1] === 16), '');

records.length = 0;
showComboEl.checked = false; onShowCombo();
assert('A 设置开关：关掉 Combo 后不再绘制',
  !records.some(r => r.op === 'fillText' && r.args[0] === 'combo'), '');
records.length = 0;
showComboEl.checked = true; onShowCombo();
assert('A 重新打开 Combo 后恢复绘制', records.some(r => r.op === 'fillText' && r.args[0] === 'combo'), '');

showDiagEl.checked = false; onShowDiag();
assert('A 设置开关：关掉诊断面板后隐藏', diagEl.hidden === true, '');
showDiagEl.checked = true; onShowDiag();
assert('A 重新打开诊断面板后有内容', diagEl.hidden === false && diagEl.textContent.length > 0, '');

onKeyDown({ code: 'Space', preventDefault() {} });
assert('A 空格恢复后按钮变回「暂停」并重新排队', pauseButton.textContent === '暂停' && rafQueue.length === 1, '');
runFrameIn(700);                        // 恢复后墙上时钟走 0.7 s
const hudA = records.filter(r => r.op === 'fillText').map(r => r.args[0]);
assert('A 恢复后从 8.00 s 接着走 → t = 8.70 s（暂停时长不计入）',
  hudA.some(s => s === 't = 8.70 s'), JSON.stringify(hudA.slice(0, 1)));

/* ---------- A5. 时间轴定位 ---------- */
records.length = 0;
seekEl.value = '4';
onSeekInput();
console.log('[A 状态栏] ' + statusEl.textContent);
assert('A 时间轴定位：拖到 4.00 s 后暂停并定格', /已定位到 4\.00 s/.test(statusEl.textContent), statusEl.textContent);
assert('A 定位后按新时刻重绘（HUD 显示 t = 4.00 s）',
  records.filter(r => r.op === 'fillText').map(r => r.args[0]).some(s => s === 't = 4.00 s'),
  JSON.stringify(records.filter(r => r.op === 'fillText').map(r => r.args[0]).slice(0, 1)));
assert('A 定位后不再有排队帧', rafQueue.length === 0, '队列 ' + rafQueue.length);
assert('A 定位后诊断面板同步（谱面时间 t=4.000）', /谱面时间 t=4\.000/.test(diagEl.textContent), '');
const combosAt4 = records.filter(r => r.op === 'fillText' && near(r.args[1], 800)).map(r => r.args[0]);
assert('A 定位后 Combo 按时间重算：t=4.0 s 时 7 个音符已到线 → 显示「7」',
  combosAt4.includes('7'), JSON.stringify(combosAt4));
console.log('[A 诊断(t=4.0)]\n' + diagEl.textContent.split('\n').filter(l => l.startsWith('【') || l.trim().startsWith('[') || l.includes('线0】')).join('\n'));
records.length = 0;

/* ---------- A6. 左上角暂停按钮 ---------- */
records.length = 0;
onZoom();                                 // 触发一次重绘（此刻为暂停态）
assert('A6 暂停按钮画在左上角（圆角矩形 20,20,44,44）',
  records.some(r => r.op === 'roundRect' && near(r.args[0], 20) && near(r.args[1], 20) &&
                    near(r.args[2], 44) && near(r.args[3], 44)), '');
assert('A6 暂停中显示播放三角（moveTo 到按钮内的三角顶点）',
  records.some(r => r.op === 'moveTo' && near(r.args[0], 20 + 44 * 0.36) && near(r.args[1], 20 + 44 * 0.28)), '');

canvasClickHandler({ clientX: 42, clientY: 42 });     // 点在按钮内 → 继续
assert('A6 点击左上角按钮恢复播放', /播放中/.test(statusEl.textContent), statusEl.textContent);

records.length = 0;
onZoom();
assert('A6 播放中显示两条竖杠',
  records.filter(r => r.op === 'fillRect' && near(r.args[2], 44 * 0.13) && near(r.args[3], 44 * 0.44)).length === 2,
  JSON.stringify(records.filter(r => r.op === 'fillRect').map(r => [r.args[0], r.args[2], r.args[3]]).slice(0, 4)));

canvasClickHandler({ clientX: 42, clientY: 42 });     // 再点 → 暂停
assert('A6 再次点击暂停', /已暂停/.test(statusEl.textContent), statusEl.textContent);

canvasRect = { left: 0, top: 0, width: 800, height: 450 };   // 画布被 CSS 缩到一半
canvasClickHandler({ clientX: 20, clientY: 20 });     // 对应画布 (40,40) → 仍在按钮内
assert('A6 画布被缩放时坐标正确换算（800×450 上点 (20,20) = 画布 (40,40)）',
  /播放中/.test(statusEl.textContent), statusEl.textContent);
canvasRect = { left: 0, top: 0, width: 1600, height: 900 };

canvasClickHandler({ clientX: 800, clientY: 700 });   // 点在画面中下部 → 不应有任何反应
assert('A6 点击按钮以外的地方不切换暂停', /播放中/.test(statusEl.textContent), statusEl.textContent);

canvasClickHandler({ clientX: 42, clientY: 42 });     // 收回暂停态
assert('A6 结尾恢复为暂停态（不影响后续用例）', /已暂停/.test(statusEl.textContent), statusEl.textContent);

records.length = 0;

/* =====================================================================
 * H2. Hold 长按期间持续播放 P/G 特效
 * H3. 打击特效不跟随判定线（留在原地播完）
 * ===================================================================== */
const statusH2 = await uploadChart('sample-hold.json', readSample('sample-hold.json'));
console.log('[H2 状态栏] ' + statusH2);
assert('H2 解析：1 个 Hold 音符', /音符 1 个/.test(statusH2) && /Hold 1/.test(statusH2), statusH2);

fakeNow = 700000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s：Hold 头判定 → 特效 + 登记长按
assert('H2 Hold 头判定时产生特效', records.filter(isFxDraw).length > 0, '');

records.length = 0;
let maxHoldFx = 0;
for (let k = 0; k < 12; k++) {           // t = 1.0 → 1.24 s，每帧 20ms
  runFrameIn(20);
  maxHoldFx = Math.max(maxHoldFx, records.filter(isFxDraw).length);
}
console.log('[H2 1/8拍密度] ' + maxHoldFx);
assert('H2 Hold 每 1/8 拍生成一次特效（120bpm → 62.5ms）：240ms 内叠加出多个特效',
  maxHoldFx >= 3, '最多同时 ' + maxHoldFx + ' 个');

records.length = 0;
runFrameIn(1260);                        // t = 2.5 s：Hold 于 2.0 s 结束，最后一个特效也已播完
assert('H2 Hold 结束后停止播放特效（t=2.5 s 无特效）',
  records.filter(isFxDraw).length === 0, JSON.stringify(records.filter(isFxDraw).map(r => r.args)));

await uploadChart('sample-events.json', readSample('sample-events.json'));   // 线在 1.0~2.0 s 横向平移
fakeNow = 720000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s：Tap 命中 → 特效生成在 x=320
records.length = 0;
runFrameIn(300);                         // t = 1.3 s：线已移动到 x≈608，特效应仍在 320
const translates = records.filter(r => r.op === 'translate').map(r => [Math.round(r.args[0]), Math.round(r.args[1])]);
console.log('[H3 translate] ' + JSON.stringify(translates));
assert('H3 特效留在原地：t=1.3 s 仍在 translate(320,450)，而判定线已移动到 x>500',
  translates.some(t => t[0] === 320 && t[1] === 450) && translates.some(t => t[0] > 500),
  JSON.stringify(translates));

// —— 打击特效跟随缩放（在缩放变换内绘制） ——
records.length = 0;
zoomEl.value = '0.5'; onZoom();
const h3Ops = records.map(r => r.op);
console.log('[H3 缩放顺序] scale@' + h3Ops.indexOf('scale') + ' 特效@' + h3Ops.indexOf('drawImage'));
assert('H3 打击特效在缩放变换内绘制（跟随缩放，与音符对齐）',
  h3Ops.indexOf('scale') >= 0 && h3Ops.indexOf('drawImage') > h3Ops.indexOf('scale'),
  JSON.stringify(h3Ops.filter(o => o === 'scale' || o === 'drawImage')));
zoomEl.value = '1'; onZoom();

/* =====================================================================
 * B. sample-events.json（移动 / 旋转 / 消失 / 变速）
 * ===================================================================== */
const statusB = await uploadChart('sample-events.json', readSample('sample-events.json'));
console.log('[B 状态栏] ' + statusB);
assert('B 解析：7 个音符（Tap 4 / Drag 1 / Flick 1 / Hold 1）', /音符 7 个/.test(statusB) && /Tap 4/.test(statusB), statusB);
assert('B floorPosition 校验（诊断面板）：与自算积分完全一致（δ = 0）',
  /【校验】floorPosition：7 个样本，与自算积分完全一致/.test(diagEl.textContent), '');
assert('B 切换谱面会停止播放（pause 重新禁用）', pauseButton.disabled === true, '');

fakeNow = 10000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1250);                       // t = 1.25 s，移动事件进行到 1/4
console.log('[B t=1.25 判定线] ' + JSON.stringify(records.filter(r => r.op === 'translate').map(r => r.args)));
assert('B 移动事件线性插值：1.0~2.0 s 从值 0.2 滑到 0.8，t=1.25 → 值 0.35 → 屏幕 x = 560',
  hasTranslate(560, 450), JSON.stringify(records.filter(r => r.op === 'translate').map(r => r.args)));

runFrameIn(1750);                       // t = 3.00 s，旋转到 45°
console.log('[B t=3.0 旋转] ' + JSON.stringify(records.filter(r => r.op === 'rotate').map(r => r.args)));
assert('B 旋转事件：2.0~3.0 s 从 0° 到 45°（逆时针），t=3.0 → canvas 角度取负 −45°',
  hasRotate(-45 * PI / 180), JSON.stringify(records.filter(r => r.op === 'rotate').map(r => r.args)));
assert('B 变速生效：t=3.0 时地板位置使 time=4.0s 的音符距离判定线 2×540 = 1080px（局部 y=−1090）',
  hasRect(-45, -1090, 90, 20, '#1E90FF'), JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1], r.args[3]])));
assert('B 长条尾部：time=5.0s、holdTime=64(1.0s)、speed=1 → 头部 1620px、尾部 2160px，长度 540px',
  hasRect(-45, -2160, 90, 540, '#1E90FF'), '');
assert('B 官方规则：相对地板位置 = 0 的 Drag（time=3.0s）停在判定线上仍然渲染',
  hasRect(-225, -10, 90, 20, '#FFD400'), '');

runFrameIn(100);                        // t = 3.10 s
assert('B 速度=2 区间内：0.1 s 让音符靠近 0.1×2×540 = 108px（1080 → 972，局部 y=−982）',
  hasRect(-45, -982, 90, 20, '#1E90FF'), JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1], r.args[3]])));

runFrameIn(400);                        // t = 3.50 s，消失事件进行到一半
console.log('[B t=3.5 旋转] ' + JSON.stringify(records.filter(r => r.op === 'rotate').map(r => r.args)));
assert('B 旋转回退：3.0~4.0 s 从 45° 回到 0°，t=3.5 → 22.5°',
  hasRotate(-22.5 * PI / 180), JSON.stringify(records.filter(r => r.op === 'rotate').map(r => r.args)));
assert('B 消失事件：3.0~4.0 s 不透明度 1→0，t=3.5 判定线以 0.5 绘制（音符不受线透明度影响）',
  records.some(r => r.op === 'stroke' && near(alphaOf(r), 0.5)) &&
  records.some(r => r.op === 'fillRect' && r.args[2] === 90 && near(alphaOf(r), 1)),
  JSON.stringify(records.filter(r => r.op === 'stroke' || (r.op === 'fillRect' && r.args[2] === 90)).map(r => [r.op, alphaOf(r)]).slice(0, 4)));

/* ---------- B2. 分数向下取整 ---------- */
seekEl.value = '4'; onSeekInput();        // t = 4.0 s：7 个音符过了 4 个 → 精确值 571428.57
const floorScoreTexts = records.filter(r => r.op === 'fillText' && r.args[1] === 1560).map(r => String(r.args[0]));
console.log('[B2 分数] ' + JSON.stringify(floorScoreTexts));
assert('B2 分数向下取整：4/7 音符 → 571428（四舍五入会得到 571429）',
  floorScoreTexts.includes('0571428'), JSON.stringify(floorScoreTexts));

/* =====================================================================
 * O. offset（谱面偏移）：音乐先开始，谱面延后 |offset| 秒
 *    放在音乐测试之前，是为了让时钟只由墙上时间驱动
 * ===================================================================== */
const statusO = await uploadChart('sample-offset.json', readSample('sample-offset.json'));
console.log('[O 状态栏] ' + statusO);
assert('O 解析 offset = 0.500 s 并写进状态栏', /谱面偏移 offset = 0\.500 s/.test(statusO), statusO);

const tapBefore = sfxCount('Tap.wav');
fakeNow = 90000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                       // 音乐域 1.00 s → 谱面域 0.50 s
const hudO = records.filter(r => r.op === 'fillText').map(r => r.args[0]);
console.log('[O HUD] ' + JSON.stringify(hudO.slice(0, 1)));
assert('O 音乐 1.00 s 时谱面时间只有 0.50 s（谱面 = 音乐 − offset）',
  hudO.some(s => s === 't = 0.50 s'), JSON.stringify(hudO.slice(0, 1)));
assert('O 音符按谱面时间渲染：谱面 0.50 s 时 time=1.0s 的音符离判定线 0.5×540 = 270px（局部 y=−280）',
  hasRect(-45, -280, 90, 20, '#1E90FF'),
  JSON.stringify(records.filter(r => r.op === 'fillRect' && r.args[2] === 90).map(r => [r.args[0], r.args[1]])));
assert('O 此时判定音效还没响（谱面 1.00 s 才到线）', sfxCount('Tap.wav') === tapBefore, 'Tap 共 ' + sfxCount('Tap.wav'));

runFrameIn(500);                        // 音乐域 1.50 s → 谱面域 1.00 s
assert('O 音乐 1.50 s（谱面 1.00 s）时判定音效响起', sfxCount('Tap.wav') === tapBefore + 1, 'Tap 共 ' + sfxCount('Tap.wav'));

/* =====================================================================
 * N. 负速度事件 → floor 不再单调，渲染窗口必须按【时间】定位
 *    （曾经按 floor 二分查找，会跳过近处音符，表现为"大部分音符不渲染"）
 * ===================================================================== */
const statusN = await uploadChart('sample-neg-speed.json', readSample('sample-neg-speed.json'));
console.log('[N 状态栏] ' + statusN);
assert('N 解析：1 条判定线、3 个音符', /判定线 1 条/.test(statusN) && /音符 3 个/.test(statusN), statusN);

fakeNow = 70000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1250);                        // t = 1.25 s → F = 2.5（此后 2~4s 速度为负，F 会下降）
const rectsN = records.filter(r => r.op === 'fillRect' && r.args[2] === 90 && r.args[3] === 20).map(r => [r.args[0], r.args[1]]);
console.log('[N t=1.25 音符] ' + JSON.stringify(rectsN));
assert('N 近处音符没被跳过：time=1.5s（距判定线 270px）画出来（局部 y=−280）',
  hasRect(-45, -280, 90, 20, '#1E90FF'), JSON.stringify(rectsN));
assert('N 更远的 time=6.0s（距判定线 810px）也画出来（局部 x=45, y=−820）',
  hasRect(45, -820, 90, 20, '#1E90FF'), JSON.stringify(rectsN));
assert('N 地板位置非单调时诊断面板仍给出 F=2.500',
  (zoomEl.value = '1', onZoom(), /F=2\.500/.test(diagEl.textContent)),
  diagEl.textContent.split('\n').find(l => l.includes('此刻')) || '');
assert('N 诊断面板的"未来音符"按时间取到最近的 time=1.5s',
  /#0 Tap above time=96\.0\(1\.500s\)/.test(diagEl.textContent),
  diagEl.textContent.split('\n').filter(l => l.trim().startsWith('#')).slice(0, 1).join('') || '');

/* =====================================================================
 * C. 可选音乐 + 音画同步
 * ===================================================================== */
await uploadChart('sample-events.json', readSample('sample-events.json'));   // 换回 offset = 0 的谱面
const musicFile = { name: 'song.mp3' };
musicInput.files = [musicFile];
onMusicChange({ target: { files: [musicFile] } });
const musicStub = audioInstances.find(a => a.src.startsWith('blob:fake-'));
console.log('[C 状态栏] ' + statusEl.textContent);
assert('C 上传音乐后状态栏显示文件名', /音乐：song\.mp3/.test(statusEl.textContent), statusEl.textContent);
assert('C 音乐被交给 Audio 元素（blob URL）', !!musicStub, '');

fakeNow = 50000;
onPlayClick({ currentTarget: playButton });
assert('C 点击播放后音乐开始播放', musicStub && musicStub.paused === false && musicStub.playCount >= 1, '');

musicStub.currentTime = 3.0;            // 音乐明显跑在前面
fakeNow += 200;
records.length = 0;
{
  const jobs = rafQueue; rafQueue = [];
  for (const job of jobs) job.fn(fakeNow);
}
const hudC = records.filter(r => r.op === 'fillText').map(r => r.args[0]);
assert('C 音乐漂移 > 0.15s 时画面时间对齐音乐（HUD t = 3.20 s）', hudC.some(s => s === 't = 3.20 s'), JSON.stringify(hudC.slice(0, 1)));

/* =====================================================================
 * H. 打击特效（方块扩散）+ Note 大小
 * ===================================================================== */
await uploadChart('sample-chart.json', readSample('sample-chart.json'));
fakeNow = 200000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s：Tap(time=64→1.0s) 到线

const fxAt1 = records.filter(isFxDraw);
console.log('[H 特效 t=1.0] ' + JSON.stringify(fxAt1.map(r => [r.args[1], r.args[2], r.args[3], r.args[0] && r.args[0].isImageStub ? 'perfect原图' : 'tinted'])));
assert('H 打击特效：音符到线时在判定线上画出帧图（260×260）',
  fxAt1.length > 0 && fxAt1.every(r => near(r.args[3], 260) && near(r.args[4], 260)),
  JSON.stringify(fxAt1.map(r => r.args)));
assert('H 特效生成在世界坐标里（translate 到判定线位置，偏移 −130 绘制）',
  fxAt1.some(r => near(r.args[1], -130) && near(r.args[2], -130)), JSON.stringify(fxAt1.map(r => r.args)));
assert('H Perfect 判定 → 使用原始帧图（不染色）',
  fxAt1.length > 0 && fxAt1.every(r => r.args[0] && r.args[0].isImageStub === true),
  JSON.stringify(fxAt1.map(r => r.args[0] && r.args[0].isImageStub)));

runFrameIn(150);                         // t = 1.15 s：同一特效推进帧
const fxAt115 = records.filter(isFxDraw);
assert('H 特效按时间推进帧（0.15 s 后画的是另一帧图）',
  fxAt115.length > 0 && fxAt1.length > 0 && fxAt115[0].args[0] !== fxAt1[0].args[0], '');

hitFxEl.checked = false; onHitFxChange();
records.length = 0;
runFrameIn(1000);                        // t = 2.15 s
assert('H 关掉打击特效后不再画帧图', !records.some(isFxDraw), '');
hitFxEl.checked = true; onHitFxChange();
records.length = 0;
runFrameIn(1000);                        // t = 3.15 s：3.0 s 的音符到线
assert('H 重新打开后特效恢复', records.some(isFxDraw), '');

// —— Note 大小 ——
noteScaleEl.value = '1.5'; onNoteScale();
assert('H Note 大小 ×1.5：矩形变为 135×30',
  records.some(r => r.op === 'fillRect' && near(r.args[2], 135) && near(r.args[3], 30)),
  JSON.stringify(records.filter(r => r.op === 'fillRect').map(r => [r.args[2], r.args[3]]).slice(0, 5)));
assert('H Note 大小标签同步为 ×1.50', noteScaleLabelEl.textContent === '×1.50', noteScaleLabelEl.textContent);
noteScaleEl.value = '1'; onNoteScale();
assert('H 回到 ×1 时恢复 90×20',
  records.some(r => r.op === 'fillRect' && r.args[2] === 90 && r.args[3] === 20), '');

/* =====================================================================
 * S. 打击音效开关 + 曲绘（上传图片 / 模糊程度）
 * ===================================================================== */
await uploadChart('sample-chart.json', readSample('sample-chart.json'));
fakeNow = 120000;
onPlayClick({ currentTarget: playButton });

const tapBeforeS = sfxCount('Tap.wav');
sfxEl.checked = false; onSfxChange();
runFrameIn(1000);                       // t = 1.0 s：Tap 到线
assert('S 关掉打击音效后音符到线不发声', sfxCount('Tap.wav') === tapBeforeS, 'Tap 共 ' + sfxCount('Tap.wav'));
sfxEl.checked = true; onSfxChange();
runFrameIn(1000);                       // t = 2.0 s：Drag 到线
assert('S 打开打击音效后正常发声', sfxCount('Drag.wav') >= 1, 'Drag 共 ' + sfxCount('Drag.wav'));

// —— 复古打击音：全部用 Tap 音 ——
retroSfxEl.checked = true; onRetroSfx();
const tapRetro = sfxCount('Tap.wav');
const flickRetro = sfxCount('Flick.wav');
const dragRetro = sfxCount('Drag.wav');
runFrameIn(1000);                       // t = 3.0 s：Flick（+ 同刻另一个音符）到线
console.log('[S 复古音效] Tap+' + (sfxCount('Tap.wav') - tapRetro) +
            ' Flick+' + (sfxCount('Flick.wav') - flickRetro) +
            ' Drag+' + (sfxCount('Drag.wav') - dragRetro));
assert('S 复古打击音：Flick 也改用 Tap 音（不播 Flick 音）',
  sfxCount('Tap.wav') > tapRetro && sfxCount('Flick.wav') === flickRetro,
  'Tap+' + (sfxCount('Tap.wav') - tapRetro) + ' / Flick+' + (sfxCount('Flick.wav') - flickRetro));
retroSfxEl.checked = false; onRetroSfx();

// —— 曲绘 ——
const imgFile = { name: 'cover.png' };
songImageInput.files = [imgFile];
onSongImageChange({ target: { files: [imgFile] } });
console.log('[S 状态栏] ' + statusEl.textContent);
assert('S 上传曲绘后状态栏显示文件名', /曲绘：cover\.png/.test(statusEl.textContent), statusEl.textContent);

zoomEl.value = '1';
records.length = 0;
onZoom();
const artDrawn = records.filter(r => r.op === 'drawImage');
console.log('[S 曲绘绘制] ' + JSON.stringify(artDrawn.map(r => [r.args[1], r.args[2], r.args[3], r.args[4], r.filter])));
assert('S 曲绘按 cover 铺满画面：1000×1000 → 1600×1600、y 偏移 −350，模糊 4px 外扩 8px',
  artDrawn.some(r => near(r.args[1], -8) && near(r.args[2], -358) && near(r.args[3], 1616) && near(r.args[4], 1616)),
  JSON.stringify(artDrawn.map(r => [r.args[1], r.args[2], r.args[3], r.args[4]])));
assert('S 模糊 = 4px 时使用 ctx.filter = blur(4px)',
  artDrawn.some(r => r.filter === 'blur(4px)'), JSON.stringify(artDrawn.map(r => r.filter)));

// —— 曲绘跟随缩放（在缩放变换内绘制） ——
records.length = 0;
zoomEl.value = '0.5'; onZoom();
const zoomOps = records.map(r => r.op);
const scaleIdx = zoomOps.indexOf('scale');
const artZoomIdx = records.findIndex(r => r.op === 'drawImage' && r.args[3] > 500 && r.args[4] > 500);
console.log('[S 缩放顺序] scale@' + scaleIdx + ' 曲绘@' + artZoomIdx);
assert('S 缩放到 ×0.5 时曲绘在缩放变换内绘制（一起缩小，四周露出底色）',
  scaleIdx >= 0 && artZoomIdx > scaleIdx, 'scale@' + scaleIdx + ' art@' + artZoomIdx);
assert('S 缩放不改变曲绘的绘制参数（变换由 ctx 承担）',
  records.some(r => r.op === 'drawImage' && near(r.args[3], 1616)), '');
zoomEl.value = '1'; onZoom();

artBlurEl.value = '0'; onArtBlur();
assert('S 模糊滑杆标签同步为 0px', artBlurLabelEl.textContent === '0px', artBlurLabelEl.textContent);
records.length = 0;
onZoom();
const artNoBlur = records.filter(r => r.op === 'drawImage');
assert('S 模糊设为 0 时不用 filter、也不外扩（1600×1600，y=−350）',
  artNoBlur.some(r => near(r.args[1], 0) && near(r.args[2], -350) && near(r.args[3], 1600) && near(r.args[4], 1600) && r.filter !== 'blur(0px)'),
  JSON.stringify(artNoBlur.map(r => [r.args[1], r.args[2], r.args[3], r.args[4], r.filter])));

onClearImageClick({ currentTarget: clearImageButton });
records.length = 0;
onZoom();
assert('S 清除曲绘后不再绘制图片（只剩 260×260 的打击特效帧图）',
  !records.some(r => r.op === 'drawImage' && r.args[3] > 500), '');
assert('S 清除后状态栏不再出现曲绘字样', !/曲绘/.test(statusEl.textContent), statusEl.textContent);

/* =====================================================================
 * M. 多押金边 + 判定决定特效颜色
 * ===================================================================== */
const statusM = await uploadChart('sample-chord.json', readSample('sample-chord.json'));
console.log('[M 状态栏] ' + statusM);
assert('M 多押识别：2 个同刻音符被标记（诊断面板）', /多押 2 个/.test(diagEl.textContent), '');

autoJudgeEl.value = 'perfect'; onAutoJudge();
fakeNow = 300000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s：两个同刻音符到线

const chordStrokes = records.filter(r => r.op === 'strokeRect' && r.strokeStyle === '#FFC53D');
console.log('[M 多押金边] ' + JSON.stringify(chordStrokes.map(r => r.args)));
assert('M 多押金边：两个同刻音符各有一圈金色边框（x=−230 / x=130，100×30）',
  chordStrokes.some(r => near(r.args[0], -230) && near(r.args[1], -15) && near(r.args[2], 100) && near(r.args[3], 30)) &&
  chordStrokes.some(r => near(r.args[0], 130) && near(r.args[1], -15) && near(r.args[2], 100) && near(r.args[3], 30)),
  JSON.stringify(chordStrokes.map(r => r.args)));
assert('M 非多押音符没有金边（time=2.0s 的 Tap 局部 x=−50）',
  !chordStrokes.some(r => near(r.args[0], -50)), JSON.stringify(chordStrokes.map(r => r.args)));
assert('M Perfect 判定 → 原始帧图（两个音符各一个）',
  records.filter(isFxDraw).filter(r => r.args[0] && r.args[0].isImageStub === true).length >= 2,
  JSON.stringify(records.filter(isFxDraw).map(r => r.args[0] && r.args[0].isImageStub)));

// 切到"全部 Good"：Tap 应为蓝色特效
autoJudgeEl.value = 'good'; onAutoJudge();
records.length = 0;
runFrameIn(1000);                        // t = 2.0 s：Tap 到线
assert('M Good 判定 → 使用蓝色染色后的帧图',
  records.filter(isFxDraw).some(r => r.args[0] && r.args[0].isTintedCanvas === true),
  JSON.stringify(records.filter(isFxDraw).map(r => r.args[0] && r.args[0].isTintedCanvas)));

// Drag / Flick 没有 Good：切回 sample-chart，让 2.0s 的 Drag 在 Good 模式下到线
await uploadChart('sample-chart.json', readSample('sample-chart.json'));
fakeNow = 400000;
onPlayClick({ currentTarget: playButton });
runFrameIn(2000);                        // t = 2.0 s：Drag 到线
const dragFx = records.filter(isFxDraw);
console.log('[M Drag 特效] ' + JSON.stringify(dragFx.map(r => r.args[0] && r.args[0].isImageStub)));
assert('M Drag 没有 Good：Good 模式下的 Drag 仍使用原始帧图',
  dragFx.length > 0 && dragFx.every(r => r.args[0] && r.args[0].isImageStub === true),
  JSON.stringify(dragFx.map(r => r.args[0] && r.args[0].isImageStub)));

// 多押金边可以关掉（此刻画面上有 sample-chart 3.0 s 的那组多押）
chordBorderEl.checked = false; onChordBorder();
records.length = 0;
onChordBorder();
assert('M 设置开关：关掉多押金边后画面里没有金边',
  !records.some(r => r.strokeStyle === '#FFC53D'),
  JSON.stringify(records.filter(r => r.op === 'strokeRect').map(r => r.strokeStyle)));
chordBorderEl.checked = true; onChordBorder();
records.length = 0;
onChordBorder();
assert('M 重新打开多押金边后金边回来',
  records.some(r => r.strokeStyle === '#FFC53D'),
  JSON.stringify(records.filter(r => r.op === 'strokeRect').map(r => r.strokeStyle)));
autoJudgeEl.value = 'perfect'; onAutoJudge();

/* =====================================================================
 * R. 结算界面（等音乐放完再结算）
 * ===================================================================== */
await uploadChart('sample-chart.json', readSample('sample-chart.json'));

const musicFile2 = { name: 'song2.mp3' };
musicInput.files = [musicFile2];
onMusicChange({ target: { files: [musicFile2] } });
const musicStub2 = audioInstances.find(a => String(a.src).includes('song2'));
musicStub2.duration = 12;                 // 音乐 12 秒

autoJudgeEl.value = 'perfect'; onAutoJudge();
fakeNow = 500000;
onPlayClick({ currentTarget: playButton });
runFrameIn(11000);                        // 谱面 11.0 s：音符早放完（最后 9.0s），但音乐还剩 1 秒
console.log('[R 状态栏] ' + statusEl.textContent);
assert('R 音符放完但音乐没放完 → 不结算、继续播放',
  rafQueue.length === 1 && !/结算/.test(statusEl.textContent), statusEl.textContent);

runFrameIn(1200);                         // 音乐 12.2 s → 放完
console.log('[R 状态栏] ' + statusEl.textContent);
assert('R 音乐放完后自动结算', /结算/.test(statusEl.textContent), statusEl.textContent);
assert('R 全部 Perfect + 全连 → 1000000 分 · φ 评级 · Acc 100%',
  /结算：1000000 分 · φ · Acc 100\.0000%/.test(statusEl.textContent), statusEl.textContent);
assert('R 结算后播放按钮复位、暂停按钮禁用',
  playButton.textContent === '播放' && pauseButton.disabled === true, '');

const resultTexts = records.filter(r => r.op === 'fillText').map(r => String(r.args[0]));
console.log('[R 结算画面] ' + JSON.stringify(resultTexts.filter(s => /φ|1000000|Acc|Perfect|Good|Bad|Miss|Max Combo/.test(s))));
assert('R 结算画面画出：分数 / 评级 / Acc / Perfect / Good / Bad / Miss / Max Combo',
  resultTexts.includes('1000000') && resultTexts.includes('φ') &&
  resultTexts.some(s => s.startsWith('Acc ')) &&
  resultTexts.includes('Perfect') && resultTexts.includes('Good') &&
  resultTexts.includes('Bad') && resultTexts.includes('Miss') &&
  resultTexts.some(s => s.startsWith('Max Combo')), JSON.stringify(resultTexts.slice(0, 10)));
assert('R 结算数据：Perfect 14 / Good 0 / Bad 0 / Miss 0 / MaxCombo 14',
  resultTexts.includes('14') && resultTexts.filter(s => s === '0').length >= 3,
  JSON.stringify(resultTexts));

canvasClickHandler({ clientX: 40, clientY: 40 });     // 点左上角暂停键位置
assert('R 结算界面点击画面不会被关闭', /结算/.test(statusEl.textContent), statusEl.textContent);

// —— 结算音乐 end.mp3 + 入场动画 ——
const endStub = audioInstances.find(a => String(a.src).includes('end.mp3'));
assert('R 结算音乐 end.mp3 已加载，并从 1:20（80s）开始播放',
  !!endStub && endStub.paused === false && near(endStub.currentTime, 80, 0.5),
  endStub ? (endStub.paused + ' @ ' + endStub.currentTime) : 'no stub');

endStub.fire('ended');                    // 模拟放完
assert('R 结算音乐放完后循环回 1:20 继续放',
  endStub.paused === false && near(endStub.currentTime, 80, 0.5), String(endStub.currentTime));

const slideStart = records.filter(r => r.op === 'translate' && r.args[1] === 0).map(r => Math.round(r.args[0]));
console.log('[R 滑入] ' + JSON.stringify(slideStart));
assert('R 结算界面从右侧滑入：起始平移 = 画布宽度',
  slideStart.some(v => v === 1600), JSON.stringify(slideStart));
records.length = 0;
runFrameIn(600);                          // 动画 520ms → 结束
const slideEnd = records.filter(r => r.op === 'translate' && r.args[1] === 0).map(r => Math.round(r.args[0]));
assert('R 动画结束后平移归零', slideEnd.includes(0) && !slideEnd.some(v => v === 1600), JSON.stringify(slideEnd));

// —— 曲名 / 难度输入框 ——
titleInput.value = ''; onTitleInput();
assert('R 曲名留空时默认取音频文件名（去扩展名）：song2',
  records.some(r => r.op === 'fillText' && r.args[0] === 'song2' && near(r.args[2], 874)),
  JSON.stringify(records.filter(r => r.op === 'fillText' && near(r.args[2], 874)).map(r => String(r.args[0]))));

titleInput.value = 'Break Over'; onTitleInput();
difficultyInput.value = 'IN 15'; onDifficultyInput();
assert('R 手填曲名/难度后显示在底部（曲名 x=54、难度右对齐 x=1560）',
  records.some(r => r.op === 'fillText' && r.args[0] === 'Break Over' && near(r.args[1], 54) && near(r.args[2], 874)) &&
  records.some(r => r.op === 'fillText' && r.args[0] === 'IN 15' && near(r.args[1], 1560) && near(r.args[2], 874)), '');

onKeyDown({ code: 'Space', preventDefault() {} });
assert('R 空格 = 重开一局（只有重开才会让结算消失）',
  /播放中/.test(statusEl.textContent) && rafQueue.length === 1, statusEl.textContent);
assert('R 重开后分数回到 0（显示 0000000）',
  records.filter(r => r.op === 'fillText' && r.args[1] === 1560).map(r => String(r.args[0])).includes('0000000'),
  JSON.stringify(records.filter(r => r.op === 'fillText' && r.args[1] === 1560).map(r => String(r.args[0]))));
assert('R 重开后结算音乐停止', endStub.paused === true, '');

/* =====================================================================
 * T. 音符贴图（./note/*.png，HL = 多押版）
 * ===================================================================== */
await uploadChart('sample-chart.json', readSample('sample-chart.json'));
fakeNow = 600000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s
assert('T 贴图开关关闭时用色块绘制音符',
  records.some(r => r.op === 'fillRect' && r.args[2] === 90 && r.args[3] === 20), '');

records.length = 0;
noteTextureEl.checked = true; onNoteTexture();      // 打开开关 → 触发加载（Image 桩同步 onload）
const noteImgs = records.filter(r => r.op === 'drawImage' && near(r.args[3], 90))
  .map(r => ({ src: String(r.args[0].src || ''), h: r.args[4] }));
console.log('[T 贴图] ' + JSON.stringify(noteImgs.slice(0, 5)));
assert('T 打开贴图后音符改为 drawImage 绘制（宽 90 = 1 个 positionX 单位）',
  noteImgs.length > 0, JSON.stringify(noteImgs.slice(0, 5)));
assert('T Tap 用 note/tap.png，并按原图比例缩放（989×100 → 高 9.10）',
  noteImgs.some(n => n.src.endsWith('note/tap.png') && near(n.h, 90 * 100 / 989, 0.2)),
  JSON.stringify(noteImgs.slice(0, 5)));

await uploadChart('sample-chord.json', readSample('sample-chord.json'));
fakeNow = 620000;
onPlayClick({ currentTarget: playButton });
runFrameIn(1000);                        // t = 1.0 s：两个同刻音符
const chordImgs = records.filter(r => r.op === 'drawImage' && near(r.args[3], 90))
  .map(r => String(r.args[0].src || ''));
assert('T 多押音符使用 HL 贴图（note/tapHL.png）',
  chordImgs.filter(s => s.endsWith('note/tapHL.png')).length >= 2, JSON.stringify(chordImgs));

/* =====================================================================
 * D. 非法谱面
 * ===================================================================== */
const statusD = await uploadChart('bad.json', JSON.stringify({ formatVersion: 2, judgeLineList: [] }));
console.log('[D 状态栏] ' + statusD);
assert('D formatVersion 非 3 时拒绝并提示', /仅支持 formatVersion = 3/.test(statusD) && playButton.disabled === true, statusD);

console.log('\n' + checks.join('\n'));
const failed = checks.filter(c => c.startsWith('FAIL')).length;
console.log('\n结果：' + (checks.length - failed) + '/' + checks.length + ' 通过');
process.exit(failed ? 1 : 0);
