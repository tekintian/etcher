# Etcher 编译指南

本指南详细说明如何编译和打包 Etcher 应用程序。

## 目录

- [系统要求](#系统要求)
- [开发环境准备](#开发环境准备)
- [快速开始](#快速开始)
- [编译流程](#编译流程)
- [平台特定说明](#平台特定说明)
- [故障排除](#故障排除)
- [高级选项](#高级选项)

---

## 系统要求

### Node.js 版本

**必需**: Node.js >= 20.0.0 且 < 21.0.0

```bash
node --version  # 应显示 v20.x.x
```

**推荐版本**: v20.11.6 或更高

### npm 版本

**推荐**: npm >= 9.0.0

```bash
npm --version
```

### 平台要求

| 平台 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **Windows** | Windows 10 64-bit | Windows 10/11 64-bit, 4GB+ RAM |
| **macOS** | macOS 10.15 (Catalina) | macOS 12+ (Monterey or newer), 4GB+ RAM |
| **Linux** | Ubuntu 18.04 or equivalent | Ubuntu 20.04+, 4GB+ RAM |

### 其他要求

- Git (用于克隆仓库)
- Python (某些原生模块编译需要)
- C++ 编译器 (某些原生模块编译需要)
  - Windows: Visual Studio Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: build-essential

---

## 开发环境准备

### 1. 安装 Node.js

#### Windows

1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载 **LTS 版本 20.x**
3. 运行安装程序,确保勾选 "Add to PATH"
4. 验证安装:
   ```powershell
   node --version
   npm --version
   ```

#### macOS

```bash
# 使用 Homebrew (推荐)
brew install node@20

# 或从官网下载安装程序
# https://nodejs.org/
```

#### Linux (Ubuntu/Debian)

```bash
# 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 克隆仓库

```bash
git clone https://github.com/balena-io/etcher.git
cd etcher
```

### 3. 安装依赖

```bash
npm install
```

**注意**:
- 首次安装可能需要较长时间(5-15分钟)
- 某些原生模块可能需要编译
- 如果安装失败,尝试:
  ```bash
  npm cache clean --force
  npm install
  ```

---

## 快速开始

### 开发模式运行

```bash
npm start
```

这将启动 Electron 应用的开发模式,支持热重载。

### 编译 TypeScript

```bash
npm run compile
```

这会编译所有 TypeScript 代码到 JavaScript。

---

## 编译流程

### 依赖版本

Etcher 使用的核心依赖版本:

| 依赖 | 版本 | 说明 |
|------|------|------|
| **Electron** | 30.0.1 | 桌面应用框架 |
| **Electron Forge** | 7.4.0 | 应用打包工具 |
| **React** | 17.0.2 | UI 框架 |
| **TypeScript** | 5.3.3 | 编程语言 |
| **Node.js** | >=20 & <21 | 运行时环境 |

### Electron Forge Makers

| Maker | 平台 | 输出格式 |
|-------|------|----------|
| **MakerSquirrel** | Windows | `.exe` 安装程序 |
| **MakerDMG** | macOS | `.dmg` 磁盘映像 |
| **MakerAppImage** | Linux | `.AppImage` 便携应用 |
| **MakerDeb** | Linux | `.deb` Debian 包 |
| **MakerRpm** | Linux | `.rpm` RPM 包 |
| **MakerZIP** | 所有平台 | `.zip` 压缩包 |

### 1. 打包应用 (Package)

```bash
npm run package
# 或
electron-forge package
```

**输出位置**: `out/balenaEtcher-{platform}-{arch}/`

**包含内容**:
- 应用可执行文件
- 所有依赖
- 资源文件
- `.asar` 归档文件

**示例输出** (Windows):
```
out/
└── balenaEtcher-win32-x64/
    ├── balenaEtcher.exe
    ├── resources/
    │   └── app.asar
    ├── locales/
    └── ...
```

### 2. 生成安装包 (Make)

```bash
npm run make
# 或
electron-forge make
```

**输出位置**: `out/make/`

**平台特定输出**:

#### Windows
```
out/make/squirrel.windows/
├── balenaEtcher-1.19.25 Setup.exe    ← 主安装程序
├── balenaEtcher-1.19.25-full.nupkg  ← 完整更新包
├── balenaEtcher-1.19.25-delta.nupkg ← 增量更新包
└── RELEASES                          ← 更新信息
```

#### macOS
```
out/make/dmg/
└── balenaEtcher-1.19.25.dmg
```

#### Linux
```
out/make/
├── appimage/balenaEtcher-1.19.25.AppImage
├── deb/balena-etcher_1.19.25_amd64.deb
└── rpm/balena-etcher-1.19.25-1.x86_64.rpm
```

### 3. 指定平台编译

```bash
# Windows
npm run make -- --platform=win32 --arch=x64

# macOS
npm run make -- --platform=darwin --arch=arm64  # Apple Silicon
npm run make -- --platform=darwin --arch=x64   # Intel

# Linux
npm run make -- --platform=linux --arch=x64
```

**注意**: 跨平台编译需要对应的操作系统环境。例如,要在 macOS 上编译 Windows 版本,需要虚拟机或 CI/CD。

---

## 平台特定说明

### Windows

#### 系统要求
- Windows 10 64-bit 或更高
- Visual Studio Build Tools (某些原生模块需要)

#### 编译步骤

```bash
# 1. 安装依赖
npm install

# 2. 编译应用
npm run make -- --platform=win32 --arch=x64

# 3. 安装应用
out\make\squirrel.windows\balenaEtcher-1.19.25 Setup.exe
```

#### 代码签名 (可选)

如果要签名应用程序,设置以下环境变量:

```powershell
$env:NODE_ENV="production"
$env:SM_CODE_SIGNING_CERT_SHA1_HASH="your-certificate-hash"
$env:TIMESTAMP_SERVER="http://timestamp.digicert.com"
```

然后编译:
```bash
npm run make -- --platform=win32 --arch=x64
```

#### 常见问题

**问题**: `MSBuild error` 或编译失败
**解决**:
```powershell
# 安装 Visual Studio Build Tools
# 下载: https://visualstudio.microsoft.com/downloads/
# 选择 "Desktop development with C++" 工作负载
```

**问题**: 权限错误
**解决**:
```powershell
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS

#### 系统要求
- macOS 10.15 (Catalina) 或更高
- Xcode Command Line Tools

#### 编译步骤

```bash
# 1. 安装 Xcode Command Line Tools (如果未安装)
xcode-select --install

# 2. 安装依赖
npm install

# 3. 编译应用
npm run make -- --platform=darwin --arch=x64

# 4. 安装应用
# 打开 out/make/dmg/balenaEtcher-1.19.25.dmg
# 拖拽到 Applications 文件夹
```

#### Apple Silicon (M1/M2/M3)

```bash
# 为 Apple Silicon 编译
npm run make -- --platform=darwin --arch=arm64
```

#### 代码签名和公证 (可选)

设置环境变量:
```bash
export NODE_ENV=production
export XCODE_APP_LOADER_EMAIL="your-email@example.com"
export XCODE_APP_LOADER_PASSWORD="your-app-specific-password"
export XCODE_APP_LOADER_TEAM_ID="your-team-id"
```

#### 常见问题

**问题**: `xcode-select error`
**解决**:
```bash
xcode-select --install
```

**问题**: 权限错误
**解决**:
```bash
# 允许未签名的应用
sudo spctl --master-disable
```

### Linux

#### 系统要求
- Ubuntu 18.04 或 equivalent
- 所需依赖包会自动安装

#### 编译步骤

```bash
# 1. 安装依赖
npm install

# 2. 编译应用
npm run make -- --platform=linux --arch=x64

# 3. 安装应用
# Debian/Ubuntu:
sudo dpkg -i out/make/deb/balena-etcher_1.19.25_amd64.deb

# Fedora/RHEL:
sudo rpm -i out/make/rpm/balena-etcher_1.19.25-1.x86_64.rpm

# 或直接运行 AppImage:
chmod +x out/make/appimage/balenaEtcher-1.19.25.AppImage
./out/make/appimage/balenaEtcher-1.19.25.AppImage
```

#### 所需依赖

安装程序会自动安装以下依赖:
- libasound2
- libatk1.0-0
- libc6
- libcairo2
- libcups2
- libdbus-1-3
- libexpat1
- libfontconfig1
- libfreetype6
- libgbm1
- libgcc1
- libgdk-pixbuf2.0-0
- libglib2.0-0
- libgtk-3-0
- liblzma5
- libnotify4
- libnspr4
- libnss3
- libpango1.0-0
- libstdc++6
- libx11-6
- libxcomposite1
- libxcursor1
- libxdamage1
- libxext6
- libxfixes3
- libxi6
- libxrandr2
- libxrender1
- libxss1
- libxtst6

#### 常见问题

**问题**: 依赖包缺失
**解决**:
```bash
sudo apt-get update
sudo apt-get install -y libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libfreetype6 libgbm1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 liblzma5 libnotify4 libnspr4 libnss3 libpango-1.0-0 libstdc++6 libx11-6 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 polkit-1-auth-agent
```

---

## 故障排除

### 通用问题

#### 1. 依赖安装失败

```bash
# 清理缓存并重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### 2. TypeScript 编译错误

```bash
# 清理编译输出
rm -rf .webpack out

# 重新编译
npm run compile
```

#### 3. Webpack 构建错误

```bash
# 检查 Node.js 版本
node --version  # 应该是 v20.x.x

# 如果版本不正确,重新安装 Node.js
```

#### 4. Electron Forge 错误

```bash
# 重新安装 Electron Forge
npm uninstall @electron-forge/cli
npm install --save-dev @electron-forge/cli@7.4.0
```

### Windows 特定问题

#### 问题: 安装后无法启动

**解决**:
1. 检查杀毒软件是否阻止
2. 以管理员身份运行
3. 检查 Windows Defender SmartScreen 设置

#### 问题: 编译时出现 Python 错误

**解决**:
```powershell
# 安装 Python 3.x
# 下载: https://www.python.org/downloads/

# 设置环境变量
$env:PYTHON="C:\Python39\python.exe"
```

### macOS 特定问题

#### 问题: 应用无法打开 (已损坏)

**解决**:
```bash
# 临时允许未签名的应用
sudo spctl --master-disable

# 或右键点击应用,选择"打开"
```

#### 问题: 公证失败

**解决**:
- 检查 Apple ID 和密码是否正确
- 确保已启用双重认证
- 使用 App-specific password

### Linux 特定问题

#### 问题: AppImage 无法运行

**解决**:
```bash
# 添加执行权限
chmod +x balenaEtcher-*.AppImage

# 如果仍然无法运行
./balenaEtcher-*.AppImage --appimage-extract
./squashfs-root/AppRun
```

#### 问题: 缺少系统库

**解决**:
```bash
# Ubuntu/Debian
sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libappindicator3-1 libsecret-1-0

# Fedora/RHEL
sudo dnf install gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-core libuuid libappindicator-gtk3 libsecret
```

---

## 高级选项

### 环境变量

| 变量 | 说明 | 用途 |
|------|------|------|
| `NODE_ENV` | 环境模式 | 设置为 `production` 启用代码签名 |
| `DEBUG` | 调试模式 | 启用详细日志输出 |
| `ELECTRON_MIRROR` | Electron 镜像 | 使用自定义 Electron 下载镜像 |

### Webpack 配置

Webpack 配置位于 `webpack.config.ts`:

```typescript
// 主进程配置
mainConfig: {
  // ...
}

// 渲染进程配置
rendererConfig: {
  // ...
}
```

### 自定义构建

修改 `forge.config.ts` 可以自定义构建:

```typescript
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,                    // 使用 asar 打包
    icon: './assets/icon',         // 应用图标
    executableName: 'balenaEtcher',
    // ...
  },
  // ...
};
```

### Docker 构建

使用 Docker 构建可以避免本地环境问题:

```bash
# 使用官方 Electron Builder Docker 镜像
docker run --rm \
  -v $(pwd):/project \
  -w /project \
  electronuserland/builder:wine \
  npm run make -- --platform=win32 --arch=x64
```

### CI/CD 集成

GitHub Actions 示例:

```yaml
name: Build

on: [push]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Build
        run: npm run make
```

---

## 脚本参考

### package.json 脚本

```json
{
  "scripts": {
    "prettify": "prettier --write lib/**/*.css && balena-lint --fix --typescript typings lib tests forge.config.ts forge.sidecar.ts webpack.config.ts",
    "lint": "npm run prettify && catch-uncommitted",
    "test": "echo 'Only use custom tests; if you want to test locally, use `npm run wdio`' && exit 0",
    "package": "electron-forge package",
    "start": "electron-forge start",
    "make": "electron-forge make",
    "wdio": "xvfb-maybe wdio run ./wdio.conf.ts"
  }
}
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm start` | 启动开发模式 |
| `npm run compile` | 编译 TypeScript |
| `npm run package` | 打包应用(不生成安装包) |
| `npm run make` | 编译并生成所有安装包 |
| `npm run lint` | 代码检查和格式化 |
| `npm run wdio` | 运行端到端测试 |

---

## 输出文件结构

完整的编译输出结构:

```
etcher/
├── .webpack/                 # Webpack 编译输出
│   ├── main/               # 主进程代码
│   └── renderer/           # 渲染进程代码
├── out/                     # 最终输出
│   ├── balenaEtcher-{platform}-{arch}/  # 打包应用
│   │   ├── balenaEtcher.exe # 可执行文件
│   │   ├── resources/       # 资源文件
│   │   │   └── app.asar   # 应用代码
│   │   └── ...
│   └── make/               # 安装包
│       ├── squirrel.windows/    # Windows
│       ├── dmg/               # macOS
│       ├── appimage/          # Linux AppImage
│       ├── deb/               # Debian/Ubuntu
│       └── rpm/               # Fedora/RHEL
└── ...
```

---

## 性能优化

### 加速编译

```bash
# 使用 npm ci 而不是 npm install (更快)
npm ci

# 使用并行构建
npm run make -- --parallel

# 禁用某些可选功能
npm run make -- --no-native
```

### 减小应用体积

```bash
# 在 forge.config.ts 中启用压缩
packagerConfig: {
  // ...
  prune: true,  // 移除未使用的文件
}
```

---

## 参考资源

- [Electron 文档](https://www.electronjs.org/docs)
- [Electron Forge 文档](https://www.electronforge.io/)
- [Webpack 文档](https://webpack.js.org/)
- [Etcher GitHub 仓库](https://github.com/balena-io/etcher)

---

## 获取帮助

如果遇到问题:

1. 检查本文档的 [故障排除](#故障排除) 部分
2. 查看 [Etcher GitHub Issues](https://github.com/balena-io/etcher/issues)
3. 搜索 [Electron Forge 文档](https://www.electronforge.io/)

---

**最后更新**: 2026年1月
**文档版本**: 1.0
**Etcher 版本**: 1.19.25
