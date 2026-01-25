export interface AlgorithmFingerprint {
    name: string;
    complexity: string;
    regex: RegExp;
}

export class AlgorithmRegistry {
    private static registry: AlgorithmFingerprint[] = [
        {
            name: "Binary Search Logic",
            complexity: "O(log N)",
            regex: /while_statement.*compound_statement.*(declaration|expression_statement).*if_statement/
        },
        {
            name: "Bubble Sort Logic",
            complexity: "O(N^2)",
            regex: /for_statement.*compound_statement.*for_statement.*compound_statement.*if_statement.*(expression_statement|declaration)/
        }
    ];

    static match(signature: string): AlgorithmFingerprint | null {
        for (const algo of this.registry) {
            if (algo.regex.test(signature)) {
                return algo;
            }
        }
        return null;
    }
}