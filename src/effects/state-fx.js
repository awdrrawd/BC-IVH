// ════════════════════════════════════════
//  HSC module: state-fx.js  （強控中的訊息類效果）
//  三個效果，全部僅在「催眠狀態啟用 + 強控中（isForced）」時作用：
//   1) 彈幕文字   — 他人的聊天訊息化為漂浮彈幕（隨機字級 14~20）；
//                   悄悄話選項另外把他人悄悄話以紫色彈幕顯示在自己耳邊。
//   2) 訊息妨礙   — 除了本地訊息與人員進出訊息外，每則訊息蓋上一層煙霧，
//                   點一下才慢慢散去（手動清除）。
//   3) 信息干擾   — 人員進/出房間的訊息被改寫成模糊的幻覺敘述。
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { isForced } from '../hypno/hypno.js';
import { getOverlay } from '../util/util.js';
import { extractChatText } from '../util/util.js';
import { bcToScreen, getPlayerHeadScreenPos, refreshCanvasCache } from '../util/geometry.js';
import { HSC_Z } from '../util/zlayers.js';
import { ui } from '../i18n/i18n.js';

const _randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const _FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
// 黑邊（四向實心描邊）+ 對應顏色光暈 —— 不論字色都保證可讀
const _outline = (glow) => `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 7px ${glow}`;

// 目前是否該套用強控訊息效果
function _active() {
    return CONFIG.enabled && CONFIG.hypnoEnabled && isForced();
}

// 逐段顯示的「切點」（回傳每一步要顯示到的字元 index）：
//  拉丁字/數字 → 整個單字一段；CJK 或標點 → 各自一段；空白 → 併入前一段（不製造停頓）。
function _revealCuts(text) {
    const isWord = c => /[A-Za-z0-9'’]/.test(c);
    const cuts = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (isWord(c)) { let j = i + 1; while (j < text.length && isWord(text[j])) j++; i = j; cuts.push(i); }
        else if (/\s/.test(c)) { i++; if (cuts.length) cuts[cuts.length - 1] = i; else cuts.push(i); }
        else { i++; cuts.push(i); }
    }
    return cuts.length ? cuts : [text.length];
}

// ── 1) 聊天彈幕：隨機位置、隨機字級 22~26（桃紅 + 黑邊），逐字波浪 ──
function spawnChatDanmaku(text) {
    if (!text) return;
    text = text.length > 40 ? text.slice(0, 40) + '…' : text;
    const overlay = getOverlay();
    refreshCanvasCache();
    const pos = bcToScreen(_randInt(40, 460), _randInt(120, 820));
    const fs = _randInt(22, 26);
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`,
        fontSize: `${fs}px`, fontWeight: '600', fontFamily: _FONT,
        color: 'rgba(255,150,205,0.98)', textShadow: _outline('rgba(255,80,165,0.85)'),
        whiteSpace: 'nowrap', opacity: '0', pointerEvents: 'none',
        transform: 'translateY(8px)', transition: 'opacity .5s ease, transform .5s ease',
        zIndex: HSC_Z.sceneText,
    });
    // 逐字包 span → 波浪起伏（延遲錯開形成行進波）
    Array.from(text).forEach((ch, i) => {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.display = 'inline-block';
        s.style.animation = `hscWaveChar 1.6s ease-in-out ${(i * 0.08).toFixed(2)}s infinite`;
        el.appendChild(s);
    });
    overlay.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0.95'; el.style.transform = 'translateY(0)'; });
    // 顯示時間 +1 秒（原 3500 → 4500，移除 5200）
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-12px)'; }, 4500);
    setTimeout(() => el.remove(), 5200);
}

// 目前在畫面上的悄悄話彈幕（用來錯開位置、避免重疊）
const _whisperActive = [];
function _nextWhisperSlot() {
    // 找一個沒被占用的直向槽位（0,1,2…）
    for (let i = 0; i < 8; i++) if (!_whisperActive.includes(i)) { _whisperActive.push(i); return i; }
    const i = 0; _whisperActive.push(i); return i;
}
function _freeWhisperSlot(i) {
    const idx = _whisperActive.indexOf(i);
    if (idx >= 0) _whisperActive.splice(idx, 1);
}

// ── 1b) 悄悄話彈幕：紫色、耳邊、字級 22~26（黑邊）；逐字上浮浮現、停留 2 秒；
//        連續悄悄話錯開位置不重疊；約 20 字元自動換行 ──
function spawnWhisperDanmaku(text) {
    if (!text) return;
    text = text.length > 60 ? text.slice(0, 60) + '…' : text;
    const overlay = getOverlay();
    refreshCanvasCache();
    const head = getPlayerHeadScreenPos(true);   // 永遠貼在角色身上（催眠狀態沒有中央頭像功能）
    const slot = _nextWhisperSlot();
    const fs = _randInt(22, 26);
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed',
        left: `${head.x + 60}px`,
        top: `${head.y - 80 + slot * 46}px`,          // 往上 70 避免遮眼；依槽位往下錯開，避免重疊
        transform: 'translate(-50%,-50%)',
        fontSize: `${fs}px`, fontWeight: '600', fontStyle: 'italic', fontFamily: _FONT,
        color: 'rgba(215,160,255,0.98)', textShadow: _outline('rgba(150,60,220,0.9)'),
        maxWidth: `${fs * 20 * 0.62}px`,               // 約 20 字元自動換行
        whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center', lineHeight: '1.35',
        opacity: '1', pointerEvents: 'none', zIndex: HSC_Z.sceneText,
    });
    overlay.appendChild(el);

    // 逐字（詞）上浮浮現：每段包 span，從下方淡入上浮
    const cuts = _revealCuts(text);
    const segs = [];
    let prev = 0;
    for (const c of cuts) { if (c > prev) { segs.push(text.slice(prev, c)); prev = c; } }
    const spans = segs.map(seg => {
        const s = document.createElement('span');
        s.textContent = seg;
        s.style.opacity = '0';
        s.style.display = 'inline-block';
        s.style.transform = 'translateY(10px)';
        s.style.transition = 'opacity .45s ease, transform .45s ease';
        el.appendChild(s);
        return s;
    });
    // 再放慢 0.3 秒：總浮現時間上限 ~2800ms
    const per = Math.max(95, Math.min(210, Math.round(2800 / spans.length)));
    let k = 0;
    const step = () => {
        if (!el.isConnected) { _freeWhisperSlot(slot); return; }
        if (k < spans.length) {
            spans[k].style.opacity = '1';
            spans[k].style.transform = 'translateY(0)';
            k++;
            setTimeout(step, per);
            return;
        }
        // 全部顯示完 → 停留 2 秒後淡出
        setTimeout(() => { el.style.transition = 'opacity .6s ease'; el.style.opacity = '0'; }, 2000);
        setTimeout(() => { try { el.remove(); } catch (e) {} _freeWhisperSlot(slot); }, 2000 + 700);
    };
    step();
}

// ── 2) 訊息妨礙：在訊息上蓋一層可點擊的煙霧 ──
function _coverWithSmoke(msgEl) {
    if (msgEl._hscSmoked) return;
    msgEl._hscSmoked = true;
    try {
        const pos = getComputedStyle(msgEl).position;
        if (pos === 'static' || !pos) msgEl.style.position = 'relative';
    } catch (e) {}
    const smoke = document.createElement('div');
    Object.assign(smoke.style, {
        position: 'absolute', inset: '0', cursor: 'pointer', zIndex: '6',
        borderRadius: '4px', overflow: 'hidden',
        background: 'radial-gradient(circle at 30% 40%, rgba(96,52,128,0.98), rgba(42,18,58,0.995))',
        backdropFilter: 'blur(5px)', webkitBackdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(230,215,240,0.85)', fontSize: '12px', letterSpacing: '2px',
        transition: 'opacity 1.2s ease',
    });
    smoke.textContent = '☁ ' + ui('stateSmokeHint');
    smoke.title = ui('stateSmokeHint');
    smoke.addEventListener('click', (e) => {
        e.stopPropagation();
        smoke.style.pointerEvents = 'none';
        smoke.style.opacity = '0';
        setTimeout(() => { try { smoke.remove(); } catch (er) {} }, 1300);
    });
    msgEl.appendChild(smoke);
}

// ── DOM observer 每則新訊息呼叫：套用彈幕 / 煙霧 ──
export function handleStateChatFx(node) {
    if (!_active()) return;
    const msgEl = node.classList?.contains('ChatMessage') ? node : node.querySelector?.('.ChatMessage');
    if (!msgEl || msgEl._hscStateFx) return;
    msgEl._hscStateFx = true;

    const cls = msgEl.classList;
    const isLocal = cls.contains('ChatMessageLocalMessage');
    const isChat = cls.contains('ChatMessageChat');
    const isWhisper = cls.contains('ChatMessageWhisper');
    // 人員進出訊息：HSC 改寫後為本地訊息(_hscEnterLeave)；原生則帶 ChatMessageEnterLeave / 動作類
    const isEnterLeave = !!msgEl._hscEnterLeave || cls.contains('ChatMessageEnterLeave');
    const sAttr = msgEl.getAttribute?.('data-sender');
    const sender = sAttr != null ? Number(sAttr) : null;
    const isSelf = sender != null && Player && sender === Player.MemberNumber;

    if (!isLocal) {
        if (CONFIG.stateDanmakuChat && isChat && !isSelf) spawnChatDanmaku(extractChatText(msgEl));
        if (CONFIG.stateDanmakuWhisper && isWhisper && !isSelf) spawnWhisperDanmaku(extractChatText(msgEl));
    }
    if (CONFIG.stateMsgSmoke && !isLocal && !isEnterLeave && !isSelf) _coverWithSmoke(msgEl);
}

// ── 3) 信息干擾：改寫人員進出訊息 ──
const _ENTER = new Set(['ServerEnter']);
const _LEAVE = new Set(['ServerLeave', 'ServerDisconnect', 'ServerKick', 'ServerBan']);

function _addLocalLine(text) {
    try {
        const log = document.getElementById('TextAreaChatLog');
        if (!log) return;
        const el = document.createElement('div');
        el.className = 'ChatMessage ChatMessageLocalMessage';
        el._hscEnterLeave = true;   // 標記：訊息妨礙不覆蓋、DOM 效果略過
        Object.assign(el.style, {
            color: 'rgb(190,150,235)', fontStyle: 'italic',
            padding: '3px 8px', margin: '2px 0', textAlign: 'center',
            opacity: '0.92', whiteSpace: 'pre-wrap',
        });
        el.textContent = text;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
    } catch (e) {}
}

// 回傳 true → 呼叫端應攔截該訊息（不顯示原本的進出訊息）
export function interfereEnterLeave(data) {
    if (!_active() || !CONFIG.stateMsgInterfere) return false;
    if (!data || data.Type !== 'Action') return false;
    const c = data.Content;
    const enter = _ENTER.has(c);
    if (!enter && !_LEAVE.has(c)) return false;
    const key = enter ? 'stateInterfereEnter' : 'stateInterfereLeave';
    const pool = String(ui(key) || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (pool.length) _addLocalLine(pool[Math.floor(Math.random() * pool.length)]);
    return true;   // 攔截原訊息
}
