/**
 * Deterministic Type-A verification.
 *
 * The model returns a worked solution PLUS a machine-checkable answer_claim
 * (final value + the givens + an arithmetic expression that should reproduce it).
 * We recompute that expression HERE with a tiny safe evaluator and compare to the
 * stated final value. Only agreement earns verification:'verified'. An LLM never
 * sets 'verified': it can't independently check its own arithmetic.
 *
 * This is v1: it covers numeric/arithmetic answers (the common Type-A case). A
 * symbolic CAS (SymPy sandbox) is the next hardening step for proofs/derivations;
 * anything this can't parse degrades HONESTLY to 'unchecked', never a false
 * 'verified'.
 */

export interface AnswerClaim {
  /** Whether this answer reduces to a single checkable numeric result. */
  checkable?: boolean;
  /** The final answer as stated, e.g. "19.6" or "19.6 m/s". */
  finalValue?: string;
  unit?: string;
  /** Named quantities the expression may reference. */
  givens?: { name: string; value: string | number }[];
  /** An arithmetic expression that should recompute finalValue, e.g. "sqrt(2*9.8*h)". */
  expression?: string;
}

export type Verification = "verified" | "unchecked" | "failed" | "not_applicable";

export interface CheckResult {
  verification: Verification;
  recomputed: number | null;
  detail: string;
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, g: 9.8 };
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  ln: Math.log, log: (x) => Math.log10(x), exp: Math.exp,
};
const PREC: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "^": 4, "u-": 3 };
const RIGHT_ASSOC = new Set(["^", "u-"]);

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "fn"; v: string }
  | { t: "op"; v: string }
  | { t: "paren"; v: "(" | ")" }
  | { t: "comma" };

function tokenize(s: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const numMatch = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(s.slice(i));
    if (/[0-9.]/.test(c) && numMatch) {
      toks.push({ t: "num", v: Number(numMatch[0]) });
      i += numMatch[0].length;
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      const name = s.slice(i, j);
      // A known function only if immediately followed by '(', else a var/constant.
      toks.push(name in FUNCS && s[j] === "(" ? { t: "fn", v: name } : { t: "id", v: name });
      i = j;
    } else if ("+-*/^".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
    } else if (c === "(" || c === ")") {
      toks.push({ t: "paren", v: c });
      i++;
    } else if (c === ",") {
      toks.push({ t: "comma" });
      i++;
    } else {
      return null; // unknown char: refuse rather than guess
    }
  }
  return toks;
}

/** Safe arithmetic evaluator (shunting-yard). Returns null on any parse/eval issue. */
export function safeEval(expr: string, vars: Record<string, number> = {}): number | null {
  const toks = tokenize(expr);
  if (!toks || toks.length === 0) return null;
  const output: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null; // for unary-minus detection

  for (const tok of toks) {
    if (tok.t === "num" || tok.t === "id") {
      output.push(tok);
    } else if (tok.t === "fn") {
      ops.push(tok);
    } else if (tok.t === "op") {
      let op = tok.v;
      const unary = op === "-" && (!prev || prev.t === "op" || (prev.t === "paren" && prev.v === "(") || prev.t === "comma");
      if (unary) op = "u-";
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && (PREC[top.v] > PREC[op] || (PREC[top.v] === PREC[op] && !RIGHT_ASSOC.has(op)))) {
          output.push(ops.pop()!);
        } else break;
      }
      ops.push({ t: "op", v: op });
    } else if (tok.t === "paren" && tok.v === "(") {
      ops.push(tok);
    } else if (tok.t === "paren" && tok.v === ")") {
      while (ops.length && ops[ops.length - 1].t !== "paren") output.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop(); // discard '('
      if (ops.length && ops[ops.length - 1].t === "fn") output.push(ops.pop()!); // apply the function wrapping this group
    } else if (tok.t === "comma") {
      while (ops.length && ops[ops.length - 1].t !== "paren") output.push(ops.pop()!);
    }
    prev = tok;
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === "paren") return null; // mismatched parens
    output.push(top);
  }
  return evalRpn(output, vars);
}

function evalRpn(rpn: Tok[], vars: Record<string, number>): number | null {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") {
      st.push(tok.v);
    } else if (tok.t === "fn") {
      const f = FUNCS[tok.v];
      if (!f || !st.length) return null;
      st.push(f(st.pop()!));
    } else if (tok.t === "id") {
      const name = tok.v;
      if (name in vars) st.push(vars[name]);
      else if (name.toLowerCase() in CONSTANTS) st.push(CONSTANTS[name.toLowerCase()]);
      else return null; // unknown identifier: refuse rather than guess
    } else if (tok.t === "op") {
      if (tok.v === "u-") {
        if (!st.length) return null;
        st.push(-st.pop()!);
      } else {
        if (st.length < 2) return null;
        const b = st.pop()!, a = st.pop()!;
        st.push(tok.v === "+" ? a + b : tok.v === "-" ? a - b : tok.v === "*" ? a * b : tok.v === "/" ? a / b : Math.pow(a, b));
      }
    }
  }
  return st.length === 1 && Number.isFinite(st[0]) ? st[0] : null;
}

/** Extract the leading numeric value from a stated final answer like "19.6 m/s". */
export function parseFinalNumber(v: string | number | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (!v) return null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Recompute the claim and compare. relTol default 1% absorbs sig-fig rounding. */
export function checkAnswerClaim(claim: AnswerClaim | null | undefined, relTol = 0.01): CheckResult {
  if (!claim || claim.checkable === false) return { verification: "not_applicable", recomputed: null, detail: "no single checkable numeric result" };
  const stated = parseFinalNumber(claim.finalValue);
  if (stated == null || !claim.expression) return { verification: "unchecked", recomputed: null, detail: "no numeric final value or expression to recompute" };

  const vars: Record<string, number> = {};
  for (const g of claim.givens || []) {
    const n = parseFinalNumber(g.value);
    if (n != null && g.name) vars[g.name] = n;
  }
  const recomputed = safeEval(claim.expression, vars);
  if (recomputed == null) return { verification: "unchecked", recomputed: null, detail: `could not evaluate expression "${claim.expression}"` };

  const denom = Math.max(Math.abs(stated), 1e-9);
  const agrees = Math.abs(recomputed - stated) / denom <= relTol;
  return {
    verification: agrees ? "verified" : "failed",
    recomputed,
    detail: agrees
      ? `recomputed ${recomputed} ≈ stated ${stated}`
      : `recomputed ${recomputed} ≠ stated ${stated} (rel diff ${(Math.abs(recomputed - stated) / denom).toFixed(3)})`,
  };
}
