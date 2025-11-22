import { Expr } from "../../lab04";

export function cost(e: Expr): number {
  switch (e.type) {
    case "number":
      return 0;

    case "variable":
      return 1;

    case "unary":
      return 1 + cost(e.operand);

    case "binary":
      return 1 + cost(e.left) + cost(e.right);
  }
}