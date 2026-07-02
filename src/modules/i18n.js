// ── auto-wired cross-module imports ──
import { CONFIG } from './config.js';
import { assetUrl } from './icons.js';

// ════════════════════════════════════════
//  IVH module: i18n.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  i18n（多語）：動態載入共用引擎 + IVH 字庫，ui(key,vars) 取字串
    //  引擎未就緒時，ui() 回傳 fallbacks[key]（中文原文），不丟例外
    // ════════════════════════════════════════
    const I18N_NS = 'IVH';
    // 翻譯自我裝載：與 bundle 同源（正式站 = BC-IVH Pages，本地 = vite preview）。
    //  Liko-i18n.js 是共用引擎（有防重複載入），IVH-i18n.js 是本插件字庫；
    //  兩者放 Translation/，build 前由 copy-assets 複製到 public/Translation/ 一併部署。
    const LIKO_I18N_ENGINE_URL = assetUrl('Translation/Liko-i18n.js');
    const LIKO_IVH_STRINGS_URL = assetUrl('Translation/IVH-i18n.js');

    // 加時間戳避免 CDN 快取到舊字庫（翻譯會經常修改）
    function _i18nLoadScript(url) {
        const u = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        return fetch(u)
            .then(res => { if (!res.ok) throw new Error(`[IVH] 無法載入 ${url} (${res.status})`); return res.text(); })
            .then(code => { new Function(code)(); });
    }
    async function ensureI18n() {
        try {
            if (!window.Liko?.i18n?.version) await _i18nLoadScript(LIKO_I18N_ENGINE_URL);
            if (!window.Liko?.i18n?._ivhStringsLoaded) {
                await _i18nLoadScript(LIKO_IVH_STRINGS_URL);
                if (window.Liko?.i18n) window.Liko.i18n._ivhStringsLoaded = true;
            }
        } catch (e) { console.warn('🐈‍⬛ [IVH] i18n 載入失敗，改用中文原文:', e.message); }
    }
    // 可選語言（auto = 依遊戲語系）
    const IVH_LANGS = ['auto', 'TW', 'CN', 'EN', 'DE', 'FR', 'RU', 'UA'];
    const IVH_LANG_NAMES = { auto: 'Auto', TW: '繁體中文', CN: '简体中文', EN: 'English', DE: 'Deutsch', FR: 'Français', RU: 'Русский', UA: 'Українська' };

    // 目前語言：玩家手動選 > 遊戲語系
    function ivhLang() {
        try {
            const sel = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.lang) || 'auto';
            if (sel && sel !== 'auto') return sel;
            const raw = (typeof TranslationLanguage !== 'undefined' ? TranslationLanguage : '') || 'EN';
            const c = String(raw).toUpperCase().trim();
            return c === 'ZH' ? 'TW' : (c || 'EN');
        } catch { return 'EN'; }
    }

    // 取翻譯：優先用 _IVH_strings（支援手動語言覆蓋）；
    //   其次用引擎 t()（舊版線上字庫只 register、未 expose _IVH_strings 時仍可譯，但只跟遊戲語系）；
    //   最後才退中文 IVH_FALLBACK。
    function ui(key, vars) {
        const lang = ivhLang();
        let s;
        const store = window.Liko?._IVH_strings;
        const e = store && store[key];
        if (e) {
            s = e[lang] ?? e[lang === 'CN' ? 'TW' : 'XX'] ?? e['EN'];
        }
        if (s == null) {
            const fn = window.Liko?.i18n;
            if (fn?.t && fn.has?.(I18N_NS, key)) return fn.t(I18N_NS, key, vars);
        }
        if (s == null) s = IVH_FALLBACK[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
    }

    // 引擎未載入時的中文 fallback（與 IVH-i18n.js 的 TW 一致）
    const IVH_FALLBACK = {
        loaded: 'IVH v{v} 已載入 ✅\n/ivh help 說明 | /ivh setting 設定頁',
        help: '🌀 IVH v{v} 指令列表：\n  /ivh setting       — 開啟偏好設定頁\n  /ivh show          — 顯示控制面板\n  /ivh test [文字]   — 立即觸發效果\n  /ivh climax        — 測試高潮特效\n  /ivh depth [1~3]   — 測試催眠深度效果\n  /ivh calibrate     — 頭部座標校正面板\n  /ivh help          — 顯示此說明',
        cmdUnknown: '⚠️ [IVH] 未知指令「{sub}」，輸入 /ivh help 查看說明',
        cantOpenSettings: '⚠️ 無法開啟設定頁（偏好系統未就緒）',
        exportDone: '📤 IVH 設定已匯出 (IVH-settings.json)',
        importDone: '📥 IVH 設定已匯入',
        editedYourText: '📝 {who} 編輯了你的 IVH 催眠文本',
        accessedYourText: '👁 {who} 正在查看你的 IVH 文本',
        tab_basic: '基本設定', tab_effects: '效果設定', tab_texts: '文本設定', tab_expr: '表情設定', tab_sounds: '音效設定', tab_about: '關於插件',
        exit: '離開', info: '── 說明 ──', cancel: '取消', confirm: '確定', save: '💾 保存', delete: '🗑 刪除',
        upload: '上傳', clear: '清除', other: '其他', restoreDefault: '還原預設', export: '匯出全部設定', import: '匯入全部設定',
        enabledOn: 'IVH 啟用中', enabledOff: 'IVH 停用中',
        enabledDesc: '開啟後此插件會有更高沉浸性，並包含部分可能令人不適的效果（強閃光、畫面破碎、震動等），請依個人狀況使用。',
        intensity: '催眠強度', depthMax: '催眠深度', depthNone: '無', depthLight: '輕', depthMed: '中', depthHeavy: '重',
        interval: '循環時間', minutes: '分（1~99）', depthEffects: '── 深度效果 ──',
        intensityD: '整體效果強度（0.1~3.0）。可拖曳滑桿。',
        depthMaxD: '不同於催眠強度的語音催眠，這是定時觸發的催眠效果。',
        intervalD: '每隔幾分鐘自動播放一次背景催眠（1~99）。',
        depthEffectsHint: '定時觸發時要出現哪些效果，自由勾選。',
        arousalStepLabel: '興奮值', arousalStepD: '每次觸發催眠增加的興奮值（0~20，0＝停用）。',
        hypnoLabel: '催眠值', hypnoD: '收到催眠時累積的催眠值（0~100，每 12 秒 -1）。到 100% 進入強控，低於 15% 解除。',
        hypnoVoiceLabel: '語音催眠值', hypnoVoiceD: '每次語音催眠增加（0~20，0＝停用）。',
        hypnoDepthLabel: '深度催眠值', hypnoDepthD: '每次深度催眠增加（0~10，0＝停用）。',
        sec_wakeWord: '清醒詞', wakeWordD: '房內任何人說出此詞→你立即清醒；催眠值高於 80% 則設為 80%。', wakeWordPh: '例：wake',
        depthRowLight: '深度輕', depthRowMed: '深度中', depthRowHeavy: '深度重',
        fx_smoke: '煙霧', fx_smokeD: '不定時淡粉煙霧', fx_pant: '喘氣', fx_pantD: '規律喘氣白霧',
        fx_danmaku: '彈幕', fx_danmakuD: '聊天訊息變催眠彈幕', fx_ghost: '人影', fx_ghostD: '背後低語人影＋耳邊文字',
        fx_figblur: '人物模糊', fx_figblurD: '畫面模糊但人物/人影保持清晰', fx_sfx: '音效', fx_sfxD: '播放深度音效',
        fx_chatblur: '聊天模糊', fx_chatblurD: '右側聊天訊息模糊',
        fx_fade: '訊息浮現', fx_fadeD: '新進聊天訊息字體慢慢浮現',
        triggerTargetD: '誰說出觸發詞會讓你進入催眠。「僅白名單」時只有名單內成員有效。',
        allowEdit: '允許文本修改', allowEditD: '誰可在你的角色資料頁增減你的催眠文本。「僅自己」只有你能編輯；「僅白名單」時名單內成員（含你自己）可編輯。',
        editOff: '僅自己', editAny: '所有人', editWhitelist: '僅白名單',
        editPermTitle: '允許編輯對象', editPermTitleD: '誰可在你的角色資料頁增減各類內容。「僅自己」只有你能編輯；「白名單」名單內成員可編輯；「所有人」任何人都可編輯。三類共用下方白名單。',
        on: '開', off: '關',
        seeOthersPant: '看到他人喘氣', seeOthersPantD: '開啟後，當房內其他人被催眠（送出催眠廣播）時，你會在對方角色身上看到喘氣白霧。預設關閉。',
        remoteEditTitle: '編輯 {name} 的 IVH 文本', remoteEditHint: '每行一句。可用 $me 代表被催眠者、$n 換行；狀態訊息以 $a 開頭會發 Action。儲存後送給對方（對方需仍允許編輯才生效）。',
        remoteEditSave: '💾 儲存並送出', remoteEditSent: '📤 已送出給 {name}，等待對方套用…',
        remoteEditOk: '✅ {name} 已套用你的編輯', remoteEditDenied: '⚠️ {name} 未套用你的編輯（你不在對方白名單）',
        profileEditBtn: '編輯對方的 IVH 文本', profileEditOff: '對方未開放編輯文本',
        profileEditNoPerm: '你不在對方白名單，無法編輯', remoteEditNoPerm: '你沒有此項編輯權限',
        whitelistD: '會員編號或代號（$owner＝主人、$lover＝愛人含 AFC、$friend＝好友、$white＝BC白名單），逗號或空白分隔。各類「白名單」編輯權限共用此名單。', whitelistPh: '例：$owner, $lover, $friend, $white, 12345',
        textsResetD: '把催眠文本／狀態訊息／觸發詞重設為「目前語言」的預設值（切換語言後可用來更新翻譯）。',
        confirmTextsReset: '會用目前語言的預設覆蓋你的催眠文本、狀態訊息與觸發詞，確定嗎？',
        language: '語言', languageD: '介面語言。Auto＝依遊戲登入語系；也可手動選擇。',
        exportD: '把所有設定下載為 JSON 檔。', importD: '從 JSON 檔還原所有設定。',
        triggerTarget: '觸發對象', anyone: '任何人', whitelistOnly: '僅白名單', whitelist: '白名單',
        allowOthersOn: '允許他人增減我的文本：開', allowOthersOff: '允許他人增減我的文本：關',
        climaxMode: '高潮模式', climaxOnOrgasm: '僅高潮時', climaxAlways: '每次觸發',
        climaxModeD: '「僅高潮時」＝BC 真正高潮才放破碎特效；「每次觸發」＝每次催眠都放。',
        climaxEvery: '每次觸發', climaxOrgasm: '僅高潮時',
        effectsHint: '逐項開關 VOICE 觸發時的各種效果，滑鼠移到項目上可看說明。',
        ev_pinkFlash: '粉紅暈染', ev_pinkFlashD: '畫面泛起粉紅光暈，營造迷濛氛圍。',
        ev_hypnoSpiral: '催眠螺旋', ev_hypnoSpiralD: '在頭部上方出現旋轉螺旋。',
        ev_hypnoWaves: '同心電波', ev_hypnoWavesD: '畫面左側出現向外擴張的同心圓波。',
        ev_screenDistort: '畫面扭曲', ev_screenDistortD: '畫面輕微旋轉模糊，像意識被攪動。',
        ev_vignette: '邊緣暗角', ev_vignetteD: '畫面四周變暗，聚焦中央。',
        ev_danmaku: '彈幕文字', ev_danmakuD: '主台詞在頭上、旁白句散落左側（含聊天歷史）。',
        ev_steam: '喘氣白霧', ev_steamD: '嘴邊呼出柔和白霧，向左右下方飄散。',
        ev_expression: '表情切換', ev_expressionD: '催眠時隨機套用表情，結束後還原。',
        ev_chatFade: '訊息浮現', ev_chatFadeD: '觸發後 10 秒內，新進聊天訊息字體會慢慢浮現（LSCG 幽靈風）。',
        ev_climax: '高潮特效', ev_climaxD: '畫面碎裂＋紅白閃光＋震動。',
        ev_sound: '喘息聲音', ev_soundD: '播放喘息音效（需音效設定）。',
        ev_headshot: '中央頭像', ev_headshotD: '每次觸發在畫面中央裁出頭像，螺旋／喘氣以它為基準（忽略分頁）。',
        ev_dualSound: '雙重音效', ev_dualSoundD: '播放說話聲的同時，疊放一個觸發音（鐘擺等，使用「催眠」分類音效）。',
        ev_emote: '狀態訊息', ev_emoteD: '觸發時發送一條動作訊息，讓他人知道你的狀態。',
        sec_hypnoText: '催眠文本', sec_statusMsg: '狀態訊息', sec_triggerWords: '觸發詞',
        textsHint: '每行一句。$me＝被催眠者名稱、$n＝換行（彈幕／人影）；狀態訊息以 $a 開頭會以 Action 發送。',
        hypnoTextD: '彈幕／人影旁白來源，會和 BCX 的聽我聲音一起使用，僅被催眠者能看見。可用 $n 換行。',
        hypnoTextPh: '例：$me 好乖…$n放鬆…',
        statusMsgD: '觸發催眠時隨機發送的訊息。開頭 $a＝Action（系統動作）、$c＝Chat（一般說話，可用於呻吟），否則為 Emote。', statusMsgPh: '例：$a $me 的思緒變得混亂了 / $c 啊…嗯…',
        triggerWordsD: '白名單成員在聊天說出含這些詞的訊息時會觸發你的催眠（[Voice] 永遠有效）。每行一個。',
        triggerWordsPh: '例：催眠　沉睡',
        soundsHint: '每格可貼網址或「上傳」本機檔。「▶」試聽、「✕」清除、「其他」從右側音效庫選用。空白＝預設。',
        sndCat_hypno: '催眠', sndCat_voice: '催眠2', sndCat_climax: '高潮', sndCat_depth: '深度',
        sndSlotHead: '{name}音效（最多 {max}）', sndDefaultPh: '（預設）{file}',
        sndUnsetPh: '未設定 — 網址／上傳／其他', sndLocalName: '本機音效',
        expr_edit: '🎭 編輯表情', expr_item: '表情{n}', expr_add: '＋ 用右側內容新增',
        expr_hint: '在右側設定好表情後，點某列「保存」或「＋新增」來儲存',
        eyebrows: '眉毛', eyes: '眼睛', mouth: '嘴巴', blush: '臉紅', exprNone: '— 無 —', previewLoading: '預覽載入中…',
        confirmReplace: '會用右側的內容替換「{name}」的資料，確定嗎？', confirmDelete: '確定刪除「{name}」嗎？',
        confirmReset: '會清除所有自訂表情，恢復 4 組內建，確定嗎？',
        snd_lib: '🔊 音效庫', snd_preset: '預設', snd_local: '本機',
        snd_assignTo: '指派給「{label}」：點上面任一音效', snd_pickHint: '點格子的「其他」後可在此指派；直接點則試聽。',
        about_author: '作者：莉柯莉絲(Likolisu)', about_dev: '本插件為個人興趣開發，可能存在些許錯誤，歡迎到 GitHub 回報。',
        about_report: '🐛 GitHub 回報', about_assets: '── 使用素材皆為免費素材 ──',
        defaultTexts: '放鬆…放鬆…\n你的意識正在沉睡\n聽我的聲音\n什麼都不用想\n越來越深沉\n順從是舒服的\n沉淪下去吧\n好乖…好乖…',
        defaultEmotes: '$me 的思緒變得混亂了\n$me 的兩眼變得空洞…\n$me 的意識正在下沉\n$me 微微晃了一下，失神了\n$me 的表情變得恍惚',
        defaultResponses: '是的主人\n$me是個乖女孩\n$me會乖乖聽話\n嗯嗯!!阿啊啊~!',
        sec_hypnoResponse: '催眠回應', hypnoResponseD: '強控（催眠值 100%）時說話有機會被攔截，改說這裡的其中一句。每行一句，$me＝你的名字。', hypnoResponsePh: '例：是的主人',
        allowedPhrasesLabel: '允許說的話', allowedPhrasesD: '強控中，若你說的整句剛好是這裡的其中一句，就不會陷入思考、照常說出。每行一句。', allowedPhrasesPh: '例：是的主人',
        hs_thinking: '$me 呆呆地思考了一下…',
        hs_blank: '$me 只是呆呆地站著，什麼也沒說',
        hs_pause: '$me 停頓了一下才開口',
        hs_intercept: '$me 想說些什麼，但意識馬上被干擾了',
        hs_lewd: '$me 現在滿腦子只想著淫穢的事情',
        hs_lewdFallback: '$me 開始不自覺地自慰起來…',
    };

export {
    I18N_NS,
    LIKO_I18N_ENGINE_URL,
    LIKO_IVH_STRINGS_URL,
    _i18nLoadScript,
    ensureI18n,
    IVH_LANGS,
    IVH_LANG_NAMES,
    ivhLang,
    ui,
    IVH_FALLBACK,
};
