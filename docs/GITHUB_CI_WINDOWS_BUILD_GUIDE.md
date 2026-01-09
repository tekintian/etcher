# Etcher GitHub CI Windows 打包逻辑检查文档

## 概述

本文档详细分析 Etcher 项目中 GitHub Actions CI/CD 流程,特别是 Windows 平台的打包逻辑。

## 目录

- [CI/CD 架构](#cicd-架构)
- [主要工作流](#主要工作流)
- [Windows 打包流程](#windows-打包流程)
- [代码签名流程](#代码签名流程)
- [环境变量和密钥](#环境变量和密钥)
- [输出产物](#输出产物)
- [潜在问题和建议](#潜在问题和建议)

---

## CI/CD 架构

### 架构概览

```
GitHub 仓库
    ↓
Flowzone 工作流 (.github/workflows/flowzone.yml)
    ├─→ Test Action (.github/actions/test/action.yml)
    │   └─→ 运行测试
    │   └─→ 打包应用
    │   └─→ 上传自定义源码工件
    │
    └─→ Publish Action (.github/actions/publish/action.yml)
        ├─→ 下载自定义源码
        ├─→ 安装依赖
        ├─→ 导入代码签名证书
        ├─→ 打包应用
        ├─→ 代码签名
        └─→ 上传发布工件
```

### Flowzone 工作流

Etcher 使用 **Flowzone** 作为主要的 CI/CD 工具,这是一个 balena 内部开发的 GitHub Actions 工作流管理工具。

**触发条件**:
```yaml
on:
  push:
    branches: [v1]
  pull_request:
    types: [opened, synchronize, closed]
    branches: [v1]
  pull_request_target:
    types: [opened, synchronize, closed]
    branches: [v1]
```

**运行平台矩阵**:
```yaml
custom_test_matrix:
  os:
    - ubuntu-20.04
    - windows-2019
    - macos-14
    - macos-latest-xlarge
```

---

## 主要工作流

### 1. Flowzone 工作流

**文件**: `.github/workflows/flowzone.yml`

```yaml
name: Flowzone
on:
  push:
    branches: [v1]
  pull_request:
    types: [opened, synchronize, closed]
    branches: [v1]
  pull_request_target:
    types: [opened, synchronize, closed]
    branches: [v1]
jobs:
  flowzone:
    name: Flowzone
    uses: product-os/flowzone/.github/workflows/flowzone.yml@master
    if: |
      (github.event.pull_request.head.repo.full_name == github.repository && github.event_name == 'pull_request') ||
      (github.event.pull_request.head.repo.full_name != github.repository && github.event_name == 'pull_request_target')
    secrets: inherit
    with:
      custom_test_matrix: >
        {
          "os": [
            ["ubuntu-20.04"],
            ["windows-2019"],
            ["macos-14"],
            ["macos-latest-xlarge"]
          ]
        }
      custom_publish_matrix: >
        {
          "os": [
            ["ubuntu-20.04"],
            ["windows-2019"],
            ["macos-14"],
            ["macos-latest-xlarge"]
          ]
        }
      restrict_custom_actions: false
      github_prerelease: true
      cloudflare_website: "etcher"
```

**关键点**:
- 使用 `product-os/flowzone` 工作流模板
- 支持四个平台: Ubuntu, Windows, macOS (Intel/ARM)
- 继承所有 secrets (`secrets: inherit`)
- 发布为 GitHub prerelease

### 2. WinGet 发布工作流

**文件**: `.github/workflows/winget.yml`

```yaml
name: Publish to WinGet
on:
  release:
    types: [released]
jobs:
  publish:
    runs-on: windows-latest
    steps:
      - uses: vedantmgoyal2009/winget-releaser@v2
        with:
          identifier: Balena.Etcher
          installers-regex: 'balenaEtcher-[\d.-]+\.Setup.exe$'
          token: ${{ secrets.WINGET_PAT }}
```

**功能**:
- 在正式 release 时触发
- 自动发布到 Microsoft Winget 包管理器
- 识别 `.exe` 安装程序格式: `balenaEtcher-1.19.25.Setup.exe`

---

## Windows 打包流程

### Test Action (测试和初步打包)

**文件**: `.github/actions/test/action.yml`

#### 步骤概览

1. **Setup Node.js**
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v3
     with:
       node-version: 20.10  # 注意: 比 publish action 的 20.x 稍新
       cache: npm
   ```

2. **安装主机依赖** (仅 Linux)
   ```yaml
   - name: Install host dependencies
     if: runner.os == 'Linux'
     shell: bash
     run: |
       sudo apt-get update
       sudo apt-get install -y --no-install-recommends xvfb libudev-dev
       # 安装 package.json 中定义的所有依赖
   ```

3. **安装 Python** (仅 macOS)
   ```yaml
   - name: Install host dependencies
     if: runner.os == 'macOS'
     uses: actions/setup-python@v4
     with:
       python-version: '3.11'  # Python 3.12 移除了 distutils
   ```

4. **运行测试和打包**
   ```yaml
   - name: Test release
     shell: bash
     run: |
       npm ci              # 清理并安装依赖
       npm run lint        # 代码检查
       npm run package     # 打包应用 (不生成安装包)
       npm run wdio       # 运行端到端测试
   ```

5. **压缩自定义源码**
   ```yaml
   - name: Compress custom source
     shell: bash
     run: tar -acf ${{ runner.temp }}/custom.tgz .
   ```

6. **上传工件**
   ```yaml
   - name: Upload custom artifact
     uses: actions/upload-artifact@v4
     with:
       name: custom-${{ commit_sha }}-${{ runner.os }}-${{ runner.arch }}
       path: ${{ runner.temp }}/custom.tgz
       retention-days: 1
   ```

#### Windows 特定处理

```bash
# as the shrinkwrap might have been done on mac/linux
# ensure the package is there for windows
if [[ "$RUNNER_OS" == "Windows" ]]; then
  npm i -D winusb-driver-generator
fi
```

**说明**: Windows 需要额外的 USB 驱动生成器包。

---

### Publish Action (完整打包和发布)

**文件**: `.github/actions/publish/action.yml`

#### 步骤概览

1. **下载自定义源码**
   ```yaml
   - name: Download custom source artifact
     uses: actions/download-artifact@v4
     with:
       name: custom-${{ commit_sha }}-${{ runner.os }}-${{ runner.arch }}
       path: ${{ runner.temp }}
   ```

2. **解压自定义源码**
   ```yaml
   - name: Extract custom source artifact
     if: runner.os != 'Windows'
     shell: bash
     run: tar -xf ${{ runner.temp }}/custom.tgz

   - name: Extract custom source artifact
     if: runner.os == 'Windows'
     shell: pwsh
     run: C:\"Program Files"\Git\usr\bin\tar.exe --force-local -xf ${{ runner.temp }}\custom.tgz
   ```

3. **Setup Node.js**
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v3
     with:
       node-version: 20.x  # 使用 20.x 系列的任何版本
       cache: npm
   ```

4. **安装主机依赖** (仅 Linux)
   ```yaml
   - name: Install host dependencies
     if: runner.os == 'Linux'
     shell: bash
     run: sudo apt-get install -y --no-install-recommends fakeroot dpkg rpm
   ```

5. **配置 rpmbuild** (仅 Linux)
   ```yaml
   - name: Configure rpmbuild to not strip executables
     if: runner.os == 'Linux'
     shell: bash
     run: echo '%__strip  /usr/bin/true' > ~/.rpmmacros
   ```

6. **安装 Python** (仅 macOS)
   ```yaml
   - name: Install host dependencies
     if: runner.os == 'macOS'
     uses: actions/setup-python@v4
     with:
       python-version: '3.11'
   ```

---

## Windows 打包流程详解

### Windows 特定步骤

#### 1. 导入 Windows 代码签名证书

```yaml
- name: Import Windows code signing certificate
  if: runner.os == 'Windows'
  id: import_win_signing_cert
  shell: powershell
  run: |
    Set-Content -Path ${{ runner.temp }}/certificate.base64 -Value $env:SM_CLIENT_CERT_FILE_B64
    certutil -decode ${{ runner.temp }}/certificate.base64 ${{ runner.temp }}/Certificate_pkcs12.p12
    Remove-Item -path ${{ runner.temp }} -include certificate.base64

    echo "certFilePath=${{ runner.temp }}/Certificate_pkcs12.p12" >> $GITHUB_OUTPUT
  env:
    SM_CLIENT_CERT_FILE_B64: ${{ fromJSON(inputs.secrets).SM_CLIENT_CERT_FILE_B64 }}
```

**说明**:
- 从 GitHub Secrets 获取 Base64 编码的证书
- 解码为 PKCS#12 格式 (`.p12` 文件)
- 输出证书文件路径供后续步骤使用

#### 2. 打包和签名

```yaml
- name: Package release
  shell: bash
  run: |
    APPLICATION_VERSION="$(jq -r '.version' package.json)"
    HOST_ARCH="$(echo "${RUNNER_ARCH}" | tr '[:upper:]' '[:lower:]')"

    if [[ "${RUNNER_OS}" == Windows ]]; then
      PLATFORM=Windows
      SHA256SUM_BIN=sha256sum

      # Install DigiCert Signing Manager Tools
      curl --silent --retry 3 --fail https://one.digicert.com/signingmanager/api-ui/v1/releases/smtools-windows-x64.msi/download \
        -H "x-api-key:$SM_API_KEY" \
        -o smtools-windows-x64.msi
      msiexec -i smtools-windows-x64.msi -qn
      PATH="/c/Program Files/DigiCert/DigiCert One Signing Manager Tools:${PATH}"
      smksp_registrar.exe list
      smctl.exe keypair ls
      /c/Windows/System32/certutil.exe -csp "DigiCert Signing Manager KSP" -key -user
      smksp_cert_sync.exe

      # Add Windows SDK to PATH
      PATH="/c/Program Files (x86)/Windows Kits/10/bin/${runner_arch}:${PATH}"
    fi

    # Build for host architecture
    npx electron-forge make

    echo "version=${APPLICATION_VERSION}" >> $GITHUB_OUTPUT

    # Collect artifacts
    mkdir -p dist
    find ./out/make -type f \( \
      -iname "*.zip" -o        \
      -iname "*.dmg" -o        \
      -iname "*.rpm" -o        \
      -iname "*.deb" -o        \
      -iname "*.AppImage" -o   \
      -iname "*Setup.exe"      \
    \) -ls -exec cp '{}' dist/ \;

    # Compute SHA256 checksums
    if [[ -n "${SHA256SUM_BIN}" ]]; then
      cd dist/
      ${SHA256SUM_BIN} *.* >"SHA256SUMS.${PLATFORM}.${HOST_ARCH}.txt"
    fi
  env:
    NODE_ENV: production  # 启用代码签名
    SENTRY_TOKEN: https://739bbcfc0ba4481481138d3fc831136d@o95242.ingest.sentry.io/4504451487301632
    AMPLITUDE_TOKEN: 'balena-etcher'
    # Windows signing secrets
    SM_CLIENT_CERT_PASSWORD: ${{ fromJSON(inputs.secrets).SM_CLIENT_CERT_PASSWORD }}
    SM_CLIENT_CERT_FILE: '${{ runner.temp }}\Certificate_pkcs12.p12'
    SM_HOST: ${{ fromJSON(inputs.secrets).SM_HOST }}
    SM_API_KEY: ${{ fromJSON(inputs.secrets).SM_API_KEY }}
    SM_CODE_SIGNING_CERT_SHA1_HASH: ${{ fromJSON(inputs.secrets).SM_CODE_SIGNING_CERT_SHA1_HASH }}
    TIMESTAMP_SERVER: http://timestamp.digicert.com
```

**关键步骤**:

1. **安装 DigiCert Signing Manager Tools**
   ```bash
   curl 下载 smtools-windows-x64.msi
   msiexec -i smtools-windows-x64.msi -qn  # 静默安装
   ```

2. **配置证书提供者 (KSP)**
   ```bash
   smksp_registrar.exe list              # 列出可用的签名提供者
   smctl.exe keypair ls                 # 列出密钥对
   certutil -csp "DigiCert Signing Manager KSP" -key -user  # 配置 CSP
   smksp_cert_sync.exe                 # 同步证书
   ```

3. **添加 Windows SDK 到 PATH**
   ```bash
   PATH="/c/Program Files (x86)/Windows Kits/10/bin/${runner_arch}:${PATH}"
   ```
   - 需要用于 `signtool.exe`

4. **执行打包**
   ```bash
   npx electron-forge make
   ```
   - 自动调用 MakerSquirrel 生成 `.exe` 安装程序
   - 设置 `NODE_ENV=production` 触发代码签名

5. **收集产物**
   ```bash
   find ./out/make -type f \( \
     -iname "*.zip" -o \
     -iname "*Setup.exe" \
   \) -ls -exec cp '{}' dist/ \;
   ```

6. **生成 SHA256 校验和**
   ```bash
   sha256sum *.* >"SHA256SUMS.Windows.x64.txt"
   ```

---

## 代码签名流程

### Windows 代码签名

#### 使用的工具

1. **DigiCert Signing Manager (SM)**
   - 云端代码签名服务
   - 避免 CI 服务器上存储私钥
   - 支持双签名 (SHA1 + SHA256)

2. **Windows SDK signtool.exe**
   - Windows 10 SDK 提供的签名工具
   - 用于时间戳验证

#### 签名流程

```
1. 从 GitHub Secrets 获取证书 (Base64 编码)
   ↓
2. 解码证书为 .p12 文件
   ↓
3. 安装 DigiCert Signing Manager Tools
   ↓
4. 配置 DigiCert KSP (Key Storage Provider)
   ↓
5. 同步证书到本地机器
   ↓
6. Electron Forge MakerSquirrel 自动签名
   ↓
7. 添加时间戳 (DigiCert 时间戳服务器)
   ↓
8. 双签名完成 (SHA1 + SHA256)
```

#### 配置参数

在 `forge.config.ts` 中的 Windows 签名配置:

```typescript
if (process.env.NODE_ENV === 'production') {
  winSigningConfig = {
    signWithParams: `-sha1 ${process.env.SM_CODE_SIGNING_CERT_SHA1_HASH} 
                     -tr ${process.env.TIMESTAMP_SERVER} 
                     -td sha256 -fd sha256 -d balena-etcher`,
  };
}

new MakerSquirrel({
  setupIcon: 'assets/icon.ico',
  loadingGif: 'assets/icon.png',
  ...winSigningConfig,  // 注入签名配置
})
```

**签名参数说明**:
- `-sha1 <hash>`: 使用 SHA1 算法 (为了向后兼容)
- `-tr <url>`: 时间戳服务器 URL
- `-td sha256`: 时间戳摘要算法
- `-fd sha256`: 文件摘要算法
- `-d <name>`: 描述名称

### macOS 代码签名

#### 证书导入流程

```yaml
- name: Import Apple code signing certificate
  if: runner.os == 'macOS'
  shell: bash
  run: |
    KEY_CHAIN=build.keychain
    CERTIFICATE_P12=certificate.p12

    # 从环境变量重建证书
    echo $CERTIFICATE_P12_B64 | base64 --decode > $CERTIFICATE_P12

    # 创建临时 keychain
    security create-keychain -p actions $KEY_CHAIN

    # 设置为默认 keychain
    security default-keychain -s $KEY_CHAIN

    # 解锁 keychain
    security unlock-keychain -p actions $KEY_CHAIN

    # 导入证书
    security import $CERTIFICATE_P12 -k $KEY_CHAIN -P $CERTIFICATE_PASSWORD -T /usr/bin/codesign

    # 设置分区列表
    security set-key-partition-list -S apple-tool:,apple: -s -k actions $KEY_CHAIN

    # 清理证书文件
    rm -fr *.p12
  env:
    CERTIFICATE_P12_B64: ${{ fromJSON(inputs.secrets).APPLE_SIGNING }}
    CERTIFICATE_PASSWORD: ${{ fromJSON(inputs.secrets).APPLE_SIGNING_PASSWORD }}
```

#### 公证 (Notarization)

```yaml
env:
  XCODE_APP_LOADER_EMAIL: ${{ fromJSON(inputs.secrets).XCODE_APP_LOADER_EMAIL }}
  XCODE_APP_LOADER_PASSWORD: ${{ fromJSON(inputs.secrets).XCODE_APP_LOADER_PASSWORD }}
  XCODE_APP_LOADER_TEAM_ID: ${{ fromJSON(inputs.secrets).XCODE_APP_LOADER_TEAM_ID }}
```

Apple 要求所有 macOS 应用必须经过公证才能在较新系统上运行。

---

## 环境变量和密钥

### GitHub Secrets

项目需要以下 GitHub Secrets:

#### Windows 签名相关

| Secret 名称 | 说明 | 用途 |
|------------|------|------|
| `SM_CLIENT_CERT_FILE_B64` | Base64 编码的客户端证书文件 | 用于签名 |
| `SM_CLIENT_CERT_PASSWORD` | DigiCert 证书密码 | 证书解锁 |
| `SM_HOST` | DigiCert 服务器地址 | 连接签名服务器 |
| `SM_API_KEY` | DigiCert API 密钥 | 访问签名服务 |
| `SM_CODE_SIGNING_CERT_SHA1_HASH` | SHA1 证书哈希 | 签名参数 |

#### macOS 签名相关

| Secret 名称 | 说明 | 用途 |
|------------|------|------|
| `APPLE_SIGNING` | Base64 编码的 Apple 证书 | 代码签名 |
| `APPLE_SIGNING_PASSWORD` | Apple 证书密码 | 证书解锁 |
| `XCODE_APP_LOADER_EMAIL` | Apple ID 邮箱 | 公证 |
| `XCODE_APP_LOADER_PASSWORD` | App-specific 密码 | 公证认证 |
| `XCODE_APP_LOADER_TEAM_ID` | Apple 开发者团队 ID | 公证 |

#### 其他

| Secret 名称 | 说明 | 用途 |
|------------|------|------|
| `WINGET_PAT` | WinGet Personal Access Token | 发布到 Winget |

### 构建环境变量

| 变量 | 值 | 用途 |
|------|-----|------|
| `NODE_VERSION` | 20.x / 20.10 | Node.js 版本 |
| `NODE_ENV` | production | 启用代码签名 |
| `VERBOSE` | true | 详细日志输出 |
| `ELECTRON_NO_ATTACH_CONSOLE` | true | 不附加控制台 |

---

## 输出产物

### Test Action 输出

#### 自定义源码工件

```
custom-{commit_sha}-{os}-{arch}.tgz
```

**保留时间**: 1 天

**示例**:
```
custom-abc123def456-Windows-x64.tgz
custom-abc123def456-macOS-arm64.tgz
custom-abc123def456-Linux-x64.tgz
```

### Publish Action 输出

#### 发布工件

```
gh-release-{commit_sha}-{os}-{arch}
```

**包含内容**:

Windows (`windows-2019`):
```
dist/
├── balenaEtcher-1.19.25-full.nupkg      # 完整更新包
├── balenaEtcher-1.19.25-delta.nupkg     # 增量更新包
├── balenaEtcher-1.19.25 Setup.exe      # 安装程序
├── balenaEtcher-1.19.25-win32-x64.zip # ZIP 压缩包
└── SHA256SUMS.Windows.x64.txt        # SHA256 校验和
```

macOS (`macos-14` / `macos-latest-xlarge`):
```
dist/
├── balenaEtcher-1.19.25.dmg             # DMG 磁盘映像
├── balenaEtcher-1.19.25-arm64.dmg      # Apple Silicon 版本
├── balenaEtcher-1.19.25-arm64-mac.zip  # ZIP 压缩包
└── SHA256SUMS.Darwin.{arm,x}64.txt   # SHA256 校验和
```

Linux (`ubuntu-20.04`):
```
dist/
├── balenaEtcher-1.19.25.AppImage        # AppImage 便携应用
├── balena-etcher_1.19.25_amd64.deb     # Debian 包
├── balena-etcher-1.19.25-1.x86_64.rpm # RPM 包
└── SHA256SUMS.Linux.x64.txt          # SHA256 校验和
```

**保留时间**: 1 天 (临时)
- 产物会上传到 GitHub Release (如果创建了 release)

---

## 潜在问题和建议

### 已识别的问题

#### 1. Python 版本冲突

**问题**:
```yaml
# FIXME: Python 3.12 dropped distutils that node-gyp depends upon.
# This is a temporary workaround to make the job use Python 3.11
uses: actions/setup-python@v4
with:
  python-version: '3.11'
```

**影响**: Node.js 20.x 的某些原生模块需要 `distutils`,而 Python 3.12 移除了它。

**建议**: 升级到 npm 10+ 以兼容 Python 3.12

#### 2. Test 和 Publish Action 的 Node.js 版本不一致

**Test Action**:
```yaml
node-version: '20.10'  # 固定版本
```

**Publish Action**:
```yaml
node-version: 20.x  # 灵活版本
```

**建议**: 统一为 `20.10` 或使用相同的配置文件。

#### 3. 调试日志被注释

**问题**:
```yaml
## FIXME: causes issues with `xxhash` which tries to load a debug build which doesn't exist and cannot be compiled
# if [[ '${{ inputs.VERBOSE }}' =~ on|On|Yes|yes|true|True ]]; then
#   export DEBUG='electron-forge:*,sidecar'
# fi
```

**影响**: 无法在需要时启用详细日志。

**建议**: 找到根本原因并修复 `xxhash` 问题,然后启用调试日志。

#### 4. 跨平台编译限制

**问题**:
```bash
# Currently, we can only build for the host architecture.
npx electron-forge make
```

**影响**: 不能在 Linux 上构建 Windows 版本,需要 Windows runner。

**建议**: 考虑使用 Docker 或虚拟机进行跨平台编译。

#### 5. 临时文件清理

**问题**: 某些临时文件可能未被清理
```bash
# remove certs
rm -fr *.p12
```

**建议**: 添加更全面的清理步骤。

### 建议的改进

#### 1. 缓存优化

当前只缓存 npm 包,可以扩展:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v3
  with:
    node-version: ${{ inputs.NODE_VERSION }}
    cache: 'npm'

# 添加 Electron 缓存
- name: Cache Electron
  uses: actions/cache@v3
  with:
    path: ~/.cache/electron
    key: ${{ runner.os }}-electron-${{ hashFiles('package-lock.json') }}
```

#### 2. 并行构建

当前每个平台顺序构建,可以并行化:

```yaml
strategy:
  matrix:
    os: [ubuntu-20.04, windows-2019, macos-14, macos-latest-xlarge]
    # Flowzone 已经支持并行
```

#### 3. 更好的错误处理

添加重试和超时:

```yaml
- name: Package release
    timeout-minutes: 60
    continue-on-error: false
    uses: nick-fields/retry-action@v2
    with:
      timeout_minutes: 30
      max_attempts: 3
      retry_on: error
```

#### 4. 产物验证

添加签名验证步骤:

```yaml
- name: Verify Windows Signature
  if: runner.os == 'Windows'
  run: |
    # 检查签名
    signtool verify /pa /v dist/balenaEtcher-*-Setup.exe

    # 检查时间戳
    signtool verify /pa /v /td sha256 dist/balenaEtcher-*-Setup.exe
```

#### 5. 环境变量文档化

在 README 中添加所有必需的环境变量说明:

```markdown
## GitHub Secrets

### 签名相关

- `SM_CLIENT_CERT_FILE_B64`: DigiCert 客户端证书 (Base64)
- `SM_CLIENT_CERT_PASSWORD`: 证书密码
- ... 等等
```

### Windows 打包流程检查清单

- ✅ 使用 `windows-2019` runner
- ✅ Node.js 版本 20.x
- ✅ 安装 `winusb-driver-generator` (测试阶段)
- ✅ 导入 DigiCert 证书
- ✅ 安装 DigiCert Signing Manager Tools
- ✅ 配置 KSP (Key Storage Provider)
- ✅ 添加 Windows SDK 到 PATH
- ✅ 设置 `NODE_ENV=production`
- ✅ 运行 `npx electron-forge make`
- ✅ 生成 `.exe` 和 `.nupkg` 文件
- ✅ 添加代码签名 (SHA1 + SHA256)
- ✅ 添加时间戳
- ✅ 生成 SHA256 校验和
- ✅ 上传到 GitHub Artifacts

---

## 总结

### 当前 CI/CD 流程的优势

1. ✅ **自动化**: 完全自动化的构建和发布流程
2. ✅ **多平台**: 支持 Windows, macOS, Linux
3. ✅ **代码签名**: 自动签名所有平台的应用
4. ✅ **安全性**: 使用 GitHub Secrets,不暴露证书
5. ✅ **一致性**: 使用 Flowzone 确保一致的工作流
6. ✅ **增量更新**: Windows 支持增量更新 (.delta.nupkg)

### 需要改进的地方

1. ⚠️ Python 版本依赖 (需要 Python 3.11)
2. ⚠️ 调试日志被禁用
3. ⚠️ 跨平台编译不支持
4. ⚠️ 错误处理可以改进
5. ⚠️ 缺少签名验证步骤

### 建议的后续步骤

1. **升级依赖**: 升级到 npm 10+ 以支持 Python 3.12
2. **修复调试日志**: 解决 `xxhash` 问题并启用日志
3. **添加验证**: 添加签名和产物验证步骤
4. **优化缓存**: 缓存 Electron 和其他依赖
5. **文档化**: 在 README 中添加所有必需的 Secrets

---

**文档版本**: 1.0
**最后更新**: 2026年1月
**Etcher 版本**: 1.19.25
**CI 工作流**: Flowzone v1
