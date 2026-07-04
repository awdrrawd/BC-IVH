// ════════════════════════════════════════
//  HSC effect: 彈幕
//  triggerDanmakuMulti — 主台詞在頭上波浪、旁白句散落左側。
//  fillWaveText        — 逐字「波浪」span（主台詞與日常耳邊句子共用）。
// ════════════════════════════════════════
import { CONFIG } from '../core/config.js';
import { wrapDanmakuText } from '../util/text.js';
import { BASE_DANMAKU_DURATION, bcToScreen, getPlayerHeadScreenPos, playerDrawPos } from '../util/geometry.js';
import { effectScale, getBCXReminderList, getChatHistoryLines, getOverlay, pickRandom, randInt, resolveMe } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

// 彈幕：主台詞在頭上波浪，其餘散落左側
//  - 旁白句：4~9 句，依 3 等份分配字體大小（第一份最小，第三份最大，疊加感）
//  - 主台詞：固定在角色頭部正上方，波浪動畫
export function triggerDanmakuMulti(triggerText, _count) {
    if (!CONFIG.danmaku) return;
    const scale   = effectScale();
    const overlay = getOverlay();

    // ── 主台詞：角色頭上，波浪動畫 ──
    const head = getPlayerHeadScreenPos();
    _showMainDanmaku(overlay, triggerText, head, scale);

    // ── 旁白句：聊天室 3 條 + (BCX＋催眠文本) 3 條（保證含自訂文本）──
    const custom   = (CONFIG.customTexts || []).filter(Boolean);
    const bcx      = getBCXReminderList().filter(Boolean);
    const catalyst = [...bcx, ...custom];
    const fromChat = pickRandom(getChatHistoryLines(), 3);
    let fromText   = pickRandom(catalyst, 3);
    if (custom.length && !fromText.some(t => custom.includes(t)))
        fromText[0] = custom[Math.floor(Math.random() * custom.length)];   // 至少 1 句自訂
    fromText = fromText.map(resolveMe);
    const sideTexts = [...fromChat, ...fromText];
    const sideCount = sideTexts.length;
    if (sideCount === 0) return;

    // 依強度決定 3 組字體等級：0.1~1.0→[1,1,1]、1.1~2.0→[2,2,1]、2.1~3.0→[3,3,1]
    const it     = CONFIG.intensity || 1;
    const levels = it <= 1.0 ? [1, 1, 1] : it <= 2.0 ? [2, 2, 1] : [3, 3, 1];
    const ptMap  = [0, 15, 21, 27];   // 等級→pt
    const groupSize = Math.ceil(sideCount / 3);

    // 排除頭部附近的座標（BC 座標）
    const headBcX = playerDrawPos.valid ? playerDrawPos.x + 240 * playerDrawPos.zoom : 240;
    const headBcY = playerDrawPos.valid ? playerDrawPos.y + 120 * playerDrawPos.zoom : 120;
    const HEAD_SAFE_R = 180; // 頭部安全圓半徑（BC 座標單位）

    const usedSlots = [];

    sideTexts.forEach((text, idx) => {
        const group    = Math.min(2, Math.floor(idx / groupSize));   // 0,1,2
        const level    = levels[group];                              // 1~3
        const tier     = level - 1;                                  // 樣式用
        const fontSize = Math.round(ptMap[level] * Math.min(scale, 1.2));

        let bcX, bcY, attempts = 0;
        do {
            bcX = randInt(20, 500);   // 左半側
            bcY = randInt(80, 900);
            attempts++;
        } while (
            attempts < 30 && (
                usedSlots.some(s => Math.abs(s.x - bcX) < 120 && Math.abs(s.y - bcY) < 70) ||
                (Math.abs(bcX - headBcX) < HEAD_SAFE_R && Math.abs(bcY - headBcY) < HEAD_SAFE_R)
            )
        );
        usedSlots.push({ x: bcX, y: bcY });

        const pos       = bcToScreen(bcX, bcY);
        const lineDelay = idx * 180;

        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            position:      'fixed',
            left:          `${pos.x}px`,
            top:           `${pos.y}px`,
            fontSize:      `${fontSize}px`,
            fontWeight:    tier === 2 ? '700' : '500',
            fontFamily:    '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
            whiteSpace:    'nowrap',
            letterSpacing: '1.5px',
            color:         `rgba(255,210,235,${0.55 + tier * 0.15})`,
            textShadow:    `0 0 ${6 + tier * 4}px rgba(255,105,180,${0.6 + tier * 0.2})`,
            opacity:       '0',
            pointerEvents: 'none',
            transform:     'translateY(10px)',
            zIndex:        HSC_Z.sceneText,   // 與其他場景文字同層，並在中央頭像之上（不被頭像蓋住）
        });
        overlay.appendChild(wrap);

        setTimeout(() => {
            wrap.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            wrap.style.opacity    = String(0.55 + tier * 0.15);
            wrap.style.transform  = 'translateY(0)';
        }, lineDelay);

        // 自動換行（12 全形 / 24 半形）
        const wrapped = wrapDanmakuText(text, 12);
        wrap.style.whiteSpace = 'pre-line';
        wrap.textContent = wrapped;

        const totalDur = lineDelay + BASE_DANMAKU_DURATION + sideCount * 80;
        setTimeout(() => {
            wrap.style.transition = 'opacity 1s ease, transform 1s ease';
            wrap.style.opacity    = '0';
            wrap.style.transform  = 'translateY(-14px)';
        }, totalDur - 1000);
        setTimeout(() => wrap.remove(), totalDur + 300);
    });
}

// 共用：把文字逐字建成「波浪」span（主台詞與日常耳邊句子共用同一套處理）。
//  換行（wrapDanmakuText 產生的 \n）以 <br> 呈現；每字有波浪動畫與淡入延遲。
//  呼叫端把 span 的 opacity 設為 1 即淡入。
export function fillWaveText(container, text, wrapN = 10, charDelayMs = 80) {
    const wrapped = wrapDanmakuText(text, wrapN);
    let i = 0;
    for (const ch of [...wrapped]) {
        if (ch === '\n') { container.appendChild(document.createElement('br')); continue; }
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.cssText = `display:inline-block; animation: hscWaveChar 1.8s ease-in-out ${i * charDelayMs}ms infinite; opacity:0; transition: opacity 0.3s ease ${i * 40}ms;`;
        container.appendChild(span);
        i++;
    }
}

// 主台詞波浪效果（在角色頭部正上方）
export function _showMainDanmaku(overlay, text, headPos, scale) {
    const fontSize = Math.round(24 * Math.min(scale, 1.5));  // 主台詞比旁白大 +4pt
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
        position:      'fixed',
        left:          `${headPos.x}px`,
        top:           `${headPos.y - fontSize * 2.2 - 70}px`,  // 頭頂上方，再往上 70 避免遮到眼睛
        fontSize:      `${fontSize}px`,
        fontWeight:    '700',
        fontFamily:    '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
        whiteSpace:    'nowrap',
        letterSpacing: '3px',
        color:         'rgba(255,230,245,1)',
        textShadow:    '0 0 10px rgba(255,80,160,1), 0 0 28px rgba(255,80,160,0.7), 0 0 50px rgba(255,60,140,0.4)',
        opacity:       '0',
        pointerEvents: 'none',
        transform:     'translateX(-50%)',  // 水平置中對齊頭部
        zIndex:        HSC_Z.sceneText,      // 與其他場景文字同層，並在中央頭像之上（不被頭像蓋住）
    });

    // 主觸發詞超過 10 字元自動換行（10 全形 / 20 半形）；逐字波浪
    fillWaveText(wrap, text, 10, 80);

    overlay.appendChild(wrap);

    // 淡入
    requestAnimationFrame(() => requestAnimationFrame(() => {
        wrap.style.opacity = '1';
        wrap.querySelectorAll('span').forEach(s => s.style.opacity = '1');
    }));

    // 淡出（比旁白句晚一點消失，主台詞是重點）
    const dur = BASE_DANMAKU_DURATION + 1200;
    setTimeout(() => {
        wrap.style.transition = 'opacity 1.2s ease';
        wrap.style.opacity    = '0';
    }, dur - 1200);
    setTimeout(() => wrap.remove(), dur + 200);
}
