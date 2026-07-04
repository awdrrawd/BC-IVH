// ════════════════════════════════════════
//  HSC effect: 高潮特效（快照破壞：像素碎裂 + 紅白閃 + 震動）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { playSoundCategory } from './sound.js';
import { getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

export function triggerClimaxEffect(scale = 1) {
    if (!CONFIG.climax) return;
    if (CONFIG.sound) playSoundCategory('climax', Math.min(0.5 + scale * 0.2, 1));  // 高潮聲
    const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
    if (!canvas) return;

    // 注意：不要用 canvas.toDataURL() 當前置檢查——房間背景是跨網域圖片會讓 MainCanvas
    //  被 taint，toDataURL 直接丟例外導致整個高潮特效被 return 掉（破裂消失）。
    //  碎片是用 drawImage 貼「被 taint 的 canvas」再以 <canvas> 元素顯示，taint 完全不影響。
    const rect = canvas.getBoundingClientRect();

    // ── 全螢幕用 window 尺寸（不限 canvas rect）──
    const SW = window.innerWidth;
    const SH = window.innerHeight;

    const overlay = getOverlay();

    // ── Layer 1: 黑幕底層（碎片飛散後顯示，然後慢慢淡出）──
    const blackBg = document.createElement('div');
    Object.assign(blackBg.style, {
        position:      'fixed',
        inset:         '0',
        background:    'black',
        zIndex:        HSC_Z.climaxBg,   // 在碎片下面，確保碎片飛散後看到黑
        opacity:       '1',
        pointerEvents: 'none',
        transition:    'none',
    });
    document.body.appendChild(blackBg);

    // ── 紅白閃光（全螢幕）──
    const flash = document.createElement('div');
    Object.assign(flash.style, {
        position:      'fixed',
        inset:         '0',
        zIndex:        HSC_Z.climaxFlash,
        opacity:       '0',
        pointerEvents: 'none',
        animation:     `hscClimaxFlash ${Math.round(700 / scale)}ms ease-out forwards`,
    });
    overlay.appendChild(flash);
    setTimeout(() => flash.remove(), 800);

    // ── 不規則多邊形碎片 ──
    // 先把 canvas 畫到一個全螢幕大小的 offscreen canvas
    const master = document.createElement('canvas');
    master.width  = SW;
    master.height = SH;
    const mctx = master.getContext('2d');
    // canvas 可能不是全螢幕，按實際位置繪製
    try {
        mctx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height);
    } catch(e) { return; }

    // 產生 Voronoi 風格的隨機種子點
    const FRAG_COUNT = 48 + Math.round(scale * 10); // 48~60 個碎片（更密集）
    const seeds = Array.from({length: FRAG_COUNT}, () => ({
        x: Math.random() * SW,
        y: Math.random() * SH,
    }));

    // 每個種子建立一個不規則多邊形碎片（簡化：找最近的幾個鄰居拉出凸包近似）
    // 實作：用 clip path SVG polygon，讓每個碎片 canvas 用 clip 裁切
    seeds.forEach((seed, si) => {
        // 用隨機偏移建出一個不規則多邊形（6~9 個頂點）
        const sides  = 6 + Math.floor(Math.random() * 4);
        const radius = 60 + Math.random() * 80 * scale;
        const pts    = [];
        for (let k = 0; k < sides; k++) {
            const angle = (k / sides) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
            const r     = radius * (0.55 + Math.random() * 0.7);
            pts.push({ x: seed.x + r * Math.cos(angle), y: seed.y + r * Math.sin(angle) });
        }

        // 建立 canvas，clip 成多邊形，貼上截圖
        const fc  = document.createElement('canvas');
        fc.width  = SW;
        fc.height = SH;
        const fctx = fc.getContext('2d');
        fctx.beginPath();
        fctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => fctx.lineTo(p.x, p.y));
        fctx.closePath();
        fctx.clip();
        fctx.drawImage(master, 0, 0);

        // 輕微邊緣描邊，增加撕裂感
        fctx.strokeStyle = 'rgba(255,120,160,0.6)';
        fctx.lineWidth   = 1.5;
        fctx.beginPath();
        fctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => fctx.lineTo(p.x, p.y));
        fctx.closePath();
        fctx.stroke();

        const dx      = (seed.x - SW / 2) * (0.8 + Math.random() * 1.2) * scale;
        const dy      = (seed.y - SH / 2) * (0.8 + Math.random() * 1.2) * scale;
        const rot     = (Math.random() - 0.5) * 80 * scale;
        const dur     = (800 + Math.random() * 600) * (1 / Math.max(scale, 0.5));
        // 定格停頓：碎片先靜止 550ms（讓玩家看清破碎），再飛散
        // 每個碎片的 delay = 定格時間 + 輕微錯開（各片不完全同時）
        const FREEZE  = 550;
        const scatter = FREEZE + si * 10;

        Object.assign(fc.style, {
            position:        'fixed',
            left:            '0',
            top:             '0',
            width:           `${SW}px`,
            height:          `${SH}px`,
            pointerEvents:   'none',
            zIndex:          HSC_Z.climaxShards,
            transformOrigin: `${seed.x}px ${seed.y}px`,
            // transition 帶入 delay，飛散前靜止
            transition:      `transform ${dur}ms cubic-bezier(0.15,0,0.9,1) ${scatter}ms,
                              opacity   ${dur * 0.45}ms ease ${scatter + dur * 0.55}ms`,
            willChange:      'transform, opacity',
        });
        document.body.appendChild(fc);

        // 立刻渲染（定格在原位），delay 到時再飛散
        requestAnimationFrame(() => requestAnimationFrame(() => {
            fc.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${0.2 + Math.random() * 0.5})`;
            fc.style.opacity   = '0';
        }));

        setTimeout(() => fc.remove(), scatter + dur + 300);
    });

    // ── 全螢幕震動 ──
    const shakeEl = document.createElement('div');
    Object.assign(shakeEl.style, {
        position:      'fixed',
        inset:         '0',
        pointerEvents: 'none',
        zIndex:        HSC_Z.climaxFlash,
        animation:     `hscClimaxShake ${Math.round(500 / scale)}ms ease-out forwards`,
    });
    overlay.appendChild(shakeEl);
    setTimeout(() => shakeEl.remove(), 600);

    // ── 黑幕淡出（碎片都飛散後，黑幕在 1~1.5 秒內淡出移除）──
    // 等最慢的碎片飛完（FREEZE=550 + scatter最大 si*10 + dur最長約1500）
    const blackFadeDelay = 550 + FRAG_COUNT * 10 + 800;
    const blackFadeDur   = 1200 + Math.random() * 300;
    setTimeout(() => {
        blackBg.style.transition = `opacity ${blackFadeDur}ms ease`;
        blackBg.style.opacity    = '0';
    }, blackFadeDelay);
    setTimeout(() => blackBg.remove(), blackFadeDelay + blackFadeDur + 100);
}
