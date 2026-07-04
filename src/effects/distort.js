// ════════════════════════════════════════
//  HSC effect: 快照扭曲（截取 canvas → img → CSS transform → 刪除）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { isForced } from '../hypno/hypno.js';
import { effectScale, getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

export function triggerScreenDistort() {
    if (!CONFIG.screenDistort) return;
    // 強控中：世界已持續模糊＋淡紫（催眠狀態基礎濾鏡）。扭曲快照結尾會「回正成清晰無染色」，
    //  疊在其上會讓基礎濾鏡看起來被移除一瞬 → 強控中直接略過扭曲，保持濾鏡不被打斷。
    if (isForced()) return;
    const scale  = effectScale();
    const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
    if (!canvas) return;

    // 截圖
    let dataURL;
    try { dataURL = canvas.toDataURL(); } catch(e) { return; } // 跨域保護時跳過

    const rect    = canvas.getBoundingClientRect();
    const overlay = getOverlay();

    const snap = document.createElement('img');
    snap.src = dataURL;
    Object.assign(snap.style, {
        position:        'fixed',
        left:            `${rect.left}px`,
        top:             `${rect.top}px`,
        width:           `${rect.width}px`,
        height:          `${rect.height}px`,
        pointerEvents:   'none',
        zIndex:          HSC_Z.distortSnap,  // canvas 上,但在 overlay 文字效果下
        transformOrigin: '50% 50%',
        willChange:      'transform, filter, opacity',
    });
    document.body.appendChild(snap);

    // 催眠感：輕微旋轉 + 縮小拉近 + 粉色濾鏡，不做 skew
    const blurAmt = (2.5 * Math.min(scale, 1.8)).toFixed(1);
    const rotAmt  = (2.5 * Math.min(scale, 1.6)).toFixed(2);  // 最多約 4deg
    const HOLD    = 600;    // 扭曲維持時間
    const RECOVER = 1800;   // 恢復時間（慢慢清醒感）

    // 第一幀：旋轉縮小 + 模糊 + 粉調
    requestAnimationFrame(() => {
        snap.style.transition = `transform 400ms cubic-bezier(0.2,0,0.8,1),
                                 filter    400ms ease,
                                 opacity   200ms ease`;
        snap.style.transform  = `rotate(${rotAmt}deg) scale(0.97)`;
        snap.style.filter     = `blur(${blurAmt}px) brightness(0.85) saturate(1.5) hue-rotate(-15deg)`;
        snap.style.opacity    = '1';
    });

    // 中段：反向輕轉（回盪感）
    setTimeout(() => {
        snap.style.transition = `transform ${HOLD}ms cubic-bezier(0.4,0,0.6,1),
                                 filter    ${HOLD}ms ease`;
        snap.style.transform  = `rotate(-${(rotAmt * 0.4).toFixed(2)}deg) scale(0.99)`;
        snap.style.filter     = `blur(${(blurAmt * 0.4).toFixed(1)}px) brightness(0.93) saturate(1.2) hue-rotate(-5deg)`;
    }, 420);

    // 恢復：緩緩歸正，opacity 延後淡出（意識慢慢回來）
    setTimeout(() => {
        snap.style.transition = `transform ${RECOVER}ms cubic-bezier(0.25,0.1,0.25,1),
                                 filter    ${RECOVER}ms cubic-bezier(0.25,0.1,0.25,1),
                                 opacity   ${Math.round(RECOVER * 0.55)}ms ease ${Math.round(RECOVER * 0.45)}ms`;
        snap.style.transform  = 'rotate(0deg) scale(1)';
        snap.style.filter     = 'blur(0px) brightness(1) saturate(1) hue-rotate(0deg)';
        snap.style.opacity    = '0';
    }, 420 + HOLD + 80);

    // 清除快照
    setTimeout(() => snap.remove(), 420 + HOLD + RECOVER + 300);
}
