// ════════════════════════════════════════
//  HSC effect: 催眠螺旋（SVG 旋轉，固定在頭部正中央）
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { SPIRAL_DURATION, getPlayerHeadScreenPos } from '../util/geometry.js';
import { effectScale, getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

export function triggerHypnoSpiral() {
    if (!CONFIG.hypnoSpiral) return;
    const scale  = effectScale();
    const head   = getPlayerHeadScreenPos();
    const size   = Math.round(180 * Math.min(scale, 1.6));
    const overlay = getOverlay();

    // 螺旋固定在頭部正中央，不做隨機偏移
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
        position:      'fixed',
        left:          `${Math.round(head.x - size / 2)}px`,
        top:           `${Math.round(head.y - size / 2 - 20)}px`,
        width:         `${size}px`,
        height:        `${size}px`,
        pointerEvents: 'none',
        opacity:       '0',
        transition:    'opacity 0.4s ease',
        zIndex:        HSC_Z.spiral,   // 螺旋在頭像之上、煙霧之下
    });

    // SVG 螺旋（阿基米德螺旋線，用多圈弧段組成）
    const ns   = 'http://www.w3.org/2000/svg';
    const svg  = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.setAttribute('width',  `${size}`);
    svg.setAttribute('height', `${size}`);
    svg.style.animation = `hscSpiralSpin 1800ms linear infinite`;  // 轉速固定，不隨強度變快

    const defs  = document.createElementNS(ns, 'defs');
    const grad  = document.createElementNS(ns, 'radialGradient');
    grad.id = 'hscSpiralGrad';
    const stops = [
        { offset: '0%',   color: 'rgba(255,200,230,0.95)' },
        { offset: '50%',  color: 'rgba(255,120,180,0.75)' },
        { offset: '100%', color: 'rgba(255,60,150,0)' },
    ];
    stops.forEach(s => {
        const stop = document.createElementNS(ns, 'stop');
        stop.setAttribute('offset', s.offset);
        stop.setAttribute('stop-color', s.color);
        grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    // 畫螺旋路徑（3 圈）
    const turns  = 3;
    const points = 360;
    let d        = '';
    for (let i = 0; i <= turns * points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const r     = (i / (turns * points)) * 88;
        const x     = r * Math.cos(angle);
        const y     = r * Math.sin(angle);
        d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#hscSpiralGrad)');
    path.setAttribute('stroke-width', '3.5');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    // 中心光點
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', 'rgba(255,230,245,0.9)');
    circle.style.filter = 'blur(1px)';
    svg.appendChild(circle);

    wrap.appendChild(svg);
    overlay.appendChild(wrap);

    requestAnimationFrame(() => { wrap.style.opacity = '1'; });

    // 結束漸出
    setTimeout(() => {
        wrap.style.transition = 'opacity 0.6s ease';
        wrap.style.opacity    = '0';
    }, SPIRAL_DURATION - 600);
    setTimeout(() => wrap.remove(), SPIRAL_DURATION + 100);
}
