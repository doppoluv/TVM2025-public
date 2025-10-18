export type Expr = NumberExpr | VariableExpr | BinaryExpr | UnaryExpr;

export interface NumberExpr {
  type: 'number';
  value: number;
}

export interface VariableExpr {
  type: 'variable';
  name: string;
}

export interface BinaryExpr {
  type: 'binary';
  operator: '+' | '-' | '*' | '/';
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  type: 'unary';
  operator: '-';
  operand: Expr;
}

export function createNumber(value: number): NumberExpr {
  return { type: 'number', value };
}

export function createVariable(name: string): VariableExpr {
  return { type: 'variable', name };
}

export function createBinary(operator: '+' | '-' | '*' | '/', left: Expr, right: Expr): BinaryExpr {
  return { type: 'binary', operator, left, right };
}

export function createUnary(operator: '-', operand: Expr): UnaryExpr {
  return { type: 'unary', operator, operand };
}