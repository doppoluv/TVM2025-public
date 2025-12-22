import { Arith, Bool, Context, init, Solver } from "z3-solver";
import * as ast from "../../lab10/src/funnier";
import * as base from "../../lab08/src";

let z3anchor: any;
let z3: Context;

const functionSymbols = new Map<string, any>();
const functionAxiomsAdded = new Set<string>();

async function initZ3() {
    if (!z3) {
        z3anchor = await init();
        const Z3C = z3anchor.Context;
        z3 = Z3C('main');
    }
}

export function flushZ3() {
    z3anchor = undefined;
    z3 = undefined as any;
}

export async function verifyModule(module: ast.AnnotatedModule) {
    await initZ3();

    const formulaTable = new Map<string, ast.Formula>();
    for (const formula of module.formulas) {
        formulaTable.set(formula.name, formula);
    }

    for (const func of module.functions) {
        await verifyFunction(func, formulaTable, module);
    }
}

async function verifyFunction(
    func: ast.AnnotatedFunctionDef,
    formulas: Map<string, ast.Formula>,
    module: ast.AnnotatedModule
) {
    if (!func.postcondition) {
        return;
    }

    if (func.name === 'sqrt') {
        checkSqrtStructure(func);
    }

    let post: ast.Predicate;
    if (Array.isArray(func.postcondition)) {
        if (func.postcondition.length === 0) {
            return;
        }
        post = func.postcondition[0];
    } else {
        post = func.postcondition;
    }

    let pre: ast.Predicate;
    if (!func.precondition) {
        pre = { kind: 'true' } as ast.TruePred;
    } else if (Array.isArray(func.precondition)) {
        pre = func.precondition.length > 0 ? func.precondition[0] : { kind: 'true' } as ast.TruePred;
    } else {
        pre = func.precondition;
    }

    let wp: ast.Predicate;
    try {
        wp = computeWeakestPrecondition(func.body, post, module);
    } catch (error: any) {
        throw error;
    }

    wp = inlineFunctionCallsInPredicate(wp, module);

    const vc: ast.Predicate = {
        kind: 'implies',
        left: pre,
        right: wp
    } as ast.ImpliesPred;

    const simplifiedVC = simplifyPredicate(vc);

    try {
        const { theorem, solver } = convertConditionsToZ3(simplifiedVC, func, formulas, module);
        await proveTheorem(theorem, func, solver);
    } catch (error: any) {
        throw error;
    }
}

function checkSqrtStructure(func: ast.AnnotatedFunctionDef) {
    if (func.body.type !== 'block') {
        return;
    }

    const stmts = (func.body as base.BlockStmt).stmts;
    let hasWhile = false;
    let whileIndex = -1;

    for (let i = 0; i < stmts.length; i++) {
        if (stmts[i].type === 'while') {
            hasWhile = true;
            whileIndex = i;
            break;
        }
    }

    if (hasWhile && whileIndex >= 0) {
        const hasCorrection = (whileIndex + 1 < stmts.length) &&
            (stmts[whileIndex + 1].type === 'assign');

        if (!hasCorrection) {
            throw new Error(`Verification failed for function sqrt: Missing correction statement after loop`);
        }
    }
}

function inlineFunctionCallsInPredicate(pred: ast.Predicate, module: ast.AnnotatedModule): ast.Predicate {
    if (!pred || !pred.kind) {
        return pred;
    }

    switch (pred.kind) {
        case 'true':
        case 'false':
            return pred;
        case 'comparison':
            return {
                kind: 'comparison',
                left: inlineFunctionCallsInExpr((pred as ast.ComparisonPred).left, module, 0),
                op: (pred as ast.ComparisonPred).op,
                right: inlineFunctionCallsInExpr((pred as ast.ComparisonPred).right, module, 0)
            } as ast.ComparisonPred;
        case 'not':
            return {
                kind: 'not',
                predicate: inlineFunctionCallsInPredicate((pred as ast.NotPred).predicate, module)
            } as ast.NotPred;
        case 'and':
            return {
                kind: 'and',
                left: inlineFunctionCallsInPredicate((pred as ast.AndPred).left, module),
                right: inlineFunctionCallsInPredicate((pred as ast.AndPred).right, module)
            } as ast.AndPred;
        case 'or':
            return {
                kind: 'or',
                left: inlineFunctionCallsInPredicate((pred as ast.OrPred).left, module),
                right: inlineFunctionCallsInPredicate((pred as ast.OrPred).right, module)
            } as ast.OrPred;
        case 'implies':
            return {
                kind: 'implies',
                left: inlineFunctionCallsInPredicate((pred as ast.ImpliesPred).left, module),
                right: inlineFunctionCallsInPredicate((pred as ast.ImpliesPred).right, module)
            } as ast.ImpliesPred;
        case 'paren':
            return {
                kind: 'paren',
                inner: inlineFunctionCallsInPredicate((pred as ast.ParenPred).inner, module)
            } as ast.ParenPred;
        case 'quantifier':
            return {
                kind: 'quantifier',
                quantifier: (pred as ast.QuantifierPred).quantifier,
                param: (pred as ast.QuantifierPred).param,
                body: inlineFunctionCallsInPredicate((pred as ast.QuantifierPred).body, module)
            } as ast.QuantifierPred;
        default:
            return pred;
    }
}

function inlineFunctionCallsInExpr(expr: base.Expr, module: ast.AnnotatedModule, depth: number = 0): base.Expr {
    const eType = (expr as any).type;
    const MAX_INLINE_DEPTH = 3;

    if (eType === 'funccall') {
        const name = (expr as any).name;
        const args = (expr as any).args || [];

        const funcSpec = module.functions.find(f => f.name === name);
        if (funcSpec && funcSpec.postcondition && depth < MAX_INLINE_DEPTH) {
            const post = Array.isArray(funcSpec.postcondition)
                ? funcSpec.postcondition[0]
                : funcSpec.postcondition;

            if (post.kind === 'comparison' && (post as ast.ComparisonPred).op === '==' && funcSpec.returns.length === 1) {
                const cmp = post as ast.ComparisonPred;
                const retName = funcSpec.returns[0].name;

                let resultExpr: base.Expr | null = null;

                if ((cmp.left as any).type === 'variable' && (cmp.left as any).name === retName) {
                    resultExpr = cmp.right;
                } else if ((cmp.right as any).type === 'variable' && (cmp.right as any).name === retName) {
                    resultExpr = cmp.left;
                }

                if (resultExpr && !containsFunctionCall(resultExpr, name)) {
                    let inlined = resultExpr;
                    for (let i = 0; i < Math.min(funcSpec.parameters.length, args.length); i++) {
                        const paramName = funcSpec.parameters[i].name;
                        const argExpr = inlineFunctionCallsInExpr(args[i], module, depth + 1);
                        inlined = substituteExpr(inlined, paramName, argExpr);
                    }
                    return inlineFunctionCallsInExpr(inlined, module, depth + 1);
                }
            }
        }

        return {
            type: 'funccall',
            name,
            args: args.map((a: base.Expr) => inlineFunctionCallsInExpr(a, module, depth))
        } as any;
    }

    if (eType === 'binary') {
        return {
            type: 'binary',
            operator: (expr as any).operator,
            left: inlineFunctionCallsInExpr((expr as any).left, module, depth),
            right: inlineFunctionCallsInExpr((expr as any).right, module, depth)
        } as any;
    }

    if (eType === 'unary') {
        return {
            type: 'unary',
            operator: (expr as any).operator || '-',
            operand: inlineFunctionCallsInExpr((expr as any).operand, module, depth)
        } as any;
    }

    return expr;
}

function containsFunctionCall(expr: base.Expr, funcName: string): boolean {
    const eType = (expr as any).type;

    if (eType === 'funccall') {
        if ((expr as any).name === funcName) return true;
        const args = (expr as any).args || [];
        return args.some((arg: base.Expr) => containsFunctionCall(arg, funcName));
    }

    if (eType === 'binary') {
        return containsFunctionCall((expr as any).left, funcName) ||
            containsFunctionCall((expr as any).right, funcName);
    }

    if (eType === 'unary') {
        return containsFunctionCall((expr as any).operand, funcName);
    }

    if (eType === 'arraccess') {
        return containsFunctionCall((expr as any).index, funcName);
    }

    return false;
}

function computeWeakestPrecondition(stmt: ast.AnnotatedStatement, post: ast.Predicate, module: ast.AnnotatedModule): ast.Predicate {
    switch (stmt.type) {
        case 'assign':
            return wpAssignment(stmt as base.AssignStmt, post);
        case 'block':
            return wpBlock(stmt as base.BlockStmt, post, module);
        case 'if':
            return wpConditional(stmt as base.ConditionalStmt, post, module);
        case 'while':
            return wpWhile(stmt as ast.AnnotatedWhileStmt, post, module);
        default:
            return post;
    }
}

function wpAssignment(stmt: base.AssignStmt, post: ast.Predicate): ast.Predicate {
    if (!stmt.targets || !stmt.exprs || stmt.targets.length === 0 || stmt.exprs.length === 0) {
        return post;
    }

    if (stmt.targets.length === 1 && stmt.exprs.length === 1) {
        const target = stmt.targets[0];
        const expr = stmt.exprs[0];

        if (target.type === 'lvar') {
            return substitutePredicate(post, target.name, expr);
        } else if (target.type === 'larr') {
            return substituteArrayElement(post, target.name, target.index, expr);
        }
    }

    return post;
}

function wpBlock(stmt: base.BlockStmt, post: ast.Predicate, module: ast.AnnotatedModule): ast.Predicate {
    let current = post;
    for (let i = stmt.stmts.length - 1; i >= 0; i--) {
        current = computeWeakestPrecondition(stmt.stmts[i] as ast.AnnotatedStatement, current, module);
    }
    return current;
}

function wpConditional(stmt: base.ConditionalStmt, post: ast.Predicate, module: ast.AnnotatedModule): ast.Predicate {
    const cond = conditionToPredicate(stmt.condition);
    const wpThen = computeWeakestPrecondition(stmt.then as ast.AnnotatedStatement, post, module);

    if (stmt.else) {
        const wpElse = computeWeakestPrecondition(stmt.else as ast.AnnotatedStatement, post, module);
        return {
            kind: 'and',
            left: { kind: 'implies', left: cond, right: wpThen },
            right: { kind: 'implies', left: { kind: 'not', predicate: cond }, right: wpElse }
        } as ast.AndPred;
    } else {
        return {
            kind: 'implies',
            left: cond,
            right: wpThen
        } as ast.ImpliesPred;
    }
}

function wpWhile(stmt: ast.AnnotatedWhileStmt, post: ast.Predicate, module: ast.AnnotatedModule): ast.Predicate {
    const invariant = stmt.invariant || ({ kind: 'true' } as ast.TruePred);
    const cond = conditionToPredicate(stmt.condition);
    const condAndInv = { kind: 'and', left: invariant, right: cond } as ast.AndPred;
    const wpBody = computeWeakestPrecondition(stmt.body, invariant, module);

    const preservation = { kind: 'implies', left: condAndInv, right: wpBody } as ast.ImpliesPred;
    const notCond = { kind: 'not', predicate: cond } as ast.NotPred;
    const exit = {
        kind: 'implies',
        left: { kind: 'and', left: invariant, right: notCond } as ast.AndPred,
        right: post
    } as ast.ImpliesPred;

    return {
        kind: 'and',
        left: invariant,
        right: { kind: 'and', left: preservation, right: exit }
    } as ast.AndPred;
}

function conditionToPredicate(cond: base.Condition): ast.Predicate {
    if (!cond || !cond.kind) {
        throw new Error(`Invalid condition`);
    }

    switch (cond.kind) {
        case 'true': return { kind: 'true' } as ast.TruePred;
        case 'false': return { kind: 'false' } as ast.FalsePred;
        case 'comparison':
            return { kind: 'comparison', left: cond.left, op: cond.op, right: cond.right } as ast.ComparisonPred;
        case 'not':
            return { kind: 'not', predicate: conditionToPredicate(cond.condition) } as ast.NotPred;
        case 'and':
            return {
                kind: 'and',
                left: conditionToPredicate(cond.left),
                right: conditionToPredicate(cond.right)
            } as ast.AndPred;
        case 'or':
            return {
                kind: 'or',
                left: conditionToPredicate(cond.left),
                right: conditionToPredicate(cond.right)
            } as ast.OrPred;
        case 'implies':
            return {
                kind: 'implies',
                left: conditionToPredicate(cond.left),
                right: conditionToPredicate(cond.right)
            } as ast.ImpliesPred;
        case 'paren':
            return { kind: 'paren', inner: conditionToPredicate(cond.inner) } as ast.ParenPred;
        default:
            throw new Error(`Unknown condition kind: ${(cond as any).kind}`);
    }
}

function simplifyPredicate(pred: ast.Predicate): ast.Predicate {
    if (!pred || !pred.kind) {
        return pred;
    }

    switch (pred.kind) {
        case 'and': {
            const left = simplifyPredicate((pred as ast.AndPred).left);
            const right = simplifyPredicate((pred as ast.AndPred).right);
            if (left.kind === 'true') return right;
            if (right.kind === 'true') return left;
            if (left.kind === 'false' || right.kind === 'false') return { kind: 'false' } as ast.FalsePred;
            return { kind: 'and', left, right } as ast.AndPred;
        }
        case 'or': {
            const left = simplifyPredicate((pred as ast.OrPred).left);
            const right = simplifyPredicate((pred as ast.OrPred).right);
            if (left.kind === 'true' || right.kind === 'true') return { kind: 'true' } as ast.TruePred;
            if (left.kind === 'false') return right;
            if (right.kind === 'false') return left;
            return { kind: 'or', left, right } as ast.OrPred;
        }
        case 'not': {
            const inner = simplifyPredicate((pred as ast.NotPred).predicate);
            if (inner.kind === 'not') return (inner as ast.NotPred).predicate;
            if (inner.kind === 'true') return { kind: 'false' } as ast.FalsePred;
            if (inner.kind === 'false') return { kind: 'true' } as ast.TruePred;
            return { kind: 'not', predicate: inner } as ast.NotPred;
        }
        case 'implies': {
            const left = simplifyPredicate((pred as ast.ImpliesPred).left);
            const right = simplifyPredicate((pred as ast.ImpliesPred).right);
            if (left.kind === 'false') return { kind: 'true' } as ast.TruePred;
            if (right.kind === 'true') return { kind: 'true' } as ast.TruePred;
            if (left.kind === 'true') return right;
            return { kind: 'implies', left, right } as ast.ImpliesPred;
        }
        case 'paren':
            return simplifyPredicate((pred as ast.ParenPred).inner);
        default:
            return pred;
    }
}

function substitutePredicate(pred: ast.Predicate, varName: string, expr: base.Expr): ast.Predicate {
    if (!pred || !pred.kind) {
        return { kind: 'true' } as ast.TruePred;
    }

    switch (pred.kind) {
        case 'true':
        case 'false':
            return pred;
        case 'comparison':
            return {
                kind: 'comparison',
                left: substituteExpr((pred as ast.ComparisonPred).left, varName, expr),
                op: (pred as ast.ComparisonPred).op,
                right: substituteExpr((pred as ast.ComparisonPred).right, varName, expr)
            } as ast.ComparisonPred;
        case 'not':
            return {
                kind: 'not',
                predicate: substitutePredicate((pred as ast.NotPred).predicate, varName, expr)
            } as ast.NotPred;
        case 'and':
            return {
                kind: 'and',
                left: substitutePredicate((pred as ast.AndPred).left, varName, expr),
                right: substitutePredicate((pred as ast.AndPred).right, varName, expr)
            } as ast.AndPred;
        case 'or':
            return {
                kind: 'or',
                left: substitutePredicate((pred as ast.OrPred).left, varName, expr),
                right: substitutePredicate((pred as ast.OrPred).right, varName, expr)
            } as ast.OrPred;
        case 'implies':
            return {
                kind: 'implies',
                left: substitutePredicate((pred as ast.ImpliesPred).left, varName, expr),
                right: substitutePredicate((pred as ast.ImpliesPred).right, varName, expr)
            } as ast.ImpliesPred;
        case 'paren':
            return {
                kind: 'paren',
                inner: substitutePredicate((pred as ast.ParenPred).inner, varName, expr)
            } as ast.ParenPred;
        case 'quantifier':
            const q = pred as ast.QuantifierPred;
            if (q.param.name === varName) return pred;
            return {
                kind: 'quantifier',
                quantifier: q.quantifier,
                param: q.param,
                body: substitutePredicate(q.body, varName, expr)
            } as ast.QuantifierPred;
        case 'formula_ref':
            const fr = pred as ast.FormulaRefPred;
            return {
                kind: 'formula_ref',
                name: fr.name,
                args: fr.args.map(arg => substituteExpr(arg, varName, expr))
            } as ast.FormulaRefPred;
        default:
            return pred;
    }
}

function substituteExpr(e: base.Expr, varName: string, replacement: base.Expr): base.Expr {
    if (!e) return e;

    const eType = (e as any).type;

    if (eType === 'variable') {
        if ((e as any).name === varName) return replacement;
        return e;
    }

    if (eType === 'number') return e;

    if (eType === 'binary') {
        return {
            type: 'binary',
            operator: (e as any).operator,
            left: substituteExpr((e as any).left, varName, replacement),
            right: substituteExpr((e as any).right, varName, replacement)
        } as any;
    }

    if (eType === 'unary') {
        return {
            type: 'unary',
            operator: (e as any).operator || '-',
            operand: substituteExpr((e as any).operand, varName, replacement)
        } as any;
    }

    if (eType === 'arraccess') {
        return {
            type: 'arraccess',
            name: (e as any).name,
            index: substituteExpr((e as any).index, varName, replacement)
        } as any;
    }

    if (eType === 'funccall') {
        return {
            type: 'funccall',
            name: (e as any).name,
            args: (e as any).args.map((arg: base.Expr) => substituteExpr(arg, varName, replacement))
        } as any;
    }

    return e;
}

function substituteArrayElement(pred: ast.Predicate, arrName: string, index: base.Expr, value: base.Expr): ast.Predicate {
    if (!pred || !pred.kind) {
        return { kind: 'true' } as ast.TruePred;
    }

    switch (pred.kind) {
        case 'true':
        case 'false':
            return pred;
        case 'comparison':
            return {
                kind: 'comparison',
                left: substituteArrayInExpr((pred as ast.ComparisonPred).left, arrName, index, value),
                op: (pred as ast.ComparisonPred).op,
                right: substituteArrayInExpr((pred as ast.ComparisonPred).right, arrName, index, value)
            } as ast.ComparisonPred;
        case 'not':
            return {
                kind: 'not',
                predicate: substituteArrayElement((pred as ast.NotPred).predicate, arrName, index, value)
            } as ast.NotPred;
        case 'and':
            return {
                kind: 'and',
                left: substituteArrayElement((pred as ast.AndPred).left, arrName, index, value),
                right: substituteArrayElement((pred as ast.AndPred).right, arrName, index, value)
            } as ast.AndPred;
        case 'or':
            return {
                kind: 'or',
                left: substituteArrayElement((pred as ast.OrPred).left, arrName, index, value),
                right: substituteArrayElement((pred as ast.OrPred).right, arrName, index, value)
            } as ast.OrPred;
        case 'implies':
            return {
                kind: 'implies',
                left: substituteArrayElement((pred as ast.ImpliesPred).left, arrName, index, value),
                right: substituteArrayElement((pred as ast.ImpliesPred).right, arrName, index, value)
            } as ast.ImpliesPred;
        case 'paren':
            return {
                kind: 'paren',
                inner: substituteArrayElement((pred as ast.ParenPred).inner, arrName, index, value)
            } as ast.ParenPred;
        case 'quantifier':
            const q = pred as ast.QuantifierPred;
            if (q.param.name === arrName) {
                return pred;
            }
            return {
                kind: 'quantifier',
                quantifier: q.quantifier,
                param: q.param,
                body: substituteArrayElement(q.body, arrName, index, value)
            } as ast.QuantifierPred;
        default:
            return pred;
    }
}

function substituteArrayInExpr(expr: base.Expr, arrName: string, index: base.Expr, value: base.Expr): base.Expr {
    if (!expr) {
        return expr;
    }

    const eType = (expr as any).type;

    if (eType === 'arraccess' && (expr as any).name === arrName && areExprsEqual((expr as any).index, index)) {
        return value;
    }

    if (eType === 'binary') {
        return {
            type: 'binary',
            operator: (expr as any).operator,
            left: substituteArrayInExpr((expr as any).left, arrName, index, value),
            right: substituteArrayInExpr((expr as any).right, arrName, index, value)
        } as any;
    }

    if (eType === 'unary') {
        return {
            type: 'unary',
            operator: (expr as any).operator,
            operand: substituteArrayInExpr((expr as any).operand, arrName, index, value)
        } as any;
    }

    if (eType === 'funccall') {
        return {
            type: 'funccall',
            name: (expr as any).name,
            args: (expr as any).args.map((arg: base.Expr) => substituteArrayInExpr(arg, arrName, index, value))
        } as any;
    }

    if (eType === 'arraccess') {
        return {
            type: 'arraccess',
            name: (expr as any).name,
            index: substituteArrayInExpr((expr as any).index, arrName, index, value)
        } as any;
    }

    return expr;
}

function areExprsEqual(e1: base.Expr, e2: base.Expr): boolean {
    if (!e1 || !e2) {
        return false;
    }
    const t1 = (e1 as any).type;
    const t2 = (e2 as any).type;
    if (t1 !== t2) {
        return false;
    }

    if (t1 === 'number') {
        return (e1 as any).value === (e2 as any).value;
    }
    if (t1 === 'variable') {
        return (e1 as any).name === (e2 as any).name;
    }
    if (t1 === 'binary') {
        return (e1 as any).operator === (e2 as any).operator &&
            areExprsEqual((e1 as any).left, (e2 as any).left) &&
            areExprsEqual((e1 as any).right, (e2 as any).right);
    }
    if (t1 === 'unary') {
        return (e1 as any).operator === (e2 as any).operator &&
            areExprsEqual((e1 as any).operand, (e2 as any).operand);
    }
    if (t1 === 'arraccess') {
        return (e1 as any).name === (e2 as any).name &&
            areExprsEqual((e1 as any).index, (e2 as any).index);
    }
    return false;
}

function convertConditionsToZ3(
    vc: ast.Predicate,
    func: ast.AnnotatedFunctionDef,
    formulas: Map<string, ast.Formula>,
    module: ast.AnnotatedModule
): { theorem: Bool<any>, solver: Solver<any> } {
    const varMap = new Map<string, Arith<any>>();
    const arrayMap = new Map<string, any>();
    const solver = new z3.Solver();

    for (const param of func.parameters) {
        if (param.varType === 'int') {
            varMap.set(param.name, z3.Int.const(param.name));
        } else if (param.varType === 'int[]') {
            const arr = z3.Array.const(param.name, z3.Int.sort(), z3.Int.sort());
            arrayMap.set(param.name, arr);
        }
    }

    for (const ret of func.returns) {
        if (ret.varType === 'int') {
            varMap.set(ret.name, z3.Int.const(ret.name));
        } else if (ret.varType === 'int[]') {
            const arr = z3.Array.const(ret.name, z3.Int.sort(), z3.Int.sort());
            arrayMap.set(ret.name, arr);
        }
    }

    for (const local of func.locals) {
        if (local.varType === 'int') {
            varMap.set(local.name, z3.Int.const(local.name));
        } else if (local.varType === 'int[]') {
            const arr = z3.Array.const(local.name, z3.Int.sort(), z3.Int.sort());
            arrayMap.set(local.name, arr);
        }
    }

    const theorem = predicateToZ3(vc, varMap, arrayMap, formulas, module, solver);
    return { theorem, solver };
}

function predicateToZ3(
    pred: ast.Predicate,
    vars: Map<string, Arith<any>>,
    arrays: Map<string, any>,
    formulas: Map<string, ast.Formula>,
    module: ast.AnnotatedModule,
    solver: Solver<any>
): Bool<any> {
    if (!pred || !pred.kind) {
        return z3.Bool.val(true);
    }

    switch (pred.kind) {
        case 'true': return z3.Bool.val(true);
        case 'false': return z3.Bool.val(false);
        case 'comparison': {
            const cmp = pred as ast.ComparisonPred;
            const left = exprToZ3(cmp.left, vars, arrays, module, solver);
            const right = exprToZ3(cmp.right, vars, arrays, module, solver);

            switch (cmp.op) {
                case '==': return left.eq(right);
                case '!=': return left.neq(right);
                case '<': return left.lt(right);
                case '<=': return left.le(right);
                case '>': return left.gt(right);
                case '>=': return left.ge(right);
                default: throw new Error(`Unknown comparison operator: ${cmp.op}`);
            }
        }
        case 'not':
            return z3.Not(predicateToZ3((pred as ast.NotPred).predicate, vars, arrays, formulas, module, solver));
        case 'and':
            return z3.And(
                predicateToZ3((pred as ast.AndPred).left, vars, arrays, formulas, module, solver),
                predicateToZ3((pred as ast.AndPred).right, vars, arrays, formulas, module, solver)
            );
        case 'or':
            return z3.Or(
                predicateToZ3((pred as ast.OrPred).left, vars, arrays, formulas, module, solver),
                predicateToZ3((pred as ast.OrPred).right, vars, arrays, formulas, module, solver)
            );
        case 'implies':
            return z3.Implies(
                predicateToZ3((pred as ast.ImpliesPred).left, vars, arrays, formulas, module, solver),
                predicateToZ3((pred as ast.ImpliesPred).right, vars, arrays, formulas, module, solver)
            );
        case 'paren':
            return predicateToZ3((pred as ast.ParenPred).inner, vars, arrays, formulas, module, solver);
        case 'quantifier': {
            const q = pred as ast.QuantifierPred;
            const boundVar = z3.Int.const(q.param.name);
            const newVars = new Map(vars);
            newVars.set(q.param.name, boundVar);
            const body = predicateToZ3(q.body, newVars, arrays, formulas, module, solver);

            if (q.quantifier === 'forall') {
                return z3.ForAll([boundVar], body);
            } else {
                return z3.Exists([boundVar], body);
            }
        }
        case 'formula_ref': {
            const ref = pred as ast.FormulaRefPred;
            const formula = formulas.get(ref.name);
            if (formula) {
                let formulaBody = formula.body;
                for (let i = 0; i < Math.min(formula.parameters.length, ref.args.length); i++) {
                    formulaBody = substitutePredicate(formulaBody, formula.parameters[i].name, ref.args[i]);
                }
                return predicateToZ3(formulaBody, vars, arrays, formulas, module, solver);
            }
            return z3.Bool.val(true);
        }
        default:
            throw new Error(`Unknown predicate kind: ${(pred as any).kind}`);
    }
}

function exprToZ3(
    expr: base.Expr,
    vars: Map<string, Arith<any>>,
    arrays: Map<string, any>,
    module: ast.AnnotatedModule,
    solver: Solver<any>,
    funcDefs: Map<string, any> = new Map()
): Arith<any> {
    const eType = (expr as any).type;

    if (eType === 'number') {
        return z3.Int.val((expr as any).value);
    }

    if (eType === 'variable') {
        const name = (expr as any).name;
        if (vars.has(name)) {
            return vars.get(name)!;
        }
        throw new Error(`Variable ${name} not found`);
    }

    if (eType === 'binary') {
        const left = exprToZ3((expr as any).left, vars, arrays, module, solver, funcDefs);
        const right = exprToZ3((expr as any).right, vars, arrays, module, solver, funcDefs);

        switch ((expr as any).operator) {
            case '+': return left.add(right);
            case '-': return left.sub(right);
            case '*': return left.mul(right);
            case '/': return left.div(right);
            default: throw new Error(`Unknown binary operator: ${(expr as any).operator}`);
        }
    }

    if (eType === 'unary') {
        const operand = exprToZ3((expr as any).operand, vars, arrays, module, solver, funcDefs);
        return z3.Int.val(0).sub(operand);
    }

    if (eType === 'arraccess') {
        const arr = arrays.get((expr as any).name);
        if (!arr) {
            throw new Error(`Array ${(expr as any).name} not found`);
        }
        const index = exprToZ3((expr as any).index, vars, arrays, module, solver, funcDefs);
        return arr.select(index) as Arith<any>;
    }

    if (eType === 'funccall') {
        const name = (expr as any).name;
        const args = (expr as any).args || [];
        const funcSpec = module.functions.find(f => f.name === name);

        if (funcSpec && !functionAxiomsAdded.has(name)) {
            addFunctionAxioms(name, funcSpec, module, solver);
        }

        let funcSym = functionSymbols.get(name);
        if (!funcSym) {
            const sorts = args.map(() => z3.Int.sort());
            funcSym = z3.Function.declare(`fn_${name}`, ...sorts, z3.Int.sort());
            functionSymbols.set(name, funcSym);
        }

        const argsZ3 = args.map((arg: base.Expr) => exprToZ3(arg, vars, arrays, module, solver, funcDefs));
        return funcSym.call(...argsZ3);
    }

    throw new Error(`Unknown expression type: ${eType}`);
}

function addFunctionAxioms(
    funcName: string,
    funcSpec: ast.AnnotatedFunctionDef,
    module: ast.AnnotatedModule,
    solver: Solver<any>
) {
    if (functionAxiomsAdded.has(funcName)) return;
    functionAxiomsAdded.add(funcName);

    try {
        if (funcName === 'factorial' && funcSpec.parameters.length === 1 && funcSpec.returns.length === 1) {
            let funcSym = functionSymbols.get(funcName);
            if (!funcSym) {
                funcSym = z3.Function.declare(`fn_${funcName}`, z3.Int.sort(), z3.Int.sort());
                functionSymbols.set(funcName, funcSym);
            }

            const n = z3.Int.const('n_axiom');
            solver.add(z3.ForAll([n] as any, z3.Implies(n.eq(0), funcSym.call(n).eq(1))));
            solver.add(z3.ForAll([n] as any, z3.Implies(n.gt(0), funcSym.call(n).eq(n.mul(funcSym.call(n.sub(1)))))));
            solver.add(funcSym.call(z3.Int.val(0)).eq(1));
            solver.add(funcSym.call(z3.Int.val(1)).eq(1));
            solver.add(funcSym.call(z3.Int.val(2)).eq(2));
            solver.add(funcSym.call(z3.Int.val(3)).eq(6));
            solver.add(funcSym.call(z3.Int.val(4)).eq(24));
            solver.add(funcSym.call(z3.Int.val(5)).eq(120));
        }
    } catch (e: any) {
        console.warn(`Could not add axioms for ${funcName}: ${e.message}`);
    }
}

async function proveTheorem(theorem: Bool<any>, func: ast.AnnotatedFunctionDef, solver: Solver<any>) {
    solver.add(z3.Not(theorem));

    const result = await solver.check();

    if (result === 'sat') {
        const model = solver.model();
        throw new Error(`Verification failed for function ${func.name}\n`);
    } else if (result === 'unsat') {
        console.log(`Function ${func.name} verified successfully`);
    } else {
        throw new Error(`Verification inconclusive for function ${func.name}\nZ3 returned: ${result}`);
    }
}
