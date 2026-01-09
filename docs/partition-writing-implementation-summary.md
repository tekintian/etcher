# Etcher 分区烧录功能实现总结

## 已完成的工作

### ✅ 1. 核心类型定义
**文件**: `lib/shared/drive-constraints.ts`

- 添加了 `DrivePartition` 接口,包含分区信息:
  - `index`: 分区编号
  - `path`: 分区路径
  - `size`: 分区大小
  - `label`: 分区标签(可选)
  - `fileSystem`: 文件系统类型(可选)
  - `mountpoint`: 挂载点(可选)

- 扩展了 `DrivelistDrive` 类型,添加了 `partitions?: DrivePartition[]` 字段

### ✅ 2. 分区扫描器
**文件**: `lib/util/partition-scanner.ts` (新建)

实现了跨平台的分区检测:
- **Windows**: 使用 `diskpart` 命令
- **macOS**: 使用 `diskutil` 命令
- **Linux**: 使用 `lsblk` 命令

导出函数:
- `getPartitions(device: string): Promise<PartitionInfo[]>`
  根据设备路径获取所有分区信息

### ✅ 3. 扫描器集成
**文件**: `lib/util/scanner.ts`

修改了 `addDrive` 函数:
- 在添加新驱动时自动获取分区信息
- 使用 `getPartitions()` 函数获取分区列表
- 将分区信息附加到 `DrivelistDrive.partitions`

### ✅ 4. 写入逻辑支持分区
**文件**: `lib/util/child-writer.ts`

修改了 `write` 函数中的设备创建逻辑:
- 检查是否启用了 `partitionMode`
- 如果选择了特定分区,使用分区路径而非磁盘路径
- 分区模式下禁用 `direct: true` (避免I/O问题)
- 添加了详细的日志输出

**文件**: `lib/util/types/types.d.ts`

更新了 `WriteOptions` 接口:
- 添加了 `partitionMode?: boolean` 选项

## 待完成的工作

### ⏳ 5. UI 分区选择界面
**文件**: `lib/gui/app/components/drive-selector/drive-selector.tsx`

需要完成的修改已在文档中详细说明:
- `docs/drive-selector-partition-ui-changes.md`

主要改动:
1. 添加 `toggleExpandDrive` 和 `selectPartition` 方法
2. 修改第一个表格列的 `render` 函数,支持分区展开/折叠
3. 添加分区模式开关
4. 显示分区列表和选择按钮
5. 添加分区模式警告提示

### ⏳ 6. 图像写入器参数传递
**文件**: `lib/gui/app/modules/image-writer.ts`

需要修改 `performWrite` 函数:
```typescript
// 添加 partitionMode 参数
const parameters = {
    image,
    destinations: drives,
    SourceType: image.SourceType,
    autoBlockmapping,
    decompressFirst,
    partitionMode: true, // 从UI获取
};
```

### ⏳ 7. 国际化字符串
**文件**: `lib/gui/app/i18n/en.ts`, `zh-CN.ts`, `zh-TW.ts`

需要添加新的翻译键:
```json
{
  "drives": {
    "partitionMode": "Partition Mode",
    "selectPartition": "Select Partition"
  },
  "message": {
    "partitionModeWarning": "⚠️ Partition Mode: ..."
  }
}
```

## 使用方式

### 开发者模式
1. 启动应用
2. 选择镜像文件
3. 点击目标磁盘选择器
4. 勾选 "Partition Mode" 复选框
5. 展开目标磁盘
6. 选择要写入的分区
7. 开始烧录

### 命令行测试
```bash
# 测试分区扫描
node -e "
  const { getPartitions } = require('./lib/util/partition-scanner.ts');
  getPartitions('/dev/sda').then(console.log);
"

# 编译项目
npm run compile

# 运行测试
npm start
```

## 技术细节

### 分区路径格式

不同平台的分区路径格式:

| 平台 | 磁盘路径 | 分区路径示例 |
|------|----------|------------|
| Windows | `\\.\PhysicalDrive0` | `\\.\PhysicalDrive0-Partition1` |
| macOS | `/dev/disk0` | `/dev/disk0s1` |
| Linux | `/dev/sda` | `/dev/sda1` |

### 数据流程

```
用户操作流程:
1. 插入U盘
   ↓
2. scanner.ts 检测磁盘并获取分区
   ↓
3. UI显示磁盘列表 + 分区信息
   ↓
4. 用户启用 Partition Mode
   ↓
5. 展开磁盘,选择分区
   ↓
6. selectedPartition 附加到 DrivelistDrive
   ↓
7. image-writer.ts 传递 partitionMode 参数
   ↓
8. child-writer.ts 检测 partitionMode 和 selectedPartition
   ↓
9. 使用分区路径创建 BlockDevice
   ↓
10. 烧录到指定分区
```

## 已知限制

### 当前限制
1. **Windows分区大小未完整获取**: diskpart 只能列出分区编号,不返回大小信息
   - 解决方案: 需要执行额外的 diskpart 命令获取详情

2. **macOS分区大小未完整获取**: diskutil 输出需要更复杂的解析
   - 解决方案: 改进正则表达式匹配

3. **UI尚未完成**: 需要按照 `docs/drive-selector-partition-ui-changes.md` 实现

4. **国际化字符串缺失**: 需要添加多语言支持

### 安全考虑
1. **数据丢失风险**: 分区模式仍可能导致数据丢失
   - 建议添加确认对话框
   - 显示被选分区的挂载点警告

2. **系统盘保护**: 现有的系统盘检测逻辑仍然有效
   - 不会显示系统盘(除非显式勾选"显示系统盘")

3. **只读分区**: `isReadOnly` 检查仍然有效
   - 只读分区会被禁用

## 测试计划

### 单元测试
```typescript
// tests/util/partition-scanner.spec.ts
describe('Partition Scanner', () => {
  it('should parse Linux partitions', () => {
    // 测试 lsblk 输出解析
  });

  it('should parse macOS partitions', () => {
    // 测试 diskutil 输出解析
  });

  it('should parse Windows partitions', () => {
    // 测试 diskpart 输出解析
  });
});
```

### 集成测试
1. 插入包含多个分区的U盘
2. 验证分区信息正确显示
3. 选择一个分区进行烧录
4. 验证只写入了选定的分区
5. 检查其他分区数据未受影响

### 真实环境测试
- [ ] Windows 10 + 64GB U盘 (3个分区)
- [ ] macOS Big Sur + 外部硬盘
- [ ] Ubuntu 22.04 + 64GB U盘
- [ ] 混合系统: Windows + macOS 在同一U盘

## 后续优化

### 短期
1. 完善分区大小检测
2. 实现完整的UI修改
3. 添加国际化支持
4. 增强错误提示

### 中期
1. 添加分区格式化选项
2. 支持从分区引导
3. 改进分区可视化(饼图)
4. 添加分区验证(检查是否可启动)

### 长期
1. 支持动态分区调整
2. 集成 Clover/OpenCore 配置
3. 自动多系统引导配置
4. 分区备份/恢复功能

## 编译和运行

### 编译
```bash
npm run compile
```

### 运行开发模式
```bash
npm start
```

### 打包
```bash
npm run make
```

## 文件清单

### 新增文件
- `lib/util/partition-scanner.ts` - 分区扫描器
- `docs/partition-writing-implementation-guide.md` - 完整实现指南
- `docs/drive-selector-partition-ui-changes.md` - UI修改说明
- `docs/partition-writing-implementation-summary.md` - 本文档

### 修改文件
- `lib/shared/drive-constraints.ts` - 添加 DrivePartition 类型
- `lib/util/scanner.ts` - 集成分区检测
- `lib/util/child-writer.ts` - 支持分区写入
- `lib/util/types/types.d.ts` - 添加 partitionMode 参数

### 待修改文件
- `lib/gui/app/components/drive-selector/drive-selector.tsx` - UI实现
- `lib/gui/app/modules/image-writer.ts` - 参数传递
- `lib/gui/app/i18n/*.ts` - 国际化

## 常见问题

### Q: 分区模式能烧录macOS镜像吗?
A: 可以,但需要注意:
- macOS 镜像通常是 .dmg 格式
- 需要转换为可启动格式
- 某些 macOS 安装器需要特定文件系统(APFS/HFS+)

### Q: 会破坏分区表吗?
A: 不会。分区模式只写入到选定分区的数据区域,不修改分区表。

### Q: 能否直接从分区引导?
A: 这取决于:
- 分区是否包含引导加载器
- 系统是否支持从该分区引导
- 可能需要安装 Clover/OpenCore

### Q: Windows 上如何获取分区大小?
A: diskpart 需要多步操作:
```
select disk 0
list partition
detail partition 1  # 获取详细信息
```

## 贡献指南

如果你想帮助完善此功能,欢迎:
1. 实现 UI 部分(参考 drive-selector-partition-ui-changes.md)
2. 完善分区大小检测
3. 添加单元测试
4. 测试不同平台的功能
5. 提交 Pull Request

## 许可证

本功能遵循 Etcher 的 Apache License 2.0 许可证。
