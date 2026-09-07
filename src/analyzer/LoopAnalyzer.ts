import { Complexity } from './Complexity';

interface LoopBound {
    complexity: Complexity;
    symbol: string | null;
    isConstant: boolean;
}

export function isLoop(node: any): boolean {
    return node.type === 'for_statement' ||
           node.type === 'for_range_loop' ||
           node.type === 'while_statement' ||
           node.type === 'do_statement' ||
           node.type === 'enhanced_for_statement';
}

export function getLoopComplexity(node: any): Complexity {
    if (node.type === 'for_range_loop' || node.type === 'enhanced_for_statement' ||
        (node.type === 'for_statement' &&
         !node.childForFieldName('initializer') &&
         !node.childForFieldName('init'))) {
        const iterable = node.childForFieldName('right') || node.childForFieldName('value');
        return iterable ? getBoundComplexity(iterable).complexity : new Complexity(1, 0);
    }

    if (node.type === 'for_statement') {
        const bound = getForLoopBound(node);
        if (bound.isConstant) {
            return new Complexity(0, 0);
        }

        const update = node.childForFieldName('update');
        if (update?.type === 'assignment_expression' &&
            (update.text.includes('*=') || update.text.includes('/=') ||
             update.text.includes('>>=') || update.text.includes('<<='))) {
            return bound.symbol
                ? Complexity.logarithmic(bound.symbol)
                : new Complexity(0, 1, false, true);
        }

        return bound.complexity;
    }

    if (node.type === 'while_statement') {
        const body = node.childForFieldName('body');
        if (body && (body.text.includes('*=') || body.text.includes('/=') ||
            body.text.includes('>>=') || body.text.includes('<<='))) {
            return new Complexity(0, 1);
        }
        if (isLikelyBinarySearchLoop(node)) {
            return new Complexity(0, 1);
        }
    }

    return new Complexity(1, 0);
}

function isLikelyBinarySearchLoop(node: any): boolean {
    const condition = node.childForFieldName('condition');
    const body = node.childForFieldName('body');
    if (!condition || !body || body.descendantsOfType('if_statement').length === 0) {
        return false;
    }

    const boundaryNames = new Set<string>(
        condition.descendantsOfType('identifier').map((identifier: any) => identifier.text)
    );
    const isMidpointValue = (value: any) => {
        if (!value || !/\/\s*2|>>\s*1/.test(value.text)) {
            return false;
        }
        const identifiers = new Set<string>(
            value.descendantsOfType('identifier').map((identifier: any) => identifier.text)
        );
        return [...boundaryNames].every(name => identifiers.has(name));
    };

    const midpointNames = new Set<string>();
    for (const declarator of body.descendantsOfType('init_declarator')) {
        const name = declarator.childForFieldName('declarator');
        const value = declarator.childForFieldName('value');
        if (name && isMidpointValue(value)) {
            midpointNames.add(name.text);
        }
    }
    for (const assignment of body.descendantsOfType('assignment_expression')) {
        const left = assignment.childForFieldName('left');
        const right = assignment.childForFieldName('right');
        if (left && isMidpointValue(right)) {
            midpointNames.add(left.text);
        }
    }
    if (midpointNames.size === 0) {
        return false;
    }

    return body.descendantsOfType('assignment_expression').some((assignment: any) => {
        const left = assignment.childForFieldName('left');
        const right = assignment.childForFieldName('right');
        if (!left || !right || !boundaryNames.has(left.text) || !/\+\s*1|-\s*1/.test(right.text)) {
            return false;
        }
        return right.descendantsOfType('identifier')
            .some((identifier: any) => midpointNames.has(identifier.text));
    });
}

function getForLoopBound(node: any): LoopBound {
    const initializer = node.childForFieldName('initializer') || node.childForFieldName('init');
    const condition = node.childForFieldName('condition');
    if (!initializer || !condition || condition.type !== 'binary_expression') {
        return unknownLoopBound();
    }

    const declarator = initializer.childForFieldName('declarator');
    const initialValue = initializer.type === 'assignment_expression'
        ? initializer.childForFieldName('right')
        : declarator?.childForFieldName('value');
    const loopVariable = initializer.type === 'assignment_expression'
        ? initializer.childForFieldName('left')?.text
        : (declarator?.childForFieldName('declarator')?.text || declarator?.childForFieldName('name')?.text);
    const left = condition.childForFieldName('left');
    const right = condition.childForFieldName('right');

    if (!loopVariable || !left || !right) {
        return unknownLoopBound();
    }

    let boundary = null;
    let isSquareRoot = false;
    if (left.text === loopVariable) {
        boundary = right;
    } else if (right.text === loopVariable) {
        boundary = left;
    } else if (isSquaredLoopVariable(left, loopVariable)) {
        boundary = right;
        isSquareRoot = true;
    } else if (isSquaredLoopVariable(right, loopVariable)) {
        boundary = left;
        isSquareRoot = true;
    }

    if (!boundary) {
        return unknownLoopBound();
    }

    let boundSource = boundary;
    let bound = getBoundComplexity(boundSource);
    if (bound.isConstant && isNumericLiteral(initialValue)) {
        return { complexity: new Complexity(0, 0), symbol: null, isConstant: true };
    }

    if (bound.isConstant && initialValue) {
        boundSource = initialValue;
        bound = getBoundComplexity(boundSource);
    }

    const symbols = getInputSymbols(boundSource);
    return {
        complexity: isSquareRoot ? bound.complexity.root(2) : bound.complexity,
        symbol: symbols.length === 1 ? symbols[0] : null,
        isConstant: bound.isConstant
    };
}

function unknownLoopBound(): LoopBound {
    return {
        complexity: new Complexity(1, 0, false, true),
        symbol: null,
        isConstant: false
    };
}

function getBoundComplexity(node: any): { complexity: Complexity, isConstant: boolean } {
    if (!node) {
        return { complexity: new Complexity(1, 0, false, true), isConstant: false };
    }

    if (isNumericLiteral(node)) {
        return { complexity: new Complexity(0, 0), isConstant: true };
    }
    if (node.type === 'identifier') {
        return { complexity: Complexity.variable(node.text), isConstant: false };
    }

    if (node.type === 'call_expression' || node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode?.type === 'field_expression') {
            const field = functionNode.childForFieldName('field');
            const receiver = functionNode.childForFieldName('argument');
            if (field?.text === 'size' && receiver?.type === 'identifier') {
                return { complexity: Complexity.variable(receiver.text), isConstant: false };
            }
        }

        const argumentsNode = node.childForFieldName('arguments');
        if (functionNode?.text === 'range' && argumentsNode) {
            const args = argumentsNode.namedChildren || [];
            const stop = args.length >= 2 ? args[1] : args[0];
            return getBoundComplexity(stop);
        }
    }

    if (node.type === 'binary_expression') {
        const left = getBoundComplexity(node.childForFieldName('left'));
        const right = getBoundComplexity(node.childForFieldName('right'));
        const operator = (node.children || [])
            .find((child: any) => ['+', '-', '*', '/'].includes(child.type))?.type;

        if (operator === '*') {
            return {
                complexity: left.complexity.multiply(right.complexity),
                isConstant: left.isConstant && right.isConstant
            };
        }
        if (operator === '+' || operator === '-') {
            return {
                complexity: left.complexity.add(right.complexity),
                isConstant: left.isConstant && right.isConstant
            };
        }
        if (operator === '/' && right.isConstant) {
            return left;
        }
    }

    const symbols = getInputSymbols(node);
    if (symbols.length > 0) {
        let complexity = Complexity.variable(symbols[0], true);
        for (const symbol of symbols.slice(1)) {
            complexity = complexity.add(Complexity.variable(symbol, true));
        }
        return { complexity, isConstant: false };
    }
    return { complexity: new Complexity(1, 0, false, true), isConstant: false };
}

function isNumericLiteral(node: any): boolean {
    return Boolean(node) && (
        node.type === 'number_literal' ||
        node.type === 'integer' ||
        node.type === 'decimal_integer_literal' ||
        node.type === 'hex_integer_literal' ||
        node.type === 'octal_integer_literal' ||
        node.type === 'binary_integer_literal'
    );
}

function isSquaredLoopVariable(node: any, loopVariable: string): boolean {
    if (node.type !== 'binary_expression' || !node.text.includes('*')) {
        return false;
    }
    const identifiers = node.descendantsOfType('identifier');
    return identifiers.length === 2 && identifiers.every((identifier: any) => identifier.text === loopVariable);
}

function getInputSymbols(node: any): string[] {
    if (!node) {
        return [];
    }
    if (node.type === 'identifier') {
        return [node.text];
    }

    if (node.type === 'call_expression' || node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode?.type === 'field_expression') {
            const field = functionNode.childForFieldName('field');
            const receiver = functionNode.childForFieldName('argument');
            if (field?.text === 'size' && receiver?.type === 'identifier') {
                return [receiver.text];
            }
        }
        const argumentsNode = node.childForFieldName('arguments');
        if (argumentsNode) {
            const argumentSymbols = argumentsNode.descendantsOfType('identifier')
                .map((identifier: any) => identifier.text);
            if (argumentSymbols.length > 0) {
                return [...new Set<string>(argumentSymbols)];
            }
        }
    }

    const symbols = node.descendantsOfType('identifier').map((identifier: any) => identifier.text);
    return [...new Set<string>(symbols)];
}
