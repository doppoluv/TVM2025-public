Funnier <: Funny {
    Module := Formula* Function+

    Formula = "formula" variable "(" ParamList ")" "=>" Predicate ";"

    Function := variable "(" ParamList ")"
                Preopt?
                "returns" ("void" | ParamListNonEmpty)
                Postopt?
                UsesOpt?
                Statement

    Preopt = "requires" Predicate

    Postopt = "ensures" Predicate

    InvariantOpt = "invariant" Predicate

    Statement := FunctionCall ";" -- function_call
               | Assignment
               | Block
               | Conditional
               | While

    While := "while" "(" Condition ")" InvariantOpt? Statement

    FunctionCall := "length" "(" AddExpr ")" -- length
                  | variable "(" ArgList ")" -- regular

    Primary := FunctionCall
             | ArrayAccess
             | number
             | variable
             | "(" AddExpr ")" -- paren

    Predicate = ImplyPred

    ImplyPred = OrPred ("->" ImplyPred)?

    OrPred = AndPred ("or" AndPred)*

    AndPred = NotPred ("and" NotPred)*

    NotPred = "not"* AtomPred

    AtomPred = Quantifier -- quantifier
             | "true" -- true
             | "false" -- false
             | Comparison -- comparison
             | FormulaRef -- formula_ref
             | "(" Predicate ")" -- paren

    Quantifier = ("forall" | "exists") "(" Param "|" Predicate ")"

    FormulaRef = variable "(" ArgList ")"

    keyword := "if" | "else" | "while" | "returns" | "uses" | "int" | "void"
             | "true" | "false" | "and" | "or" | "not"
             | "requires" | "ensures" | "invariant" | "formula"
             | "forall" | "exists" | "length"
}