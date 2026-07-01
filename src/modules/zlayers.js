// ════════════════════════════════════════
//  IVH module: zlayers.js
//  集中宣告所有 z-index（上限 10）。分成兩個獨立的堆疊環境：
//
//   A) #ivh-overlay 容器「內部」的子元素 —— 彼此相對比較
//   B) document.body「根層」—— 含 overlay 容器本身
//
//  想調整某效果在前在後，只改這裡的數字即可；同一數字＝同層（不在意先後，
//  依 DOM 加入順序疊）。未列在此的場景效果（粉紅暈染／暗角／螺旋／電波／彈幕）
//  使用預設 auto(0)，位於 overlay 內最底、靠加入順序疊放。
// ════════════════════════════════════════

export const IVH_Z = {
    // ── A. #ivh-overlay 容器內（子元素相對）──
    //     其它特效(粉紅/暗角/電波/彈幕)= auto(0)，在最底靠 DOM 順序疊
    base:        1,  // 中央頭像 / 人物模糊遮罩（背景基準層）
    spiral:      2,  // 催眠螺旋
    particle:    3,  // 喘氣粒子（煙霧）
    sceneText:   4,  // 人影耳語 / 深度浮動文字
    climaxFlash: 5,  // 高潮紅白閃光 + 全螢幕震動（最上）

    // ── B. document.body 根層（含 overlay 本身）──
    prefInput:    1,  // 偏好頁 DOM 輸入框（僅設定頁出現，最底）
    climaxBg:     2,  // 高潮黑幕底層
    distortSnap:  3,  // 畫面扭曲快照（在 overlay 之下）
    climaxShards: 4,  // 高潮碎片
    overlay:      5,  // #ivh-overlay 容器（承載上方 A 群效果）
    dialog:       6,  // 遠端文本編輯 / 確認框
    tool:         7,  // 座標校正 / debug 疊圖（最上）
};
