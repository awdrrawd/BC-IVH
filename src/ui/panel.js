// ── auto-wired cross-module imports ──
import { maybeFadeChatNode } from '../effects/character-fx.js';
import { registerCommandOnce } from '../core/commands.js';
import { CONFIG, MOD_VER, PREF_ID } from '../core/config.js';
import { runDepthEffect } from '../effects/depth.js';
import { refreshCanvasCache } from '../util/geometry.js';
import { enterHypnoNow, wake } from '../hypno/hypno.js';
import { parseVoiceText } from '../effects/run.js';
import { preloadSounds } from '../effects/sound.js';
import { handleStateChatFx } from '../effects/state-fx.js';
import { saveSettings } from '../core/storage.js';
import { T, TOGGLE_LABELS, extractChatText, triggerVoiceEffect } from '../util/util.js';

// ════════════════════════════════════════
//  HSC module: panel.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  HSC 控制面板
    // ════════════════════════════════════════
    let _panel = null;

    // PANEL_TOGGLES 在 buildPanel 時動態產生，確保語言正確
    function getPanelToggles() {
        return Object.entries(TOGGLE_LABELS).map(([key, fn]) => {
            const [icon, label] = fn();
            return { key, icon, label };
        });
    }

    function buildPanel(chatContainer) {
        if (_panel) return; // 已存在

        _panel = document.createElement('div');
        _panel.id = 'hsc-panel';
        // 面板作為普通 DOM 節點塞進 TextAreaChatLog
        // 行為跟一般聊天訊息完全相同：
        // - 新訊息進來會往上推（正常）
        // - 往上捲看舊訊息時，面板也跟著捲走（不卡底部）
        Object.assign(_panel.style, {
            background: 'linear-gradient(135deg, rgba(30,10,40,0.97) 0%, rgba(50,15,60,0.97) 100%)',
            borderTop:  '1px solid rgba(255,120,200,0.35)',
            padding:    '8px 10px 6px',
            boxShadow:  '0 -4px 20px rgba(180,60,160,0.25)',
            fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
            fontSize:   '12px',
            userSelect: 'none',
            marginTop:  '4px',
            display:    'block',
        });

        // ── 標題列 ──
        const header = document.createElement('div');
        Object.assign(header.style, {
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   '6px',
        });

        const title = document.createElement('span');
        title.innerHTML = '🌀 <b style="color:#ff99dd">HSC</b> <span style="color:#cc88bb;font-size:10px">v' + MOD_VER + '</span>';
        title.style.color = '#ffddee';

        // ⚙ 齒輪 → 開啟偏好設定頁
        const gearBtn = _mkBtn('⚙', '#8E44A1', '#cbb3ff', () => {
            try {
                if (typeof PreferenceSubscreenExtensionsOpen === 'function')
                    PreferenceSubscreenExtensionsOpen(PREF_ID);
            } catch (e) {}
        });
        gearBtn.title = T('開啟設定頁','Open settings');

        // 全開/全關 + X 關閉按鈕
        const allOnBtn  = _mkBtn(T('全開','All On'),  '#872626', '#88ff88', () => {
            getPanelToggles().forEach(t => { CONFIG[t.key] = true; });
            _refreshToggles(); saveSettings();
        });
        const allOffBtn = _mkBtn(T('全關','All Off'), '#872626', '#ff9999', () => {
            getPanelToggles().forEach(t => { CONFIG[t.key] = false; });
            _refreshToggles(); saveSettings();
        });
        const closeXBtn = document.createElement('button');
        closeXBtn.textContent = '✕';
        Object.assign(closeXBtn.style, {
            background:   'rgba(100,20,40,0.8)',
            border:       '1px solid rgba(255,80,100,0.5)',
            borderRadius: '4px',
            color:        '#ff8899',
            cursor:       'pointer',
            fontSize:     '12px',
            padding:      '1px 6px',
            lineHeight:   '16px',
            fontWeight:   'bold',
        });
        closeXBtn.addEventListener('click', () => removePanel());

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex;gap:4px;align-items:center';
        btnGroup.append(gearBtn, allOnBtn, allOffBtn, closeXBtn);
        header.append(title, btnGroup);

        // ── 強度控制列 ──
        const intensityRow = document.createElement('div');
        Object.assign(intensityRow.style, {
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            marginBottom: '6px',
        });
        const intensityLabel = document.createElement('span');
        intensityLabel.textContent = T('強度','Intensity');
        intensityLabel.style.cssText = 'color:#cc88bb;min-width:28px';

        const intensitySlider = document.createElement('input');
        intensitySlider.type  = 'range';
        intensitySlider.min   = '0.3';
        intensitySlider.max   = '3.0';
        intensitySlider.step  = '0.1';
        intensitySlider.value = String(CONFIG.intensity);
        Object.assign(intensitySlider.style, {
            flex:         '1',
            accentColor:  '#ff80cc',
            cursor:       'pointer',
            height:       '4px',
        });

        const intensityVal = document.createElement('span');
        intensityVal.textContent = CONFIG.intensity.toFixed(1);
        intensityVal.style.cssText = 'color:#ffccee;min-width:24px;text-align:right';

        intensitySlider.addEventListener('input', () => {
            CONFIG.intensity = parseFloat(intensitySlider.value);
            intensityVal.textContent = CONFIG.intensity.toFixed(1);
            saveSettings();
        });
        intensityRow.append(intensityLabel, intensitySlider, intensityVal);

        // ── 開關格子 ──
        const grid = document.createElement('div');
        grid.id = 'hsc-panel-grid';
        Object.assign(grid.style, {
            display:             'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap:                 '4px',
            marginBottom:        '6px',
        });

        getPanelToggles().forEach(({ key, label, icon }) => {
            const btn = document.createElement('button');
            btn.dataset.hscKey = key;
            _styleToggleBtn(btn, key, icon, label);
            btn.addEventListener('click', () => {
                CONFIG[key] = !CONFIG[key];
                _styleToggleBtn(btn, key, icon, label);
                saveSettings();
            });
            grid.appendChild(btn);
        });

        // ── 底部操作列 ──
        const actionRow = document.createElement('div');
        Object.assign(actionRow.style, {
            display:    'flex',
            gap:        '5px',
            flexWrap:   'wrap',
            alignItems: 'center',
        });

        // 測試輸入框 + 按鈕
        const testInput = document.createElement('input');
        testInput.type        = 'text';
        testInput.placeholder = T('測試文字…','Test text…');
        Object.assign(testInput.style, {
            flex:        '1',
            minWidth:    '80px',
            background:  'rgba(255,255,255,0.07)',
            border:      '1px solid rgba(255,120,200,0.3)',
            borderRadius:'3px',
            color:       '#ffeeff',
            padding:     '3px 6px',
            fontSize:    '12px',
            outline:     'none',
        });
        // 阻止 Enter 送出聊天
        testInput.addEventListener('keydown', e => e.stopPropagation());

        const testBtn = _mkBtn(T('▶ 測試','▶ Test'), '#5a1f6e', '#ff99dd', () => {
            const txt = testInput.value.trim() || '你的意識正在沉睡…放鬆，放鬆…';
            triggerVoiceEffect(txt, true);
        });

        // 日常干擾測試（依目前深度上限，至少 1 級）
        const depthBtn = _mkBtn(T('🌀 日常','🌀 Daily'), '#3a2a6e', '#bb99ff', () => {
            refreshCanvasCache();
            runDepthEffect(Math.max(1, CONFIG.depthMax || 1));
        });

        // 立即陷入催眠（拉滿催眠值 → 進強控；免每次催到 100%）
        const hypnoBtn = _mkBtn(T('💫 催眠','💫 Hypnotize'), '#7a1f8e', '#ff99ee', () => {
            refreshCanvasCache();
            enterHypnoNow();
        });

        actionRow.append(testInput, testBtn, depthBtn, hypnoBtn);

        // ── 內容區 ──
        const collapsible = document.createElement('div');
        collapsible.append(intensityRow, grid, actionRow);
        _panel.append(header, collapsible);
        chatContainer.appendChild(_panel);
        // 捲到底部讓面板可見
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // 重新刷新所有 toggle 按鈕外觀（/hsc on/off 後呼叫）
    function _refreshToggles() {
        if (!_panel) return;
        getPanelToggles().forEach(({ key, icon, label }) => {
            const btn = _panel.querySelector(`[data-hsc-key="${key}"]`);
            if (btn) _styleToggleBtn(btn, key, icon, label);
        });
    }

    function _styleToggleBtn(btn, key, icon, label) {
        const on = CONFIG[key];
        btn.textContent = `${icon} ${label}`;
        Object.assign(btn.style, {
            background:   on ? 'rgba(180,60,160,0.45)' : 'rgba(60,20,60,0.5)',
            border:       `1px solid ${on ? 'rgba(255,120,200,0.6)' : 'rgba(120,60,120,0.3)'}`,
            borderRadius: '4px',
            color:        on ? '#ffccee' : '#886688',
            cursor:       'pointer',
            fontSize:     '11px',
            padding:      '4px 2px',
            textAlign:    'center',
            transition:   'all 0.15s ease',
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
        });
    }

    function _mkBtn(label, bgColor, textColor, onClick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            background:   bgColor,
            border:       '1px solid rgba(255,255,255,0.15)',
            borderRadius: '3px',
            color:        textColor,
            cursor:       'pointer',
            fontSize:     '11px',
            padding:      '3px 7px',
            whiteSpace:   'nowrap',
        });
        btn.addEventListener('click', onClick);
        return btn;
    }

    function removePanel() {
        if (_panel) { _panel.remove(); _panel = null; }
    }
    let _domObserver = null;
    function setDomObserver(v) { _domObserver = v; }   // 供 core-init 卸載時清除

    // 觸發對象已取消：任何人說出觸發詞/[Voice] 都會觸發
    function isTriggerAllowed(_senderNum) {
        return true;
    }

    // ── 白名單代號展開（$owner=主人 Player.Ownership；$lover=愛人 Player.Lovership + AFC）──
    function getOwnerNumbers() {
        const out = [];
        try { const o = Player?.Ownership; if (o && o.MemberNumber != null) out.push(Number(o.MemberNumber)); } catch {}
        return out;
    }
    function getLoverNumbers() {
        const out = [];
        // 原生 Lovership：物件陣列（舊版可能單一物件）
        try {
            const ls = Player?.Lovership;
            if (Array.isArray(ls)) ls.forEach(o => { if (o && o.MemberNumber != null) out.push(Number(o.MemberNumber)); });
            else if (ls && ls.MemberNumber != null) out.push(Number(ls.MemberNumber));
        } catch {}
        // AFC 擴充：Player.ExtensionSettings.AFC.l[] 每筆第一個元素是 ID
        try {
            const raw = Player?.ExtensionSettings?.AFC;
            if (raw) {
                let obj = null;
                try { obj = JSON.parse(raw); }
                catch { const d = (typeof LZString !== 'undefined') && LZString.decompressFromBase64(raw); if (d) obj = JSON.parse(d); }
                if (obj && Array.isArray(obj.l)) obj.l.forEach(e => { if (Array.isArray(e) && e[0] != null) out.push(Number(e[0])); });
            }
        } catch {}
        return out;
    }
    function getFriendNumbers() {
        try { return Array.isArray(Player?.FriendList) ? Player.FriendList.map(Number) : []; } catch { return []; }
    }
    function getWhiteNumbers() {
        try { return Array.isArray(Player?.WhiteList) ? Player.WhiteList.map(Number) : []; } catch { return []; }
    }
    // 把白名單（數字 + $owner/$lover/$friend/$white 代號）展開成 MemberNumber 集合
    function resolveWhitelistNumbers() {
        const set = new Set();
        for (const e of (CONFIG.whitelist || [])) {
            if (typeof e === 'number') set.add(e);
            else if (e === '$owner')  getOwnerNumbers().forEach(n => set.add(n));
            else if (e === '$lover')  getLoverNumbers().forEach(n => set.add(n));
            else if (e === '$friend') getFriendNumbers().forEach(n => set.add(n));
            else if (e === '$white')  getWhiteNumbers().forEach(n => set.add(n));
        }
        return set;
    }
    // 白名單可接受的代號
    const WL_TOKENS = ['$owner', '$lover', '$friend', '$white'];

    // 取訊息節點的發送者 MemberNumber
    function getNodeSender(node) {
        try {
            const el = node.matches?.('.ChatMessage') ? node : node.querySelector?.('.ChatMessage');
            const s  = el?.getAttribute('data-sender');
            return s != null ? Number(s) : null;
        } catch { return null; }
    }

    // 處理新進聊天節點：① [Voice] 本地催眠訊息 ② 白名單成員說出觸發詞
    function handleChatNode(node) {
        // 解析出真正的訊息元素（subtree 觀察會同時回報容器與內層 → 去重）
        const msgEl = node.classList?.contains('ChatMessage')
                      ? node
                      : node.querySelector?.('.ChatMessage') || node;
        if (msgEl._hscHandled) return;        // 同一訊息只處理一次
        msgEl._hscHandled = true;

        const text = msgEl.textContent || '';

        // ① [Voice] 本地訊息（既有催眠系統整合，無發送者，視為自身效果）
        if (msgEl.classList?.contains('ChatMessageLocalMessage') ||
            msgEl.querySelector?.('.ChatMessageLocalMessage')) {
            const m = text.match(/\[Voice\]\s*(.*)/s);
            if (m) { triggerVoiceEffect(parseVoiceText(m[1])); return; }
        }

        // 認「一般聊天」與「悄悄話」兩種（悄悄話也能觸發/喚醒）
        const isChatLike = !!(msgEl.classList?.contains('ChatMessageChat') || msgEl.classList?.contains('ChatMessageWhisper'));

        // 清醒詞：房內「他人」在一般聊天/悄悄話說出清醒詞 → 你立即清醒（自己說無效）
        const wws = (CONFIG.wakeWords || []).map(w => String(w).trim().toLowerCase()).filter(Boolean);
        if (wws.length && isChatLike) {
            const sender = getNodeSender(msgEl);
            const isSelf = sender != null && Player && sender === Player.MemberNumber;
            if (!isSelf) {
                const spokenW = (extractChatText(msgEl) || '').toLowerCase();
                if (spokenW && wws.some(w => spokenW.includes(w))) wake();
            }
        }

        // ② 自訂觸發詞：一般聊天/悄悄話訊息含觸發詞，且發送者通過白名單
        const words = (CONFIG.triggerWords || []).filter(w => w && w.trim());
        if (words.length === 0) return;
        if (!isChatLike) return;  // 認一般聊天與悄悄話
        if (!words.some(w => text.includes(w))) return;
        if (!isTriggerAllowed(getNodeSender(msgEl))) return;

        const spoken = extractChatText(msgEl);
        triggerVoiceEffect(spoken || words[0]);
    }

    function setupDOMObserver() {
        const chatContainer =
              document.getElementById('TextAreaChatLog') ||
              document.querySelector('.ChatLog')         ||
              document.querySelector('[id*="ChatLog"]')  ||
              document.querySelector('[class*="ChatLog"]');

        if (!chatContainer) {
            setTimeout(setupDOMObserver, 2000);
            return;
        }

        if (_domObserver) { _domObserver.disconnect(); _domObserver = null; }

        _domObserver = new MutationObserver((mutations) => {
            if (!CONFIG.enabled) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    maybeFadeChatNode(node);   // 訊息浮現視窗內 → 新訊息字體慢慢浮現
                    handleChatNode(node);
                    try { handleStateChatFx(node); } catch (e) {}   // 強控中：彈幕 / 訊息妨礙
                }
            }
        });

        _domObserver.observe(chatContainer, { childList: true, subtree: true });

        // 預載音源
        preloadSounds();

        // 進房間後才註冊指令，確保 CommandCombine 已就緒
        registerCommandOnce();
    }


export {
    _panel,
    _domObserver, setDomObserver,
    getPanelToggles,
    buildPanel,
    _refreshToggles,
    _styleToggleBtn,
    _mkBtn,
    removePanel,
    isTriggerAllowed,
    getOwnerNumbers,
    getLoverNumbers,
    getFriendNumbers,
    getWhiteNumbers,
    resolveWhitelistNumbers,
    WL_TOKENS,
    getNodeSender,
    handleChatNode,
    setupDOMObserver,
};
