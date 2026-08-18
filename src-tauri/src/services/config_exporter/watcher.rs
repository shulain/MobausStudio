//! 配置文件监听服务
//!
//! 监听外部工具的配置文件变化，当检测到提供商被删除时，自动更新启用状态

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use super::enabled_state::EnabledState;
use super::error::ConfigExportError;

/// 全局标志：是否正在写入配置（用于避免监听器误判）
static WRITING_CONFIG: AtomicBool = AtomicBool::new(false);

/// 设置"正在写入配置"标志
pub fn set_writing_config(writing: bool) {
    WRITING_CONFIG.store(writing, Ordering::SeqCst);
}

/// 配置文件监听器
pub struct ConfigWatcher {
    /// 数据目录（用于读写 tool_enabled_state.json）
    data_dir: PathBuf,
    /// 文件监听器
    _watcher: RecommendedWatcher,
    /// 事件接收器
    receiver: Arc<Mutex<Receiver<notify::Result<Event>>>>,
}

impl ConfigWatcher {
    /// 创建配置文件监听器
    ///
    /// # 参数
    /// - `data_dir`: 数据目录（用于读写 tool_enabled_state.json）
    /// - `opencode_config_path`: OpenCode 配置文件路径
    pub fn new(
        data_dir: PathBuf,
        opencode_config_path: PathBuf,
    ) -> Result<Self, ConfigExportError> {
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(
            move |res| {
                if let Err(e) = tx.send(res) {
                    log::error!("[ConfigWatcher] 发送事件失败: {}", e);
                }
            },
            Config::default(),
        )
        .map_err(|e| ConfigExportError::IoError(std::io::Error::other(e)))?;

        // 监听 OpenCode 配置文件
        if opencode_config_path.exists() {
            watcher
                .watch(&opencode_config_path, RecursiveMode::NonRecursive)
                .map_err(|e| ConfigExportError::IoError(std::io::Error::other(e)))?;
            log::info!(
                "[ConfigWatcher] 开始监听 OpenCode 配置文件: {:?}",
                opencode_config_path
            );
        } else {
            log::warn!(
                "[ConfigWatcher] OpenCode 配置文件不存在: {:?}",
                opencode_config_path
            );
        }

        let watcher_instance = Self {
            data_dir: data_dir.clone(),
            _watcher: watcher,
            receiver: Arc::new(Mutex::new(rx)),
        };

        // 启动时检查一次配置一致性
        if let Err(e) = watcher_instance.check_consistency() {
            log::error!("[ConfigWatcher] 启动时检查配置一致性失败: {}", e);
        }

        Ok(watcher_instance)
    }

    /// 启动监听循环（在后台线程中运行）
    pub fn start(self) {
        thread::spawn(move || {
            log::info!("[ConfigWatcher] 监听循环已启动");

            loop {
                // 从接收器中获取事件
                // 容忍锁中毒：持锁线程 panic 后若直接 unwrap，监听循环会随之终止，
                // 配置文件变更将不再被感知且无任何提示
                let event = {
                    let rx = self.receiver.lock().unwrap_or_else(|poisoned| {
                        log::warn!("[ConfigWatcher] 检测到接收器锁中毒，恢复后继续监听");
                        poisoned.into_inner()
                    });
                    rx.recv_timeout(Duration::from_secs(1))
                };

                match event {
                    Ok(Ok(event)) => {
                        // 处理文件变化事件
                        if let Err(e) = self.handle_event(event) {
                            log::error!("[ConfigWatcher] 处理事件失败: {}", e);
                        }
                    }
                    Ok(Err(e)) => {
                        log::error!("[ConfigWatcher] 监听错误: {}", e);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // 超时，继续循环
                        continue;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        log::warn!("[ConfigWatcher] 监听通道已断开，退出循环");
                        break;
                    }
                }
            }

            log::info!("[ConfigWatcher] 监听循环已退出");
        });
    }

    /// 处理文件变化事件
    fn handle_event(&self, event: Event) -> Result<(), ConfigExportError> {
        // 只处理修改和删除事件
        match event.kind {
            EventKind::Modify(_) | EventKind::Remove(_) => {
                log::info!("[ConfigWatcher] 检测到配置文件变化: {:?}", event.kind);

                // 如果正在写入配置，忽略此次变化
                if WRITING_CONFIG.load(Ordering::SeqCst) {
                    log::info!("[ConfigWatcher] 正在写入配置，忽略此次变化");
                    return Ok(());
                }

                // 延迟一段时间，确保文件写入完成
                thread::sleep(Duration::from_millis(200));

                // 再次检查是否正在写入
                if WRITING_CONFIG.load(Ordering::SeqCst) {
                    log::info!("[ConfigWatcher] 延迟后检测到正在写入配置，忽略此次变化");
                    return Ok(());
                }

                // 读取 OpenCode 配置文件
                let (opencode_providers, disabled_providers) = self.read_opencode_config()?;

                // 加载当前启用状态
                let mut enabled_state = EnabledState::load(&self.data_dir)?;

                // 检查 opencode 工具启用的提供商是否还存在或被禁用
                if let Some(enabled_provider_id) = enabled_state.enabled_providers.get("opencode") {
                    let is_deleted = !opencode_providers.contains(enabled_provider_id);
                    let is_disabled = disabled_providers.contains(enabled_provider_id);

                    if is_deleted || is_disabled {
                        log::info!(
                            "[ConfigWatcher] OpenCode 提供商 {} 已{}，清除启用状态",
                            enabled_provider_id,
                            if is_deleted { "被删除" } else { "被禁用" }
                        );
                        enabled_state.clear_enabled_provider("opencode");
                        enabled_state.save(&self.data_dir)?;
                    } else {
                        log::debug!(
                            "[ConfigWatcher] OpenCode 提供商 {} 仍然存在且未被禁用，无需清除",
                            enabled_provider_id
                        );
                    }
                }
            }
            _ => {
                // 忽略其他事件
            }
        }

        Ok(())
    }

    /// 读取 OpenCode 配置文件中的提供商列表和禁用列表
    ///
    /// # 返回
    /// - `(providers, disabled_providers)`: 提供商ID列表和禁用的提供商ID列表
    fn read_opencode_config(&self) -> Result<(Vec<String>, Vec<String>), ConfigExportError> {
        let opencode_config_path = dirs::home_dir()
            .ok_or_else(|| {
                ConfigExportError::IoError(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "无法获取用户目录",
                ))
            })?
            .join(".config")
            .join("opencode")
            .join("opencode.json");

        if !opencode_config_path.exists() {
            return Ok((Vec::new(), Vec::new()));
        }

        let content =
            std::fs::read_to_string(&opencode_config_path).map_err(ConfigExportError::IoError)?;

        let config: serde_json::Value = serde_json::from_str(&content)?;

        // 读取提供商列表
        let providers = config
            .get("provider")
            .and_then(|p| p.as_object())
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();

        // 读取禁用的提供商列表
        let disabled_providers = config
            .get("disabled_providers")
            .and_then(|d| d.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok((providers, disabled_providers))
    }

    /// 检查配置一致性
    ///
    /// 检查启用状态中的提供商是否还存在于 OpenCode 配置中或被禁用
    fn check_consistency(&self) -> Result<(), ConfigExportError> {
        log::info!("[ConfigWatcher] 检查配置一致性");

        // 读取 OpenCode 配置文件中的提供商列表和禁用列表
        let (opencode_providers, disabled_providers) = self.read_opencode_config()?;

        // 加载当前启用状态
        let mut enabled_state = EnabledState::load(&self.data_dir)?;

        // 检查 opencode 工具启用的提供商是否还存在或被禁用
        if let Some(enabled_provider_id) = enabled_state.enabled_providers.get("opencode") {
            let is_deleted = !opencode_providers.contains(enabled_provider_id);
            let is_disabled = disabled_providers.contains(enabled_provider_id);

            if is_deleted || is_disabled {
                log::info!(
                    "[ConfigWatcher] OpenCode 提供商 {} 已{}，清除启用状态",
                    enabled_provider_id,
                    if is_deleted { "被删除" } else { "被禁用" }
                );
                enabled_state.clear_enabled_provider("opencode");
                enabled_state.save(&self.data_dir)?;
            }
        }

        Ok(())
    }
}
