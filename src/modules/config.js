// ════════════════════════════════════════
//  IVH module: config.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

import { ui } from './i18n.js';

    // 版本號由 package.json 經 vite define 注入（見 vite.config.js）
    const MOD_VER = (typeof __IVH_VERSION__ !== 'undefined' && __IVH_VERSION__) || "2.1.1";
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
    //  設定模型（持久化於 Player.ExtensionSettings.IVH）
    //  CONFIG 為執行期物件，由 loadSettings() 從 ES 還原
    // ════════════════════════════════════════
    function makeDefaultConfig() {
        return {
            // ── 主開關 ──
            enabled:        true,  // IVH 總開關

            // ── VOICE 八大效果開關 ──
            pinkFlash:      true,  // 粉紅暈染
            hypnoSpiral:    true,  // 催眠螺旋
            hypnoWaves:     true,  // 同心圓電波
            screenDistort:  true,  // 畫面扭曲
            vignette:       true,  // 邊緣暗角
            danmaku:        true,  // 彈幕文字
            steamParticles: true,  // 氣喘粒子
            expression:     true,  // 表情切換
            arousal:        true,  // 興奮度+
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

            // ── 催眠深度（獨立背景循環；0=無=關閉）──
            depthMax:       0,     // 0=無 1=輕 2=中 3=重（無則不循環）
            depthIntervalMin: 5,   // 循環間隔（分鐘 1~99）
            // 各深度層效果開關
            depthLight: { smoke: true, pant: true, chatDanmaku: true, ghost: true },
            depthMed:   { figureBlur: true, pant: true, sfx: true, fade: true },
            depthHeavy: { chatlogBlur: true, pant: true },

            // ── 文本 ──
            textSource:     "ES",      // ES | DB
            customTexts:    ui('defaultTexts').split('\n').map(s => s.trim()).filter(Boolean),
            emoteList:      ui('defaultEmotes').split('\n').map(s => s.trim()).filter(Boolean),

            // ── 表情（最多 10 組）──
            expressionSets: DEFAULT_EXPRESSIONS.map(e => ({ ...e })),

            // ── 語言（auto = 依遊戲語系；或手動 TW/CN/EN/DE/FR/RU/UA）──
            lang: 'auto',

            // ── 允許他人編輯各類內容：每類 off（僅自己）/ whitelist（白名單）/ any（所有人）──
            //    共用同一份 whitelist。透過角色資料頁的 IVH 按鈕遠端編輯。預設白名單（含 $owner）。
            editModes: { catalyst: 'whitelist', status: 'whitelist', trigger: 'whitelist' },

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
    const ES_KEY = "IVH";                       // ExtensionSettings / OnlineSharedSettings 儲存鍵
    const PREF_ID = "Liko_IVH_Settings";        // 偏好設定頁註冊 Identifier
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
