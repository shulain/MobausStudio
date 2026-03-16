//! stdio 传输层实现
//!
//! 通过子进程的 stdin/stdout 与本地 MCP 服务器通信
//! 消息格式: 每行一个 JSON-RPC 消息，换行符分隔
//!
//! v2.7.0: 添加优雅停止支持
//! - 先关闭 stdin 通知子进程输入结束
//! - 发送 SIGTERM 信号让进程自行清理
//! - 等待进程退出（带超时）
//! - 超时后发送 SIGKILL 强制终止

use crate::mcp::error::MCPError;
use crate::mcp::protocol::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use crate::mcp::transport::MCPTransport;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// 默认请求超时时间 (秒)
const DEFAULT_REQUEST_TIMEOUT: u64 = 30;

/// 优雅停止超时时间 (秒)
/// 发送 SIGTERM 后等待进程自行退出的时间
const GRACEFUL_SHUTDOWN_TIMEOUT: u64 = 5;

/// stdio 传输层
///
/// 通过子进程的 stdin/stdout 与 MCP 服务器通信
pub struct StdioTransport {
    /// 子进程句柄
    child: Arc<Mutex<Child>>,
    /// stdin 写入器
    stdin: Arc<Mutex<ChildStdin>>,
    /// stdout 读取器
    stdout: Arc<Mutex<BufReader<ChildStdout>>>,
    /// 请求 ID 计数器
    request_id: AtomicU64,
    /// 是否活跃
    alive: AtomicBool,
}

impl StdioTransport {
    /// 创建 stdio 传输并启动子进程
    ///
    /// # 参数
    /// - `command`: 启动命令 (如 "npx", "node")
    /// - `args`: 命令参数 (如 ["-y", "@modelcontextprotocol/server-filesystem"])
    /// - `env`: 环境变量
    ///
    /// # 示例
    /// ```ignore
    /// let transport = StdioTransport::new(
    ///     "npx",
    ///     &["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string()],
    ///     &HashMap::new(),
    /// ).await?;
    /// ```
    pub async fn new(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self, MCPError> {
        log::info!("[MCP stdio] 启动服务器进程: {} {:?}", command, args);

        // 构建命令
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true); // tokio: 当 Child 对象 drop 时自动 kill 子进程

        // Unix: 设置子进程在父进程退出时自动终止
        #[cfg(unix)]
        {
            #[allow(unused_imports)]
            use std::os::unix::process::CommandExt;

            // Linux: 使用 prctl 设置 PR_SET_PDEATHSIG
            // 当父进程退出时，子进程会收到 SIGTERM 信号
            #[cfg(target_os = "linux")]
            unsafe {
                cmd.pre_exec(|| {
                    libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                    Ok(())
                });
            }
            // macOS: 没有 PR_SET_PDEATHSIG，依赖 kill_on_drop
            // 如果父进程被 SIGKILL，子进程可能成为孤儿
            // 但这种情况比较少见，暂时接受这个限制
        }

        // macOS/Linux: 确保 PATH 包含常见的 Node.js 安装路径
        // GUI 应用不会继承 shell 的 PATH 配置，需要手动添加
        #[cfg(unix)]
        {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let home_dir = std::env::var("HOME").unwrap_or_default();

            // 预先计算需要格式化的路径
            let nvm_path = format!("{}/.nvm/versions/node/*/bin", home_dir);
            let fnm_path = format!("{}/.local/share/fnm/aliases/default/bin", home_dir);

            let additional_paths: Vec<&str> = vec![
                "/usr/local/bin",
                "/opt/homebrew/bin",          // macOS Apple Silicon Homebrew
                "/opt/local/bin",             // MacPorts
                "/usr/local/opt/node/bin",    // Homebrew Node.js
                "/opt/homebrew/opt/node/bin", // Apple Silicon Homebrew Node.js
                &nvm_path,                    // nvm 路径
                &fnm_path,                    // fnm 路径
            ];

            // 构建扩展的 PATH（展开通配符）
            let mut extended_paths: Vec<String> = Vec::new();
            for path in &additional_paths {
                if path.contains('*') {
                    // 展开通配符
                    if let Ok(entries) = glob::glob(path) {
                        for entry in entries.flatten() {
                            extended_paths.push(entry.to_string_lossy().to_string());
                        }
                    }
                } else {
                    extended_paths.push(path.to_string());
                }
            }

            let new_path = format!("{}:{}", extended_paths.join(":"), current_path);
            cmd.env("PATH", &new_path);
            log::debug!("[MCP stdio] 扩展 PATH: {}", new_path);
        }

        // 设置用户指定的环境变量
        for (key, value) in env {
            cmd.env(key, value);
            log::debug!("[MCP stdio] 设置环境变量: {}={}", key, value);
        }

        // 启动子进程
        let mut child = cmd
            .spawn()
            .map_err(|e| MCPError::SpawnFailed(format!("{}: {}", command, e)))?;

        // 获取 stdin/stdout
        let stdin = child.stdin.take().ok_or(MCPError::StdinNotAvailable)?;

        let stdout = child.stdout.take().ok_or(MCPError::StdoutNotAvailable)?;

        log::info!("[MCP stdio] 服务器进程已启动");

        Ok(Self {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            stdout: Arc::new(Mutex::new(BufReader::new(stdout))),
            request_id: AtomicU64::new(1),
            alive: AtomicBool::new(true),
        })
    }

    /// 获取下一个请求 ID
    fn next_request_id(&self) -> u64 {
        self.request_id.fetch_add(1, Ordering::SeqCst)
    }

    /// 发送原始消息
    async fn send_raw(&self, message: &str) -> Result<(), MCPError> {
        let mut stdin = self.stdin.lock().await;

        // 确保消息以换行符结尾
        let msg = if message.ends_with('\n') {
            message.to_string()
        } else {
            format!("{}\n", message)
        };

        log::debug!("[MCP stdio] 发送: {}", msg.trim());

        stdin
            .write_all(msg.as_bytes())
            .await
            .map_err(|e| MCPError::WriteFailed(e.to_string()))?;

        stdin
            .flush()
            .await
            .map_err(|e| MCPError::WriteFailed(e.to_string()))?;

        Ok(())
    }

    /// 读取一行响应
    async fn read_line(&self) -> Result<String, MCPError> {
        let mut stdout = self.stdout.lock().await;
        let mut line = String::new();

        stdout
            .read_line(&mut line)
            .await
            .map_err(|e| MCPError::ReadFailed(e.to_string()))?;

        if line.is_empty() {
            return Err(MCPError::ReadFailed("服务器关闭了连接".to_string()));
        }

        log::debug!("[MCP stdio] 收到: {}", line.trim());
        Ok(line)
    }
}

#[async_trait]
impl MCPTransport for StdioTransport {
    /// 发送 JSON-RPC 请求并等待响应
    async fn send_request(&self, method: &str, params: Value) -> Result<Value, MCPError> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(MCPError::NotConnected);
        }

        let id = self.next_request_id();

        // 构建请求
        let request = JsonRpcRequest::new(id, method, Some(params));
        let request_str = serde_json::to_string(&request)?;

        // 发送请求
        self.send_raw(&request_str).await?;

        // 等待响应 (带超时)
        let response_line = timeout(
            Duration::from_secs(DEFAULT_REQUEST_TIMEOUT),
            self.read_line(),
        )
        .await
        .map_err(|_| MCPError::Timeout)??;

        // 解析响应
        let response: JsonRpcResponse = serde_json::from_str(&response_line)?;

        // 检查响应 ID 是否匹配
        if response.id != id {
            log::warn!(
                "[MCP stdio] 响应 ID 不匹配: 期望 {}, 实际 {}",
                id,
                response.id
            );
        }

        // 检查错误
        if let Some(error) = response.error {
            return Err(MCPError::ServerError {
                code: error.code,
                message: error.message,
            });
        }

        // 返回结果
        response.result.ok_or_else(|| MCPError::ServerError {
            code: -1,
            message: "响应中缺少 result 字段".to_string(),
        })
    }

    /// 发送 JSON-RPC 通知
    async fn send_notification(&self, method: &str, params: Value) -> Result<(), MCPError> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(MCPError::NotConnected);
        }

        let notification = JsonRpcNotification::new(method, Some(params));
        let notification_str = serde_json::to_string(&notification)?;

        self.send_raw(&notification_str).await
    }

    /// 关闭传输 (v2.7.0 优雅停止)
    ///
    /// 优雅停止流程：
    /// 1. 标记为不活跃，阻止新请求
    /// 2. 关闭 stdin，通知子进程输入结束
    /// 3. 发送 SIGTERM 信号（Unix）或等待进程退出（Windows）
    /// 4. 等待进程退出（带超时）
    /// 5. 超时后发送 SIGKILL 强制终止
    async fn shutdown(&self) -> Result<(), MCPError> {
        log::info!("[MCP stdio] 开始优雅停止服务器进程");

        // 1. 标记为不活跃
        self.alive.store(false, Ordering::SeqCst);

        // 2. 关闭 stdin，通知子进程输入结束
        {
            let mut stdin = self.stdin.lock().await;
            if let Err(e) = stdin.shutdown().await {
                log::warn!("[MCP stdio] 关闭 stdin 失败: {}", e);
            }
        }
        log::debug!("[MCP stdio] stdin 已关闭");

        let mut child = self.child.lock().await;

        // 3. 检查进程是否已经退出
        match child.try_wait() {
            Ok(Some(status)) => {
                log::info!("[MCP stdio] 进程已退出，状态: {:?}", status);
                return Ok(());
            }
            Ok(None) => {
                // 进程仍在运行，继续优雅停止流程
                log::debug!("[MCP stdio] 进程仍在运行，发送终止信号");
            }
            Err(e) => {
                log::warn!("[MCP stdio] 检查进程状态失败: {}", e);
            }
        }

        // 4. 发送 SIGTERM 信号（Unix）
        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;

            if let Some(pid) = child.id() {
                let pid = Pid::from_raw(pid as i32);
                log::info!("[MCP stdio] 发送 SIGTERM 到进程 {}", pid);
                if let Err(e) = kill(pid, Signal::SIGTERM) {
                    log::warn!("[MCP stdio] 发送 SIGTERM 失败: {}", e);
                }
            }
        }

        // 5. 等待进程退出（带超时）
        log::debug!(
            "[MCP stdio] 等待进程退出，超时: {}秒",
            GRACEFUL_SHUTDOWN_TIMEOUT
        );
        match timeout(Duration::from_secs(GRACEFUL_SHUTDOWN_TIMEOUT), child.wait()).await {
            Ok(Ok(status)) => {
                log::info!("[MCP stdio] 进程优雅退出，状态: {:?}", status);
                return Ok(());
            }
            Ok(Err(e)) => {
                log::warn!("[MCP stdio] 等待进程退出时出错: {}", e);
            }
            Err(_) => {
                log::warn!("[MCP stdio] 等待进程退出超时，将强制终止");
            }
        }

        // 6. 超时后发送 SIGKILL 强制终止
        log::info!("[MCP stdio] 发送 SIGKILL 强制终止进程");
        if let Err(e) = child.kill().await {
            // 如果 kill 失败，可能进程已经退出
            log::warn!("[MCP stdio] 强制终止进程失败: {}", e);
        }

        // 7. 等待进程完全退出
        match child.wait().await {
            Ok(status) => {
                log::info!("[MCP stdio] 进程已强制终止，状态: {:?}", status);
            }
            Err(e) => {
                log::error!("[MCP stdio] 等待进程退出失败: {}", e);
            }
        }

        log::info!("[MCP stdio] 服务器进程已关闭");
        Ok(())
    }

    /// 检查传输是否活跃
    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试请求 ID 递增
    #[tokio::test]
    async fn test_request_id_increment() {
        // 由于我们无法在测试中启动真实的 MCP 服务器，
        // 这里只测试请求 ID 的递增逻辑
        let id = AtomicU64::new(1);
        assert_eq!(id.fetch_add(1, Ordering::SeqCst), 1);
        assert_eq!(id.fetch_add(1, Ordering::SeqCst), 2);
        assert_eq!(id.fetch_add(1, Ordering::SeqCst), 3);
    }
}
