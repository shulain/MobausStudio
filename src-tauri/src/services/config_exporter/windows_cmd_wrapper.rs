//! Windows 命令包装工具
//!
//! 复用自 cc-switch claude_mcp.rs:15
//! 在 Windows 平台上，Node.js 工具链命令需要通过 cmd /c 包装才能正常执行。

/// 判断命令是否需要 Windows 包装
///
/// Node.js 工具链命令（npx, npm, node, yarn, pnpm, bun, deno）在 Windows 上需要包装。
/// 支持大小写不敏感匹配、.cmd 后缀、带路径的命令。
///
/// # 参数
/// - `command`: 命令名称（可能包含路径和后缀）
///
/// # 返回
/// - `true`: 需要包装
/// - `false`: 不需要包装
#[allow(dead_code)] // 在非 Windows 平台上不使用
pub fn needs_windows_wrapping(command: &str) -> bool {
    // 提取命令的基本名称（去除路径）
    // 同时支持 Unix (/) 和 Windows (\) 路径分隔符
    let base_name = command.rsplit(['/', '\\']).next().unwrap_or(command);

    // 去除文件扩展名（.cmd, .exe 等）
    let base_name_no_ext = base_name
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(base_name);

    // 转换为小写进行匹配
    let base_name_lower = base_name_no_ext.to_lowercase();

    matches!(
        base_name_lower.as_str(),
        "npx" | "npm" | "node" | "yarn" | "pnpm" | "bun" | "deno"
    )
}

/// 包装 Windows 命令
///
/// 将 Node.js 工具链命令包装为 cmd /c 形式。
///
/// # 参数
/// - `command`: 原始命令
/// - `args`: 原始参数列表
///
/// # 返回
/// - `(wrapped_command, wrapped_args)`: 包装后的命令和参数
///
/// # 示例
/// ```ignore
/// let args = vec!["-y".to_string(), "some-package".to_string()];
/// let (cmd, wrapped_args) = wrap_windows_command("npx", &args);
/// assert_eq!(cmd, "cmd");
/// assert_eq!(wrapped_args, vec!["/c", "npx", "-y", "some-package"]);
/// ```
#[allow(dead_code)] // 在非 Windows 平台上不使用
pub fn wrap_windows_command(command: &str, args: &[String]) -> (String, Vec<String>) {
    let mut wrapped_args = vec!["/c".to_string(), command.to_string()];
    wrapped_args.extend(args.iter().cloned());
    ("cmd".to_string(), wrapped_args)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-WRAPPER-001: 判断 Node.js 工具链命令需要包装
    #[test]
    fn test_tc_wrapper_001_nodejs_commands_need_wrapping() {
        assert!(needs_windows_wrapping("npx"));
        assert!(needs_windows_wrapping("npm"));
        assert!(needs_windows_wrapping("node"));
        assert!(needs_windows_wrapping("yarn"));
        assert!(needs_windows_wrapping("pnpm"));
        assert!(needs_windows_wrapping("bun"));
        assert!(needs_windows_wrapping("deno"));
    }

    /// TC-WRAPPER-002: 判断非 Node.js 命令不需要包装
    #[test]
    fn test_tc_wrapper_002_other_commands_no_wrapping() {
        assert!(!needs_windows_wrapping("python"));
        assert!(!needs_windows_wrapping("uvx"));
        assert!(!needs_windows_wrapping("docker"));
        assert!(!needs_windows_wrapping("custom-binary"));
    }

    /// TC-WRAPPER-003: 包装命令和参数
    #[test]
    fn test_tc_wrapper_003_wrap_command_with_args() {
        let args = vec![
            "-y".to_string(),
            "@modelcontextprotocol/server-filesystem".to_string(),
            "/path".to_string(),
        ];

        let (cmd, wrapped_args) = wrap_windows_command("npx", &args);

        assert_eq!(cmd, "cmd");
        assert_eq!(wrapped_args.len(), 5);
        assert_eq!(wrapped_args[0], "/c");
        assert_eq!(wrapped_args[1], "npx");
        assert_eq!(wrapped_args[2], "-y");
        assert_eq!(wrapped_args[3], "@modelcontextprotocol/server-filesystem");
        assert_eq!(wrapped_args[4], "/path");
    }

    /// TC-WRAPPER-004: 包装无参数命令
    #[test]
    fn test_tc_wrapper_004_wrap_command_without_args() {
        let (cmd, wrapped_args) = wrap_windows_command("node", &[]);

        assert_eq!(cmd, "cmd");
        assert_eq!(wrapped_args.len(), 2);
        assert_eq!(wrapped_args[0], "/c");
        assert_eq!(wrapped_args[1], "node");
    }

    /// TC-WRAPPER-005: 包装 yarn 命令
    #[test]
    fn test_tc_wrapper_005_wrap_yarn_command() {
        let args = vec!["dlx".to_string(), "some-package".to_string()];
        let (cmd, wrapped_args) = wrap_windows_command("yarn", &args);

        assert_eq!(cmd, "cmd");
        assert_eq!(wrapped_args[0], "/c");
        assert_eq!(wrapped_args[1], "yarn");
        assert_eq!(wrapped_args[2], "dlx");
    }

    /// TC-WRAPPER-006: 大小写不敏感匹配
    #[test]
    fn test_tc_wrapper_006_case_insensitive() {
        assert!(needs_windows_wrapping("NPX"));
        assert!(needs_windows_wrapping("Npm"));
        assert!(needs_windows_wrapping("NODE"));
        assert!(needs_windows_wrapping("Yarn"));
        assert!(needs_windows_wrapping("PNPM"));
    }

    /// TC-WRAPPER-007: 处理 .cmd 后缀
    #[test]
    fn test_tc_wrapper_007_cmd_suffix() {
        assert!(needs_windows_wrapping("npx.cmd"));
        assert!(needs_windows_wrapping("npm.cmd"));
        assert!(needs_windows_wrapping("node.exe"));
        assert!(needs_windows_wrapping("yarn.cmd"));
    }

    /// TC-WRAPPER-008: 处理带路径的命令（Windows 路径）
    #[test]
    fn test_tc_wrapper_008_windows_path() {
        assert!(needs_windows_wrapping("C:\\Program Files\\nodejs\\npx.cmd"));
        assert!(needs_windows_wrapping("C:\\nodejs\\npm.cmd"));
        assert!(needs_windows_wrapping("D:\\tools\\node.exe"));
    }

    /// TC-WRAPPER-009: 处理带路径的命令（Unix 路径）
    #[test]
    fn test_tc_wrapper_009_unix_path() {
        assert!(needs_windows_wrapping("/usr/local/bin/npx"));
        assert!(needs_windows_wrapping("/usr/bin/npm"));
        assert!(needs_windows_wrapping("/opt/node/bin/node"));
    }
}
