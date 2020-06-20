const antlr4 = require('antlr4');
const { decode } = require('he');
const Visitor = require('./visitor');
const Lexer = require('../grammar/.antlr/RiScriptLexer');
const Parser = require('../grammar/.antlr/RiScriptParser');
const { LexerErrors, ParserErrors } = require('./errors');

class RiScript {

  constructor() {
    this.lexer = undefined;
    this.parser = undefined;
    this.visitor = undefined;
    this.appliedTransforms = [];
  }

  static eval(input, ctx, opts = {}) {

    ctx = ctx || {};

    // make sure we have RiTa in context
    if (!ctx.hasOwnProperty('RiTa')) ctx.RiTa = RiScript.RiTa;
    let onepass = opts.singlePass; // TODO: doc
    let last = input, trace = opts.trace;
    let rs = new RiScript().pushTransforms(ctx);
    let expr = rs.lexParseVisit(input, ctx, opts);
    trace && console.log('\nInput1: ' + input + '\nResult1: '
      + expr + '\nContext: [' + Object.keys(ctx) + ']');

    if (!onepass && rs.isParseable(expr)) { ///(\$[A-Za-z_]|[()])/.test(expr)) {
      for (let i = 0; i < RiScript.MAX_TRIES && expr !== last; i++) {
        last = expr;
        if (!expr) break;
        expr = rs.lexParseVisit(expr, ctx, opts);
        trace && console.log('\nPass#' + (i + 2) + ': ' + expr
          + '\n-------------------------------------------------------\n');
        if (i >= RiScript.MAX_TRIES - 1) throw Error('Unable to resolve: "'
          + input + '" after ' + RiScript.MAX_TRIES + ' tries. An infinite loop?');
      }
    }
    if (!opts.silent && !RiScript.RiTa.SILENT && /\$[A-Za-z_]/.test(expr)) {
      console.warn('[WARN] Unresolved symbol(s) in "' + expr + '"');
    }
    return rs.popTransforms(ctx).resolveEntities(expr);
  }

  pushTransforms(ctx) {
    Object.keys(RiScript.transforms).forEach(t => {
      if (!ctx.hasOwnProperty(t)) {
        ctx[t] = RiScript.transforms[t];
        this.appliedTransforms.push(t);
      }
    });
    return this;
  }

  popTransforms(ctx) {
    this.appliedTransforms.forEach(t => delete ctx[t]);
    return this;
  }

  lex(input, opts) {
    // create the lexer
    let stream = new antlr4.InputStream(input);
    this.lexer = new Lexer.RiScriptLexer(stream);
    this.lexer.removeErrorListeners();
    this.lexer.addErrorListener(new LexerErrors());

    let silent = opts && opts.silent;
    let trace = opts && opts.trace;

    // try the lexing
    let tokenStream;
    try {
      tokenStream = new antlr4.CommonTokenStream(this.lexer);
      if (trace) {
        console.log('-------------------------------------------------------');
        tokenStream.fill();
        tokenStream.tokens.forEach(t => console.log(this.tokenToString(t)));
        console.log();
      }
    } catch (e) {
      if (!silent) console.error(//require('colors').red
        ("LEXER: " + input + '\n' + e.message + "\n"));
      throw e;
    }
    return tokenStream;
  }

  tokenToString(t) {
    let txt = "<no text>";
    if (t.text && t.text.length) {
      txt = t.text.replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    }
    let type = (t.type > -1 ? this.lexer.symbolicNames[t.type] : 'EOF');
    return "[" + t.line + "." + t.column + ": '" + txt + "' -> " + type + "]";
  }

  parse(tokens, input, opts) {

    // create the parser
    this.parser = new Parser.RiScriptParser(tokens);
    this.parser.removeErrorListeners();
    this.parser.addErrorListener(new ParserErrors());

    let silent = opts && opts.silent;
    let trace = opts && opts.trace;

    // try the parsing
    let tree;
    try {
      tree = this.parser.script();
    } catch (e) {
      if (!silent) console.error(//require('colors').red
        ("PARSER: '" + input + '\'\n' + e.message + '\n'));
      throw e;
    }
    trace && console.log(tree.toStringTree(this.parser.ruleNames) + '\n');
    return tree;
  }

  lexParse(input, opts) {
    let tokens = this.lex(input, opts);
    return this.parse(tokens, input, opts);
  }

  preParse(input, opts = {}) {
    let parse = input, pre = '', post = '';
    if (!opts.skipPreParse) {
      const re = /[()$|]/;
      const words = input.split(/ +/);
      let preIdx = 0, postIdx = words.length - 1;
      while (preIdx < words.length) {
        if (re.test(words[preIdx])) break;
        preIdx++;
      }
      if (preIdx < words.length) {
        while (postIdx >= 0) {
          if (re.test(words[preIdx])) break;
          postIdx--;
        }
      }
      pre = words.slice(0, preIdx).join(' ');
      parse = words.slice(preIdx, postIdx + 1).join(' ');
      post = words.slice(postIdx + 1).join(' ');
    }
    return { pre, parse, post };
  }

  lexParseVisit(input, context, opts) {

    let { pre, parse, post } = this.preParse(input, opts);
    //console.log("\nPRE: " + pre,"PARSE: " + parse, "POST: " + post, "\n");
    let tree = parse.length && this.lexParse(parse, opts);
    let result = parse.length ? this.createVisitor(context, opts).start(tree) : '';
    return (this.normalize(pre) + ' ' + result + ' ' + this.normalize(post)).trim();
  }

  lexParseVisitOrig(input, context, opts) {
    let tree = this.lexParse(input, opts);
    return this.createVisitor(context, opts).start(tree);;
  }

  normalize(s) {
    return s && s.length ?
      s.replace(/\r/, '')
        .replace(/\\n/, '')
        .replace(/\n/, ' ') : '';
  }

  createVisitor(context, opts) {
    return new Visitor(this, context, opts);
  }

  resolveEntities(result) { // &#10; for line break DOC:
    return decode(result.replace(/ +/g, ' '))
      .replace(/[\t\v\f\u00a0\u2000-\u200b\u2028-\u2029\u3000]+/g, ' ');
  }

  isParseable(s) {
    return /([()]|\$[A-Za-z_][A-Za-z_0-9-]*)/.test(s);
  }

  static addTransform(name, func) { 
    RiScript.transforms[name] = func;
    return RiScript.transforms;
  }

  static articlize(s) {
    let silent = RiTa.SILENCE_LTS;
    RiTa.SILENCE_LTS = true;    
    let phones = RiTa.phones(s);
    return (phones && phones.length
      && /[aeiou]/.test(phones[0]) ? 'an ' : 'a ') + s;
    RiTa.SILENCE_LTS = silent;
  }
  /* 
    static addTransform(name, func) { // DOC: object case
      if (typeof name === 'string') {
        return RiScript.transforms[name] = func;
      }
      Object.keys(name).forEach(k => {
        RiScript.transforms[k] = name[k];
      });
    }
    static removeTransform(name) { // DOC:
      let obj = {};
      if (typeof name === 'string') {
        return delete RiScript.transforms[name];
      }
      Object.keys(name).forEach(k => delete RiScript.transforms[k]);
    }
    static getTransforms() { // DOC:
      return Object.keys(RiScript.transforms);
    } */
    
}

// -------------------- Default Transforms ----------------------

/// <summary>
/// articlize: Prefixes the string with 'a' or 'an' as appropriate.
/// </summary>
/* function articlize(s) {
  return RiScript.RiTa.articlize(s);
} */

/// <summary>
/// Capitalizes the first character.
/// </summary>
function capitalize(s) {
  return s[0].toUpperCase() + s.substring(1);
}

/// <summary>
/// Capitalizes the first character.
/// </summary>
function toUpper(s) {
  return s.toUpperCase();
}

/// <summary>
/// Wraps the given string in double-quotes.
/// </summary>
function quotify(s) {
  return "&quot;" + s + "&quot;";
}

/// <summary>
/// Pluralizes the word according to english regular/irregular rules.
/// </summary>
function pluralize(s) {
  if (s.indexOf(' ') > -1) throw Error
    ('pluralize expected a single word, got "' + s + '"');
  return RiScript.RiTa.pluralize(s);
}

RiScript.MAX_TRIES = 100;
RiScript.transforms = { capitalize, quotify, pluralize, qq: quotify, 
  uc: toUpper, ucf: capitalize, articlize: RiScript.articlize };

module && (module.exports = RiScript);