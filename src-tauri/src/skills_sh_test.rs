//! skills.sh 模块单元测试

#[cfg(test)]
mod tests {
    use super::super::skills_sh::*;

    /// TC-SKILLS-SH-001: 测试 HTML 解析 - 正常情况
    #[test]
    fn test_parse_skills_from_html_success() {
        let html = r#"
            <script>self.__next_f.push([1,"14:[\"$\",\"$L1c\",null,{\"initialSkills\":[{\"source\":\"vercel-labs/skills\",\"skillId\":\"find-skills\",\"name\":\"find-skills\",\"installs\":414516},{\"source\":\"vercel-labs/agent-skills\",\"skillId\":\"react-best-practices\",\"name\":\"react-best-practices\",\"installs\":100000}]}"])</script>
        "#;

        let result = super::super::skills_sh::parse_skills_from_html(html);
        assert!(result.is_ok());

        let skills = result.unwrap();
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "find-skills");
        assert_eq!(skills[0].source, "vercel-labs/skills");
        assert_eq!(skills[0].skill_id, "find-skills");
        assert_eq!(skills[0].installs, 414516);
        assert_eq!(skills[0].id, "vercel-labs/skills/find-skills");
    }

    /// TC-SKILLS-SH-002: 测试 HTML 解析 - 未找到 initialSkills
    #[test]
    fn test_parse_skills_from_html_not_found() {
        let html = r#"<html><body>No skills here</body></html>"#;
        let result = super::super::skills_sh::parse_skills_from_html(html);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "未找到 initialSkills 数据");
    }

    /// TC-SKILLS-SH-003: 测试分页逻辑 - 第一页
    #[test]
    fn test_apply_pagination_first_page() {
        let skills = vec![
            create_test_skill("skill1", "owner1/repo1", 100),
            create_test_skill("skill2", "owner2/repo2", 200),
            create_test_skill("skill3", "owner3/repo3", 300),
            create_test_skill("skill4", "owner4/repo4", 400),
            create_test_skill("skill5", "owner5/repo5", 500),
        ];

        let result = super::super::skills_sh::apply_pagination(skills, 2, 0);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.skills.len(), 2);
        assert_eq!(response.skills[0].name, "skill1");
        assert_eq!(response.skills[1].name, "skill2");
        assert!(response.has_more);
    }

    /// TC-SKILLS-SH-004: 测试分页逻辑 - 最后一页
    #[test]
    fn test_apply_pagination_last_page() {
        let skills = vec![
            create_test_skill("skill1", "owner1/repo1", 100),
            create_test_skill("skill2", "owner2/repo2", 200),
            create_test_skill("skill3", "owner3/repo3", 300),
        ];

        let result = super::super::skills_sh::apply_pagination(skills, 2, 2);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.skills.len(), 1);
        assert_eq!(response.skills[0].name, "skill3");
        assert!(!response.has_more);
    }

    /// TC-SKILLS-SH-005: 测试分页逻辑 - offset 超出范围
    #[test]
    fn test_apply_pagination_offset_out_of_range() {
        let skills = vec![
            create_test_skill("skill1", "owner1/repo1", 100),
            create_test_skill("skill2", "owner2/repo2", 200),
        ];

        let result = super::super::skills_sh::apply_pagination(skills, 10, 10);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.skills.len(), 0);
        assert!(!response.has_more);
    }

    /// TC-SKILLS-SH-006: 测试分页逻辑 - 空列表
    #[test]
    fn test_apply_pagination_empty_list() {
        let skills = vec![];
        let result = super::super::skills_sh::apply_pagination(skills, 10, 0);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.skills.len(), 0);
        assert!(!response.has_more);
    }

    // 辅助函数：创建测试用技能对象
    fn create_test_skill(name: &str, source: &str, installs: u64) -> SkillsShItem {
        SkillsShItem {
            skill_id: name.to_string(),
            name: name.to_string(),
            installs,
            source: source.to_string(),
            id: format!("{}/{}", source, name),
        }
    }
}
