// ── auto-wired cross-module imports ──
import { startOtherPant } from '../effects/character-fx.js';
import { printChat } from '../core/commands.js';
import { CONFIG, ES_KEY, HSC_SCREEN, PREF_ID, modApi } from '../core/config.js';
import { ui } from '../i18n/i18n.js';
import { HSC_ICON_B, HSC_ICON_W, hscIconForTheme, hscThemeIsDark } from '../util/icons.js';
import { _mkBtn, resolveWhitelistNumbers } from './panel.js';
import { EXT, waitForPreference } from './preference.js';
import { interfereEnterLeave } from '../effects/state-fx.js';
import { publishSharedSettings, saveSettings } from '../core/storage.js';
import { hscServerSend } from '../core/net.js';
import { isZh } from '../util/util.js';
import { HSC_Z } from '../util/zlayers.js';

// ════════════════════════════════════════
//  HSC module: profile.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  Profile 按鈕：對方未裝 HSC → 不顯示；裝了但不允許編輯 → 灰色；允許 → 可點開編輯其文本，編輯透過隱藏訊息送到對方，對方驗證 allowOthersEdit 後套用
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
        return ['catalyst', 'status', 'trigger', 'wake', 'response', 'allowed'].some(k => _viewerCanEdit(info, modes[k]));
    }

    // ── 權限詢問：開對方 profile 時問一次「我能編輯哪些」，對方即時回覆（只回給詢問者本人，不公開白名單）──
    //   不再每幀/每 1.5 秒輪詢（那會全房廣播、洗版伺服器 → 連線不穩）：
    //     • 有效快取（PERM_TTL 內）→ 完全不送
    //     • 沒有有效快取才送，且送出後 PERM_RETRY 內不重送（等回覆；對方沒裝 HSC/沒回也不會狂送）
    //   失效改由推播驅動：對方 editModes/白名單變更會發 HSC_Changed；owner/lover 等 BC 關係
    //   變更會讓對方角色 re-sync（ChatRoomSyncSingle/Character）——兩者都會清掉這裡的快取後重查一次。
    const _permCache = {};      // { memberNum: { can:{...}, texts, emotes, triggers, wake, response, allowed, ts } }
    const _permQueryTs = {};    // { memberNum: 上次送出查詢的時間 }
    let   _permViewing = null;   // 目前正在看的對象（僅用於偵測換人）
    const PERM_TTL   = 60000;    // 快取有效期
    const PERM_RETRY = 8000;     // 無有效快取時的重送間隔（對方沒回時的保底重試）
    function _invalidatePerm(num) {
        if (num == null) return;
        delete _permCache[Number(num)];
        delete _permQueryTs[Number(num)];
    }
    function _ensurePerm(num) {
        const n = Number(num);
        const now = Date.now();
        const pc = _permCache[n];
        if (pc && now - pc.ts < PERM_TTL) return;                          // 有效快取 → 不查
        if (_permQueryTs[n] && now - _permQueryTs[n] < PERM_RETRY) return; // 查詢在途 → 不重送
        _permQueryTs[n] = now;
        // 不加 dedupeKey：查詢的節流已由上面的快取/重送邏輯負責；再套佇列去重會在「失效後想立刻重查」時互相打架。
        hscServerSend('HSC_PermQuery', [{ Tag: 'HSC_PermQuery', Target: n }]);
    }
    // 我對 C 各類是否可編輯：優先用對方即時回覆，60 秒內有效；否則退回公告快照
    function _permFor(C, info) {
        const pc = _permCache[C.MemberNumber];
        if (pc && (Date.now() - pc.ts < 60000)) return pc.can;
        const modes = _viewerEditModes(info);
        return { catalyst: _viewerCanEdit(info, modes.catalyst), status: _viewerCanEdit(info, modes.status), trigger: _viewerCanEdit(info, modes.trigger), wake: _viewerCanEdit(info, modes.wake), response: _viewerCanEdit(info, modes.response), allowed: _viewerCanEdit(info, modes.allowed) };
    }

    // 其他插件是否正在全螢幕子頁（BCX / LSCG / MPA）→ 我們就不畫按鈕、也不接管，讓路給它們
    function _otherModSubscreenOpen() {
        try { if (window.bcx && typeof window.bcx.inBcxSubscreen === 'function' && window.bcx.inBcxSubscreen()) return true; } catch (e) {}
        try { if (window.LSCG_REMOTE_WINDOW_OPEN) return true; } catch (e) {}
        try { if (window.MPA && window.MPA.menuLoaded) return true; } catch (e) {}
        return false;
    }

    // 遠端訪問設定頁的獨立畫面：註冊 BC 畫面系統認得的幾個東西。
    //  這不是真正在伺服器上存在的畫面，所以要補兩件事：
    //   1) <Screen>Background：不補的話背景不會套用，會透出聊天室背景
    //   2) 略過 TextLoad 對這個假畫面名稱抓 Text_*.csv（伺服器上沒有這檔案，
    //      404 後 CommonFetch 會退避重試，卡 2-3 分鐘——LSCG 自己的小遊戲畫面
    //      也是用同一招（CurrentScreen.startsWith('LSCG_') 時直接跳過 TextLoad））
    function _registerHscScreen() {
        try {
            window[HSC_SCREEN + 'Background'] = 'Sheet';   // 沿用 InformationSheet 的羊皮紙背景
            window[HSC_SCREEN + 'Run']    = () => { try { EXT.run(); } catch (e) {} };
            window[HSC_SCREEN + 'Click']  = () => { try { EXT.click(); } catch (e) {} };
            window[HSC_SCREEN + 'Load']   = () => {};
            window[HSC_SCREEN + 'Unload'] = () => {};
            window[HSC_SCREEN + 'Exit']   = () => { try { EXT.closeRemote(); } catch (e) {} };
            window[HSC_SCREEN + 'Resize'] = () => {};
        } catch (e) {}
    }

    function hookProfileButton() {
        if (!modApi) return;
        try {
            _registerHscScreen();
            // 假畫面沒有對應的 Screens/<Module>/HSC_ProfileEdit/Text_HSC_ProfileEdit.csv，
            // 讓 TextLoad 遇到我們的畫面時直接不呼叫 next()，跳過那次一定會 404 的抓取。
            modApi.hookFunction('TextLoad', 1, (args, next) => {
                if (typeof CurrentScreen !== 'undefined' && CurrentScreen === HSC_SCREEN) return true;
                return next(args);
            });

            modApi.hookFunction('InformationSheetRun', 5, (args, next) => {
                // remote 設定頁開啟 → 就地接管整個畫面（不繪製 profile 本體、也不跑其它 hook）
                if (EXT.ctx === 'remote' && EXT.remote) {
                    const prevAlign = MainCanvas.textAlign;
                    try { EXT.run(); } catch (e) {}
                    MainCanvas.textAlign = prevAlign;
                    return;   // 不呼叫 next → profile 與其它插件都不繪製
                }
                const r = next(args);
                if (_otherModSubscreenOpen()) return r;   // 別的插件全螢幕子頁 → 不畫我們的按鈕
                const C = _sheetChar();
                const info = C && _isOther(C) && C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY];
                if (info && CONFIG.showProfileButton) {
                    // 只在「沒有效快取」時查一次（見 _ensurePerm）；換人只記錄，不強制重送。
                    // 「剛被加白名單卻仍顯示無權限」改由推播解決：對方發 HSC_Changed / 角色 re-sync → 清快取重查。
                    if (C.MemberNumber !== _permViewing) _permViewing = C.MemberNumber;
                    _ensurePerm(C.MemberNumber);
                    const can = _permFor(C, info), canEdit = can.catalyst || can.status || can.trigger || can.wake || can.response || can.allowed;
                    const tip = canEdit ? ui('profileEditBtn')
                        : (info.edit ? ui('profileEditNoPerm') : ui('profileEditOff'));
                    // 依當前 UI 主題深淺自動切換：暗底用深色鈕+白線稿(B)，亮底用白鈕+深線稿(W)
                    const darkBg = hscThemeIsDark();
                    DrawButton(1700, 75, 90, 90, '', "White", '', tip, !canEdit);
                    DrawImageResize(darkBg ? HSC_ICON_B : HSC_ICON_W, 1702, 77, 86, 86);
                }
                return r;
            });
            modApi.hookFunction('InformationSheetClick', 5, (args, next) => {
                // remote 設定頁開啟 → 點擊交給 EXT（分頁/離開/存檔）
                if (EXT.ctx === 'remote' && EXT.remote) { try { EXT.click(); } catch (e) {} return; }
                if (_otherModSubscreenOpen()) return next(args);   // 讓路給別的插件
                const C = _sheetChar();
                const info = C && _isOther(C) && C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY];
                if (info && CONFIG.showProfileButton && MouseIn(1700, 75, 90, 90)) {
                    const can = _permFor(C, info);
                    if (can.catalyst || can.status || can.trigger || can.wake || can.response || can.allowed) {
                        try { if (typeof InformationSheetUnload === 'function') InformationSheetUnload(); } catch (e) {}  // 清掉 profile 的 DOM 元素
                        openRemoteSettings(C);
                    }
                    return;   // 吃掉此點擊，避免落到 UBC 的同位置按鈕
                }
                return next(args);
            });
            // 離開 profile（Esc / BC 離開流程）→ 若 remote 設定頁開著，先關掉它、留在 profile
            modApi.hookFunction('InformationSheetExit', 5, (args, next) => {
                if (EXT.ctx === 'remote' && EXT.remote) { try { EXT.closeRemote(); } catch (e) {} return; }
                return next(args);
            });
        } catch (e) {
            console.warn('🐈‍⬛ [HSC] profile 按鈕 hook 失敗:', e.message);
        }
    }

    // 接收他人對「我」的文本編輯（隱藏訊息）
    function hookRemoteEdit() {
        if (!modApi) return;
        try {
            modApi.hookFunction('ChatRoomMessage', 1, (args, next) => {
                const data = args[0];
                // 信息干擾（強控中）：把人員進/出訊息改寫成模糊幻覺敘述，攔截原訊息
                try { if (interfereEnterLeave(data)) return; } catch (e) {}
                // 對方通知「其權限相關設定（editModes/白名單）變了」→ 清掉對他的快取，下次看其 profile 重查一次
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_Changed') {
                    _invalidatePerm(Number(data.Sender));
                    return;  // 不顯示
                }
                // 有人問「我能否編輯你的內容」→ 即時依目前白名單回覆（只回給詢問者本人）
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_PermQuery') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'HSC_PermQuery');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            const sender = Number(data.Sender), em = CONFIG.editModes || {};
                            const wl = resolveWhitelistNumbers();
                            const can = m => m === 'any' || (m === 'whitelist' && wl.has(sender));
                            const cc = can(em.catalyst), cs = can(em.status), ct = can(em.trigger), cw = can(em.wake), cr = can(em.response), ca = can(em.allowed);
                            hscServerSend('HSC_PermReply', [{
                                Tag: 'HSC_PermReply', Target: sender, cc, cs, ct, cw, cr, ca,
                                texts:    cc ? (CONFIG.customTexts || [])  : [],
                                emotes:   cs ? (CONFIG.emoteList || [])    : [],
                                triggers: ct ? (CONFIG.triggerWords || []) : [],
                                wake:     cw ? (CONFIG.wakeWords || [])    : [],
                                response: cr ? (CONFIG.responseList || []) : [],
                                allowed:  ca ? (CONFIG.allowedPhrases || []) : [],
                            }], { priority: true, dedupeKey: 'permr:' + sender, dedupeMs: 500 });
                        }
                    } catch (e) {}
                    return;  // 不顯示
                }
                // 有人打開了我的文本編輯器 → 顯示訪問通知
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_Access') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'HSC_Access');
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
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_PermReply') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'HSC_PermReply');
                        if (d && Number(d.Target) === Player?.MemberNumber) {
                            _permCache[Number(data.Sender)] = {
                                can: { catalyst: !!d.cc, status: !!d.cs, trigger: !!d.ct, wake: !!d.cw, response: !!d.cr, allowed: !!d.ca },
                                texts: Array.isArray(d.texts) ? d.texts : [],
                                emotes: Array.isArray(d.emotes) ? d.emotes : [],
                                triggers: Array.isArray(d.triggers) ? d.triggers : [],
                                wake: Array.isArray(d.wake) ? d.wake : [],
                                response: Array.isArray(d.response) ? d.response : [],
                                allowed: Array.isArray(d.allowed) ? d.allowed : [],
                                ts: Date.now(),
                            };
                        }
                    } catch (e) {}
                    return;  // 不顯示
                }
                // 他人催眠廣播 → 若開啟「看到他人喘氣」，在其角色顯示喘氣
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_Hypnotized') {
                    try {
                        const sender = Number(data.Sender);
                        if (sender && sender !== Player?.MemberNumber && CONFIG.seeOthersPant) {
                            const d = (data.Dictionary || []).find(x => x && x.Tag === 'HSC_Hypnotized');
                            startOtherPant(sender, (d && d.Duration) || 7000, (d && d.Intensity) || 1);
                        }
                    } catch (e) {}
                    return;  // 不顯示此隱藏訊息
                }
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_SetTexts') {
                    try {
                        const dict = (data.Dictionary || []).find(d => d && d.Tag === 'HSC_SetTexts');
                        const em = CONFIG.editModes || {};
                        const wl = resolveWhitelistNumbers();   // 含 $owner/$lover/$friend/$white 展開
                        const okFor = m => m === 'any' ||
                            (m === 'whitelist' && wl.has(Number(data.Sender)));
                        const clean = arr => arr.map(s => String(s).trim()).filter(Boolean).slice(0, 200);
                        if (dict && dict.Target === Player.MemberNumber) {
                            // 是否「有提交但因權限被拒」（用來回報「不在白名單」）
                            const tried = ['Texts', 'Emotes', 'Triggers', 'Wake', 'Response', 'Allowed'].some(k => Array.isArray(dict[k]));
                            let changed = false;
                            if (Array.isArray(dict.Texts)    && okFor(em.catalyst)) { CONFIG.customTexts    = clean(dict.Texts);    changed = true; }
                            if (Array.isArray(dict.Emotes)   && okFor(em.status))   { CONFIG.emoteList      = clean(dict.Emotes);   changed = true; }
                            if (Array.isArray(dict.Triggers) && okFor(em.trigger))  { CONFIG.triggerWords   = clean(dict.Triggers); changed = true; }
                            if (Array.isArray(dict.Wake)     && okFor(em.wake))     { CONFIG.wakeWords      = clean(dict.Wake);      changed = true; }
                            if (Array.isArray(dict.Response) && okFor(em.response)) { CONFIG.responseList   = clean(dict.Response); changed = true; }
                            if (Array.isArray(dict.Allowed)  && okFor(em.allowed))  { CONFIG.allowedPhrases = clean(dict.Allowed);  changed = true; }
                            if (changed) {
                                saveSettings(true);
                                publishSharedSettings();
                                const who = (typeof CharacterNickname === 'function' && data.Sender)
                                    ? (ChatRoomCharacter?.find(c => c.MemberNumber === data.Sender)?.Nickname || data.Sender)
                                    : data.Sender;
                                printChat(ui('editedYourText', { who }), 8000);
                            }
                            // 回報結果給編輯者（成功 / 被拒），讓對方知道是否真的儲存
                            hscServerSend('HSC_SetTextsAck',
                                [{ Tag: 'HSC_SetTextsAck', Target: Number(data.Sender), Ok: changed, Tried: tried }],
                                { priority: true });
                        }
                    } catch (e) {}
                    return;  // 不顯示此隱藏訊息
                }
                // 收到對方對「我的編輯提交」的回報 → 顯示是否套用
                if (data && data.Type === 'Hidden' && data.Content === 'HSC_SetTextsAck') {
                    try {
                        const d = (data.Dictionary || []).find(x => x && x.Tag === 'HSC_SetTextsAck');
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

            // BC 關係/資料變更（被別人上/解項圈、改愛人、對方重新公告 OnlineSharedSettings…）
            //  會讓該角色 re-sync → 清掉我方對他的權限快取，避免顯示過期的可編輯狀態；
            //  下次看其 profile 時 _ensurePerm 會重查一次。只對「已快取者」動作，成本極低。
            const _invalidateOnSync = (args, next) => {
                try { const m = args?.[0]?.Character?.MemberNumber; if (m != null && _permCache[Number(m)]) _invalidatePerm(Number(m)); } catch (e) {}
                return next(args);
            };
            modApi.hookFunction('ChatRoomSyncSingle', 1, _invalidateOnSync);
            modApi.hookFunction('ChatRoomSyncCharacter', 1, _invalidateOnSync);
        } catch (e) {
            console.warn('🐈‍⬛ [HSC] 遠端編輯 hook 失敗:', e.message);
        }
    }

    // 遠端訪問：就地開啟「文本設定」頁（沿用 EXT 設定頁繪製、就地接管 profile，非 DOM 彈窗）
    const _accessNotifyTs = {};
    function openRemoteSettings(C) {
        // 訪問通知：通知對方「有人正在查看你的文本」（節流 15 秒）
        try {
            const num = C.MemberNumber, now = Date.now();
            if (num != null && (!_accessNotifyTs[num] || now - _accessNotifyTs[num] > 15000)) {
                _accessNotifyTs[num] = now;
                const myName = (typeof CharacterNickname === 'function' ? CharacterNickname(Player) : '') || Player?.Name || Player?.MemberNumber;
                hscServerSend('HSC_Access', [{ Tag: 'HSC_Access', Target: Number(num), Name: String(myName) }],
                    { dedupeKey: 'access:' + num, dedupeMs: 15000 });
            }
        } catch (e) {}
        const info  = (C.OnlineSharedSettings && C.OnlineSharedSettings[ES_KEY]) || {};
        const modes = _viewerEditModes(info);
        const name  = (typeof CharacterNickname === 'function' ? CharacterNickname(C) : '') || C.Name || C.MemberNumber;
        // 即時回覆優先（_permCache），否則退回公告快照
        const pc = _permCache[C.MemberNumber];
        const canCat = k => pc ? !!pc.can[k] : _viewerCanEdit(info, modes[k]);
        const dataCat = (k, field) => ((pc ? pc[field] : info[field]) || []).slice();

        // 對方各類允許編輯的分類（off 的不顯示）；editable=我是否真能編輯（否則唯讀）
        const cats = [
            { key: 'catalyst', dictKey: 'Texts',    field: 'texts',    label: ui('sec_hypnoText')     },
            { key: 'status',   dictKey: 'Emotes',   field: 'emotes',   label: ui('sec_statusMsg')     },
            { key: 'trigger',  dictKey: 'Triggers', field: 'triggers', label: ui('sec_triggerWords')  },
            { key: 'wake',     dictKey: 'Wake',     field: 'wake',     label: ui('sec_wakeWord')      },
            { key: 'response', dictKey: 'Response', field: 'response', label: ui('sec_hypnoResponse') },
            { key: 'allowed',  dictKey: 'Allowed',  field: 'allowed',  label: ui('allowedPhrasesLabel') },
        ].filter(c => (modes[c.key] || 'off') !== 'off')
         .map(c => ({ ...c, editable: canCat(c.key), data: dataCat(c.key, c.field) }));

        // 就地開啟 EXT「文本」分頁（remote 模式）；存檔即送出隱藏訊息給對方
        //  先用 CommonSetScreen 真正切到 HSC_SCREEN（此時 EXT.ctx 還是 'self'，
        //  所以會正常觸發原本的 InformationSheetExit，不會被我們自己的 remote 分支攔截），
        //  等畫面確定切過去了，才呼叫 EXT.openRemote() 進入 remote 狀態開始繪製。
        try {
            if (typeof CommonSetScreen === 'function') {
                CommonSetScreen((typeof CurrentModule !== 'undefined' ? CurrentModule : 'Character'), HSC_SCREEN);
            }
        } catch (e) {}
        EXT.openRemote({
            C, name, cats,
            onSave: (savedCats) => {
                const dict = { Tag: 'HSC_SetTexts', Target: C.MemberNumber };
                savedCats.forEach(c => {
                    if (!c.editable) return;   // 無權限類別不送
                    dict[c.dictKey] = (c.data || []).map(s => String(s).trim()).filter(Boolean).slice(0, 200);
                });
                hscServerSend('HSC_SetTexts', [dict]);
                printChat(ui('remoteEditSent', { name }), 6000);
            },
        });
    }

    // 自繪二次確認框（不用瀏覽器 confirm，避免部分平台彈不出來）
    let _confirmBox = null;
    function hscConfirm(message, onYes) {
        if (_confirmBox) { _confirmBox.remove(); _confirmBox = null; }
        const panel = document.createElement('div');
        _confirmBox = panel;
        Object.assign(panel.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '400px', background: 'linear-gradient(135deg,rgba(30,10,40,0.98),rgba(50,15,60,0.98))',
            border: '1px solid rgba(255,120,200,0.45)', borderRadius: '12px', padding: '22px',
            zIndex: HSC_Z.dialog, fontFamily: '"Noto Sans TC","Microsoft JhengHei",sans-serif', color: '#ffddee',
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
                    ButtonText: ui('prefButton'),
                    // 依當前主題深淺自動選圖（BC 開啟擴充設定選單時呼叫一次）
                    Image: () => hscIconForTheme(),
                    load:   () => EXT.load(),
                    run:    () => EXT.run(),
                    click:  () => EXT.click(),
                    unload: () => EXT.unload(),
                    exit:   () => EXT.exit(),
                });
            } catch (e) {
                console.warn('🐈‍⬛ [HSC] 設定頁註冊失敗:', e.message);
            }
        });
    }


export {
    _sheetChar,
    _isOther,
    _viewerCanEdit,
    _viewerEditModes,
    _viewerCanEditAny,
    _ensurePerm,
    _permFor,
    hookProfileButton,
    hookRemoteEdit,
    openRemoteSettings,
    hscConfirm,
    registerPreferenceScreen,
};
