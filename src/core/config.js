// ════════════════════════════════════════
//  HSC module: config.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

import { ui } from '../i18n/i18n.js';

    // 版本號由 package.json 經 vite define 注入（見 vite.config.js）
    const MOD_VER = (typeof __HSC_VERSION__ !== 'undefined' && __HSC_VERSION__) || "2.1.1";
    // 共用可變狀態：bcModSdk 的 mod api（由 core-init 於註冊後 setModApi 設定）
    let modApi = null;
    function setModApi(v) { modApi = v; }
    // ════════════════════════════════════════
    //  預設表情清單（4 組內建，玩家可自訂最多 10 組）
    // ════════════════════════════════════════
    const DEFAULT_EXPRESSIONS = [
        { Eyebrows: "Soft",    Eyes: "VeryLewd",      Mouth: "Frown",  Blush: "High"     },
        { Eyebrows: "Lowered", Eyes: "HeartPink",      Mouth: "Moan",   Blush: "High"     },
        { Eyebrows: "Raised",  Eyes: "LewdHeartPink",  Mouth: "Ahegao", Blush: "VeryHigh" },
        { Eyebrows: "Lowered", Eyes: "Heart",          Mouth: "Open",   Blush: "Medium"   },
    ];

    // 內建催眠文本／狀態 emote 改由 i18n 提供（ui('defaultTexts') / ui('defaultEmotes')）

    // ════════════════════════════════════════
    //  設定模型（持久化於 Player.ExtensionSettings.HSC）
    //  CONFIG 為執行期物件，由 loadSettings() 從 ES 還原
    // ════════════════════════════════════════
    function makeDefaultConfig() {
        return {
            // ── 主開關 ──
            enabled:        true,  // HSC 總開關

            // ── VOICE 八大效果開關 ──
            pinkFlash:      true,  // 粉紅暈染
            hypnoSpiral:    true,  // 催眠螺旋
            hypnoWaves:     true,  // 同心圓電波
            screenDistort:  true,  // 畫面扭曲
            vignette:       true,  // 邊緣暗角
            danmaku:        true,  // 彈幕文字
            steamParticles: true,  // 氣喘粒子
            expression:     true,  // 表情切換
            chatFade:       true,  // 訊息浮現（10 秒內新訊息字體慢慢浮現）
            climax:         true,  // 高潮特效
            climaxMode:    "orgasm", // orgasm=高潮才觸發 | always=每次催眠都觸發
            sound:          false, // 喘息聲音（預設關閉）

            // ── 強度 ──
            intensity:      1.0,   // 0.1~3.0

            // ── VOICE 進階 ──
            centerHeadshot: false, // 中央頭像模式（每次 VOICE 裁 300×300 置中，忽略分頁）
            emoteEnabled:   true,  // 觸發時發送狀態 emote
            dualSound:      false, // VOICE 同時播兩個音效（預設關閉，避免公開場合誤撥）

            // ── 觸發 ──（觸發對象已取消：任何人說出觸發詞/[Voice] 都會觸發）
            //   whitelist 可含 MemberNumber 或代號 $owner（主人）/$lover（愛人），驗證時即時展開
            whitelist:      ['$owner'],
            triggerWords:   [],    // 自訂觸發詞（除了 [Voice]）
            seeOthersPant:  false, // 收到他人催眠廣播時，是否在其角色上顯示喘氣（預設關閉）
            seeOthersHypno: true,  // 在他人角色頭上顯示其催眠進度球（讀 OnlineSharedSettings；預設開啟）
            seeOthersTalisman: true, // 他人陷入強控時，在其頭上顯示催眠符咒（預設開啟）
            showProfileButton: true, // 是否在別人 profile 顯示 HSC 文本編輯按鈕

            // ── 三大系統開關（總開關為 enabled）──
            voiceEnabled:   true,  // 語音催眠（[Voice]/觸發詞 → 效果）

            // ── 興奮值：每次觸發增加（0~20，0=停用）；語音 / 日常干擾分開 ──
            arousalStepVoice: 5,
            arousalStepDepth: 5,

            // ── 催眠值（0~100，每 12 秒 -1）：語音 / 日常干擾分開；催眠狀態關則不成長 ──
            hypnoEnabled:    false, // 催眠狀態 啟/停用
            hypnoVoiceStep:  5,     // 語音催眠每次 +（0~20）
            hypnoDepthStep:  5,     // 日常干擾每次 +（0~20）
            hypnoClimax:     false, // 催眠高潮：陷入強控時觸發一次高潮（因催眠而達到高潮）
            autoWake:        true,  // 自動清醒（催眠值 <15% 時解除強控）
            forcedGrowthDiv: 1,     // 強控中催眠值成長 = 原值 × N/10（預設 1 → 1/10）
            hypnoAnimEnabled: false, // 催眠動畫（符咒動畫等；預留）
            hypnoAnimStyle:   1,     // 符咒樣式 1~12（HSC-Status-Code1.png 的 2×6 格）
            hypnoAnimColor:   '#f500b4', // 符咒染色（mask 染色，顏色 100% 準）
            headTalisman:     false, // 頭上貼符咒（強控中額頭常駐符咒且持續震動）
            faceCensor:       false, // 面部識別障礙（強控中看不清他人的臉）
            nameCensor:       false, // 名稱識別障礙（強控中看不清他人的名字/ID）
            faceCensorStyle:  'circle', // 面部塗鴉樣式：'circle' 圓圈 / 'line' 線條（二選一）
            crowd:            false, // 顯示人群（強控中畫面下緣圍觀人群）
            // ── 強控中的訊息類效果（僅強控時作用）──
            stateDanmakuChat:    false, // 彈幕文字-聊天：他人聊天訊息化為彈幕（隨機字級 14~20）
            stateDanmakuWhisper: false, // 彈幕文字-悄悄話：他人悄悄話在耳邊以紫色彈幕出現
            stateMsgSmoke:       false, // 訊息妨礙：訊息被煙霧遮住，點擊才慢慢散去
            stateMsgInterfere:   false, // 信息干擾：人員進/出訊息被改成模糊的幻覺敘述

            // ── 日常干擾（原「催眠深度」；定時觸發；開/關 + 間隔 + 扁平效果；喘氣單一）──
            depthEnabled:   false,
            depthIntervalMin: 5,   // 循環間隔（分鐘 1~99）
            depthEffects: { smoke: true, chatDanmaku: true, ghost: true, figureBlur: true, sfx: true, fade: true, chatlogBlur: true, pant: true },

            // ── 文本 ──
            textSource:     "ES",      // ES | DB
            customTexts:    ui('defaultTexts').split('\n').map(s => s.trim()).filter(Boolean),
            emoteList:      ui('defaultEmotes').split('\n').map(s => s.trim()).filter(Boolean),
            wakeWords:      ['wake'],  // 清醒詞（可多個）：房內「他人」說出→你清醒；自己說無效
            // 催眠回應：強控中說話有機會被攔截，改說其中一句（$me=名字）
            responseList:   ui('defaultResponses').split('\n').map(s => s.trim()).filter(Boolean),
            // 允許說的話：強控中整句剛好是這些之一 → 不攔截，照常說出
            allowedPhrases: [],

            // ── 表情（最多 10 組）──
            expressionSets: DEFAULT_EXPRESSIONS.map(e => ({ ...e })),

            // ── 語言（auto = 依遊戲語系；或手動 TW/CN/EN/DE/FR/RU/UA）──
            lang: 'auto',

            // ── 允許他人編輯各類內容：每類 off（僅自己）/ whitelist（白名單）/ any（所有人）──
            //    共用同一份 whitelist。透過角色資料頁的 HSC 按鈕遠端編輯。預設白名單（含 $owner）。
            editModes: { catalyst: 'whitelist', status: 'whitelist', trigger: 'whitelist', wake: 'whitelist', response: 'whitelist', allowed: 'whitelist' },

            // ── 音效（URL 清單；本機上傳另存 IndexedDB，此處放 id 參照）──
            soundSource:    "ES",      // ES | DB
            sounds: {
                hypno:  [],  // 催眠音效 最多 5
                climax: [],  // 高潮音效 最多 5
                depth:  [],  // 深度音效 最多 3
                voice:  [],  // VOICE 音效 最多 3
            },
        };
    }

    // 執行期設定物件（由 loadSettings 填充）
    //  CONFIG / EXPRESSION_SETS 為跨模組共用的可變狀態：以 ESM live-binding 匯出，
    //  重新指派一律透過下方 setter（其他模組只讀）。
    let CONFIG = makeDefaultConfig();
    function setConfig(v) { CONFIG = v; }
    // 相容舊程式碼：EXPRESSION_SETS 指向目前設定的表情組
    let EXPRESSION_SETS = CONFIG.expressionSets;
    function setExpressionSets(v) { EXPRESSION_SETS = v; }
    const ES_KEY = "HSC";                       // ExtensionSettings / OnlineSharedSettings 儲存鍵
    const PREF_ID = "Liko_HSC_Settings";        // 偏好設定頁註冊 Identifier
    const ES_BUDGET = 5120; // 5KB 警戒線

export {
    MOD_VER,
    modApi, setModApi,
    DEFAULT_EXPRESSIONS,
    makeDefaultConfig,
    CONFIG, setConfig,
    EXPRESSION_SETS, setExpressionSets,
    ES_KEY,
    PREF_ID,
    ES_BUDGET,
};
