// ════════════════════════════════════════
//  IVH module: hypno.js
//  催眠值（0~100）：語音/深度催眠各自加值，每 12 秒 -1（比照 BC 興奮值衰減）。
//  100% → 進入「強控」狀態（目前僅視覺＋催眠表情，不鎖說話/移動；日後可加）。
//  防永不醒來：強控中觸發，增量變 1/10（例 20→2），只延長不永久。
//  解除：催眠值 < 15%，或有人說出清醒詞（wake）→ 立即清醒且催眠值 >80% 則設為 80%。
//  執行期數值，重載後歸零（與 BC 興奮值行為一致，不存帳號）。
// ════════════════════════════════════════

import { CONFIG, EXPRESSION_SETS } from './config.js';
import { pushExprEffect, popExprEffect } from './character-fx.js';
import { sendLocalizedAction } from './l10n.js';

let _hypno = 0;              // 0~100
let _forced = false;         // 強控中
let _forcedExprPushed = false;
let _decayTimer = null;
let _idleTimer = null;       // 強控中每 10 分鐘一次的狀態 Action

export function getHypnoValue() { return _hypno; }
export function isForced() { return _forced; }

function _enterForced() {
    if (_forced) return;
    _forced = true;
    sendLocalizedAction('hs_enterForced');   // 被催眠時（在地化：發英文、接收端各看各語言）
    // 強控視覺：套一組催眠表情並保持到解除
    try {
        if (CONFIG.expression && EXPRESSION_SETS && EXPRESSION_SETS.length && !_forcedExprPushed) {
            pushExprEffect(EXPRESSION_SETS[Math.floor(Math.random() * EXPRESSION_SETS.length)]);
            _forcedExprPushed = true;
        }
    } catch (e) {}
    // 強控中每 10 分鐘一次狀態 Action
    if (_idleTimer) clearInterval(_idleTimer);
    _idleTimer = setInterval(() => { if (_forced) sendLocalizedAction('hs_forcedIdle'); }, 600000);
}
function _exitForced() {
    const was = _forced;
    _forced = false;
    if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = null; }
    if (_forcedExprPushed) { try { popExprEffect(); } catch (e) {} _forcedExprPushed = false; }
    if (was) sendLocalizedAction('hs_exitForced');   // 醒來時
}

// kind: 'voice' | 'depth'
export function addHypno(kind) {
    if (!CONFIG.enabled || !CONFIG.hypnoEnabled) return;
    let step = kind === 'voice' ? (CONFIG.hypnoVoiceStep || 0) : (CONFIG.hypnoDepthStep || 0);
    if (step <= 0) return;
    if (_forced) step = step * ((CONFIG.forcedGrowthDiv || 1) / 10);   // 強控中增量 = 原值 × N/10，防永不醒來
    _hypno = Math.min(100, _hypno + step);
    if (_hypno >= 100) _enterForced();
}

// 清醒詞：立即清醒；催眠值 >80% → 設為 80%
export function wake() {
    _exitForced();
    if (_hypno > 80) _hypno = 80;
}

export function startHypnoDecay() {
    if (_decayTimer) return;
    _decayTimer = setInterval(() => {
        if (_hypno > 0) _hypno = Math.max(0, _hypno - 1);   // 每 12 秒 -1
        if (_forced && CONFIG.autoWake && _hypno < 15) _exitForced();   // 自動清醒：<15% 解除強控
    }, 12000);
}
