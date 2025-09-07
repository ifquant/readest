// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// This Rust compilation attribute configures the Windows subsystem:
// - `not(debug_assertions)` means non-debug mode (release build)
// - `windows_subsystem = "windows"` sets Windows subsystem to GUI mode
// Effect: Release builds hide console window, debug builds keep console output
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    readestlib::run();
}
