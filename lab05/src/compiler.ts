import { c as C, Op, I32 } from "../../wasm";
import { Expr } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";

const { i32, get_local } = C;

type NumberExpr = { type: 'number'; value: number };
type VariableExpr = { type: 'variable'; name: string };
type UnaryExpr = { type: 'unary'; operator: '-'; operand: Expr };
type BinaryExpr = { type: 'binary'; operator: '+' | '-' | '*' | '/'; left: Expr; right: Expr };

function isNumber(e: Expr): e is NumberExpr {
    return (e as any).type === 'number';
}

function isVariable(e: Expr): e is VariableExpr {
    return (e as any).type === 'variable';
}

function isUnary(e: Expr): e is UnaryExpr {
    return (e as any).type === 'unary';
}

function isBinary(e: Expr): e is BinaryExpr {
    return (e as any).type === 'binary';
}

export function getVariables(e: Expr): string[] {
    const variables: string[] = [];
    const seen = new Set<string>();
    
    function collectVars(expr: Expr): void {
        if (isNumber(expr)) {
            return;
        }
        
        if (isVariable(expr)) {
            if (!seen.has(expr.name)) {
                seen.add(expr.name);
                variables.push(expr.name);
            }
            return;
        }
        
        if (isUnary(expr)) {
            collectVars(expr.operand);
            return;
        }
        
        if (isBinary(expr)) {
            collectVars(expr.left);
            collectVars(expr.right);
            return;
        }
    }
    
    collectVars(e);
    return variables;
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>>
{
    let expr = wasm(e, variables)
    return await buildOneFunctionModule("test", variables.length, [expr]);
}

function wasm(e: Expr, args: string[]): Op<I32> {
    function compile(expr: Expr): Op<I32> {
        if (isNumber(expr)) {
            return i32.const(expr.value) as Op<I32>;
        }
        
        if (isVariable(expr)) {
            const index = args.indexOf(expr.name);
            
            if (index === -1) {
                return C.unreachable as unknown as Op<I32>;
            }
            
            return get_local(i32, index) as Op<I32>;
        }
        
        if (isUnary(expr)) {
            return i32.sub(i32.const(0) as Op<I32>, compile(expr.operand)) as Op<I32>;
        }
        
        if (isBinary(expr)) {
            const left = compile(expr.left);
            const right = compile(expr.right);
            
            if (expr.operator === '+') {
                return i32.add(left, right) as Op<I32>;
            }
            if (expr.operator === '-') {
                return i32.sub(left, right) as Op<I32>;
            }
            if (expr.operator === '*') {
                return i32.mul(left, right) as Op<I32>;
            }
            if (expr.operator === '/') {
                return i32.div_s(left, right) as Op<I32>;
            }
        }
        
        throw new Error(`Unknown expr type`);
    }
    
    return compile(e);
}