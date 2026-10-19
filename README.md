# PELAGIC · 潮汐之境

從白沙灘潛入珊瑚海，再衝出海面、穿過雲層，俯瞰海島。**Three.js + Vite + TypeScript + GSAP** 驅動的一鏡到底互動網站。

**[公開網站](https://sion-rgb.github.io/tidal-odyssey/)** · [素材與授權](CREDITS.md) · [v2 驗證記錄](docs/VERIFICATION-V2.md)

v2 加入 CC0 PBR 貼圖、岸石攝影測量模型、HDR 環境照明、動態陰影、深度折射、光束散射，以及細葉椰樹和可活動鰭部的海龜。這是風格化即時 3D；程序化動植物並非掃描模型，尚未達電影寫實品質。左上角沒有 logo。

## 安裝與運行

建議 Node.js 24 LTS、npm、支援 WebGL 2 的新版瀏覽器。運行無需 API key、帳號或付費素材。

```sh
npm ci
npm run dev
```

正式版本：

```sh
npm test
npm run build
npm run preview
```

開啟終端機顯示的網址；請透過 HTTP 使用。Vite 使用相對 base，dist/ 可部署 GitHub Pages 子目錄或其他靜態主機。

## 操作

| 操作                         | 效果                            |
| ---------------------------- | ------------------------------- |
| 滾輪／手指上下滑動           | 沿原路徑前進或返回              |
| 開始遠征／播放鍵／空白鍵     | 播放、暫停 100 秒自動遊覽       |
| 反向鍵／R                    | 反向自動遊覽                    |
| 方向鍵、Home／End            | 小幅移動、前往起點／終點        |
| 章節按鈕／進度列             | 平滑前往指定位置                |
| 開啟聲音                     | 明確點擊後才建立 Web Audio 音場 |
| 自動畫質／高畫質／均衡／省電 | 調整內部像素比                  |
| ?／關於旅程                  | 操作及素材說明                  |

鍵盤焦點、進度列讀值、載入通知與 reduced-motion 均有處理。減少動態時預設暫停並減慢環境動畫；背景分頁暫停渲染、路徑與音訊。

## 同一個世界如何穿越海面

- 三幕始終共用一個 Scene、攝影機和 WebGLRenderer，沒有換頁或背景圖過場。GSAP 控制連續進度，取樣位置及注視 Catmull–Rom 曲線。
- Water addon 提供平面反射。GLSL 波面與 CPU 波函數一致，攝影機實際經過波面；場景 render target 和 DepthTexture 提供折射及水路徑長度，以 Beer 吸收、Fresnel、浪沫與陽光高光表現水面。
- 相對波面高度連續控制霧、照明、水膜擾動、天空與音訊濾波。水下後製包含深度 AO、世界座標光束取樣與陰影遮蔽、距離霧；不是全畫面淡出。
- 沙、樹皮與礁石使用色彩／OpenGL normal／roughness／AO 四種 PBR 貼圖；PMREM 處理 HDR 環境照明。HDR 只供照明，背景始終為即時 Sky。
- 動植物包括細葉椰樹、龜甲分片與活動鰭、三群魚、分枝／桌狀／腦狀珊瑚、管海綿、海草、氣泡和焦散。岸石為攝影測量掃描。
- 世界空間 ray marching 體積雲採 3D noise texture；鏡頭實際穿過約 95 m 高的雲層，最後到達 260 m。俯瞰的海島與植被仍為幾何。
- Web Audio 即時合成海浪、水下低頻及高空風聲，沒有外部錄音。

限制：平面反射與螢幕空間折射是近似，沒有光線追蹤、流體模擬或完整多重散射。AO 為深度取樣近似。海龜採分件活動鰭，沒有骨骼或動作捕捉。海床約 24 m，屬珊瑚海域，未建造千米深淵。程序化雲及動植物仍有風格化外觀。

## 結構與修改

```text
src/
  main.ts                  場景組裝、互動、GSAP、載入、畫質、生命週期
  route.ts                 WAYPOINTS、lookPoints、地形／波面高度
  audio.ts                 手勢啟動的合成環境音
  effects.ts               深度 AO、散射、距離霧、水膜後製
  style.css                響應式介面
  world/
    materials.ts           PBR、PMREM、葉片／微細表面 Shader
    ocean.ts               Water、深度折射、反射、波面、浪沫
    terrain.ts             沙灘、海床、掃描岸石、遠島
    atmosphere.ts          Sky 與體積雲
    life.ts                GLTFLoader、椰樹 LOD、魚、活動海龜
    reef.ts                延遲載入的珊瑚、海草、粒子
scripts/
  build-organic-models.mjs  可重建的原創植物／海龜 GLB
  fetch-pbr.mjs            合法素材下載、校驗、壓縮
  qa.mjs                   Chrome 互動、完整遊覽、尺寸、動畫截圖
tests/route.test.ts         連續性、淨空、穿越、反向一致性
```

修改 route.ts 的 WAYPOINTS 與 lookPoints 後執行 npm test。修改波函數須同步 ocean.ts GLSL；遠島形狀須共用 distantIslandHeight，避免植被懸空。

## 載入與 GPU 資源

- 先載入海岸、PBR 與環境光；珊瑚是獨立 JS chunk，海岸首幀後預熱；海龜進度超過 11% 才請求。
- GLB 採 Meshopt 壓縮、本地 decoder；12 張 PBR 貼圖轉 WebP 1K，岸石簡化至約 15k 三角形並壓縮貼圖。未使用 KTX2、Draco 或 4K 材質。
- 椰樹為 20,280／4,104 三角形 LOD，遠方森林使用 168 三角形輪廓。魚、珊瑚、海草、碎石、森林採 instancing；近／遠珊瑚依距離重分配。
- 高空剔除不再可分辨的海底生物細節；主海床與同一海面一直保留。海底物件排除於水面上方反射 pass，陰影每幀只更新一次。
- 桌面／手機陰影 2048／1024，反射 1024／512、每 1／2 幀更新；折射為內部解析度約 80%／65%。手機減少物件與雲／光束取樣。
- 自動畫質每 120 幀取樣，低於 38 fps 時逐步降低像素比，最低 0.65；不能保證所有手機達 60 fps。
- 退出時釋放幾何、材質、貼圖、PMREM、render targets、音訊與 WebGL context。

素材已納入 repo，一般開發無需重建：

```sh
npm run assets:models
npm run assets:pbr
```

PBR 腳本從 Poly Haven 下載並檢查來源 MD5，快取位於專案外 ../../work/pbr-source，更新 assets-source/pbr-provenance.json 的作者、授權、URL、校驗與處理記錄。舊版低多邊形模型保留作歷史參照，已不在場景使用。

## 驗證及發佈

啟動 dev 或 production preview 後：

```sh
npm run qa
```

需本機 Chrome。QA_URL 指定網址；QA_OUT 指定證據資料夾；QA_QUICK=1 略過重複 100 秒遊覽。記錄 Console／HTTP 錯誤、GPU、renderer 指標、動畫連續截圖、桌面及手機尺寸。手機觸控模擬不等同實體裝置或 Safari 測試，數值不能視作所有硬體保證。

main push 由 GitHub Actions 執行 npm ci、test、build 及 Pages 部署。僅開發版提供可改動場景的測試入口，正式版只有唯讀診斷，沒有 debug UI 或生成 API key。

原創程式與模型採 MIT；第三方素材與函式庫保留各自授權。
