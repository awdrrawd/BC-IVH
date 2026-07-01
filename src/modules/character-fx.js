// ── auto-wired cross-module imports ──
import { CONFIG } from './config.js';
import { _emitBreathPuff, breathIntervalMs } from './effects2.js';
import { BODY_PANT_DY, _cachedRect, _cachedScaleX, _charDrawPos, bcToScreen, otherCharMouthScreenPos, refreshCanvasCache } from './geometry.js';
import { getOverlay, randInt } from './util.js';
import { IVH_Z } from './zlayers.js';

// ════════════════════════════════════════
//  IVH module: character-fx.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  8. 表情
    // ════════════════════════════════════════
    //  BC 有兩個眼睛組：Eyes(右眼) / Eyes2(左眼)；WCE 再對應 右眼_Luzi / 左眼_Luzi
    function saveExpression() {
        const groups = ["Eyebrows", "Eyes", "Eyes2", "Mouth", "Blush"];
        const saved  = {};
        for (const g of groups) {
            const item = Player.Appearance.find(a => a.Asset.Group.Name === g);
            saved[g]   = item?.Property?.Expression ?? null;
        }
        return saved;
    }

    // 把一組表情展開成各群組要套用的值（雙眼預設一致；含 Luzi）
    function _expandExpr(exprObj) {
        const eyes  = exprObj.Eyes ?? null;
        const eyes2 = (exprObj.Eyes2 !== undefined) ? exprObj.Eyes2 : eyes;  // 沒指定左眼 → 跟右眼一致
        return {
            Eyebrows:   exprObj.Eyebrows ?? null,
            Eyes:       eyes,
            Eyes2:      eyes2,
            Mouth:      exprObj.Mouth ?? null,
            Blush:      exprObj.Blush ?? null,
            '右眼_Luzi': eyes,
            '左眼_Luzi': eyes2,
        };
    }

    function applyExpression(exprObj) {
        const map = _expandExpr(exprObj);
        // 1. 同步到伺服器（其他人看得到；Luzi 群組可能不被原生函式接受，try 即可）
        for (const [g, val] of Object.entries(map)) {
            try { CharacterSetFacialExpression(Player, g, val); } catch (e) {}
        }
        // 2. 直接設 Property，確保本地 canvas 立即更新（含左眼 Eyes2 / Luzi）
        for (const [g, val] of Object.entries(map)) {
            try {
                const it = Player.Appearance.find(a => a.Asset.Group.Name === g);
                if (it) { if (!it.Property) it.Property = {}; it.Property.Expression = val; }
            } catch (e) {}
        }
        try { CharacterRefresh(Player, false, false); } catch (e) {}
    }

    // 表情效果共用堆疊：避免 VOICE 與深度同時觸發時，互相把對方套的表情當成「原始值」存起來
    //  → 第一個進入時才記錄真實表情；全部結束才還原真實表情
    let _exprRealSnapshot = null;
    let _exprEffectCount  = 0;
    function pushExprEffect(exprObj) {
        try {
            if (_exprEffectCount === 0) _exprRealSnapshot = saveExpression();
            _exprEffectCount++;
            applyExpression(exprObj);
        } catch (e) {}
    }
    function popExprEffect() {
        try {
            _exprEffectCount--;
            if (_exprEffectCount <= 0) {
                _exprEffectCount = 0;
                if (_exprRealSnapshot) { applyExpression(_exprRealSnapshot); _exprRealSnapshot = null; }
            }
        } catch (e) {}
    }

    // 取某表情組的有效值清單（含 null=無表情），用於設定頁循環選擇
    const _exprOptCache = {};
    function getExpressionOptions(group) {
        if (_exprOptCache[group]) return _exprOptCache[group];
        let arr = [];
        try {
            const item = Player?.Appearance?.find(a => a.Asset.Group.Name === group);
            const g = item?.Asset?.Group
                   || (typeof AssetGroupGet === 'function' ? AssetGroupGet(Player?.AssetFamily || 'Female3DCG', group) : null);
            if (g && Array.isArray(g.AllowExpression)) arr = [...g.AllowExpression];
        } catch (e) {}
        if (!arr.includes(null)) arr = [null, ...arr];
        _exprOptCache[group] = arr;
        return arr;
    }
    // 循環切換某表情組的值
    function cycleExpression(setObj, group, dir = 1) {
        const opts = getExpressionOptions(group);
        const cur  = setObj[group] ?? null;
        let idx = opts.indexOf(cur); if (idx < 0) idx = 0;
        idx = (idx + dir + opts.length) % opts.length;
        setObj[group] = opts[idx];
    }
    // 只在本地套用表情（不同步伺服器），給設定頁即時預覽用
    function applyExpressionLocal(obj) {
        const map = _expandExpr(obj);
        for (const [g, val] of Object.entries(map)) {
            const it = Player.Appearance.find(a => a.Asset.Group.Name === g);
            if (it) { if (!it.Property) it.Property = {}; it.Property.Expression = val; }
        }
        try { CharacterRefresh(Player, false, false); } catch (e) {}
    }

    // 截目前 Player 臉部成 Image（給設定頁臉部預覽）
    function captureFaceImage(cb, srcCanvas) {
        try {
            const src = srcCanvas || (Player && Player.Canvas);
            if (!src || !src.width) return;
            const SZ = 320;
            const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
            const c  = cv.getContext('2d');
            const side  = src.width * 0.20;             // 較緊 → 臉更大
            const cropX = src.width  * 0.50 - side / 2;
            const cropY = src.height * 0.43 - side * 0.22;  // 頭往上（臉位於框上方 30%）
            c.drawImage(src, cropX, cropY, side, side, 0, 0, SZ, SZ);
            const img = new Image();
            img.onload = () => cb(img);
            img.src = cv.toDataURL();
        } catch (e) {}
    }

    // ════════════════════════════════════════
    //  9. 興奮度
    // ════════════════════════════════════════
function addArousal() {
    if (!CONFIG.arousal) return 1;
    try {
        if (!Player.ArousalSettings || Player.ArousalSettings.Active === "Inactive") return 1;

        const current = Player.ArousalSettings.Progress ?? 0;

        let add = randInt(1, 5);

        // 越接近滿值增加越慢（更自然）
        if (current > 80) add = randInt(1, 3);
        if (current > 92) add = randInt(1, 2);

        const newVal = Math.min(current + add, 100);

        ActivitySetArousal(Player, newVal);

        return add;
    } catch (e) {
        console.error("[IVH] addArousal 錯誤:", e);
        return 1;
    }
}

    // ════════════════════════════════════════
    //  觸發時發送狀態 emote（讓他人知道你的狀態）
    //  ChatRoomSendEmote 會自動帶上玩家名字，傳後綴即可
    // ════════════════════════════════════════
    function sendStatusEmote() {
        if (!CONFIG.emoteEnabled) return;
        const list = CONFIG.emoteList || [];
        if (list.length === 0) return;
        let msg = list[Math.floor(Math.random() * list.length)];
        // 前綴決定發送方式：$a → Action（系統動作）、$c → Chat（一般說話，可用於呻吟）、無 → Emote（"*"）
        let mode = 'emote';
        if (/^\s*\$a/i.test(msg))      { mode = 'action'; msg = msg.replace(/^\s*\$a\s*/i, ''); }
        else if (/^\s*\$c/i.test(msg)) { mode = 'chat';   msg = msg.replace(/^\s*\$c\s*/i, ''); }
        // $me 換成玩家暱稱；聊天不支援換行 → $n 轉空格
        const me = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '')
                   || Player?.Nickname || Player?.Name || '';
        msg = msg.split('$me').join(me).split('$n').join(' ').split('\\n').join(' ').trim();
        if (!msg) return;
        try {
            if (typeof ServerSend !== 'function') return;
            if (mode === 'action') {
                // BC 自訂系統動作：以 CUSTOM_SYSTEM_ACTION + Dictionary 帶出純文字
                ServerSend('ChatRoomChat', {
                    Type: 'Action', Content: 'CUSTOM_SYSTEM_ACTION',
                    Dictionary: [{ Tag: 'MISSING TEXT IN "Interface.csv": CUSTOM_SYSTEM_ACTION', Text: msg }],
                });
            } else if (mode === 'chat') {
                // 一般說話（會像自己開口，可用於呻吟等）
                ServerSend('ChatRoomChat', { Type: 'Chat', Content: msg });
            } else {
                ServerSend('ChatRoomChat', { Type: 'Emote', Content: "*" + msg });
            }
        } catch (e) { /* 靜默 */ }
    }

    // ════════════════════════════════════════
    //  訊息浮現：觸發後一段時間內，新進聊天訊息字體慢慢浮現（LSCG 幽靈風）
    //  setupDOMObserver 對新節點呼叫 maybeFadeChatNode；視窗開啟時加動畫 class
    // ════════════════════════════════════════
    let _chatFadeUntil = 0;
    function startChatFade(durationMs = 10000) {
        _chatFadeUntil = Date.now() + durationMs;
    }
    function maybeFadeChatNode(node) {
        if (Date.now() > _chatFadeUntil) return;
        try {
            const el = node.classList?.contains('ChatMessage')
                       ? node : node.querySelector?.('.ChatMessage');
            if (!el || el._ivhFaded) return;
            el._ivhFaded = true;
            el.classList.add('ivh-chat-emerge');
            // 動畫結束後移除 class，避免殘留影響後續樣式
            setTimeout(() => { try { el.classList.remove('ivh-chat-emerge'); } catch {} }, 2600);
        } catch (e) {}
    }

    // ════════════════════════════════════════
    //  催眠廣播：觸發時送一個 Hidden 訊息，讓開啟「看到他人喘氣」的人能在你身上看到喘氣
    // ════════════════════════════════════════
    let _lastHypnoBroadcast = 0;
    function broadcastHypnotized() {
        const now = Date.now();
        if (now - _lastHypnoBroadcast < 5000) return;   // 節流，避免洗版伺服器
        _lastHypnoBroadcast = now;
        try {
            if (typeof ServerSend === 'function')
                ServerSend('ChatRoomChat', {
                    Type: 'Hidden', Content: 'IVH_Hypnotized',
                    // Intensity = 催眠等級，決定對方看到的喘氣強度（頻率／大小）
                    Dictionary: [{ Tag: 'IVH_Hypnotized', Duration: 10000, Intensity: CONFIG.intensity }],
                });
        } catch (e) {}
    }

    // 收到他人催眠廣播 → 在其角色嘴部顯示喘氣（需開啟 seeOthersPant，且對方在目前畫面）
    //  位置由本端 _charDrawPos（每幀繪製座標）算出，已含分頁：對方不在當前頁面自然不會被繪製 → 無動畫
    //  廣播夾帶的 intensity 決定喘氣頻率與大小
    const _otherPantUntil  = {};
    const _otherPantActive = {};
    const _otherPantInten  = {};
    function startOtherPant(memberNum, durationMs = 10000, intensity = 1) {
        if (!CONFIG.seeOthersPant || memberNum == null) return;
        _otherPantUntil[memberNum] = Date.now() + durationMs;
        _otherPantInten[memberNum] = intensity;
        if (_otherPantActive[memberNum]) return;   // 已有迴圈在跑 → 只延長/更新強度
        _otherPantActive[memberNum] = true;
        const overlay = getOverlay();
        const loop = () => {
            if (Date.now() > (_otherPantUntil[memberNum] || 0)) { _otherPantActive[memberNum] = false; return; }
            try {
                refreshCanvasCache();
                const dp = _charDrawPos[memberNum];
                const C  = (typeof ChatRoomCharacter !== 'undefined' && Array.isArray(ChatRoomCharacter))
                    ? ChatRoomCharacter.find(c => c && c.MemberNumber === memberNum) : null;
                // 對方在目前畫面（最近 1 秒內有被繪製）才顯示
                if (C && dp && _cachedRect && (Date.now() - dp.t < 1000)) {
                    const m  = otherCharMouthScreenPos(C, dp);
                    const ss = Math.max(0.5, Math.min(2.2, (dp.zoom || 1) * (_cachedScaleX || 0.3) * 2.4));
                    // 與自身人物身上喘氣相同的偏移 → A 看到的位置與 B 自己看到的一致
                    _emitBreathPuff(overlay, { x: m.x, y: m.y + BODY_PANT_DY, ss });
                }
            } catch (e) {}
            setTimeout(loop, breathIntervalMs(_otherPantInten[memberNum] || 1));
        };
        loop();
    }

    // ════════════════════════════════════════
    //  中央頭像：裁玩家臉部成 300×300，置於畫面左半中心
    //  （螺旋／喘氣等效果會以此為基準，忽略分頁問題）
    // ════════════════════════════════════════
    let _centerHeadEl = null;
    function showCenterHeadshot(durationMs) {
        try {
            if (_centerHeadEl) { _centerHeadEl.remove(); _centerHeadEl = null; }

            const SZ  = 300;
            const cv  = document.createElement('canvas'); cv.width = cv.height = SZ;
            const ctx = cv.getContext('2d');
            const pos     = bcToScreen(500, 360);
            const dispSZ  = Math.max(340, SZ * (_cachedScaleX || 0.35) * 1.7);

            const el = document.createElement('img');
            Object.assign(el.style, {
                position:      'fixed',
                left:          `${pos.x - dispSZ / 2}px`,
                top:           `${pos.y - dispSZ / 2}px`,
                width:         `${dispSZ}px`,
                height:        `${dispSZ}px`,
                borderRadius:  '50%',
                objectFit:     'cover',
                pointerEvents: 'none',
                zIndex:        IVH_Z.base, // 頭像層：煙霧 > 螺旋 > 頭像 > 其它特效(auto)
                boxShadow:     '0 0 40px rgba(255,80,160,0.5)',
                opacity:       '0',
                transition:    'opacity 1.5s ease',
            });
            getOverlay().appendChild(el);  // 放 overlay
            _centerHeadEl = el;

            // 從玩家自己的角色 Canvas 裁臉（FCM 同款來源，不會截到別人）
            // 正方裁切並以臉部為中心；側臉 0.43h 含瀏海，避免人物偏低
            const capture = () => {
                const src = Player && Player.Canvas;
                if (!src || !src.width) return false;
                const side  = src.width * 0.42;             // 正方邊長（含頭髮）
                const cropX = src.width  * 0.50 - side / 2; // 水平置中於臉
                const cropY = src.height * 0.43 - side / 2; // 垂直置中於臉（略偏上含瀏海）
                ctx.clearRect(0, 0, SZ, SZ);
                ctx.drawImage(src, cropX, cropY, side, side, 0, 0, SZ, SZ);
                try { el.src = cv.toDataURL(); } catch (e) { return false; }
                return true;
            };
            capture();
            requestAnimationFrame(() => { el.style.opacity = '1'; });

            // 每幀重新擷取（前 ~0.6 秒）：表情替換 / Canvas 重建是非同步，
            //   逐幀更新讓正確的臉盡快出現，不會等待
            let frames = 0;
            const recap = () => {
                if (el !== _centerHeadEl) return;
                capture();
                if (++frames < 36) requestAnimationFrame(recap);
            };
            requestAnimationFrame(recap);

            // 淡入 1.5s / 淡出 1.5s；整體時間不變（消失仍提早約 1 秒）
            const dur = Math.max(3800, durationMs || 4000);
            setTimeout(() => { if (el) el.style.opacity = '0'; }, dur - 2300);
            setTimeout(() => {
                if (el === _centerHeadEl) _centerHeadEl = null;
                el.remove();
            }, dur - 800);
        } catch (e) { /* 跨域或無 Canvas 時靜默 */ }
    }


export {
    saveExpression,
    _expandExpr,
    applyExpression,
    pushExprEffect,
    popExprEffect,
    getExpressionOptions,
    cycleExpression,
    applyExpressionLocal,
    captureFaceImage,
    addArousal,
    sendStatusEmote,
    startChatFade,
    maybeFadeChatNode,
    broadcastHypnotized,
    startOtherPant,
    showCenterHeadshot,
    _otherPantUntil,
    _otherPantActive,
    _otherPantInten,
    _centerHeadEl,
};
