import { Complexity } from './Complexity';
import { getLoopComplexity, isLoop } from './LoopAnalyzer';

export { getLoopComplexity, isLoop } from './LoopAnalyzer';

export function analyzeBlock(node: any, funcName: string): { complexity: Complexity, reason: string } {
    const recComplexity = analyzeRecursion(node, funcName);
    if (recComplexity) {
        const complexity = Complexity.fromString(recComplexity);
        return { complexity, reason: `Recursive calls detected (${recComplexity})` };
    }

    let totalComplexity = new Complexity(0, 0);
    const reasons: string[] = [];

    const children = node.children || [];
    for (const child of children) {
        const current = analyzeNode(child, funcName);
        totalComplexity = totalComplexity.add(current.complexity);
        if (current.reason && current.complexity.toString() !== 'O( 1 )') {
            reasons.push(current.reason);
        }
    }

    return {
        complexity: totalComplexity,
        reason: reasons.length > 0 ? reasons.join('\n') : 'Constant time operations'
    };
}

function analyzeNode(node: any, funcName: string): { complexity: Complexity, reason: string } {
    if (!node) {
        return { complexity: new Complexity(0, 0), reason: 'Constant time operations' };
    }

    if (isLoop(node)) {
        const bodyResult = analyzeNode(node.childForFieldName('body'), funcName);
        const loopCost = getLoopComplexity(node);
        return {
            complexity: loopCost.multiply(bodyResult.complexity),
            reason: `Loop (${loopCost.toString()}) wrapping: ${bodyResult.complexity.toString()}`
        };
    }

    if (node.type === 'expression_statement' || node.type === 'return_statement') {
        return getFunctionCallComplexity(node);
    }

    if (node.type === 'declaration' || node.type === 'local_variable_declaration') {
        const containsCall = ['call_expression', 'call', 'method_invocation']
            .some(type => node.descendantsOfType(type).length > 0);
        return containsCall
            ? getFunctionCallComplexity(node)
            : { complexity: new Complexity(0, 0), reason: 'Declaration' };
    }

    if (node.type === 'compound_statement' || node.type === 'block' || node.type === 'if_statement') {
        return analyzeBlock(node, funcName);
    }

    return { complexity: new Complexity(0, 0), reason: 'Constant time operations' };
}

export function getFunctionCallComplexity(node: any): { complexity: Complexity, reason: string } {
    const text = node.text;

    if (text.includes('sort(') || text.includes('stable_sort(') || text.includes('sorted(')) {
        return { complexity: new Complexity(1, 1), reason: 'Call: sort (O(N log N))' };
    }
    if (text.includes('lower_bound(') || text.includes('upper_bound(') ||
        text.includes('binary_search(') || text.includes('binarySearch(')) {
        return { complexity: new Complexity(0, 1), reason: 'Call: binary search (O(log N))' };
    }
    if (text.includes('push_back(') || text.includes('pop_back(') ||
        text.includes('max(') || text.includes('min(') ||
        text.includes('append(') || text.includes('.add(')) {
        return { complexity: new Complexity(0, 0), reason: 'Call: O(1) op' };
    }

    if (text.match(/[a-zA-Z_]\w*\s*\(/)) {
        return {
            complexity: new Complexity(0, 0, false, true),
            reason: `Call: Unknown function '${text.trim().split('(')[0]}'`
        };
    }

    return { complexity: new Complexity(0, 0), reason: 'Expression' };
}

export function analyzeRecursion(node: any, funcName: string): string | null {
    let callCount = 0;
    let hasDivision = false;
    let hasSubtraction = false;

    const traverse = (currentNode: any) => {
        if (currentNode.type === 'call_expression') {
            const functionNode = currentNode.childForFieldName('function');
            if (functionNode && functionNode.text === funcName) {
                callCount++;
                const args = currentNode.childForFieldName('arguments');
                if (args) {
                    if (args.text.includes('/') || args.text.includes('>>')) {
                        hasDivision = true;
                    } else if (args.text.includes('-') || args.text.includes('--')) {
                        hasSubtraction = true;
                    }
                }
            }
        }
        if (currentNode.children) {
            for (const child of currentNode.children) {
                traverse(child);
            }
        }
    };
    traverse(node);

    if (callCount === 0) {
        return null;
    }
    if (callCount >= 2) {
        return 'O(2^N)';
    }
    if (hasDivision) {
        return 'O(log N)';
    }
    if (hasSubtraction) {
        return 'O(N)';
    }
    return 'O(N)';
}
