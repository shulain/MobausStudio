//! MCP runtime security validation.
//!
//! Stdio MCP servers intentionally launch a local child process. These checks do
//! not try to decide whether a user-trusted server is safe; they prevent shell
//! command strings, shell interpreters, and environment hijacking from bypassing
//! the UI form validation through imports, templates, persisted config, or IPC.

use std::collections::HashMap;

const MAX_COMMAND_LEN: usize = 512;
const MAX_ARGS: usize = 128;
const MAX_ARG_LEN: usize = 4096;
const MAX_ENV_VARS: usize = 128;
const MAX_ENV_KEY_LEN: usize = 128;
const MAX_ENV_VALUE_LEN: usize = 16 * 1024;

const FORBIDDEN_COMMANDS: &[&str] = &[
    "bash",
    "bash.exe",
    "cmd",
    "cmd.exe",
    "csh",
    "fish",
    "osascript",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "sh",
    "sh.exe",
    "wscript",
    "wscript.exe",
    "zsh",
];

const FORBIDDEN_ENV_KEYS: &[&str] = &[
    "BASH_ENV",
    "DYLD_FALLBACK_LIBRARY_PATH",
    "DYLD_FRAMEWORK_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "ENV",
    "IFS",
    "LD_PRELOAD",
    "NODE_OPTIONS",
    "PATH",
    "SHELL",
    "ZDOTDIR",
];

fn command_basename(command: &str) -> &str {
    command.rsplit(['/', '\\']).next().unwrap_or(command)
}

fn contains_forbidden_command_char(command: &str) -> bool {
    command.chars().any(|ch| {
        ch.is_control()
            || ch.is_whitespace()
            || matches!(
                ch,
                ';' | '&' | '|' | '`' | '$' | '<' | '>' | '(' | ')' | '"' | '\''
            )
    })
}

fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }

    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

pub fn validate_stdio_launch(
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<(), String> {
    if command.is_empty() {
        return Err("stdio command must not be empty".to_string());
    }

    if command.trim() != command {
        return Err("stdio command must not include leading or trailing whitespace".to_string());
    }

    if command.len() > MAX_COMMAND_LEN {
        return Err(format!(
            "stdio command must be at most {} bytes",
            MAX_COMMAND_LEN
        ));
    }

    if contains_forbidden_command_char(command) {
        return Err(
            "stdio command must be an executable name or path, not a shell command string"
                .to_string(),
        );
    }

    let basename = command_basename(command).to_ascii_lowercase();
    if FORBIDDEN_COMMANDS.contains(&basename.as_str()) {
        return Err(format!(
            "stdio command '{}' is not allowed; configure the MCP executable directly instead of a shell",
            basename
        ));
    }

    if args.len() > MAX_ARGS {
        return Err(format!(
            "stdio args must contain at most {} entries",
            MAX_ARGS
        ));
    }

    for (index, arg) in args.iter().enumerate() {
        if arg.len() > MAX_ARG_LEN {
            return Err(format!(
                "stdio arg {} must be at most {} bytes",
                index, MAX_ARG_LEN
            ));
        }

        if arg.contains('\0') || arg.contains('\n') || arg.contains('\r') {
            return Err(format!(
                "stdio arg {} must not contain control line breaks",
                index
            ));
        }
    }

    if env.len() > MAX_ENV_VARS {
        return Err(format!(
            "stdio env must contain at most {} variables",
            MAX_ENV_VARS
        ));
    }

    for (key, value) in env {
        if key.is_empty() {
            return Err("stdio env key must not be empty".to_string());
        }

        if key.len() > MAX_ENV_KEY_LEN {
            return Err(format!(
                "stdio env key '{}' must be at most {} bytes",
                key, MAX_ENV_KEY_LEN
            ));
        }

        if !is_valid_env_key(key) {
            return Err(format!(
                "stdio env key '{}' must match [A-Za-z_][A-Za-z0-9_]*",
                key
            ));
        }

        let uppercase_key = key.to_ascii_uppercase();
        if FORBIDDEN_ENV_KEYS.contains(&uppercase_key.as_str()) {
            return Err(format!(
                "stdio env key '{}' is not allowed because it can alter child process execution",
                key
            ));
        }

        if value.len() > MAX_ENV_VALUE_LEN {
            return Err(format!(
                "stdio env value for '{}' must be at most {} bytes",
                key, MAX_ENV_VALUE_LEN
            ));
        }

        if value.contains('\0') {
            return Err(format!(
                "stdio env value for '{}' must not contain NUL",
                key
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    #[test]
    fn accepts_common_mcp_stdio_command() {
        let args = vec![
            "-y".to_string(),
            "@modelcontextprotocol/server-filesystem".to_string(),
            "/Users/example/Documents/Project Files".to_string(),
        ];
        let env = env(&[("GITHUB_TOKEN", "secret")]);

        assert!(validate_stdio_launch("npx", &args, &env).is_ok());
    }

    #[test]
    fn rejects_shell_command_strings() {
        let result = validate_stdio_launch("npx;rm -rf /", &[], &HashMap::new());

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a shell command string"));
    }

    #[test]
    fn rejects_shell_interpreters() {
        let args = vec!["-c".to_string(), "echo unsafe".to_string()];
        let result = validate_stdio_launch("/bin/bash", &args, &HashMap::new());

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));
    }

    #[test]
    fn rejects_line_breaks_in_args() {
        let args = vec!["safe\nunsafe".to_string()];
        let result = validate_stdio_launch("node", &args, &HashMap::new());

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("control line breaks"));
    }

    #[test]
    fn rejects_execution_hijacking_env_vars() {
        let result = validate_stdio_launch("node", &[], &env(&[("PATH", "/tmp/bin")]));

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("alter child process execution"));
    }

    #[test]
    fn rejects_invalid_env_keys() {
        let result = validate_stdio_launch("node", &[], &env(&[("BAD-KEY", "value")]));

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("[A-Za-z_][A-Za-z0-9_]*"));
    }
}
