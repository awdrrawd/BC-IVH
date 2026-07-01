// ── auto-wired cross-module imports ──
import { CONFIG } from './config.js';
import { runEffect } from './run.js';
import { IVH_Z } from './zlayers.js';

// ════════════════════════════════════════
//  IVH module: util.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  取得目前興奮度（0~100）
    // ════════════════════════════════════════
    function getArousalLevel() {
        try {
            return Player?.ArousalSettings?.Progress ?? 0;
        } catch { return 0; }
    }

    // intensity 0.5~2.0，由 CONFIG.intensity × 興奮度加成
    function effectScale() {
        const arousal = getArousalLevel();
        const arousalBonus = 1 + (arousal / 100) * 0.6; // 最高 +60%
        return CONFIG.intensity * arousalBonus;
    }

    // ════════════════════════════════════════
    //  BCX 快取
    // ════════════════════════════════════════
    let _bcxReminderCache = null;

    function getBCXReminderList() {
        if (_bcxReminderCache !== null) return _bcxReminderCache;
        try {
            const bcxRaw = Player?.ExtensionSettings?.BCX;
            if (!bcxRaw) return (_bcxReminderCache = []);
            const parts      = bcxRaw.split(':');
            const compressed = parts[1];
            if (!compressed) return (_bcxReminderCache = []);
            const jsonStr    = LZString.decompressFromBase64(compressed);
            if (!jsonStr) return (_bcxReminderCache = []);
            const bcxData    = JSON.parse(jsonStr);
            const rule       = bcxData?.conditions?.rules?.conditions?.['other_constant_reminder'];
            _bcxReminderCache = rule?.data?.customData?.reminderText ?? [];
            return _bcxReminderCache;
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] BCX 清單讀取失敗:', e.message);
            return (_bcxReminderCache = []);
        }
    }

    function clearBCXCache() { _bcxReminderCache = null; }

    // 取訊息節點的純文字內容（去掉名稱、彈出選單、metadata）
    function extractChatText(node) {
        try {
            const clone = node.cloneNode(true);
            clone.querySelectorAll('.ChatMessageName, .chat-room-message-popup, .chat-room-metadata, .ChatMessageTimestamp')
                 .forEach(el => el.remove());
            return (clone.textContent || '').replace(/\s+/g, ' ').trim();
        } catch { return ''; }
    }

    // 從聊天室 DOM 取最近的「聊天」訊息文字（給彈幕當情境旁白；不含名稱、不含悄悄話/動作）
    function getChatHistoryLines(limit = 50) {
        try {
            const log = document.getElementById('TextAreaChatLog');
            if (!log) return [];
            const nodes = log.querySelectorAll('.ChatMessageChat');
            const out = [];
            for (let i = nodes.length - 1; i >= 0 && out.length < limit; i--) {
                const txt = extractChatText(nodes[i]);
                if (txt && txt.length >= 2 && txt.length <= 60) out.push(txt);
            }
            return out;
        } catch { return []; }
    }

    // 催眠文本來源：BCX 提醒清單 + 內建自訂文本（永遠併用）
    function getCatalystTexts() {
        return [...getBCXReminderList(), ...(CONFIG.customTexts || [])].filter(Boolean);
    }
    // 把文本中的 $me 換成玩家暱稱（不同人共用同一份文本）
    function resolveMe(text) {
        const me = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '')
                   || Player?.Nickname || Player?.Name || '';
        // $me → 暱稱；$n（或字面 \n）→ 手動換行（彈幕／人影才看得到）
        return String(text).split('$me').join(me).split('$n').join('\n').split('\\n').join('\n');
    }

    // 隨機取 n 個元素（不重複）
    function pickRandom(arr, n) {
        if (!Array.isArray(arr) || arr.length === 0) return [];
        return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
    }

    // ════════════════════════════════════════
    //  效果佇列
    // ════════════════════════════════════════
    const effectQueue   = [];
    let isEffectPlaying = false;

    async function processQueue() {
        if (isEffectPlaying || effectQueue.length === 0) return;
        isEffectPlaying = true;
        const item = effectQueue.shift();
        try {
            await runEffect(item.text, item.isTest ?? false);
        } catch (e) {
            console.error('🐈‍⬛ [IVH] 效果執行錯誤:', e.message);
        } finally {
            isEffectPlaying = false;
            if (effectQueue.length > 0) setTimeout(processQueue, 300);
        }
    }

    let _lastTriggerTime = 0;
    function triggerVoiceEffect(voiceText, isTest = false) {
        // 合併近乎同時的觸發（例如聊天觸發詞 + [Voice] 訊息），避免重複觸發/雙重 emote
        const now = Date.now();
        if (!isTest && now - _lastTriggerTime < 1500) return;
        _lastTriggerTime = now;
        if (effectQueue.length < 3) {
            effectQueue.push({ text: voiceText, isTest });
        }
        processQueue();
    }

    // ════════════════════════════════════════
    //  工具
    // ════════════════════════════════════════
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function randFloat(min, max) { return Math.random() * (max - min) + min; }

    // ── 語言判斷（每次呼叫時才讀，確保 TranslationLanguage 已載入）──
    function isZh() {
        try {
            if (typeof TranslationLanguage !== 'undefined' && TranslationLanguage) {
                const l = TranslationLanguage.toLowerCase();
                return l === 'cn' || l === 'tw';
            }
        } catch {}
        return (navigator.language || '').toLowerCase().startsWith('zh');
    }

    function T(zh, en) { return isZh() ? zh : en; }

    const TOGGLE_LABELS = {
        pinkFlash:      () => ['🌸', T('粉紅暈染','Pink Flash')],
        hypnoSpiral:    () => ['🌀', T('催眠螺旋','Hypno Spiral')],
        hypnoWaves:     () => ['〰️', T('同心電波','Hypno Waves')],
        screenDistort:  () => ['🔮', T('畫面扭曲','Distortion')],
        vignette:       () => ['🌑', T('邊緣暗角','Vignette')],
        danmaku:        () => ['💬', T('彈幕文字','Danmaku')],
        steamParticles: () => ['💨', T('喘氣白霧','Steam FX')],
        expression:     () => ['😳', T('表情切換','Expression')],
        climax:         () => ['💥', T('高潮特效','Climax FX')],
        sound:          () => ['🔊', T('喘息聲音','Sound')],
        dualSound:      () => ['🔊', T('雙重音效','Dual Sound')],
        centerHeadshot: () => ['🖼', T('中央頭像','Headshot')],
    };

    function getOverlay() {
        let overlay = document.getElementById('ivh-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ivh-overlay';
            Object.assign(overlay.style, {
                position:      'fixed',
                top:           '0',
                left:          '0',
                width:         '100%',
                height:        '100%',
                pointerEvents: 'none',
                zIndex:        IVH_Z.overlay,
                overflow:      'hidden',
            });
            document.body.appendChild(overlay);
        }
        return overlay;
    }


export {
    getArousalLevel,
    effectScale,
    getBCXReminderList,
    clearBCXCache,
    extractChatText,
    getChatHistoryLines,
    getCatalystTexts,
    resolveMe,
    pickRandom,
    effectQueue,
    processQueue,
    triggerVoiceEffect,
    wait,
    randInt,
    randFloat,
    isZh,
    T,
    TOGGLE_LABELS,
    getOverlay,
};
