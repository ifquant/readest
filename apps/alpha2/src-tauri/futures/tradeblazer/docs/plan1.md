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
