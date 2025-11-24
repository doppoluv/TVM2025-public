import { writeFileSync } from "fs";
import { Op, I32, I64, Void, c, BufferedEmitter, LocalEntry, Uint8, Int, ExportEntry } from "../../wasm";
import { Module, Statement, Expr, LValue, Condition } from "../../lab08";

const { i32, i64, varuint32, get_local, set_local, call, if_, void_block, void_loop, br_if, br,
        str_ascii, export_entry, func_type_m, function_body, type_section, function_section,
        export_section, code_section } = c;

export async function compileModule<M extends Module>(m: M, name?: string): Promise<WebAssembly.Exports> {
    const typeSection: any[] = [];
    const functionSection: any[] = [];
    const exportSection: ExportEntry[] = [];
    const codeSection: any[] = [];

    const functionIndexMap = new Map<string, number>();

    // создаём сигнатуры типов и индексы функций
    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        functionIndexMap.set(func.name, i);

        const paramTypes = func.parameters.map(p =>
            p.varType === 'int[]' ? i64 : i32
        );
        const returnTypes = func.returns.map(r =>
            r.varType === 'int[]' ? i64 : i32
        );

        typeSection.push(func_type_m(paramTypes, returnTypes));
        functionSection.push(varuint32(i));

        exportSection.push(export_entry(str_ascii(func.name), c.external_kind.function, varuint32(i)));
    }

    // генерируем тела функций
    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        const allLocals = [
            ...func.parameters.map(p => p.name),
            ...func.returns.map(r => r.name),
            ...func.locals.map(l => l.name)
        ];

        const numLocalsToAdd = func.returns.length + func.locals.length;
        const localEntries: LocalEntry[] = numLocalsToAdd > 0
            ? [c.local_entry(c.varuint32(numLocalsToAdd), i32)] : [];

        const bodyOps: (Op<Void> | Op<I32>)[] = compileStatement(func.body, allLocals, functionIndexMap);

        for (const ret of func.returns) {
            const idx = allLocals.indexOf(ret.name);
            bodyOps.push(get_local(i32, idx));
        }

        codeSection.push(function_body(localEntries, bodyOps));
    }

    const mod = c.module([
        type_section(typeSection),
        function_section(functionSection),
        export_section(exportSection),
        code_section(codeSection)
    ]);

    const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
    mod.emit(emitter);

    const wasmModule = await WebAssembly.instantiate(emitter.buffer);
    return wasmModule.instance.exports;
}


function compileExpr(expr: Expr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    switch ((expr as any).type) {
        case "number":
            return i32.const((expr as any).value);

        case "variable":
            const varIdx = locals.indexOf((expr as any).name);
            return get_local(i32, varIdx);

        case "unary":
            return i32.mul(i32.const(-1),compileExpr((expr as any).operand, locals, functionIndexMap));

        case "binary": {
            const e = expr as any;
            const left = compileExpr(e.left, locals, functionIndexMap);
            const right = compileExpr(e.right, locals, functionIndexMap);

            switch (e.operator) {
                case '+': return i32.add(left, right);
                case '-': return i32.sub(left, right);
                case '*': return i32.mul(left, right);
                case '/': return i32.div_s(left, right);
                default: throw new Error(`Unknown operator: ${e.operator}`);
            }
        }

        case "funccall": {
            const e = expr as any;
            const args = e.args.map((a: Expr) => compileExpr(a, locals, functionIndexMap));

            const idx = functionIndexMap.get(e.name);
            if (idx === undefined) {
                throw new Error(`Unknown function: ${e.name}`);
            }

            return call(i32, varuint32(idx), args);
        }

        case "arraccess": {
            const e = expr as any;

            const arrIdx = compileExpr(e.index, locals, functionIndexMap);
            const arrVar = get_local(i64, locals.indexOf(e.name));

            return c.array_get(arrVar, arrIdx);
        }

        default: throw new Error(`Unknown expr type: ${(expr as any).type}`);
    }
}


function compileLValue(lvalue: LValue, locals: string[], functionIndexMap: Map<string, number>): {
                       set: (value: Op<I32>) => Op<Void>, get: () => Op<I32>} {
    switch ((lvalue as any).type) {
        case "lvar": {
            const idx = locals.indexOf((lvalue as any).name);
            return {
                set: (v) => set_local(idx, v),
                get: () => get_local(i32, idx)
            };
        }

        case "larr": {
            const lv = lvalue as any;
            const idxExpr = compileExpr(lv.index, locals, functionIndexMap);
            const arrVar = get_local(i64, locals.indexOf(lv.name));

            return {
                set: (v) => void_block([c.array_set(arrVar, idxExpr, v)]),
                get: () => c.array_get(arrVar, idxExpr)
            };
        }

        default: throw new Error(`Unknown lvalue type: ${(lvalue as any).type}`);
    }
}


function compileCondition(cond: Condition, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    switch ((cond as any).kind) {
        case "true":
            return i32.const(1);

        case "false":
            return i32.const(0);

        case "comparison": {
            const cnd = cond as any;
            const left = compileExpr(cnd.left, locals, functionIndexMap);
            const right = compileExpr(cnd.right, locals, functionIndexMap);

            switch (cnd.op) {
                case "==": return i32.eq(left, right);
                case "!=": return i32.ne(left, right);
                case ">": return i32.gt_s(left, right);
                case "<": return i32.lt_s(left, right);
                case ">=": return i32.ge_s(left, right);
                case "<=": return i32.le_s(left, right);
                default: throw new Error(`Unknown comparison: ${cnd.op}`);
            }
        }

        case "not":
            return i32.eqz(compileCondition((cond as any).condition, locals, functionIndexMap));

        case "and":
            return if_(i32,
                compileCondition((cond as any).left, locals, functionIndexMap),
                [compileCondition((cond as any).right, locals, functionIndexMap)],
                [i32.const(0)]);

        case "or":
            return if_(i32,
                compileCondition((cond as any).left, locals, functionIndexMap),
                [i32.const(1)],
                [compileCondition((cond as any).right, locals, functionIndexMap)]);

        case "implies":
            const notLeft = i32.eqz(compileCondition((cond as any).left, locals, functionIndexMap));
            return if_(i32,
                notLeft,
                [i32.const(1)],
                [compileCondition((cond as any).right, locals, functionIndexMap)]
            );

        case "paren":
            return compileCondition((cond as any).inner, locals, functionIndexMap);

        default: throw new Error(`Unknown condition kind: ${(cond as any).kind}`);
    }
}


function compileStatement(stmt: Statement, locals: string[], functionIndexMap: Map<string, number>): Op<Void>[] {
    const ops: Op<Void>[] = [];

    switch ((stmt as any).type) {
        case "block": {
            for (const s of (stmt as any).stmts) {
                ops.push(...compileStatement(s, locals, functionIndexMap));
            }
            break;
        }

        case "assign": {
            const targets = (stmt as any).targets as LValue[];
            const exprs = (stmt as any).exprs as Expr[];

            if (exprs.length === 1 && targets.length > 1) {
                const expr = exprs[0];

                if ((expr as any).type === 'funccall') {
                    const funcName = (expr as any).name;
                    const funcIdx = functionIndexMap.get(funcName);
                    const args = (expr as any).args.map((a: Expr) =>
                        compileExpr(a, locals, functionIndexMap)
                    );

                    const tempStartIdx = locals.length;

                    ops.push(void_block([call(i32, varuint32(funcIdx!), args)]));

                    for (let i = targets.length - 1; i >= 0; i--) {
                        const tempIdx = tempStartIdx + i;
                        ops.push(set_local(tempIdx, i32.const(0)));
                    }

                    for (let i = 0; i < targets.length; i++) {
                        const tempIdx = tempStartIdx + i;
                        const target = targets[i];
                        const lval = compileLValue(target, locals, functionIndexMap);
                        ops.push(lval.set(get_local(i32, tempIdx)));
                    }
                } else {
                    throw new Error('Tuple assignment only works with function calls');
                }
            } else if (exprs.length === targets.length) {
                const vals = exprs.map((e: Expr) => compileExpr(e, locals, functionIndexMap));

                for (let i = 0; i < targets.length; i++) {
                    const lval = compileLValue(targets[i], locals, functionIndexMap);
                    ops.push(lval.set(vals[i]));
                }
            } else {
                throw new Error('Assignment mismatch: different number of targets and expressions');
            }
            break;
        }

        case "if": {
            const s = stmt as any;

            const condition = compileCondition(s.condition, locals, functionIndexMap);
            const thenBranch = compileStatement(s.then, locals, functionIndexMap);
            const elseBranch = s.else ? compileStatement(s.else, locals, functionIndexMap) : [];

            ops.push(void_block([if_(c.void, condition, thenBranch, elseBranch)]));
            break;
        }

        case "while": {
            const s = stmt as any;

            ops.push(void_block([
                void_loop([
                    br_if(1, i32.eqz(compileCondition(s.condition, locals, functionIndexMap))),

                    ...compileStatement(s.body, locals, functionIndexMap),

                    br(0)
                ])
            ]));
            break;
        }

        default: throw new Error(`Unknown statement type: ${(stmt as any).type}`);
    }

    return ops;
}

export { FunnyError } from '../../lab08';