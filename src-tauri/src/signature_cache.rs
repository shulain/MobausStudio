//! Thought Signature 缓存管理
//!
//! 用于管理 Gemini API 的 thought_signature，解决工具调用时的 400 错误

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// 缓存条目过期时间（30 分钟）
const CACHE_TTL: Duration = Duration::from_secs(1800);

/// 最小有效签名长度
const MIN_SIGNATURE_LENGTH: usize = 10;

/// 全局降级签名存储（当 session 缓存未命中时使用）
static GLOBAL_FALLBACK_SIGNATURE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn get_global_signature_storage() -> &'static Mutex<Option<String>> {
    GLOBAL_FALLBACK_SIGNATURE.get_or_init(|| Mutex::new(None))
}

/// 缓存条目
#[derive(Debug, Clone)]
struct CacheEntry {
    value: String,
    created_at: Instant,
}

impl CacheEntry {
    fn new(value: String) -> Self {
        Self {
            value,
            created_at: Instant::now(),
        }
    }

    fn is_expired(&self) -> bool {
        self.created_at.elapsed() > CACHE_TTL
    }
}

/// Thought Signature 缓存
///
/// 用于存储和检索 session 级别的 thought_signature
pub struct SignatureCache {
    /// Session ID -> Thought Signature
    session_signatures: Mutex<HashMap<String, CacheEntry>>,
}

impl SignatureCache {
    fn new() -> Self {
        Self {
            session_signatures: Mutex::new(HashMap::new()),
        }
    }

    /// 获取全局单例
    pub fn global() -> &'static SignatureCache {
        static INSTANCE: OnceLock<SignatureCache> = OnceLock::new();
        INSTANCE.get_or_init(SignatureCache::new)
    }

    /// 缓存 session 的 thought_signature
    pub fn cache_session_signature(&self, session_id: &str, signature: String) {
        if signature.len() < MIN_SIGNATURE_LENGTH {
            return;
        }

        if let Ok(mut cache) = self.session_signatures.lock() {
            log::debug!(
                "[SignatureCache] 缓存 session signature: {} (长度: {})",
                session_id,
                signature.len()
            );
            cache.insert(session_id.to_string(), CacheEntry::new(signature.clone()));

            // 清理过期条目
            cache.retain(|_, v| !v.is_expired());
        }

        // v0.9.2.4: 同时更新全局降级签名（只保存最长的签名）
        if let Ok(mut global) = get_global_signature_storage().lock() {
            let should_update = match &*global {
                None => true,
                Some(existing) => signature.len() > existing.len(),
            };

            if should_update {
                log::debug!(
                    "[SignatureCache] 更新全局降级签名 (长度: {}, 替换旧长度: {:?})",
                    signature.len(),
                    global.as_ref().map(|s| s.len())
                );
                *global = Some(signature);
            }
        }
    }

    /// 获取 session 的 thought_signature（带全局降级）
    pub fn get_session_signature(&self, session_id: &str) -> Option<String> {
        // 优先从 session 缓存获取
        if let Ok(mut cache) = self.session_signatures.lock() {
            if let Some(entry) = cache.get(session_id) {
                if !entry.is_expired() {
                    log::debug!(
                        "[SignatureCache] 命中 session signature: {} (长度: {})",
                        session_id,
                        entry.value.len()
                    );
                    return Some(entry.value.clone());
                } else {
                    // 移除过期条目
                    cache.remove(session_id);
                    log::debug!("[SignatureCache] Session signature 已过期: {}", session_id);
                }
            }
        }

        // v0.9.2.4: Session 缓存未命中时，尝试使用全局降级签名
        if let Ok(global) = get_global_signature_storage().lock() {
            if let Some(fallback_sig) = global.as_ref() {
                log::info!(
                    "[SignatureCache] Session 缓存未命中，使用全局降级签名: {} (长度: {})",
                    session_id,
                    fallback_sig.len()
                );
                return Some(fallback_sig.clone());
            }
        }

        log::warn!(
            "[SignatureCache] 未找到 session signature 且无全局降级: {}",
            session_id
        );
        None
    }

    /// 清理所有缓存（包括全局降级签名）
    #[allow(dead_code)]
    pub fn clear(&self) {
        if let Ok(mut cache) = self.session_signatures.lock() {
            cache.clear();
            log::info!("[SignatureCache] 已清理所有 session 缓存");
        }

        // 同时清理全局降级签名
        if let Ok(mut global) = get_global_signature_storage().lock() {
            *global = None;
            log::info!("[SignatureCache] 已清理全局降级签名");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_cache_and_retrieve() {
        let cache = SignatureCache::new();
        let session_id = "test_session_123";
        let signature = "test_signature_value_12345";

        cache.cache_session_signature(session_id, signature.to_string());
        let retrieved = cache.get_session_signature(session_id);

        assert_eq!(retrieved, Some(signature.to_string()));
    }

    #[test]
    #[serial]
    fn test_global_fallback() {
        let cache = SignatureCache::new();

        // 清理所有缓存
        cache.clear();

        // 先缓存一个签名到 session1
        let session1 = "session_1_fallback_test";
        let signature1 = "signature_value_for_fallback_test_12345";
        cache.cache_session_signature(session1, signature1.to_string());

        // 从不存在的 session2 获取，应该返回全局降级签名
        let session2 = "session_2_not_exist_fallback_test";
        let retrieved = cache.get_session_signature(session2);

        // 应该返回全局降级签名（可能是 signature1，也可能是其他测试设置的更长签名）
        assert!(retrieved.is_some());
        let sig = retrieved.unwrap();
        // 至少应该包含我们设置的签名长度
        assert!(sig.len() >= signature1.len());
    }

    #[test]
    #[serial]
    fn test_global_fallback_prefers_longer() {
        let cache = SignatureCache::new();

        // 清理所有缓存
        cache.clear();

        // 先缓存一个短签名
        cache.cache_session_signature("session1_longer_test", "short_sig_123".to_string());

        // 再缓存一个长签名
        let long_sig = "very_long_signature_value_for_longer_test_12345678";
        cache.cache_session_signature("session2_longer_test", long_sig.to_string());

        // 从不存在的 session 获取，应该返回更长的签名
        let retrieved = cache.get_session_signature("non_existent_longer_test");
        assert_eq!(retrieved, Some(long_sig.to_string()));
    }

    #[test]
    #[serial]
    fn test_min_length_filter() {
        let cache = SignatureCache::new();

        // 先清理全局状态，避免其他测试的影响
        cache.clear();

        let session_id = "test_session_min_length";
        let short_signature = "short"; // 长度 < 10

        cache.cache_session_signature(session_id, short_signature.to_string());
        let retrieved = cache.get_session_signature(session_id);

        // 应该返回 None，因为短签名被过滤了，且没有全局降级
        assert_eq!(retrieved, None);
    }
}
