# 千问计划 × 千问办公：品牌资产接入清单

本产品已按《QwenWork Brand Guidelines_CN_v1.0》建立颜色、字阶、圆角、阴影、状态与按钮令牌；本文件记录正式资产的来源、接入范围和待补材料。

## 当前授权核查（2026-07-29）

- 产品负责人已明确授权“千问办公企业内部应用，尽管使用”。本次接入范围为企业内部的千问计划 Web 应用。
- 已从授权提供的 `/Users/luping/Downloads/QwenWork_ppt模版.pptx` 提取原始透明 PNG，保留比例与颜色：`qwenwork-logo-green-black.png`（浅色界面）、`qwenwork-logo-green-white.png`（深色承载面）、`qwenwork-logo-black.png`（单色备用）。素材已置于 `public/brand/`，仅用于本产品。
- 已从授权设备的 `/Library/Fonts/` 接入受控的 `Alibaba-PuHuiTi` Regular、Medium、Bold 三个 OTF 文件（文件元数据为 Version 1.00，版权为阿里巴巴（中国）有限公司），并以 `font-display: swap` 自托管到 `public/fonts/`。Noto Sans SC 继续作为加载失败时的回退。
- 品牌规范中列出的 `Alibaba PuHuiTi 3.0` 与 `Alibaba Mama ShuHeiTi` 文件尚未随素材交付；当前接入的普惠体版本用于企业内部产品。如品牌团队后续提供精确版本，可在不改动页面组件的前提下替换同一字体令牌。
- 结论：Logo 与正文/标题字体均已获内部授权并接入；不从非受控来源下载字体。

## 已落地的安全实现

- 主色：`#41D87E`；hover：`#2DD370`；深色文字：`#161616`。
- 浅色数据工作台与深色成长面板均使用同一组语义令牌；绿色主按钮始终使用深色文字，避免绿色底白字的对比度不足。
- 产品预留字体优先级：`Alibaba Mama ShuHeiTi`（展示标题）、`Alibaba PuHuiTi 3.0`（正文），未交付时由已加载的 `Noto Sans SC` 和系统字体接管。
- 3D 图形只用于空状态、成功状态和成长卡，且当前素材为无文字、无 Logo 的抽象产品装饰；不得把它当作品牌标识。

## 需要品牌团队提供并书面确认

| 项目 | 需要的交付物 | 使用位置 | 当前状态 |
| --- | --- | --- | --- |
| 标准 Logo | 已交付透明 PNG：浅色、深色与单色版本；如有 SVG 可无损替换 | 登录、产品头部、分享卡 | 已接入，限企业内部使用 |
| 中文字体 | Alibaba PuHuiTi Regular、Medium、Bold 的受控 OTF；精确的 3.0 / 妈妈数黑体可后续替换 | 标题、正文、数字 | 已接入，保留 Noto Sans SC 回退 |
| 3D Logo | 深色场景的官方文件、使用范围和导出规格 | 仅品牌允许的封面/传播场景 | 待确认，不在产品中仿制 |
| 色彩审批 | 正式 sRGB/Display P3 值、深浅色可访问性例外 | 令牌库与外部传播物 | 参考规范已建，待品牌签收 |

## 接入验收

1. Logo 已按授权素材接入；如后续交付 SVG，可同名替换为无损版本。
2. 当前普惠体已加入受控静态资源；后续如交付规范中的精确字体版本，保持字体族令牌不变地替换文件，并保留 Noto Sans SC 回退。
3. 不拉伸、不描边、不改色、不与其他元素组合成新 Logo；产品名称以分隔文案方式呈现，不改写 Logo 本身。
4. 使用 [design-qa-checklist.md](./design-qa-checklist.md) 完成桌面、移动端、键盘和对比度复验。
