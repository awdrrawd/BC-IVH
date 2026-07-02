// ════════════════════════════════════════
//  IVH module: l10n.js  （在地化訊息 — POC）
//  概念：送出時 Content 放「亂碼」（沒裝插件/發送者本人看到亂碼），Dictionary 夾帶
//  { Tag:'IVH_L10N', key, name }；裝了 IVH 的「接收端」hook ChatRoomMessage，偵測到
//  標記就用「自己的語言」ui(key) 替換 Content 後再顯示。發送者本人不替換 → 看到亂碼，
//  藉此驗證：同一條訊息，發送端看亂碼、另一端看翻譯。
// ════════════════════════════════════════

import { modApi } from './config.js';
import { ui } from './i18n.js';

const L10N_TAG = 'IVH_L10N';
const CUSTOM_TAG = 'CUSTOM_SYSTEM_ACTION';

// IVH 會在地化的「系統旁白」英文底本（沒裝插件者看到的文字）。
//  玩家自訂文本（催眠回應、狀態 emote、原本要說的話）不在此列，不替換。
const EN_BASE = {
    hs_enterForced: "$me's mind is relentlessly eroded, the gaze growing ever more vacant, until sinking completely into the mire of trance.",
    hs_forcedIdle: "$me stares blankly with hollow eyes, lips occasionally trembling as if to speak, yet no sound comes out — utterly unresponsive, like a fully controlled puppet.",
    hs_exitForced: "After a while the erosion slowly recedes from $me's mind, the hollow eyes regaining a faint glimmer as consciousness gradually returns.",
    hs_thinking: "$me pauses, dazed, thinking for a moment…",
    hs_blank: "$me just stands there blankly, saying nothing",
    hs_pause: "$me hesitates for a moment before speaking",
    hs_intercept: "$me wants to say something, but the thought is instantly disrupted",
    hs_lewd: "$me's head is now filled with nothing but lewd thoughts",
    hs_lewdFallback: "$me starts masturbating involuntarily…",
    l10n_test: "[Translation Test] The message from {name} has been instantly localized by IVH ✅",
};

// 把 $me / $n 換成指定名字（接收端與發送端共用；聊天不換行 → $n 轉空格）
function resolveName(text, name) {
    return String(text).split('$me').join(name || '').split('$n').join(' ').split('\\n').join(' ');
}

// 接收端替換：夾帶 L10N 標記 → 一律用「自己的語言」重寫顯示（含自己發的，
//  這樣發送端也看到自己語言；沒裝插件者則看到訊息內的英文底本）。
export function hookL10n() {
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomMessage', 5, (args, next) => {
            const data = args[0];
            try {
                const dict = data && Array.isArray(data.Dictionary) ? data.Dictionary : null;
                const d = dict && dict.find(x => x && x.Tag === L10N_TAG && x.key);
                if (d) {
                    const local = resolveName(ui(d.key, { name: d.name || '' }), d.name);
                    // Action（CUSTOM_SYSTEM_ACTION）→ 改寫 CUSTOM 那筆 Text；其餘 → 改寫 Content
                    const custom = dict.find(x => x && typeof x.Tag === 'string' && x.Tag.includes(CUSTOM_TAG));
                    if (custom) custom.Text = local;
                    else data.Content = local;
                }
            } catch (e) {}
            return next(args);
        });
    } catch (e) {
        console.warn('🐈‍⬛ [IVH] L10N hook 失敗:', e.message);
    }
}

// 發一條在地化系統 Action：Content 走 CUSTOM_SYSTEM_ACTION，Text=英文底本，
//  另夾帶 IVH_L10N 標記讓接收端依語言替換。extraVars 會併進標記（供 {xxx} 代入）。
export function sendLocalizedAction(key, extraVars) {
    try {
        if (typeof ServerSend !== 'function') return;
        const name = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '')
            || (typeof Player !== 'undefined' && (Player.Nickname || Player.Name)) || '';
        const base = resolveName(EN_BASE[key] != null ? EN_BASE[key] : ui(key, extraVars, 'EN'), name);
        const dict = [
            { Tag: 'MISSING TEXT IN "Interface.csv": ' + CUSTOM_TAG, Text: base },
            Object.assign({ Tag: L10N_TAG, key: String(key), name: String(name) }, extraVars || {}),
        ];
        ServerSend('ChatRoomChat', { Type: 'Action', Content: CUSTOM_TAG, Dictionary: dict });
    } catch (e) {}
}

// 測試指令：發一條亂碼訊息並夾帶翻譯標記（console 用 window.Liko.IVH.l10nTest()）
export function l10nTest(key = 'l10n_test') {
    try {
        if (typeof ServerSend !== 'function' || typeof Player === 'undefined') return '⚠️ 無法發送（未在遊戲內）';
        const gib = 'L10N_' + Math.random().toString(36).slice(2, 10);
        const name = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '') || Player.Name || String(Player.MemberNumber);
        ServerSend('ChatRoomChat', { Type: 'Chat', Content: gib, Dictionary: [{ Tag: L10N_TAG, key: String(key), name: String(name) }] });
        return '📤 已送出亂碼「' + gib + '」：本端看亂碼，其他裝 IVH 的帳號會看到翻譯。';
    } catch (e) {
        return '⚠️ 錯誤：' + e.message;
    }
}
