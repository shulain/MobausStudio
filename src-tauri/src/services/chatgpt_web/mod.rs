//! ChatGPT Web 订阅代理模块
//!
//! 将标准 OpenAI Chat Completions API 请求转换为 ChatGPT 内部 Codex Responses API 格式，
//! 通过具有浏览器指纹伪装的 HTTP 客户端发送请求，并将响应流转换回标准格式。
//!
//! 架构：
//! - `types`: 数据结构定义（请求/响应/SSE 事件）
//! - `transform`: 协议转换（Chat Completions ⇔ Responses API）
//! - `client`: 具有 TLS 指纹伪装的 HTTP 客户端
//! - `oauth`: OpenAI OAuth 认证与 Token 刷新
//! - `stream`: SSE 流解析与转换
//!
//! @module services/chatgpt_web
//! @version 0.1.0

pub mod client;
pub mod oauth;
pub mod stream;
pub mod transform;
pub mod types;

#[cfg(test)]
mod tests;
