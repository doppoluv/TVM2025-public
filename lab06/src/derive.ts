import { Expr, createNumber, createVariable, createBinary, createUnary } from "../../lab04";

function isZero(e: Expr): boolean {
  return e.type === 'number' && e.value === 0;
}

function isOne(e: Expr): boolean {
  return e.type === 'number' && e.value === 1;
}

function deepEqual(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) return false;
  
  if (a.type === 'number') {
    return a.value === (b as any).value;
  }

  if (a.type === 'variable') {
    return a.name === (b as any).name;
  }

  if (a.type === 'unary') {
    return a.operator === (b as any).operator && deepEqual(a.operand, (b as any).operand);
  }
  
  if (a.type === 'binary') {
    return a.operator === (b as any).operator && deepEqual(a.left, (b as any).left) && deepEqual(a.right, (b as any).right);
  }
  
  return false;
}

function extractCoef(e: Expr): { coef: number; base: Expr } {
  if (e.type === 'binary' && e.operator === '*' && e.left.type === 'number') {
    return { coef: e.left.value, base: e.right };
  }
  
  return { coef: 1, base: e };
}

function simplifyUnary(arg: Expr): Expr {
  // --x = x
  if (arg.type === 'unary') {
    return arg.operand;
  }

  // -0 = 0
  if (isZero(arg)) {
    return createNumber(0);
  }

  if (arg.type === 'number') {
    return createNumber(-arg.value);
  }

  // - (a / b) = (-a) / b
  if (arg.type === 'binary' && arg.operator === '/') {
    if (arg.left.type === 'number') {
      return createBinary('/', createNumber(-arg.left.value), arg.right);
    }
    return createBinary('/', simplifyUnary(arg.left), arg.right);
  }

  // - (a * b) = (-a) * b
  if (arg.type === 'binary' && arg.operator === '*') {
    if (arg.left.type === 'number') {
      return createBinary('*', createNumber(-arg.left.value), arg.right);
    }
    return createBinary('*', simplifyUnary(arg.left), arg.right);
  }

  return createUnary('-', arg);
}

function simplifyAdd(left: Expr, right: Expr): Expr {
  // 0 + x = x
  if (isZero(left)) {
    return right;
  }

  // x + 0 = x
  if (isZero(right)) {
    return left;
  }

  if (left.type === 'number' && right.type === 'number') {
    return createNumber(left.value + right.value);
  }

  const { coef: coef1, base: base1 } = extractCoef(left);
  const { coef: coef2, base: base2 } = extractCoef(right);
  if (deepEqual(base1, base2)) {
    const sumCoef = coef1 + coef2;
    
    if (sumCoef === 0) {
      return createNumber(0);
    }
    
    if (sumCoef === 1) {
      return base1;
    }
    
    return createBinary('*', createNumber(sumCoef), base1);
  }

  return createBinary('+', left, right);
}

function simplifySub(left: Expr, right: Expr): Expr {
  // x - 0 = x
  if (isZero(right)) {
    return left;
  }

  // 0 - x = -x
  if (isZero(left)) {
    return simplifyUnary(right);
  }

  if (left.type === 'number' && right.type === 'number') {
    return createNumber(left.value - right.value);
  }

  const { coef: coef1, base: base1 } = extractCoef(left);
  const { coef: coef2, base: base2 } = extractCoef(right);
  if (deepEqual(base1, base2)) {
    const diffCoef = coef1 - coef2;
    
    if (diffCoef === 0) {
      return createNumber(0);
    }
    
    if (diffCoef === 1) {
      return base1;
    }
    
    if (diffCoef < 0) {
      return createUnary('-', createBinary('*', createNumber(-diffCoef), base1));
    }
    
    return createBinary('*', createNumber(diffCoef), base1);
  }
  
  return createBinary('-', left, right);
}

function simplifyMul(left: Expr, right: Expr): Expr {
  // x * 0 = 0 * x = 0
  if (isZero(left) || isZero(right)) {
    return createNumber(0);
  }
  
  // 1 * x = x
  if (isOne(left)) {
    return right;
  }

  // x * 1 = x
  if (isOne(right)) {
    return left;
  }

  if (left.type === 'number' && right.type === 'number') {
    return createNumber(left.value * right.value);
  }

  // a * (b * x) = (a * b) * x
  if (left.type === 'number' && right.type === 'binary' && right.operator === '*' && right.left.type === 'number') {
    return createBinary('*', createNumber(left.value * right.left.value), right.right);
  }

  // (a * x) * b = (a * b) * x
  if (right.type === 'number' && left.type === 'binary' && left.operator === '*' && left.left.type === 'number') {
    return createBinary('*', createNumber(left.left.value * right.value), left.right);
  }
  
  return createBinary('*', left, right);
}

function simplifyDiv(left: Expr, right: Expr): Expr {
  // 0 / x = 0
  if (isZero(left)) {
    return createNumber(0);
  }
  
  // x / 1 = x
  if (isOne(right)) {
    return left;
  }

  if (left.type === 'number' && right.type === 'number' && right.value !== 0) {
    return createNumber(Math.floor(left.value / right.value));
  }

  // x / x = 1
  if (deepEqual(left, right)) {
    return createNumber(1);
  }

  // (a * x) / x = a
  if (left.type === 'binary' && left.operator === '*' && deepEqual(left.right, right)) {
    return left.left;
  }

  // (a * x) / a = x
  if (left.type === 'binary' && left.operator === '*' && deepEqual(left.left, right)) {
    return left.right;
  }

  return createBinary('/', left, right);
}

export function derive(e: Expr, varName: string): Expr {
  switch (e.type) {
    case 'number':
      return createNumber(0);

    case 'variable':
      return createNumber(e.name === varName ? 1 : 0);

    case 'unary':
      return simplifyUnary(derive(e.operand, varName));

    case 'binary':
      const left = e.left;
      const right = e.right;
      const fPrime = derive(left, varName);
      const gPrime = derive(right, varName);

      switch (e.operator) {
        case '+':
          return simplifyAdd(fPrime, gPrime);
        
        case '-':
          return simplifySub(fPrime, gPrime);
        
        case '*':
          return simplifyAdd(simplifyMul(fPrime, right), simplifyMul(left, gPrime));

        case '/':
          const num = simplifySub(simplifyMul(fPrime, right), simplifyMul(left, gPrime));
          const denom = simplifyMul(right, right);
          return simplifyDiv(num, denom);
      }
  }
}