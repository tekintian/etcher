# Etcher 分区烧录功能实现指南

## 需求背景
在同一个64G U盘上通过多分区方式安装多个操作系统(如macOS和Windows),将它们分别放到不同的分区。

## 技术分析

### 当前架构
- **磁盘检测**: `drivelist@12.0.2` - 检测物理磁盘
- **设备访问**: `etcher-sdk@9.1.2` - `BlockDevice` 类直接访问整个磁盘
- **写入方式**: 整盘写入(`destination.device`),如 `/dev/sda`, `\\.\PhysicalDrive0`

### 核心限制
1. Etcher设计为整盘烧录,会覆盖分区表
2. `drivelist` 提供的 `mountpoints` 仅包含挂载点,无详细分区信息
3. 直接烧录ISO/IMG到单个分区通常无法启动

## 实现方案

### 方案概述
修改Etcher支持分区级烧录,同时提供两种模式:
- **整盘模式**: 保持原有行为(默认)
- **分区模式**: 选择特定分区进行烧录

### 实现步骤

#### 步骤1: 扩展类型定义

**文件**: `lib/shared/drive-constraints.ts`

```typescript
// 新增分区类型
export interface DrivePartition {
  index: number;
  path: string;          // 分区路径,如 /dev/sda1, \\.\PhysicalDrive0-Partition1
  size: number;
  label?: string;
  fileSystem?: string;
  mountpoint?: string;
}

// 扩展 DrivelistDrive 类型
export type DrivelistDrive = Drive & {
  disabled: boolean;
  name: string;
  path: string;
  logo: string;
  displayName: string;
  partitions?: DrivePartition[];  // 新增分区信息
};
```

#### 步骤2: 获取分区信息

**新建文件**: `lib/util/partition-scanner.ts`

```typescript
import { platform } from 'process';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PartitionInfo {
  index: number;
  path: string;
  size: number;
  label?: string;
  fileSystem?: string;
  mountpoint?: string;
}

/**
 * 获取磁盘的所有分区信息
 */
export async function getPartitions(device: string): Promise<PartitionInfo[]> {
  if (platform === 'win32') {
    return getWindowsPartitions(device);
  } else if (platform === 'darwin') {
    return getMacOSPartitions(device);
  } else if (platform === 'linux') {
    return getLinuxPartitions(device);
  }
  return [];
}

/**
 * Windows分区检测 (使用 diskpart)
 */
async function getWindowsPartitions(device: string): Promise<PartitionInfo[]> {
  try {
    // 提取磁盘号,如 \\.\PhysicalDrive1 -> 1
    const diskNumber = device.match(/PhysicalDrive(\d+)/)?.[1];
    if (!diskNumber) return [];

    const { stdout } = await execAsync(
      `echo list partition | diskpart /s - | findstr /C:"Partition" /C:"磁盘分区"`
    );

    const partitions: PartitionInfo[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/Partition\s+(\d+)/i);
      if (match) {
        const index = parseInt(match[1]);
        partitions.push({
          index,
          path: `${device}-Partition${index}`,
          size: 0, // 需要进一步查询
          fileSystem: 'Unknown',
        });
      }
    }

    return partitions;
  } catch (error) {
    console.error('Error getting Windows partitions:', error);
    return [];
  }
}

/**
 * macOS分区检测 (使用 diskutil)
 */
async function getMacOSPartitions(device: string): Promise<PartitionInfo[]> {
  try {
    const { stdout } = await execAsync(`diskutil list ${device}`);
    
    const partitions: PartitionInfo[] = [];
    const lines = stdout.split('\n');
    let currentIndex = 0;

    for (const line of lines) {
      // 匹配分区行,如 "1:     EFI           FAT32      disk0s1"
      const match = line.match(/^\s*(\d+):\s+(\S+)\s+(\S+)\s+(\S+)/);
      if (match) {
        currentIndex = parseInt(match[1]);
        partitions.push({
          index: currentIndex,
          path: `${device}s${currentIndex}`,
          size: 0, // 需要进一步解析
          label: match[2],
          fileSystem: match[3],
        });
      }
    }

    return partitions;
  } catch (error) {
    console.error('Error getting macOS partitions:', error);
    return [];
  }
}

/**
 * Linux分区检测 (使用 lsblk)
 */
async function getLinuxPartitions(device: string): Promise<PartitionInfo[]> {
  try {
    const { stdout } = await execAsync(
      `lsblk -p -b -n -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT ${device}`
    );

    const partitions: PartitionInfo[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const [name, size, type, fstype, label, mountpoint] = parts;
        
        // 只处理分区,不处理整个磁盘
        if (type === 'part') {
          const index = parseInt(name.match(/(\d+)$/)?.[1] || '0');
          partitions.push({
            index,
            path: name,
            size: parseInt(size),
            fileSystem: fstype,
            label: label || undefined,
            mountpoint: mountpoint || undefined,
          });
        }
      }
    }

    return partitions;
  } catch (error) {
    console.error('Error getting Linux partitions:', error);
    return [];
  }
}
```

#### 步骤3: 扫描时获取分区信息

**文件**: `lib/util/scanner.ts`

```typescript
import { getPartitions } from './partition-scanner';

// 修改 addDrive 函数
async function addDrive(drive: Drive) {
  const preparedDrive = prepareDrive(drive);
  
  // 如果是BlockDevice,获取分区信息
  if (drive instanceof sdk.sourceDestination.BlockDevice) {
    try {
      // @ts-ignore (BlockDevice.drive is private)
      const partitions = await getPartitions(preparedDrive.device);
      preparedDrive.partitions = partitions;
    } catch (error) {
      console.error('Error getting partitions:', error);
      preparedDrive.partitions = [];
    }
  }
  
  if (!(await driveIsAllowed(preparedDrive))) {
    return;
  }
  const drives = getDrives();
  drives[preparedDrive.device] = preparedDrive;

  setDrives(drives);
}
```

#### 步骤4: UI支持分区选择

**文件**: `lib/gui/app/components/drive-selector/drive-selector.tsx`

修改 `tableColumns`,添加分区展开功能:

```typescript
// 在状态中添加展开的磁盘
interface DriveSelectorState {
  drives: Drive[];
  image?: SourceMetadata;
  missingDriversModal: { drive?: DriverlessDrive };
  selectedList: DrivelistDrive[];
  showSystemDrives: boolean;
  expandedDrives: Set<string>;  // 新增:记录展开的磁盘
}

// 在构造函数中初始化
constructor(props: DriveSelectorProps) {
  super(props);
  // ... 现有代码 ...
  this.state = {
    // ... 现有代码 ...
    expandedDrives: new Set(),
  };
}

// 修改表格列,添加分区展开
this.tableColumns = [
  {
    field: 'description',
    label: i18next.t('drives.name'),
    render: (description: string, drive: Drive) => {
      if (isDrivelistDrive(drive)) {
        const isLargeDrive = isDriveSizeLarge(drive);
        const hasWarnings =
          this.props.showWarnings && (isLargeDrive || drive.isSystem);
        const hasPartitions = drive.partitions && drive.partitions.length > 0;
        const isExpanded = this.state.expandedDrives.has(drive.device);
        
        return (
          <Flex flexDirection="column">
            <Flex alignItems="center">
              {hasPartitions && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    this.toggleExpandDrive(drive.device);
                  }}
                  style={{ marginRight: '8px' }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              )}
              {hasWarnings && (
                <ExclamationTriangleSvg
                  height="1em"
                  fill={drive.isSystem ? '#fca321' : '#8f9297'}
                />
              )}
              <Txt ml={(hasWarnings && 8) || 0}>
                {middleEllipsis(description, 32)}
              </Txt>
            </Flex>
            
            {/* 展开显示分区列表 */}
            {isExpanded && hasPartitions && (
              <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                {drive.partitions!.map((partition) => (
                  <Flex
                    key={partition.index}
                    alignItems="center"
                    py={1}
                  >
                    <Txt fontSize={12} mr={2}>
                      分区 {partition.index}
                    </Txt>
                    {partition.label && (
                      <Txt fontSize={12} mr={2}>
                        ({partition.label})
                      </Txt>
                    )}
                    {partition.fileSystem && (
                      <Txt fontSize={12} color="#666">
                        {partition.fileSystem}
                      </Txt>
                    )}
                    <button
                      style={{ marginLeft: 'auto' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        this.selectPartition(drive, partition);
                      }}
                    >
                      选择此分区
                    </button>
                  </Flex>
                ))}
              </div>
            )}
          </Flex>
        );
      }
      return <Txt>{description}</Txt>;
    },
  },
  // ... 其他列 ...
];

// 新增方法
toggleExpandDrive(device: string) {
  const expandedDrives = new Set(this.state.expandedDrives);
  if (expandedDrives.has(device)) {
    expandedDrives.delete(device);
  } else {
    expandedDrives.add(device);
  }
  this.setState({ expandedDrives });
}

selectPartition(drive: DrivelistDrive, partition: DrivePartition) {
  // 选择分区时,实际上还是选择整个磁盘
  // 但在UI上显示用户选择的分区
  if (this.props.onSelect) {
    this.props.onSelect({
      ...drive,
      selectedPartition: partition,
    });
  }
}
```

#### 步骤5: 修改写入逻辑支持分区

**文件**: `lib/util/child-writer.ts`

```typescript
import type { DrivePartition } from '../shared/drive-constraints';

// 修改 WriteOptions 接口
interface WriteOptions {
  image: SourceMetadata;
  destinations: DrivelistDrive[];
  autoBlockmapping: boolean;
  decompressFirst: boolean;
  SourceType: string;
  httpRequest?: any;
  partitionMode?: boolean;  // 新增:是否使用分区模式
}

// 修改 write 函数
async function write(options: WriteOptions) {
  // ... 现有代码 ...

  // 处理分区模式
  if (options.partitionMode) {
    // 如果选择了分区,使用分区路径
    const dests = options.destinations.map((destination) => {
      const partition = (destination as any).selectedPartition as DrivePartition;
      
      if (partition) {
        // 分区模式:使用分区路径
        return new BlockDevice({
          drive: {
            ...destination,
            device: partition.path,  // 使用分区路径
            size: partition.size,
          },
          unmountOnSuccess: true,
          write: true,
          direct: false,  // 分区模式不建议使用direct I/O
        });
      }
      
      // 未选择分区,使用整盘模式
      return new BlockDevice({
        drive: destination,
        unmountOnSuccess: true,
        write: true,
        direct: true,
      });
    });
  } else {
    // 原有逻辑:整盘烧录
    const dests = options.destinations.map((destination) => {
      return new BlockDevice({
        drive: destination,
        unmountOnSuccess: true,
        write: true,
        direct: true,
      });
    });
  }

  // ... 其余代码 ...
}
```

#### 步骤6: 添加分区模式开关

**文件**: `lib/gui/app/components/drive-selector/drive-selector.tsx`

```typescript
// 在Modal中添加分区模式切换
return (
  <Modal
    // ... 现有属性 ...
  >
    {/* 分区模式开关 */}
    <Flex mb={3} alignItems="center">
      <input
        type="checkbox"
        id="partitionMode"
        checked={this.state.partitionMode}
        onChange={(e) => this.setState({ partitionMode: e.target.checked })}
      />
      <label htmlFor="partitionMode" style={{ marginLeft: '8px' }}>
        启用分区烧录模式
      </label>
    </Flex>

    {/* 警告信息 */}
    {this.state.partitionMode && (
      <Alert style={{ marginBottom: '20px' }}>
        <Txt fontSize={14}>
          ⚠️ 分区模式注意事项:
          <br/>
          • 只会将镜像烧录到选定的分区,不会修改分区表
          <br/>
          • 确保选择的分区大小足够容纳镜像
          <br/>
          • 某些ISO镜像可能无法直接烧录到分区,请确保镜像支持
        </Txt>
      </Alert>
    )}

    {/* ... 其余代码 ... */}
  </Modal>
);
```

## 使用流程

1. **准备U盘分区**
   ```bash
   # Linux/Mac
   sudo fdisk /dev/sdX  # 先创建分区表和分区
   
   # Windows
   diskpart  # 使用 diskpart 创建分区
   ```

2. **使用Etcher烧录**
   - 插入U盘
   - 选择镜像文件
   - 在目标选择器中启用"分区烧录模式"
   - 展开磁盘,查看分区
   - 点击选择目标分区
   - 开始烧录

3. **配置引导加载器**
   - 使用 GRUB/GRUB2 配置多系统引导
   - 或使用 Refind 引导管理器

## 风险与限制

1. **数据安全**: 分区模式仍可能导致数据丢失,请备份重要数据
2. **启动问题**: 部分ISO镜像不支持分区烧录,可能无法启动
3. **兼容性**: 不同操作系统的分区工具和格式化方式不同
4. **性能**: 分区模式的直接I/O支持有限,烧录速度可能较慢

## 替代方案

### 方案B: 使用 Ventoy
Ventoy 是一个专门的多启动USB工具,更易用:
- 下载 Ventoy 并安装到U盘
- 直接将ISO文件复制到U盘
- 启动时从Ventoy菜单选择系统

### 方案C: 使用 MultiBootUSB
类似Ventoy,支持多系统USB创建。

## 总结

分区烧录功能可以通过修改Etcher实现,但需要:
- 扩展数据结构和类型定义
- 添加分区检测逻辑
- 修改UI支持分区选择
- 调整写入逻辑支持分区路径

**建议优先考虑 Ventoy 等专门工具**,它们更成熟、更易用。如果确实需要Etcher支持分区烧录,可以按照上述方案逐步实现。
