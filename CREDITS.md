# 素材與第三方授權

## v2 場景實際使用的素材

Poly Haven 素材採 [CC0 1.0](https://polyhaven.com/license)，下載日期 2026-10-19。署名、來源檔案 URL、MD5 與處理記錄亦保留在 [pbr-provenance.json](assets-source/pbr-provenance.json)。

| 素材                                                       | 作者                           | 用途及修改                                                                   |
| ---------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| [Aerial Beach 02](https://polyhaven.com/a/aerial_beach_02) | Rob Tuytel                     | 沙的 diffuse／OpenGL normal／roughness／AO，WebP 1K，沙色校準與濕岸 Shader   |
| [Palm Tree Bark](https://polyhaven.com/a/palm_tree_bark)   | Dimitrios Savva、Rico Cilliers | 樹皮四種 PBR 貼圖，WebP 1K                                                   |
| [Coral Gravel](https://polyhaven.com/a/coral_gravel)       | Rob Tuytel                     | 礁石四種 PBR 貼圖；活珊瑚使用原創色彩及微細法線                              |
| [Coast Rocks 02](https://polyhaven.com/a/coast_rocks_02)   | Rob Tuytel、Rico Cilliers      | 攝影測量模型，簡化至約 15,121 三角形、WebP 1K、Meshopt，縮放配置於岸邊及水下 |
| [Kiara 5 Noon](https://polyhaven.com/a/kiara_5_noon)       | Poly Haven，作者詳見來源頁     | 1K HDR 經 PMREM 作環境照明，沒有作背景圖片                                   |

### 本作原創模型與程序化場景

`scripts/build-organic-models.mjs` 可重建細葉棕櫚、簡化 LOD、森林輪廓及分件海龜 GLB；採本專案 MIT 授權。椰樹葉片／樹幹／葉軸、海龜甲片／頭部／眼睛／四鰭均由幾何建立，並非掃描或 AI 生成的高保真模型。海龜鰭部以分件 pivot 活動，沒有骨骼。魚、珊瑚、海草、地形、焦散、雲與合成音景亦為本作製作。

沒有 Tripo／Gemini／ElevenLabs 生成憑證，未使用或宣稱生成服務已產出資產。未將 API key 或外部 provider 臨時網址放入網站。

v2.1 的泡沫環、氣泡／水滴粒子、鏡頭折射水滴及撞水聲同樣為本作程序化製作，沒有新增外部素材或使用預錄過水影片。

## v1 歷史素材（保留，v2 場景已不使用）

### 舊版椰樹

- **Palm Tree** — Quaternius
- 來源：https://poly.pizza/m/P0tgwyXBgr
- 授權：[CC0 1.0 / Public Domain](https://creativecommons.org/publicdomain/zero/1.0/)
- 原始下載：https://static.poly.pizza/66cd7d94-abba-471e-8d8b-c8ad30aa5c70.glb
- 修改：去重、焊接、量化、Meshopt 壓縮與色彩材質 WebP 壓縮；場景內縮放、定位及整體搖擺。這是低多邊形模型。

### 舊版海龜

**“Turtle” by Poly by Google**, licensed under **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**.

- 作者及作品：https://poly.pizza/m/fklSEvGm1Q8
- 授權全文：https://creativecommons.org/licenses/by/3.0/
- 原始下載：https://static.poly.pizza/7c64cc2c-b9aa-4edd-bc32-9e95d66ca5e0.glb
- 修改：去重、焊接、量化、Meshopt 壓縮；縮放、置中及整體移動。未宣稱原作者為本專案背書。
- 保留作者署名與來源連結。此歷史海龜是低多邊形、未綁骨的模型；原始檔案仍保留於 assets-source，已被本作原創海龜取代。

## 程式及字體

- Three.js 與其 Water / Sky / GLTFLoader / EffectComposer addons：MIT，https://github.com/mrdoob/three.js
- GSAP：Standard No Charge License，https://gsap.com/standard-license/ （不是 MIT）。
- Vite、TypeScript、glTF Transform、Meshoptimizer、Sharp、Playwright：各套件保留自身授權，參見 lockfile 與對應 npm 套件。
- Albert Sans、Imbue：Google Fonts / SIL Open Font License；目前從 Google Fonts 載入，無網路時使用本機字體。字體請求不影響 3D 場景及操作。
- 網站其他幾何、GLSL、水紋、音景與介面為此專案程序化製作，沒有使用背景照片或預錄場景影片。

檢索及下載日期：2026-10-19。後續替換模型時，請同步維護本檔案與網站內的署名。
