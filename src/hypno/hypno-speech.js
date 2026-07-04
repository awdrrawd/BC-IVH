// ════════════════════════════════════════
//  HSC module: hypno-speech.js
//  強控（催眠值 100%）中說話 → 攔截一般 Chat：先發「思考」Action，等 2 秒後隨機四選一：
//    0 呆呆站著（什麼也不說）
//    1 停頓一下才開口（照說原句）
//    2 意識被干擾（改說「催眠回應」隨機一句）
//    3 滿腦子淫穢（觸發自慰活動；無法執行則發 Action 描述）
// ════════════════════════════════════════

import { CONFIG, modApi } from '../core/config.js';
import { isForced } from './hypno.js';
import { sendLocalizedAction } from '../i18n/l10n.js';
import { resolveMe, pickRandom } from '../util/util.js';

let _busy = false;

function sendChat(text) {
    try { if (typeof ServerSend === 'function' && text) ServerSend('ChatRoomChat', { Type: 'Chat', Content: String(text) }); } catch (e) {}
}

// 自慰：優先跑 BC 的 MasturbateHand 活動（會自動發訊息）；無法執行則發 Action 描述
function doMasturbate() {
    try { if (typeof DrawFlashScreen === 'function') DrawFlashScreen('#F347B4', 1500, 500); } catch (e) {}
    try {
        const family = (typeof Player !== 'undefined' && Player.AssetFamily) || 'Female3DCG';
        const act = (typeof AssetGetActivity === 'function') ? AssetGetActivity(family, 'MasturbateHand') : null;
        const canInteract = !Player.CanInteract || Player.CanInteract();
        if (act && canInteract && Array.isArray(act.Target)) {
            const valid = act.Target.filter(g => { try { return ActivityCanBeDone(Player, 'MasturbateHand', g); } catch { return false; } });
            if (valid.length) {
                const gName = valid[Math.floor(Math.random() * valid.length)];
                const group = (typeof AssetGroupGet === 'function') ? AssetGroupGet(family, gName) : null;
                if (group) { ActivityRun(Player, Player, group, { Activity: act, Group: gName }, true); return; }
            }
        }
    } catch (e) {}
    sendLocalizedAction('hs_lewdFallback');   // 無法執行活動 → 文字描述
}

// 讀取聊天輸入、判斷是否該攔截；攔截則清空輸入並跑流程，回傳 true
export function maybeInterceptHypnoSpeech() {
    if (_busy) return false;
    if (!CONFIG.enabled || !CONFIG.hypnoEnabled || !isForced()) return false;
    let val;
    try { val = ElementValue('InputChat'); } catch { return false; }
    if (typeof val !== 'string') return false;
    const t = val.trim();
    if (!t) return false;
    // 只攔「一般說話」：略過指令(/)、OOC(( )、表情(*)、指令(.)
    if (/^[/(*.]/.test(t)) return false;
    // 悄悄話（有指定對象）不攔
    try { if (typeof ChatRoomTargetMemberNumber === 'number' && ChatRoomTargetMemberNumber >= 0) return false; } catch (e) {}

    const low = t.toLowerCase();
    // 允許說的話：整句剛好符合 → 不陷入思考，照常說出（清醒詞自己說無效，故不特別處理）
    const allowed = (CONFIG.allowedPhrases || []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
    if (allowed.includes(low)) return false;

    try { ElementValue('InputChat', ''); } catch (e) {}   // 清空輸入，阻止原本送出
    _busy = true;
    sendLocalizedAction('hs_thinking');
    setTimeout(() => {
        try {
            const r = Math.floor(Math.random() * 4);
            if (r === 0) {
                sendLocalizedAction('hs_blank');
            } else if (r === 1) {
                sendLocalizedAction('hs_pause');
                sendChat(t);
            } else if (r === 2) {
                sendLocalizedAction('hs_intercept');
                const list = (CONFIG.responseList || []).filter(Boolean);
                sendChat(resolveMe(list.length ? pickRandom(list, 1)[0] : t));
            } else {
                sendLocalizedAction('hs_lewd');
                doMasturbate();
            }
        } catch (e) {}
        _busy = false;
    }, 2000);
    return true;
}

// 掛在 ChatRoomSendChat 前：強控中攔截一般說話
export function hookHypnoSpeech() {
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomSendChat', 5, (args, next) => {
            if (maybeInterceptHypnoSpeech()) return;   // 攔截 → 不送出
            return next(args);
        });
    } catch (e) {
        console.warn('🐈‍⬛ [HSC] 催眠說話攔截 hook 失敗:', e.message);
    }
}
