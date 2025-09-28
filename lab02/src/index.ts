import grammar from "./rpn.ohm-bundle";
import { rpnSemantics } from "./semantics";
import { MatchResult } from "ohm-js";

export function evaluate(source: string): number {
  const match = parse(source);
  return rpnSemantics(match).calculate();
}
export function maxStackDepth(source: string): number {
  const match = parse(source);
  return rpnSemantics(match).stackDepth.max;
}

function parse(source: string): MatchResult {
  const match = grammar.match(source);
  if (!match.succeeded()) {
    throw new SyntaxError(match.message || "Invalid expression");
  }
  return match;
}

export class SyntaxError extends Error
{
}

