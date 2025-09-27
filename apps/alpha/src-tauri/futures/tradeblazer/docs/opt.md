# TradeBlazer 解释器性能优化备忘

## 已完成的优化

- **作用域查找**：引入 `bindings` 缓存，`resolve_binding` 不再逐层遍历哈希表，循环内变量访问显著加速。
- **变量槽位**：使用 `ScopeFrame` 固定槽位存储变量值，并将字符串映射为整型 slot，执行阶段通过 ID 访问；仍保留名称映射以便报错时定位。
- **for 循环步进**：对 `_assign` 方案进行预编译并缓存 `ScopeRef`，循环每次迭代直接写回目标变量，避免重复字符串派发。
- **内置函数派发**：使用 `BuiltinFunction` 枚举和 `Value::Builtin`，在求值阶段不再通过字符串比对，方法调用也复用同一表驱动逻辑。

## 仍可优化的热点

- **for 循环条件**：`end` 表达式依旧逐次求值，可进一步分析表达式纯度，缓存不依赖循环变量的子表达式。
- **指标访问**：`VecDeque::iter().rev().nth(index)` 为 O(n)。可通过 `bars[bars.len()-1-index]` 直接索引，并提前将指标名映射为数值 ID，避免各处字符串匹配。
- **系列值更新**：序列赋值已改为直接在原序列尾部追加数据，避免为 `update_series` 克隆 `Vec` 的额外开销。

## 固定尺寸与静态布局思路

- **变量槽位 ID 化**：在解析/语义阶段为每个变量分配整数 ID，执行阶段用定长数组/向量存放值，避免 `HashMap<String, Value>`。可按作用域大小一次性预分配栈帧，或复用线性内存池。
- **SmallVec/ArrayVec**：热点路径中的短 `Vec`（如函数实参、for 循环临时容器）可改用 `SmallVec<[T; N]>` 或 `ArrayVec`，在栈上保存常见长度，减少堆分配。
- **常量表达式折叠**：语义阶段识别纯表达式，提前求值，循环运行时仅取常量，减少临时 `Value` 构建。
- **标识符驻留**：将脚本中的标识符 intern 成 ID 或 `&'static str`，执行时不再复制 `String`。
- **结构化栈帧**：将当前的 `Vec<HashMap<…>>` 替换为定制的栈帧结构（固定槽位 + 引用），结合 `ScopeRef` 缓存，进一步降低动态操作。
- **对象池/Arena**：对生命周期明确的临时对象统一放入对象池，策略结束后集中回收，避免频繁 `Vec`/`String` 分配。

## 解析与语义阶段

- 解析器仍将属性/索引转换为 `_method_call` 等伪函数，可扩展 AST 为专用节点，结合解释器分派，提高执行阶段效率。
- 语义分析中频繁插入/查找 `HashSet<String>`。若编译时也关注性能，可通过字符串驻留（intern）或 `Rc<str>` 减少重复分配。

## 序列化/加密

- AST 持久化使用 PBKDF2 + AES-256-GCM，目前通过缓存派生密钥并降低迭代次数减小开销；若需要更快的批量操作，可进一步支持自定义成本参数或替换更高效的 KDF。

## 通用改进方向

- 将标识符统一为紧凑表示（`SmolStr`、`Arc<str>` 或自定义 interner）以降低克隆成本。
- `lexer` 可依据输入大小预分配 token 向量，避免反复扩容。
- AST 可考虑区域分配（arena）或扁平存储，以提升缓存局部性并减少 `Arc<[Statement]>` 的引用计数开销。

> 建议结合 `cargo flamegraph` 等工具，重点关注哈希查找、字符串处理与循环求值等热点，以量化收益并指导下一步优化。

## 性能基准

========================================
性能测试结果
========================================
总执行次数: 5000
总耗时: 1.939125084s
平均总耗时: 387.825µs

---

脚本执行时间统计:
平均执行时间: 387.764µs
最小执行时间: 365.333µs
最大执行时间: 1.92625ms
执行时间标准差: 50.347µs
P50: 374.125µs
P90: 416.458µs
P99: 514.833µs
========================================
吞吐量: 2578.48 次/
=====================================o

src/interpreter.rs:415 assign_variable still clones Value when caching; for non-series variants we do *slot = value. Replace the value: Value parameter with value: &Value and add specialised branches (numbers, bools) that copy scalars without cloning the entire enum to lower heap churn when scripts assign frequently.

src/interpreter.rs:281 and src/interpreter.rs:1011 builtin dispatch packs args into Vec<Value> per call. Swap to SmallVec<[Value; 4]> or, better, evaluate arguments into a stack buffer owned by the caller (e.g. pass a mutable slice into call_builtin). This keeps hot-path intrinsics like length and math ops from allocating.

src/interpreter.rs:324 still keeps price_window et al. in grow-only Vec. Convert SeriesData to a ring buffer sized at max_buffer. Store Vec<f64> plus a head index so push overwrites older entries without moving memory; update _index_access to translate logical indices to physical offsets. This eliminates repeated Vec growth and improves locality for UpdateAlphaProfile.

Parser-generated _index_access/_method_call still require strings to look up variables and builtins (src/interpreter.rs:820). During parsing, attach numeric IDs (e.g. enum Intrinsic { IndexAccess, MethodCall }) and emit dedicated AST nodes. The interpreter can then dispatch via match on that enum instead of string comparisons, shaving hash lookups every time scripts index arrays or series.

src/interpreter.rs:200 MarketDataContext::closes() rebuilds Vec<f64> for every indicator builtin. Change it to return a &[f64] (or maintain an Arc<[f64]> cache invalidated on new bar) so indicator calls stop allocating and copying. Update MA/EMA/RSI/Atr to take slices.

src/interpreter.rs:470 parse_script handles var/series declarations by evaluating expressions immediately. Pre-pass to assign slot IDs per scope and store initial values separately, so the runtime doesn’t re-resolve bindings through hash maps. Once slots are static, resolve_binding can return direct indices, and assignment reads/writes become self.frames[scope].values[slot] with no hash lookup.

src/interpreter.rs:1097 builtin ATR/MACD repeatedly pull data from MarketDataContext using iterators. Cache recent bar highs/lows/closings in MarketDataContext as plain slices and run numerically tight loops there.

Together these cuts remove most of the interpreter’s dynamic allocation and string-based dispatch overhead, which should drop per-tick execution substantially beyond the current script-level tweaks.
