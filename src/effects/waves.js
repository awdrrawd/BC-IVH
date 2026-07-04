// ════════════════════════════════════════
//  HSC effect: 同心圓電波（左半邊任意位置，每次固定 3 組）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { BASE_WAVE_DURATION, bcToScreen } from '../util/geometry.js';
import { effectScale, getOverlay, randInt } from '../util/util.js';

export function triggerHypnoWaves(wordCount = 1) {
    if (!CONFIG.hypnoWaves) return;
    const scale   = effectScale();
    const overlay = getOverlay();
    const dur     = BASE_WAVE_DURATION;

    // 固定 3 組電波，分佈在左半邊 BC 座標（X: 0~1000，Y: 全範圍）
    // BC 畫布是 2000 寬，左半邊是 0~1000
    const groupCount = 3;
    const usedPos = [];

    for (let g = 0; g < groupCount; g++) {
        let bcX, bcY, attempts = 0;
        do {
            bcX = randInt(30, 980);   // 左半邊全範圍
            bcY = randInt(80, 900);
            attempts++;
        } while (
            attempts < 30 &&
            usedPos.some(p => Math.abs(p.x - bcX) < 150 && Math.abs(p.y - bcY) < 120)
        );
        usedPos.push({ x: bcX, y: bcY });

        const pos       = bcToScreen(bcX, bcY);
        const ringCount = Math.round(4 * Math.min(scale, 1.5));
        const groupDelay = g * 220; // 各組略微錯開，視覺更層次

        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            position:      'fixed',
            left:          `${pos.x}px`,
            top:           `${pos.y}px`,
            width:         '0',
            height:        '0',
            pointerEvents: 'none',
        });

        for (let i = 0; i < ringCount; i++) {
            const ring = document.createElement('div');
            const hue  = 320 + Math.random() * 40;
            Object.assign(ring.style, {
                position:     'absolute',
                width:        '10px',
                height:       '10px',
                borderRadius: '50%',
                border:       `2px solid hsla(${hue},100%,78%,0.88)`,
                transform:    'translate(-50%, -50%)',
                animation:    `hscWaveExpand ${dur}ms ease-out ${groupDelay + i * 300}ms forwards`,
                boxShadow:    `0 0 8px hsla(${hue},100%,75%,0.5)`,
            });
            wrap.appendChild(ring);
        }
        overlay.appendChild(wrap);
        setTimeout(() => wrap.remove(), dur + groupDelay + ringCount * 300 + 200);
    }
}
