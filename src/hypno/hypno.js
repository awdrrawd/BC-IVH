// ════════════════════════════════════════
//  HSC module: hypno.js
//  催眠值（0~100）：語音/日常催眠各自加值，未強控時每 12 秒 -1（比照 BC 興奮值衰減）。
//  100% → 進入「催眠狀態（強控）」。
//  ── 催眠狀態改為「時間制」──
//   · 進入時：清醒倒數 = 自動清醒分鐘（滿）；自動清醒關 → 無倒數（∞），只能靠清醒詞。
//   · 強控中再被觸發（語音/日常）＋催眠延長開 → 清醒時間 += 催眠延長秒（可超過自動清醒）。
//   · 倒數到 0（自動清醒）或有人說出清醒詞（wake）→ 立即清醒，且催眠值歸 0。
//  執行期數值，重載後歸零（與 BC 興奮值行為一致，不存帳號；登入時依公告還原）。
// ════════════════════════════════════════

import { CONFIG, EXPRESSION_SETS } from '../core/config.js';
import { pushExprEffect, popExprEffect, hypnoOrgasm } from '../effects/character-fx.js';
import { sendLocalizedAction } from '../i18n/l10n.js';
import { updateCrowd } from '../effects/crowd.js';
import { updateHeadTalisman, playHypnoAnim, stopHypnoAnim } from './hypno-anim.js';
import { publishHypnoState } from '../core/storage.js';

// 把目前催眠進度／清醒倒數公告出去（供房內其他 HSC 玩家在你頭上顯示進度球／符咒／倒數）
function _publishHypno(immediate = false) {
    try {
        const inf = _forced && _wakeAt <= 0;                                  // 強控＋無自動清醒 → ∞
        const remSec = (_forced && _wakeAt > 0) ? Math.max(0, Math.round((_wakeAt - Date.now()) / 1000)) : 0;
        const baseSec = Math.max(1, (CONFIG.autoWakeMin || 30) * 60);         // 水位基底（給他人算填滿比例）
        publishHypnoState(_hypno, _forced, CONFIG.hypnoAnimColor, CONFIG.hypnoAnimStyle, immediate, remSec, inf, baseSec);
    } catch (e) {}
}

let _hypno = 0;              // 0~100（未強控時的累積催眠值）
let _forced = false;         // 強控中（催眠狀態）
let _wakeAt = 0;             // 自動清醒時間戳（ms）；0 = 無自動清醒（∞，只能靠清醒詞）
let _forcedExprPushed = false;
let _decayTimer = null;
let _idleTimer = null;       // 強控中每 10 分鐘一次的狀態 Action

export function getHypnoValue() { return _hypno; }
export function isForced() { return _forced; }
// 剩餘清醒時間（ms）：非強控 → 0；強控且有自動清醒 → 剩餘毫秒；強控但自動清醒關 → Infinity（∞）
export function getWakeRemainingMs() {
    if (!_forced) return 0;
    if (_wakeAt <= 0) return Infinity;
    return Math.max(0, _wakeAt - Date.now());
}

// 依目前設定計算「進入強控」時的清醒時間戳（自動清醒開 → now + 分鐘；關 → 0＝∞）
function _computeWakeAt() {
    return CONFIG.autoWake ? (Date.now() + Math.max(1, (CONFIG.autoWakeMin || 30)) * 60000) : 0;
}

function _enterForced() {
    if (_forced) return;
    _forced = true;
    _wakeAt = _computeWakeAt();               // 進入強控 → 設定清醒倒數（自動清醒為基底）
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
    _wakeAt = 0;
    _hypno = 0;                 // ★ 清醒 → 催眠值歸 0（時間制新規）
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
    if (_forced) {
        // 催眠狀態中：觸發 → 延長清醒時間（催眠延長開、且有自動清醒倒數時；∞ 狀態無倒數可延長）
        if (CONFIG.hypnoExtend && _wakeAt > 0) {
            _wakeAt += Math.max(10, (CONFIG.hypnoExtendSec || 60)) * 1000;   // 可超過自動清醒基底
            _publishHypno(true);   // 延長 → 立即公告（讓他人頭上倒數重置為新值）
        }
        return;
    }
    // 未強控：語音/日常各自加催眠值，累積到 100% → 進入催眠狀態
    const step = kind === 'voice' ? (CONFIG.hypnoVoiceStep || 0) : (CONFIG.hypnoDepthStep || 0);
    if (step <= 0) return;
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
export function restoreHypnoState(v, forced, remSec, inf) {
    _hypno = Math.max(0, Math.min(100, Math.round(v || 0)));
    if (forced && !_forced) {
        _forced = true;
        // 還原清醒倒數：∞ → 0（無自動清醒）；否則 now + 上次剩餘秒（拿不到剩餘就用自動清醒基底）
        _wakeAt = inf ? 0 : (remSec > 0 ? (Date.now() + remSec * 1000) : _computeWakeAt());
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
    _wakeAt = 0;
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
    try { publishHypnoState(0, false, CONFIG.hypnoAnimColor, CONFIG.hypnoAnimStyle, true, 0, false, 1); } catch (e) {}
}

// 清醒詞：立即清醒（催眠值歸 0，由 _exitForced 處理）
export function wake() {
    _exitForced();
}

// 統一計時器（每秒一次）：
//  · 強控中：到自動清醒時間 → 自動清醒（歸 0）；∞ 狀態不自動醒。
//  · 未強控：催眠值每 12 秒 -1（比照興奮值衰減）。
export function startHypnoDecay() {
    if (_decayTimer) return;
    let tick = 0;
    _decayTimer = setInterval(() => {
        tick++;
        if (_forced) {
            if (_wakeAt > 0 && Date.now() >= _wakeAt) _exitForced();   // 時間到 → 自動清醒
            return;                                                    // 強控中不衰減催眠值（改由時間管理）
        }
        if (tick % 12 === 0 && _hypno > 0) {   // 每 12 秒 -1
            _hypno = Math.max(0, _hypno - 1);
            _publishHypno();                   // 衰減 → 節流公告（他人頭上進度球跟著降）
        }
    }, 1000);
}
