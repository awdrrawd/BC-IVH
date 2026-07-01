// ── auto-wired cross-module imports ──
import { popExprEffect, pushExprEffect, startChatFade } from './character-fx.js';
import { CONFIG, EXPRESSION_SETS, modApi } from './config.js';
import { triggerPinkFlash, wrapDanmakuText } from './effects.js';
import { triggerSteamParticles } from './effects2.js';
import { _cachedRect, _cachedScaleX, _cachedScaleY, bcToScreen, getPlayerHeadScreenPos, playerDrawPos, refreshCanvasCache } from './geometry.js';
import { playSoundCategory, triggerBreathSound } from './sound.js';
import { getCatalystTexts, getChatHistoryLines, getOverlay, pickRandom, randInt, resolveMe } from './util.js';

// ════════════════════════════════════════
//  IVH module: depth.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  背景催眠深度循環（與 VOICE 觸發分離）
    //  深度等級 = 由強度推算，受「深度上限」限制
    // ════════════════════════════════════════
    function currentDepthLevel() {
        if (!CONFIG.enabled || CONFIG.depthMax <= 0) return 0;
        let lvl = Math.round(CONFIG.intensity);
        lvl = Math.max(1, Math.min(3, lvl));
        return Math.min(lvl, CONFIG.depthMax);
    }

    let _depthTimer = null;
    function setDepthTimer(v) { _depthTimer = v; }   // 供 core-init 卸載時清除
    function applyDepthLoop() {
        if (_depthTimer) { clearInterval(_depthTimer); _depthTimer = null; }
        if (!CONFIG.enabled || CONFIG.depthMax <= 0) return;
        const ms = Math.max(1, Math.min(99, CONFIG.depthIntervalMin)) * 60000;
        _depthTimer = setInterval(() => {
            if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
            const lvl = currentDepthLevel();
            if (lvl > 0) runDepthEffect(lvl);
        }, ms);
    }

    // 背景深度效果（最小可用版；幽靈低語人影／人物模糊／聊天模糊於專屬階段補完）
    function runDepthEffect(level) {
        try {
            refreshCanvasCache();
            // 表情變化（共用堆疊，避免與 VOICE 同時觸發時互相覆蓋還原值；6 秒後還原）
            if (CONFIG.expression && EXPRESSION_SETS && EXPRESSION_SETS.length) {
                pushExprEffect(EXPRESSION_SETS[Math.floor(Math.random() * EXPRESSION_SETS.length)]);
                setTimeout(popExprEffect, 6000);
            }
            const L = CONFIG.depthLight, M = CONFIG.depthMed, H = CONFIG.depthHeavy;
            let pant = false;
            // 輕：淡粉煙霧 / 聊天彈幕 / 背後低語人影 / 輕喘
            if (L.smoke)       triggerPinkFlash();
            if (L.chatDanmaku) depthChatDanmaku();
            if (L.ghost)       depthGhostWhisperer();
            if (L.pant)        pant = true;
            // 中：左側人物模糊 / 音效 / 訊息浮現 / 中喘
            if (level >= 2) {
                // 延後一點點再擷取，確保表情替換後的 Canvas 已重建
                if (M.figureBlur) setTimeout(depthFigureBlur, 350);
                if (M.sfx && !playSoundCategory('depth', 0.7)) triggerBreathSound(1);
                if (M.fade) startChatFade(10000);
                if (M.pant) pant = true;
            }
            // 重：右側聊天模糊 / 強喘
            if (level >= 3) {
                if (H.chatlogBlur) depthChatlogBlur();
                if (H.pant) pant = true;
            }
            if (pant) triggerSteamParticles(true, true);  // 深度喘氣：不受 VOICE 開關限制、且一律在人物身上（忽略中央頭像）
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] 深度效果錯誤:', e.message);
        }
    }

    // ── 深度：聊天訊息隨機句變催眠彈幕 ──
    function _showFloatingLine(text, delay) {
        const overlay = getOverlay();
        const pos = bcToScreen(randInt(40, 460), randInt(120, 820));
        const el = document.createElement('div');
        Object.assign(el.style, {
            position:   'fixed', left: `${pos.x}px`, top: `${pos.y}px`,
            fontSize:   '22px', fontWeight: '600',
            fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
            color:      'rgba(255,210,235,0.85)',
            textShadow: '0 0 10px rgba(255,105,180,0.7)',
            whiteSpace: 'pre-line', opacity: '0', pointerEvents: 'none',
            transform:  'translateY(8px)', transition: 'opacity .5s ease, transform .5s ease',
            zIndex:     '5',   // 在模糊遮罩(1)、煙霧(3) 之上，避免被蓋住
        });
        el.textContent = wrapDanmakuText(text, 12);
        overlay.appendChild(el);
        setTimeout(() => { el.style.opacity = '0.85'; el.style.transform = 'translateY(0)'; }, delay);
        setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-12px)'; }, delay + 3500);
        setTimeout(() => el.remove(), delay + 4200);
    }
    function depthChatDanmaku() {
        // 催眠文本（BCX＋自訂）＋ 聊天歷史 一起當來源
        const pool = getCatalystTexts().concat(getChatHistoryLines()).filter(Boolean);
        if (!pool.length) return;
        pickRandom(pool, 1 + Math.floor(Math.random() * 2)).forEach((t, i) => _showFloatingLine(resolveMe(t), i * 350));
    }

    // ── 深度（輕）：背後低語人影 ──
    //  畫進 canvas（DrawCharacter hook，在玩家繪製前 → 真正在人物後方）。
    //  用 source-atop 壓暗（不透明，只是變暗），頭頂文字用 DOM。
    let _ghost = null;   // { canvas, offX, alpha } 由 DrawCharacter hook 讀取繪製
    function depthGhostWhisperer() {
        if (!playerDrawPos.valid || !_cachedRect) return;
        // 隨機抽聊天室一名角色（含自己）當人影來源；抽不到就退回自己
        let srcChar = Player;
        try {
            if (typeof ChatRoomCharacter !== 'undefined' && Array.isArray(ChatRoomCharacter)) {
                const pool = ChatRoomCharacter.filter(c => c && c.Canvas && c.Canvas.width);
                if (pool.length) srcChar = pool[Math.floor(Math.random() * pool.length)];
            }
        } catch (e) {}
        const src = srcChar && srcChar.Canvas;
        if (!src || !src.width) return;
        const all = getCatalystTexts().concat(getChatHistoryLines()).filter(Boolean);
        if (!all.length) return;
        const line = resolveMe(all[Math.floor(Math.random() * all.length)]);

        // 建立壓暗人影圖（source-atop 只染角色，不透明）
        const fc = document.createElement('canvas'); fc.width = src.width; fc.height = src.height;
        const x = fc.getContext('2d');
        try { x.drawImage(src, 0, 0); } catch (e) { return; }
        x.globalCompositeOperation = 'source-atop';
        x.fillStyle = 'rgba(8,2,14,0.84)';     // 壓很暗（保留輪廓）
        x.fillRect(0, 0, fc.width, fc.height);
        x.fillStyle = 'rgba(0,0,0,0.6)';        // 臉部更黑
        x.beginPath();
        x.ellipse(fc.width * 0.50, fc.height * 0.43, fc.width * 0.20, fc.height * 0.11, 0, 0, Math.PI * 2);
        x.fill();
        x.globalCompositeOperation = 'source-over';

        // 建立「人影角色」克隆（共用被抽中角色的外觀，但用壓暗後的畫布）
        //  → 用 BC 自己的 DrawCharacter 繪製，位置以玩家座標為基準
        const ghostChar = Object.assign(Object.create(Object.getPrototypeOf(srcChar)), srcChar);
        ghostChar.Canvas = fc;
        ghostChar.CanvasBlink = fc;
        ghostChar.MemberNumber = -99999;   // 非玩家 → hook 不會對它再畫人影
        ghostChar.MustDraw = false;

        // 相對玩家的螢幕像素偏移
        const offXpx = 35, offYpx = -10;
        _ghost = { char: ghostChar, canvas: fc, offXpx, offYpx, alpha: 0 };

        // 淡入 / 維持 / 淡出（DrawCharacter hook 每幀讀 alpha）
        const start = Date.now();
        const fade = () => {
            if (!_ghost) return;
            const t = Date.now() - start;
            if      (t < 1000) _ghost.alpha = (t / 1000) * 0.92;
            else if (t < 3500) _ghost.alpha = 0.92;
            else if (t < 4800) _ghost.alpha = 0.92 * (1 - (t - 3500) / 1300);
            else { _ghost = null; return; }
            requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);

        // 文字位置：就在人影（陰影）頭部旁，像在耳邊低語
        const headS = getPlayerHeadScreenPos();
        const txt = document.createElement('div');
        Object.assign(txt.style, {
            position: 'fixed', left: `${headS.x + offXpx}px`, top: `${headS.y + offYpx - 18}px`,
            transform: 'translateX(-50%)', fontSize: '20px', fontWeight: '600',
            fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif', textAlign: 'center',
            color: 'rgba(255,220,240,0.92)', textShadow: '0 0 10px rgba(180,80,200,0.85)',
            whiteSpace: 'pre-line', opacity: '0', transition: 'opacity 0.8s ease', pointerEvents: 'none', zIndex: '5',
        });
        txt.textContent = wrapDanmakuText(line, 12);
        getOverlay().appendChild(txt);
        requestAnimationFrame(() => { txt.style.opacity = '1'; });
        setTimeout(() => { txt.style.opacity = '0'; }, 3500);
        setTimeout(() => txt.remove(), 4800);
    }

    // 在玩家繪製前把人影畫到 canvas（→ 在人物後方），用 BC 自己的 DrawCharacter 對齊位置
    let _playerDraw = null;     // 玩家真實繪製座標 { x, y, zoom }（給模糊重畫用）
    let _ghostTemp = null;      // 人影暫存畫布（為了正確套用 alpha 淡入淡出）
    function hookGhostDraw() {
        if (!modApi) return;
        try {
            modApi.hookFunction('DrawCharacter', 2, (args, next) => {
                const C = args[0], X = args[1], Y = args[2], Zoom = args[3];
                const isMe = C && Player && C.MemberNumber === Player.MemberNumber;
                if (isMe && typeof CurrentScreen !== 'undefined' && CurrentScreen === 'ChatRoom') {
                    _playerDraw = { x: X, y: Y, zoom: Zoom };
                    if (_ghost && _ghost.alpha > 0 && _ghost.char) {
                        try {
                            const ctx = args[5] || MainCanvas;
                            // 偏移：螢幕像素 → BC 畫布座標（錨定在玩家真實座標上）
                            const offXbc = (_ghost.offXpx || 0) / (_cachedScaleX || 0.25);
                            const offYbc = (_ghost.offYpx || 0) / (_cachedScaleY || 0.25);
                            // DrawCharacter 不吃 globalAlpha → 先畫到暫存畫布，再以 alpha 疊上（才有淡入淡出）
                            //  注意：MainCanvas 是 2D context（不是元素），尺寸要用 .canvas
                            const cvEl = (MainCanvas && MainCanvas.canvas) || document.getElementById('MainCanvas');
                            if (!_ghostTemp) _ghostTemp = document.createElement('canvas');
                            _ghostTemp.width  = (cvEl && cvEl.width)  || 2000;   // 設尺寸同時清空
                            _ghostTemp.height = (cvEl && cvEl.height) || 1000;
                            const tctx = _ghostTemp.getContext('2d');
                            DrawCharacter(_ghost.char, X + offXbc, Y + offYbc, Zoom, undefined, tctx);
                            const prevA = ctx.globalAlpha;
                            ctx.globalAlpha = _ghost.alpha;
                            ctx.drawImage(_ghostTemp, 0, 0);
                            ctx.globalAlpha = prevA;
                        } catch (e) {}
                    }
                }
                return next(args);
            });
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] DrawCharacter hook 失敗:', e.message);
        }
    }

    // ── 深度（中）：畫面模糊，但人物與背後人影清晰疊在最上層 ──
    //  只做左側 1000×1000 模糊遮罩（不蓋到右側聊天室），再把清晰的人影＋人物畫上去
    function depthFigureBlur() {
        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
        if (!canvas) return;
        const REG = 1000;   // 左側人物區（BC 像素 0~1000）
        let url;
        try {
            const comp = document.createElement('canvas'); comp.width = REG; comp.height = REG;
            const cx = comp.getContext('2d');
            // 1. 模糊左側區
            cx.filter = 'blur(7px)'; cx.drawImage(canvas, 0, 0, REG, REG, 0, 0, REG, REG); cx.filter = 'none';
            // 2. 用 BC 自己的 DrawCharacter 把清晰的玩家（與人影）畫進來 → 位置完全正確
            const pd = _playerDraw;
            if (pd) {
                // 人影 alpha 暫時拉滿，讓它在這張靜態合成圖上清楚可見
                let savedA;
                if (_ghost) { savedA = _ghost.alpha; _ghost.alpha = Math.max(_ghost.alpha || 0, 0.85); }
                DrawCharacter(Player, pd.x, pd.y, pd.zoom, undefined, cx);  // hook 會先畫人影、再畫玩家
                if (_ghost) _ghost.alpha = savedA;
            }
            url = comp.toDataURL();
        } catch (e) { return; }

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / 2000, scaleY = rect.height / 1000;
        const img = document.createElement('img');
        img.src = url;
        Object.assign(img.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${REG * scaleX}px`, height: `${REG * scaleY}px`,   // 只佔左側 1000 區
            opacity: '0', transition: 'opacity 1s ease', pointerEvents: 'none', zIndex: '1',
        });
        getOverlay().appendChild(img);
        requestAnimationFrame(() => { img.style.opacity = '1'; });
        setTimeout(() => { img.style.opacity = '0'; }, 3200);
        setTimeout(() => img.remove(), 4300);
    }

    // ── 深度（重）：右側聊天訊息突然模糊化 ──
    function depthChatlogBlur() {
        const log = document.getElementById('TextAreaChatLog');
        if (!log) return;
        const prevFilter = log.style.filter, prevTrans = log.style.transition;
        // 與人物模糊一致：淡入 1s / 維持 ~3.2s / 淡出 1s
        log.style.transition = 'filter 1s ease';
        log.style.filter = 'blur(4px)';
        setTimeout(() => {
            log.style.filter = prevFilter || '';
            setTimeout(() => { log.style.transition = prevTrans || ''; }, 1100);
        }, 3200);
    }

export {
    currentDepthLevel,
    _depthTimer, setDepthTimer,
    applyDepthLoop,
    runDepthEffect,
    _showFloatingLine,
    depthChatDanmaku,
    depthGhostWhisperer,
    hookGhostDraw,
    depthFigureBlur,
    depthChatlogBlur,
};
