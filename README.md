# IVH — Immersive Voice Hypnosis (Bondage Club)

收到 `[Voice]` 訊息時觸發沉浸式催眠視覺／音效效果，支援 `/ivh` 指令。作者：莉柯莉絲(Likolisu)。

本專案比照 [BC-AEE](https://github.com/awdrrawd/BC-AEE) 的模式：以 **Vite** 把 `src/` 下的 ES 模組打包成單一 `dist/assets/main.js`，由使用者腳本（loader）用動態 `import()` 載入。GitHub Actions 於 push 到 `main` 時自動 build 並部署到 GitHub Pages。

## 安裝（使用者）

在 Tampermonkey 安裝 **`loader.user.js`**。它只是個載入器，會從 GitHub Pages 抓取打包後的主程式：
`https://awdrrawd.github.io/BC-IVH/assets/main.js`

## 開發

```bash
npm install
npm run dev      # vite build --watch + vite preview (port 5174)
npm run build    # 產生 dist/
npm run lint     # ESLint（no-undef 會抓出漏掉的跨模組 import）
```

本地測試：改裝 **`loader.local.user.js`**（從 `http://localhost:5174/assets/main.js` 載入），`npm run dev` 後重新整理 BC 分頁即可。

## 專案結構

```
loader.user.js          # 正式載入器（GitHub Pages）
loader.local.user.js    # 本地開發載入器（vite preview:5174）
vite.config.js          # 打包設定（單檔 inlineDynamicImports；__IVH_VERSION__ define）
# 素材來源（build 前由 scripts/copy-assets.mjs 複製到 public/，自我裝載、隨 Pages 部署）
Images/                 # 圖源（icon 主檔；build 複製 IVH-icon*.png 到 public/）
Sound/                  # 音源（.mp3）；執行期由 bundle 同源抓（BC-IVH Pages）
Translation/            # i18n：Liko-i18n.js（共用引擎，有防重載）+ IVH-i18n.js（本插件字庫）
public/                 # ← 由上面三者自動產生，已 gitignore；vite 部署到 Pages
src/
  main.js               # 進入點：設定 window.Liko.IVHApi、呼叫 initialize()
  modules/
    config.js           # 版本/共用可變狀態（CONFIG、modApi…）+ setter、預設值
    i18n.js             # 多語（引擎+字庫皆自我裝載自 BC-IVH，繁中 fallback 內建）
    storage.js          # ExtensionSettings / OnlineSharedSettings / IndexedDB / 匯入匯出
    icons.js            # 讀主題色(--tmd-element)/取樣畫布，自動挑 IVH-iconW / IVH-iconB + 按鈕色
    zlayers.js          # 集中的 z-index 分層表（上限 10，兩個堆疊環境）
    atmosphere.js       # 催眠模糊/淡紫（hook Player.GetBlurLevel/GetTints，BC 原生）
    geometry.js         # 畫布座標、頭/嘴位置換算、快取
    util.js             # 興奮度、BCX 清單、文本工具、效果佇列、雜項
    effects.js          # 粉紅暈染/暗角/螺旋/電波/扭曲/校正
    effects2.js         # 彈幕/喘氣粒子/高潮特效
    sound.js            # 音源載入與播放
    character-fx.js     # 表情/興奮度/狀態訊息/訊息浮現/廣播/中央頭像
    depth.js            # 背景催眠深度循環（人影、模糊…）
    run.js              # 主效果流程 runEffect / 解析 [Voice]
    commands.js         # /ivh 指令、聊天輸入攔截
    panel.js            # 控制面板、白名單解析、DOM observer
    hooks.js            # DrawCharacter / OrgasmStage hook
    preference.js       # 偏好設定頁（PreferenceRegisterExtensionSetting）
    profile.js          # 角色資料頁 IVH 按鈕、遠端編輯、設定頁註冊
    styles.js           # CSS 動畫
    core-init.js        # 等待工具與 initialize()
```

### 模組化重點

- **共用可變狀態**（`CONFIG`、`EXPRESSION_SETS`、`modApi`、`_depthTimer`、`_domObserver`…）集中由擁有模組以 ESM live-binding 匯出，重新指派一律經 setter（`setConfig` / `setModApi`…），其他模組只讀。
- **i18n**：優先使用共用的 `window.Liko.i18n` 引擎（跨插件一致語系），未就緒時退回內建中文字庫，因此可離線運作。
- **版本號**單一來源為 `package.json`，經 vite `define` 注入為 `__IVH_VERSION__`；`npm run dev/build` 前會 `sync-version` 同步兩個 loader 的 `@version`。
- **對外 API**：`window.Liko.IVHApi`（`trigger` / `test` / `runDepth` / `command` / `getConfig` / `save`…），供測試與其他插件連動。

## 部署

push 到 `main` → `.github/workflows/deploy.yml` 自動 `npm run build` 並發佈 `dist/` 到 GitHub Pages（需在 repo Settings → Pages 選 GitHub Actions 來源）。
