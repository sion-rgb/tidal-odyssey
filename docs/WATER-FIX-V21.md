# v2.1 開場與海面穿越修正

本輪只處理使用者指出的開場不自然、過水缺乏水花，以及反射不明顯。v2 證據保留在 VERIFICATION-V2.md。

## 修正

- 開場原鏡頭離解析沙面僅約 0.93 m；提高前三個鏡頭節點，並將既有地形頂點集中在行走海岸。用實際渲染網格向下射線、包含相機周圍 0.35 m 的九點範圍，桌面／手機初段五個位置的最低淨空為 **1.764 m**。
- 兩組近岸掃描岸石向內陸移動、縮小，按完整底部範圍取地形支撐高度並略為埋入沙面，修正只按中心點放置而邊緣懸空的問題。
- CPU、GPU 水面位移、法線與水花共用波浪參數；水面細分區跟隨相機，避免離開世界原點後近鏡網格變疏。
- 真正跨過當下波面才觸發泡沫圈／薄膜、水下氣泡、彈道噴濺、局部鏡頭折射水滴與短暫視角變化。水滴會滑落、衰減，不以淡出背景代替過水。反向遊覽同樣適用。
- 水花獨立於反射／折射 capture 繪製；調整泡沫圈半徑及高度，修正首次實作時近鏡大片多邊形遮罩，並新增水下入水畫面上方亮面佔比回歸檢查。
- 出水路徑加快上升；較低角度的日光可在視線內形成高光光帶，海島倒影採真實平面反射，仍隨視角與波面改變。水下 Snell 視窗取樣空氣天空。
- 撞水聲只在使用者已啟用音訊時播放；沒有使用者手勢時不建立 AudioContext。離開水面帶前不重複觸發，暫停時波浪浮動不會產生噴濺。減少動態模式不啟用視角脈衝。

## 已執行驗證

- npm test：**7 項通過**，包含新加入的雙向實際交會、交會位置內插、靜止波浪、跳躍 seek、防重複觸發及初段眼高。
- npm run build：TypeScript／Vite 正式打包通過。
- 本地開發版 [過水專項測試](water-v21-final/results.json)：**28 項通過**，包括桌面／390px 手機、十個實際網格淨空取樣、正向入水／出水、反向入水、音訊限制、粒子上限及兩個畫面回歸檢查。
- 在同一個凍結場景切換反射貢獻，直接比較海島倒影所在水面區域；每 RGB channel 平均差 **70.56 / 255**。[有反射](water-v21-final/reflection-on.png)／[無反射](water-v21-final/reflection-off.png)，不是只檢查「有設定 Water」。
- 人工檢視入水、噴濺及離水後水滴的連續截圖；自動像素檢查確認完全入水後沒有不自然的大片亮色多邊形。
- 本地專項測試 errors 0；保留原有 ANGLE X4122 精度 warning，沒有聲稱完全零警告。

## 可重跑

```sh
npm ci
npm run dev
# 另開終端：QA_URL=http://127.0.0.1:5173/ npm run qa:water
npm test
npm run build
npm run preview
# 指定 production preview 或公開站作 QA_URL 後執行 npm run qa／qa:water
```

Windows PowerShell 可用 $env:QA_URL 設網址、$env:QA_OUT 指定新證據目錄。預設 qa:water 連接 4173；只有開發版提供實際網格射線與反射 A/B 的測試入口，production 沒有可改場景的入口。

## 成本及限制

新增兩個可重用 GPU 物件（泡沫薄膜、粒子），桌面／手機池為 180／84 點；不逐幀建立材質或貼圖。水花排除於反射／折射 pass，薄膜和噴濺只繪製在主畫面。沿用原有自動畫質與資源釋放；渲染整體仍有 v2 記錄的幾何／高空 draw calls 超起始預算問題。

這是即時的程序化泡沫、粒子、折射與合成聲，並非流體模擬或高速攝影素材。手機測試是 Chrome 尺寸／DPR／觸控模擬，尚未測實體 iOS／Android 或 Safari。

## 正式版本與公開部署

本地 production preview [30 項回歸通過](qa-v21/results.json)，包括三幕、兩次海平面穿越、音訊手勢、播放／暫停／反向、畫質、視窗縮放、390／320px 觸控與 reduced-motion。Console errors 0、失敗 HTTP 素材請求 0；ANGLE 精度 warning 1。

本地專項過水取樣：桌面入水 127 calls／826,135 triangles、出水 52 calls／465,197 triangles；手機模擬入水 118／490,663、出水 46／217,813。測試機為 RTX 2070 SUPER，取樣約 69–75 fps；不是實體手機效能保證。初始三幕全景仍有先前記錄的超預算問題。

程式版本 `996dd2cb08ff41990aad8fcc1545633ffb7020be` 已由 [GitHub Actions 39260676610](https://github.com/sion-rgb/tidal-odyssey/actions/runs/39260676610) 成功部署至 [公開站](https://sion-rgb.github.io/tidal-odyssey/)。[部署核對記錄](deployment-receipt-v21.json) 逐一下載正式站的 27 個檔案（7,213,884 bytes），全部 SHA-256 與本地正式打包相同。

- 公開站 [32 項完整回歸通過](qa-public-v21/results.json)，包含完整 100 秒自動旅程、三幕連續性、正反向控制、音訊手勢及五種視窗尺寸。Console errors 0、失敗 HTTP 素材請求 0；仍有一項 ANGLE X4122 精度 warning。
- 公開站 [17 項過水專項通過](water-v21-public/results.json)，包含桌面／手機的正向入水、出水噴濺、水滴、反向入水、暫停防重複觸發及音訊限制。Console errors 0；同一類 ANGLE 精度 warning 1。開發版專用的網格射線和反射 A/B 入口不包含在正式版，因此正式版檢查數不同。
- 公開站實際截圖：[開場與反射](qa-public-v21/desktop-coast.png)、[入水氣泡](water-v21-public/desktop-entry-1.png)、[出水噴濺與水滴](water-v21-public/desktop-exit-1.png)、[手機出水](water-v21-public/mobile-exit-1.png)。

以上瀏覽器測試及截圖來自桌面 Chrome；手機項目為視窗／DPR／觸控模擬，並非實體手機驗證。
