import { Dict, MatchResult, Semantics } from "ohm-js";
import grammar, { AddMulActionDict } from "./addmul.ohm-bundle";

export const addMulSemantics: AddMulSemantics = grammar.createSemantics() as AddMulSemantics;


const addMulCalc = {
  AddExpr_add: (left: any, _: any, right: any) => left.calculate() + right.calculate(),
  AddExpr: (e: any) => e.calculate(),
  MulExpr_mul: (left: any, _: any, right: any) => left.calculate() * right.calculate(),
  MulExpr: (e: any) => e.calculate(),
  Primary_paren: (_: any, e: any, __: any) => e.calculate(),
  Primary: (e: any) => e.calculate(),
  number: (digits: any) => parseInt(digits.sourceString, 10),
} satisfies AddMulActionDict<number>;

addMulSemantics.addOperation<Number>("calculate()", addMulCalc);

interface AddMulDict  extends Dict {
    calculate(): number;
}

interface AddMulSemantics extends Semantics
{
    (match: MatchResult): AddMulDict;
}
