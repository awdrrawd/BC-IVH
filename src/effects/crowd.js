// ════════════════════════════════════════
//  HSC module: crowd.js  （催眠狀態效果：顯示人群）
//  強控（isForced）中且開啟「顯示人群」時，畫面下緣淡入一排圍觀人群（HSC-crowd1.png），
//  營造「被眾人注視/包圍」的催眠情境。解除強控時淡出移除。
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { assetUrl, imageUrl } from '../util/icons.js';
import { getOverlay } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

const CROWD_URL = imageUrl('HSC-crowd1.png');   // CDN 優先（純 DOM 顯示，非畫布，不涉汙染）
let _crowdEl = null;
let _crowdVisRAF = null;

// Dialog 狀態（點角色開對話選單）時，隱藏周遭人群；離開對話再顯示。
function _inDialog() {
    try {
        if (typeof CurrentCharacter !== 'undefined' && CurrentCharacter != null) return true;
        if (typeof CurrentScreen !== 'undefined' && CurrentScreen !== 'ChatRoom') return true;
    } catch (e) {}
    return false;
}
function _crowdVisLoop() {
    if (!_crowdEl) { _crowdVisRAF = null; return; }
    _crowdEl.style.visibility = _inDialog() ? 'hidden' : 'visible';
    _crowdVisRAF = requestAnimationFrame(_crowdVisLoop);
}

// 依 MainCanvas 位置，把人群定位在「左側人物區」＝BC 畫布 (0,0)~(1000,1000)。
//  BC 畫布 2000×1000，左半 1000 寬＝人物區；右半是聊天區（不放圖）。
function _placeCrowd(el) {
    const cv = document.getElementById('MainCanvas') || document.querySelector('canvas');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    Object.assign(el.style, {
        left:   `${r.left}px`,
        top:    `${r.top}px`,
        width:  `${r.width / 2}px`,     // BC x 0~1000 = 左半
        height: `${r.height}px`,        // BC y 0~1000 = 全高
    });
}

// show=true 且 CONFIG.crowd → 顯示；否則淡出移除。可安全重複呼叫（永不丟例外）。
export function updateCrowd(show) {
    try { _updateCrowd(show); } catch (e) { console.warn('🐈‍⬛ [HSC] 人群更新失敗:', e.message); }
}
function _updateCrowd(show) {
    if (show && CONFIG.crowd) {
        if (_crowdEl) { _placeCrowd(_crowdEl); return; }
        const el = document.createElement('img');
        el.addEventListener('error', () => {   // CDN 失效 → 回退 Pages（僅一次）
            const fb = assetUrl('HSC-crowd1.png');
            if (el.src !== fb) el.src = fb;
        });
        el.src = CROWD_URL;
        Object.assign(el.style, {
            position: 'fixed',
            objectFit: 'cover', objectPosition: 'bottom',
            pointerEvents: 'none', opacity: '0', transition: 'opacity 1s ease',
            zIndex: HSC_Z.base,   // 頭像層（在場景效果之下、背景之上）
            filter: 'brightness(0.7) saturate(0.9)',
        });
        _placeCrowd(el);
        getOverlay().appendChild(el);
        _crowdEl = el;
        requestAnimationFrame(() => { if (_crowdEl === el) el.style.opacity = '0.85'; });
        if (!_crowdVisRAF) _crowdVisRAF = requestAnimationFrame(_crowdVisLoop);   // Dialog 時隱藏
    } else if (_crowdEl) {
        const el = _crowdEl; _crowdEl = null;
        el.style.opacity = '0';
        setTimeout(() => { try { el.remove(); } catch (e) {} }, 1000);
    }
}
