# GitHub 上传说明

下面以仓库名 `carrot-plus` 为例。

## 1. 在 GitHub 创建仓库

打开 GitHub，创建一个新仓库：

```text
carrot-plus
```

建议选择：

- Public 或 Private 都可以
- 不要勾选初始化 README
- 不要勾选 `.gitignore`
- 不要勾选 License

因为本地项目里已经有这些文件。

## 2. 本地提交代码

进入项目目录：

```bash
cd /home/xibeifeng/codex/cf/carrot-upstream
```

查看改动：

```bash
git status
```

添加文件：

```bash
git add README.md GITHUB_UPLOAD.md build.sh carrot/manifest.json carrot/src/background/background.js carrot/src/background/cache/contests-complete.js carrot/src/background/cf-api.js carrot/src/content/content.js
```

提交：

```bash
git commit -m "Release Carrot plus 1.0.1"
```

如果提示没有配置用户名和邮箱，先执行：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

然后重新执行 `git commit`。

## 3. 绑定你的 GitHub 仓库

把下面的地址替换成你自己的 GitHub 地址：

```bash
git remote add origin https://github.com/你的用户名/carrot-plus.git
```

确认 remote：

```bash
git remote -v
```

应该能看到：

```text
origin    https://github.com/你的用户名/carrot-plus.git
upstream  https://github.com/meooow25/carrot.git
```

`upstream` 是原 Carrot 项目地址，保留用于标明来源；你平时 push 用 `origin`。

## 4. 推送到 GitHub

如果当前分支是 `master`：

```bash
git branch -M main
git push -u origin main
```

之后每次更新只需要：

```bash
git add .
git commit -m "你的更新说明"
git push
```

## 5. 上传浏览器安装包

构建 zip：

```bash
./build.sh -c -z
```

生成文件：

```text
release/carrot-chrome-v1.0.1.zip
```

推荐不要把 `release/` 提交进 Git，因为它是构建产物，已经在 `.gitignore` 里。

发布给别人用时，在 GitHub 项目页面：

1. 打开右侧 `Releases`
2. 点击 `Create a new release`
3. Tag 填：

```text
v1.0.1
```

4. Title 填：

```text
Carrot plus v1.0.1
```

5. 上传：

```text
release/carrot-chrome-v1.0.1.zip
```

6. 点击发布。

## 6. 用户安装方式

用户下载 zip 后：

1. 解压 zip
2. 打开 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择解压后的插件目录

也可以让用户从源码构建：

```bash
./build.sh -c
```

然后加载：

```text
tmp-chrome/carrot
```
