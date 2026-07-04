// ════════════════════════════════════════
//  HSC effect: 邊緣暗角（沉浸感）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { VIGNETTE_DURATION } from '../util/geometry.js';
import { effectScale, getOverlay } from '../util/util.js';

export function triggerVignette() {
    if (!CONFIG.vignette) return;
    const scale  = effectScale();
    const alpha  = Math.min(0.65 * scale, 0.90);
    const overlay = getOverlay();
    const el     = document.createElement('div');
    Object.assign(el.style, {
        position:   'absolute',
        inset:      '0',
        background: `radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,${alpha}) 100%)`,
        animation:  `hscVignette ${VIGNETTE_DURATION}ms ease-in-out forwards`,
    });
    overlay.appendChild(el);
    setTimeout(() => el.remove(), VIGNETTE_DURATION + 200);
}
