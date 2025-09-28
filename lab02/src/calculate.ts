import { ReversePolishNotationActionDict} from "./rpn.ohm-bundle";

export const rpnCalc = {
  Expr: (e: any) => e.calculate(),
  Expr_add: (left: any, right: any, _: any) => left.calculate() + right.calculate(),
  Expr_mul: (left: any, right: any, _: any) => left.calculate() * right.calculate(),
  number: (digits: any) => parseInt(digits.sourceString, 10),
} satisfies ReversePolishNotationActionDict<number>;
