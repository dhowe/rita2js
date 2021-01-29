grammar RiScript;

// NOTE: changing this file requires a re-compile: use $ yarn watch.grammar 

script: (expr | cexpr | NL)* EOF;
expr: (symbol | choice | assign | chars)+;
cexpr: WS* LCB cond+ RCB WS* expr;
cond: symbol WS* op WS* chars WS* COM?;
weight: WS* LB INT RB WS*;
choice: (LP (wexpr OR)* wexpr RP) transform*;
assign: (dynamic | symbol) EQ expr;
chars: (
		(DOT | WS | EXC | AST | GT | LT | DOL | HAT | COM | FS)
		| CHR
		| ENT
		| INT
	)+;
dynamic: DYN transform*;
symbol:
	SYM transform*
	| transform+; // handle empty-string transforms
wexpr: expr? weight?;
transform: TF;
op: OP | (LT | GT | EQ);


/*     
		First, select the lexer rule which matches the longest input
    If the text matches an implicitly defined token (like '{'), use the implicit rule
    If several lexer rules match the same input length, choose the first one, based on definition order
 */

LCOMM: '/*' .*? '*/' -> channel(HIDDEN);
BCOMM: '//' ~[\r\n\u2028\u2029]* -> channel(HIDDEN);

GT: '>';
LT: '<';
LP: '(';
RP: ')';
LB: '[';
RB: ']';
LCB: '{';
RCB: '}';
DOT: '.';
WS: [ \t];
FS: '/';
EXC: '!';
AST: '*';
HAT: '^';
DOL: '$';
COM: ',';
NL: '\r'? '\n';
DYN: '$$' NIDENT;
SYM: '$' NIDENT;
OR: WS* '|' WS*;
EQ: WS* '=' WS*;
TF: ('.' IDENT ( '(' ')')?)+;
ENT: '&' [A-Za-z0-9#]+ ';';
//NUM: ([0-9]+ | ( [0-9]* '.' [0-9]+));
INT: WS* [0-9]+ WS*;
OP: [!*$^<>] '=';
CHR:
	~(
		'.'
		| '>'
		| '/'
		| '<'
		| '^'
		| '*'
		| '!'
		| '['
		| ']'
		| '{'
		| '}'
		| '('
		| ')'
		| ' '
		| '\t'
		| '|'
		| '='
		| '$'
		| '\n'
	)+;
fragment IDENT: [A-Za-z_] [A-Za-z_0-9-]*;
fragment NIDENT: [A-Za-z_0-9] [A-Za-z_0-9-]*;