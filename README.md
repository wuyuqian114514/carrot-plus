# Carrot plus

Carrot plus 是一个用于增强 [Codeforces](https://codeforces.com/) 榜单页的浏览器插件。

它基于 [meooow25/carrot](https://github.com/meooow25/carrot) 修复和维护，主要用于在 Codeforces standings 页面显示：

- 当前/最终 performance rating
- 预测 rating delta
- 最终 rating delta
- 距离升到下一个 rank 还需要多少 delta
- 已结束比赛的 rank 变化

## 支持范围

推荐浏览器：

- Chrome
- Microsoft Edge

插件只使用 Codeforces 公开 API 和当前页面可访问的数据。它不会绕过 Codeforces 权限，也看不到封榜隐藏数据、私有 gym 数据或你的好友列表。

## 安装方式

### 方式一：直接安装 GitHub 下载包

在 GitHub 页面点击：

```text
Code -> Download ZIP
```

下载后解压，得到类似这个目录：

```text
carrot-plus-main/
```

打开浏览器扩展页面：

Chrome:

```text
chrome://extensions/
```

Edge:

```text
edge://extensions/
```

然后：

1. 打开右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」。
3. 选择这个目录：

```text
carrot-plus-main/dist/carrot-plus
```

注意：不要选择 `carrot-plus-main/`，也不要选择 `carrot-plus-main/carrot/`。Chrome 必须加载 `dist/carrot-plus`，否则会出现 `background.scripts requires manifest version of 2 or lower` 或 `browser is not defined`。

### 方式二：加载本地构建目录

如果你是从源码构建，构建完成后加载：

```text
tmp-chrome/carrot
```

### 方式三：从源码构建

需要本机有这些工具：

- `bash`
- `curl`
- `jq`
- `python3`

构建 Chrome / Edge 版本：

```bash
./build.sh -c
```

构建完成后加载：

```text
tmp-chrome/carrot
```

打包 zip：

```bash
./build.sh -c -z
```

生成文件在：

```text
release/carrot-chrome-v1.0.1.zip
```

如果没有 `rsvg-convert` 也可以构建，脚本会自动生成备用 PNG 图标。

## 使用方法

安装后打开 Codeforces 比赛榜单页，例如：

```text
https://codeforces.com/contest/2222/standings
```

插件会自动在 standings 表格右侧添加列。

常见列含义：

- `Π`：performance rating，即这场表现大约对应的 rating。
- `Δ`：rating delta，正数表示预计涨分，负数表示预计掉分。
- 右侧箭头列：距离升到下一个 Codeforces rank 还需要的 delta，或最终 rank 变化。

进行中的比赛会显示预测值；已结束且 rating changes 已发布的比赛会显示最终值。

## 数据来源和限制

插件使用这些 Codeforces API：

- `contest.list`
- `contest.standings`
- `contest.status`
- `contest.hacks`
- `contest.ratingChanges`
- `user.ratedList`

如果 `contest.standings` 因 Codeforces 鉴权或 Cloudflare 检查不可用，Carrot plus 会尝试用公开的 `contest.status` 提交记录重建榜单。

限制：

- 好友榜 `standings/friends/true` 依赖登录态和个人好友关系，公开 API 拿不到你的好友列表。
- 封榜阶段隐藏的数据无法预测准确。
- 非公开 gym 或权限受限比赛不可用。
- Codeforces API 被风控、限流或 Cloudflare 拦截时，插件可能暂时失败。
- rating delta 是预测值，最终以 Codeforces 官方 rating changes 为准。

## 常见错误

### `background.scripts requires manifest version of 2 or lower`

你加载了源码目录 `carrot/`，不是 Chrome 构建目录。

解决方法：

1. 删除浏览器里旧的错误扩展。
2. 如果是 GitHub 下载包，加载：

```text
dist/carrot-plus
```

3. 如果是源码开发，运行：

```bash
./build.sh -c
```

然后加载：

```text
tmp-chrome/carrot
```

### `browser is not defined`

Chrome 没有直接提供 Firefox 风格的 `browser` API。构建后的目录会自动注入 polyfill。

解决方法：不要加载源码目录。GitHub 下载包加载 `dist/carrot-plus`，源码构建后加载 `tmp-chrome/carrot`。

### `Could not establish connection. Receiving end does not exist.`

通常是扩展刚加载、页面旧 content script 还在，或后台 service worker 刚重启。

解决方法：

1. 在扩展页面点击「重新加载」。
2. 刷新 Codeforces 页面。
3. 如果还不行，关闭所有 Codeforces tab 后重新打开。

### `Failed to fetch`

通常是 Codeforces API、Cloudflare、网络连接或页面刷新导致的临时失败。Carrot plus 已经内置重试，但如果一直失败：

1. 刷新 Codeforces 页面。
2. 确认当前网络可以打开 `https://codeforces.com/apiHelp`。
3. 关闭多余的 Codeforces tab，只保留当前 standings 页面。
4. 在扩展页面点击「重新加载」，再刷新 standings 页面。

### 页面没有新增列

检查：

- 是否打开的是 standings 页面。
- 插件是否启用。
- 是否在扩展 popup/options 中关闭了对应列。
- Codeforces API 是否能正常访问。

## 本地开发

修改源码后重新构建：

```bash
./build.sh -c
```

然后到浏览器扩展页面点击「重新加载」，再刷新 Codeforces 页面。

语法检查：

```bash
node --check carrot/src/content/content.js
node --check carrot/src/background/background.js
node --check carrot/src/background/cache/contests-complete.js
```

## 版本

当前版本：

```text
1.0.1
```

插件名称：

```text
Carrot plus
```

## 致谢

本项目基于 [meooow25/carrot](https://github.com/meooow25/carrot)。

rating 计算逻辑来自原 Carrot 项目，并参考 Codeforces rating 计算思路和 [TLE](https://github.com/cheran-senthil/TLE) 的实现。

原项目 License 见 [LICENSE](LICENSE)。
