# TradeBlazer 脚本编译器测试框架

本文档介绍了TradeBlazer脚本编译器的测试框架，该框架提供了一个模块化的测试结构，可以根据命令行参数选择运行特定的测试或全部测试。

## 测试框架结构

测试框架主要包含两个文件：

1. **test_framework.rs**：定义了通用的测试函数和各个具体测试功能的函数
2. **comprehensive_test.rs**：主测试程序，可以根据命令行参数选择运行特定的测试或全部测试

## 可用的测试

目前支持以下测试：

- `global_vars`：测试全局变量在函数内的正常使用
- `var_declaration`：测试函数内部不允许声明新变量的规则
- `series_rules`：测试函数内部不允许声明序列变量的规则
- `function_nesting`：测试不允许在函数内部定义嵌套函数的规则
- `for_loop_vars`：测试不允许在函数内部声明循环变量的规则
- `var_redefinition`：测试变量重复定义的检测
- `all`：运行所有测试（默认）

## 运行测试

### 运行所有测试

```bash
cargo run --example comprehensive_test
```

或者明确指定运行所有测试：

```bash
cargo run --example comprehensive_test -- --test all
```

### 运行特定的测试

使用`--test`或`-t`参数指定要运行的测试：

```bash
cargo run --example comprehensive_test -- --test global_vars
```

或者使用短参数形式：

```bash
cargo run --example comprehensive_test -- -t var_declaration
```

## 测试结果

测试完成后，会显示测试摘要，包括：
- 总测试数
- 通过测试数
- 失败测试数

如果所有测试都通过，程序将以退出码0结束；如果有任何测试失败，程序将以退出码1结束。

## 测试脚本来源

示例脚本集中存放在 `examples/support/script_sources.rs` 中，并以常量的形式导出。这样可以避免额外的文件读取，使测试更加自包含。

## 添加新测试

要添加新的测试，请按照以下步骤操作：

1. 在 `script_sources.rs` 中添加一个新的脚本常量。
2. 在 `comprehensive_test.rs` 中添加一个新的测试函数，将常量注入 `TestConfig`。
3. 在 `main` 函数的 `match` 语句及 `all` 测试列表中加入新的测试条目。

完成后即可通过命令行参数运行新添加的测试。
