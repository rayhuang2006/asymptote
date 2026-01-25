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
            regex: /while_statement.*compound_statement.*declaration.*if_statement/
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