// ── auto-wired cross-module imports ──
import { printChat } from './commands.js';
import { CONFIG, ES_KEY, MOD_VER, makeDefaultConfig, setConfig, setExpressionSets } from './config.js';
import { applyDepthLoop } from '../effects/depth.js';
import { ui } from '../i18n/i18n.js';
import { resolveWhitelistNumbers } from '../ui/panel.js';
import { hscServerSend } from './net.js';

// ════════════════════════════════════════
//  HSC module: storage.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  儲存層
    //  - Player.ExtensionSettings.HSC  ← 設定本體（LZString 壓縮，跟帳號同步）
    //  - Player.OnlineSharedSettings.HSC ← 對外公告（版本 + 是否允許他人編輯）
    //  - IndexedDB "liko-hsc"          ← 本機上傳音效 bytes / 大量文本（無上限）
    // ════════════════════════════════════════

    // 深合併：以 defaults 為底，用 saved 覆蓋（陣列直接取代）
    function mergeDefaults(defaults, saved) {
        if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
        if (defaults && typeof defaults === 'object') {
            const out = {};
            for (const k of Object.keys(defaults)) {
                out[k] = (saved && k in saved) ? mergeDefaults(defaults[k], saved[k]) : defaults[k];
            }
            return out;
        }
        return saved === undefined ? defaults : saved;
    }

    // 估算設定序列化後的位元組數（壓縮後）
    function estimateESBytes() {
        try {
            const raw = JSON.stringify(serializeConfig());
            const comp = LZString.compressToBase64(raw);
            return comp.length;
        } catch { return 0; }
    }

    // 只把需要持久化的欄位序列化（音效本機 bytes 不進 ES）
    function serializeConfig() {
        const c = CONFIG;
        return {
            v: 2,
            enabled: c.enabled,
            pinkFlash: c.pinkFlash, hypnoSpiral: c.hypnoSpiral, hypnoWaves: c.hypnoWaves,
            screenDistort: c.screenDistort, vignette: c.vignette, danmaku: c.danmaku,
            steamParticles: c.steamParticles, expression: c.expression,
            chatFade: c.chatFade,
            climax: c.climax, climaxMode: c.climaxMode, sound: c.sound,
            intensity: c.intensity, voiceEnabled: c.voiceEnabled,
            arousalStepVoice: c.arousalStepVoice, arousalStepDepth: c.arousalStepDepth,
            hypnoEnabled: c.hypnoEnabled, hypnoVoiceStep: c.hypnoVoiceStep, hypnoDepthStep: c.hypnoDepthStep,
            autoWake: c.autoWake, hypnoClimax: c.hypnoClimax, forcedGrowthDiv: c.forcedGrowthDiv, hypnoAnimEnabled: c.hypnoAnimEnabled, hypnoAnimStyle: c.hypnoAnimStyle, hypnoAnimColor: c.hypnoAnimColor, headTalisman: c.headTalisman,
            faceCensor: c.faceCensor, nameCensor: c.nameCensor, faceCensorStyle: c.faceCensorStyle, crowd: c.crowd,
            stateDanmakuChat: c.stateDanmakuChat, stateDanmakuWhisper: c.stateDanmakuWhisper,
            stateMsgSmoke: c.stateMsgSmoke, stateMsgInterfere: c.stateMsgInterfere,
            centerHeadshot: c.centerHeadshot, emoteEnabled: c.emoteEnabled, dualSound: c.dualSound,
            whitelist: c.whitelist, triggerWords: c.triggerWords, seeOthersPant: c.seeOthersPant,
            seeOthersHypno: c.seeOthersHypno, seeOthersTalisman: c.seeOthersTalisman, showProfileButton: c.showProfileButton,
            depthEnabled: c.depthEnabled, depthIntervalMin: c.depthIntervalMin, depthEffects: c.depthEffects,
            editModes: c.editModes, textSource: c.textSource,
            lang: c.lang,
            customTexts: c.textSource === 'ES' ? c.customTexts : [],
            emoteList: c.emoteList, wakeWords: c.wakeWords, responseList: c.responseList, allowedPhrases: c.allowedPhrases,
            expressionSets: c.expressionSets,
            soundSource: c.soundSource,
            // 注意：sounds 不存進 ExtensionSettings（帳號隔離），改存 localStorage 跨帳號共用
        };
    }

    // 音效設定改存 localStorage（同瀏覽器跨帳號共用），不跟著帳號走
    const SND_LS_KEY = 'HSC_sounds';
    // ★ 本機備份鍵：每次成功存檔都同步寫一份到 localStorage（比照 BCX 的 backup）。
    //   伺服器端 ExtensionSettings 若被清空 / 登入時尚未載入，讀取端會從這裡還原並補回伺服器。
    // ★ 設定備份「依帳號分開」（設定跟帳號走；音樂庫才是跨帳號共用 → 用 SND_LS_KEY）。
    //   避免 A 帳號的備份在 B 帳號登入時被還原成 A 的設定。
    function _backupKey() {
        const id = (typeof Player !== 'undefined' && Player && (Player.MemberNumber || Player.AccountName)) || 'anon';
        return 'HSC_settings_backup_' + id;
    }
    // ★ 載入完成前禁止存檔：避免「設定還沒讀到就先存出預設值」把帳號上的資料蓋掉（BCX 用 firstTimeInit 擋）。
    let _settingsLoaded = false;
    // 解析一份壓縮字串為 saved 物件（失敗回 null）
    function _decodeSaved(raw) {
        try { if (!raw) return null; const json = LZString.decompressFromBase64(raw); return json ? JSON.parse(json) : null; } catch (e) { return null; }
    }
    // 套用一份 saved 設定（含各種舊版欄位遷移）
    function _applySaved(saved) {
        setConfig(mergeDefaults(makeDefaultConfig(), saved));
        // 舊版 nameCensor(布林) → 三態字串（true→僅玩家 / false→關）
        if (typeof CONFIG.nameCensor === 'boolean') CONFIG.nameCensor = CONFIG.nameCensor ? 'player' : 'off';
        // 舊版編輯權限遷移 → editModes.catalyst（催眠文本）
        if (saved.editModes === undefined) {
            let m = 'off';
            if (saved.allowEditMode === 'any' || saved.allowEditMode === 'whitelist') m = saved.allowEditMode;
            else if (saved.allowOthersEdit) m = 'any';
            CONFIG.editModes = { catalyst: m, status: 'off', trigger: 'off' };
        }
        // 舊版深度（分層強度）→ 新版（開/關 + 扁平效果）遷移
        if (saved.depthMax !== undefined && saved.depthEnabled === undefined) {
            CONFIG.depthEnabled = saved.depthMax > 0;
        }
        if ((saved.depthLight || saved.depthMed || saved.depthHeavy) && saved.depthEffects === undefined) {
            const L = saved.depthLight || {}, M = saved.depthMed || {}, H = saved.depthHeavy || {};
            CONFIG.depthEffects = {
                smoke: !!L.smoke, chatDanmaku: !!L.chatDanmaku, ghost: !!L.ghost,
                figureBlur: !!M.figureBlur, sfx: !!M.sfx, fade: !!M.fade,
                chatlogBlur: !!H.chatlogBlur, pant: !!(L.pant || M.pant || H.pant),
            };
        }
        // 舊版 wakeWord(單字串) → wakeWords(清單)
        if (typeof saved.wakeWord === 'string' && saved.wakeWords === undefined) {
            CONFIG.wakeWords = saved.wakeWord.trim() ? [saved.wakeWord.trim()] : [];
        }
        // 舊版 arousal(布林)/arousalStep(單值) → 語音/日常 兩個興奮值
        if (saved.arousalStep !== undefined && saved.arousalStepVoice === undefined) {
            CONFIG.arousalStepVoice = saved.arousalStep;
            CONFIG.arousalStepDepth = saved.arousalStep;
        } else if (saved.arousal !== undefined && saved.arousalStepVoice === undefined) {
            const v = saved.arousal ? 5 : 0;
            CONFIG.arousalStepVoice = v; CONFIG.arousalStepDepth = v;
        }
    }
    function loadSounds() {
        try {
            const raw = localStorage.getItem(SND_LS_KEY);   // 舊 IVH_sounds 已由 migrateFromIVH() 搬移
            if (raw) {
                const s = JSON.parse(raw);
                CONFIG.sounds = mergeDefaults(makeDefaultConfig().sounds, s);
            }
        } catch (e) {}
    }
    function saveSounds() {
        try { localStorage.setItem(SND_LS_KEY, JSON.stringify(CONFIG.sounds)); } catch (e) {}
    }

    // 等待 ExtensionSettings 由伺服器載入（最多 ~15 秒）
    function waitForExtensionSettings(timeout = 15000) {
        const start = Date.now();
        return new Promise(resolve => {
            const check = () => {
                if (Player && Player.ExtensionSettings !== undefined) resolve(true);
                else if (Date.now() - start > timeout) resolve(false);
                else setTimeout(check, 200);
            };
            check();
        });
    }

    // ★ 一次性改名遷移（BC-IVH → BC-HSC）：把舊 IVH 設定搬到 HSC，然後清掉舊鍵，
    //   玩家不需手動備份。搬完後舊帳號同步鍵設空字串再同步（BC 的 sync 不接受 undefined），
    //   本地物件則直接刪除。localStorage 音效設定同樣搬移。
    function migrateFromIVH() {
        // ExtensionSettings：只要舊鍵還在就處理 —— HSC 尚未存在才搬資料，但無論如何都清掉 IVH。
        //  （BC 無法真正刪除 ExtensionSettings 鍵，設空字串 + sync 即為官方認可的「清除」。）
        try {
            const es = Player && Player.ExtensionSettings;
            if (es && ('IVH' in es)) {                     // 只要舊鍵還在（含殘留的空字串）就處理
                const hasData = es.IVH != null && es.IVH !== '';
                const migrated = hasData && !es[ES_KEY];
                if (migrated) {                            // HSC 尚無資料且舊鍵有資料 → 搬過去
                    es[ES_KEY] = es.IVH;
                    try { if (typeof ServerPlayerExtensionSettingsSync === 'function') ServerPlayerExtensionSettingsSync(ES_KEY); } catch (e) {}
                }
                es.IVH = '';                               // 先清空舊鍵資料（不能用 undefined，否則 sync 會丟例外）
                try { if (typeof ServerPlayerExtensionSettingsSync === 'function') ServerPlayerExtensionSettingsSync('IVH'); } catch (e) {}
                delete es.IVH;                             // 本地物件移除該鍵
                // 送出整包 ExtensionSettings（已不含 IVH）→ 若伺服器端為整包覆寫則可真正刪除該鍵
                try { if (typeof ServerAccountUpdate?.QueueData === 'function') ServerAccountUpdate.QueueData({ ExtensionSettings: es }, true); } catch (e) {}
                console.log(`🐈‍⬛ [HSC] 已移除舊 IVH ExtensionSettings 鍵${migrated ? '（並將資料遷移到 HSC）' : ''}`);
            }
        } catch (e) {}
        // OnlineSharedSettings：清掉舊的對外公告鍵，避免他人仍看到你「裝著 IVH」。
        try {
            const oss = Player && Player.OnlineSharedSettings;
            if (oss && oss.IVH !== undefined) {
                delete oss.IVH;
                if (typeof ServerAccountUpdate?.QueueData === 'function') {
                    ServerAccountUpdate.QueueData({ OnlineSharedSettings: oss }, true);
                }
            }
        } catch (e) {}
        // localStorage：舊音效設定 —— HSC 還沒有才搬，之後一律移除舊鍵。
        try {
            const oldSnd = localStorage.getItem('IVH_sounds');
            if (oldSnd) {
                if (!localStorage.getItem(SND_LS_KEY)) localStorage.setItem(SND_LS_KEY, oldSnd);
                localStorage.removeItem('IVH_sounds');
            }
        } catch (e) {}
    }

    function loadSettings() {
        migrateFromIVH();   // 先把舊 IVH 資料搬到 HSC（並清除舊鍵）
        // 時間戳比對：帳號(ExtensionSettings) vs 本機備份，取「較新」的那份。
        //  正常兩者 ts 相同（同一次存檔同時寫入）。若帳號被清空/落後（ts 較小或為 0）而備份較新 →
        //  代表帳號資料遺失，改用備份並補回帳號。
        const esRaw = Player?.ExtensionSettings?.[ES_KEY];
        const bkRaw = localStorage.getItem(_backupKey());
        const esSaved = _decodeSaved(esRaw);
        const bkSaved = _decodeSaved(bkRaw);
        const esTs = (esSaved && +esSaved.ts) || 0;
        const bkTs = (bkSaved && +bkSaved.ts) || 0;
        let saved = null, rawUsed = null, restoreToAccount = false;
        if (esSaved && esTs >= bkTs)      { saved = esSaved; rawUsed = esRaw; }                       // 帳號較新或相同 → 用帳號
        else if (bkSaved)                 { saved = bkSaved; rawUsed = bkRaw; restoreToAccount = esTs < bkTs; }  // 備份較新 → 用備份（並補回帳號）
        else if (esSaved)                 { saved = esSaved; rawUsed = esRaw; }                       // 只有帳號
        let loaded = false;
        if (saved) { try { _applySaved(saved); loaded = true; } catch (e) { console.warn('🐈‍⬛ [HSC] 設定套用失敗:', e.message); } }
        if (!loaded) setConfig(makeDefaultConfig());   // 全新帳號：用預設
        _settingsLoaded = true;                        // ← 之後才允許存檔
        loadSounds();   // 音效改從 localStorage（跨帳號共用）
        setExpressionSets(CONFIG.expressionSets);
        // 讓帳號與備份都同步為「較新的那份」
        if (loaded && rawUsed) {
            try { localStorage.setItem(_backupKey(), rawUsed); } catch (e) {}   // 刷新備份
            if (restoreToAccount) {
                try {
                    if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
                    Player.ExtensionSettings[ES_KEY] = rawUsed;
                    if (typeof ServerPlayerExtensionSettingsSync === 'function') ServerPlayerExtensionSettingsSync(ES_KEY);
                    console.log(`🐈‍⬛ [HSC] ⚠️ 帳號資料落後/遺失（帳號 ts=${esTs} < 備份 ts=${bkTs}），已從本機備份還原並補回帳號`);
                } catch (e) {}
            }
        }
    }

    let _saveTimer = null;
    function saveSettings(immediate = false) {
        // 尚未完成載入前，一律不存 —— 防止用「還沒讀到的預設值」覆蓋帳號上的真實資料（資料遺失主因）
        if (!_settingsLoaded) return;
        const doSave = () => {
            try {
                if (!_settingsLoaded || !Player) return;
                if (!Player.ExtensionSettings) Player.ExtensionSettings = {}; // 從未有設定的帳號需自建
                const cfg = serializeConfig();
                cfg.ts = Date.now();   // 存檔時間戳（帳號與本機備份共用同一個 → 供載入時比對是否遺失）
                const raw = JSON.stringify(cfg);
                const compressed = LZString.compressToBase64(raw);
                // 存前驗證：壓縮→解壓→比對，壞了就不寫（不覆蓋帳號上的好資料）
                const check = _decodeSaved(compressed);
                if (!check || typeof check !== 'object') { console.warn('🐈‍⬛ [HSC] 存檔資料驗證失敗，略過本次寫入'); return; }
                Player.ExtensionSettings[ES_KEY] = compressed;
                if (typeof ServerPlayerExtensionSettingsSync === 'function') {
                    ServerPlayerExtensionSettingsSync(ES_KEY);
                }
                try { localStorage.setItem(_backupKey(), compressed); } catch (e) {}   // 同步本機備份
                saveSounds();   // 音效另存 localStorage（跨帳號共用）
                setExpressionSets(CONFIG.expressionSets);
            } catch (e) {
                console.warn('🐈‍⬛ [HSC] 設定儲存失敗:', e.message);
            }
        };
        if (immediate) { if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; } doSave(); return; }
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => { _saveTimer = null; doSave(); }, 600);
    }

    // 對外公告：他人查看 profile 時用來判斷是否裝了 HSC / 是否允許編輯
    function publishSharedSettings() {
        try {
            if (!Player || !Player.OnlineSharedSettings) return;
            const em = CONFIG.editModes || { catalyst: 'off', status: 'off', trigger: 'off', wake: 'off', response: 'off' };
            const on = m => m === 'any' || m === 'whitelist';
            const cats = ['catalyst', 'status', 'trigger', 'wake', 'response', 'allowed'];
            const anyEditable = cats.some(k => on(em[k]));
            // 有任何「白名單」類別時，公告展開後的白名單成員編號，讓對方能自行判斷是否可編輯（→ 不可編輯時禁用）
            const needWl = cats.some(k => em[k] === 'whitelist');
            // 保留目前的催眠進度公告（本函式會整包覆寫 HSC，別把 hypno 洗掉；由 publishHypnoState 維護）
            const prevHypno = Player.OnlineSharedSettings[ES_KEY]?.hypno;
            // ★ 只公告「分享需要的狀態」：版本、催眠進度、是否允許編輯、各類權限模式、白名單編號。
            //   文本『內容』一律不進 OnlineSharedSettings（公開可讀）——內容只留在 ExtensionSettings，
            //   有人要編輯時才由 HSC_PermQuery → HSC_PermReply 傳「密本」給他（本端驗證權限），
            //   不合權限者拿不到內容（比照 BCX 的做法）。
            Player.OnlineSharedSettings[ES_KEY] = {
                v: MOD_VER,
                hypno: prevHypno || { v: 0, f: false, c: '#f500b4', s: 1, r: 0, inf: false, rb: 1 },
                edit: anyEditable,                       // profile 按鈕是否亮起
                editModes: { catalyst: em.catalyst || 'off', status: em.status || 'off', trigger: em.trigger || 'off', wake: em.wake || 'off', response: em.response || 'off', allowed: em.allowed || 'off' },
                wl: needWl ? Array.from(resolveWhitelistNumbers()) : [],
            };
            if (typeof ServerAccountUpdate?.QueueData === 'function') {
                ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings }, true);
            }
            // 通知房內正在看我 profile 的人「權限相關設定變了」→ 他們清快取後重查一次（仿 BCX notifyOfChange）。
            //  極小訊息、去重＋節流佇列；不依賴 BC 是否把 OSS re-sync 到房間，涵蓋 $friend 等不觸發角色同步的變更。
            _broadcastPermChanged();
        } catch (e) {
            console.warn('🐈‍⬛ [HSC] OnlineSharedSettings 公告失敗:', e.message);
        }
    }

    // HSC_Changed 廣播：debounce 200ms 吸收「連續多次公告」（開設定頁/存檔會連呼叫），只在房內送。
    let _permChangedTimer = null;
    function _broadcastPermChanged() {
        if (_permChangedTimer) return;
        _permChangedTimer = setTimeout(() => {
            _permChangedTimer = null;
            try {
                const inRoom = (typeof ServerPlayerIsInChatRoom === 'function') ? ServerPlayerIsInChatRoom() : true;
                if (inRoom) hscServerSend('HSC_Changed', [{ Tag: 'HSC_Changed' }], { dedupeKey: 'changed', dedupeMs: 500 });
            } catch (e) {}
        }, 200);
    }

    // ════════════════════════════════════════
    //  催眠進度公告（OnlineSharedSettings.HSC.hypno）
    //  讓房內其他裝了 HSC 的人能在你頭上看到催眠進度球／符咒（參考 LSCG 的狀態同步）。
    //  節流：強控開/關 立即公告；一般數值變化每 6 秒最多一次（催眠值變化緩慢，不洗版伺服器）。
    //   payload：{ v: 量化後的催眠值(0~100), f: 是否強控, c: 符咒顏色, s: 符咒樣式 }
    // ════════════════════════════════════════
    let _hypnoPubKey = '';
    let _hypnoPubForced = false;
    let _hypnoPubAt = 0;
    let _hypnoPubTimer = null;
    function _pushHypno(payload, key) {
        try {
            if (!Player || !Player.OnlineSharedSettings) return;
            if (!Player.OnlineSharedSettings[ES_KEY]) Player.OnlineSharedSettings[ES_KEY] = {};
            Player.OnlineSharedSettings[ES_KEY].hypno = payload;
            if (typeof ServerAccountUpdate?.QueueData === 'function') {
                ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings }, true);
            }
            _hypnoPubKey = key;
            _hypnoPubForced = payload.f;
            _hypnoPubAt = Date.now();
        } catch (e) {}
    }
    function publishHypnoState(v, forced, color, style, immediate = false, remSec = 0, inf = false, baseSec = 0) {
        try {
            const val = Math.max(0, Math.min(100, Math.round(v || 0)));
            const bucket = Math.round(val / 5) * 5;          // 量化到 5%，減少公告次數
            //  r=剩餘清醒秒數、inf=無自動清醒(∞)、rb=水位基底秒（他人算填滿比例＋本地平滑倒數用）
            const payload = { v: bucket, f: !!forced, c: color || '#f500b4', s: style || 1,
                              r: Math.max(0, Math.round(remSec || 0)), inf: !!inf, rb: Math.max(1, Math.round(baseSec || 1)) };
            const key = `${payload.v}|${payload.f}|${payload.c}|${payload.s}|${payload.r}|${payload.inf}`;
            const forcedChanged = _hypnoPubForced !== payload.f;
            if (key === _hypnoPubKey && !immediate) return;   // 沒有實質變化
            if (_hypnoPubTimer) { clearTimeout(_hypnoPubTimer); _hypnoPubTimer = null; }
            const gap = Date.now() - _hypnoPubAt;
            if (immediate || forcedChanged || gap >= 6000) {
                _pushHypno(payload, key);
            } else {
                // 節流中：排一次尾端公告，確保最終狀態一定送出
                _hypnoPubTimer = setTimeout(() => { _hypnoPubTimer = null; _pushHypno(payload, key); }, 6000 - gap);
            }
        } catch (e) {}
    }

    // ── IndexedDB（本機上傳音效 / 大量文本）──
    const HSCDB = {
        db: null,
        open() {
            return new Promise(resolve => {
                try {
                    const req = indexedDB.open('liko-hsc', 1);
                    req.onupgradeneeded = e => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('sounds')) db.createObjectStore('sounds', { keyPath: 'id' });
                        if (!db.objectStoreNames.contains('texts'))  db.createObjectStore('texts',  { keyPath: 'key' });
                    };
                    req.onsuccess = () => { this.db = req.result; resolve(true); };
                    req.onerror   = () => resolve(false);
                } catch { resolve(false); }
            });
        },
        put(store, rec) {
            return new Promise(resolve => {
                try { const tx = this.db.transaction(store, 'readwrite'); tx.objectStore(store).put(rec);
                      tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); }
                catch { resolve(false); }
            });
        },
        get(store, key) {
            return new Promise(resolve => {
                try { const req = this.db.transaction(store, 'readonly').objectStore(store).get(key);
                      req.onsuccess = () => resolve(req.result || null); req.onerror = () => resolve(null); }
                catch { resolve(null); }
            });
        },
        getAll(store) {
            return new Promise(resolve => {
                try { const req = this.db.transaction(store, 'readonly').objectStore(store).getAll();
                      req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]); }
                catch { resolve([]); }
            });
        },
        delete(store, key) {
            return new Promise(resolve => {
                try { const tx = this.db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
                      tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); }
                catch { resolve(false); }
            });
        },
    };

    // ════════════════════════════════════════
    //  匯出 / 匯入（全部設定；DB 文本/音效於後續階段一併納入）
    // ════════════════════════════════════════
    function exportSettings() {
        try {
            const data = { plugin: 'Liko-HSC', v: MOD_VER, hsc: serializeConfig() };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'HSC-settings.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            printChat(ui('exportDone'), 6000);
        } catch (e) {
            console.warn('🐈‍⬛ [HSC] 匯出失敗:', e.message);
        }
    }

    function importSettings() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'application/json,.json';
        inp.onchange = () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
                try {
                    const data  = JSON.parse(String(r.result));
                    const saved = data.hsc || data;
                    setConfig(mergeDefaults(makeDefaultConfig(), saved));
                    setExpressionSets(CONFIG.expressionSets);
                    saveSettings(true);
                    publishSharedSettings();
                    applyDepthLoop();
                    printChat(ui('importDone'), 6000);
                } catch (e) {
                    console.warn('🐈‍⬛ [HSC] 匯入失敗:', e.message);
                    printChat('⚠️ HSC 設定匯入失敗：' + e.message, 8000);
                }
            };
            r.readAsText(f);
        };
        inp.click();
    }

export {
    mergeDefaults,
    estimateESBytes,
    serializeConfig,
    SND_LS_KEY,
    loadSounds,
    saveSounds,
    waitForExtensionSettings,
    loadSettings,
    saveSettings,
    publishSharedSettings,
    publishHypnoState,
    HSCDB,
    exportSettings,
    importSettings,
};
