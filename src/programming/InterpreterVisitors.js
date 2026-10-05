// interpreter-visitors.js - Visitor classes for interpreter
// This file contains the visitor implementations used by the main interpreter

import { booleanOperator } from './BooleanOperators.js';

// Base Visitor class
export class BaseVisitor {
  constructor(interpreter) {
    this.interpreter = interpreter;
  }

  visit(node) {
    throw new Error(`Visitor for ${node.type} not implemented`);
  }
}

// Expression Visitor - handles all expression types
export class ExpressionVisitor extends BaseVisitor {
  visit(node) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'color':
        return this.interpreter.resolveColor(node.value);
      case 'identifier':
        // Handle 'null' as a special keyword literal that returns 0
        if (node.name === 'null') {
          return 0;
        }
        if (node.name.startsWith('param.')) {
          const paramName = node.name.split('.')[1];
          return this.interpreter.env.getParameter(paramName);
        }
        return this.interpreter.env.getParameter(node.name);
      case 'binary_op':
        return this.visitBinaryOp(node);
      case 'comparison':
        return this.visitComparison(node);
      case 'logical_op':
        return this.visitLogicalOp(node);
      case 'ternary':
        return this.visitTernary(node);
      case 'unary_op':
        return this.visitUnaryOp(node);
      case 'array':
        return node.elements.map(e => this.interpreter.evaluateExpression(e));
      case 'function_call':
        return this.interpreter.visitors.functionCall.visitFunctionCall(node);
      case 'param_ref':
        const param = this.interpreter.env.getParameter(node.name);
        return param && typeof param === 'object' ? param[node.property] : undefined;
      case 'array_access':
        const array = this.interpreter.env.getParameter(node.name);
        if (!Array.isArray(array)) {
          throw new Error(`${node.name} is not an array`);
        }
        const idx = Math.floor(this.interpreter.evaluateExpression(node.index));
        if (idx < 0 || idx >= array.length) {
          throw new Error(`Array index ${idx} out of bounds for ${node.name} (length ${array.length})`);
        }
        // Handle nested array access [i][j]
        if (node.index2 !== undefined) {
          const element = array[idx];
          if (!Array.isArray(element)) {
            throw new Error(`${node.name}[${idx}] is not an array`);
          }
          const idx2 = Math.floor(this.interpreter.evaluateExpression(node.index2));
          if (idx2 < 0 || idx2 >= element.length) {
            throw new Error(`Array index ${idx2} out of bounds for ${node.name}[${idx}] (length ${element.length})`);
          }
          return element[idx2];
        }
        return array[idx];
      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  visitBinaryOp(node) {
    const left = this.interpreter.evaluateExpression(node.left);
    const right = this.interpreter.evaluateExpression(node.right);
    
    switch (node.operator) {
      case 'plus': return left + right;
      case 'minus': return left - right;
      case 'multiply': return left * right;
      case 'divide':
        if (right === 0) throw new Error('Division by zero');
        return left / right;
      default:
        throw new Error(`Unknown binary operator: ${node.operator}`);
    }
  }

  visitComparison(node) {
    const left = this.interpreter.evaluateExpression(node.left);
    const right = this.interpreter.evaluateExpression(node.right);
    
    switch (node.operator) {
      case 'equals': return left === right;
      case 'not_equals': return left !== right;
      case 'less': return left < right;
      case 'less_equals': return left <= right;
      case 'greater': return left > right;
      case 'greater_equals': return left >= right;
      default:
        throw new Error(`Unknown comparison operator: ${node.operator}`);
    }
  }

  visitLogicalOp(node) {
    const left = this.interpreter.evaluateExpression(node.left);

    if (node.operator === 'and') {
      return this.interpreter.isTruthy(left) ?
        this.interpreter.isTruthy(this.interpreter.evaluateExpression(node.right)) : false;
    }
    if (node.operator === 'or') {
      return this.interpreter.isTruthy(left) ? true :
        this.interpreter.isTruthy(this.interpreter.evaluateExpression(node.right));
    }

    throw new Error(`Unknown logical operator: ${node.operator}`);
  }

  visitTernary(node) {
    const condition = this.interpreter.evaluateExpression(node.condition);

    if (this.interpreter.isTruthy(condition)) {
      return this.interpreter.evaluateExpression(node.trueExpr);
    } else {
      return this.interpreter.evaluateExpression(node.falseExpr);
    }
  }

  visitUnaryOp(node) {
    const operand = this.interpreter.evaluateExpression(node.operand);
    switch (node.operator) {
      case 'not':
        return !this.interpreter.isTruthy(operand);
      case 'minus':
        return -operand;
      case 'plus':
        return +operand;
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }
}

// Param Visitor
export class ParamVisitor extends BaseVisitor {
  visit(node) {
    const value = this.interpreter.evaluateExpression(node.value);
    this.interpreter.env.setParameter(node.name, value);
    return value;
  }
}

// Shape Visitor
export class ShapeVisitor extends BaseVisitor {
  visit(node) {
    let shapeName = node.name;
    if (this.interpreter.currentFunctionContext) {
      shapeName = `${shapeName}_${this.interpreter.currentFunctionContext.name}_${this.interpreter.currentFunctionContext.callId}`;
    } else if (this.interpreter.currentLoopCounter !== undefined) {
      shapeName = `${shapeName}_${this.interpreter.currentLoopCounter}`;
    }

    const params = {};
    for (const [key, expr] of Object.entries(node.params)) {
      const evaluatedValue = this.interpreter.evaluateExpression(expr);
      params[key] = this.interpreter.processShapeParameter(key, evaluatedValue);
    }
    
    if (node.shapeType === 'donut') {
      console.log('[ShapeVisitor donut]', {
        shapeName,
        nodeParams: node.params,
        evaluatedParams: params,
        startAngle: params.startAngle,
        endAngle: params.endAngle,
        startAngleType: typeof params.startAngle,
        endAngleType: typeof params.endAngle
      });
    }
    
    this.interpreter.processShapeFillParameters(node.shapeType, params);
    const shape = this.interpreter.env.createShapeWithName(node.shapeType, shapeName, params);
    console.log(`✅ Created shape: ${shapeName} (${node.shapeType})`);
    return shape;
  }
}

// Boolean Operation Visitor
export class BooleanOperationVisitor extends BaseVisitor {
  visit(node) {
    const { operation, name, shapes: shapeNames } = node;
    const shapes = [];

    console.log(`🔧 Evaluating boolean operation: ${operation} -> ${name}`);
    
    for (const shapeName of shapeNames) {
      try {
        const shape = this.interpreter.env.getShape(shapeName);
        if (!shape) {
          throw new Error(`Shape not found: ${shapeName}`);
        }
        shapes.push({ ...shape, name: shapeName });
      } catch (error) {
        throw new Error(`Error in boolean operation ${operation}: ${error.message}`);
      }
    }

    let result;
    try {
      switch (operation) {
        case 'union':
          result = booleanOperator.performUnion(shapes);
          break;
        case 'difference':
          result = booleanOperator.performDifference(shapes);
          break;
        case 'intersection':
          result = booleanOperator.performIntersection(shapes);
          break;
        default:
          throw new Error(`Unknown boolean operation: ${operation}`);
      }
    } catch (error) {
      throw new Error(`Failed to perform ${operation}: ${error.message}`);
    }

    for (const shapeName of shapeNames) {
      if (this.interpreter.env.shapes.has(shapeName)) {
        const originalShape = this.interpreter.env.shapes.get(shapeName);
        originalShape._consumedByBoolean = true;
      }
    }

    // Store operand names so boolean can act as a group when moved/rotated
    result.params = result.params || {};
    result.params.operands = [...shapeNames];

    result.name = name;
    this.interpreter.env.addShape(name, result);
    return result;
  }
}

// Function Visitor
export class FunctionVisitor extends BaseVisitor {
  visitFunctionDefinition(node) {
    this.interpreter.functions.set(node.name, {
      parameters: node.parameters,
      body: node.body
    });
    this.interpreter.functionCallCounters.set(node.name, 0);
    return node.name;
  }

  visitFunctionCall(node) {
    const func = this.interpreter.functions.get(node.name);
    if (!func) {
      throw new Error(`Function not found: ${node.name}`);
    }

    const callCount = (this.interpreter.functionCallCounters.get(node.name) || 0) + 1;
    this.interpreter.functionCallCounters.set(node.name, callCount);
    
    const previousFuncContext = this.interpreter.currentFunctionContext;
    this.interpreter.currentFunctionContext = {
      name: node.name,
      callId: callCount
    };

    const args = node.arguments.map(arg => this.interpreter.evaluateExpression(arg));
    
    // Use scope stack for function execution
    this.interpreter.env.pushScope();
    this.interpreter.currentReturn = null;

    for (let i = 0; i < func.parameters.length; i++) {
      if (i < args.length) {
        this.interpreter.env.setParameter(func.parameters[i], args[i]);
      } else {
        this.interpreter.env.popScope();
        throw new Error(`Missing argument for parameter: ${func.parameters[i]}`);
      }
    }

    let result = null;
    for (const statement of func.body) {
      result = this.interpreter.evaluateNode(statement);
      if (this.interpreter.currentReturn !== null) {
        result = this.interpreter.currentReturn;
        break;
      }
    }

    this.interpreter.env.popScope();
    this.interpreter.currentFunctionContext = previousFuncContext;
    
    const returnValue = this.interpreter.currentReturn;
    this.interpreter.currentReturn = null;
    
    return returnValue !== null ? returnValue : result;
  }
}

// Control Flow Visitor
export class ControlFlowVisitor extends BaseVisitor {
  visitIfStatement(node) {
    const condition = this.interpreter.evaluateExpression(node.condition);
    if (this.interpreter.isTruthy(condition)) {
      for (const statement of node.thenBranch) {
        this.interpreter.evaluateNode(statement);
        if (this.interpreter.currentReturn !== null) break;
      }
    } else if (node.elseBranch && node.elseBranch.length > 0) {
      for (const statement of node.elseBranch) {
        this.interpreter.evaluateNode(statement);
        if (this.interpreter.currentReturn !== null) break;
      }
    }
    return this.interpreter.currentReturn;
  }

  visitForLoop(node) {
    const start = this.interpreter.evaluateExpression(node.start);
    const end = this.interpreter.evaluateExpression(node.end);
    const step = this.interpreter.evaluateExpression(node.step);
    
    const outerLoopCounter = this.interpreter.currentLoopCounter;

    // The iterator lives in its own scope so it never leaks out as a
    // global parameter. Nested loops chain their counters (c_0_1) so shape
    // names stay unique across outer iterations.
    this.interpreter.env.pushScope();
    try {
      for (let i = start; i <= end; i += step) {
        this.interpreter.env.setParameter(node.iterator, i);
        this.interpreter.currentLoopCounter =
          outerLoopCounter !== undefined ? `${outerLoopCounter}_${i}` : i;

        for (const statement of node.body) {
          this.interpreter.evaluateNode(statement);
          if (this.interpreter.currentReturn !== null) break;
        }

        if (this.interpreter.currentReturn !== null) break;
      }
    } finally {
      this.interpreter.env.popScope();
      this.interpreter.currentLoopCounter = outerLoopCounter;
    }
    return this.interpreter.currentReturn;
  }
}

// Draw Visitor
export class DrawVisitor extends BaseVisitor {
  visit(node) {
    this.interpreter.turtleDrawer.reset();
    
    for (const command of node.commands) {
      this.visitDrawCommand(command);
    }
    
    const paths = this.interpreter.turtleDrawer.getDrawingPaths();
    if (paths.length === 0) return null;
    
    const allPoints = [];
    for (const path of paths) {
      for (const point of path) {
        allPoints.push(point);
      }
    }
    
    const shape = {
      type: 'path',
      id: `draw_${node.name}_${Date.now()}`,
      params: {
        points: allPoints,
        subPaths: paths,
        isTurtlePath: true,
        fill: false,
        strokeColor: '#000000',
        strokeWidth: 2
      },
      transform: {
        position: [0, 0],
        rotation: 0,
        scale: [1, 1]
      },
      layerName: null
    };
    
    this.interpreter.env.shapes.set(node.name, shape);
    return shape;
  }

  visitDrawCommand(command) {
    switch (command.command) {
      case 'forward':
        this.interpreter.turtleDrawer.forward(this.interpreter.evaluateExpression(command.value));
        break;
      case 'backward':
        this.interpreter.turtleDrawer.backward(this.interpreter.evaluateExpression(command.value));
        break;
      case 'right':
        this.interpreter.turtleDrawer.right(this.interpreter.evaluateExpression(command.value));
        break;
      case 'left':
        this.interpreter.turtleDrawer.left(this.interpreter.evaluateExpression(command.value));
        break;
      case 'goto':
        this.interpreter.turtleDrawer.goto(this.interpreter.evaluateExpression(command.value));
        break;
      case 'penup':
        this.interpreter.turtleDrawer.penup();
        break;
      case 'pendown':
        this.interpreter.turtleDrawer.pendown();
        break;
      default:
        throw new Error(`Unknown draw command: ${command.command}`);
    }
    return null;
  }
}

// Constraints Visitor
export class ConstraintsVisitor extends BaseVisitor {
  visit(node) {
    for (const item of node.items) {
      if (item.kind === 'distance') {
        const dist = this.interpreter.evaluateExpression(item.dist);
        this.interpreter.constraints.push({
          type: 'distance',
          a: item.a,
          b: item.b,
          dist
        });
      } else if (item.kind === 'coincident') {
        this.interpreter.constraints.push({ type: 'coincident', a: item.a, b: item.b });
      } else if (item.kind === 'horizontal') {
        this.interpreter.constraints.push({ type: 'horizontal', a: item.a, b: item.b });
      } else if (item.kind === 'vertical') {
        this.interpreter.constraints.push({ type: 'vertical', a: item.a, b: item.b });
      }
    }
    return null;
  }
}

// Layer Visitor
export class LayerVisitor extends BaseVisitor {
  visit(node) {
    const layer = this.interpreter.env.createLayer(node.name);
    for (const cmd of node.commands) {
      switch (cmd.type) {
        case 'add':
          this.interpreter.env.addShapeToLayer(node.name, cmd.shape);
          break;
        case 'rotate':
          const angle = this.interpreter.evaluateExpression(cmd.angle);
          layer.transform.rotation += angle;
          break;
      }
    }
    return layer;
  }
}

// Transform Visitor
export class TransformVisitor extends BaseVisitor {
  visit(node) {
    const target = this.interpreter.env.shapes.get(node.target) || 
                   this.interpreter.env.layers.get(node.target);
    if (!target) {
      throw new Error(`Transform target not found: ${node.target}`);
    }

    for (const op of node.operations) {
      switch (op.type) {
        case 'scale':
          const scaleVal = this.interpreter.evaluateExpression(op.value);
          target.transform.scale = [scaleVal, scaleVal];
          break;
        case 'rotate':
          const angle = this.interpreter.evaluateExpression(op.angle);
          target.transform.rotation += angle;
          break;
        case 'translate':
          const [x, y] = this.interpreter.evaluateExpression(op.value);
          target.transform.position = [x, y];
          break;
        default:
          throw new Error(`Unknown transform operation: ${op.type}`);
      }
    }
    return target;
  }
}
// Join / Ground Visitors — two-sided joints between named shape edges.
// They do not create geometry; they collect joint records that CodeRunner
// applies to the scene's JointStore.

const EXPR_FUNCTIONS = new Set(['sin', 'cos', 'sqrt', 'abs', 'min', 'max', 'floor', 'ceil', 'round']);
const OPERATORS = { plus: '+', minus: '-', multiply: '*', divide: '/' };

export class JoinVisitor extends BaseVisitor {
  visit(node) {
    const interp = this.interpreter;
    const params = {};
    for (const [key, expr] of Object.entries(node.params)) {
      params[key] = this.paramValue(expr);
    }
    interp.joints.push({
      type: node.jointType,
      a: this.portRef(node.a),
      b: this.portRef(node.b),
      params
    });
    return null;
  }

  /** Port reference with its offsets as numbers or bound expression text. */
  portRef(ref) {
    const out = { shape: this.shapeName(ref.shape) };
    if (ref.line) {
      out.line = ref.line.map(e => this.numberOrText(e));
      return out;
    }
    out.edge = ref.edge;
    if (ref.at) out.at = this.numberOrText(ref.at);
    if (ref.inset) out.inset = this.numberOrText(ref.inset);
    return out;
  }

  numberOrText(expr) {
    const interp = this.interpreter;
    const local = interp.currentLoopCounter !== undefined || interp.currentFunctionContext;
    if (!local && expr.type !== 'number') {
      const text = this.toText(expr);
      if (text !== null) return text;
    }
    return interp.evaluateExpression(expr);
  }

  /**
   * Inside a loop or function, a name refers to the shape created in the
   * same iteration / call (shapes there are suffixed), if there is one.
   */
  shapeName(name) {
    const interp = this.interpreter;
    const shapes = interp.env.shapes;
    if (interp.currentFunctionContext) {
      const scoped = `${name}_${interp.currentFunctionContext.name}_${interp.currentFunctionContext.callId}`;
      if (shapes.has(scoped)) return scoped;
    } else if (interp.currentLoopCounter !== undefined) {
      const scoped = `${name}_${interp.currentLoopCounter}`;
      if (shapes.has(scoped)) return scoped;
    }
    return name;
  }

  /**
   * A joint parameter value: an enum word stays a word; at top level, an
   * expression over global parameters is kept as text so the joint stays
   * bound to them; anything else is evaluated to a number now.
   */
  paramValue(expr) {
    const interp = this.interpreter;
    if (expr.type === 'identifier' && !this.isParameter(expr.name)) return expr.name;
    if (expr.type === 'string') return expr.value;
    const local = interp.currentLoopCounter !== undefined || interp.currentFunctionContext;
    if (!local && expr.type !== 'number') {
      const text = this.toText(expr);
      if (text !== null) return text;
    }
    return interp.evaluateExpression(expr);
  }

  isParameter(name) {
    try {
      this.interpreter.env.getParameter(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * AQUI expression → bindable expression text (minimal parentheses), or
   * null if it uses something the parameter expression language lacks.
   */
  toText(node) {
    const r = this.toTextPrec(node);
    return r ? r.text : null;
  }

  /** @returns {?{text: string, prec: number}} prec: 1 = + −, 2 = * /, 3 = atom */
  toTextPrec(node) {
    switch (node.type) {
      case 'number': return { text: String(node.value), prec: 3 };
      case 'identifier': return this.isParameter(node.name) ? { text: node.name, prec: 3 } : null;
      case 'binary_op': {
        const op = OPERATORS[node.operator];
        const l = this.toTextPrec(node.left), r = this.toTextPrec(node.right);
        if (!op || !l || !r) return null;
        const prec = op === '+' || op === '-' ? 1 : 2;
        const wrap = (x, right) => (x.prec < prec || (right && x.prec === prec && (op === '-' || op === '/')) ? `(${x.text})` : x.text);
        return { text: `${wrap(l, false)} ${op} ${wrap(r, true)}`, prec };
      }
      case 'unary_op': {
        const x = this.toTextPrec(node.operand);
        if (!x || node.operator !== 'minus') return null;
        return { text: x.prec === 3 ? `-${x.text}` : `-(${x.text})`, prec: 3 };
      }
      case 'function_call': {
        if (!EXPR_FUNCTIONS.has(node.name)) return null;
        const args = node.arguments.map(a => this.toTextPrec(a));
        return args.every(Boolean) ? { text: `${node.name}(${args.map(a => a.text).join(', ')})`, prec: 3 } : null;
      }
      default: return null;
    }
  }
}

export class GroundVisitor extends BaseVisitor {
  visit(node) {
    this.interpreter.ground = new JoinVisitor(this.interpreter).shapeName(node.shape);
    return null;
  }
}
