import { error, Error } from './error'
import { AstNode, Pair, Clojure, Value } from './ast'

export function parse(code: string): Array<AstNode> | Error {
    const lines = parsePass01(code);
    const lst0 = parsePass0(lines);
    const lst1 = parsePass1(lst0)
    if (lst1 instanceof Error) {
        return lst1.show()
    }
    const r2 = parsePass2(lst1)
    if (r2 instanceof Error) {
        return r2.show()
    }
    const r3 = parsePass3(r2)
    if (r3 instanceof Error) {
        return r3.show()
    }
    return r3;
}

class Line {
    content: string
    num: number
    constructor(content: string, num: number) {
        this.content = content
        this.num = num
    }
}

// comment
function parsePass01(code: string): Array<Line> {
    const crlf = findFirstCrlf(code);
    const lines = <Array<string>>code.split(crlf)
    let ret = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.match(/^[ \t]*;/)) {
            ret.push(new Line(line, i + 1))
        }
    }
    // console.log(ret)
    return ret
}

export class Token<T> {
    value: T
    lineNumber: number
    constructor(value: T, lineNumber: number) {
        this.value = value
        this.lineNumber = lineNumber
    }
    toString(): string {
        return `${this.value}`
    }
}

// lines to tokens
function parsePass0(lines: Array<Line>): Array<Token<string>> {
    let word = "";
    let ret = [];
    // const code = lines.join("\n");
    for (let line of lines) {
        const lineNumber = line.num
        const code = line.content
        for (let i = 0; i < code.length; i++) {
            const c = code.charAt(i);
            if (isSpace(c)) {
                if (word.length > 0) {
                    ret.push(new Token(word, lineNumber))
                    word = "";
                }
            } else if (c == "(" || c == ")") {
                if (word.length > 0) {
                    ret.push(new Token(word, lineNumber))
                    word = "";
                }
                ret.push(new Token(c, lineNumber))
            } else {
                word += c;
            }
        }
        if (word.length > 0) {
            ret.push(new Token(word, lineNumber))
            word = "";
        }
    }
    return ret;
}

type TokenTree = Token<string> | Array<Token<string> | TokenTree>
// tokens to token tree
function parsePass1(tokens: Array<Token<string>>): TokenTree | Error {
    const a = parsePass1Inner(0, tokens, [])
    if (a instanceof Error) {
        return a
    }
    return a[1];
}

// 暂时的一个类型
type atomOrPair0 = Token<string> | Pair<atomOrPair0>
// token tree to pair
function parsePass2(st: TokenTree): Array<atomOrPair0> | Error {
    let ret = []
    if (st instanceof Token) {
        const a = toAtomOrPair(st)
        if (a instanceof Error) {
            return a
        }
        return [a]
    }
    for (let i = 0; i < st.length; i++) {
        const a = toAtomOrPair(st[i])
        if (a instanceof Error) {
            return a
        }
        ret.push(a)
    }
    return ret
}

export type Atom = Atom0
type Atom0 = Token<Number> | Token<string>
export type atomOrPair1 = Atom0 | Pair<atomOrPair1>

// num type
function parsePass3(lst: Array<atomOrPair0>): Array<atomOrPair1> | Error {
    let ret = []
    for (let i = 0; i < lst.length; i++) {
        const node = addNumberType(lst[i])
        if (node instanceof Error) {
            return node
        }
        ret.push(node)
    }
    return ret
}
function addNumberType(ap: atomOrPair0): AstNode | Error {
    // if (ap === null)
    //     return ap;
    // else 
    if (ap instanceof Token) {
        if (isDigit(ap.value.charAt(0))) {
            const n = Number(ap.value)
            if (n === NaN) {
                return new Error("not a number", ap.lineNumber, ap)
            }
            return new Token(n, ap.lineNumber)
        }
        return ap
    } else {
        const l = addNumberType(ap.left)
        if (l instanceof Error) {
            return l
        }
        const r = addNumberType(ap.right)
        if (r instanceof Error) {
            return r
        }
        return new Pair(l, r)
    }
}
function isDigit(theNum: string): boolean {
    const theMask = "0123456789";
    if (theMask.indexOf(theNum) == -1) return (false);
    return (true);
}
export interface LineNumberableAndStringable {
    toString(): string
    lineNumber: number;
}

function tokenTreetoString(t: TokenTree): string {
    if (t instanceof Token) {
        return t.value.toString()
    }
    return t.map(tokenTreetoString).join('')
}
function lineNumberOf(t: TokenTree): number {
    if (t instanceof Token) {
        return t.lineNumber
    }
    return lineNumberOf(t[0])
}
function toAtomOrPair(st: TokenTree): atomOrPair0 | Error {
    if (st instanceof Token) {
        return st
    }
    // (st[0] == "(") 
    // todo check
    if (st.length == 2) {
        if (!(st[0] instanceof Token) || tokenTreetoString(st) != "()") {
            return new Error("should be ()", lineNumberOf(st), st)
        }
        return new Token("nil", st[0].lineNumber)
    }
    if (st.length == 5 && st[2] instanceof Token && st[2].value === ".") {
        const left = toAtomOrPair(st[1])
        if (left instanceof Error) {
            return left
        }
        const right = toAtomOrPair(st[3])
        if (right instanceof Error) {
            return right
        }
        return new Pair(left, right)
    }
    const left = toAtomOrPair(st[1])
    if (left instanceof Error) {
        return left
    }
    let newSt = st.slice(1)
    newSt[0] = new Token("(", lineNumberOf(newSt[1]))
    const right = toAtomOrPair(newSt)
    if (right instanceof Error) {
        return right
    }
    return new Pair(left, right)
}

function parsePass1Inner(
    i: number, tokens: Array<Token<string>>, begin: Array<Token<string>>):
    [number, TokenTree] | Error {

    let ret: TokenTree = [...begin]
    let willQuote: boolean = false
    let willQuoteLine: number = 0
    while (i < tokens.length) {
        const token = tokens[i];
        const tk = ((ln) =>
            (str: string) =>
                new Token(str, ln))(token.lineNumber)
        if (token.value == "'") {
            willQuote = true
            willQuoteLine = token.lineNumber
        } else if (token.value == "(") {
            let v
            const a = parsePass1Inner(i + 1, tokens, [token])
            if (a instanceof Error) {
                return a
            }
            [i, v] = a
            if (willQuote) {
                ret.push([tk("("), tk("quote"), v, tk(")")])
                willQuote = false
            } else {
                ret.push(v)
            }
            continue
        } else if (token.value == ")") {
            if (willQuote) {
                error("' before ) in line " + token.lineNumber, tokens)
                willQuote = false
            }
            if ((!(ret[0] instanceof Token))
                || (ret[0] instanceof Token && ret[0].value !== "(")) {
                error("not open brace in line " + token.lineNumber, ret)
                return [0, []];
            }
            ret.push(token)
            return [i + 1, ret]
        } else {
            if (willQuote) {
                ret.push([tk("("), tk("quote"), token, tk(")")])
                willQuote = false
            } else {
                ret.push(token)
            }
        }
        i++
    }
    if (willQuote) {
        return new Error("you must quote something in line ", (willQuoteLine), tokens)
    }
    if (begin.length > 0) {
        return new Error("( not match in line ", (tokens[0].lineNumber), tokens)
    }
    return [i, ret]
}

function isSpace(c: string): boolean {
    return c == " " || c == "\t" || c == "\n" || c == "\r";
}
function findFirstCrlf(str: string): string {
    if (str.indexOf("\r\n") >= 0) return "\r\n";
    if (str.indexOf("\n") >= 0) return "\n";
    if (str.indexOf("\r") >= 0) return "\r";
    return "\r\n";
}