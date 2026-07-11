// ════════════════════════════════════════
//  HSC module: net.js
//  統一送出 HSC 的 Hidden ChatRoomChat（隱藏訊息）。
//  BC 的每則 Hidden 訊息都會廣播給房內所有人、每人的 ChatRoomMessage 都會解析一次，
//  因此瞬間連送多則（權限查詢/回覆、催眠廣播、遠端編輯…）容易讓 socket 尖峰、連線不穩。
//  這裡用「最小間隔佇列 + 短時間去重」把送出攤平：
//    - 任兩則 HSC 隱藏訊息至少間隔 MIN_GAP ms
//    - 相同 dedupeKey 在 dedupeMs 內只送一次（吸收抖動 / 重複觸發）
// ════════════════════════════════════════

const MIN_GAP = 250;                 // 任兩則 HSC 隱藏訊息最小間隔（ms）
const _sendQ = [];                   // 待送佇列：{ payload }
const _dedupe = new Map();           // dedupeKey -> 上次送出時間
let _sendTimer = null;
let _lastSentAt = 0;

function _flush() {
    _sendTimer = null;
    if (!_sendQ.length) return;
    const now = Date.now();
    const wait = Math.max(0, MIN_GAP - (now - _lastSentAt));
    if (wait > 0) { _sendTimer = setTimeout(_flush, wait); return; }
    const job = _sendQ.shift();
    try { if (typeof ServerSend === 'function') ServerSend('ChatRoomChat', job.payload); } catch (e) { /* 送出失敗忽略 */ }
    _lastSentAt = Date.now();
    if (_sendQ.length && !_sendTimer) _sendTimer = setTimeout(_flush, MIN_GAP);
}

/**
 * 送出一則 HSC 隱藏訊息（排入間隔佇列）。
 * @param {string} content     ChatRoomChat 的 Content（例：'HSC_PermQuery'）
 * @param {any[]|object} [dictionary] 對應的 Dictionary（沿用各訊息原本的形狀）
 * @param {object} [opts]
 * @param {string} [opts.dedupeKey] 去重鍵；同鍵在 dedupeMs 內只送一次
 * @param {number} [opts.dedupeMs=800] 去重視窗
 * @param {boolean} [opts.priority=false] 插隊到佇列最前（回覆類可用，讓對方早點收到）
 * @returns {boolean} 是否已排入（被去重丟棄則回 false）
 */
export function hscServerSend(content, dictionary, opts = {}) {
    const { dedupeKey = null, dedupeMs = 800, priority = false } = opts;
    if (dedupeKey) {
        const now = Date.now();
        const prev = _dedupe.get(dedupeKey);
        if (prev && now - prev < dedupeMs) return false;
        _dedupe.set(dedupeKey, now);
        // 偶爾清掉過期的去重鍵，避免 Map 無限成長
        if (_dedupe.size > 200) for (const [k, t] of _dedupe) if (now - t > 60000) _dedupe.delete(k);
    }
    const payload = { Type: 'Hidden', Content: content };
    if (dictionary != null) payload.Dictionary = dictionary;
    const job = { payload };
    if (priority) _sendQ.unshift(job); else _sendQ.push(job);
    if (!_sendTimer) _sendTimer = setTimeout(_flush, 0);
    return true;
}
