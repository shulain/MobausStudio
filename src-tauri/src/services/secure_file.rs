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

/// 以仅所有者可读写的模式创建并写入文件
///
/// Unix 下通过 `OpenOptions::mode` 在创建时即设定 `0o600`，
/// 避免文件先以 umask 默认权限出现、随后才被 chmod 的时间窗口。
fn create_owner_only(path: &Path, contents: &[u8]) -> io::Result<()> {
    use std::io::Write;

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(FILE_MODE)
            .open(path)?
    };

    #[cfg(not(unix))]
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;

    file.write_all(contents)?;
    file.flush()?;
    Ok(())
}

/// 安全写入敏感文件
///
/// 依次执行：创建父目录 → 收紧目录权限 → 以 `0o600` 写入 → 收紧文件权限。
///
/// 最后一步针对旧版本遗留的宽松权限文件：`OpenOptions::mode` 只影响新建文件，
/// 已存在的文件需要显式 chmod 才能收紧。
///
/// # Errors
/// 创建目录或写入失败时返回 `io::Error`。权限设置失败不构成错误。
pub fn write_secure(path: &Path, contents: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        harden_dir(parent);
    }

    create_owner_only(path, contents)?;
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
