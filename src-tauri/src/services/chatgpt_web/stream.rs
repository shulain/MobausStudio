//! SSE 流解析与转换模块
//!
//! 从上游 Responses API 的 SSE 流中逐行解析事件，
//! 通过 transform 模块转换为标准 Chat Completions chunk 格式，
//! 最终通过 Tauri 事件系统发送给前端。
//!
//! @module services/chatgpt_web/stream
//! @version 0.1.0

use super::transform::{responses_event_to_chunks, StreamContext};
use super::types::ResponsesStreamEvent;
use log::{debug, error, info, warn};

/// 处理上游 SSE 流，将 Responses 事件转换为 Chat Completions chunks
///
/// @param response 上游 rquest HTTP 响应（SSE 流）
/// @param model 客户端请求的原始模型名
/// @param include_usage 是否在最后发送 usage 信息
/// @param callback 每个转换后的 chunk 的回调函数（序列化为 JSON 字符串）
/// @returns 流处理结果
pub async fn process_sse_stream<F>(
    mut response: rquest::Response,
    model: &str,
    include_usage: bool,
    mut callback: F,
) -> Result<(), String>
where
    F: FnMut(StreamEvent) -> Result<(), String>,
{
    let mut ctx = StreamContext::new(model, include_usage);
    let mut buffer = String::new();
    let mut received_valid_sse = false;
    let mut done_sent = false;

    info!("[SSE Stream] 开始处理 SSE 流，模型: {}", model);

    // 逐 chunk 读取响应体（显式 loop/match 区分网络错误与正常 EOF）
    loop {
        match response.chunk().await {
            // 正常 EOF：流已完整读取
            Ok(None) => break,
            // 网络/TLS 读取错误：不能伪装成正常完成
            Err(e) => {
                let err_msg = format!("SSE 流读取错误: {}", e);
                error!("[SSE Stream] {}", err_msg);
                callback(StreamEvent::Error(err_msg.clone()))?;
                return Err(err_msg);
            }
            // 正常数据块
            Ok(Some(chunk)) => {
                let s = String::from_utf8_lossy(&chunk);
                buffer.push_str(&s);
            }
        }

        // 检测响应格式是否正确
        if !received_valid_sse && buffer.len() > 50 {
            let buffer_lower = buffer.to_lowercase();
            if buffer_lower.contains("<!doctype") || buffer_lower.contains("<html") {
                let preview: String = buffer.chars().take(200).collect();
                error!(
                    "[SSE Stream] 响应格式错误：收到 HTML 而不是 SSE 流，预览: {}",
                    preview
                );
                return Err(format!(
                    "API 响应格式错误：收到 HTML 页面而不是流式数据。\n响应预览：{}",
                    preview
                ));
            }
            if buffer.contains("data:") {
                received_valid_sse = true;
            }
        }

        // 按 \n\n 分割 SSE 事件块
        while let Some(pos) = buffer.find("\n\n") {
            let block: String = buffer.drain(..pos + 2).collect();

            for line in block.lines() {
                let line = line.trim();

                // 跳过 SSE 注释和空行
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                // 提取 data: 前缀后的内容
                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        debug!("[SSE Stream] 收到 [DONE] 信号");
                        if !done_sent {
                            callback(StreamEvent::Done)?;
                            done_sent = true;
                        }
                        continue;
                    }

                    // 解析 JSON 事件
                    match serde_json::from_str::<ResponsesStreamEvent>(data_str) {
                        Ok(event) => {
                            debug!("[SSE Stream] 事件类型: {}", event.event_type);

                            // response.failed: 上游失败，透传错误信息而非伪装成正常完成
                            if event.event_type == "response.failed" {
                                let (error_type, error_msg) = extract_failed_error(&event);
                                error!("[SSE Stream] response.failed: type={}, msg={}", error_type, error_msg);
                                callback(StreamEvent::Error(error_msg.clone()))?;
                                return Err(error_msg);
                            }

                            // 转换为 Chat Completions chunks
                            let chunks = responses_event_to_chunks(&event, &mut ctx);

                            for chunk in chunks {
                                let json_str = serde_json::to_string(&chunk)
                                    .map_err(|e| format!("序列化 chunk 失败: {}", e))?;
                                callback(StreamEvent::Chunk(json_str))?;
                            }
                        }
                        Err(e) => {
                            // 某些事件可能不符合预期格式，记录但不中断
                            warn!(
                                "[SSE Stream] 解析事件失败: {}，原始数据: {}",
                                e,
                                &data_str[..data_str.len().min(200)]
                            );
                        }
                    }
                }
            }
        }
    }

    // 处理缓冲区中可能剩余的数据
    if !buffer.trim().is_empty() {
        debug!("[SSE Stream] 处理剩余缓冲区数据: {}", buffer.len());
        for line in buffer.lines() {
            let line = line.trim();
            if let Some(data_str) = line.strip_prefix("data: ") {
                if data_str == "[DONE]" {
                    if !done_sent {
                        callback(StreamEvent::Done)?;
                        done_sent = true;
                    }
                } else if let Ok(event) = serde_json::from_str::<ResponsesStreamEvent>(data_str) {
                    // 剩余缓冲区中也可能包含 response.failed
                    if event.event_type == "response.failed" {
                        let (_error_type, error_msg) = extract_failed_error(&event);
                        error!("[SSE Stream] response.failed (缓冲区): {}", error_msg);
                        callback(StreamEvent::Error(error_msg.clone()))?;
                        return Err(error_msg);
                    }
                    let chunks = responses_event_to_chunks(&event, &mut ctx);
                    for chunk in chunks {
                        let json_str = serde_json::to_string(&chunk)
                            .map_err(|e| format!("序列化 chunk 失败: {}", e))?;
                        callback(StreamEvent::Chunk(json_str))?;
                    }
                }
            }
        }
    }

    if !done_sent {
        debug!("[SSE Stream] 流结束，未收到 [DONE] 信号，兜底发送 Done");
        callback(StreamEvent::Done)?;
    }

    info!("[SSE Stream] 流处理完成");
    Ok(())
}

/// SSE 流事件（转换后）
pub enum StreamEvent {
    /// 一个 Chat Completions chunk（JSON 字符串）
    Chunk(String),
    /// 流结束信号
    Done,
    /// 上游错误（response.failed 或网络读取错误）
    Error(String),
}

/// 从 response.failed 事件中提取错误信息
///
/// 返回 (error_type, error_message) 元组。
/// 若事件中没有 error 详情，error_message 回退为默认提示，error_type 为空字符串。
///
/// @param event response.failed 类型的 SSE 事件
/// @returns (error_type, error_message)
pub fn extract_failed_error(event: &ResponsesStreamEvent) -> (String, String) {
    let error_msg = event
        .response
        .as_ref()
        .and_then(|r| r.error.as_ref())
        .and_then(|e| e.message.as_ref())
        .cloned()
        .unwrap_or_else(|| "上游响应失败（未提供错误详情）".to_string());
    let error_type = event
        .response
        .as_ref()
        .and_then(|r| r.error.as_ref())
        .and_then(|e| e.error_type.as_ref())
        .cloned()
        .unwrap_or_default();
    (error_type, error_msg)
}
