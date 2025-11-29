import * as base from '../../lab08';

export interface AnnotatedModule extends base.Module {
    type: 'module';
    formulas: Formula[];
    functions: AnnotatedFunctionDef[];
}

export interface Formula {
    type: 'formula';
    name: string;
    parameters: base.ParameterDef[];
    body: Predicate;
}

export interface AnnotatedFunctionDef extends base.FunctionDef {
    type: 'fun';
    name: string;
    parameters: base.ParameterDef[];
    returns: base.ParameterDef[];
    locals: base.ParameterDef[];
    precondition: Predicate | null;
    postcondition: Predicate | null;
    body: AnnotatedStatement;
}

export type AnnotatedStatement =
    | base.AssignStmt
    | base.BlockStmt
    | base.ConditionalStmt
    | AnnotatedWhileStmt;

export interface AnnotatedWhileStmt {
    type: 'while';
    condition: base.Condition;
    invariant: Predicate | null;
    body: AnnotatedStatement;
}

export type Predicate =
    | TruePred
    | FalsePred
    | ComparisonPred
    | NotPred
    | AndPred
    | OrPred
    | ImpliesPred
    | ParenPred
    | QuantifierPred
    | FormulaRefPred;

export interface TruePred {
    kind: 'true';
}

export interface FalsePred {
    kind: 'false';
}

export interface ComparisonPred {
    kind: 'comparison';
    left: base.Expr;
    op: '==' | '!=' | '>' | '<' | '>=' | '<=';
    right: base.Expr;
}

export interface NotPred {
    kind: 'not';
    predicate: Predicate;
}

export interface AndPred {
    kind: 'and';
    left: Predicate;
    right: Predicate;
}

export interface OrPred {
    kind: 'or';
    left: Predicate;
    right: Predicate;
}

export interface ImpliesPred {
    kind: 'implies';
    left: Predicate;
    right: Predicate;
}

export interface ParenPred {
    kind: 'paren';
    inner: Predicate;
}

export interface QuantifierPred {
    kind: 'quantifier';
    quantifier: 'forall' | 'exists';
    param: base.ParameterDef;
    body: Predicate;
}

export interface FormulaRefPred {
    kind: 'formula_ref';
    name: string;
    args: base.Expr[];
}