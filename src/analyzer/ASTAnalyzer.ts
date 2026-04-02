import { Complexity } from './Complexity';
import { AlgorithmRegistry } from './AlgorithmRegistry';

export function analyzeBlock(node: any, funcName: string): { complexity: Complexity, reason: string } {
    const recComplexity = analyzeRecursion(node, funcName);
    if (recComplexity) {
        const compObj = Complexity.fromString(recComplexity);
        return { complexity: compObj, reason: `Recursive calls detected (${recComplexity})` };
    }

    let maxComplexity = new Complexity(0, 0);
    let reason = "Constant time operations";

    const signature = getStructureSignature(node);
    const algo = AlgorithmRegistry.match(signature);
    let baseComplexity = new Complexity(0, 0);
    let algoName = "";

    if (algo) {
        baseComplexity = Complexity.fromString(algo.complexity);
        algoName = algo.name;
        maxComplexity = baseComplexity;
        reason = `Pattern: ${algoName}`;
    }

    const isBinarySearchPattern = algo && baseComplexity.log > 0;

    const children = node.children || [];
    for (const child of children) {
        let currentComplexity = new Complexity(0, 0);
        let currentReason = "";

        if (child.type === 'expression_statement') {
            const callResult = getFunctionCallComplexity(child);
            currentComplexity = callResult.complexity;
            currentReason = callResult.reason;
        }
        else if (isLoop(child)) {
            const bodyNode = child.childForFieldName('body');
            const bodyResult = analyzeBlock(bodyNode, funcName);
            
            let loopCost = getLoopComplexity(child);
            
            if (isBinarySearchPattern && child.type === 'while_statement') {
                loopCost = new Complexity(0, 1);
            }

            currentComplexity = loopCost.multiply(bodyResult.complexity);
            currentReason = `Loop (${loopCost.toString()}) wrapping: ${bodyResult.complexity.toString()}`;
        } 
        else if (child.type === 'compound_statement' || child.type === 'if_statement') {
             const nested = analyzeBlock(child, funcName);
             currentComplexity = nested.complexity;
             currentReason = nested.reason;
        }

        if (currentComplexity.compare(maxComplexity) > 0) {
            maxComplexity = currentComplexity;
            reason = currentReason;
            
            if (algo && maxComplexity.compare(baseComplexity) > 0) {
                 reason = `${algoName} combined with inner logic`;
            }
        }
        
        if (currentComplexity.isEstimate) {
            maxComplexity.isEstimate = true;
        }
    }
    
    return { complexity: maxComplexity, reason };
}

export function isLoop(node: any): boolean {
    return node.type === 'for_statement' || node.type === 'while_statement' || node.type === 'do_statement';
}

export function getFunctionCallComplexity(node: any): { complexity: Complexity, reason: string } {
    const text = node.text;
    
    if (text.includes('sort(') || text.includes('stable_sort(')) {
        return { complexity: new Complexity(1, 1), reason: `Call: sort (O(N log N))` };
    }
    if (text.includes('lower_bound(') || text.includes('upper_bound(') || text.includes('binary_search(')) {
        return { complexity: new Complexity(0, 1), reason: `Call: binary search (O(log N))` };
    }
    if (text.includes('push_back(') || text.includes('pop_back(') || text.includes('max(') || text.includes('min(')) {
         return { complexity: new Complexity(0, 0), reason: `Call: O(1) op` };
    }

    if (text.match(/[a-zA-Z_]\w*\s*\(/)) {
         return { 
             complexity: new Complexity(0, 0, false, true),
             reason: `Call: Unknown function '${text.trim().split('(')[0]}'` 
         };
    }

    return { complexity: new Complexity(0, 0), reason: "Expression" };
}

export function getLoopComplexity(node: any): Complexity {
    if (node.type === 'for_statement') {
        const update = node.childForFieldName('update');
        if (update) {
            if (update.type === 'assignment_expression') {
                if (update.text.includes('*=') || update.text.includes('/=') || update.text.includes('>>=') || update.text.includes('<<=')) {
                    return new Complexity(0, 1);
                }
            }
        }
    } else if (node.type === 'while_statement') {
        const body = node.childForFieldName('body');
        if (body) {
            if (body.text.includes('*=') || body.text.includes('/=') || body.text.includes('>>=') || body.text.includes('<<=')) {
                return new Complexity(0, 1);
            }
        }
    }
    return new Complexity(1, 0);
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

    if (callCount === 0) return null;
    if (callCount >= 2) return "O(2^N)";
    if (hasDivision) return "O(log N)";
    if (hasSubtraction) return "O(N)";
    return "O(N)"; 
}

export function getStructureSignature(node: any): string {
    let signature = "";
    const traverse = (currentNode: any) => {
        if (currentNode.type === 'identifier' || currentNode.type === 'number_literal') {
            signature += '#';
        } else {
            signature += currentNode.type + '|';
        }
        if (currentNode.children) {
            for (const child of currentNode.children) {
                traverse(child);
            }
        }
    };
    traverse(node);
    return signature;
}