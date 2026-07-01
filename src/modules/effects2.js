// ── auto-wired cross-module imports ──
import { _centerHeadEl } from './character-fx.js';
import { CONFIG } from './config.js';
import { wrapDanmakuText } from './effects.js';
import { BASE_DANMAKU_DURATION, BODY_PANT_DY, DEPTH_PANT_EXTRA, _cachedScaleX, bcToScreen, getPlayerHeadScreenPos, getPlayerMouthScreenPos, playerDrawPos } from './geometry.js';
import { playSoundCategory } from './sound.js';
import { effectScale, getBCXReminderList, getChatHistoryLines, getOverlay, pickRandom, randInt, resolveMe } from './util.js';

// ════════════════════════════════════════
//  IVH module: effects2.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  6. 彈幕：主台詞在頭上波浪，其餘散落左側
    //  - 旁白句：4~9 句，依 3 等份分配字體大小
    //    第一份最小，第三份最大（疊加感）
    //  - 主台詞：固定在角色頭部正上方，波浪動畫
    // ════════════════════════════════════════
    function triggerDanmakuMulti(triggerText, _count) {
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

    // 主台詞波浪效果（在角色頭部正上方）
    function _showMainDanmaku(overlay, text, headPos, scale) {
        const fontSize = Math.round(24 * Math.min(scale, 1.5));  // 主台詞比旁白大 +4pt
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            position:      'fixed',
            left:          `${headPos.x}px`,
            top:           `${headPos.y - fontSize * 2.2}px`,  // 頭頂上方
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
        });

        // 主觸發詞超過 10 字元自動換行（10 全形 / 20 半形）
        const wrappedText = wrapDanmakuText(text, 10);
        // 逐字建立，每個字有波浪 delay
        const chars = [...wrappedText];
        chars.forEach((ch, i) => {
            const span = document.createElement('span');
            span.textContent = ch;
            span.style.cssText = `
                display:inline-block;
                animation: ivhWaveChar 1.8s ease-in-out ${i * 80}ms infinite;
                opacity:0;
                transition: opacity 0.3s ease ${i * 40}ms;
            `;
            wrap.appendChild(span);
        });

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

    // ════════════════════════════════════════
    //  7. 喘氣呼吸（每次呼吸噴一口氣，約 1 秒一次、持續約 10 秒）
    //  位置：角色真實嘴部 +（中央頭像存在時）頭像嘴部
    // ════════════════════════════════════════
    function _breathSizeScale() {
        return Math.max(0.4, Math.min(2.2, (playerDrawPos.zoom || 1) * (_cachedScaleX || 0.3) * 2.4));
    }

    // 喘氣節奏：強度越高間隔越短（頻率較先前降低 50%：強度 1 → 2 秒；強度 3 → 0.6 秒）
    function breathIntervalMs(intensity) {
        const it = (typeof intensity === 'number' && intensity > 0) ? intensity : CONFIG.intensity;
        return Math.max(600, Math.min(2400, Math.round(2000 - (it - 1) * 700)));
    }

    // 取得本次呼吸要噴氣的嘴部位置（中軸 X 與螺旋同在頭部，高度在嘴巴）
    //  ignoreHeadshot=true → 一律用人物身上座標（深度喘氣用，不判斷中央頭像）
    function getBreathMouths(ignoreHeadshot) {
        // 中央頭像顯示中（且非深度）→ 氣團在頭像上、往下 60px
        if (!ignoreHeadshot && CONFIG.centerHeadshot && _centerHeadEl) {
            return [{ x: bcToScreen(500, 360).x, y: bcToScreen(500, 430).y + 60, ss: 1.8 }];
        }
        // 人物身上：中軸 X 在頭部、Y 在嘴巴 + 共用偏移（深度再往下 30）
        const head  = getPlayerHeadScreenPos(true);
        const mouth = getPlayerMouthScreenPos(true);
        const dy = BODY_PANT_DY + (ignoreHeadshot ? DEPTH_PANT_EXTRA : 0);
        return [{ x: head.x, y: mouth.y + dy, ss: _breathSizeScale() }];
    }

    // 噴一口氣：倒三角扇形（由嘴部往上展開），每團一次性 由小變大、由濃變淡，約 0.5 秒
    function _emitBreathPuff(overlay, mouth) {
        const ss = mouth.ss || 1;
        const n  = 3 + Math.floor(Math.random() * 2);   // 3~4 團組成倒三角扇形
        for (let i = 0; i < n; i++) {
            const size = (14 + Math.random() * 12) * ss;
            // 均勻展開 -1~1 + 微抖動 → 對稱三角（嘴部窄），中軸對齊螺旋
            const spread = (n > 1 ? (i / (n - 1)) * 2 - 1 : 0) + (Math.random() - 0.5) * 0.3;
            const dx   = spread * (26 + Math.random() * 18) * ss;
            const dy   = (38 + Math.random() * 34) * ss;            // 旋轉 180°：改為往下飄
            const sc   = 2.0 + Math.random() * 1.0;                 // 由小變大
            const a0   = Math.min(0.62, 0.42 + Math.random() * 0.18); // 比原本亮約 15%
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
                animation:    `ivhPant ${PUFF_DUR}ms ease-out forwards`,
                willChange:   'transform, opacity',
                zIndex:       '3',
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
    function triggerSteamParticles(force = false, ignoreHeadshot = false) {
        if (!force && !CONFIG.steamParticles) return;
        const overlay = getOverlay();
        _breathIgnoreHead = ignoreHeadshot;
        // 延長本次呼吸的結束時間（重複觸發時不疊加多個迴圈，只延長）
        const FRESH = _breathLoopUntil < Date.now();
        _breathLoopUntil = Date.now() + 10000;   // 約 10 秒
        if (!FRESH) return;                      // 已有迴圈在跑 → 只延長時間

        const breathe = () => {
            if (Date.now() > _breathLoopUntil) return;
            getBreathMouths(_breathIgnoreHead).forEach(m => _emitBreathPuff(overlay, m));
            setTimeout(breathe, breathIntervalMs(CONFIG.intensity));  // 強度越高越頻繁
        };
        breathe();
    }

    // ════════════════════════════════════════
    //  高潮特效
    //  快照破壞：像素碎裂 + 紅白閃 + 震動
    // ════════════════════════════════════════
    function triggerClimaxEffect(scale = 1) {
        if (!CONFIG.climax) return;
        if (CONFIG.sound) playSoundCategory('climax', Math.min(0.5 + scale * 0.2, 1));  // 高潮聲
        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
        if (!canvas) return;

        // 快照整個 canvas
        let dataURL;
        try { dataURL = canvas.toDataURL(); } catch(e) { return; }
        const rect = canvas.getBoundingClientRect();

        // ── 全螢幕用 window 尺寸（不限 canvas rect）──
        const SW = window.innerWidth;
        const SH = window.innerHeight;

        const overlay = getOverlay();

        // ── Layer 1: 黑幕底層（碎片飛散後顯示，然後慢慢淡出）──
        const blackBg = document.createElement('div');
        Object.assign(blackBg.style, {
            position:      'fixed',
            inset:         '0',
            background:    'black',
            zIndex:        '99989',   // 在碎片(99991)下面，確保碎片飛散後看到黑
            opacity:       '1',
            pointerEvents: 'none',
            transition:    'none',
        });
        document.body.appendChild(blackBg);

        // ── 紅白閃光（全螢幕）──
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position:      'fixed',
            inset:         '0',
            zIndex:        '99997',
            opacity:       '0',
            pointerEvents: 'none',
            animation:     `ivhClimaxFlash ${Math.round(700 / scale)}ms ease-out forwards`,
        });
        overlay.appendChild(flash);
        setTimeout(() => flash.remove(), 800);

        // ── 不規則多邊形碎片 ──
        // 先把 canvas 畫到一個全螢幕大小的 offscreen canvas
        const master = document.createElement('canvas');
        master.width  = SW;
        master.height = SH;
        const mctx = master.getContext('2d');
        // canvas 可能不是全螢幕，按實際位置繪製
        try {
            mctx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height);
        } catch(e) { return; }

        // 產生 Voronoi 風格的隨機種子點
        const FRAG_COUNT = 48 + Math.round(scale * 10); // 48~60 個碎片（更密集）
        const seeds = Array.from({length: FRAG_COUNT}, () => ({
            x: Math.random() * SW,
            y: Math.random() * SH,
        }));

        // 每個種子建立一個不規則多邊形碎片（簡化：找最近的幾個鄰居拉出凸包近似）
        // 實作：用 clip path SVG polygon，讓每個碎片 canvas 用 clip 裁切
        seeds.forEach((seed, si) => {
            // 用隨機偏移建出一個不規則多邊形（6~9 個頂點）
            const sides  = 6 + Math.floor(Math.random() * 4);
            const radius = 60 + Math.random() * 80 * scale;
            const pts    = [];
            for (let k = 0; k < sides; k++) {
                const angle = (k / sides) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
                const r     = radius * (0.55 + Math.random() * 0.7);
                pts.push({ x: seed.x + r * Math.cos(angle), y: seed.y + r * Math.sin(angle) });
            }

            // 建立 canvas，clip 成多邊形，貼上截圖
            const fc  = document.createElement('canvas');
            fc.width  = SW;
            fc.height = SH;
            const fctx = fc.getContext('2d');
            fctx.beginPath();
            fctx.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => fctx.lineTo(p.x, p.y));
            fctx.closePath();
            fctx.clip();
            fctx.drawImage(master, 0, 0);

            // 輕微邊緣描邊，增加撕裂感
            fctx.strokeStyle = 'rgba(255,120,160,0.6)';
            fctx.lineWidth   = 1.5;
            fctx.beginPath();
            fctx.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => fctx.lineTo(p.x, p.y));
            fctx.closePath();
            fctx.stroke();

            const dx      = (seed.x - SW / 2) * (0.8 + Math.random() * 1.2) * scale;
            const dy      = (seed.y - SH / 2) * (0.8 + Math.random() * 1.2) * scale;
            const rot     = (Math.random() - 0.5) * 80 * scale;
            const dur     = (800 + Math.random() * 600) * (1 / Math.max(scale, 0.5));
            // 定格停頓：碎片先靜止 550ms（讓玩家看清破碎），再飛散
            // 每個碎片的 delay = 定格時間 + 輕微錯開（各片不完全同時）
            const FREEZE  = 550;
            const scatter = FREEZE + si * 10;

            Object.assign(fc.style, {
                position:        'fixed',
                left:            '0',
                top:             '0',
                width:           `${SW}px`,
                height:          `${SH}px`,
                pointerEvents:   'none',
                zIndex:          '99991',
                transformOrigin: `${seed.x}px ${seed.y}px`,
                // transition 帶入 delay，飛散前靜止
                transition:      `transform ${dur}ms cubic-bezier(0.15,0,0.9,1) ${scatter}ms,
                                  opacity   ${dur * 0.45}ms ease ${scatter + dur * 0.55}ms`,
                willChange:      'transform, opacity',
            });
            document.body.appendChild(fc);

            // 立刻渲染（定格在原位），delay 到時再飛散
            requestAnimationFrame(() => requestAnimationFrame(() => {
                fc.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${0.2 + Math.random() * 0.5})`;
                fc.style.opacity   = '0';
            }));

            setTimeout(() => fc.remove(), scatter + dur + 300);
        });

        // ── 全螢幕震動 ──
        const shakeEl = document.createElement('div');
        Object.assign(shakeEl.style, {
            position:      'fixed',
            inset:         '0',
            pointerEvents: 'none',
            zIndex:        '99999',
            animation:     `ivhClimaxShake ${Math.round(500 / scale)}ms ease-out forwards`,
        });
        overlay.appendChild(shakeEl);
        setTimeout(() => shakeEl.remove(), 600);

        // ── 黑幕淡出（碎片都飛散後，黑幕在 1~1.5 秒內淡出移除）──
        // 等最慢的碎片飛完（FREEZE=550 + scatter最大 si*10 + dur最長約1500）
        const blackFadeDelay = 550 + FRAG_COUNT * 10 + 800;
        const blackFadeDur   = 1200 + Math.random() * 300;
        setTimeout(() => {
            blackBg.style.transition = `opacity ${blackFadeDur}ms ease`;
            blackBg.style.opacity    = '0';
        }, blackFadeDelay);
        setTimeout(() => blackBg.remove(), blackFadeDelay + blackFadeDur + 100);
    }


export {
    triggerDanmakuMulti,
    _showMainDanmaku,
    _breathSizeScale,
    breathIntervalMs,
    getBreathMouths,
    _emitBreathPuff,
    triggerSteamParticles,
    triggerClimaxEffect,
};
