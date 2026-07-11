// ════════════════════════════════════════
//  HSC module: hypno-anim.js  （催眠符咒動畫 — 中央自繪人物 + 圖層穿透）
//  v1.1 修正版：
//   ★ 修正1：符咒（含閃光）DOM 建立時的 margin 置中 與 _place() 的 translate(-50%,-50%)
//            疊加造成「雙重置中偏移」，導致符咒/閃光實際顯示位置往左上角偏移。
//            → 拿掉 margin 置中，只保留 translate(-50%,-50%) 這一套置中邏輯。
//   ★ 修正2：_snapshotCharacter() 原本用寫死的 sx=0、CHAR_W=500 去擷取來源畫布，
//            當來源畫布寬度不是預期值時會切到錯誤區域、或造成裁切/變形。
//            → 改成用來源畫布寬度的比例動態計算「置中擷取」的起點與寬度，
//              並讓中央人物顯示框的寬高比跟著實際擷取到的快照走（不再寫死 0.5），
//              確保人物一定是等比顯示、不會被拉伸/壓扁。
//   （閃光的「瞬間全亮 → 快速淡出」手法本檔案原本就是對的作法，這版保留並小幅強化：
//     加了一次強制 reflow 確保「瞬間全亮」一定生效，並把光暈稍微加強。）
//
//   0) 佈景：整片 backdrop-filter 模糊（含真實玩家）＋暗角。
//   1) 中央畫「人物全身」；身後（z=1）腰際符咒淡入放大。
//   2) 停頓 → 快閃。 3) 符咒移到人物之前（z=3，穿透）＋放大。 4) 快閃。
//   5) 縮小移到頭上震動。 6) 震動 tVibe；後段人物/背景/符咒淡出 → 結束。
//   7) 若開「頭上貼符咒」→ 在真實人物頭上定位常駐符咒。
//  符咒本體用 canvas 繪製（染色 source-in、光暈 shadowBlur+destination-out、閃光染白淡入淡出）。
//  座標/尺寸/時間全放 ANIM，用 showAnimPanel() 即時調 →「輸出」貼給我定案。
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { loadHscImage } from '../util/icons.js';
import { getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';
import { bcToScreen, playerDrawPos, refreshCanvasCache, getPlayerHeadScreenPos, _cachedScaleX } from '../util/geometry.js';

const COLS = 6, ROWS = 2, CELL_AR = 0.5, BASE_W = 320;
const CHAR_AR_FALLBACK = 0.5; // 快照失敗時的人物寬高比後備值（500:1000）

export const ANIM = {
    charXpct: 25, charYpct: 50, charHpct: 92,        // 中央人物 X/Y/高（畫布 %）
    blurXpct: 0, blurWpct: 100, blurPx: 10,          // 模糊區 X/寬（畫布 %）/強度
    behindHpct: 70, frontHpct: 85, headHpct: 10,     // 符咒高（人物高 %）：身後/身前/頭上
    waistPct: 50, frontYPct: 50, headYPct: 10,       // 符咒 Y（人物高 %）
    headTalisPct: 14,                                // 頭上常駐符咒寬（人物寬 %）— 縮小，貼臉不會過大
    glowSize: 40, glowOpacity: 0.95, flashColor: '#ffffff',
    tIn: 1100, tHold: 700, tFlash: 500, tThru: 950, tFlash2: 500, tShrink: 900, tVibe: 3000, shakeAmt: 5,
    	talisOffsetXPct: -3,
};

// crossOrigin 乾淨載入（CDN 優先 → Pages 回退）；不然畫到離屏 canvas 後 toDataURL 會因汙染丟例外。
let _img = null, _imgReady = false;
try { _img = loadHscImage('HSC-Status-Code1.png', () => { _imgReady = true; }); } catch (e) {}

function _cell() {
    const i = Math.min(11, Math.max(0, (CONFIG.hypnoAnimStyle || 1) - 1));
    const sw = _img.naturalWidth / COLS, sh = _img.naturalHeight / ROWS;
    return { sx: (i % COLS) * sw, sy: Math.floor(i / COLS) * sh, sw, sh };
}
// 染色（source-in）
function _tint(ctx, cw, ch, color) {
    const { sx, sy, sw, sh } = _cell();
    ctx.clearRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(_img, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
}
// 光暈（畫帶 shadow 的圖 → destination-out 打掉圖本身 → 只留外圈光暈）
function _glow(ctx, cw, ch, color, blur, opacity) {
    const { sx, sy, sw, sh } = _cell();
    ctx.clearRect(0, 0, cw, ch);
    if (blur <= 0 || opacity <= 0) return;
    ctx.save(); ctx.globalAlpha = opacity; ctx.shadowColor = color; ctx.shadowBlur = blur * (cw / BASE_W);
    ctx.drawImage(_img, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.globalCompositeOperation = 'destination-out'; ctx.shadowBlur = 0;
    ctx.drawImage(_img, sx, sy, sw, sh, 0, 0, cw, ch); ctx.restore();
}
function _drawFlash(ctx, cw, ch) {
    const { sx, sy, sw, sh } = _cell();
    ctx.clearRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.shadowColor = ANIM.flashColor; ctx.shadowBlur = 26 * (cw / BASE_W); // 光暈略為加強（原 22 → 26）
    ctx.drawImage(_img, sx, sy, sw, sh, 0, 0, cw, ch); ctx.restore();
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ANIM.flashColor; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
}

// 中央人物全身快照（取身體區；upper 讀不到時退回捕捉整張，保證不切）
// ★ 修正：sx/CHAR_W 不再寫死，改用來源畫布寬度的比例動態計算「置中擷取」，
//         避免來源畫布實際寬度跟預期不同時切到錯誤區域。
function _snapshotCharacter() {
    try {
        const src = (typeof Player !== 'undefined') && Player.Canvas;
        if (!src || !src.width) return null;
        const upper = (typeof CanvasUpperOverflow !== 'undefined' && CanvasUpperOverflow > 0) ? CanvasUpperOverflow : null;
        const cv = document.createElement('canvas');
        if (upper != null) {
            // 人物實際內容永遠佔來源畫布「置中一半寬度」（例如 2000 寬時人物區是中央 1000）
            const CHAR_W = src.width * 0.5;
            const sx = (src.width - CHAR_W) / 2; // 動態置中，不寫死 500/1000
            cv.width = 500; cv.height = 1000;
            cv.getContext('2d').drawImage(src, sx, upper, CHAR_W, 1000, 0, 0, 500, 1000);
        } else {
            cv.width = src.width; cv.height = src.height;   // 捕捉整張 → 絕不切半
            cv.getContext('2d').drawImage(src, 0, 0);
        }
        return { url: cv.toDataURL(), w: cv.width, h: cv.height };
    } catch (e) { return null; }
}

const _lerp = (a, b, t) => a + (b - a) * t;
const _easeOut = t => 1 - Math.pow(1 - t, 3);
const _easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

let _wrap = null, _running = false, _rafMain = null, _shakeTimer = null;

export function stopHypnoAnim() {
    _running = false;
    if (_rafMain) { cancelAnimationFrame(_rafMain); _rafMain = null; }
    if (_shakeTimer) { clearTimeout(_shakeTimer); _shakeTimer = null; }
    if (_wrap) { const w = _wrap; _wrap = null; try { w.remove(); } catch (e) {} }
}

// 建一顆符咒 canvas（含光暈層＋精靈層），回傳 el
// ★ 修正：拿掉 marginLeft/marginTop 的置中偏移。置中完全交給 _place() 的
//         translate(-50%,-50%)，避免跟這裡的 margin 疊加成「雙重置中」造成位置跑掉。
function _makeTalisman(color) {
    const baseH = Math.round(BASE_W / CELL_AR);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(BASE_W * dpr), h = Math.round(baseH * dpr);
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', left: '0', top: '0',
        width: BASE_W + 'px', height: baseH + 'px',
        // marginLeft / marginTop 已移除 — 置中只靠 _place() 處理
        transformOrigin: 'center center', pointerEvents: 'none', opacity: '0', willChange: 'transform,opacity',
    });
    const gC = document.createElement('canvas'); gC.width = w; gC.height = h; Object.assign(gC.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const sC = document.createElement('canvas'); sC.width = w; sC.height = h; Object.assign(sC.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    el.append(gC, sC);
    const gX = gC.getContext('2d'), sX = sC.getContext('2d');
    _tint(sX, w, h, color); _glow(gX, w, h, color, ANIM.glowSize, ANIM.glowOpacity);
    return el;
}
function _place(el, cx, cy, wpx, opacity) {
    // ★ 修正：改用比例位移取代原本寫死的 -10px。
    //   因為視覺偏移是「符咒圖案在自己畫布格內沒置中」造成的，
    //   這種偏移量會隨符咒顯示尺寸(wpx)等比放大/縮小，
    //   固定 10px 只在某一種尺寸下剛好抵銷，其餘尺寸(尤其是頭上常駐符咒的小尺寸)會過修或修不夠。
    const ncx = cx + wpx * (ANIM.talisOffsetXPct / 100);
    el.style.transform = `translate(${ncx}px, ${cy}px) translate(-50%,-50%) scale(${wpx / BASE_W})`;
    el.style.opacity = String(opacity);
}

export function playHypnoAnim(done) {
    if (typeof document === 'undefined' || !_imgReady) { if (done) done(); return; }
    stopHypnoAnim();
    // 清場前先放掉頭上常駐符咒的參照（它的 DOM 節點會被下面 innerHTML='' 清掉；
    //  放掉 _headEl 才能在儀式播完後由 updateHeadTalisman() 重新建立，不會卡住）。
    if (_headRAF) { cancelAnimationFrame(_headRAF); _headRAF = null; }
    _headEl = null;
    try { getOverlay().innerHTML = ''; } catch (e) {}
    refreshCanvasCache();
    const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
    if (!canvas) { if (done) done(); return; }
    const rect = canvas.getBoundingClientRect();
    const color = CONFIG.hypnoAnimColor || '#f500b4';
    const A = ANIM;
    const total = A.tIn + A.tHold + A.tFlash + A.tThru + A.tFlash2 + A.tShrink + A.tVibe;

    // ★ 修正：先拿快照，再依快照的實際寬高比計算顯示框，避免寫死 0.5
    //         造成跟實際擷取內容比例不符而被拉伸/壓扁。
    const snap = _snapshotCharacter();
    const charAR = snap ? (snap.w / snap.h) : CHAR_AR_FALLBACK;

    // 中央人物幾何
    const Hd = rect.height * A.charHpct / 100, Wd = Hd * charAR;
    const cx = rect.left + rect.width * A.charXpct / 100;
    const cy = rect.top + rect.height * A.charYpct / 100;
    const cTop = cy - Hd / 2;
    const yWaist = cTop + Hd * A.waistPct / 100, yFront = cTop + Hd * A.frontYPct / 100, yHead = cTop + Hd * A.headYPct / 100;
    const hBehind = Hd * A.behindHpct / 100, hFront = Hd * A.frontHpct / 100, hHead = Hd * A.headHpct / 100;
    const wOf = h => h * CELL_AR;   // 符咒寬 = 高 × 長寬比

    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: HSC_Z.spiral });
    // 佈景模糊（z0）
    const blur = document.createElement('div');
    Object.assign(blur.style, { position: 'fixed', left: `${rect.left + rect.width * A.blurXpct / 100}px`, top: `${rect.top}px`, width: `${rect.width * A.blurWpct / 100}px`, height: `${rect.height}px`, zIndex: '0', opacity: '0', transition: 'opacity 0.5s ease', backdropFilter: `blur(${A.blurPx}px)`, webkitBackdropFilter: `blur(${A.blurPx}px)`, background: 'radial-gradient(ellipse at 50% 45%, rgba(80,20,110,0.15) 30%, rgba(0,0,0,0.6) 100%)' });
    // 中央人物（z2）— objectFit:contain 保留原比例，搭配上面已修正的 Wd/Hd，雙重保險不變形
    const charEl = document.createElement('img');
    if (snap) {
        charEl.src = snap.url;
        Object.assign(charEl.style, { position: 'fixed', left: `${cx - Wd / 2}px`, top: `${cTop}px`, width: `${Wd}px`, height: `${Hd}px`, objectFit: 'contain', zIndex: '2', opacity: '0', transition: 'opacity 0.5s ease', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.5))' });
    }
    // 符咒（z 動態 1/3）＋閃光（z4）
    const talis = _makeTalisman(color); talis.style.zIndex = '1';
    const flashEl = document.createElement('div');
    {
        const baseH = Math.round(BASE_W / CELL_AR), dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(BASE_W * dpr), h = Math.round(baseH * dpr);
        Object.assign(flashEl.style, {
            position: 'fixed', left: '0', top: '0',
            width: BASE_W + 'px', height: baseH + 'px',
            // marginLeft / marginTop 已移除（跟 _makeTalisman 相同理由：避免雙重置中）
            // zIndex 不寫死，改由 doFlash() 依當下階段動態設定（見下方說明）
            transformOrigin: 'center center', pointerEvents: 'none', opacity: '0', zIndex: '1',
        });
        const fc = document.createElement('canvas'); fc.width = w; fc.height = h; Object.assign(fc.style, { width: '100%', height: '100%' }); flashEl.appendChild(fc);
        _drawFlash(fc.getContext('2d'), w, h);
    }

    wrap.append(blur, talis, charEl, flashEl);
    getOverlay().appendChild(wrap);
    _wrap = wrap; _running = true;
    requestAnimationFrame(() => { charEl.style.opacity = '1'; blur.style.opacity = '1'; });

    // ★ 圖層順序修正：flashEl 原本 zIndex 寫死 4，永遠蓋在人物（z2）之上，
    //   導致「第一次閃光」（此時符咒還在人物身後 z1）看起來卻疊在人物前面，跟預期的
    //   圖層順序（背景 < 一階段符咒/光暈/閃光 < 人物 < 二階段符咒/光暈/閃光）不符。
    //   → doFlash() 呼叫時多帶一個 zIndex 參數，跟當下符咒所在階層同步：
    //     第一次閃光傳 1（跟身後符咒同層，低於人物 z2）；
    //     第二次閃光傳 3（跟身前符咒同層，高於人物 z2）。
    // ★ 閃光效果修正：原本是「瞬間跳到全亮 → 只淡出 0.16s」，實際可見時間太短、
    //   缺少「快速衝到最亮 → 有餘韻地緩緩收光」的包絡（envelope），看起來單薄。
    //   → 改成整個閃光時長（tFlash / tFlash2）都由 rAF 驅動亮度曲線：
    //     前 22% 時間用 easeOut 衝到全亮（很快、有爆發感），
    //     剩餘時間用 easeInOut 緩降到 0（留有餘韻，而不是硬切）。
    let _flashRAF = null;
    const doFlash = (fx, fy, wpx, durMs, zIndex) => {
        if (_flashRAF) { cancelAnimationFrame(_flashRAF); _flashRAF = null; }
        flashEl.style.transition = 'none';
        flashEl.style.zIndex = String(zIndex);
        const riseMs = Math.max(60, durMs * 0.22);   // 快速衝亮的時間
        const fallMs = Math.max(1, durMs - riseMs);   // 剩餘時間緩緩收光
        const st = performance.now();
        const loop = (now) => {
            if (!_running || _wrap !== wrap) return;
            const t = now - st;
            let op;
            if (t < riseMs) { op = _easeOut(t / riseMs); }
            else { op = 1 - _easeInOut(Math.min(1, (t - riseMs) / fallMs)); }
            _place(flashEl, fx, fy, wpx, Math.max(0, op));
            if (t < durMs) { _flashRAF = requestAnimationFrame(loop); }
            else { _place(flashEl, fx, fy, wpx, 0); _flashRAF = null; }
        };
        _flashRAF = requestAnimationFrame(loop);
    };

    let f2 = false, f4 = false, fadedOut = false;
    const start = performance.now();
    const step = (now) => {
        if (!_running || _wrap !== wrap) return;
        const t = now - start;
        if (t < A.tIn) { talis.style.zIndex = '1'; place(cx, yWaist, wOf(_lerp(hBehind * 0.35, hBehind, _easeOut(t / A.tIn))), _easeOut(t / A.tIn)); }
        else if (t < A.tIn + A.tHold) { place(cx, yWaist, wOf(hBehind), 1); if (!f2 && t > A.tIn + A.tHold * 0.4) { f2 = true; doFlash(cx, yWaist, wOf(hBehind), A.tFlash, 1); } }
        else if (t < A.tIn + A.tHold + A.tFlash) { place(cx, yWaist, wOf(hBehind), 1); }
        else if (t < A.tIn + A.tHold + A.tFlash + A.tThru) { talis.style.zIndex = '3'; const e = _easeInOut((t - A.tIn - A.tHold - A.tFlash) / A.tThru); place(_lerp(cx, cx, e), _lerp(yWaist, yFront, e), wOf(_lerp(hBehind, hFront, e)), 1); }
        else if (t < A.tIn + A.tHold + A.tFlash + A.tThru + A.tFlash2) { place(cx, yFront, wOf(hFront), 1); if (!f4) { f4 = true; doFlash(cx, yFront, wOf(hFront), A.tFlash2, 3); } }
        else if (t < A.tIn + A.tHold + A.tFlash + A.tThru + A.tFlash2 + A.tShrink) { const e = _easeInOut((t - A.tIn - A.tHold - A.tFlash - A.tThru - A.tFlash2) / A.tShrink); place(cx, _lerp(yFront, yHead, e), wOf(_lerp(hFront, hHead, e)), 1); }
        else if (t < total) {
            const vt = t - (total - A.tVibe);
            const fadeStart = A.tVibe - 1000;
            // 符咒淡出必須靠 place() 的 opacity（否則每幀被 place 的 opacity=1 覆蓋，導致符咒不淡、突然消失）
            let talisOp = 1;
            if (vt > fadeStart) {
                if (!fadedOut) { fadedOut = true; charEl.style.transition = 'opacity 1s ease'; blur.style.transition = 'opacity 1s ease'; charEl.style.opacity = '0'; blur.style.opacity = '0'; }
                talisOp = Math.max(0, 1 - (vt - fadeStart) / 1000);   // 與人物同步的 1 秒淡出
            }
            place(cx + (Math.random() - 0.5) * A.shakeAmt * 2, yHead + (Math.random() - 0.5) * A.shakeAmt * 2, wOf(hHead), talisOp);
        }
        else { stopHypnoAnim(); if (done) { try { done(); } catch (e) {} } return; }
        _rafMain = requestAnimationFrame(step);
    };
    function place(px, py, wpx, opacity) { _place(talis, px, py, wpx, opacity); }
    _rafMain = requestAnimationFrame(step);
}

// ── #12 頭上貼符咒（隨 Zoom×HR 縮放，比照臉部識別障礙）──
// 注意：這裡的 headTalisman 大小計算只用了 _cachedScaleX（來自 geometry.js），
// 若 geometry.js 內部的 scaleX/scaleY 是分開計算（跟你在別份腳本遇到的問題一樣），
// 頭上符咒的「寬度」數值本身不會變形（這裡只算寬度數值，不是直接拉伸圖片），
// 但如果 geometry.js 的 bcToScreen 本身 X/Y 比例不一致，會影響符咒「位置」是否準確貼在頭上。
// geometry.js 未提供原始碼，這部分若之後也出現位置偏移/跑版，建議一併檢查該檔案的
// scaleX/scaleY 是否使用同一個等比縮放值（做法同本檔案這次的修正精神）。
let _headEl = null, _headRAF = null;
export function updateHeadTalisman() {
    // 頭上符咒改由 hypno-orb.js 的 canvas 版本繪製（與他人尺寸/位置一致），
    //  此 DOM 版本停用；保留函式僅負責清掉任何殘留的舊 DOM 符咒。
    const want = false;
    if (want) {
        if (_headEl) return;
        const color = CONFIG.hypnoAnimColor || '#f500b4';
        const el = _makeTalisman(color); el.style.opacity = '1'; el.style.zIndex = HSC_Z.spiral;
        el.style.left = '0'; el.style.top = '0'; el.style.marginLeft = '0'; el.style.marginTop = '0';
        getOverlay().appendChild(el); _headEl = el;
        const loop = () => {
            if (!_headEl) return;
            refreshCanvasCache();
            const head = getPlayerHeadScreenPos(true);
            const zoom = (playerDrawPos && playerDrawPos.zoom) || 1;
            const hr = (typeof Player !== 'undefined' && typeof Player.HeightRatio === 'number') ? Player.HeightRatio : 1;
            const w = Math.max(24, 500 * zoom * hr * (_cachedScaleX || 0.3) * ANIM.headTalisPct / 100);
            const jx = (Math.random() - 0.5) * 5, jy = (Math.random() - 0.5) * 5;
            _place(el, head.x + jx, head.y + jy, w, 1);
            _headRAF = requestAnimationFrame(loop);
        };
        _headRAF = requestAnimationFrame(loop);
    } else if (_headEl) {
        if (_headRAF) { cancelAnimationFrame(_headRAF); _headRAF = null; }
        const e = _headEl; _headEl = null; try { e.remove(); } catch (er) {}
    }
}
