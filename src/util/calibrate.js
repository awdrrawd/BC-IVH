// ════════════════════════════════════════
//  HSC tool: 頭部座標校正 UI（/hsc calibrate）＋ debug 紅點
// ════════════════════════════════════════
import { printChat } from '../core/commands.js';
import { HEAD_OFFSET, getPlayerHeadScreenPos, refreshCanvasCache } from './geometry.js';
import { HSC_Z } from './zlayers.js';

// Debug 工具：在螢幕指定位置畫紅圈（持續 N ms）
export function _debugDot(x, y, ms = 3000) {
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
        zIndex:       HSC_Z.tool,
        pointerEvents:'none',
    });
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), ms);
}

// 座標校正 UI（/hsc calibrate 開啟）：浮動面板 + 即時紅點，直接拖拉校正
let _calibratePanel = null;

export function openCalibratePanel() {
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
        zIndex:      HSC_Z.tool,
        fontFamily:  'monospace',
        fontSize:    '12px',
        color:       '#ffccee',
        userSelect:  'none',
    });

    const title = document.createElement('div');
    title.textContent = '🌀 HSC 頭部座標校正';
    title.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#ff99dd;font-size:13px';
    panel.appendChild(title);

    // 頭部 asset Y / 嘴部 asset Y / 水平 / 螢幕 Y 微調
    const sliders = [
        { key: 'headAY',  label: '頭部 asset Y', min: 0,    max: 500,  step: 2  },
        { key: 'mouthAY', label: '嘴部 asset Y', min: 0,    max: 600,  step: 2  },
        { key: 'x',       label: '水平 X',        min: -200, max: 200,  step: 5  },
        { key: 'yExtra',  label: 'Y 微調(px)',    min: -200, max: 200,  step: 2  },
    ];

    sliders.forEach(({ key, label, min, max, step }) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:8px';

        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px';
        const lspan = document.createElement('span'); lspan.textContent = label;
        const vspan = document.createElement('span');
        vspan.textContent = HEAD_OFFSET[key];
        vspan.id = `hsc-cal-val-${key}`;
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
            zIndex:       HSC_Z.tool,
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
