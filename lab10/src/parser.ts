import { MatchResult, Semantics } from 'ohm-js';
import { getFunnyAst } from '../../lab08/src/parser';
import grammar, { FunnierActionDict } from './funnier.ohm-bundle';
import * as ast from './funnier';

function checkUniqueNames(items: any[], kind: string, node?: any) {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.name)) {
            throw new Error(`Redeclaration of ${kind} '${item.name}'`);
        }
        seen.add(item.name);
    }
}

function collectNamesInNode(node: any, out: Set<string>): void {
    if (!node) {
        return;
    }

    if (Array.isArray(node)) {
        for (const elem of node) {
            collectNamesInNode(elem, out);
        }

        return;
    }

    switch (node.type) {
        case "block":
            if (Array.isArray(node.stmts)) {
                node.stmts.forEach((stmt: any) => collectNamesInNode(stmt, out));
            }

            break;
        case "assign":
            if (Array.isArray(node.targets)) {
                node.targets.forEach((target: any) => collectNamesInNode(target, out));
            }

            if (Array.isArray(node.exprs)) {
                node.exprs.forEach((expr: any) => collectNamesInNode(expr, out));
            }

            break;
        case "lvar":
            if (typeof node.name === "string") {
                out.add(node.name);
            }

            break;
        case "larr":
            if (typeof node.name === "string") {
                out.add(node.name);
            }

            collectNamesInNode(node.index, out);

            break;
        case "funccall":
            if (Array.isArray(node.args)) {
                node.args.forEach((arg: any) => collectNamesInNode(arg, out));
            }

            break;
        case "variable":
            if (typeof node.name === "string") {
                out.add(node.name);
            }

            break;
        case "binary":
            collectNamesInNode(node.left, out);
            collectNamesInNode(node.right, out);

            break;
        case "unary":
            collectNamesInNode(node.operand, out);

            break;
        case "arraccess":
            if (typeof node.name === "string") {
                out.add(node.name);
            }

            collectNamesInNode(node.index, out);

            break;
        case "if":
            collectNamesInNode(node.then, out);
            if (node.else) {
                collectNamesInNode(node.else, out);
            }

            break;
        case "while":
            collectNamesInNode(node.body, out);

            break;
    }
}

function checkFunctionCalls(module: ast.AnnotatedModule) {
    const functionTable = new Map<string, { params: number, returns: number }>();

    for (const func of module.functions) {
        functionTable.set(func.name, {
            params: func.parameters.length,
            returns: func.returns.length
        });
    }

    function visitNode(node: any, context: { expectedReturns?: number } = {}) {
        if (!node) {
            return;
        }

        if (node.type === "funccall") {
            const funcName = node.name;

            if (funcName === "length") {
                if (context.expectedReturns !== undefined && context.expectedReturns !== 1) {
                    throw new Error(`length returns 1 value but ${context.expectedReturns} expected`);
                }

                return;
            }

            const argCount = Array.isArray(node.args) ? node.args.length : 0;

            // Проверка на объявление функции
            if (!functionTable.has(funcName)) {
                throw new Error(`function ${funcName} is not declared`);
            }

            const funcInfo = functionTable.get(funcName)!;
            const expectedArgCount = funcInfo.params;

            // Проверка кол-ва аргументов
            if (argCount !== expectedArgCount) {
                throw new Error(`Function ${funcName} expects ${expectedArgCount} arguments but got ${argCount}`);
            }

            // Проверка кол-ва возвращаемых значений
            if (context.expectedReturns !== undefined) {
                const returnsCount = funcInfo.returns;
                if (returnsCount !== context.expectedReturns) {
                    throw new Error(`Function ${funcName} returns ${returnsCount} values but ${context.expectedReturns} expected`);
                }
            }

            // Проверка аргументов (должны возвращать 1 значение)
            if (Array.isArray(node.args)) {
                for (const arg of node.args) {
                    visitNode(arg, { expectedReturns: 1 });
                }
            }

            return;
        }

        if (node.type === "block") {
            if (Array.isArray(node.stmts)) {
                node.stmts.forEach((stmt: any) => visitNode(stmt));
            }

            return;
        }

        if (node.type === "assign") {
            if (Array.isArray(node.exprs)) {
                const targetsReturns = node.targets.length;
                node.exprs.forEach((expr: any) => visitNode(expr, { expectedReturns: targetsReturns }));
            }

            return;
        }

        if (node.type === "if") {
            visitNode(node.then);
            if (node.else) {
                visitNode(node.else);
            }

            return;
        }

        if (node.type === "while") {
            visitNode(node.body);
            if (node.invariant) {
                visitNode(node.invariant);
            }

            return;
        }

        if (node.type === "arraccess") {
            visitNode(node.index, { expectedReturns: 1 });

            return;
        }

        if (node.kind) {
            switch (node.kind) {
                case "comparison":
                    visitNode(node.left, { expectedReturns: 1 });
                    visitNode(node.right, { expectedReturns: 1 });
                    break;
                case "and":
                case "or":
                case "implies":
                    visitNode(node.left);
                    visitNode(node.right);
                    break;
                case "not":
                    visitNode(node.predicate);
                    break;
                case "paren":
                    visitNode(node.inner);
                    break;
                case "quantifier":
                    visitNode(node.body);
                    break;
                case "formula_ref":
                    if (Array.isArray(node.args)) {
                        node.args.forEach((arg: any) => visitNode(arg, { expectedReturns: 1 }));
                    }
                    break;
                case "true":
                case "false":
                    break;
            }

            return;
        }
    }

    for (const func of module.functions) {
        visitNode(func.body);

        if (func.precondition) {
            visitNode(func.precondition);
        }

        if (func.postcondition) {
            visitNode(func.postcondition);
        }
    }
}

const { FunctionCall: _removedFunctionCall, ...baseFunnyActions } = getFunnyAst;
const getFunnierAst = {
    ...baseFunnyActions,

    _iter(...children: any[]) {
        return children.map((c: any) => c.parse());
    },

    _terminal() {
        return null;
    },

    Module(formulas: any, functions: any) {
        const formulasAst = formulas.children.map((x: any) => x.parse());
        const functionsAst = functions.children.map((x: any) => x.parse());

        return { type: "module", formulas: formulasAst, functions: functionsAst } as ast.AnnotatedModule;
    },

    Formula(formula_kw: any, name: any, lp: any, paramsNode: any, rp: any, arrow: any, body: any, semi: any) {
        const paramsAst = paramsNode.parse();

        return { type: "formula", name: name.sourceString, parameters: paramsAst, body: body.parse() } as ast.Formula;
    },

    Function(var_name: any, lp: any, params_opt: any, rp: any, preopt: any, returns_kw: any, returns_list: any, postopt: any, usesopt: any, statement: any) {
        const func_name = var_name.sourceString;
        const arr_func_parameters = params_opt.parse();
        const preopt_ast = preopt.numChildren > 0 ? preopt.children[0].parse() : null;

        let arr_return_array: any[] = [];
        if (returns_list.sourceString.trim() !== "void") {
            arr_return_array = returns_list.parse();
        }

        const postopt_ast = postopt.numChildren > 0 ? postopt.children[0].parse() : null;
        const arr_locals_array = usesopt.numChildren > 0 ? usesopt.children[0].children[1].parse() : [];

        if (arr_func_parameters.length !== 0) {
            checkUniqueNames(arr_func_parameters, "parameter", params_opt);
        }

        if (arr_return_array.length !== 0) {
            checkUniqueNames(arr_return_array, "return value", returns_list);
        }

        if (arr_locals_array.length !== 0) {
            checkUniqueNames(arr_locals_array, "local variable", usesopt);
        }

        const all = [...arr_func_parameters, ...arr_return_array, ...arr_locals_array];
        if (all.length > 0) {
            checkUniqueNames(all, "variable", var_name);
        }

        const declared = new Set<string>();
        for (const i of arr_func_parameters) {
            declared.add(i.name);
        }
        for (const i of arr_return_array) {
            declared.add(i.name);
        }
        for (const i of arr_locals_array) {
            declared.add(i.name);
        }

        const used_in_body = new Set<string>();
        const parsedStatement = statement.parse();
        collectNamesInNode(parsedStatement, used_in_body);

        for (const name of used_in_body) {
            if (!declared.has(name)) {
                throw new Error(`Function ${func_name}: undeclared variable '${name}'`);
            }
        }

        return {
            type: "fun",
            name: func_name,
            parameters: arr_func_parameters,
            returns: arr_return_array,
            locals: arr_locals_array,
            precondition: preopt_ast,
            postcondition: postopt_ast,
            body: parsedStatement
        } as ast.AnnotatedFunctionDef;
    },

    Preopt(requires_kw: any, pred: any) {
        return pred.parse();
    },

    Postopt(ensures_kw: any, pred: any) {
        return pred.parse();
    },

    InvariantOpt(invariant_kw: any, pred: any) {
        return pred.parse();
    },

    While(while_kw: any, lp: any, cond: any, rp: any, inv: any, stmt: any) {
        return {
            type: 'while',
            condition: cond.parse(),
            invariant: inv.numChildren > 0 ? inv.children[0].parse() : null,
            body: stmt.parse()
        } as ast.AnnotatedWhileStmt;
    },

    FunctionCall_length(length_kw: any, lp: any, expr: any, rp: any) {
        return { type: 'funccall', name: 'length', args: [expr.parse()] };
    },

    FunctionCall_regular(name: any, lp: any, args: any, rp: any) {
        return { type: 'funccall', name: name.sourceString, args: args.parse() };
    },

    Statement_function_call(functionCall: any, semicolon: any) {
        return functionCall.parse();
    },


    ImplyPred(left: any, arrow: any, right: any) {
        if (right.numChildren === 0) {
            return left.parse();
        }

        return { kind: 'implies', left: left.parse(), right: right.children[0].children[1].parse() } as ast.ImpliesPred;
    },

    OrPred(first: any, ors: any, rest: any) {
        let result = first.parse();
        const items = rest.children;
        for (const item of items) {
            result = { kind: 'or', left: result, right: item.children[1].parse() } as ast.OrPred;
        }

        return result;
    },

    AndPred(first: any, ands: any, rest: any) {
        let result = first.parse();
        const items = rest.children;
        for (const item of items) {
            result = { kind: 'and', left: result, right: item.children[1].parse() } as ast.AndPred;
        }

        return result;
    },

    NotPred(nots: any, atom: any) {
        let result = atom.parse();
        for (let i = 0; i < nots.numChildren; i++) {
            result = { kind: 'not', predicate: result } as ast.NotPred;
        }

        return result;
    },

    AtomPred_true(t: any) {
        return { kind: 'true' } as ast.TruePred;
    },

    AtomPred_false(f: any) {
        return { kind: 'false' } as ast.FalsePred;
    },

    AtomPred_comparison(cmp: any) {
        const comp = cmp.parse();
        return { kind: 'comparison', left: comp.left, op: comp.op, right: comp.right } as ast.ComparisonPred;
    },

    AtomPred_paren(lp: any, pred: any, rp: any) {
        return { kind: 'paren', inner: pred.parse() } as ast.ParenPred;
    },

    AtomPred_quantifier(quant: any) {
        return quant.parse();
    },

    AtomPred_formula_ref(ref: any) {
        return ref.parse();
    },

    Quantifier(quant_kw: any, lp: any, param: any, bar: any, body: any, rp: any) {
        return {
            kind: 'quantifier',
            quantifier: quant_kw.sourceString as 'forall' | 'exists',
            param: param.parse(),
            body: body.parse()
        } as ast.QuantifierPred;
    },

    FormulaRef(name: any, lp: any, args: any, rp: any) {
        return { kind: 'formula_ref', name: name.sourceString, args: args.parse() } as ast.FormulaRefPred;
    },
} as any;

export const semantics: FunnierSemanticsExt = grammar.Funnier.createSemantics() as FunnierSemanticsExt;
semantics.addOperation("parse()", getFunnierAst as any);

export interface FunnierSemanticsExt extends Semantics {
    (match: MatchResult): FunnierActionsExt;
}

interface FunnierActionsExt {
    parse(): ast.AnnotatedModule;
}

export function parseFunnier(source: string, origin?: string): ast.AnnotatedModule {
    const matchResult = grammar.Funnier.match(source, "Module");

    if (!matchResult.succeeded()) {
        throw new SyntaxError(matchResult.message);
    }

    const ast_module = semantics(matchResult).parse();
    checkFunctionCalls(ast_module);

    return ast_module;
}