use tradeblazer_compiler::{run_script, run_script_with_options};

#[path = "../examples/support/script_sources.rs"]
mod script_sources;
use script_sources::*;

enum Expectation {
    Success,
    Failure,
}

fn run_case(name: &str, script: &str, expect: Expectation) {
    let result = match expect {
        Expectation::Success => run_script(script),
        Expectation::Failure => run_script_with_options(script, None, true, false, None),
    };

    match (result, expect) {
        (Ok(_), Expectation::Success) => {}
        (Err(_), Expectation::Failure) => {}
        (Ok(_), Expectation::Failure) => {
            panic!("case '{}' expected failure but succeeded", name);
        }
        (Err(err), Expectation::Success) => {
            panic!("case '{}' expected success but failed: {}", name, err);
        }
    }
}

#[test]
fn simple_cases_positive() {
    let positives = [
        ("minimal", SCRIPT_MINIMAL),
        ("close", SCRIPT_CLOSE),
        ("comments", SCRIPT_COMMENTS),
        ("global_vars", SCRIPT_GLOBAL_VARS),
        ("not_operator", SCRIPT_NOT_OPERATOR),
        ("series", SCRIPT_SERIES),
        ("var_init_type", SCRIPT_VAR_INIT_TYPE),
        ("var_init_value", SCRIPT_VAR_INIT_VALUE),
        ("var_keyword", SCRIPT_VAR_KEYWORD),
        ("var_declaration", SCRIPT_VAR_DECLARATION),
    ];

    for (name, script) in positives.iter() {
        run_case(name, script, Expectation::Success);
    }
}

#[test]
fn simple_cases_negative() {
    let negatives = [
        ("series_rules", SCRIPT_SERIES_RULES),
        ("function_nesting", SCRIPT_FUNCTION_NESTING),
        ("var_redefinition", SCRIPT_VAR_REDEFINITION),
    ];

    for (name, script) in negatives.iter() {
        run_case(name, script, Expectation::Failure);
    }
}
