// ==UserScript==
// @name         IVH - Immersive Voice Hypnosis - 本地版
// @name:zh      沉浸式聲音催眠效果 - 本地開發
// @namespace    https://likulisu.dev/
// @version      2.1.1
// @description  IVH 本地開發載入器（從 vite preview 讀取，npm run dev，port 5174）
// @author       莉柯莉絲(Likolisu)
// @supportURL   https://github.com/awdrrawd/BC-IVH
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @icon         https://raw.githubusercontent.com/awdrrawd/liko-tool-Image-storage/refs/heads/main/Images/LOGO_2.png
// @grant        none
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/gh/awdrrawd/liko-Plugin-Repository@main/Plugins/expand/bcmodsdk.js
// ==/UserScript==

// Local dev loader: reads the bundle from the local vite preview server.
// Run `npm run dev` (builds in watch mode + serves on port 5174), then reload BC.
// The ?v= timestamp busts the cache so every reload picks up the latest build.
window.Liko = window.Liko ?? {};
if (window.Liko.IVH) {
    console.warn('🐈‍⬛ [IVH] ⚠️ 已載入，略過重複匯入。');
} else {
    window.Liko.IVH = 'loading';
    import(`http://localhost:5174/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('🐈‍⬛ [IVH] 本地載入失敗（vite preview 有開嗎？）:', e));
}
