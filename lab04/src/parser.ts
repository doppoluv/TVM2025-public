import { MatchResult } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics, SyntaxError } from '../../lab03';
import { Expr, createNumber, createVariable, createBinary, createUnary } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
  AddExpr(arg0, arg1, arg2) {
    let result = arg0.parse();
    
    for (let i = 0; i < arg2.numChildren; i++) {
      const op = arg1.child(i).sourceString as '+' | '-';
      const right = arg2.child(i).parse();
      result = createBinary(op, result, right);
    }
    
    return result;
  },

  MulExpr(arg0, arg1, arg2) {
    let result = arg0.parse();
      
    for (let i = 0; i < arg2.numChildren; i++) {
      const op = arg1.child(i).sourceString as '*' | '/';
      const right = arg2.child(i).parse();
      result = createBinary(op, result, right);
    }
      
    return result;
  },

  UnaryExpr_neg(_arg0, arg1) {
    return createUnary('-', arg1.parse());
  },

  UnaryExpr(arg0) {
    return arg0.parse();
  },

  Primary(arg0) {
    return arg0.parse();
  },

  Primary_paren(_arg0, arg1, _arg2) {
    return arg1.parse();
  },

  number(_arg0) {
    return createNumber(parseInt(this.sourceString, 10));
  },

  variable(_arg0, _arg1) {
    return createVariable(this.sourceString);
  }
};

export const semantics = arithGrammar.createSemantics();
semantics.addOperation("parse()", getExprAst);

export interface ArithSemanticsExt extends ArithmeticSemantics
{
    (match: MatchResult): ArithActionsExt
}

export interface ArithActionsExt 
{
    parse(): Expr
}
export function parseExpr(source: string): Expr
{
  const match = arithGrammar.match(source);
  if (!match.succeeded()) {
    throw new SyntaxError(match.message || "Invalid expression");
  }
  return (semantics(match) as ArithActionsExt).parse();
}