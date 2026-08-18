//! 敏感文件安全写入
//!
//! 用于写入包含凭证的文件（OAuth Token、API Key 等）。
//!
//! ## 职责
//! - 确保父目录存在，并将其权限收紧为 `0o700`
//! - 以 `0o600` 模式创建文件，避免"先创建后 chmod"的权限窗口
//! - 对旧版本遗留的宽松权限文件，写入后显式收紧一次
//!
//! ## 平台差异
//! 权限收紧仅在 Unix 生效；Windows 下依赖用户配置目录自身的 ACL。
//! 权限设置采取尽力而为策略：设置失败不会中断写入，但会记录警告。
//!
//! @module services/secure_file

use std::fs;
use std::io;
use std::path::Path;

/// 敏感目录权限：仅所有者可读写执行
#[cfg(unix)]
const DIR_MODE: u32 = 0o700;

/// 敏感文件权限：仅所有者可读写
#[cfg(unix)]
const FILE_MODE: u32 = 0o600;

/// 将目录权限收紧为 `0o700`
///
/// 尽力而为：失败仅记录警告，不返回错误。
pub fn harden_dir(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        match fs::metadata(path) {
            Ok(meta) => {
                let mut perms = meta.permissions();
                perms.set_mode(DIR_MODE);
                if let Err(e) = fs::set_permissions(path, perms) {
                    log::warn!("[secure_file] 收紧目录权限失败 {}: {}", path.display(), e);
                }
            }
            Err(e) => {
                log::warn!("[secure_file] 读取目录属性失败 {}: {}", path.display(), e);
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// 将文件权限收紧为 `0o600`
///
/// 尽力而为：失败仅记录警告，不返回错误。
pub fn harden_file(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        match fs::metadata(path) {
            Ok(meta) => {
                let mut perms = meta.permissions();
                perms.set_mode(FILE_MODE);
                if let Err(e) = fs::set_permissions(path, perms) {
                    log::warn!("[secure_file] 收紧文件权限失败 {}: {}", path.display(), e);
                }
            }
            Err(e) => {
                log::warn!("[secure_file] 读取文件属性失败 {}: {}", path.display(), e);
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// 以仅所有者可读写的模式**新建**并写入文件
///
/// 使用 `create_new(true)` 而非 `create + truncate`：
/// - 保证文件由本次调用创建，不会复用已存在文件的宽松权限；
/// - 目标若是符号链接则直接失败，避免被诱导写入其他位置（TOCTOU）。
///
/// Unix 下通过 `OpenOptions::mode` 在创建时即设定 `0o600`，
/// 避免文件先以 umask 默认权限出现、随后才被 chmod 的时间窗口。
///
/// # Errors
/// 文件已存在时返回 `io::ErrorKind::AlreadyExists`，由调用方决定是否换名重试。
fn create_owner_only(path: &Path, contents: &[u8]) -> io::Result<()> {
    use std::io::Write;

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(FILE_MODE)
            .open(path)?
    };

    #[cfg(not(unix))]
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;

    // 写入并落盘：sync_all 确保内容在被替换到目标位置**之前**已写入文件系统，
    // 避免目标一经可见、其内容却仍只在内核缓冲中。
    //
    // 注意边界：这只覆盖临时文件自身。替换动作修改的是父目录项，
    // Unix 下要保证断电后替换结果仍然持久，还需在替换后同步父目录——
    // 本实现未做，故不承诺断电一致性（见 write_secure 文档）。
    let mut result = file.write_all(contents);
    if result.is_ok() {
        result = file.sync_all();
    }

    if let Err(e) = result {
        // 磁盘满、配额超限、I/O 错误都可能在此发生。文件此时已存在且可能含
        // 部分明文凭证，必须先关闭句柄再删除——否则残留文件无人清理。
        drop(file);
        let _ = fs::remove_file(path);
        return Err(e);
    }

    Ok(())
}

/// 生成同目录下的临时文件路径
///
/// 必须与目标同目录：跨文件系统的 `rename` 不是原子操作，也可能直接失败。
/// 使用 UUID v4 而非时间戳，避免并发写入时撞名。
fn temp_path_for(path: &Path) -> io::Result<std::path::PathBuf> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "路径缺少父目录"))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "路径缺少文件名"))?
        .to_string_lossy()
        .to_string();

    Ok(parent.join(format!("{file_name}.tmp.{}", uuid::Uuid::new_v4())))
}

/// 安全写入敏感文件（原子 + 受限权限）
///
/// 依次执行：创建父目录 → 收紧目录权限 → 以 `0o600` 写入同目录临时文件
/// → `rename` 原子替换目标 → 再次收紧目标文件权限。
///
/// **原子性**：直接 truncate 目标文件时，进程若在写入中途崩溃会留下被截断的凭证文件，
/// 用户将丢失全部已保存的凭证。先写临时文件再 rename，可保证目标要么是旧内容、
/// 要么是完整新内容。
///
/// 替换步骤委托给 `std::fs::rename`，依赖标准库为各平台提供的替换语义，
/// 不对具体系统调用做任何假设（那是可能变化的实现细节）。若平台或文件系统
/// 不支持覆盖已存在目标，`rename` 返回错误，此时**旧文件保持不变**。
///
/// 无论哪种平台都**不做「先删后改名」**——删除成功而替换失败会造成旧凭证永久丢失。
///
/// **持久性边界**：本实现保证的是「进程崩溃时目标不会是半写内容」，
/// 不保证「断电后最新一次写入必定存活」。后者还需在替换后同步父目录项，
/// 此处未实现。对凭证而言取舍是明确的：断电丢失最新 token 只需重新登录，
/// 而旧凭证被破坏才是真正的损失——后者由「不先删」和替换失败保留旧文件来保证。
///
/// **权限**：临时文件在创建时即为 `0o600`，因此不存在"内容已落盘但权限尚未收紧"的窗口。
/// 替换完成后再次 chmod，用于收紧旧版本遗留的宽松权限文件（`rename` 会保留源文件的权限位，
/// 这一步在正常路径上是幂等的）。
///
/// # Errors
/// 创建目录、写入或替换失败时返回 `io::Error`；替换失败会尝试清理临时文件。
/// 权限设置失败不构成错误（见模块级说明）。
pub fn write_secure(path: &Path, contents: &[u8]) -> io::Result<()> {
    write_secure_with(path, contents, replace_file)
}

/// 用临时文件替换目标
///
/// 直接委托给标准库：`std::fs::rename` 在各平台提供该平台可用的替换语义，
/// 平台不支持覆盖已存在目标时会返回错误，此时旧文件保持不变。
/// 这里不依赖标准库内部使用哪个系统调用——那属于实现细节且可能变化。
fn replace_file(tmp: &Path, target: &Path) -> io::Result<()> {
    fs::rename(tmp, target)
}

/// `write_secure` 的可注入替换步骤版本
///
/// 抽出 `replace` 参数是为了让「替换失败」这一分支可被测试真实驱动：
/// 若测试只能靠构造不可替换的目标（如目录）来间接触发，
/// 则「先删后改名」这类缺陷不会被捕获——删除对目录同样失败且错误被忽略。
fn write_secure_with(
    path: &Path,
    contents: &[u8],
    replace: impl Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        harden_dir(parent);
    }

    // create_new 在撞名时失败；UUID v4 撞名概率可忽略，重试仅为兜底
    const MAX_ATTEMPTS: u32 = 3;
    let mut tmp = temp_path_for(path)?;
    let mut attempt = 1;
    loop {
        match create_owner_only(&tmp, contents) {
            Ok(()) => break,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists && attempt < MAX_ATTEMPTS => {
                attempt += 1;
                tmp = temp_path_for(path)?;
            }
            Err(e) => return Err(e),
        }
    }

    // 直接替换，不做「先删后改名」：
    // 删除成功而替换失败会导致旧凭证永久丢失，与原子性保证正好相反。
    if let Err(e) = replace(&tmp, path) {
        // 替换失败时清理临时文件——它同样含明文凭证
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    // 防御性收紧：正常路径上替换已带来临时文件的 0o600，此处幂等
    harden_file(path);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!("mobaus_secure_file_{tag}_{ts}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_secure_creates_file_with_contents() {
        let dir = temp_dir("contents");
        let path = dir.join("creds.json");

        write_secure(&path, b"{\"token\":\"abc\"}").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"token\":\"abc\"}");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_secure_creates_missing_parent_dir() {
        let dir = temp_dir("parent");
        let path = dir.join("nested").join("deep").join("creds.json");

        write_secure(&path, b"x").unwrap();

        assert!(path.exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_secure_truncates_existing_content() {
        let dir = temp_dir("truncate");
        let path = dir.join("creds.json");

        write_secure(&path, b"aaaaaaaaaa").unwrap();
        write_secure(&path, b"bb").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "bb");
        fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_secure_sets_owner_only_file_mode() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("mode");
        let path = dir.join("creds.json");

        write_secure(&path, b"secret").unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "新建凭证文件应为 0o600，实际为 {mode:o}");

        fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_secure_tightens_preexisting_loose_file() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("migrate");
        let path = dir.join("creds.json");

        // 模拟旧版本写入的宽松权限文件
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

        write_secure(&path, b"new").unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "遗留文件应被收紧为 0o600，实际为 {mode:o}");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_secure_leaves_no_temp_file_behind() {
        let dir = temp_dir("notmp");
        let path = dir.join("creds.json");

        write_secure(&path, b"secret").unwrap();
        write_secure(&path, b"secret2").unwrap();

        // 临时文件同样含明文凭证，成功路径上不允许残留
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains(".tmp."))
            .collect();

        assert!(leftovers.is_empty(), "残留临时文件: {leftovers:?}");
        assert_eq!(fs::read_to_string(&path).unwrap(), "secret2");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_secure_reports_error_and_cleans_temp_when_rename_fails() {
        // 构造真实的 rename 失败：目标路径是一个已存在的目录，
        // rename(file -> dir) 在各平台均失败
        let dir = temp_dir("renamefail");
        let target = dir.join("creds.json");
        fs::create_dir(&target).unwrap();

        let result = write_secure(&target, b"secret");

        assert!(result.is_err(), "目标是目录时 write_secure 应返回错误");

        // 失败路径同样不能留下含明文凭证的临时文件
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains(".tmp."))
            .collect();
        assert!(leftovers.is_empty(), "失败后残留临时文件: {leftovers:?}");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_secure_keeps_old_credentials_when_replacement_fails() {
        // 用注入的失败替换驱动失败分支，目标是一个**真实的旧凭证文件**。
        //
        // 这样才能捕获「先删后改名」类缺陷：若实现在替换前删除目标，
        // 旧凭证就没了。此前用「目标是目录」间接触发的写法捕获不到——
        // remove_file 对目录同样失败且错误被忽略。
        let dir = temp_dir("keepold");
        let path = dir.join("creds.json");
        write_secure(&path, b"old-credentials").unwrap();

        let result = write_secure_with(&path, b"new-credentials", |_tmp, _target| {
            Err(io::Error::other("注入的替换失败"))
        });

        assert!(result.is_err(), "替换失败时应返回错误");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "old-credentials",
            "替换失败后旧凭证必须完好无损"
        );

        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains(".tmp."))
            .collect();
        assert!(leftovers.is_empty(), "失败后残留临时文件: {leftovers:?}");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn create_owner_only_refuses_to_touch_existing_file() {
        // create_new 语义：目标已存在时失败，且不得改动既有文件内容。
        // 这同时防止复用已存在文件的宽松权限。
        let dir = temp_dir("createnew");
        let path = dir.join("creds.json");

        create_owner_only(&path, &vec![b'x'; 1024]).unwrap();

        let err = create_owner_only(&path, b"other").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(
            fs::metadata(&path).unwrap().len(),
            1024,
            "既有文件不应被改动"
        );

        fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_secure_sets_owner_only_dir_mode() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("dirmode");
        let nested = dir.join("data");
        let path = nested.join("creds.json");

        write_secure(&path, b"secret").unwrap();

        let mode = fs::metadata(&nested).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700, "凭证目录应为 0o700，实际为 {mode:o}");

        fs::remove_dir_all(&dir).ok();
    }
}
