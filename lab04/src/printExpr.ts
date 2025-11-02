import { Expr } from "./ast";

const PREC = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'unary': 3
};

export function printExpr(e: Expr, parentOp?: string, isRight?: boolean): string {
  switch (e.type) {
    case 'number':
      return e.value.toString();
    case 'variable':
      return e.name;
    case 'unary': {
      const operandStr = printExpr(e.operand, 'unary', false);
      if (e.operand.type === 'binary') {
        return `-${operandStr}`;
      }
      return `-${operandStr}`;
    }
    case 'binary': {
      const leftStr = printExpr(e.left, e.operator, false);
      const rightStr = printExpr(e.right, e.operator, true);
      const result = `${leftStr} ${e.operator} ${rightStr}`;
      
      if (parentOp === undefined) {
        return result;
      }
      
      const currentPrec = PREC[e.operator];
      const parentPrec = PREC[parentOp as keyof typeof PREC];
      if (currentPrec < parentPrec) {
        return `(${result})`;
      }
      
      if (currentPrec === parentPrec && isRight) {
        if (parentOp === '-' || parentOp === '/') {
          return `(${result})`;
        }
      }
      
      return result;
    }
  }
}