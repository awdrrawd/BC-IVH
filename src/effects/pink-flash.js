// ════════════════════════════════════════
//  HSC effect: 粉紅暈染（強度動態）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { BASE_PINK_DURATION } from '../util/geometry.js';
import { effectScale, getOverlay } from '../util/util.js';

export function triggerPinkFlash() {
    if (!CONFIG.pinkFlash) return;
    const scale   = effectScale();
    const dur     = BASE_PINK_DURATION * Math.min(scale, 1.5);
    const alpha1  = Math.min(0.18 * scale, 0.35);
    const alpha2  = Math.min(0.55 * scale, 0.80);
    const overlay = getOverlay();
    const el      = document.createElement('div');
    Object.assign(el.style, {
        position:   'absolute',
        inset:      '0',
        background: `radial-gradient(ellipse at center, transparent 20%, rgba(255,105,180,${alpha1}) 60%, rgba(255,60,150,${alpha2}) 100%)`,
        animation:  `hscPinkPulse ${dur}ms ease-in-out forwards`,
    });
    overlay.appendChild(el);
    setTimeout(() => el.remove(), dur + 200);
}
