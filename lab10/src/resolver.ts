import * as ast from './funnier';
import * as base from '../../lab08';

export class ResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResolutionError';
    }
}

interface ResolutionContext {
    variables: Set<string>;
    functions: Set<string>;
    formulas: Set<string>;
}

export function resolveModule(m: ast.AnnotatedModule): ast.AnnotatedModule {
    const formulaNames = new Set<string>();
    for (const formula of m.formulas) {
        if (formulaNames.has(formula.name)) {
            throw new ResolutionError(
                `Duplicate formula definition: '${formula.name}'`
            );
        }

        formulaNames.add(formula.name);
    }

    const functionNames = new Set<string>();
    for (const func of m.functions) {
        if (functionNames.has(func.name)) {
            throw new ResolutionError(
                `Duplicate function definition: '${func.name}'`
            );
        }

        functionNames.add(func.name);
    }

    const globalContext: ResolutionContext = {
        variables: new Set(),
        functions: functionNames,
        formulas: formulaNames
    };

    for (const formula of m.formulas) {
        const formulaContext: ResolutionContext = {
            ...globalContext,
            variables: new Set(formula.parameters.map(p => p.name))
        };

        checkPredicate(formula.body, formulaContext);
    }

    for (const func of m.functions) {
        checkFunction(func, globalContext);
    }

    return m;
}


function checkFunction(func: ast.AnnotatedFunctionDef, global: ResolutionContext) {
    const funcContext: ResolutionContext = {
        ...global,
        variables: new Set([
            ...func.parameters.map(p => p.name),
            ...func.returns.map(r => r.name),
            ...func.locals.map(l => l.name)
        ])
    };

    if (func.precondition) {
        checkPredicate(func.precondition, funcContext);
    }

    if (func.postcondition) {
        checkPredicate(func.postcondition, funcContext);
    }

    checkStatement(func.body, funcContext);
}

function checkStatement(stmt: ast.AnnotatedStatement, ctx: ResolutionContext) {
    switch (stmt.type) {
        case 'block':
            for (const s of (stmt as base.BlockStmt).stmts) {
                checkStatement(s as ast.AnnotatedStatement, ctx);
            }
            break;

        case 'if':
            const ifStmt = stmt as base.ConditionalStmt;
            checkStatement(ifStmt.then as ast.AnnotatedStatement, ctx);
            if (ifStmt.else) {
                checkStatement(ifStmt.else as ast.AnnotatedStatement, ctx);
            }
            break;

        case 'while':
            const whileStmt = stmt as ast.AnnotatedWhileStmt;
            if (whileStmt.invariant) {
                checkPredicate(whileStmt.invariant, ctx);
            }
            checkStatement(whileStmt.body, ctx);
            break;

        case 'assign':
            break;
    }
}

function checkPredicate(pred: ast.Predicate, ctx: ResolutionContext) {
    switch (pred.kind) {
        case 'true':
        case 'false':
            break;

        case 'comparison':
            const cmp = pred as ast.ComparisonPred;
            checkExpr(cmp.left, ctx);
            checkExpr(cmp.right, ctx);
            break;

        case 'not':
            checkPredicate((pred as ast.NotPred).predicate, ctx);
            break;

        case 'and':
        case 'or':
        case 'implies':
            const binary = pred as ast.AndPred | ast.OrPred | ast.ImpliesPred;
            checkPredicate(binary.left, ctx);
            checkPredicate(binary.right, ctx);
            break;

        case 'paren':
            checkPredicate((pred as ast.ParenPred).inner, ctx);
            break;

        case 'quantifier':
            const quant = pred as ast.QuantifierPred;
            const quantCtx: ResolutionContext = {
                ...ctx,
                variables: new Set([...ctx.variables, quant.param.name])
            };
            checkPredicate(quant.body, quantCtx);
            break;

        case 'formula_ref':
            const call = pred as ast.FormulaRefPred;
            if (!ctx.formulas.has(call.name)) {
                throw new ResolutionError(
                    `Reference to undefined formula: '${call.name}'`
                );
            }

            for (const arg of call.args) {
                checkExpr(arg, ctx);
            }
            break;
    }
}

function checkExpr(expr: base.Expr, ctx: ResolutionContext) {
    switch ((expr as any).type) {
        case 'number':
            break;

        case 'variable':
            const varName = (expr as any).name;
            if (!ctx.variables.has(varName)) {
                throw new ResolutionError(
                    `Reference to undefined variable: '${varName}'`
                );
            }
            break;

        case 'binary':
            const bin = expr as any;
            checkExpr(bin.left, ctx);
            checkExpr(bin.right, ctx);
            break;

        case 'unary':
            checkExpr((expr as any).operand, ctx);
            break;

        case 'funccall':
            const funcCall = expr as any;
            const funcName = funcCall.name;
            if (funcName === 'length') {
                if (Array.isArray(funcCall.args)) {
                    for (const arg of funcCall.args) {
                        checkExpr(arg, ctx);
                    }
                }
                return;
            }

            if (!ctx.functions.has(funcName)) {
                throw new ResolutionError(
                    `Reference to undefined function: '${funcName}'`
                );
            }

            for (const arg of funcCall.args) {
                checkExpr(arg, ctx);
            }
            break;

        case 'arraccess':
            const arr = expr as any;
            if (!ctx.variables.has(arr.name)) {
                throw new ResolutionError(
                    `Reference to undefined array: '${arr.name}'`
                );
            }

            checkExpr(arr.index, ctx);
            break;
    }
}