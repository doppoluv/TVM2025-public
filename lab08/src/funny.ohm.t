Funny <: Arithmetic {
    Module = Function+

    Function = variable "(" ParamList ")" "returns" ParamListNonEmpty UsesOpt? Statement

    ParamList = ListOf<Param, ",">
    ParamListNonEmpty = NonemptyListOf<Param, ",">
    Param = variable ":" Type

    UsesOpt = "uses" ParamList

    Type = "int" "[" "]" -- array
         | "int" -- int

    Statement = Assignment
              | Block
              | Conditional
              | While

    Assignment = LValueList "=" ExprList ";" -- tuple
               | LValue "=" AddExpr ";" -- simple

    LValueList = NonemptyListOf<LValue, ",">
    ExprList = NonemptyListOf<AddExpr, ",">

    LValue = variable "[" AddExpr "]" -- array
           | variable -- variable

    Block = "{" Statement* "}"

    Conditional = "if" "(" Condition ")" Statement ("else" Statement)?

    While = "while" "(" Condition ")" Statement

    Primary := FunctionCall
             | ArrayAccess
             | number
             | variable
             | "(" AddExpr ")" -- paren

    FunctionCall = variable "(" ArgList ")"
    ArgList = ListOf<AddExpr, ",">

    ArrayAccess = variable "[" AddExpr "]"


    Condition = ImplyCond

    ImplyCond = OrCond ("->" ImplyCond)?

    OrCond = AndCond ("or" AndCond)*

    AndCond = NotCond ("and" NotCond)*

    NotCond = "not"* AtomCond

    AtomCond = "true" -- true
             | "false" -- false
             | Comparison -- comparison
             | "(" Condition ")" -- paren

    Comparison = AddExpr "==" AddExpr -- eq
               | AddExpr "!=" AddExpr -- neq
               | AddExpr ">=" AddExpr -- ge
               | AddExpr "<=" AddExpr -- le
               | AddExpr ">" AddExpr -- gt
               | AddExpr "<" AddExpr -- lt


    space += comment
    comment = "//" (~"\n" any)* ("\n" | end)

    keyword = "if" | "else" | "while" | "returns" | "uses" | "int"
            | "true" | "false" | "and" | "or" | "not"

    variable := ~keyword (letter | "_") (letter | digit | "_")*
}