// ── auto-wired cross-module imports ──
import { printChat } from './commands.js';
import { CONFIG } from './config.js';
import { BASE_PINK_DURATION, BASE_WAVE_DURATION, HEAD_OFFSET, SPIRAL_DURATION, VIGNETTE_DURATION, bcToScreen, getPlayerHeadScreenPos, refreshCanvasCache } from './geometry.js';
import { effectScale, getOverlay, randInt } from './util.js';
import { IVH_Z } from './zlayers.js';

// ════════════════════════════════════════
//  IVH module: effects.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  0. 興奮震動：興奮值成長時，整個遊戲畫布短暫抖動（比照 BC 興奮量表震動）
    //     強度來自設定 arousalShake（0~10，0＝關）。多次觸發只延長，不疊加抖動迴圈。
    // ════════════════════════════════════════
    let _shakeUntil = 0, _shaking = false;
    function triggerArousalShake(intensity) {
        const amp = Math.min(10, Math.max(0, Number(intensity) || 0));
        if (amp <= 0) return;
        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
        if (!canvas) return;
        const px = amp * 1.4;                 // 最大位移像素
        _shakeUntil = Date.now() + 340;
        if (_shaking) return;                 // 已有迴圈在跑 → 只延長
        _shaking = true;
        const base = canvas.style.transform || '';
        const loop = () => {
            const left = _shakeUntil - Date.now();
            if (left <= 0) { canvas.style.transform = base; _shaking = false; return; }
            const k  = left / 340;            // 隨時間衰減
            const dx = (Math.random() - 0.5) * 2 * px * k;
            const dy = (Math.random() - 0.5) * 2 * px * k;
            canvas.style.transform = `${base} translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // ════════════════════════════════════════
    //  1. 粉紅暈染（強度動態）
    // ════════════════════════════════════════
    function triggerPinkFlash() {
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
            animation:  `ivhPinkPulse ${dur}ms ease-in-out forwards`,
        });
        overlay.appendChild(el);
        setTimeout(() => el.remove(), dur + 200);
    }

    // ════════════════════════════════════════
    //  2. 邊緣暗角（沉浸感）
    // ════════════════════════════════════════
    function triggerVignette() {
        if (!CONFIG.vignette) return;
        const scale  = effectScale();
        const alpha  = Math.min(0.65 * scale, 0.90);
        const overlay = getOverlay();
        const el     = document.createElement('div');
        Object.assign(el.style, {
            position:   'absolute',
            inset:      '0',
            background: `radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,${alpha}) 100%)`,
            animation:  `ivhVignette ${VIGNETTE_DURATION}ms ease-in-out forwards`,
        });
        overlay.appendChild(el);
        setTimeout(() => el.remove(), VIGNETTE_DURATION + 200);
    }

    // ════════════════════════════════════════
    //  3. 催眠螺旋（SVG 旋轉）
    // ════════════════════════════════════════
    function triggerHypnoSpiral() {
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
            zIndex:        IVH_Z.spiral,   // 螺旋在頭像之上、煙霧之下
        });

        // SVG 螺旋（阿基米德螺旋線，用多圈弧段組成）
        const ns   = 'http://www.w3.org/2000/svg';
        const svg  = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '-100 -100 200 200');
        svg.setAttribute('width',  `${size}`);
        svg.setAttribute('height', `${size}`);
        svg.style.animation = `ivhSpiralSpin 1800ms linear infinite`;  // 轉速固定，不隨強度變快

        const defs  = document.createElementNS(ns, 'defs');
        const grad  = document.createElementNS(ns, 'radialGradient');
        grad.id = 'ivhSpiralGrad';
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
        path.setAttribute('stroke', 'url(#ivhSpiralGrad)');
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

    // ════════════════════════════════════════
    //  4. 同心圓電波（左半邊任意位置，每次固定 3 組）
    // ════════════════════════════════════════
    function triggerHypnoWaves(wordCount = 1) {
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
                    animation:    `ivhWaveExpand ${dur}ms ease-out ${groupDelay + i * 300}ms forwards`,
                    boxShadow:    `0 0 8px hsla(${hue},100%,75%,0.5)`,
                });
                wrap.appendChild(ring);
            }
            overlay.appendChild(wrap);
            setTimeout(() => wrap.remove(), dur + groupDelay + ringCount * 300 + 200);
        }
    }

    // ════════════════════════════════════════
    //  5. 快照扭曲（截取 canvas → img → CSS transform → 刪除）
    // ════════════════════════════════════════
    function triggerScreenDistort() {
        if (!CONFIG.screenDistort) return;
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
            zIndex:          IVH_Z.distortSnap,  // canvas 上，但在 overlay 文字效果下
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

    // ════════════════════════════════════════
    //  Debug 工具：在螢幕指定位置畫紅圈（持續 N ms）
    // ════════════════════════════════════════
    function _debugDot(x, y, ms = 3000) {
        const dot = document.createElement('div');
        Object.assign(dot.style, {
            position:     'fixed',
            left:         `${x - 10}px`,
            top:          `${y - 10}px`,
            width:        '20px',
            height:       '20px',
            borderRadius: '50%',
            background:   'rgba(255,0,0,0.8)',
            border:       '2px solid white',
            zIndex:       IVH_Z.tool,
            pointerEvents:'none',
        });
        document.body.appendChild(dot);
        setTimeout(() => dot.remove(), ms);
    }

    // ════════════════════════════════════════
    //  座標校正 UI（/ivh calibrate 開啟）
    //  浮動面板 + 即時紅點，直接拖拉校正
    // ════════════════════════════════════════
    let _calibratePanel = null;

    function openCalibratePanel() {
        if (_calibratePanel) { _calibratePanel.remove(); _calibratePanel = null; }
        refreshCanvasCache();

        const panel = document.createElement('div');
        _calibratePanel = panel;
        Object.assign(panel.style, {
            position:    'fixed',
            top:         '60px',
            right:       '20px',
            width:       '260px',
            background:  '#301B3D',
            border:      '1px solid rgba(255,100,200,0.4)',
            borderRadius:'10px',
            padding:     '12px',
            zIndex:      IVH_Z.tool,
            fontFamily:  'monospace',
            fontSize:    '12px',
            color:       '#ffccee',
            userSelect:  'none',
        });

        const title = document.createElement('div');
        title.textContent = '🌀 IVH 頭部座標校正';
        title.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#ff99dd;font-size:13px';
        panel.appendChild(title);

        // 頭部 asset Y / 嘴部 asset Y / 水平 / 螢幕 Y 微調
        const sliders = [
            { key: 'headAY',  label: '頭部 asset Y', min: 0,    max: 500,  step: 2  },
            { key: 'mouthAY', label: '嘴部 asset Y', min: 0,    max: 600,  step: 2  },
            { key: 'x',       label: '水平 X',        min: -200, max: 200,  step: 5  },
            { key: 'yExtra',  label: 'Y 微調(px)',    min: -200, max: 200,  step: 2  },
        ];

        const dots = [];
        sliders.forEach(({ key, label, min, max, step }) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:8px';

            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px';
            const lspan = document.createElement('span'); lspan.textContent = label;
            const vspan = document.createElement('span');
            vspan.textContent = HEAD_OFFSET[key];
            vspan.id = `ivh-cal-val-${key}`;
            labelEl.appendChild(lspan); labelEl.appendChild(vspan);

            const slider = document.createElement('input');
            slider.type  = 'range';
            slider.min   = String(min); slider.max = String(max); slider.step = String(step);
            slider.value = String(HEAD_OFFSET[key]);
            slider.style.cssText = 'width:100%;accent-color:#ff80cc;cursor:pointer';

            slider.addEventListener('input', () => {
                HEAD_OFFSET[key] = parseFloat(slider.value);
                vspan.textContent = slider.value;
                _updateCalibrateDot();
            });

            row.appendChild(labelEl); row.appendChild(slider);
            panel.appendChild(row);
        });

        // 紅點顯示目前頭部位置
        let _dot = null;
        function _updateCalibrateDot() {
            if (_dot) _dot.remove();
            const head = getPlayerHeadScreenPos();
            _dot = document.createElement('div');
            Object.assign(_dot.style, {
                position:     'fixed',
                left:         `${head.x - 12}px`,
                top:          `${head.y - 12}px`,
                width:        '24px',
                height:       '24px',
                borderRadius: '50%',
                background:   'rgba(255,0,80,0.85)',
                border:       '2px solid white',
                zIndex:       IVH_Z.tool,
                pointerEvents:'none',
                boxShadow:    '0 0 10px rgba(255,0,80,0.6)',
            });
            const line = document.createElement('div');
            Object.assign(line.style, {
                position: 'absolute', top: '50%', left: '-30px',
                width: '84px', height: '2px',
                background: 'rgba(255,100,100,0.5)',
                transform: 'translateY(-50%)',
            });
            _dot.appendChild(line);
            document.body.appendChild(_dot);
        }
        _updateCalibrateDot();

        // 複製值按鈕
        const copyRow = document.createElement('div');
        copyRow.style.cssText = 'margin-top:10px;display:flex;gap:6px';
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 複製設定值';
        copyBtn.style.cssText = 'flex:1;background:#3a0a50;border:1px solid #ff80cc;border-radius:5px;color:#ffccee;padding:5px;cursor:pointer;font-size:11px';
        copyBtn.onclick = () => {
            const txt = `headAY:${HEAD_OFFSET.headAY} mouthAY:${HEAD_OFFSET.mouthAY} x:${HEAD_OFFSET.x} yExtra:${HEAD_OFFSET.yExtra}`;
            navigator.clipboard.writeText(txt).catch(() => {});
            printChat('🔧 校正值已複製: ' + txt);
        };
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:#2a0a30;border:1px solid #ff80cc;border-radius:5px;color:#ffccee;padding:5px 8px;cursor:pointer';
        closeBtn.onclick = () => {
            panel.remove(); _calibratePanel = null;
            if (_dot) { _dot.remove(); _dot = null; }
        };
        copyRow.appendChild(copyBtn); copyRow.appendChild(closeBtn);
        panel.appendChild(copyRow);

        document.body.appendChild(panel);
        printChat('🔧 校正面板已開啟，拉動滑條即時看紅點位置，調好後點「複製設定值」給開發者');
    }

    // ════════════════════════════════════════
    //  自動換行：12 全形字元 / 24 半形字元換一行
    // ════════════════════════════════════════
    function wrapDanmakuText(text, fullWidth = 12) {
        // 判斷全形字（CJK、全形標點等）= 2 寬度；半形 = 1 寬度
        const charWidth = (ch) => {
            const code = ch.codePointAt(0);
            // CJK 統一漢字、全形符號、片假名、平假名
            if ((code >= 0x1100 && code <= 0x115F) ||
                (code >= 0x2E80 && code <= 0x9FFF) ||
                (code >= 0xA000 && code <= 0xA4CF) ||
                (code >= 0xAC00 && code <= 0xD7AF) ||
                (code >= 0xF900 && code <= 0xFAFF) ||
                (code >= 0xFE10 && code <= 0xFE1F) ||
                (code >= 0xFE30 && code <= 0xFE4F) ||
                (code >= 0xFF00 && code <= 0xFF60) ||
                (code >= 0xFFE0 && code <= 0xFFE6)) return 2;
            return 1;
        };
        const halfLimit = fullWidth * 2; // 半形字元上限
        // 先依既有換行（$n / \n 已由 resolveMe 轉成真正換行）切段，逐段再自動換行
        const wrapSeg = (seg) => {
            const lines = [];
            let cur = '', curW = 0;
            for (const ch of [...seg]) {
                const w = charWidth(ch);
                if (curW + w > halfLimit) { lines.push(cur); cur = ch; curW = w; }
                else                      { cur += ch; curW += w; }
            }
            if (cur || lines.length === 0) lines.push(cur);  // 保留空行
            return lines;
        };
        return String(text).split('\n').flatMap(wrapSeg).join('\n');
    }

export {
    triggerArousalShake,
    triggerPinkFlash,
    triggerVignette,
    triggerHypnoSpiral,
    triggerHypnoWaves,
    triggerScreenDistort,
    _debugDot,
    openCalibratePanel,
    wrapDanmakuText,
};
