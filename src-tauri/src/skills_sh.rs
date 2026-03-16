//! skills.sh 技能市场集成模块 (v3.0.23)
//!
//! 负责从 skills.sh 获取技能列表和搜索功能。
//! - 搜索：使用 /api/search API
//! - 列表：抓取 HTML 页面解析 initialSkills 数组
//! - 缓存：使用静态缓存避免重复请求

use log::{debug, error, info};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// 技能缓存类型别名
type SkillsCacheData = (Vec<SkillsShItem>, Instant);

/// 全局技能列表缓存
static SKILLS_CACHE: Lazy<RwLock<Option<SkillsCacheData>>> = Lazy::new(|| RwLock::new(None));

/// 缓存有效期（5分钟）
const CACHE_DURATION: Duration = Duration::from_secs(300);

/// skills.sh 获取参数
#[derive(Debug, Deserialize)]
pub struct SkillsShFetchParams {
    /// 每页数量（默认20）
    pub limit: Option<u32>,
    /// 偏移量（默认0）
    pub offset: Option<u32>,
    /// 搜索关键词
    pub search: Option<String>,
}

/// skills.sh 技能项 (v3.0.6, v3.0.23 更新字段名)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsShItem {
    /// 技能 ID（短名称，如 find-skills）
    #[serde(rename = "skillId")]
    pub skill_id: String,
    /// 技能名称
    pub name: String,
    /// 安装次数
    pub installs: u64,
    /// 来源仓库（格式：owner/repo）
    /// v3.0.23: skills.sh API 将 topSource 改为 source
    pub source: String,
    /// 技能唯一标识符（完整路径，如 vercel-labs/skills/find-skills）
    /// v3.0.23: 从 source 和 skillId 组合生成
    #[serde(skip_deserializing, default = "String::new")]
    pub id: String,
}

/// skills.sh API 响应 (v3.0.6)
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillsShResponse {
    /// 技能列表
    pub skills: Vec<SkillsShItem>,
    /// 是否有更多数据
    #[serde(rename = "hasMore")]
    pub has_more: bool,
}

/// 从 skills.sh 获取技能列表（HTML 抓取模式）(v3.0.23)
///
/// 由于 skills.sh 移除了 REST API，现在通过抓取 HTML 页面并解析嵌入的 initialSkills 数据。
///
/// # 工作原理
/// 1. 抓取 https://skills.sh/ 的 HTML 页面
/// 2. 解析页面中的 `self.__next_f.push()` 调用
/// 3. 提取 JSON 格式的技能数据
/// 4. 应用搜索过滤和分页
///
/// # 参数
/// - `params`: 分页和搜索参数
///
/// # 返回
/// - 成功: SkillsShResponse
/// - 失败: 错误信息
pub async fn fetch_skills_sh(params: SkillsShFetchParams) -> Result<SkillsShResponse, String> {
    info!("[fetch_skills_sh] 开始获取 skills.sh 技能列表");

    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);

    // 创建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            error!("[fetch_skills_sh] 创建 HTTP 客户端失败: {}", e);
            format!("创建 HTTP 客户端失败: {}", e)
        })?;

    // v3.0.23: 判断是搜索还是列表
    let is_search = params.search.as_ref().is_some_and(|s| !s.is_empty());

    let all_skills = if is_search {
        // 使用搜索 API
        let search_term = params.search.as_ref().unwrap();

        // v3.0.23: 搜索 API 不支持 offset，一次性获取所有结果
        let url = format!(
            "https://skills.sh/api/search?q={}&limit=1000",
            urlencoding::encode(search_term)
        );
        debug!("[fetch_skills_sh] 搜索 API: {}", url);

        let response = client
            .get(&url)
            .header("User-Agent", "MobausStudio/1.0")
            .send()
            .await
            .map_err(|e| {
                error!("[fetch_skills_sh] 搜索请求失败: {}", e);
                format!("搜索请求失败: {}", e)
            })?;

        let status = response.status();
        debug!("[fetch_skills_sh] 响应状态码: {}", status.as_u16());

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!(
                "[fetch_skills_sh] 搜索 API 错误: {} - {}",
                status.as_u16(),
                error_text
            );
            return Err(format!(
                "搜索 API 错误 ({}): {}",
                status.as_u16(),
                error_text
            ));
        }

        // 解析搜索响应
        #[derive(Deserialize)]
        struct SearchResponse {
            skills: Vec<SkillsShItem>,
        }

        let search_result: SearchResponse = response.json().await.map_err(|e| {
            error!("[fetch_skills_sh] 解析搜索响应失败: {}", e);
            format!("解析搜索响应失败: {}", e)
        })?;

        // 为每个技能生成 id（已经在 JSON 中有了）
        let mut skills = search_result.skills;
        for skill in &mut skills {
            if skill.id.is_empty() {
                skill.id = format!("{}/{}", skill.source, skill.skill_id);
            }
        }

        info!(
            "[fetch_skills_sh] 搜索 '{}' 返回 {} 个技能",
            search_term,
            skills.len()
        );

        skills
    } else {
        // 检查缓存
        {
            let cache = SKILLS_CACHE.read().unwrap();
            if let Some((cached_skills, cached_time)) = cache.as_ref() {
                if cached_time.elapsed() < CACHE_DURATION {
                    info!(
                        "[fetch_skills_sh] 使用缓存数据（{}个技能，缓存时间：{:.1}秒前）",
                        cached_skills.len(),
                        cached_time.elapsed().as_secs_f32()
                    );
                    return apply_pagination(cached_skills.clone(), limit, offset);
                }
            }
        }

        // 抓取 HTML 页面获取全部技能列表
        let url = "https://skills.sh/";
        debug!("[fetch_skills_sh] 抓取 HTML: {}", url);

        let response = client
            .get(url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            )
            .send()
            .await
            .map_err(|e| {
                error!("[fetch_skills_sh] 网络请求失败: {}", e);
                if e.is_timeout() {
                    "请求超时，请检查网络连接".to_string()
                } else if e.is_connect() {
                    "无法连接到 skills.sh，请检查网络".to_string()
                } else {
                    format!("网络请求失败: {}", e)
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!(
                "[fetch_skills_sh] HTTP 错误: {} - {}",
                status.as_u16(),
                error_text
            );
            return Err(format!(
                "skills.sh HTTP 错误 ({}): {}",
                status.as_u16(),
                error_text
            ));
        }

        let html = response.text().await.map_err(|e| {
            error!("[fetch_skills_sh] 读取 HTML 失败: {}", e);
            format!("读取 HTML 失败: {}", e)
        })?;

        // 解析 HTML 中的 initialSkills 数据
        let skills = parse_skills_from_html(&html)?;

        info!("[fetch_skills_sh] 从 HTML 解析出 {} 个技能", skills.len());

        // 更新缓存
        {
            let mut cache = SKILLS_CACHE.write().unwrap();
            *cache = Some((skills.clone(), Instant::now()));
            info!("[fetch_skills_sh] 已更新缓存");
        }

        skills
    };

    // 搜索和列表模式都应用分页
    apply_pagination(all_skills, limit, offset)
}

/// 应用分页逻辑
pub fn apply_pagination(
    skills: Vec<SkillsShItem>,
    limit: u32,
    offset: u32,
) -> Result<SkillsShResponse, String> {
    let total = skills.len();
    let start = offset.min(total as u32) as usize;
    let end = ((offset + limit).min(total as u32)) as usize;
    let paginated_skills: Vec<SkillsShItem> = skills[start..end].to_vec();
    let has_more = end < total;

    info!(
        "[fetch_skills_sh] 返回 {} 个技能 (offset={}, limit={}, total={}, hasMore={})",
        paginated_skills.len(),
        offset,
        limit,
        total,
        has_more
    );

    Ok(SkillsShResponse {
        skills: paginated_skills,
        has_more,
    })
}

/// 从 HTML 中解析技能数据
///
/// 解析 Next.js 页面中嵌入的 initialSkills 数组。
/// 数据在 self.__next_f.push() 调用中，格式: `self.__next_f.push([1,"...{\"initialSkills\":[...]}..."])`
///
/// # 参数
/// - `html`: HTML 页面内容
///
/// # 返回
/// - 成功: 技能列表
/// - 失败: 错误信息
pub fn parse_skills_from_html(html: &str) -> Result<Vec<SkillsShItem>, String> {
    // 查找包含 initialSkills 的 self.__next_f.push 调用
    let marker = "initialSkills";
    let pos = html
        .find(marker)
        .ok_or_else(|| "未找到 initialSkills 数据".to_string())?;

    // 往前找到 self.__next_f.push([1," 的位置
    let prefix = &html[..pos];
    let push_start = prefix
        .rfind("self.__next_f.push([1,\"")
        .ok_or_else(|| "未找到 self.__next_f.push 调用".to_string())?;

    // 从 push 调用开始往后找到结束的 "])
    let remaining = &html[push_start..];
    let push_end = remaining
        .find("\"])")
        .ok_or_else(|| "未找到 push 调用结束位置".to_string())?;

    // 提取 push 调用中的字符串内容（去掉 self.__next_f.push([1," 和 "])）
    let json_escaped = &remaining[23..push_end]; // 23 = "self.__next_f.push([1,\"".len()

    // 解码转义字符
    let json_decoded = json_escaped
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t");

    // 查找 "initialSkills":[ 开始位置
    let start_marker = "\"initialSkills\":[";
    let start_pos = json_decoded
        .find(start_marker)
        .ok_or_else(|| "解码后未找到 initialSkills".to_string())?;

    // 从开始位置往后查找，找到完整的 JSON 数组
    let json_start = start_pos + start_marker.len() - 1; // 包含 [
    let remaining = &json_decoded[json_start..];

    // 找到匹配的 ] 结束位置（需要处理嵌套）
    let mut bracket_count = 0;
    let mut json_end = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in remaining.chars().enumerate() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' => escape_next = true,
            '"' => in_string = !in_string,
            '[' if !in_string => bracket_count += 1,
            ']' if !in_string => {
                bracket_count -= 1;
                if bracket_count == 0 {
                    json_end = i + 1;
                    break;
                }
            }
            _ => {}
        }
    }

    if json_end == 0 {
        return Err("未找到 initialSkills 数组结束位置".to_string());
    }

    let json_str = &remaining[..json_end];

    // 解析 JSON 数组
    let mut skills: Vec<SkillsShItem> = serde_json::from_str(json_str).map_err(|e| {
        error!("[parse_skills_from_html] JSON 解析失败: {}", e);
        format!("JSON 解析失败: {}", e)
    })?;

    // 为每个技能生成 id（source/skillId）
    for skill in &mut skills {
        skill.id = format!("{}/{}", skill.source, skill.skill_id);
    }

    Ok(skills)
}
