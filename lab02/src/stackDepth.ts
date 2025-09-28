import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export const rpnStackDepth = {
  Expr: (e: any) => e.stackDepth,
  Expr_add: (left: any, right: any, _: any) => {
    const leftDepth = left.stackDepth;
    const rightDepth = right.stackDepth;
    const max = Math.max(leftDepth.max, leftDepth.out + rightDepth.max);
    const out = Math.max(1, leftDepth.out + rightDepth.out - 1);
    return { max, out };
  },
  Expr_mul: (left: any, right: any, _: any) => {
    const leftDepth = left.stackDepth;
    const rightDepth = right.stackDepth;
    const max = Math.max(leftDepth.max, leftDepth.out + rightDepth.max);
    const out = Math.max(1, leftDepth.out + rightDepth.out - 1);
    return { max, out };
  },
  number: (_: any) => ({ max: 1, out: 1 }),
} satisfies ReversePolishNotationActionDict<StackDepth>;
export type StackDepth = {max: number, out: number};
