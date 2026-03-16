//! Google 协议优化测试
//!
//! 测试端点降级和重试机制

#[cfg(test)]
mod tests {
    use super::super::google::GoogleProtocol;

    /// TC-GOOGLE-OPT-001: 测试端点降级判断逻辑
    #[test]
    fn test_should_try_next_endpoint() {
        use reqwest::StatusCode;

        // 应该降级的状态码
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::TOO_MANY_REQUESTS
        )); // 429
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::REQUEST_TIMEOUT
        )); // 408
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::NOT_FOUND
        )); // 404
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::INTERNAL_SERVER_ERROR
        )); // 500
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::BAD_GATEWAY
        )); // 502
        assert!(GoogleProtocol::should_try_next_endpoint(
            StatusCode::SERVICE_UNAVAILABLE
        )); // 503

        // 不应该降级的状态码
        assert!(!GoogleProtocol::should_try_next_endpoint(
            StatusCode::BAD_REQUEST
        )); // 400
        assert!(!GoogleProtocol::should_try_next_endpoint(
            StatusCode::UNAUTHORIZED
        )); // 401
        assert!(!GoogleProtocol::should_try_next_endpoint(
            StatusCode::FORBIDDEN
        )); // 403
        assert!(!GoogleProtocol::should_try_next_endpoint(StatusCode::OK)); // 200
    }

    /// TC-GOOGLE-OPT-002: 测试重试策略判断
    #[test]
    fn test_determine_retry_strategy() {
        use super::super::google::RetryStrategy;

        // 429 应该使用线性退避
        match GoogleProtocol::determine_retry_strategy(429) {
            RetryStrategy::LinearBackoff { base_ms } => {
                assert_eq!(base_ms, 5000);
            }
            _ => panic!("429 应该使用线性退避"),
        }

        // 503 应该使用指数退避
        match GoogleProtocol::determine_retry_strategy(503) {
            RetryStrategy::ExponentialBackoff { base_ms, max_ms } => {
                assert_eq!(base_ms, 10000);
                assert_eq!(max_ms, 60000);
            }
            _ => panic!("503 应该使用指数退避"),
        }

        // 500 应该使用线性退避
        match GoogleProtocol::determine_retry_strategy(500) {
            RetryStrategy::LinearBackoff { base_ms } => {
                assert_eq!(base_ms, 3000);
            }
            _ => panic!("500 应该使用线性退避"),
        }

        // 401/403 应该使用固定延迟
        match GoogleProtocol::determine_retry_strategy(401) {
            RetryStrategy::FixedDelay(_) => {}
            _ => panic!("401 应该使用固定延迟"),
        }

        // 400 不应该重试
        match GoogleProtocol::determine_retry_strategy(400) {
            RetryStrategy::NoRetry => {}
            _ => panic!("400 不应该重试"),
        }
    }

    /// TC-GOOGLE-OPT-003: 测试模型名称映射
    #[test]
    fn test_map_model_name() {
        // Gemini 3 Pro 系列
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro-preview"),
            "gemini-3-pro-low"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro"),
            "gemini-3-pro-low"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro-high"),
            "gemini-3-pro-high"
        );

        // Gemini 2.5 系列
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-2.5-flash-001"),
            "gemini-2.5-flash"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-2.5-pro-002"),
            "gemini-2.5-pro"
        );

        // Claude 系列
        assert_eq!(
            GoogleProtocol::map_model_name("claude-sonnet-4-5"),
            "claude-sonnet-4-5"
        );
    }

    /// TC-GOOGLE-OPT-004: 测试 OAuth Token 检测
    #[test]
    fn test_is_oauth_token() {
        // OAuth Token 格式
        assert!(GoogleProtocol::is_oauth_token("ya29.xxx"));
        assert!(GoogleProtocol::is_oauth_token("1//xxx"));

        // API Key 格式
        assert!(!GoogleProtocol::is_oauth_token("AIzaSyXXX"));
    }
}
