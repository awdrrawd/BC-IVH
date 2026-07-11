// ════════════════════════════════════════
//  HSC module: hypno-orb.js  （催眠進度球 — 頭上狀態指示）
//  參考 LSCG 的魔法狀態做法：在聊天室角色頭上（LSCG 狀態圖示的上方、不重疊）畫一顆
//  心形進度球，具備：
//    · 泛光      — 球後方放射狀光暈，隨進度／強控增強並脈動
//    · 水位      — 心形由下往上依催眠值填滿（未滿處暗淡）
//    · 中心數值  — 心形中央顯示目前催眠值百分比
//    · 游標停留  — 顯示「HSC 催眠進度為 N%」提示
//  自己：讀執行期催眠值（getHypnoValue / isForced）。
//  他人：讀 OnlineSharedSettings.HSC.hypno（由 storage.publishHypnoState 公告）。
//        看見他人進度球／符咒分別由 CONFIG.seeOthersHypno / seeOthersTalisman 控制。
//  座標系：charX/charY/zoom 皆為 BC 主畫布座標（0~2000 × 0~1000），直接畫在 MainCanvas。
// ════════════════════════════════════════

import { CONFIG, ES_KEY } from '../core/config.js';
import { loadHscImage } from '../util/icons.js';
import { _charAnchor, getBodyAnchorBc } from '../util/geometry.js';
import { getHypnoValue, isForced, getWakeRemainingMs } from './hypno.js';
import { ui } from '../i18n/i18n.js';

// 把秒數格式化為 m:ss（分可超過 60，例如 125:30）；<0 視為 0
function _fmtTime(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + String(ss).padStart(2, '0');
}

// 他人清醒倒數的本地平滑：記住每位成員「上次收到的剩餘秒 r 與收到時間 t」，
//  之後每幀本地遞減 → 不必每秒公告（省伺服器）。收到的 r 變了才重置。
const _wakeSeen = {};   // { member: { r, t } }
function _otherWakeSec(member, r) {
    const now = Date.now();
    const s = _wakeSeen[member];
    if (!s || s.r !== r) { _wakeSeen[member] = { r, t: now }; return r; }
    return Math.max(0, r - (now - s.t) / 1000);
}

// ── 素材預載 ──
// HSC-Hypnosis.png 為 200×75 的 1×2 精靈：左格＝外框（透明底），右格＝填滿的心形遮罩（用來裁水位形狀）。
let _heartImg = null, _heartReady = false;
// crossOrigin 乾淨載入（CDN 優先 → Pages 回退）；水位裁形用離屏 canvas，汙染會讓 toDataURL 丟例外。
try { _heartImg = loadHscImage('HSC-Hypnosis.png', () => { _heartReady = true; }); } catch (e) {}
// 取精靈單格來源矩形：cell 0 = 外框、cell 1 = 遮罩
function _cell(i) {
    const cw = (_heartImg.naturalWidth || 200) / 2, chh = _heartImg.naturalHeight || 75;
    return { sx: i * cw, sy: 0, sw: cw, sh: chh };
}

// 供水位裁形用的離屏畫布（重用，避免每幀 new canvas）
let _offCv = null, _offCtx = null;
function _getOff(w, h) {
    if (!_offCv) { _offCv = document.createElement('canvas'); _offCtx = _offCv.getContext('2d'); }
    if (_offCv.width !== w || _offCv.height !== h) { _offCv.width = w; _offCv.height = h; }
    return _offCtx;
}

// 符咒精靈圖（與催眠動畫共用同一張 2×6 格）
const T_COLS = 6, T_ROWS = 2, T_AR = 0.5;   // 符咒單格 寬/高 = 0.5（偏長）
let _talisImg = null, _talisReady = false;
try { _talisImg = loadHscImage('HSC-Status-Code1.png', () => { _talisReady = true; }); } catch (e) {}

// 依 顏色×樣式 快取一張染色後的符咒（source-in 平塗，與催眠動畫同做法）
const _talisCache = new Map();
function _tintedTalis(color, style) {
    const key = color + '|' + style;
    const hit = _talisCache.get(key);
    if (hit) return hit;
    if (!_talisReady) return null;
    const i = Math.min(11, Math.max(0, ((style | 0) || 1) - 1));
    const sw = _talisImg.naturalWidth / T_COLS, sh = _talisImg.naturalHeight / T_ROWS;
    const sx = (i % T_COLS) * sw, sy = Math.floor(i / T_COLS) * sh;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw)); cv.height = Math.max(1, Math.round(sh));
    const x = cv.getContext('2d');
    x.drawImage(_talisImg, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color || '#f500b4'; x.fillRect(0, 0, cv.width, cv.height);
    _talisCache.set(key, cv);
    return cv;
}

// ── 圓角矩形（提示框用）──
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── 頭上催眠符咒（他人強控時顯示；含泛光與微震動）──
//  改用共用定位 getBodyAnchorBc（含 ECHO 貼貼等活動 X 位移）→ 符咒會跟著人物實際位置，
//  再用 asset Y=120（額頭）定高；要微調高度就改這個 120 或加 offY。
function _drawTalisOnHead(C, color, style) {
    const cv = _tintedTalis(color, style);
    if (!cv) return;
    const head = getBodyAnchorBc(C, 250, 120);   // 頭部（含活動位移）
    if (!head) return;
    const ratio = (typeof C?.HeightRatio === 'number') ? C.HeightRatio : 1;
    const zoom = head.zoom || 1;
    const tw = 46 * zoom * ratio, th = tw / T_AR;           // 符咒偏長
    const jx = (Math.random() - 0.5) * 4 * zoom, jy = (Math.random() - 0.5) * 4 * zoom;   // 微震動
    const ctx = MainCanvas;
    ctx.save();
    ctx.shadowColor = color || '#f500b4';
    ctx.shadowBlur = 12 * zoom;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(cv, head.x - tw / 2 + jx, head.y - th / 2 + jy, tw, th);
    ctx.restore();
}

// ── 進度球本體 ──
//  圖層順序（下→上）：泛光 → 水位 → 原圖(外框) → 中心數值。
//  水位畫在「原圖之下」，透過愛心鏤空的內部透出來，原圖維持全不透明 → 外框清晰。
function _drawOrb(x, y, w, h, pct, forced, centerText) {
    if (!_heartReady) return;
    const ctx = MainCanvas;
    const cx = x + w / 2, cyc = y + h / 2;
    const now = Date.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / (forced ? 350 : 650));
    const p = Math.max(0, Math.min(1, pct));

    // 1) 泛光（最底層）
    ctx.save();
    const glowR = w * (forced ? 0.85 : 0.7);
    const a = ((forced ? 0.5 : 0.30) + 0.22 * pulse) * Math.max(0.4, p);
    const gc = forced ? '255,20,140' : '255,80,190';
    const g = ctx.createRadialGradient(cx, cyc, 0, cx, cyc, glowR);
    g.addColorStop(0, `rgba(${gc},${a.toFixed(3)})`);
    g.addColorStop(0.55, `rgba(${gc},${(a * 0.4).toFixed(3)})`);
    g.addColorStop(1, `rgba(${gc},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - glowR, cyc - glowR, glowR * 2, glowR * 2);
    ctx.restore();

    // 2) 水位（外框之下；由下往上填到 pct，用右格遮罩精準裁成心形）
    if (p > 0) {
        const c0 = forced ? 'rgba(255,45,150,0.92)' : 'rgba(255,80,195,0.90)';
        const c1 = forced ? 'rgba(255,110,190,0.78)' : 'rgba(255,140,215,0.66)';
        const iw = Math.max(1, Math.round(w)), ih = Math.max(1, Math.round(h));
        const o = _getOff(iw, ih);
        o.clearRect(0, 0, iw, ih);
        const fillH = ih * p, topY = ih - fillH;
        const grad = o.createLinearGradient(0, ih, 0, 0);
        grad.addColorStop(0, c0); grad.addColorStop(1, c1);
        o.globalCompositeOperation = 'source-over';
        o.fillStyle = grad;
        o.fillRect(0, topY, iw, fillH);
        o.fillStyle = 'rgba(255,255,255,0.55)';          // 水面亮線
        o.fillRect(0, topY, iw, Math.max(1, ih * 0.035));
        o.globalCompositeOperation = 'destination-in';   // 只留遮罩（右格）不透明處
        const m = _cell(1);
        o.drawImage(_heartImg, m.sx, m.sy, m.sw, m.sh, 0, 0, iw, ih);
        o.globalCompositeOperation = 'source-over';
        ctx.drawImage(_offCv, 0, 0, iw, ih, x, y, w, h);
    }

    // 3) 外框（左格，全不透明 → 外框清晰、明顯）
    const f = _cell(0);
    ctx.drawImage(_heartImg, f.sx, f.sy, f.sw, f.sh, x, y, w, h);

    // 4) 中心數值（未強控＝百分比；強控＝清醒倒數時間 / ∞）
    ctx.save();
    const txt = (centerText != null) ? String(centerText) : String(Math.round(p * 100));
    const fs = Math.max(7, Math.round(h * (txt.length > 3 ? 0.24 : 0.32)));   // 時間字串較長 → 縮小
    ctx.font = `500 ${fs}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ny = y + h * 0.42;
    ctx.lineWidth = Math.max(1.4, fs * 0.11);
    ctx.strokeStyle = 'rgba(40,0,25,0.85)';
    ctx.strokeText(txt, cx, ny);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, cx, ny);
    ctx.restore();
}

// ── 提示框：「HSC 催眠進度為 N%」（畫在物件「右側」，不覆蓋物件）──
function _drawTooltip(text, rightX, midY) {
    const ctx = MainCanvas;
    ctx.save();
    ctx.font = '600 26px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const padX = 12, h = 40, gap = 8;
    const w = ctx.measureText(text).width + padX * 2;
    let x = rightX + gap;                 // 預設放球右側
    if (x + w > 1998) x = rightX - gap - w - 2 * gap;   // 右邊超出畫布 → 改放左側
    let y = midY - h / 2;                 // 垂直置中對齊球
    if (y < 2) y = 2;
    if (y + h > 998) y = 998 - h;
    ctx.fillStyle = 'rgba(20,0,20,0.85)';
    _roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,110,180,0.9)';
    ctx.lineWidth = 2;
    _roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + padX, y + h / 2);
    ctx.restore();
}

// ════════════════════════════════════════
//  對外：為單一角色畫催眠狀態（進度球＋他人符咒）
//  由 hooks.js 的 ChatRoomCharacterViewDrawOverlay 逐角色每幀呼叫。
// ════════════════════════════════════════
export function drawHypnoStatusForChar(C, charX, charY, zoom) {
    try {
        if (typeof MainCanvas === 'undefined' || !MainCanvas) return;
        if (!CONFIG.enabled) return;                 // 總開關關 → 進度球/符咒一律不畫
        if (C?.MemberNumber == null) return;
        // 用 DrawCharacter 記錄的真實繪製座標（含 ECHO 貼貼等活動 X 位移），退回 overlay 座標 →
        //  進度球與頭上符咒都跟著人物實際位置。
        const anchor = _charAnchor[C.MemberNumber];
        if (anchor && (Date.now() - anchor.t < 1000)) { charX = anchor.x; charY = anchor.y; zoom = anchor.zoom; }
        const isMe = Player?.MemberNumber != null && C.MemberNumber === Player.MemberNumber;

        let v, forced, color, style, showOrb, showTalis;
        let wakeInf = false, wakeSec = 0, wakeBase = 1;   // 強控時的清醒倒數（∞ / 剩餘秒 / 基底秒）
        if (isMe) {
            if (!CONFIG.hypnoEnabled) return;            // 自己：催眠狀態關 → 不顯示
            v = getHypnoValue();
            forced = isForced();
            color = CONFIG.hypnoAnimColor || '#f500b4';
            style = CONFIG.hypnoAnimStyle || 1;
            showOrb = true;
            showTalis = !!CONFIG.headTalisman && forced;   // 自己也用同一支 canvas 符咒 → 與他人尺寸/位置一致
            if (forced) {
                const rem = getWakeRemainingMs();
                wakeInf = !isFinite(rem);
                wakeSec = wakeInf ? 0 : rem / 1000;
                wakeBase = Math.max(1, (CONFIG.autoWakeMin || 30) * 60);
            }
        } else {
            const hs = C?.OnlineSharedSettings?.[ES_KEY]?.hypno;
            if (!hs) return;                             // 對方沒裝 HSC / 沒公告
            v = Math.max(0, Math.min(100, hs.v || 0));
            forced = !!hs.f;
            color = hs.c || '#f500b4';
            style = hs.s || 1;
            showOrb = !!CONFIG.seeOthersHypno;
            showTalis = !!CONFIG.seeOthersTalisman && forced;
            if (forced) {
                wakeInf = !!hs.inf;
                wakeSec = wakeInf ? 0 : _otherWakeSec(C.MemberNumber, Math.max(0, hs.r || 0));   // 本地平滑倒數
                wakeBase = Math.max(1, hs.rb || 1);
            }
        }

        // 進度球（自己讀執行期值、他人讀公告值；有催眠值或強控時顯示）
        //  尺寸：原圖 100×75 的 75%（= 75×56，× Zoom）；置中於 LSCG 圖示欄再右移 5、底邊在 LSCG 上方不重疊。
        if (showOrb && (v > 0 || forced)) {
            // 未強控：水位＝催眠值%、中心＝百分比、提示＝進度。
            // 強控：水位＝剩餘/基底、中心＝清醒倒數時間（∞ 則滿水＋∞）、提示＝清醒時間。
            let pct, centerText, tipText;
            if (forced) {
                pct = wakeInf ? 1 : Math.max(0, Math.min(1, wakeSec / wakeBase));
                centerText = wakeInf ? '∞' : _fmtTime(wakeSec);
                tipText = wakeInf ? ui('hscOrbTipInf') : ui('hscOrbTipTime', { t: _fmtTime(wakeSec) });
            } else {
                pct = v / 100;
                centerText = String(Math.round(v));
                tipText = ui('hscOrbTip', { n: Math.round(v) });
            }
            const w = 75 * zoom, h = 56 * zoom;
            const x = charX + 100 * zoom - w / 2;
            const y = charY + 95 * zoom - h;
            _drawOrb(x, y, w, h, pct, forced, centerText);
            if (typeof MouseIn === 'function' && MouseIn(x, y, w, h)) {
                _drawTooltip(tipText, x + w, y + h / 2);   // 物件右側、垂直置中
            }
        }

        // 頭上符咒（強控中；自己與他人用同一支繪製 → 尺寸/位置一致）。獨立於進度球，互不影響。
        if (showTalis) _drawTalisOnHead(C, color, style);
    } catch (e) { /* 靜默，避免中斷 BC 繪製 */ }
}
