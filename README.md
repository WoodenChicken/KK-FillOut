# 智能填表助手 KK-FillOut

**本地简历库 + 网页表单自动填充** 的 Chrome/Edge 浏览器扩展（Manifest V3）。

核心原则：**数据 100% 本地存储、不上云、不收集简历内容**。插件只做字段识别与 DOM 填充，不做招聘推荐，代码中不存在任何远程请求。

```
FillOut/
├─ extension/                 # 插件本体（Chrome「加载已解压的扩展程序」直接指向这里）
    ├─ manifest.json           # MV3 配置：快捷键 Ctrl+Shift+B、Side Panel、内容脚本
    ├─ background/
    │  └─ service-worker.js    # 快捷键/工具栏/右键菜单/SPA路由通知/SidePanel/样本IndexedDB/按需注入TFJS
    ├─ content/
    │  ├─ content.js           # 总控：装载简历→适配器→扫描→匹配→填充→悬浮球（含聚焦追踪+手动填写）
    │  ├─ scanner.js           # DOM 扫描：input/textarea/select/radio/checkbox/contenteditable + 标签提取
    │  ├─ matcher.js           # 打分引擎：同义词词典→特异度仲裁→类型提示→组上下文→ML融合→分档
    │  ├─ filler.js            # 填充引擎：原生setter(React/Vue兼容)/select匹配/日期格式化/级联/撤销
    │  ├─ highlight.js         # 命中描边+编号角标（默认关闭，设置页可开启）
    │  ├─ floatball.js         # 「填表小精灵」悬浮球：全字段列表+每行「填写」按钮（填入当前聚焦输入框）
    │  └─ adapters.js          # 站点适配器：北森/智联/Moka/BOSS/Phoenix + data-field-name 直查表
    ├─ panel/                  # Side Panel 简历编辑器（分组表单/导入导出/JSON直编/设置/隐私）
    ├─ parser/
    │  ├─ parse.js             # 入口：按扩展名分发；pdf.js 文本层提取（按 y 聚类成行）
    │  ├─ docx.js              # 零依赖 ZIP 解析 + DecompressionStream 解压 word/document.xml
    │  └─ extractor.js         # 文本→字段：分节标题 + 正则抽取（教育/实习/工作/项目/家庭/证书/荣誉/技能）
    ├─ ml/tf-bridge.js         # TFJS 推理桥（注入页面 ISOLATED 世界，CPU 后端，离线）
    ├─ models/                 # 预训练模型（67 类字段分类器，weights ~0.9MB，可再训练替换）
    ├─ utils/                  # schema.js（标准字段 Schema）+ regions.js（GB/T 2260 省市数据）
    └─ vendor/                 # 离线库：pdf.js 3.11 / TensorFlow.js 3.18

```

## 安装（开发者模式）

1. 打开 `chrome://extensions`（Edge：`edge://extensions`）
2. 右上角开启 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择 `extension/` 目录
4. 打开任意招聘网站，按 **Ctrl+Shift+B**（Mac：`Cmd+Shift+B`）唤起悬浮球；也可点工具栏图标或右键菜单

> 首次使用：点悬浮球「✎ 编辑简历」→「导入 / 导出」拖入简历文件（PDF/DOC/DOCX/JSON/MD/TXT），10 秒内完成本地解析，或直接手动填写/编辑 JSON。

## 使用流程

1. **录入简历**：Side Panel 里拖入文件自动解析（三种录入方式：文件解析 / 表单编辑 / JSON 直编），所有改动自动保存到 `chrome.storage.local`
2. **打开投递页**：按 `Ctrl+Shift+B` 唤起悬浮球 —— 网申页面保持干净，**不会出现任何角标图标**
3. **手动逐项填写（主交互）**：展开悬浮球面板后列出**全部标准字段**（含多段经历的每一条），每行右侧有「填写」按钮 —— 先点击网页上要填的输入框，再点字段右侧「填写」，该字段的值即填入当前聚焦的输入框；填错了可用「↩ 清空」一键还原
4. **一键填充**：点「⚡ 一键填充」批量写入本页识别到的高置信度字段（≥0.85）；面板里带「本页 / 待确认」标记的行也可以直接点行填入对应控件
5. **特殊控件**：下拉按文本/value 双重匹配（匹配不到选最接近项并提示）；日期自动按站点习惯格式化（`YYYY-MM` ↔ `YYYY年MM月`）；聚焦省/市级联下拉再点「填写」会整组逐级点选（市的选项异步加载会自动重试）；富文本 contenteditable 按语义段落写入
6. **分步表单**（北森/Moka）：`webNavigation` + `MutationObserver` 监听路由与 DOM 变化，每步自动重扫，面板随时可用

## 置信度分档（一键填充用）

| 置信度 | 行为 | 角标颜色（若开启） |
|---|---|---|
| ≥ 0.85 | 一键填充直接写入 | 绿色 |
| 0.5 ~ 0.85 | 点行确认后填入 | 橙色 |
| < 0.5 | 只标记不填 | 灰色 |

页面上默认**不显示**任何角标（可在 Side Panel「设置 → 网页上显示命中高亮与编号角标」重新开启）。每次「确认/修正」都会存一条训练样本到扩展自己的 IndexedDB（不经过页面域存储），可在「设置」页导出 JSONL 用于再训练。

## 模型再训练（可选，全离线）

插件已内置一个用合成语料预训练的 67 类字段分类器（multi-hot char-bigram + 控件类型 → Dense(128) → softmax）。想用真实样本提升命中率：

```bash
cd ml/train
npm install
# 把 Panel「设置」页导出的 fillout-samples.jsonl 放到本目录（可选）
npm run train
# 产出 extension/models/{model.json, weights.bin, meta.json}，重载扩展即生效
```

- 模型 < 2MB，CPU 推理单控件毫秒级；`models/model.json` 不存在时引擎自动退回纯规则打分
- TFJS + 推理桥由后台按需注入页面 ISOLATED 世界，词表/模型全部走 `web_accessible_resources` 本地文件，零远程请求

## 新增站点适配器

通用引擎覆盖绝大多数表单；站点差异写在 `extension/content/adapters.js`：

```js
{
  id: 'my-ats',
  match: (url) => /my-ats\.com/.test(url),          // match(url) -> bool
  getFields: () => [{ dataKey: 'data-field-name' }], // 站点私有字段标记
  resolveKey: (ctrl) => '',                           // 控件 -> 标准 key 强映射
  fillField: (ctrl, value) => undefined,              // 自定义日期弹窗等特殊控件（返回 undefined 走通用引擎）
  transformValue: (key, value, signalText) => value,  // 语义变换（如英文姓名 first/last 拆分）
  expandAddButtons: () => 0                           // 自动展开「添加教育经历」等折叠块
}
```

## 隐私与安全设计

- 简历内容仅存 `chrome.storage.local`；训练样本存扩展域 IndexedDB（`fillout-local`）
- 全代码 **无 fetch/XHR 外发**（唯一 fetch 是本地 `chrome-extension://` 模型文件探测），CSP 为 MV3 默认严格策略，无远程代码
- Side Panel 提供「🗑 清除全部本地数据」（storage + IndexedDB 一键清空），卸载前建议先执行
- 悬浮球/角标渲染在页面根节点的 Closed Shadow DOM 中，不污染站点样式，Esc 可关闭

## 其他说明

- 扫描型 PDF（无文本层）会提示走 OCR（可粘贴文本到 .txt 导入）
- `.doc` 老格式为 best-effort 提取，建议另存 `.docx`/`.pdf`
- 区县级联数据目前覆盖四个直辖市，其余省份按同格式在 `utils/regions.js` 扩充
- BOSS 直聘网页端简历投递入口有限（App 为主），适配器对 web 聊天式 contenteditable 生效
