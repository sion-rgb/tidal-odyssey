# 實測紀錄

測試日期：2026-10-19。所有數據來自實際運行，不是預估分數。

## 已通過

- `npm test`：3 項路徑 / 波面測試；取樣 2,000 個位置，檢查連續性、地形淨空、兩次海平面穿越、反向一致性與光學混合平滑。
- `npm run build`：TypeScript 檢查與 Vite 正式打包。
- 本地 Chrome 完整 100 秒自動遊覽及互動檢查：**28 項通過**。原始資料：[full-tour.json](qa/full-tour.json)。
- 最後一次素材 / 雲層調整後的快速回歸：**26 項通過**。原始資料：[results.json](qa/results.json)。
- 播放、暫停、反向、滾輪前後移動、鍵盤、章節 / 進度控制、說明對話框、首次明確點擊後才建立音訊。
- 沿路徑跨越水面時，實測相機高度 / 水下混合值從 air → underwater → air；三幕只使用一份 document，沒有 navigation reload。
- 海底延遲 chunk 及 Meshopt 模型載入成功。
- 1440×900、768×1024、390×844、320×640、844×390：Canvas 及控制列在畫面範圍內，沒有水平溢出。390px / 320px 測試以 Chrome CDP 發送實際 touch events，確認滑動會改變相機進度。
- 減少動態模式啟用、初始暫停。
- **0 JavaScript / Shader Console errors、0 warnings、0 failed HTTP asset requests**（完整遊覽及最後本地回歸）。
- 左上角沒有標誌或名稱，DOM 與截圖均已確認。

## 效能條件

Windows Chrome，ANGLE / Direct3D11，**NVIDIA GeForce RTX 2070 SUPER**。完整遊覽每約 4.5 秒採樣，應用程式每 120 幀量測：**74.60–75.23 fps**，像素比 1，未觸發自動降畫質。包含反射與折射的總渲染工作最高採樣約 155 draw calls、121 萬 triangles。

這是此電腦、此瀏覽器與測試視窗的結果，不能推論所有手機都有同等幀率。手機測試為桌面 Chrome 的 viewport / DPR / touch 模擬，尚未使用實體 iOS / Android 裝置，也未驗證 Safari / Firefox。

## 截圖

| 場景 | 桌面                                        | 手機                              |
| ---- | ------------------------------------------- | --------------------------------- |
| 海岸 | [desktop-coast.png](qa/desktop-coast.png)   | [390-coast.png](qa/390-coast.png) |
| 海底 | [desktop-reef.png](qa/desktop-reef.png)     | [390-reef.png](qa/390-reef.png)   |
| 雲層 | [desktop-clouds.png](qa/desktop-clouds.png) | —                                 |
| 高空 | [desktop-sky.png](qa/desktop-sky.png)       | —                                 |

前端視覺檢查亦在 1440 / 768 / 390px 取得截圖，沒有量測到 overflow 或 Console 錯誤。一般行銷網站檢查器對「至少多張照片、影片、DOM 動畫」的要求，與本案即時 3D 約束不同，已明確排除；中性對比 scrim 亦保留。數字高度使用展示字體及單位用正文字體，不是混合字體標題。

## 畫質及實作邊界

這是風格化、低多邊形原型，並非電影寫實畫質。折射、平面反射、光束及焦散為即時近似；海龜沒有骨骼動畫；沒有 4K PBR / 掃描地形 / 物理海洋模擬。海底約 24 公尺，屬珊瑚海視覺場景。沒有將照片或預錄影片當作三幕背景。

公開部署的驗證結果會另存 `docs/qa-public/`，並以 GitHub Actions 成功狀態與公開網址的實際渲染為準。
