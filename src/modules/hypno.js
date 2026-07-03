// ════════════════════════════════════════
//  HSC module: hypno.js
//  催眠值（0~100）：語音/深度催眠各自加值，每 12 秒 -1（比照 BC 興奮值衰減）。
//  100% → 進入「強控」狀態（目前僅視覺＋催眠表情，不鎖說話/移動；日後可加）。
//  防永不醒來：強控中觸發，增量變 1/10（例 20→2），只延長不永久。
//  解除：催眠值 < 15%，或有人說出清醒詞（wake）→ 立即清醒且催眠值 >80% 則設為 80%。
//  執行期數值，重載後歸零（與 BC 興奮值行為一致，不存帳號）。
// ════════════════════════════════════════

import { CONFIG, EXPRESSION_SETS } from './config.js';
import { pushExprEffect, popExprEffect, hypnoOrgasm } from './character-fx.js';
import { sendLocalizedAction } from './l10n.js';
import { updateCrowd } from './crowd.js';
import { updateHeadTalisman, playHypnoAnim, stopHypnoAnim } from './hypno-anim.js';
import { publishHypnoState } from './storage.js';

// 把目前催眠進度公告出去（供房內其他 HSC 玩家在你頭上顯示進度球／符咒）
function _publishHypno(immediate = false) {
    try { publishHypnoState(_hypno, _forced, CONFIG.hypnoAnimColor, CONFIG.hypnoAnimStyle, immediate); } catch (e) {}
}

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
    // 符咒動畫：只在陷入催眠（破百）時播一次儀式（會先清場）；播完才顯示人群/頭上符咒。
    //  未開催眠動畫 → 直接顯示人群。
    if (CONFIG.hypnoAnimEnabled) {
        try { playHypnoAnim(() => { updateCrowd(true); updateHeadTalisman(); }); } catch (e) { updateCrowd(true); updateHeadTalisman(); }
    } else {
        updateCrowd(true);
        updateHeadTalisman();   // 頭上符咒獨立於動畫 → 未開動畫也要顯示
    }
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
    try { hypnoOrgasm(CONFIG.hypnoClimax); } catch (e) {}   // 催眠高潮：開→正常高潮、關→邊緣（陷入強控時觸發一次）
    _publishHypno(true);   // 強控開始 → 立即公告
}
function _exitForced() {
    const was = _forced;
    _forced = false;
    if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = null; }
    if (_forcedExprPushed) { try { popExprEffect(); } catch (e) {} _forcedExprPushed = false; }
    updateCrowd(false);         // 收起人群
    updateHeadTalisman();       // 收起頭上符咒
    if (was) sendLocalizedAction('hs_exitForced');   // 醒來時
    _publishHypno(true);        // 強控結束 → 立即公告
}

// kind: 'voice' | 'depth'
export function addHypno(kind) {
    if (!CONFIG.enabled || !CONFIG.hypnoEnabled) return;
    let step = kind === 'voice' ? (CONFIG.hypnoVoiceStep || 0) : (CONFIG.hypnoDepthStep || 0);
    if (step <= 0) return;
    if (_forced) step = step * ((CONFIG.forcedGrowthDiv || 1) / 10);   // 強控中增量 = 原值 × N/10，防永不醒來
    _hypno = Math.min(100, _hypno + step);
    if (_hypno >= 100) _enterForced();
    else _publishHypno();   // 一般成長 → 節流公告（強控時 _enterForced 已立即公告）
}

// 測試用：立即把催眠值拉滿並陷入強控（免催到 100%）
export function enterHypnoNow() {
    _hypno = 100;
    _enterForced();
}

// 登入還原：OnlineSharedSettings 保留了上次的催眠進度（別人看得到），
//  但執行期 _hypno/_forced 會歸零 → 自己與他人不一致。登入時據此還原，
//  且「不重播儀式動畫、不再發強控旁白」（只還原數值與常駐視覺）。
export function restoreHypnoState(v, forced) {
    _hypno = Math.max(0, Math.min(100, Math.round(v || 0)));
    if (forced && !_forced) {
        _forced = true;
        try {
            if (CONFIG.expression && EXPRESSION_SETS && EXPRESSION_SETS.length && !_forcedExprPushed) {
                pushExprEffect(EXPRESSION_SETS[Math.floor(Math.random() * EXPRESSION_SETS.length)]);
                _forcedExprPushed = true;
            }
        } catch (e) {}
        updateCrowd(true);         // 若已在房內立即顯示；否則進房事件會再補
        updateHeadTalisman();
        if (_idleTimer) clearInterval(_idleTimer);
        _idleTimer = setInterval(() => { if (_forced) sendLocalizedAction('hs_forcedIdle'); }, 600000);
    }
    _publishHypno(true);   // 重新公告，確保數值一致
}

// 關閉 HSC 總開關：把催眠進度歸零、狀態設 false（公告給他人），並清除所有顯示中的效果。
export function disableHypno() {
    _hypno = 0;
    _forced = false;
    if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = null; }
    if (_forcedExprPushed) { try { popExprEffect(); } catch (e) {} _forcedExprPushed = false; }
    // 清除顯示中的狀態：人群、儀式動畫、頭上符咒
    try { updateCrowd(false); } catch (e) {}
    try { stopHypnoAnim(); } catch (e) {}
    try { updateHeadTalisman(); } catch (e) {}
    // 清空 overlay 上所有暫態特效（喘氣、彈幕、螺旋、煙霧等）＋還原畫布濾鏡/位移
    try { const ov = document.getElementById('hsc-overlay'); if (ov) ov.innerHTML = ''; } catch (e) {}
    try { const cv = document.getElementById('MainCanvas') || document.querySelector('canvas'); if (cv) { cv.style.filter = ''; cv.style.transform = ''; } } catch (e) {}
    // OnlineSharedSettings：催眠進度 0、狀態 false（立即送出，讓他人不再看到你被催眠）
    try { publishHypnoState(0, false, CONFIG.hypnoAnimColor, CONFIG.hypnoAnimStyle, true); } catch (e) {}
}

// 清醒詞：立即清醒；催眠值 >80% → 設為 80%
export function wake() {
    _exitForced();
    if (_hypno > 80) _hypno = 80;
    _publishHypno(true);
}

export function startHypnoDecay() {
    if (_decayTimer) return;
    _decayTimer = setInterval(() => {
        const before = _hypno;
        if (_hypno > 0) _hypno = Math.max(0, _hypno - 1);   // 每 12 秒 -1
        if (_forced && CONFIG.autoWake && _hypno < 15) _exitForced();   // 自動清醒：<15% 解除強控
        if (_hypno !== before) _publishHypno();   // 衰減 → 節流公告（讓他人頭上的進度球跟著降）
    }, 12000);
}
