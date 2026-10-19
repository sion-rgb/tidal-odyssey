# PELAGIC · 潮汐之境

從熱帶白沙灘，潛入珊瑚海，再衝破海面、穿越雲層，俯瞰海島。以 **Three.js + Vite + TypeScript + GSAP** 製作的連續即時 3D 互動網站。

**[開啟網站](https://sion-rgb.github.io/tidal-odyssey/)**

這是可運行的風格化原型。椰樹、海龜採合法授權的低多邊形 GLB；其餘景物以程序化幾何與 GLSL 製作，並非掃描級 PBR 環境或已達電影寫實品質。左上角標誌已依要求移除。

## 安裝與運行

建議 Node.js 24 LTS、npm、新版支援 WebGL 2 的瀏覽器。無需 API Key、帳號或付費素材。

```sh
npm ci
npm run dev
```

開啟終端機顯示的本地網址。正式版本：

```sh
npm test
npm run build
npm run preview
```

`dist/` 可上傳任何靜態網站主機。Vite 使用相對 `base: './'`，支援 GitHub Pages 的子目錄。請使用 HTTP 伺服器，不能直接雙擊 `index.html`。

## 操作

| 操作                            | 效果                                |
| ------------------------------- | ----------------------------------- |
| 滑鼠滾輪 / 手指上下滑動         | 沿同一條路徑前進、返回              |
| 開始遠征 / 播放鍵 / 空白鍵      | 播放或暫停約 100 秒自動遊覽         |
| 反向按鈕 / R                    | 改變自動遊覽方向                    |
| 方向鍵                          | 小幅前進 / 後退                     |
| Home / End                      | 沿路徑前往起點 / 終點               |
| 章節名稱                        | 平滑前往沙灘、海底、雲層            |
| 拖曳進度列                      | 自行控制旅程                        |
| 開啟聲音                        | 使用者明確點擊後建立 Web Audio 音場 |
| 自動畫質 / 高畫質 / 均衡 / 省電 | 控制內部渲染解析度                  |
| ? / 關於旅程                    | 操作、素材與原型說明                |

所有按鈕有鍵盤焦點；進度列有可讀取的章節、百分比；載入進度與通知支援螢幕閱讀器。`prefers-reduced-motion` 模式預設暫停，環境動畫減速。分頁進入背景會暫停攝影機、渲染與音訊，回到前景再恢復。

## 渲染與海面穿越

- 三幕共用 **一個 Scene、一部攝影機、一個 WebGLRenderer 和同一頁面**；過場沒有換頁、切背景圖或整幕淡入淡出。
- GSAP 驅動連續進度，對一條 centripetal Catmull–Rom 位置曲線和注視曲線取樣。正向、反向、觸控與滾動皆沿同一條曲線。
- `Water` 提供平面反射；新增 GLSL 波面位移、折射 render target、Fresnel 反射、依水深的 RGB 吸收和近岸浪沫。CPU 使用相同波函數估計攝影機相對海面的高度。
- 相對波面高度以平滑函數驅動水底霧密度、照明、天空散射衰減、鏡頭折射與色調。穿越水面時加上附著於實際高度的水膜擾動，兩個方向都適用。
- 海底有程序化分枝 / 腦狀 / 桌狀珊瑚、岩石、海草、InstancedMesh 魚群、上浮氣泡、幾何光束與動態焦散。
- `Sky` 產生分析式日光天空，雲層使用世界空間盒體中的程序化密度 ray marching。俯瞰時看到的島嶼仍是原場景的幾何。
- `EffectComposer` 串接場景、折射 / 水膜 / 色調、自訂邊緣平滑及 `OutputPass`。
- 音場為即時合成海浪、低頻水底音與高空風聲；濾波及音量依海面高度連續改變，不含外部錄音。

折射是螢幕空間近似，反射是分幀更新的平面近似；波浪不是流體模擬。光束不是完整體積光，海龜使用剛體游動，尚未做骨骼鰭部動畫。原型海底深約 24 公尺；不是千公尺深海地貌。沒有宣稱實體手機或 Safari 已測試。

## 修改場景與鏡頭

```text
src/
  main.ts                場景組裝、GSAP、互動、畫質與生命週期
  route.ts               WAYPOINTS、注視路徑、章節、波面 / 地形高度
  audio.ts               使用者手勢啟動的合成環境音
  effects.ts             水下鏡頭後製 Shader
  style.css              響應式介面
  world/
    ocean.ts             Water、反射 / 折射與近岸浪沫
    terrain.ts           沙灘、海床與遠方島嶼
    atmosphere.ts        Sky、日光與程序化雲層
    life.ts              GLTFLoader、椰樹、海龜、魚群
    reef.ts              延遲載入的程序化珊瑚、海草、氣泡與光束
tests/route.test.ts       路徑連續性、地形淨空、穿越與反向一致性
scripts/qa.mjs           實際 Chrome 互動 / 尺寸 / 音訊 / 全程遊覽測試
scripts/optimize-assets.mjs  可重現的模型 / 材質最佳化
```

編輯 `route.ts` 的 `WAYPOINTS` 和 `lookPoints`，即可修改鏡頭軌跡。修改時保持兩個陣列的對應順序；執行 `npm test` 檢查是否穿地、跳躍、注視點重合，或意外增加穿越次數。若調整地形或波函數，請同步更新 `ocean.ts` 中的 GLSL 公式。

## 載入、壓縮與資源

- 核心先呈現海岸；珊瑚為獨立延遲 JavaScript chunk，第一幀後預熱；海龜於進度超過 11% 時才請求。
- GLB 使用 glTF Transform 去重、焊接與 Meshopt 壓縮，搭配本機隨套件打包的 MeshoptDecoder；不依賴遠端解碼 CDN。椰樹色彩材質已轉成 WebP，最大 512px；椰樹 111,876 → 36,540 bytes，海龜 101,888 → 39,444 bytes。
- 原始素材保留在 `assets-source/` 供再處理，公開網站只打包最佳化版本。材質使用小型色彩貼圖和程序化細節；沒有假裝提供 4K PBR、KTX2 或 Draco 資產。
- 魚、海草、岩石、腦狀 / 桌狀珊瑚使用 instancing；珊瑚分枝合併幾何，避免大量 draw call。
- 手機預設較少魚群、珊瑚、氣泡及雲取樣，並關閉動態陰影。自動畫質每 120 幀量測一次，低於 38 fps 時逐步降低像素比，最低 0.65。
- 折射使用約 55% 尺寸 render target；反射使用 256 / 512 貼圖並每 4 / 2 幀更新。退出時釋放幾何、材質、貼圖、後製緩衝、音訊與 WebGL context。

重建最佳化素材：

```sh
npm run assets:optimize
```

## 驗證與發佈

啟動本地網站後：

```sh
npm run qa
```

測試需本機安裝 Chrome。`QA_QUICK=1` 可略過重複的 100 秒完整遊覽；`QA_URL` 指定本地或公開網站。測試會保存截圖、Console、GPU、實際狀態、尺寸與完整遊覽採樣到 `docs/qa/`；原始機器可讀結果見 [results.json](docs/qa/results.json)，摘要見 [VERIFICATION.md](docs/VERIFICATION.md)。桌面瀏覽器的手機尺寸 / 觸控模擬不等同實體手機測試。

GitHub Actions 會在 `main` push 後執行測試、TypeScript / Vite build，並部署 GitHub Pages。首次需在 repo Pages 設定選擇 GitHub Actions。

素材署名與第三方授權見 [CREDITS.md](CREDITS.md)。原創專案程式碼採 MIT；第三方素材與函式庫保留自己的授權。
