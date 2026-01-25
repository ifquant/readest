要把当前解释器的执行速度逼近原生语言，需要从“解释执行”跨到“编译/优化执行”这一层面。可以考虑分阶段演进：

1. 生成中间表示+专用字节码

在语法/语义分析后构建带类型标签的 IR（SSA 或线性指令），把字符串标识符、作用域解析都提前固化为整数槽位。
在执行前把 IR 编译到自定义的紧凑字节码里，解释器只需要用数组索引访问寄存槽，避免哈希和字符串比较。
可引入常量折叠、循环不变量移动等编译期优化，减少运行时重复计算。 2. 引入 JIT 或 AOT 编译

将 IR 交给后端（如 Cranelift、LLVM）即时编译成本地代码，热点函数可以被 JIT 编译，冷函数继续字节码解释，形成 tiered execution。
如果脚本发布频繁，可在部署阶段做 AOT 编译，生成共享库或 WebAssembly 模块，运行时直接调用。 3. 强化类型系统与静态布局

在语义分析阶段进行类型推断，确保数值运算、数组访问使用静态类型。降低动态分派、分支预测失败。
对 Series/Array 等核心数据结构，使用固定容量 + ring buffer + SoA 布局提升缓存命中率，必要时用 SIMD 指令加速常用指标。 4. 精简运行时栈与内存模型

替换 Vec<HashMap> 的作用域栈为线性栈：编译期每个函数/块分配 slot，运行时直接 locals[offset]。
为 Value 设计 tagged union/NaN-boxing，以便数值、布尔、指针等写入无需堆分配。
放弃通用 Value::Array(Vec<f64>)，改用专门的数值数组结构和手写内联操作（如 Array.f64Add）。 5. 专门化热点函数

对高频指标（MA、EMA、RSI 等）生成特化内联代码（模板化或编译阶段展开），避免通用函数带来的额外开销。
支持“内建宏”或 DSL 原语，让脚本层对循环、归约等操作能被编译期识别并转译为高性能原语。 6. 并行与批处理

为滚动计算、策略评价等场景提供批量 API，接受向量化输入，在底层合并循环或利用 Rayon/SIMD 进行并行。
如果策略本质上是对大量独立时间步执行，考虑引入分批 JIT、SIMD 或 GPU-offload 的执行模式。 7. 工程/工具保障

引入基准测试流水线（criterion、perf），对每轮改动进行回归。
借助 flamegraph、perfetto 等工具定位剩余瓶颈，持续评估 IR 优化和 JIT 效果。
为 DSL 定义 ABI，让未来可以插拔后端：解释器、字节码 VM、JIT、WASM 等多种方案灵活切换。
这些改动是渐进式的：先从 IR/字节码优化入手（最大程度消除字符串/哈希开销），再考虑 JIT/AOT。真正做到“接近原生”通常需要 JIT 或静态编译，把脚本转成机器码或高度优化的字节码执行引擎，并确保类型信息和数布局在编译阶段就已经固定。

要在 parser / semantic 阶段就把符号编号化，真正摆脱运行期哈希/字符串查表，需要对几个核心组件联动改造，工程范围比较大，建议分阶段推进。以下是完整落地方案，供确认后逐步实施：

1. 统一的符号表定义
   在 ast 模块增加： #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
   pub struct SymbolId(u32);

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SymbolTable {
pub symbols: Vec<String>,
}

impl SymbolTable {
pub fn name(&self, id: SymbolId) -> &str { &self.symbols[id.0 as usize] }
}
提供 SymbolInterner（HashMap<String, SymbolId> + Vec<String>）用于 parser/semantic 阶段注册标识符。 2. AST 结构全面换成 SymbolId
Statement/Expr/FunctionParam 中所有涉及标识符位置改成 SymbolId（例如 Statement::VarDecl { name: SymbolId, … }、Expr::Variable(SymbolId) 等）。
为了在报错/序列化时还能看到原始名字，Script 扩展为：
pub struct Script {
pub symbols: SymbolTable,
pub statements: Vec<Statement>,
}
语义和解释器在需要提示时，通过 script.symbols.name(id) 取回字符串。 3. Parser：构建 SymbolTable 并产出带 ID 的 AST
在 Parser 内部持有 SymbolInterner，解析标识符时调用 intern() 得到 SymbolId。
AST 节点直接写入 SymbolId。
解析完成后，将 interner.into_symbol_table() 放入 Script.symbols。 4. Semantic：基于 SymbolId 的作用域检查
ScopeStack、Analyzer 改为保存 HashSet<SymbolId>，内置函数/指标也提前映射为 SymbolId（解析开始前把内置名称喂进 interner 并记录返回的 ID）。
报错/提示信息通过 script.symbols.name(id) 访问原始字符串。 5. Interpreter：仅用 SymbolId 访问/绑定
ScopeFrame.name_to_slot、bindings、references 全部改为 HashMap<SymbolId, …>（之前的部分改动可复用）。
declare_variable、set_reference 等直接接受 SymbolId。
Interpreter::parse_script 遍历 AST 时，拿到 SymbolId 后无需再 intern。 6. 互操作与序列化
save_ast_to_file / load_ast_from_file 更新以持久化 SymbolTable。
现有测试、示例构造 AST 的地方（尤其是 tests 模块里的 helper）需要改成通过 SymbolInterner 生成脚本。 7. 迁移步骤建议
新增 SymbolId/Interner/Script.symbols，保持 AST 兼容（同时保留旧字段）编写迁移辅助。
Parser/AST 改为双写：在过渡期里，Statement 同时保存 String 和 SymbolId，确保语义/解释器仍可工作；测试通过后再删除字符串字段。
Semantic/Interpreter 分步切换到 SymbolId。
清理旧字段、旧路径，跑全部测试 & benchmark。

Recommended next steps

Function parameters + For loop variables:
When parameters are passed by reference (VarByRef/SeriesByRef), we now populate both string and ID references (done via set_reference).
For loop variables already hit declare_variable; thus ID bindings are created. Optionally, we can add an explicit cache of the loop variable’s SymbolId to speed step updates — not strictly necessary now.
Calls and builtins:
Add CallId with SymbolId for function/builtin names.
Register builtins by SymbolId and dispatch via an ID → BuiltinFunction map (no string comparisons).
Parser emission:
Optional, since we already lower; but moving parser to emit VariableId/AssignId directly removes the lowering pass.
Would you like me to proceed with CallId and ID-based builtin dispatch next, or finalize ID coverage for For loop updates and function parameter flows 我！

Teach ScopeFrame to keep SymbolId slots alongside (or instead of) String keys, so parameter and local bind/unbind never touch the string hash map.

Precompute per-function layouts (e.g., FunctionDef caches parameter SymbolId → slot index) and make call_user_defined_function reuse that plan instead of cloning names each call.

Once scopes are ID-first, keep the string maps only for legacy nodes; avoid converting IDs back to strings in the hot path.

Until we eliminate those string lookups and allocations, the benchmark will stay around ~190 µs even though the AST now carries parameter IDs.
