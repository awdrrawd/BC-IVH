// ── auto-wired cross-module imports ──
import { addArousal, broadcastHypnotized, popExprEffect, pushExprEffect, sendStatusEmote, showCenterHeadshot, startChatFade } from './character-fx.js';
import { CONFIG, EXPRESSION_SETS } from './config.js';
import { triggerHypnoSpiral, triggerHypnoWaves, triggerPinkFlash, triggerScreenDistort, triggerVignette } from './effects.js';
import { triggerClimaxEffect, triggerDanmakuMulti, triggerSteamParticles } from './effects2.js';
import { BASE_EFFECT_DURATION, refreshCanvasCache } from './geometry.js';
import { addHypno } from './hypno.js';
import { playSoundCategory, triggerBreathSound } from './sound.js';
import { effectScale, getArousalLevel, wait } from './util.js';

// ════════════════════════════════════════
//  IVH module: run.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  主效果流程
    // ════════════════════════════════════════
    async function runEffect(voiceText, isTest = false) {
        if (!CONFIG.enabled || !CONFIG.voiceEnabled) return;
        // 只在 ChatRoom 畫面內作用（避免在其他畫面觸發）
        if (typeof CurrentScreen !== 'undefined' && CurrentScreen !== 'ChatRoom') {
            return;
        }
        refreshCanvasCache();

        // ① 先換表情（高潮時用 BC 自帶表情，跳過 IVH 替換）
        const orgasmStageNow = Player?.ArousalSettings?.OrgasmStage ?? 0;
        const willOrgasm = orgasmStageNow === 2;
        const doExpr = CONFIG.expression && !willOrgasm && EXPRESSION_SETS && EXPRESSION_SETS.length;
        if (doExpr) {
            pushExprEffect(EXPRESSION_SETS[Math.floor(Math.random() * EXPRESSION_SETS.length)]);
            // 等表情的 Canvas 重建好，再放其餘特效（截圖才有新表情）
            await wait(280);
        }

        const arousalAdd   = addArousal('voice');
        const scale        = effectScale();
        // 彈幕數量與「興奮增量」脫鉤（arousalStep 可到 20，會洗版）→ 上限 5
        const danmakuCount = Math.max(1, Math.round(Math.min(arousalAdd, 5) * Math.min(scale, 1.5)));
        const totalDur     = BASE_EFFECT_DURATION * Math.min(scale, 1.4);
        const wordCount    = voiceText.trim().split(/\s+/).length;

        // ② 狀態 emote + 催眠廣播 + 語音催眠值（僅真實觸發，避免測試時洗版）
        if (!isTest) { sendStatusEmote(); broadcastHypnotized(); addHypno('voice'); }

        // ③ 視覺效果同時觸發
        if (CONFIG.centerHeadshot) showCenterHeadshot(totalDur + 1500, true);   // 喘氣時頭像呼吸縮放
        triggerVignette();
        triggerScreenDistort();
        triggerPinkFlash();
        triggerHypnoSpiral();
        triggerHypnoWaves(wordCount);
        triggerDanmakuMulti(voiceText, danmakuCount);
        triggerSteamParticles();
        if (CONFIG.chatFade) startChatFade(10000);   // 訊息浮現視窗
        if (CONFIG.sound) {
            triggerBreathSound(scale);                                   // 催眠喘息聲（催眠分類）
            // 雙重音效：同時再播一個觸發音（催眠2 分類，預設心跳）
            if (CONFIG.dualSound) playSoundCategory('voice', Math.min(0.5 + scale * 0.15, 0.9));
        }

        // ④ 高潮特效
        //   climaxMode='orgasm' → BC OrgasmStage=2（真正高潮）時觸發
        //   climaxMode='always' → 每次催眠都觸發
        //   OrgasmStage=0: 正常, =1: 抵抗中, =2: 真正高潮（不抵抗或抵抗失敗）
        const arousalNow   = getArousalLevel();
        const orgasmStage  = Player?.ArousalSettings?.OrgasmStage ?? 0;
        const bcOrgasming  = orgasmStage === 2;
        const doClimax     = CONFIG.climax && (
            CONFIG.climaxMode === 'always' ||
            bcOrgasming ||
            (isTest && arousalNow >= 95)
        );
        if (doClimax) {
            await wait(600);
            triggerClimaxEffect(scale);
        }

        // ⑤ 等效果播完
        await wait(totalDur);

        // ⑥ 恢復表情（特效結束後 1~2 秒）
        if (doExpr) {
            await wait(1200 + Math.random() * 800);
            popExprEffect();
        }
    }

    // ════════════════════════════════════════
    //  解析聊天文字
    // ════════════════════════════════════════
    function parseVoiceText(rawText) {
        const brackets = rawText.match(/【([^】]+)】/g);
        if (brackets && brackets.length > 0) {
            const last     = brackets[brackets.length - 1].replace(/【|】/g, '');
            const colonIdx = last.indexOf(':');
            if (colonIdx !== -1) return last.slice(colonIdx + 1).trim();
            return last.trim();
        }
        return rawText.trim();
    }


export {
    runEffect,
    parseVoiceText,
};
