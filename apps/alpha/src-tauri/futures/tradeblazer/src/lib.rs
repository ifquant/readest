//! TradeBlazer脚本编译器
//! 用于解析TradeBlazer语法并生成可执行代码

pub mod ast;
pub mod error;
pub mod interpreter;
pub mod interpreter_trait;
pub mod lexer;
pub mod parser;
pub mod semantic;
pub mod simpile_impl;

pub use ast::{Script, Statement};
pub use interpreter::{Interpreter, MarketDataContext};
pub use interpreter_trait::{Bar, OrderCmd, Tick, TradingExecutor, Value};
pub use lexer::Lexer;
pub use parser::Parser;
pub use simpile_impl::SimpleTradingExecutor;
// 重新导出error模块中的重要类型和函数
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
pub use error::{lex_error, runtime_error, semantic_error, syntax_error};
pub use error::{CompileError, ErrorLocation, ErrorType};
use once_cell::sync::Lazy;
use pbkdf2::pbkdf2_hmac;
use rand::rngs::OsRng;
use rand::RngCore;
use serde_json;
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

const ENCRYPTED_HEADER: &str = "ENC";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 80_000;

#[derive(Hash, PartialEq, Eq, Clone)]
struct KeyCacheKey {
    password: String,
    salt: [u8; SALT_LEN],
}

static KEY_CACHE: Lazy<Mutex<HashMap<KeyCacheKey, [u8; KEY_LEN]>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn key_cache_lock(
) -> Result<MutexGuard<'static, HashMap<KeyCacheKey, [u8; KEY_LEN]>>, error::CompileError> {
    KEY_CACHE
        .lock()
        .map_err(|_| error::runtime_error("派生密钥缓存访问失败"))
}

fn derive_key(password: &str, salt: &[u8; SALT_LEN]) -> Result<[u8; KEY_LEN], error::CompileError> {
    let cache_key = KeyCacheKey {
        password: password.to_string(),
        salt: *salt,
    };

    if let Some(cached) = {
        let cache = key_cache_lock()?;
        cache.get(&cache_key).copied()
    } {
        return Ok(cached);
    }

    let mut derived = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut derived);

    {
        let mut cache = key_cache_lock()?;
        cache.insert(cache_key, derived);
    }

    Ok(derived)
}

/// 将AST序列化并保存到文件，可以选择使用密码加密
pub fn save_ast_to_file(
    script: &ast::Script,
    file_path: &str,
    password: Option<&str>,
) -> Result<(), error::CompileError> {
    // 使用 JSON Pretty 格式，方便人眼阅读和版本比较。
    let serialized = serde_json::to_string_pretty(script)
        .map_err(|e| error::runtime_error(&format!("序列化AST失败: {}", e)))?;

    let payload = if let Some(pass) = password {
        encrypt_payload(&serialized, pass)?
    } else {
        serialized
    };

    fs::write(file_path, payload)
        .map_err(|e| error::runtime_error(&format!("写入AST到文件失败: {}", e)))?;

    Ok(())
}

/// 从文件加载并反序列化AST，根据文件头判断是否需解密
pub fn load_ast_from_file(
    file_path: &str,
    password: Option<&str>,
) -> Result<ast::Script, error::CompileError> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| error::runtime_error(&format!("读取AST文件失败: {}", e)))?;

    let json = if content.starts_with(&format!("{}\n", ENCRYPTED_HEADER)) {
        let pass = password.ok_or_else(|| error::runtime_error("AST文件已加密，请提供密码"))?;
        decrypt_payload(&content, pass)?
    } else {
        content
    };

    let script = serde_json::from_str(&json)
        .map_err(|e| error::runtime_error(&format!("反序列化AST失败: {}", e)))?;

    Ok(script)
}

fn encrypt_payload(plaintext: &str, password: &str) -> Result<String, error::CompileError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let key = derive_key(password, &salt)?;

    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| error::runtime_error("初始化加密器失败"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|_| error::runtime_error("加密AST数据失败"))?;

    let payload = format!(
        "{header}\n{salt}\n{nonce}\n{ciphertext}\n",
        header = ENCRYPTED_HEADER,
        salt = BASE64.encode(salt),
        nonce = BASE64.encode(nonce),
        ciphertext = BASE64.encode(ciphertext)
    );

    Ok(payload)
}

fn decrypt_payload(content: &str, password: &str) -> Result<String, error::CompileError> {
    let mut lines = content.lines();
    let header = lines
        .next()
        .ok_or_else(|| error::runtime_error("加密AST格式错误: 缺少头部"))?;
    if header != ENCRYPTED_HEADER {
        return Err(error::runtime_error("加密AST格式错误: 头部无效"));
    }

    let salt_b64 = lines
        .next()
        .ok_or_else(|| error::runtime_error("加密AST格式错误: 缺少盐值"))?;
    let nonce_b64 = lines
        .next()
        .ok_or_else(|| error::runtime_error("加密AST格式错误: 缺少随机数"))?;
    let ciphertext_b64 = lines
        .next()
        .ok_or_else(|| error::runtime_error("加密AST格式错误: 缺少密文"))?;

    let salt = BASE64
        .decode(salt_b64)
        .map_err(|_| error::runtime_error("加密AST格式错误: 无法解析盐值"))?;
    if salt.len() != SALT_LEN {
        return Err(error::runtime_error("加密AST格式错误: 盐值长度不正确"));
    }

    let nonce = BASE64
        .decode(nonce_b64)
        .map_err(|_| error::runtime_error("加密AST格式错误: 无法解析随机数"))?;
    if nonce.len() != NONCE_LEN {
        return Err(error::runtime_error("加密AST格式错误: 随机数长度不正确"));
    }

    let ciphertext = BASE64
        .decode(ciphertext_b64)
        .map_err(|_| error::runtime_error("加密AST格式错误: 无法解析密文"))?;

    let mut salt_arr = [0u8; SALT_LEN];
    salt_arr.copy_from_slice(&salt);
    let key = derive_key(password, &salt_arr)?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| error::runtime_error("初始化解密器失败"))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| error::runtime_error("AST密码不正确或文件已损坏"))?;

    let text = String::from_utf8(plaintext)
        .map_err(|_| error::runtime_error("解密后的AST不是有效的UTF-8"))?;
    Ok(text)
}

/// 语法/语义阶段产生的缓存中间结果。
///
/// `ast` 保留原始语法树以便调试或再次持久化，`lowered` 则存放经过
/// `lower_ids` 处理后的高效表示，可直接交给解释器执行。
#[derive(Clone)]
pub struct CompiledScript {
    ast: Arc<ast::Script>,
    lowered: Arc<ast::Script>,
}

impl CompiledScript {
    fn new(ast: ast::Script) -> Self {
        let mut lowered = ast.clone();
        lowered.lower_ids();
        Self {
            ast: Arc::new(ast),
            lowered: Arc::new(lowered),
        }
    }

    /// 返回原始语法树。
    pub fn ast(&self) -> &ast::Script {
        self.ast.as_ref()
    }

    /// 返回已经执行 `lower_ids` 的语法树。
    pub fn lowered_ast(&self) -> &ast::Script {
        self.lowered.as_ref()
    }

    /// 构造可执行的解释器实例。
    ///
    /// * `max_bars` 控制行情缓冲区容量。
    /// * `debug_mode` 为 `true` 时保留额外的字符串映射，以便调试。
    pub fn instantiate(
        &self,
        max_bars: usize,
        debug_mode: bool,
    ) -> Result<Interpreter, error::CompileError> {
        let market_data_context = MarketDataContext::new(max_bars);
        let trading_executor = Box::new(SimpleTradingExecutor::new()) as Box<dyn TradingExecutor>;
        let mut interpreter = Interpreter::new(market_data_context, max_bars, debug_mode, trading_executor);
        interpreter.parse_lowered_script(self.lowered.as_ref())?;
        interpreter.initialize()?;
        Ok(interpreter)
    }
}

fn compile_ast_from_source(script: &str) -> Result<ast::Script, error::CompileError> {
    let mut lexer = Lexer::new(script);
    let (tokens, token_positions) = lexer.tokenize()?;

    let mut parser = Parser::new(tokens, token_positions);
    parser.set_source(script);
    let ast = parser.parse()?;

    semantic::analyze(&ast)?;

    Ok(ast)
}

pub fn compile_script(script: &str) -> Result<CompiledScript, error::CompileError> {
    compile_script_with_options(script, None, false, None)
}

/// 带缓存/加密选项的编译入口。
///
/// - `script`:        TradeBlazer 脚本源码
/// - `ast_file`:      可选 AST 文件；若存在则尝试加载，否则保存新的 AST
/// - `force_compile`: 忽略已有缓存、强制重新编译
/// - `ast_password`:  持久化 AST 时使用的加解密密码
pub fn compile_script_with_options(
    script: &str,
    ast_file: Option<&str>,
    force_compile: bool,
    ast_password: Option<&str>,
) -> Result<CompiledScript, error::CompileError> {
    let ast = if let Some(ast_file_path) = ast_file {
        if !force_compile && Path::new(ast_file_path).exists() {
            load_ast_from_file(ast_file_path, ast_password)?
        } else if !script.is_empty() {
            let ast = compile_ast_from_source(script)?;

            if !ast_file_path.is_empty() {
                save_ast_to_file(&ast, ast_file_path, ast_password)?;
            }

            ast
        } else {
            return Err(error::runtime_error("请提供脚本内容或有效的AST文件路径"));
        }
    } else {
        compile_ast_from_source(script)?
    };

    Ok(CompiledScript::new(ast))
}

/// 编译并执行TradeBlazer脚本
pub fn run_script(script: &str) -> Result<(), error::CompileError> {
    run_script_with_options(script, None, false, false, None)
}

/// 编译并执行 TradeBlazer 脚本，支持缓存、调试等选项。
///
/// - `script`:        TradeBlazer 脚本源码
/// - `ast_file`:      可选 AST 文件；可加载或覆盖缓存
/// - `force_compile`: 是否忽略现有缓存
/// - `debug_mode`:    是否保留字符串映射，便于调试
/// - `ast_password`:  AST 持久化时使用的加解密密码
pub fn run_script_with_options(
    script: &str,
    ast_file: Option<&str>,
    force_compile: bool,
    debug_mode: bool,
    ast_password: Option<&str>,
) -> Result<(), error::CompileError> {
    let compiled = compile_script_with_options(script, ast_file, force_compile, ast_password)?;
    run_compiled_script(&compiled, debug_mode)
}

/// 执行已经编译好的脚本实例。
pub fn run_compiled_script(
    compiled: &CompiledScript,
    debug_mode: bool,
) -> Result<(), error::CompileError> {
    // 设置最大K线数量为100，充当简单滑动窗口。
    let mut interpreter = compiled.instantiate(100, debug_mode)?;

    // 注意：在实际应用中，应该从外部数据源获取Tick和Bar数据，并调用相应的事件处理函数
    // 这里为了演示，我们添加一些模拟数据

    // 添加一个模拟的Bar数据
    let mock_bar = crate::Bar {
        time: "2023-01-01 10:00:00".to_string(),
        open: 100.0,
        high: 105.0,
        low: 98.0,
        close: 103.0,
        volume: 1000.0,
    };

    // 触发Bar事件
    interpreter.on_bar(mock_bar.clone())?;
    interpreter.on_bar(mock_bar.clone())?;
    interpreter.on_bar(mock_bar.clone())?;

    // 添加一个模拟的Tick数据
    let mock_tick = crate::Tick {
        time: "2023-01-01 10:01:00".to_string(),
        price: 103.5,
        volume: 100.0,
    };

    // 触发Tick事件
    interpreter.on_tick(mock_tick.clone())?;
    interpreter.on_tick(mock_tick.clone())?;
    interpreter.on_tick(mock_tick.clone())?;
    interpreter.on_tick(mock_tick.clone())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::random;
    use std::fs;

    fn temp_file_path(suffix: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("tradeblazer_ast_{}_{}", random::<u64>(), suffix));
        path
    }

    #[test]
    fn encrypted_ast_roundtrip() {
        let script = ast::Script::new(Vec::new());
        let path = temp_file_path("enc.json");
        let path_str = path.to_string_lossy().to_string();

        save_ast_to_file(&script, &path_str, Some("secret")).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.starts_with("ENC\n"));

        let restored = load_ast_from_file(&path_str, Some("secret")).unwrap();
        assert_eq!(restored, script);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn encrypted_ast_requires_password() {
        let script = ast::Script::new(Vec::new());
        let path = temp_file_path("enc_pwd.json");
        let path_str = path.to_string_lossy().to_string();

        save_ast_to_file(&script, &path_str, Some("secret")).unwrap();

        let err_no_pwd = load_ast_from_file(&path_str, None).unwrap_err();
        assert!(err_no_pwd.message.contains("密码"));

        let err_wrong = load_ast_from_file(&path_str, Some("wrong")).unwrap_err();
        assert!(err_wrong.message.contains("密码不正确"));

        let _ = fs::remove_file(path);
    }
}
