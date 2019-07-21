const RitaScriptVisitor = require('./lib/RitaScriptVisitor').RitaScriptVisitor;
const he = require('he');

class Symbol {
  constructor(visitor, text) {
    this.text = text;
    this.parent = visitor;
    this.transforms = null;
  }
  getText() { return this.text; }
  accept() {
    this.text = this.parent.context[this.text] || this.text;
    return this.parent.visitTerminal(this);
  }
}

/**
 * This Visitor walks the tree generated by a parser
 */
class Visitor extends RitaScriptVisitor {

  constructor(context, lexerRules, parserRules) {
    super();
    this.labels = {};
    this.lexerRules = lexerRules;
    this.parserRules = parserRules;
    this.context = context || {};
    this.currentLabel = '_default_';
  }

  // Entry point for tree visiting
  start(ctx) {
    return this.visitScript(ctx).replace(/ +/g, ' ');
  }

  visitChildren(ctx) {
    return ctx.children.reduce((acc, child) => {
      (child.transforms = ctx.transforms);
      return acc + this.visit(child);
    }, '');
  }

  // Visits a leaf node and returns a string
  visitTerminal(ctx) {
    let term = ctx.getText();
    if (term === '<EOF>') return '';

    if (ctx.transforms) {
      //console.log(0,term, typeof term);
      for (let i = 0; i < ctx.transforms.length; i++) {
        let transform = ctx.transforms[i];
        let comps = transform.split('.');
        for (let j = 1; j < comps.length; j++) {
          //console.log(j,comps[j]);
          if (comps[j].endsWith('()')) { // remove parens
            comps[j] = comps[j].substring(0, comps[j].length - 2);
          }
          if (typeof term[comps[j]] === 'function') {
            term = term[comps[j]]();
          } else if (term.hasOwnProperty(comps[j])) {
            term = term[comps[j]];
          } else {
            //console.warn('Bad transform:', transform, 'for', JSON.stringify(term));
            term = ctx.getText() + ctx.transforms[i];
          }
        }
      }
    }
    return (typeof term === 'string') ? he.decode(term) : JSON.stringify(term);
  }

  visitLabel(ctx) {
    this.currentLabel = ctx.getText());
    return '';
  }

  visitAssign(ctx) {
    let text = ctx.symbol().getText();
    if (text.length && text[0] === '$') text = text.substring(1);
    this.context[text] = this.visit(ctx.expr());
    return this.context[text];
  }

  getRuleName(ctx) {
    return ctx.hasOwnProperty('symbol') ?
      this.lexerRules[ctx.symbol.type] :
      this.parserRules[ctx.ruleIndex];
  }

  countChildRules(ctx, ruleName) {
    let count = 0;
    for (let i = 0; i < ctx.getChildCount(); i++) {
      if (this.getRuleName(ctx.getChild(i)) === ruleName) count++;
    }
    return count;
  }

  printChildren(ctx) {
    for (let i = 0; i < ctx.getChildCount(); i++) {
      let child = ctx.getChild(i);
      console.log(i, child.getText(), this.getRuleName(child));
    }
  }

  flatten(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', '');
  }

  flattenChoice(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', 'choice: ');
  }

  appendToArray(orig, adds) {
    return (adds && adds.length) ? (orig || []).concat(adds) : orig;
  }

  visitSymbol(ctx) {
    let id = ctx.ident().getText();
    //console.log('id',id);
    if (id.length && id[0] === '$') id = id.substring(1);
    let symbol = new Symbol(this, id);
    //console.log('symbol='+symbol.text, typeof symbol);
    symbol.transforms = this.inheritTransforms(symbol, ctx);
    //console.log('symbol.transforms',symbol.transforms);
    return this.visit(symbol);
  }

  inheritTransforms(token, ctx) {
    let newTransforms = ctx.transform().map(t => t.getText()); //.substring(1, t.getText().length - 2));
    newTransforms = this.appendToArray(newTransforms, ctx.transforms);
    return this.appendToArray(token.transforms, newTransforms);
  }

  handleEmptyChoices(ctx, options) {
    let ors = this.countChildRules(ctx, "OR");
    let exprs = this.countChildRules(ctx, "expr");
    let adds = (ors + 1) - exprs;
    for (var i = 0; i < adds; i++) options.push(""); // should be token
  }

  visitChoice(ctx) {
    let options = ctx.expr();
    this.handleEmptyChoices(ctx, options);
    let token = this.randomElement(options);
    if (typeof token === 'string') return token; // fails for transforms ?
    token.transforms = this.inheritTransforms(token, ctx);
    return this.visit(token);
  }

  randomElement(arr) {
    return arr[Math.floor((Math.random() * arr.length))];
  }
}

module.exports = Visitor;
