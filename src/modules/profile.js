// ── auto-wired cross-module imports ──
import { startOtherPant } from './character-fx.js';
import { printChat } from './commands.js';
import { CONFIG, ES_KEY, PREF_ID, modApi } from './config.js';
import { ui } from './i18n.js';
import { ivhIconFor } from './icons.js';
import { _mkBtn, resolveWhitelistNumbers } from './panel.js';
import { EXT, waitForPreference } from './preference.js';
import { publishSharedSettings, saveSettings } from './storage.js';
import { isZh } from './util.js';

// ════════════════════════════════════════
//  IVH module: profile.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  Profile 按鈕：對方未裝 IVH → 不顯示；裝了但不允許編輯 → 灰色；允許 → 可點開編輯其文本，編輯透過隱藏訊息送到對方，對方驗證 allowOthersEdit 後套用
    // ════════════════════════════════════════
    function _sheetChar() {
        try { return (typeof InformationSheetSelection !== 'undefined') ? InformationSheetSelection : null; }
        catch { return null; }
    }
    function _isOther(C) {
        return C && C.MemberNumber != null && Player && C.MemberNumber !== Player.MemberNumber;
    }
    // 由對方公告的資訊判斷「我」是否能編輯某類別（any→可；whitelist→需我在其公告的白名單）
    function _viewerCanEdit(info, mode) {
        if (mode === 'any') return true;
        if (mode === 'whitelist') {
            const wl = Array.isArray(info.wl) ? info.wl.map(Number) : [];
            return wl.includes(Number(Player?.MemberNumber));
        }
        return false;
    }
    function _viewerEditModes(info) {
        return info.editModes || (info.edit ? { catalyst: info.editMode || 'any' } : {});
    }
    function _viewerCanEditAny(info) {
        const modes = _viewerEditModes(info);
        return ['catalyst', 'status', 'trigger'].some(k => _viewerCanEdit(info, modes[k]));
    }

    // ── 即時權限詢問：開對方 profile 時直接問對方「我能編輯哪些」，對方即時回覆 ──
    //   避免靠公告快照（會有同步延遲／需重開設定才更新的問題）；回覆只告訴詢問者本人，不公開白名單
    const _permCache = {};      // { memberNum: { can:{catalyst,status,trigger}, texts, emotes, triggers, ts } }
    const _permQueryTs = {};
    let   _permViewing = null;     // 目前正在看的對象 → 換人時強制即時重查（避免拿到舊快取）
    let   _permSheetLastFrame = 0; // 上次 InformationSheet 繪製時間 → 偵測「離開後重開」也強制重查
    function _queryPerm(num, force) {
        const now = Date.now();
        if (!force && _permQueryTs[num] && now - _permQueryTs[num] < 1500) return;   // 停留時節流
        _permQueryTs[num] = now;
        try {
            if (typeof ServerSend === 'function')
                ServerSend('ChatRoomChat', { Type: 'Hidden', Content: 'IVH_PermQuery',
                    Dictionary: [{ Tag: 'IVH_PermQuery', Target: Number(num) }] });
        } catch (e) {}
    }
    // 我對 C 各類是否可編輯：優先用對方即時回覆，60 秒內有效；否則退回公告快照
    function _permFor(C, info) {
        const pc = _permCache[C.MemberNumber];
        if (pc && (Date.now() - pc.ts < 60000)) return pc.can;
        const modes = _viewerEditModes(info);
        return { catalyst: _viewerCanEdit(info, modes.catalyst), status: _viewerCanEdit(info, modes.status), trigger: _viewerCanEdit(info, modes.trigger) };
    }

    function hookProfileButton() {
        if (!modApi) return;
        try {
            // 優先權需高於 UBC(4)：UBC 在 altchsh 模式會 return 不呼叫 next()，吃掉低優先 hook
            modApi.hookFunction('InformationSheetRun', 10, (args, next) => {
                const r = next(args);
                const C = _sheetChar();
                const info = C && _isOther(C) && C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY];
                if (info) {
                    // 換看不同人、或離開後重開 profile → 立刻強制重查（解決剛被加白名單卻仍顯示無權限的延遲）
                    const now = Date.now();
                    const reopened = (now - _permSheetLastFrame) > 500;   // 上一幀沒在畫 → 重新開啟
                    _permSheetLastFrame = now;
                    const fresh = reopened || C.MemberNumber !== _permViewing;
                    if (fresh) _permViewing = C.MemberNumber;
                    _queryPerm(C.MemberNumber, fresh);
                    const can = _permFor(C, info), canEdit = can.catalyst || can.status || can.trigger;
                    const tip = canEdit ? ui('profileEditBtn')
                        : (info.edit ? ui('profileEditNoPerm') : ui('profileEditOff'));
                    DrawButton(1700, 75, 90, 90, '', canEdit ? 'White' : '#ccc', ivhIconFor(canEdit ? 'White' : '#ccc'), tip, !canEdit);
                }
                return r;
            });
            modApi.hookFunction('InformationSheetClick', 10, (args, next) => {
                const C = _sheetChar();
                const info = C && _isOther(C) && C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY];
                if (info && MouseIn(1700, 75, 90, 90)) {
                    const can = _permFor(C, info);
                    if (can.catalyst || can.status || can.trigger) openRemoteTextEditor(C);
                    return;   // 吃掉此點擊，避免落到 UBC 的同位置按鈕
                }
                return next(args);
            });
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] profile 按鈕 hook 失敗:', e.message);
        }
    }

    // 接收他人對「我」的文本編輯（隱藏訊息）
    function hookRemoteEdit() {
        if (!modApi) return;
        try {
            modApi.hookFunction('ChatRoomMessage', 1, (args, next) => {
                const data = args[0];
                // 有人問「我能否編輯你的內容」→ 即時依目前白名單回覆（只回給詢問者本人）
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_PermQuery') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'IVH_PermQuery');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            const sender = Number(data.Sender), em = CONFIG.editModes || {};
                            const wl = resolveWhitelistNumbers();
                            const can = m => m === 'any' || (m === 'whitelist' && wl.has(sender));
                            const cc = can(em.catalyst), cs = can(em.status), ct = can(em.trigger);
                            if (typeof ServerSend === 'function')
                                ServerSend('ChatRoomChat', { Type: 'Hidden', Content: 'IVH_PermReply', Dictionary: [{
                                    Tag: 'IVH_PermReply', Target: sender, cc, cs, ct,
                                    texts:    cc ? (CONFIG.customTexts || [])  : [],
                                    emotes:   cs ? (CONFIG.emoteList || [])    : [],
                                    triggers: ct ? (CONFIG.triggerWords || []) : [],
                                }] });
                        }
                    } catch (e) {}
                    return;  // 不顯示
                }
                // 有人打開了我的文本編輯器 → 顯示訪問通知
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_Access') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'IVH_Access');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            const who = d.Name
                                || (ChatRoomCharacter?.find(c => c.MemberNumber === Number(data.Sender))?.Nickname)
                                || data.Sender;
                            printChat(ui('accessedYourText', { who }), 8000);
                        }
                    } catch (e) {}
                    return;  // 不顯示
                }
                // 對方回覆我的權限查詢 → 快取，供按鈕與編輯面板即時使用
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_PermReply') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'IVH_PermReply');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            _permCache[Number(data.Sender)] = {
                                can: { catalyst: !!d.cc, status: !!d.cs, trigger: !!d.ct },
                                texts: Array.isArray(d.texts) ? d.texts : [],
                                emotes: Array.isArray(d.emotes) ? d.emotes : [],
                                triggers: Array.isArray(d.triggers) ? d.triggers : [],
                                ts: Date.now(),
                            };
                        }
                    } catch (e) {}
                    return;  // 不顯示
                }
                // 他人催眠廣播 → 若開啟「看到他人喘氣」，在其角色顯示喘氣
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_Hypnotized') {
                    try {
                        const sender = Number(data.Sender);
                        if (sender && sender !== Player?.MemberNumber && CONFIG.seeOthersPant) {
                            const d = (data.Dictionary || []).find(x => x && x.Tag === 'IVH_Hypnotized');
                            startOtherPant(sender, (d && d.Duration) || 10000, (d && d.Intensity) || 1);
                        }
                    } catch (e) {}
                    return;  // 不顯示此隱藏訊息
                }
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_SetTexts') {
                    try {
                        const dict = (data.Dictionary || []).find(d => d && d.Tag === 'IVH_SetTexts');
                        const em = CONFIG.editModes || {};
                        const wl = resolveWhitelistNumbers();   // 含 $owner/$lover/$friend/$white 展開
                        const okFor = m => m === 'any' ||
                            (m === 'whitelist' && wl.has(Number(data.Sender)));
                        const clean = arr => arr.map(s => String(s).trim()).filter(Boolean).slice(0, 200);
                        if (dict && dict.Target === Player.MemberNumber) {
                            // 是否「有提交但因權限被拒」（用來回報「不在白名單」）
                            const tried = Array.isArray(dict.Texts) || Array.isArray(dict.Emotes) || Array.isArray(dict.Triggers);
                            let changed = false;
                            if (Array.isArray(dict.Texts)    && okFor(em.catalyst)) { CONFIG.customTexts  = clean(dict.Texts);    changed = true; }
                            if (Array.isArray(dict.Emotes)   && okFor(em.status))   { CONFIG.emoteList    = clean(dict.Emotes);   changed = true; }
                            if (Array.isArray(dict.Triggers) && okFor(em.trigger))  { CONFIG.triggerWords = clean(dict.Triggers); changed = true; }
                            if (changed) {
                                saveSettings(true);
                                publishSharedSettings();
                                const who = (typeof CharacterNickname === 'function' && data.Sender)
                                    ? (ChatRoomCharacter?.find(c => c.MemberNumber === data.Sender)?.Nickname || data.Sender)
                                    : data.Sender;
                                printChat(ui('editedYourText', { who }), 8000);
                            }
                            // 回報結果給編輯者（成功 / 被拒），讓對方知道是否真的儲存
                            try {
                                if (typeof ServerSend === 'function')
                                    ServerSend('ChatRoomChat', {
                                        Type: 'Hidden', Content: 'IVH_SetTextsAck',
                                        Dictionary: [{ Tag: 'IVH_SetTextsAck', Target: Number(data.Sender), Ok: changed, Tried: tried }],
                                    });
                            } catch {}
                        }
                    } catch (e) {}
                    return;  // 不顯示此隱藏訊息
                }
                // 收到對方對「我的編輯提交」的回報 → 顯示是否套用
                if (data && data.Type === 'Hidden' && data.Content === 'IVH_SetTextsAck') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'IVH_SetTextsAck');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            const who = (typeof CharacterNickname === 'function' && data.Sender)
                                ? (ChatRoomCharacter?.find(c => c.MemberNumber === data.Sender)?.Nickname || data.Sender)
                                : data.Sender;
                            printChat(d.Ok ? ui('remoteEditOk', { name: who }) : ui('remoteEditDenied', { name: who }), 8000);
                        }
                    } catch (e) {}
                    return;  // 不顯示此隱藏訊息
                }
                return next(args);
            });
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] 遠端編輯 hook 失敗:', e.message);
        }
    }

    // 遠端文本編輯面板（DOM）
    let _remoteEditor = null;
    const _accessNotifyTs = {};
    function openRemoteTextEditor(C) {
        if (_remoteEditor) { _remoteEditor.remove(); _remoteEditor = null; }
        // 訪問通知：打開對方文本編輯器時，通知對方「有人正在查看你的文本」（節流 15 秒）
        try {
            const num = C.MemberNumber, now = Date.now();
            if (num != null && (!_accessNotifyTs[num] || now - _accessNotifyTs[num] > 15000)) {
                _accessNotifyTs[num] = now;
                const myName = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '') || Player?.Name || Player?.MemberNumber;
                if (typeof ServerSend === 'function')
                    ServerSend('ChatRoomChat', { Type: 'Hidden', Content: 'IVH_Access',
                        Dictionary: [{ Tag: 'IVH_Access', Target: Number(num), Name: String(myName) }] });
            }
        } catch (e) {}
        const info  = (C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY]) || {};
        // 相容舊版（只公告單一 editMode + texts）：視為催眠文本可編輯
        const modes = _viewerEditModes(info);
        const name  = (typeof CharacterNickname === 'function' ? CharacterNickname(C) : '') || C.Name || C.MemberNumber;
        // 即時回覆優先（_permCache），否則退回公告快照
        const pc = _permCache[C.MemberNumber];
        const canCat = k => pc ? !!pc.can[k] : _viewerCanEdit(info, modes[k]);
        const dataCat = (k, field) => ((pc ? pc[field] : info[field]) || []);

        // 對方各類允許編輯的分類（off 的不顯示）；editable=我是否真的可編輯（白名單外→唯讀加遮罩）
        const cats = [
            { key: 'catalyst', dictKey: 'Texts',    field: 'texts',    label: ui('sec_hypnoText')    },
            { key: 'status',   dictKey: 'Emotes',   field: 'emotes',   label: ui('sec_statusMsg')    },
            { key: 'trigger',  dictKey: 'Triggers', field: 'triggers', label: ui('sec_triggerWords') },
        ].filter(c => (modes[c.key] || 'off') !== 'off')
         .map(c => ({ ...c, editable: canCat(c.key), data: dataCat(c.key, c.field) }));

        const panel = document.createElement('div');
        _remoteEditor = panel;
        Object.assign(panel.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '470px', maxHeight: '88vh', overflowY: 'auto',
            background: 'linear-gradient(135deg,rgba(30,10,40,0.98),rgba(50,15,60,0.98))',
            border: '1px solid rgba(255,120,200,0.45)', borderRadius: '12px', padding: '16px',
            zIndex: '100000', fontFamily: '"Noto Sans TC","Microsoft JhengHei",sans-serif', color: '#ffddee',
            boxShadow: '0 8px 40px rgba(180,60,160,0.4)',
        });
        const title = document.createElement('div');
        title.innerHTML = `🌀 ${ui('remoteEditTitle', { name: `<b style="color:#ff99dd">${name}</b>` })}`;
        title.style.cssText = 'font-size:15px;margin-bottom:6px';
        const hint = document.createElement('div');
        hint.textContent = ui('remoteEditHint');
        hint.style.cssText = 'font-size:11px;color:#cc99bb;margin-bottom:10px';
        panel.append(title, hint);

        // 每類一個區塊 + textarea（無權限 → 唯讀並蓋上遮罩）
        const tas = {};
        cats.forEach(c => {
            const lbl = document.createElement('div');
            lbl.textContent = c.label + (c.editable ? '' : ' 🔒');
            lbl.style.cssText = 'font-size:13px;font-weight:600;color:#ffbbe0;margin:8px 0 4px';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative';
            const ta = document.createElement('textarea');
            ta.value = (c.data || []).join('\n');
            ta.addEventListener('keydown', e => e.stopPropagation());
            Object.assign(ta.style, {
                width: '100%', height: '120px', boxSizing: 'border-box', resize: 'vertical',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,120,200,0.3)',
                borderRadius: '6px', color: '#ffeeff', padding: '8px', fontFamily: 'monospace', fontSize: '13px', outline: 'none',
            });
            wrap.append(ta);
            if (!c.editable) {
                ta.readOnly = true;
                ta.style.opacity = '0.45';
                ta.style.cursor = 'not-allowed';
                const mask = document.createElement('div');
                mask.textContent = '🔒 ' + ui('remoteEditNoPerm');
                mask.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,5,30,0.55);color:#ffaabb;font-size:13px;border-radius:6px;pointer-events:none;text-align:center;padding:0 8px';
                wrap.append(mask);
            }
            tas[c.key] = { ta, dictKey: c.dictKey, editable: c.editable };
            panel.append(lbl, wrap);
        });

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;margin-top:14px;justify-content:flex-end';
        const bigBtn = 'font-size:16px;padding:10px 22px;border-radius:8px;font-weight:600';
        const cancel = _mkBtn(ui('cancel'), '#4a2030', '#ffaabb', () => { panel.remove(); _remoteEditor = null; });
        cancel.style.cssText += ';' + bigBtn;
        const save   = _mkBtn(ui('remoteEditSave'), '#872626', '#aaffaa', () => {
            const dict = { Tag: 'IVH_SetTexts', Target: C.MemberNumber };
            for (const k in tas) {
                if (!tas[k].editable) continue;   // 無權限的類別不送出
                dict[tas[k].dictKey] = tas[k].ta.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 200);
            }
            try {
                ServerSend('ChatRoomChat', { Type: 'Hidden', Content: 'IVH_SetTexts', Dictionary: [dict] });
                printChat(ui('remoteEditSent', { name }), 6000);
            } catch (e) {}
            panel.remove(); _remoteEditor = null;
        });
        save.style.cssText += ';' + bigBtn;
        row.append(cancel, save);
        panel.append(row);
        document.body.appendChild(panel);
        const firstEditable = cats.find(c => c.editable);
        if (firstEditable && tas[firstEditable.key]) tas[firstEditable.key].ta.focus();
    }

    // 自繪二次確認框（不用瀏覽器 confirm，避免部分平台彈不出來）
    let _confirmBox = null;
    function ivhConfirm(message, onYes) {
        if (_confirmBox) { _confirmBox.remove(); _confirmBox = null; }
        const panel = document.createElement('div');
        _confirmBox = panel;
        Object.assign(panel.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '400px', background: 'linear-gradient(135deg,rgba(30,10,40,0.98),rgba(50,15,60,0.98))',
            border: '1px solid rgba(255,120,200,0.45)', borderRadius: '12px', padding: '22px',
            zIndex: '100001', fontFamily: '"Noto Sans TC","Microsoft JhengHei",sans-serif', color: '#ffddee',
            boxShadow: '0 8px 40px rgba(180,60,160,0.4)', textAlign: 'center',
        });
        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.cssText = 'font-size:15px;margin-bottom:20px;line-height:1.6;white-space:pre-line';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:14px;justify-content:center';
        const big = 'font-size:16px;padding:10px 28px;border-radius:8px;font-weight:600';
        const no  = _mkBtn(ui('cancel'), '#4a2030', '#ffaabb', () => { panel.remove(); _confirmBox = null; });
        no.style.cssText += ';' + big;
        const yes = _mkBtn(ui('confirm'), '#872626', '#aaffaa', () => {
            panel.remove(); _confirmBox = null; try { onYes && onYes(); } catch (e) {}
        });
        yes.style.cssText += ';' + big;
        row.append(no, yes);
        panel.append(msg, row);
        document.body.appendChild(panel);
    }

    function registerPreferenceScreen() {
        waitForPreference().then(() => {
            try {
                PreferenceRegisterExtensionSetting({
                    Identifier: PREF_ID,
                    ButtonText: isZh() ? 'IVH 催眠設定' : 'IVH Settings',
                    // 偏好頁擴充按鈕為淺色底 → 用白底圖示（W）
                    Image: ivhIconFor('White'),
                    load:   () => EXT.load(),
                    run:    () => EXT.run(),
                    click:  () => EXT.click(),
                    unload: () => EXT.unload(),
                    exit:   () => EXT.exit(),
                });
            } catch (e) {
                console.warn('🐈‍⬛ [IVH] 設定頁註冊失敗:', e.message);
            }
        });
    }


export {
    _sheetChar,
    _isOther,
    _viewerCanEdit,
    _viewerEditModes,
    _viewerCanEditAny,
    _queryPerm,
    _permFor,
    hookProfileButton,
    hookRemoteEdit,
    openRemoteTextEditor,
    ivhConfirm,
    registerPreferenceScreen,
};
