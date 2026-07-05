// ════════════════════════════════════════
//  HSC effect: 喘氣呼吸（每次呼吸噴一口氣，約 1 秒一次、持續約 10 秒）
//   位置：角色真實嘴部 +（中央頭像存在時）頭像嘴部
//   _emitBreathPuff / breathIntervalMs 也給「看到他人喘氣」等重複調用。
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { BODY_PANT_DY, DEPTH_PANT_EXTRA, HEAD_OFFSET, _cachedScaleX, getBodyAnchorScreen, getPlayerHeadScreenPos, getPlayerMouthScreenPos, playerDrawPos } from '../util/geometry.js';
import { getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

export function _breathSizeScale() {
    return Math.max(0.4, Math.min(2.2, (playerDrawPos.zoom || 1) * (_cachedScaleX || 0.3) * 2.4));
}

// 喘氣節奏：強度越高間隔越短。喘氣速度改為原本的 70%（間隔 ÷0.7 → 喘得較慢）。
export function breathIntervalMs(intensity) {
    const it = (typeof intensity === 'number' && intensity > 0) ? intensity : CONFIG.intensity;
    const base = Math.max(600, Math.min(2400, Math.round(2000 - (it - 1) * 700)));
    return Math.round(base / 0.7);
}

// 取得本次呼吸要噴氣的嘴部位置（中軸 X 與螺旋同在頭部，高度在嘴巴）
//  ignoreHeadshot=true → 一律用人物身上座標（日常干擾／看他人喘氣用，不判斷中央頭像）
//  ignoreHeadshot=false + 開啟中央頭像 → 從「中央頭像」的嘴部噴氣（讓頭像會喘氣）
export function getBreathMouths(ignoreHeadshot) {
    const useHead = !ignoreHeadshot && CONFIG.centerHeadshot;   // 從中央頭像噴氣
    if (useHead) {
        // 中央頭像：用頭像嘴部（固定中央，不需活動位移）+70
        const head  = getPlayerHeadScreenPos(false);
        const mouth = getPlayerMouthScreenPos(false);
        return [{ x: head.x, y: mouth.y + 70, ss: _breathSizeScale() }];
    }
    // 身上喘氣：用共用定位 getBodyAnchorScreen（含 ECHO 貼貼等 X 位移）＋身體偏移
    const m = getBodyAnchorScreen(Player, 250 + HEAD_OFFSET.x, HEAD_OFFSET.mouthAY, 0, BODY_PANT_DY + DEPTH_PANT_EXTRA + 5);
    if (m) return [{ x: m.x, y: m.y, ss: _breathSizeScale() }];
    // 退回舊法（拿不到 anchor 時）
    const head  = getPlayerHeadScreenPos(true), mouth = getPlayerMouthScreenPos(true);
    return [{ x: head.x, y: mouth.y + BODY_PANT_DY + DEPTH_PANT_EXTRA + 5, ss: _breathSizeScale() }];
}

// 噴一口氣：倒三角扇形（由嘴部往上展開），每團一次性 由小變大、由濃變淡，約 0.5 秒
export function _emitBreathPuff(overlay, mouth) {
    // 只在聊天室內顯示喘氣；離開聊天室（profile／更衣室等）一律不再冒白霧
    if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
    const ss = mouth.ss || 1;
    const n  = 5 + Math.floor(Math.random() * 2);   // 3~4 團組成倒三角扇形
    for (let i = 0; i < n; i++) {
        const size = (15 + Math.random() * 12) * ss;
        // 均勻展開 -1~1 + 微抖動 → 對稱三角（嘴部窄），中軸對齊螺旋
        const spread = (n > 1 ? (i / (n - 1)) * 2 - 1 : 0) + (Math.random() - 0.5) * 0.3;
        const dx   = spread * (26 + Math.random() * 18) * ss;
        const dy   = (38 + Math.random() * 34) * ss;            // 旋轉 180°：改為往下飄
        const sc   = 2.0 + Math.random() * 1.0;                 // 由小變大
        const a0   = Math.min(0.70, 0.50 + Math.random() * 0.18); // 比原本亮約 15%
        const PUFF_DUR = 3450;   // 約原本 15% 速度（飛得慢很多）
        const p = document.createElement('div');
        Object.assign(p.style, {
            position:     'fixed',
            left:         `${mouth.x}px`,
            top:          `${mouth.y}px`,
            width:        `${size}px`,
            height:       `${size}px`,
            borderRadius: '50%',
            background:   `radial-gradient(circle at 50% 50%, rgba(255,255,255,${a0}) 0%, rgba(255,255,255,${(a0 * 0.5).toFixed(3)}) 45%, rgba(255,255,255,0) 72%)`,
            filter:       `blur(${(3 + Math.random() * 2).toFixed(1)}px)`,
            transform:    'translate(-50%,-50%) scale(0.35)',
            animation:    `hscPant ${PUFF_DUR}ms ease-out forwards`,
            willChange:   'transform, opacity',
            zIndex:       HSC_Z.particle,
        });
        p.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        p.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        p.style.setProperty('--sc', sc.toFixed(2));
        p.style.setProperty('--a0', a0.toFixed(2));
        overlay.appendChild(p);
        setTimeout(() => p.remove(), PUFF_DUR + 200);
    }
}

let _breathLoopUntil = 0;
let _breathIgnoreHead = false;   // 目前喘氣迴圈是否強制用人物身上座標（深度）
export function triggerSteamParticles(force = false, ignoreHeadshot = false) {
    if (!force && !CONFIG.steamParticles) return;
    const overlay = getOverlay();
    _breathIgnoreHead = ignoreHeadshot;
    // 延長本次呼吸的結束時間（重複觸發時不疊加多個迴圈，只延長）
    const FRESH = _breathLoopUntil < Date.now();
    _breathLoopUntil = Date.now() + 6000;   // 約 7 秒（原 10 秒縮短 3 秒）
    if (!FRESH) return;                      // 已有迴圈在跑 → 只延長時間

    const breathe = () => {
        if (Date.now() > _breathLoopUntil) return;
        getBreathMouths(_breathIgnoreHead).forEach(m => _emitBreathPuff(overlay, m));
        setTimeout(breathe, breathIntervalMs(CONFIG.intensity));  // 強度越高越頻繁
    };
    breathe();
}
