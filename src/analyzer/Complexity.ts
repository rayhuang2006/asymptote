export class Complexity {
    public n: number;
    public log: number;
    public isExp: boolean;
    public isEstimate: boolean;

    constructor(n: number = 0, log: number = 0, isExp: boolean = false, isEstimate: boolean = false) {
        this.n = n;
        this.log = log;
        this.isExp = isExp;
        this.isEstimate = isEstimate;
    }

    static fromString(s: string): Complexity {
        if (s.includes('2^N')) return new Complexity(0, 0, true);
        if (s.includes('N^2')) return new Complexity(2, 0);
        if (s.includes('N log N')) return new Complexity(1, 1);
        if (s.includes('log N')) return new Complexity(0, 1);
        if (s.includes('O(N)')) return new Complexity(1, 0);
        if (s.includes('O(1)')) return new Complexity(0, 0);
        if (s.includes('N')) return new Complexity(1, 0);
        return new Complexity(0, 0);
    }

    multiply(other: Complexity): Complexity {
        if (this.isExp || other.isExp) {
            return new Complexity(0, 0, true, this.isEstimate || other.isEstimate);
        }
        return new Complexity(
            this.n + other.n, 
            this.log + other.log, 
            false, 
            this.isEstimate || other.isEstimate
        );
    }

    compare(other: Complexity): number {
        if (this.isExp && !other.isExp) return 1;
        if (!this.isExp && other.isExp) return -1;
        if (this.isExp && other.isExp) return 0;

        if (this.n !== other.n) {
            return this.n - other.n;
        }
        return this.log - other.log;
    }

    toString(): string {
        let baseStr = "";
        if (this.isExp) baseStr = "2ᴺ";
        else if (this.n === 0 && this.log === 0) baseStr = "1";
        else {
            let parts = [];
            if (this.n > 0) {
                if (this.n === 1) parts.push("N");
                else parts.push(`N${this.toSuperscript(this.n)}`);
            }
            if (this.log > 0) {
                if (this.log === 1) parts.push("log N");
                else parts.push(`(log N)${this.toSuperscript(this.log)}`);
            }
            baseStr = parts.join(' ');
        }

        const suffix = this.isEstimate ? " (?)" : "";
        return `O( ${baseStr} )${suffix}`;
    }

    private toSuperscript(num: number): string {
        const superscripts: { [key: string]: string } = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        };
        return num.toString().split('').map(char => superscripts[char] || char).join('');
    }
}