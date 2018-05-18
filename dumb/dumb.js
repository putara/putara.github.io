/*
 * Adaptive JavaScript Interpreter
 * Created on 03/07/2017.
 */
(function(global){

//interface IResolveListener
//{
//  onResolve(name, js);
//}

class RuntimeException extends Error
{
  constructor(message) { super(message); }
}

function assumeTrue(condition)
{
  if (condition == false) {
    throw new RuntimeException("An unexpected error has occured.");
  }
}

const SENTINEL = "\0";
const SPLIT_PATTERN = "[\\w]+|\"[^\"]*\"|[=:;,\\.\\+\\-*\\/%\\(\\)\\{\\}\\[\\]]";

class JSObjTable
{
  constructor()
  {
    this.list = new Array();
    this.empty = -1;
  }
  dealloc(objId)
  {
    this.empty = objId - 1;
    this.list[objId - 1].release();
    this.list[objId - 1] = null;
  }

  alloc()
  {
    let newObj = new JSObjectNoRef();
    let fre;
    if (this.empty >= 0 && this.list[this.empty] == null) {
      fre = this.empty;
      this.empty = -1;
    } else {
      fre = this.list.indexOf(null);
    }
    if (fre != -1) {
      this.list[fre] = newObj;
    } else {
      fre = this.list.length;
      this.list.push(newObj);
    }
    return fre + 1;
  }

  get(refer)
  {
    if (refer.hasObj()) {
      return this.list[refer.getObjIndex()];
    }
    return null;
  }

  set(refer, value)
  {
    assumeTrue((value instanceof JSObject) == false);
    if (refer.hasObj()) {
      this.list[refer.getObjIndex()].set(value);
    }
  }

  assign(refer, value)
  {
    if (refer.hasObj()) {
      if (refer.hasElem()) {
        this.list[refer.getObjIndex()].setAt(refer.getElemIndex(), value.get());
      } else {
        this.list[refer.getObjIndex()] = value;
      }
    }
  }

  getAt(refer)
  {
    let obj = this.get(refer);
    if (obj != null) {
      return obj.getAt(refer.getElemIndex());
    }
    return null;
  }

  setAt(refer, value)
  {
    let obj = this.get(refer);
    if (obj != null) {
      obj.setAt(refer.getElemIndex(), value);
    }
  }
}

class JSRef
{
  constructor(objId, elem)
  {
    assumeTrue(objId > 0);
    this.objId = objId;
    this.elem = elem;
  }

  static fromObjId(objId) { return new JSRef(objId, 0); }
  toElement(index) { return new JSRef(this.objId, index + 1); }

  hasObj() { return this.objId > 0; }
  hasElem() { return this.elem > 0; }

  getObjIndex() { return this.objId - 1; }
  getElemIndex() { return this.elem - 1; }
}

class JSContext
{
  constructor(table, parent)
  {
    this.table = table;
    this.parent = parent;
    this.retValue = null;
    this.vmap = new Map();
  }

  static createGlobal(js) { return new JSContext(js.table, null); }
  static createScope(ctx) { return new JSContext(ctx.table, ctx); }

  release()
  {
    for (let v of this.vmap.values()) {
      this.table.dealloc(v);
    }
  }

  getRefHere(name, alloc)
  {
    let objId = 0;
    if (this.vmap.has(name)) {
      objId = this.vmap.get(name);
    } else if (alloc) {
      objId = this.table.alloc();
      this.vmap.set(name, objId);
    }
    return objId > 0 ? JSRef.fromObjId(objId) : null;
  }

  getVarValue(refer)
  {
    if (refer.hasElem()) {
      return this.table.getAt(refer);
    } else {
      let obj = this.getVar(refer);
      return obj != null ? obj.get() : null;
    }
  }

  setVarValue(refer, value)
  {
    if (refer.hasElem()) {
      this.table.setAt(refer, value);
    } else {
      this.table.set(refer, value);
    }
  }

  getVarHere(name)
  {
    let refer = this.getRefHere(name, false);
    if (refer != null) {
      return new JSObjectRef(this, refer);
    }
    return null;
  }

  getVar(name)
  {
    if (typeof name === 'string') {
      let ctx = this;
      do {
        let value = ctx.getVarHere(name);
        if (value != null) {
          return value;
        }
      } while ((ctx = ctx.parent) != null);
      return null;
    } else {
      let refer = name;
      let obj = this.table.get(refer);
      return obj != null ? obj.realise() : null;
    }
  }

  getRef(name) { return this.getVar(name); }

  setVarHere(refer, value)
  {
    if (typeof refer === 'string') {
      refer = this.getRefHere(refer, true);
      assumeTrue(refer != null);
    }
    this.table.assign(refer, value);
    return new JSObjectRef(this, refer);
  }

  getReturn()
  {
    return this.retValue != null ? this.retValue : new JSObjectNoRef();
  }

  setReturn(value) { this.retValue = value; }
}

/*abstract*/ class JSObject
{
  /*abstract*/ realise() {}
  /*abstract*/ getInternal(value) {}
  /*abstract*/ getAtInternal(index) {}
  /*abstract*/ getAtInternal(element) {}
  /*abstract*/ setAtInternal(index, value) {}

  release() {}
  get() { return null; }
  eval(args) { return null; }
  asArg() { return this.dup(); }

  dup()
  {
    let obj = new JSObjectNoRef();
    obj.set(this.get());
    return obj;
  }

  static toObj(value)
  {
    if (value instanceof JSObject) {
      value = value.get();
    }
    return value;
  }

  set(value)
  {
    this.getInternal(JSObject.toObj(value));
  }

  isArr() { return this.get() instanceof Array; } // should call $.isArray or equivalent??
  isStr() { return typeof this.get() === 'string'; }
  asInt() { return this.get() | 0; }
  asNum() { return this.get() * 1; }
  asArr() { return this.get(); }

  asStr()
  {
    let obj = this.get();
    return obj != null ? obj.toString() : "";
  }

  getAt(element)
  {
    if (typeof element === 'string' || typeof element === 'object') {
      switch (element) {
      case "splice":
      case "reverse":
      case "split":
      case "join":
        return new JSFuncNoRef(this, element);
      case "length":
        return new JSObjectNoRef(this.get().length);
      }
      return this.getAtInternal(element);
    } else if (typeof element === 'number') {
      return this.getAtInternal(element);
    }
    return null;
  }

  setAt(element, value)
  {
    value = JSObject.toObj(value);
    if (element instanceof String) {
      let obj = this.getAtInternal(element);
      obj.set(value);
    } else if (element instanceof Number) {
      this.setAtInternal(element, value);
    }
  }
}

class JSObjectRef extends JSObject
{
  constructor(ctx, refer)
  {
    super();
    this.ctx = JSContext.createScope(ctx);
    this.refer = refer;
  }

  /*override*/ release() { this.refer = null; }

  /*override*/ realise()
  {
    return this.ctx.getVar(this.refer);
  }

  /*override*/ asArg()
  {
    return this.isArr() ? this : this.dup();
  }

  /*override*/ get()
  {
    return this.ctx.getVarValue(this.refer);
  }

  /*override*/ eval(args)
  {
    let real = this.realise();
    return real != null ? real.eval(args) : null;
  }

  /*override*/ getInternal(value)
  {
    this.ctx.setVarValue(this.refer, value);
  }

  /*override*/ getAtInternal(index)
  {
    return new JSObjectRef(this.ctx, this.refer.toElement(index));
  }

  /*override*/ getAtInternal(element)
  {
    return this.ctx.getRef(element);
  }

  /*override*/ setAtInternal(index, value)
  {
    this.ctx.setVarValue(this.refer.toElement(index), value);
  }

  /*override*/ assign(value)
  {
    return this.ctx.setVarHere(this.refer, value.dup());
  }
}

class JSObjectNoRef extends JSObject
{
  constructor(value)
  {
    super();
    this.value = value;
  }

  /*override*/ realise() { return this; }
  /*override*/ get() { return this.value; }
  /*override*/ getInternal(value) { this.value = value; }

  /*override*/ getAtInternal(index)
  {
    if (this.isStr()) {
      return new JSObjectNoRef(this.asStr().substring(index, index + 1));
    } else if (this.isArr()) {
      return new JSObjectNoRef(this.asArr()[index]);
    }
    return null;
  }

  /*override*/ getAtInternal(element)
  {
    assumeTrue(false); // something's gone haywire
  }

  /*override*/ setAtInternal(index, value)
  {
    if (this.isArr()) {
      this.asArr()[index] = value.toString();
    }
  }
}

class JSFuncNoRef extends JSObjectNoRef
{
  constructor(self, name)
  {
    super(null);
    this.self = self;
    this.name = name;
  }

  /*override*/ eval(args)
  {
    switch (this.name) {
    case "splice":
      if (this.self.isArr() && args.length == 2) {
        let start = args[0].asInt();
        let count = args[1].asInt();
        let source = this.self.asArr().slice(0);
        let crop = source.splice(start, count);
        this.self.set(source);
        return new JSObjectNoRef(crop);
      }
      break;

    case "reverse": {
      if (this.self.isArr()) {
        let rev = this.self.asArr().reverse();
        this.self.set(rev);
        return this.self;
      }
      break;
    }

    case "split":
      if (this.self.isStr() && (args.length == 0 || args[0].isStr())) {
        let split = this.self.asStr().split(args.length > 0 ? args[0].get() : null);
        return new JSObjectNoRef(split);
      }
      break;

    case "join":
      if (this.self.isArr() && (args.length == 0 || args[0].isStr())) {
        let join = this.self.asArr().join(args.length > 0 ? args[0].get() : null);
        return new JSObjectNoRef(join);
      }
      break;
    }

    throw new RuntimeException("Unsupported function call: " + this.name);
  }
}

/*abstract*/ class JSObjectNoRefCtx extends JSObjectNoRef
{
  constructor(ctx)
  {
    super(null);
    this.ctx = ctx;
  }

  /*override*/ dup() { return this; }
}

class JSUserFuncNoRef extends JSObjectNoRefCtx
{
  constructor(ctx, lexer)
  {
    super(ctx);
    this.argNames = new Array();
    lexer.take("(");
    if (lexer.takeIf(")") == false) {
      do {
        let tok = lexer.getToken();
        this.argNames.push(tok);
      } while (lexer.takeOne(",", ")"));
    }
    this.statements = new JSLexer(lexer, "{", "}");
  }

  newCtx(args)
  {
    let ctx = JSContext.createScope(this.ctx);
    for (let i = 0, count = this.argNames.length; i < count; i++) {
      let value = i < args.length ? args[i].asArg() : new JSObjectNoRef();
      ctx.setVarHere(this.argNames[i], value);
    }
    return ctx;
  }

  /*override*/ eval(args)
  {
    let ctx = this.newCtx(args);
    this.statements.reset();
    this.statements.statements(ctx);
    ctx.release();
    return ctx.getReturn();
  }
}

class JSUserObjectNoRef extends JSObjectNoRefCtx
{
  constructor(ctx, lexer)
  {
    super(ctx);
    do {
      let name = lexer.getToken();
      lexer.take(":");
      let result = lexer.expression(this.ctx, true);
      this.ctx.setVarHere(name, result.dup());
    } while (lexer.takeOne(",", "}"));
  }

  /*override*/ eval(args) { return null; }
}

class JSLexer
{
  constructor()
  {
    this.js = null;
    this.tokens = new Array();
    this.tokenIndex = 0;
    this.tokenLast = null;

    if (arguments[0] instanceof JSVM) {
      let js = arguments[0];
      let expression = arguments[1];
      let re = new RegExp(SPLIT_PATTERN, "g");
      this.js = js;
      for (let m; (m = re.exec(expression)) != null; ) {
        this.tokens.push(m[0]);
      }
      this.tokens.push(SENTINEL);
    } else {
      let lexer = arguments[0];
      let begin = arguments[1];
      let end = arguments[2];
      this.js = lexer.js;
      lexer.take(begin);
      let nesting = 1;
      for (let t; (t = lexer.getToken()) !== SENTINEL; ) {
        if (t === begin) {
          ++nesting;
        } else if (t === end && --nesting === 0) {
          break;
        }
        this.tokens.push(t);
      }
      this.tokens.push(SENTINEL);
    }
  }

  static createFromScript(js, expression)
  {
    return new JSLexer(js, expression);
  }

  reset()
  {
    this.tokenIndex = 0;
    this.tokenLast = null;
  }

  take(token)
  {
    if (this.getToken() !== token) {
      throw new RuntimeException("Expected token: " + token);
    }
  }

  takeIf(token)
  {
    if (this.getToken() !== token) {
      this.ungetToken();
      return false;
    }
    return true;
  }

  takeOne(delim, end)
  {
    if (this.takeIf(end)) {
      return false;
    }
    this.take(delim);
    return true;
  }

  isEnd()
  {
    return this.takeIf(SENTINEL);
  }

  lastToken()
  {
    assumeTrue(this.tokenLast != null);
    return this.tokenLast;
  }

  getToken()
  {
    if (this.tokenIndex >= this.tokens.length) {
      throw new RuntimeException("Illegal expression.");
    }
    return this.tokenLast = this.tokens[this.tokenIndex++];
  }

  ungetToken()
  {
    if (this.tokenIndex == 0) {
      throw new RuntimeException("Something's gone haywire...");
    }
    this.tokenIndex--;
    this.tokenLast = null;
  }

  // statement ::= ('var' assignment | 'return' assignment | assignment) ';'
  // assignment ::= IDENT '=' expression | expression
  // expression ::= 'function' ... | '{' ... '}' | binary
  // binary ::= muldivmod ('+' muldivmod | '-' muldivmod)*
  // muldivmod ::= unary ('*' unary | '/' unary | '%' unary)*
  // unary ::= '+' term | '-' term | term
  // term ::= '(' assignment ')' | obj | array | funccall
  // array ::= obj '[' assignment ']'
  // funccall ::= obj '(' arguments ')'
  // obj ::= ident ('.' ident)*
  // arguments ::= assignment (',' assignment)*
  // primitive ::= string | number

  opUnary(op, x)
  {
    x = x.dup();
    let val = x.asNum();
    if (op === "-") {
      val = -val;
    }
    x.set(val);
    return x;
  }

  opBinary(op, x, y)
  {
    x = x.dup();
    if (op === "+" && (x.isStr() || y.isStr())) {
      x.set(x.asStr() + y.asStr());
    } else {
      let val = x.asNum();
      let opr = y.asNum();
      switch (op) {
      case "+": val += opr; break;
      case "-": val -= opr; break;
      case "*": val *= opr; break;
      case "/": val /= opr; break;
      case "%": val %= opr; break;
      }
      x.set(val);
    }
    return x;
  }

  primitive(current)
  {
    let token = this.getToken();
    let cp = token.codePointAt(0);
    if (cp == 0x22) { // '"'
      return new JSObjectNoRef(token.substring(1, token.length - 1));
    } else if (0x30 <= cp && cp <= 0x39) { // digits
      let x = parseFloat(token);
      return new JSObjectNoRef(x);
    }
    this.ungetToken();
    return current;
  }

  arguments(ctx)
  {
    let list = new Array();
    if (this.takeIf(")") == false) {
      do {
        list.push(this.expression(ctx, true));
      } while (this.takeOne(",", ")"));
    }
    return list;
  }

  funccall(obj, ctx)
  {
    let args = this.arguments(ctx);
    return obj.eval(args);
  }

  array(obj, ctx)
  {
    let result = this.expression(ctx, true);
    this.take("]");
    return obj.getAt(result.get());
  }

  objacc(ctx, rhs)
  {
    let ident = this.getToken();
    let cp = ident.codePointAt(0);
    if (cp == 0x22 || (0x30 <= cp && cp <= 0x39)) { // '"' or digits
      this.ungetToken();
      return null;
    }

    let self = ctx.getVar(ident);
    if (self == null) {
      if (rhs) {
        this.ungetToken();
        if (this.js.listener != null) {
          this.js.listener.onResolve(ident, this.js);
          return this.objacc(ctx, false);
        }
      }
      return ctx.setVarHere(ident, new JSObjectNoRef());
    }

    for (let e = self; e != null; ) {
      if (this.takeIf(".") == false) {
        return e;
      }
      ident = this.getToken();
      e = e.getAt(ident);
    }

    return null;
  }

  term(ctx, rhs)
  {
    if (this.takeIf("(")) {
      let result = this.expression(ctx, rhs);
      this.take(")");
      return result;
    } else {
      let result = this.objacc(ctx, rhs);
      if (this.takeIf("[")) {
        result = this.array(result, ctx);
      } else if (this.takeIf("(")) {
        result = this.funccall(result, ctx);
      } else {
        result = this.primitive(result);
      }
      return result;
    }
  }

  unary(ctx, rhs)
  {
    if (this.takeIf("+") || this.takeIf("-")) {
      let op = this.lastToken();
      let value = this.term(ctx, rhs);
      return this.opUnary(op, value);
    }
    return this.term(ctx, rhs);
  }

  muldivmod(ctx, rhs)
  {
    for (let value = this.unary(ctx, rhs); ; ) {
      if (this.takeIf("*") || this.takeIf("/") || this.takeIf("%")) {
        value = this.opBinary(this.lastToken(), value, this.unary(ctx, rhs));
      } else {
        return value;
      }
    }
  }

  binary(ctx, rhs)
  {
    for (let value = this.muldivmod(ctx, rhs); ; ) {
      if (this.takeIf("+") || this.takeIf("-")) {
        value = this.opBinary(this.lastToken(), value, this.muldivmod(ctx, rhs));
      } else {
        return value;
      }
    }
  }

  expression(ctx, rhs)
  {
    if (this.takeIf("function")) {
      return new JSUserFuncNoRef(ctx, this);
    } else if (this.takeIf("{")) {
      return new JSUserObjectNoRef(ctx, this);
    } else {
      return this.binary(ctx, rhs);
    }
  }

  assignment(ctx, decl)
  {
    let left = this.expression(ctx, decl);
    if (this.takeIf("=")) {
      let right = this.expression(ctx, true);
      assumeTrue(left instanceof JSObjectRef);
      //if (left instanceof JSObjectRef) {
        left = left.assign(right);
      //}
    }
    return left;
  }

  statements(ctx)
  {
    if (this.isEnd()) {
      return;
    }
    do {
      let retn = false;
      let decl = true;
      if (this.takeIf("var")) {
        decl = false;
      } else if (this.takeIf("return")) {
        retn = true;
      }

      let result = this.assignment(ctx, decl);
      if (retn) {
        ctx.setReturn(result);
        break;
      }
      this.takeIf(";");
    } while (this.isEnd() == false);
  }

  dumpTokens()
  {
    for (let t of this.tokens) {
      console.log(t);
    }
  }
}

class JSVM
{
  constructor() { this.clear(); }

  clear()
  {
    this.table = new JSObjTable();
    this.global = JSContext.createGlobal(this);
  }

  setListener(listener) { this.listener = listener; }

  append(code)
  {
    let lexer = JSLexer.createFromScript(this, code);
    lexer.statements(this.global);
  }

  eval(name /*, ... args*/)
  {
    let jsargs = this.toJsArgs(Array.prototype.splice.call(arguments, 1));
    let fn = this.global.getRef(name);
    if (fn != null) {
      let result = fn.eval(jsargs);
      return result != null ? result.get() : null;
    }
    return null;
  }

  toJsArgs(args)
  {
    let jsargs = new Array(args.length);
    for (let i = 0, len = args.length; i < len; i++) {
      let arg = args[i];
      jsargs[i] = new JSObjectNoRef(arg);
    }
    return jsargs;
  }
}

// export
global.RuntimeException = RuntimeException;
global.JSVM = JSVM;

})(window);
