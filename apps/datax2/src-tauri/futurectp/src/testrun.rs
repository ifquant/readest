use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use serde_json::{Value as JsonValue, Map as JsonMap};

use crate::{CtpAccountConfig, IAccount};

mod apimd;
use apimd::*;

mod apitd;
use apitd::*;

#[derive(Debug, Clone, ValueEnum)]
pub enum Environment {
    /// 仿真环境
    Sim,
    /// 7x24小时模拟环境
    Tts,
}

// IAccount trait 与 CtpAccountConfig 已移动到独立模块

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// 选择运行环境
    #[arg(short, long, value_enum, default_value_t = Environment::Tts)]
    environment: Environment,

    /// 用户ID
    #[arg(short, long, env = "OPENCTP_USER_ID")]
    user_id: String,

    /// 密码
    #[arg(short, long, env = "OPENCTP_PASS")]
    password: String,
}

// 复用的公共构造函数：按给定前置地址与凭据构造配置，并进行校验
fn build_ctp_config(
    base_path: &std::path::Path,
    user_id: String,
    password: String,
    md_front_address: &str,
    td_front_address: &str,
    env_label: &str,
) -> CtpAccountConfig {
    #[cfg(all(target_os = "windows", feature = "ctp_v6_7_11"))]
    let md_dynlib_path = base_path.join("../../../ctp-dyn/api/ctp/v6.7.11/v6.7.11_20250617_traderapi64_se_windows/thostmduserapi_se.dll");

    #[cfg(target_os = "windows")]
    let td_dynlib_path = base_path.join("tts/v6_7_2/win64/thosttraderapi_se.dll");

    let mut props = JsonMap::new();
    props.insert("md_user_id".into(), JsonValue::String(user_id.clone()));
    props.insert("md_front_address".into(), JsonValue::String(md_front_address.to_string()));
    props.insert(
        "md_dynlib_path".into(),
        JsonValue::String(md_dynlib_path.to_string_lossy().to_string()),
    );
    props.insert("td_user_id".into(), JsonValue::String(user_id));
    props.insert("td_password".into(), JsonValue::String(password));
    props.insert("td_app_id".into(), JsonValue::String("simnow_client_test".to_string()));
    props.insert("td_auth_code".into(), JsonValue::String("0000000000000000".to_string()));
    props.insert("td_front_address".into(), JsonValue::String(td_front_address.to_string()));
    props.insert(
        "td_dynlib_path".into(),
        JsonValue::String(td_dynlib_path.to_string_lossy().to_string()),
    );

    let cfg = CtpAccountConfig { props };
    // 使用 IAccount 默认实现进行校验，带上环境标签便于定位
    cfg.validate_props()
        .unwrap_or_else(|e| panic!("invalid props for {} environment: {}", env_label, e));
    cfg
}

fn create_config_for_environment(
    env: Environment,
    user_id: String,
    password: String,
) -> CtpAccountConfig {
    let base_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let base_path = std::path::Path::new(&base_dir);

    match env {
        Environment::Sim => build_ctp_config(
            base_path,
            user_id,
            password,
            "tcp://182.254.243.31:30011", // SimNow 仿真环境
            "tcp://121.37.90.193:20002",  // OPENCTP 仿真环境
            "Sim",
        ),
        Environment::Tts => build_ctp_config(
            base_path,
            user_id,
            password,
            "tcp://121.37.80.177:20004", // TTS 7x24 环境
            "tcp://121.37.80.177:20002", // TTS 7x24 环境
            "Tts",
        ),
    }
}

fn run_two_loops(config: CtpAccountConfig) {
    let config_clone = config.clone();

    let handle_td = thread::spawn(move || {
        let _tdapi = create_td(config);
        loop {
            println!("td loop");
            thread::sleep(Duration::from_secs(10));
        }
    });

    let handle_md = thread::spawn(move || {
        let _mdapi = create_md(config_clone);
        loop {
            println!("md loop");
            thread::sleep(Duration::from_secs(10));
        }
    });

    handle_td.join().unwrap();
    handle_md.join().unwrap();

    println!("Both loops are finished. Main thread exiting.");
}

/*/
fn main() {
    let args = Args::parse();

    println!("Running with environment: {:?}", args.environment);

    let config = create_config_for_environment(args.environment, args.user_id, args.password);

    run_two_loops(config);
}
*/