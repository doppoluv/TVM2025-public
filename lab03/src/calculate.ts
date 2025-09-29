import { MatchResult } from "ohm-js";
import grammar, { ArithmeticActionDict, ArithmeticSemantics } from "./arith.ohm-bundle";

export const arithSemantics: ArithSemantics = grammar.createSemantics() as ArithSemantics;


const arithCalc = {
  AddExpr_binary(arg0, arg1, arg2) {
    let result = arg0.calculate(this.args.params);
    for (let i = 0; i < arg2.numChildren; i++) {
      const opType = arg1.child(i).sourceString;
      const value = arg2.child(i).calculate(this.args.params);
      
      if (isNaN(result) || isNaN(value)) {
        return NaN;
      }
      
      result = opType === "+" ? result + value : result - value;
    }

    return result;
  },

  MulExpr_binary(arg0, arg1, arg2) {
    let result = arg0.calculate(this.args.params);
    for (let i = 0; i < arg2.numChildren; i++) {
      const opType = arg1.child(i).sourceString;
      const value = arg2.child(i).calculate(this.args.params);
      
      if (opType === "/" && (value === 0 || isNaN(value))) {
        throw new Error("Division by zero or undefined");
      }
      if (isNaN(result) || isNaN(value)) {
        return NaN;
      }

      result = opType === "*" ? result * value : result / value;
    }
    
    return result;
  },

  UnaryExpr_neg(_arg0, arg1) {
    const val = arg1.calculate(this.args.params);
    return isNaN(val) ? NaN : -val;
  },

  UnaryExpr(arg0) {
    return arg0.calculate(this.args.params);
  },

  Primary(arg0) {
    return arg0.calculate(this.args.params);
  },

  Primary_paren(_arg0, arg1, _arg2) {
    return arg1.calculate(this.args.params);
  },

  number(_arg0) {
    return parseInt(this.sourceString, 10);
  },

  variable(_arg0, _arg1) {
    const name = this.sourceString;
    if (!(name in this.args.params)) return NaN;
    return this.args.params[name];
  },
} satisfies ArithmeticActionDict<number>;


arithSemantics.addOperation<Number>("calculate(params)", arithCalc);


export interface ArithActions {
    calculate(params: {[name:string]:number}): number;
}

export interface ArithSemantics extends ArithmeticSemantics
{
    (match: MatchResult): ArithActions;
}
