use std::env;
use std::fs::File;
use std::io::{self, Read};
use std::time::{Duration, Instant};
use tradeblazer_compiler::{compile_script, run_compiled_script};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("========================================");
    println!("TradeBlazer Compiler 性能测试工具");
    println!("========================================");

    // 配置参数（支持通过环境变量覆盖）
    const DEFAULT_SCRIPT: &str = "examples/benchmark.tb";
    const DEFAULT_RUNS: u32 = 5000;
    const DEFAULT_WARMUP: u32 = 50;

    let script_path = env::var("BENCH_SCRIPT").unwrap_or_else(|_| DEFAULT_SCRIPT.to_string());
    let runs = env::var("BENCH_RUNS")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_RUNS);
    let warmup_runs = env::var("BENCH_WARMUP")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(DEFAULT_WARMUP);

    println!("脚本路径: {}", script_path);
    println!("预热次数: {}", warmup_runs);
    println!("测试次数: {}", runs);
    println!("========================================");

    // 读取脚本内容
    let script_content = read_script_file(&script_path)?;

    // 预热阶段
    println!("开始预热...");

    let compiled_script = compile_script(&script_content)?;

    let warmup_start = Instant::now();
    for i in 0..warmup_runs {
        if let Err(err) = run_compiled_script(&compiled_script, false) {
            println!("预热执行失败 ({}): {:?}", i + 1, err);
        }
    }
    let warmup_duration = warmup_start.elapsed();
    println!("预热完成，耗时: {:?}", warmup_duration);
    println!("========================================");

    // 性能测试阶段
    println!("开始性能测试...");
    let test_start = Instant::now();

    // 用于统计单个执行的时间
    let mut total_execution_time = Duration::from_secs(0);
    let mut min_execution_time = Duration::from_secs(u64::MAX);
    let mut max_execution_time = Duration::from_secs(0);
    let mut execution_times = Vec::with_capacity(runs as usize);

    for i in 0..runs {
        // 执行脚本并测量时间
        let exec_start = Instant::now();
        let result = run_compiled_script(&compiled_script, false);
        let exec_duration = exec_start.elapsed();

        // 记录执行时间
        execution_times.push(exec_duration);
        total_execution_time += exec_duration;

        if exec_duration < min_execution_time {
            min_execution_time = exec_duration;
        }

        if exec_duration > max_execution_time {
            max_execution_time = exec_duration;
        }

        // 检查执行结果
        if let Err(err) = result {
            println!("执行失败 ({}): {:?}", i + 1, err);
        }
    }

    let total_test_duration = test_start.elapsed();

    // 计算平均执行时间
    let avg_execution_time = total_execution_time / runs;

    // 计算标准差
    let std_dev_execution_time = calculate_std_dev(&execution_times, avg_execution_time);

    // 计算常用分位数
    let p50 = percentile(&execution_times, 0.5);
    let p90 = percentile(&execution_times, 0.9);
    let p99 = percentile(&execution_times, 0.99);

    // 输出性能测试结果
    println!("\n========================================");
    println!("性能测试结果");
    println!("========================================");
    println!("总执行次数: {}", runs);
    println!("总耗时: {:?}", total_test_duration);
    println!("平均总耗时: {:?}", total_test_duration / runs);
    println!("----------------------------------------");
    println!("脚本执行时间统计:");
    println!("平均执行时间: {:?}", avg_execution_time);
    println!("最小执行时间: {:?}", min_execution_time);
    println!("最大执行时间: {:?}", max_execution_time);
    println!("执行时间标准差: {:?}", std_dev_execution_time);
    println!("P50: {:?}", p50);
    println!("P90: {:?}", p90);
    println!("P99: {:?}", p99);
    println!("========================================");

    // 计算吞吐量
    let throughput = runs as f64 / total_test_duration.as_secs_f64();
    println!("吞吐量: {:.2} 次/秒", throughput);
    println!("========================================");

    Ok(())
}

/// 读取脚本文件内容
fn read_script_file(path: &str) -> Result<String, io::Error> {
    let mut file = File::open(path)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

/// 计算执行时间的标准差
fn calculate_std_dev(times: &[Duration], mean: Duration) -> Duration {
    let mean_nanos = mean.as_nanos() as f64;

    // 计算方差
    let variance: f64 = times
        .iter()
        .map(|t| {
            let diff = t.as_nanos() as f64 - mean_nanos;
            diff * diff
        })
        .sum::<f64>()
        / times.len() as f64;

    // 计算标准差
    let std_dev = variance.sqrt();

    Duration::from_nanos(std_dev as u64)
}

fn percentile(times: &[Duration], quantile: f64) -> Duration {
    if times.is_empty() {
        return Duration::from_secs(0);
    }

    let mut samples: Vec<u128> = times.iter().map(|t| t.as_nanos()).collect();
    samples.sort_unstable();

    let clamped_q = if quantile < 0.0 {
        0.0
    } else if quantile > 1.0 {
        1.0
    } else {
        quantile
    };

    let rank = ((samples.len() as f64 - 1.0) * clamped_q).round() as usize;
    let value = samples[rank];
    if value > u64::MAX as u128 {
        Duration::from_nanos(u64::MAX)
    } else {
        Duration::from_nanos(value as u64)
    }
}
