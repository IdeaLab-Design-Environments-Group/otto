/**
 * Expression Parser using Interpreter Pattern and Composite Pattern
 * Parses mathematical expressions and evaluates them
 * Supports: +, -, *, /, parentheses, parameter references, math functions
 */

/**
 * Base AST Node (Composite Pattern)
 */
class ASTNode {
    evaluate(context) {
        throw new Error('evaluate() must be implemented by subclass');
    }
}

/**
 * NumberNode - Represents a literal number
 */
class NumberNode extends ASTNode {
    constructor(value) {
        super();
        this.value = value;
    }
    
    evaluate(context) {
        return this.value;
    }
}

/**
 * ParameterRefNode - Represents a parameter reference
 */
class ParameterRefNode extends ASTNode {
    constructor(name) {
        super();
        this.name = name;
    }
    
    evaluate(context) {
        if (context[this.name] === undefined) {
            console.warn(`Parameter '${this.name}' not found in context, using 0`);
            return 0;
        }
        return context[this.name];
    }
}

/**
 * BinaryOpNode - Represents a binary operation (+, -, *, /)
 */
class BinaryOpNode extends ASTNode {
    constructor(operator, left, right) {
        super();
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
    
    evaluate(context) {
        const leftVal = this.left.evaluate(context);
        const rightVal = this.right.evaluate(context);
        
        switch (this.operator) {
            case '+':
                return leftVal + rightVal;
            case '-':
                return leftVal - rightVal;
            case '*':
                return leftVal * rightVal;
            case '/':
                if (rightVal === 0) {
                    throw new Error('Division by zero');
                }
                return leftVal / rightVal;
            default:
                throw new Error(`Unknown operator: ${this.operator}`);
        }
    }
}

/**
 * FunctionCallNode - Represents a function call (sin, cos, sqrt, abs, min, max)
 */
class FunctionCallNode extends ASTNode {
    constructor(functionName, args) {
        super();
        this.functionName = functionName.toLowerCase();
        this.args = args;
    }
    
    evaluate(context) {
        const argValues = this.args.map(arg => arg.evaluate(context));
        
        switch (this.functionName) {
            case 'sin':
                if (argValues.length !== 1) throw new Error('sin() requires 1 argument');
                return Math.sin(argValues[0]);
            
            case 'cos':
                if (argValues.length !== 1) throw new Error('cos() requires 1 argument');
                return Math.cos(argValues[0]);
            
            case 'sqrt':
                if (argValues.length !== 1) throw new Error('sqrt() requires 1 argument');
                if (argValues[0] < 0) throw new Error('sqrt() argument must be non-negative');
                return Math.sqrt(argValues[0]);
            
            case 'abs':
                if (argValues.length !== 1) throw new Error('abs() requires 1 argument');
                return Math.abs(argValues[0]);
            
            case 'min':
                if (argValues.length < 1) throw new Error('min() requires at least 1 argument');
                return Math.min(...argValues);
            
            case 'max':
                if (argValues.length < 1) throw new Error('max() requires at least 1 argument');
                return Math.max(...argValues);
            
            default:
                throw new Error(`Unknown function: ${this.functionName}`);
        }
    }
}

/**
 * ExpressionParser - Parses and evaluates mathematical expressions
 */
export class ExpressionParser {
    constructor() {
        this.supportedFunctions = ['sin', 'cos', 'sqrt', 'abs', 'min', 'max'];
    }
    
    /**
     * Parse an expression string into an AST
     * @param {string} expression 
     * @returns {ASTNode}
     */
    parse(expression) {
        if (!expression || typeof expression !== 'string') {
            throw new Error('Expression must be a non-empty string');
        }
        
        // Remove whitespace
        expression = expression.replace(/\s+/g, '');
        
        if (expression.length === 0) {
            throw new Error('Expression cannot be empty');
        }
        
        let pos = 0;
        
        const parseExpression = () => {
            return parseAddition();
        };
        
        const parseAddition = () => {
            let left = parseMultiplication();
            while (pos < expression.length && (expression[pos] === '+' || expression[pos] === '-')) {
                const op = expression[pos++];
                const right = parseMultiplication();
                left = new BinaryOpNode(op, left, right);
            }
            return left;
        };
        
        const parseMultiplication = () => {
            let left = parseUnary();
            while (pos < expression.length && (expression[pos] === '*' || expression[pos] === '/')) {
                const op = expression[pos++];
                const right = parseUnary();
                left = new BinaryOpNode(op, left, right);
            }
            return left;
        };
        
        const parseUnary = () => {
            if (pos < expression.length && expression[pos] === '-') {
                pos++;
                return new BinaryOpNode('*', new NumberNode(-1), parseUnary());
            }
            return parsePrimary();
        };
        
        const parsePrimary = () => {
            if (pos >= expression.length) {
                throw new Error('Unexpected end of expression');
            }
            
            // Handle parentheses
            if (expression[pos] === '(') {
                pos++; // consume '('
                const node = parseExpression();
                if (pos >= expression.length || expression[pos] !== ')') {
                    throw new Error('Unmatched parenthesis');
                }
                pos++; // consume ')'
                return node;
            }
            
            // Handle numbers
            if (this.isDigit(expression[pos]) || expression[pos] === '.') {
                return parseNumber();
            }
            
            // Handle functions
            if (this.isLetter(expression[pos])) {
                const identifier = parseIdentifier();
                if (pos < expression.length && expression[pos] === '(') {
                    // Function call
                    pos++; // consume '('
                    const args = parseArguments();
                    if (pos >= expression.length || expression[pos] !== ')') {
                        throw new Error('Unmatched parenthesis in function call');
                    }
                    pos++; // consume ')'
                    return new FunctionCallNode(identifier, args);
                } else {
                    // Parameter reference
                    return new ParameterRefNode(identifier);
                }
            }
            
            throw new Error(`Unexpected character: ${expression[pos]} at position ${pos}`);
        };
        
        const parseNumber = () => {
            let numStr = '';
            while (pos < expression.length && (this.isDigit(expression[pos]) || expression[pos] === '.')) {
                numStr += expression[pos++];
            }
            const num = parseFloat(numStr);
            if (isNaN(num)) {
                throw new Error(`Invalid number: ${numStr}`);
            }
            return new NumberNode(num);
        };
        
        const parseIdentifier = () => {
            let ident = '';
            while (pos < expression.length && (this.isLetter(expression[pos]) || this.isDigit(expression[pos]))) {
                ident += expression[pos++];
            }
            return ident;
        };
        
        const parseArguments = () => {
            const args = [];
            if (pos >= expression.length || expression[pos] === ')') {
                return args;
            }
            args.push(parseExpression());
            while (pos < expression.length && expression[pos] === ',') {
                pos++; // consume ','
                args.push(parseExpression());
            }
            return args;
        };
        
        try {
            const ast = parseExpression();
            if (pos < expression.length) {
                throw new Error(`Unexpected characters after expression: ${expression.substring(pos)}`);
            }
            return ast;
        } catch (error) {
            throw new Error(`Parse error: ${error.message}`);
        }
    }
    
    /**
     * Evaluate an AST with a context
     * @param {ASTNode} ast 
     * @param {Object} context 
     * @returns {number}
     */
    evaluate(ast, context = {}) {
        if (!ast) {
            throw new Error('AST is required for evaluation');
        }
        return ast.evaluate(context);
    }
    
    isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }
    
    isLetter(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
    }
}
