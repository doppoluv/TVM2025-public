import { Expr, createNumber, createVariable, createBinary, createUnary } from "../../lab04";
import { cost } from "./cost";

const memo = new WeakMap<Expr, Expr>();
export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {
  if (memo.has(e)) {
    return memo.get(e)!;
  }

  const result = simplifyRec(e, identities);
  memo.set(e, result);
  return result;
}

function simplifyRec(e: Expr, identities: [Expr, Expr][]): Expr {
  if (e.type === "number" || e.type === "variable") {
    return e;
  }

  if (e.type === "unary") {
    const op = simplifyRec(e.operand, identities);
    const folded = foldConstants(createUnary("-", op));
    return simplifyWithIdentities(folded, identities);
  }

  if (e.type === "binary") {
    const l = simplifyRec(e.left, identities);
    const r = simplifyRec(e.right, identities);
    const folded = foldConstants(createBinary(e.operator, l, r));
    return simplifyWithIdentities(folded, identities);
  }

  return e;
}


function simplifyWithIdentities(e: Expr, identities: [Expr, Expr][]): Expr {
  const visited = new Set<string>();
  const serialize = (expr: Expr): string => JSON.stringify(expr);

  let best = e;
  let bestCost = cost(e);

  const queue: Expr[] = [e];
  visited.add(serialize(e));

  let iterations = 0;
  const maxIterations = 5000;
  while (queue.length > 0 && iterations <= maxIterations) {
    iterations++;
    const current = queue.shift()!;

    for (const [from, to] of identities) {
      for (const [pattern, replacement] of [[from, to], [to, from]]) {
        const results = tryApplyAll(current, pattern, replacement);

        for (const result of results) {
          const resultStr = serialize(result);

          if (visited.has(resultStr)) {
            continue;
          }

          visited.add(resultStr);
          const resultCost = cost(result);

          if (resultCost < bestCost) {
            best = result;
            bestCost = resultCost;
          }

          if (resultCost <= bestCost + 2) {
            queue.push(result);
          }
        }
      }
    }
  }

  return best;
}

function tryApplyAll(e: Expr, from: Expr, to: Expr): Expr[] {
  const results: Expr[] = [];

  const fullMatch = matchPattern(from, e);
  if (fullMatch) {
    results.push(substitute(to, fullMatch));
  }

  if (e.type === "unary") {
    const subResults = tryApplyAll(e.operand, from, to);
    for (const sub of subResults) {
      results.push(createUnary("-", sub));
    }
  }

  if (e.type === "binary") {
    const leftResults = tryApplyAll(e.left, from, to);
    for (const left of leftResults) {
      results.push(createBinary(e.operator, left, e.right));
    }

    const rightResults = tryApplyAll(e.right, from, to);
    for (const right of rightResults) {
      results.push(createBinary(e.operator, e.left, right));
    }
  }

  return results;
}

function foldConstants(e: Expr): Expr {
  if (e.type === "number" || e.type === "variable") {
    return e;
  }

  if (e.type === "unary") {
    const op = foldConstants(e.operand);
    return op.type === "number" ? createNumber(-op.value) : createUnary("-", op);
  }

  if (e.type === "binary") {
    const l = foldConstants(e.left);
    const r = foldConstants(e.right);

    if (l.type === "number" && r.type === "number") {
      const v =
        e.operator === "+" ? l.value + r.value :
        e.operator === "-" ? l.value - r.value :
        e.operator === "*" ? l.value * r.value :
        r.value === 0 ? null : Math.floor(l.value / r.value);

      return v !== null ? createNumber(v) : createBinary(e.operator, l, r);
    }

    return createBinary(e.operator, l, r);
  }

  return e;
}


type Match = Map<string, Expr>;
function matchPattern(pattern: Expr, expr: Expr, env: Match = new Map()): Match | undefined {
  if (pattern.type === "number") {
    return expr.type === "number" && pattern.value === expr.value ? env : undefined;
  }

  if (pattern.type === "variable") {
    const existing = env.get(pattern.name);
    if (existing) {
      return deepEqual(existing, expr) ? env : undefined;
    }

    const newEnv = new Map(env);
    newEnv.set(pattern.name, expr);
    return newEnv;
  }

  if (pattern.type === "unary") {
    return expr.type === "unary" && pattern.operator === expr.operator ? matchPattern(pattern.operand, expr.operand, env) : undefined;
  }

  if (pattern.type === "binary") {
    if (expr.type !== "binary" || pattern.operator !== expr.operator) {
      return undefined;
    }

    const leftMatch = matchPattern(pattern.left, expr.left, env);
    if (!leftMatch) {
      return undefined;
    }

    return matchPattern(pattern.right, expr.right, leftMatch);
  }

  return undefined;
}

function substitute(template: Expr, env: Match): Expr {
  if (template.type === "number") {
    return createNumber(template.value);
  }

  if (template.type === "variable") {
    const sub = env.get(template.name);
    return sub ? structuredClone(sub) : createVariable(template.name);
  }

  if (template.type === "unary") {
    return createUnary("-", substitute(template.operand, env));
  }

  if (template.type === "binary") {
    return createBinary(template.operator, substitute(template.left, env), substitute(template.right, env));
  }

  throw new Error("Unknown expression type");
}


function deepEqual(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === "number") {
    return a.value === (b as any).value;
  }

  if (a.type === "variable") {
    return a.name === (b as any).name;
  }

  if (a.type === "unary") {
    return deepEqual(a.operand, (b as any).operand);
  }

  if (a.type === "binary") {
    return (a.operator === (b as any).operator && deepEqual(a.left, (b as any).left) && deepEqual(a.right, (b as any).right));
  }

  return false;
}