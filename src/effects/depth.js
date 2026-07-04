// ── auto-wired cross-module imports ──
import { activateHypnoAtmosphere } from './atmosphere.js';
import { addArousal, popExprEffect, pushExprEffect, startChatFade } from './character-fx.js';
import { CONFIG, EXPRESSION_SETS, modApi } from '../core/config.js';
import { triggerPinkFlash } from './pink-flash.js';
import { wrapDanmakuText } from '../util/text.js';
import { triggerSteamParticles } from './breath.js';
import { fillWaveText } from './danmaku.js';
import { _cachedRect, _cachedScaleX, _cachedScaleY, bcToScreen, getPlayerHeadScreenPos, playerDrawPos, refreshCanvasCache } from '../util/geometry.js';
import { addHypno } from '../hypno/hypno.js';
import { playSoundCategory, triggerBreathSound } from './sound.js';
import { getCatalystTexts, getChatHistoryLines, getOverlay, pickRandom, randInt, resolveMe } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

// ════════════════════════════════════════
//  HSC module: depth.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  背景催眠深度循環（與 VOICE 觸發分離）
    //  深度等級 = 由強度推算，受「深度上限」限制
    // ════════════════════════════════════════
    // 相容：0/1（供 window.Liko.HSC.runDepth 用）
    function currentDepthLevel() { return (CONFIG.enabled && CONFIG.depthEnabled) ? 1 : 0; }

    let _depthTimer = null;
    function setDepthTimer(v) { _depthTimer = v; }   // 供 core-init 卸載時清除
    function applyDepthLoop() {
        if (_depthTimer) { clearInterval(_depthTimer); _depthTimer = null; }
        if (!CONFIG.enabled || !CONFIG.depthEnabled) return;
        const ms = Math.max(1, Math.min(99, CONFIG.depthIntervalMin)) * 60000;
        _depthTimer = setInterval(() => {
            if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
            if (CONFIG.enabled && CONFIG.depthEnabled) runDepthEffect();
        }, ms);
    }

    // 定時觸發的深度催眠效果：扁平自由勾選，喘氣單一（用原「深度中」參數）
    function runDepthEffect() {
        try {
            refreshCanvasCache();
            // 表情變化（共用堆疊，避免與 VOICE 同時觸發時互相覆蓋還原值；6 秒後還原）
            if (CONFIG.expression && EXPRESSION_SETS && EXPRESSION_SETS.length) {
                pushExprEffect(EXPRESSION_SETS[Math.floor(Math.random() * EXPRESSION_SETS.length)]);
                setTimeout(popExprEffect, 6000);
            }
            const E = CONFIG.depthEffects || {};
            if (E.smoke)       triggerPinkFlash();
            if (E.chatDanmaku) depthChatDanmaku();
            if (E.ghost)       depthGhostWhisperer();
            if (E.figureBlur)  activateHypnoAtmosphere(4300, { blur: true, tint: true, level: 3 });  // 固定強度（原深度中）
            if (E.sfx && !playSoundCategory('depth', 0.7)) triggerBreathSound(1);
            if (E.fade)        startChatFade(10000);
            if (E.chatlogBlur) depthChatlogBlur();
            if (E.pant)        triggerSteamParticles(true, true);   // 單一喘氣（人物身上）
            addArousal('depth');   // 日常干擾興奮值
            // 催眠值：開催眠動畫 → 先播特效、第 5 秒才漲（破百時清場播符咒）；否則即時漲
            if (CONFIG.hypnoAnimEnabled) setTimeout(() => { try { addHypno('depth'); } catch (e) {} }, 5000); else addHypno('depth');
        } catch (e) {
            console.warn('🐈‍⬛ [HSC] 深度效果錯誤:', e.message);
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
            zIndex:     HSC_Z.sceneText,   // 在模糊遮罩、煙霧之上，避免被蓋住
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
    // durationMs：人影出現總時長（含淡入淡出）。預設對齊目前催眠時長；
    //   未來長時間催眠只要傳更大的值，人影就跟隨更久。
    function depthGhostWhisperer(durationMs = 4800) {
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
        //  → 用 BC 自己的 DrawCharacter 繪製（身高/姿勢/縮放完全正確，不變形）。
        //  關鍵：清掉會讓 DrawCharacter 一起畫出來的 overlay（興奮量表、名字、狀態、focus）
        //    - Name=''            → 不畫名牌
        //    - ArousalSettings.Visible 非 Access/All + 非玩家 → DrawArousalMeter 直接跳過
        //    - HasHiddenItems / FocusGroup 清掉 → 不畫隱藏物/聚焦框
        const ghostChar = Object.assign(Object.create(Object.getPrototypeOf(srcChar)), srcChar);
        ghostChar.Canvas = fc;
        ghostChar.CanvasBlink = fc;
        ghostChar.MemberNumber = -99999;   // 非玩家 → hook 不會對它再畫人影
        ghostChar.MustDraw = false;
        ghostChar.Name = '';               // 不畫名字
        ghostChar.Nickname = '';
        ghostChar.HasHiddenItems = false;
        ghostChar.FocusGroup = null;
        ghostChar.ArousalSettings = Object.assign({}, srcChar.ArousalSettings || {},
            { Visible: 'None', Progress: 0, VibratorLevel: 0, OrgasmCount: undefined, OrgasmTimer: 0 });

        // 相對玩家的螢幕像素偏移
        const offXpx = 35, offYpx = -10;
        _ghost = { char: ghostChar, canvas: fc, offXpx, offYpx, alpha: 0 };

        // 淡入 / 維持 / 淡出（DrawCharacter hook 每幀讀 alpha）
        const D = Math.max(2500, durationMs);
        const FADE_IN = 1000, FADE_OUT = 1300;
        const start = Date.now();
        const fade = () => {
            if (!_ghost) return;
            const t = Date.now() - start;
            if      (t < FADE_IN)        _ghost.alpha = (t / FADE_IN) * 0.92;
            else if (t < D - FADE_OUT)   _ghost.alpha = 0.92;
            else if (t < D)              _ghost.alpha = 0.92 * (1 - (t - (D - FADE_OUT)) / FADE_OUT);
            else { _ghost = null; return; }
            requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);

        // 文字位置：就在人影（陰影）頭部旁，像在耳邊低語。
        //  ignoreHeadshot=true → 永遠貼在角色身上（日常干擾沒有中央頭像功能）；再往上 70 避免遮眼。
        const headS = getPlayerHeadScreenPos(true);
        const txt = document.createElement('div');
        Object.assign(txt.style, {
            position: 'fixed', left: `${headS.x + offXpx}px`, top: `${headS.y + offYpx - 18 - 70}px`,
            transform: 'translateX(-50%)', fontSize: '26px', fontWeight: '600',
            fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif', textAlign: 'center',
            color: 'rgba(255,220,240,0.92)', textShadow: '0 0 10px rgba(180,80,200,0.85)',
            whiteSpace: 'pre-line', opacity: '0', transition: 'opacity 0.8s ease', pointerEvents: 'none', zIndex: HSC_Z.sceneText,
        });
        // 耳邊句子比照語音催眠的「主台詞」：逐字波浪浮現（共用 fillWaveText）
        fillWaveText(txt, line, 12, 80);
        getOverlay().appendChild(txt);
        requestAnimationFrame(() => { txt.style.opacity = '1'; txt.querySelectorAll('span').forEach(s => s.style.opacity = '1'); });
        setTimeout(() => { txt.style.opacity = '0'; }, D - FADE_OUT);
        setTimeout(() => txt.remove(), D);
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
                            //  用 BC 原生 DrawCharacter（身高/縮放正確不變形）；已清掉 overlay 欄位 → 只出人物本體。
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
            console.warn('🐈‍⬛ [HSC] DrawCharacter hook 失敗:', e.message);
        }
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
    depthChatlogBlur,
};
