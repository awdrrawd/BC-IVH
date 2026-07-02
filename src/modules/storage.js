// ── auto-wired cross-module imports ──
import { printChat } from './commands.js';
import { CONFIG, ES_KEY, MOD_VER, makeDefaultConfig, setConfig, setExpressionSets } from './config.js';
import { applyDepthLoop } from './depth.js';
import { ui } from './i18n.js';
import { resolveWhitelistNumbers } from './panel.js';

// ════════════════════════════════════════
//  IVH module: storage.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  儲存層
    //  - Player.ExtensionSettings.IVH  ← 設定本體（LZString 壓縮，跟帳號同步）
    //  - Player.OnlineSharedSettings.IVH ← 對外公告（版本 + 是否允許他人編輯）
    //  - IndexedDB "liko-ivh"          ← 本機上傳音效 bytes / 大量文本（無上限）
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
            arousalStepVoice: c.arousalStepVoice, arousalStepDepth: c.arousalStepDepth, arousalShake: c.arousalShake,
            hypnoEnabled: c.hypnoEnabled, hypnoVoiceStep: c.hypnoVoiceStep, hypnoDepthStep: c.hypnoDepthStep,
            autoWake: c.autoWake, forcedGrowthDiv: c.forcedGrowthDiv, hypnoAnimEnabled: c.hypnoAnimEnabled,
            faceCensor: c.faceCensor, nameCensor: c.nameCensor, faceCensorStyle: c.faceCensorStyle,
            centerHeadshot: c.centerHeadshot, emoteEnabled: c.emoteEnabled, dualSound: c.dualSound,
            whitelist: c.whitelist, triggerWords: c.triggerWords, seeOthersPant: c.seeOthersPant, showProfileButton: c.showProfileButton,
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
    const SND_LS_KEY = 'IVH_sounds';
    function loadSounds() {
        try {
            const raw = localStorage.getItem(SND_LS_KEY);
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

    function loadSettings() {
        try {
            const raw = Player?.ExtensionSettings?.[ES_KEY];
            if (raw) {
                const json = LZString.decompressFromBase64(raw);
                const saved = json ? JSON.parse(json) : null;
                if (saved) {
                    setConfig(mergeDefaults(makeDefaultConfig(), saved));
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
            }
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] 設定讀取失敗，使用預設:', e.message);
            setConfig(makeDefaultConfig());
        }
        loadSounds();   // 音效改從 localStorage（跨帳號共用）
        setExpressionSets(CONFIG.expressionSets);
    }

    let _saveTimer = null;
    function saveSettings(immediate = false) {
        const doSave = () => {
            try {
                if (!Player) return;
                if (!Player.ExtensionSettings) Player.ExtensionSettings = {}; // 從未有設定的帳號需自建
                const raw = JSON.stringify(serializeConfig());
                Player.ExtensionSettings[ES_KEY] = LZString.compressToBase64(raw);
                if (typeof ServerPlayerExtensionSettingsSync === 'function') {
                    ServerPlayerExtensionSettingsSync(ES_KEY);
                }
                saveSounds();   // 音效另存 localStorage（跨帳號共用）
                setExpressionSets(CONFIG.expressionSets);
            } catch (e) {
                console.warn('🐈‍⬛ [IVH] 設定儲存失敗:', e.message);
            }
        };
        if (immediate) { if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; } doSave(); return; }
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => { _saveTimer = null; doSave(); }, 600);
    }

    // 對外公告：他人查看 profile 時用來判斷是否裝了 IVH / 是否允許編輯
    function publishSharedSettings() {
        try {
            if (!Player || !Player.OnlineSharedSettings) return;
            const em = CONFIG.editModes || { catalyst: 'off', status: 'off', trigger: 'off', wake: 'off', response: 'off' };
            const on = m => m === 'any' || m === 'whitelist';
            const cats = ['catalyst', 'status', 'trigger', 'wake', 'response', 'allowed'];
            const anyEditable = cats.some(k => on(em[k]));
            // 有任何「白名單」類別時，公告展開後的白名單成員編號，讓對方能自行判斷是否可編輯（→ 不可編輯時禁用）
            const needWl = cats.some(k => em[k] === 'whitelist');
            Player.OnlineSharedSettings[ES_KEY] = {
                v: MOD_VER,
                edit: anyEditable,                       // profile 按鈕是否亮起
                editModes: { catalyst: em.catalyst || 'off', status: em.status || 'off', trigger: em.trigger || 'off', wake: em.wake || 'off', response: em.response || 'off', allowed: em.allowed || 'off' },
                wl: needWl ? Array.from(resolveWhitelistNumbers()) : [],
                // 各類允許編輯時才公告內容，讓他人在 profile 看到並編輯（白名單模式仍由本端驗證）
                texts:    on(em.catalyst) ? (CONFIG.customTexts || [])  : [],
                emotes:   on(em.status)   ? (CONFIG.emoteList || [])    : [],
                triggers: on(em.trigger)  ? (CONFIG.triggerWords || []) : [],
                wake:     on(em.wake)     ? (CONFIG.wakeWords || [])    : [],
                response: on(em.response) ? (CONFIG.responseList || []) : [],
                allowed:  on(em.allowed)  ? (CONFIG.allowedPhrases || []) : [],
            };
            if (typeof ServerAccountUpdate?.QueueData === 'function') {
                ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings });
            }
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] OnlineSharedSettings 公告失敗:', e.message);
        }
    }

    // ── IndexedDB（本機上傳音效 / 大量文本）──
    const IVHDB = {
        db: null,
        open() {
            return new Promise(resolve => {
                try {
                    const req = indexedDB.open('liko-ivh', 1);
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
            const data = { plugin: 'Liko-IVH', v: MOD_VER, ivh: serializeConfig() };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'IVH-settings.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            printChat(ui('exportDone'), 6000);
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] 匯出失敗:', e.message);
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
                    const saved = data.ivh || data;
                    setConfig(mergeDefaults(makeDefaultConfig(), saved));
                    setExpressionSets(CONFIG.expressionSets);
                    saveSettings(true);
                    publishSharedSettings();
                    applyDepthLoop();
                    printChat(ui('importDone'), 6000);
                } catch (e) {
                    console.warn('🐈‍⬛ [IVH] 匯入失敗:', e.message);
                    printChat('⚠️ IVH 設定匯入失敗：' + e.message, 8000);
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
    IVHDB,
    exportSettings,
    importSettings,
};
