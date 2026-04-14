# Spine AI 网格逻辑梳理（全量）

## 1. 现状总览

Spine AI 的网格能力目前由两条线组成：

- 主运行链路（已接入）
  - UI 入口：`SetupPanel.vue` 中骨骼图片属性区域挂载 `MeshSection.vue`
  - 生成：`MeshGeneratorDialog.vue` 调 `MeshGenerator.generateFromImage(...)`
  - 存储：直接写入 `appStore.project.meshes[assetId]`
  - 画布渲染/编辑：`CanvasPanel.vue` 读取 `project.meshes`，进行顶点拖拽、权重涂抹、线框/热力显示

- 工具/架构链路（大多未接入）
  - `meshStore.js`、`MeshPanel.vue`、`meshEditor.js`、`weightEditor.js`
  - `spineJSON.js`、`meshDataManager.js`
  - `meshDeformer.js`、`spineMesh.js`、`meshFFDSystem.js`、`meshAnimationSystem.js`

结论：当前线上可用逻辑集中在 `MeshSection + MeshGeneratorDialog + MeshGenerator + CanvasPanel`，其余模块主要是预研或历史代码。

---

## 2. 网格数据模型（运行时）

`MeshSection.createEmptyMesh()` 与生成确认逻辑定义了当前网格对象结构：

- `type: 'mesh'`
- `name`: `mesh_${imageId}`
- `path`: `imageId`
- `vertices`: `[x0, y0, x1, y1, ...]`（当前实现为“以图片中心为原点”的局部坐标）
- `uvs`: `[u0, v0, u1, v1, ...]`
- `triangles`: `[i0, i1, i2, ...]`
- `bones`: `[boneId0, boneId1, ...]`
- `weights`: Spine 风格扁平数组（见第 6 节）
- `hull`, `edges`, `worldVertices`
- `generatorParams`

存储位置：`appStore.project.meshes`（不是独立 Pinia mesh store）。
UI 状态使用：`appStore.project.ui`，关键字段包括：

- `selectedMeshId`
- `meshEditMode` (`none|vertex|weight`)
- `selectedVertices`
- `showMeshWireframe`
- `showWeightHeatmap`
- `selectedWeightBoneId`（由画布逻辑读取）

---

## 3. 入口与选择逻辑

### 3.1 SetupPanel 入口

`SetupPanel.vue` 中，当选中某骨骼绑定图片（`selectedType === 'bone-asset'`）时，展示：

- `<MeshSection :imageId="selectedBoneAsset.assetId" />`

`selectBoneAsset(...)` 会在存在网格时设置：

- `project.ui.selectedMeshId = entry.assetId`

### 3.2 MeshSection 行为

`MeshSection.vue` 负责网格开关、生成对话框、基础信息与编辑模式切换：

- 启用网格：若无则创建空 mesh；自动选中当前图片的 mesh id
- 首次启用且未生成顶点/三角形时，自动打开生成对话框
- `applyGeneratedMesh(payload)`：把生成结果写入 `project.meshes[imageId]`
- 清除网格：删除 `project.meshes[imageId]`，并清理 UI 选择状态

---

## 4. 网格生成算法链路

生成入口：`MeshGeneratorDialog.generatePreview()`

1. 加载图片 `dataUrl`
2. 构造 `new MeshGenerator({...params, maxBonesPerVertex: 4, maxImageSize: 420})`
3. 调 `generateFromImage(image, bones, params)`
4. 生成预览并可确认写入工程

### 4.1 参数语义（UI -> 生成器）

- `detail`：轮廓采样目标点数与内部点数量密度
- `concavity`：影响 RDP 简化 epsilon（越高越保留凹凸）
- `refinement`：内部点 relax 迭代强度
- `uniformity`：内部点最小间距
- `alphaThreshold`：透明度阈值
- `fill`：是否生成内部点，仅边界或边界+内部

### 4.2 MeshGenerator 核心步骤

`meshGenerator.js` 的 `generateFromImage(...)`：

1. 缩放输入图到工作画布（`maxImageSize`）
2. `MarchingSquares.extract(imageData)` 提取轮廓
3. 取最大面积轮廓 `pickMainContour`
4. `buildContour`：RDP 简化 + 重采样 + 逆时针矫正
5. 可选生成内部点 + relax
6. `Delaunay.triangulate(allPoints, contourIndices)`
7. `filterTriangles`：保留质心在轮廓内且面积足够的三角形
8. 若失败回退 `buildFanTriangles`
9. 反算 source 坐标、计算 UV
10. `calculateWeights`：按骨骼距离反比归一化
11. 输出 mesh（`vertices` 转为相对图片中心）

---

## 5. 画布渲染与编辑链路

主文件：`CanvasPanel.vue`

### 5.1 当前网格选择

- 优先 `project.ui.selectedMeshId`
- 其次 `project.ui.selectedImageId`
- 再次 `project.meshes` 第一项

### 5.2 顶点世界坐标变换

`renderedMeshVertices` 使用 `applyMeshAttachmentTransform(vx, vy)`：

- 取当前 mesh 对应的 asset node（骨骼+图片绑定）
- 组合骨骼旋转、图片绑定旋转、缩放
- 再加骨骼世界位置与画布中心偏移

### 5.3 绘制层

- 线框：`renderedMeshTriangles` -> SVG path
- 权重热图：`weightHeatmapTriangles`，按三角形三顶点权重均值着色
- 顶点点位：`renderedMeshVertices`

### 5.4 编辑交互

- 顶点模式（`meshEditMode='vertex'`）
  - 点击选点
  - 拖拽更新 `mesh.vertices`

- 权重模式（`meshEditMode='weight'`）
  - 鼠标按下/移动触发 `paintWeightAtPoint`
  - 使用半径笔刷，命中顶点后提升目标骨骼权重
  - 每顶点上限 4 骨骼影响
  - 每次修改后顶点内归一化，再写回扁平 `weights`

---

## 6. 权重编码格式（当前实现）

使用 Spine 常见扁平块格式，逐顶点串联：

- `weights = [boneCount, boneIdx0, weight0, boneIdx1, weight1, ... , boneCount_next, ...]`

读取示例：`CanvasPanel.getVertexWeight(vertexIdx, boneIdx)`

- 先跳过前 `vertexIdx` 个顶点块
- 再遍历目标顶点的 `boneCount` 对 `(boneIdx, weight)`

改写示例：

- `parseWeightBlocks(weights, vertexCount)` -> `[{boneIdx, weight}[]]`
- 编辑后 `flattenWeightBlocks(blocks)` 回扁平数组

---

## 7. 导入导出相关逻辑

### 7.1 当前主导出路径

`appStore.exportProjectText()` 走 `buildSpineExport(project)`。

注意：`app.js` 中未处理 `project.meshes`，当前导出主链路主要面向骨骼+region/基础动画，不包含网格 attachment 细节。

### 7.2 备用导入导出实现（未接入）

- `utils/spineJSON.js`
  - 能导出/导入 mesh attachments 与 deform 动画结构
  - 但未被 `App.vue/Editor.vue` 主流程调用

- `utils/meshDataManager.js`
  - 维护 `Map` 形式 mesh 并导出 Spine JSON
  - 同样未接入主流程

---

## 8. 未接入/风险点清单

1. `MeshPanel.vue` 未在项目中引用（`rg "MeshPanel" src` 无有效挂载）。
2. `meshStore.js` 定义了很多 action，但 `stores/index.js` 仅导出 `useAppStore`。
3. `appStore` 没有 `setMeshPreview/selectMesh/generateMesh/...`，因此 `MeshPanel.vue` 当前不可运行。
4. `app.js` 默认工程结构不含 `meshes` 字段，依赖组件运行时补齐。
5. `buildSpineExport` 不处理 mesh 数据，网格可能无法随“主导出”落盘。
6. `meshAnimationSystem.js` 存在明显问题：普通方法里直接 `await import`（语法错误风险）；且整体未接入。
7. `weightEditor.js`、`meshEditor.js` 与 `CanvasPanel` 实现存在重叠，当前是“双轨逻辑”，维护成本高。

---

## 9. 推荐收敛方向（工程化）

1. 明确唯一主链路：`project.meshes + CanvasPanel` 或 `meshStore` 二选一。
2. 将 `meshes` 正式纳入 `defaultProject/ensureSpineProject`，避免运行时隐式补字段。
3. 统一权重编辑实现（保留一套：`CanvasPanel` 内联或 `weightEditor.js`）。
4. 把 mesh 纳入 `appStore.exportProjectText` 的正式导出逻辑。
5. 清理未接入模块，或补完整接线与测试。

