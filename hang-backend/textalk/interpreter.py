#!/usr/bin/env python3
"""
Text to LaTeX Finite-State Transducer (FST) Compiler
=====================================================

A rule-based interpreter that converts natural language mathematical expressions
to LaTeX using finite-state transducer principles.

Usage:
    from compiler import MathFST
    
    compiler = MathFST()
    latex = compiler.compile("the integral from zero to infinity of x squared dx")
    print(latex)  # \int_{0}^{\infty} x^2 \, dx

Architecture:
    1. Tokenizer: Breaks input into mathematical tokens
    2. Parser: Recognizes mathematical patterns and structures
    3. FST: State machine that builds LaTeX incrementally
    4. Generator: Outputs properly formatted LaTeX
"""

import re
import enum
from typing import List, Dict, Tuple, Optional, Union
from dataclasses import dataclass
from collections import deque


class TokenType(enum.Enum):
    """Types of mathematical tokens"""
    # Basic tokens
    NUMBER = "number"
    VARIABLE = "variable" 
    FUNCTION = "function"
    OPERATOR = "operator"
    
    # Calculus
    INTEGRAL = "integral"
    DERIVATIVE = "derivative"
    PARTIAL = "partial"
    LIMIT = "limit"
    
    # Series and sequences
    SUM = "sum"
    PRODUCT = "product"
    SERIES = "series"
    SEQUENCE = "sequence"
    
    # Algebraic
    FRACTION = "fraction"
    POWER = "power"
    ROOT = "root"
    FACTORIAL = "factorial"
    ABSOLUTE = "absolute"
    
    # Functions
    TRIG = "trigonometric"
    INVERSE_TRIG = "inverse_trig"
    HYPERBOLIC = "hyperbolic"
    LOG = "logarithm"
    EXPONENTIAL = "exponential"
    
    # Linear algebra
    MATRIX = "matrix"
    VECTOR = "vector"
    DETERMINANT = "determinant"
    TRANSPOSE = "transpose"
    INVERSE = "inverse"
    DOT_PRODUCT = "dot_product"
    CROSS_PRODUCT = "cross_product"
    MAGNITUDE = "magnitude"
    NORM = "norm"
    
    # Set theory
    SET = "set"
    UNION = "union"
    INTERSECTION = "intersection"
    SUBSET = "subset"
    ELEMENT = "element"
    
    # Logic
    AND = "and"
    OR = "or"
    NOT = "not"
    IMPLIES = "implies"
    IFF = "iff"
    THEREFORE = "therefore"
    BECAUSE = "because"
    QED = "qed"
    
    # Comparisons
    LESS_THAN = "less_than"
    GREATER_THAN = "greater_than"
    LESS_EQUAL = "less_equal"
    GREATER_EQUAL = "greater_equal"
    NOT_EQUAL = "not_equal"
    APPROXIMATELY = "approximately"
    
    # Geometry
    ANGLE = "angle"
    PARALLEL = "parallel"
    PERPENDICULAR = "perpendicular"
    CONGRUENT = "congruent"
    SIMILAR = "similar"
    
    # Statistics
    PROBABILITY = "probability"
    EXPECTED_VALUE = "expected_value"
    VARIANCE = "variance"
    STANDARD_DEVIATION = "standard_deviation"
    
    # Constants
    INFINITY = "infinity"
    PI = "pi"
    E = "e"
    
    # Structural
    BRACKET = "bracket"
    FROM = "from"
    TO = "to"
    OF = "of"
    EQUALS = "equals"
    APPROACHES = "approaches"
    DIFFERENTIAL = "differential"
    WITH_RESPECT_TO = "with_respect_to"
    SUCH_THAT = "such_that"
    FOR_ALL = "for_all"
    EXISTS = "exists"
    AS = "as"
    IS_POSITIVE = "is_positive"
    IS_NEGATIVE = "is_negative"
    IS_ZERO = "is_zero"
    IS_NONZERO = "is_nonzero"
    IS_EVEN = "is_even"
    IS_ODD = "is_odd"
    IS_PRIME = "is_prime"
    IS_REAL = "is_real"
    IS_INTEGER = "is_integer"
    
    UNKNOWN = "unknown"


@dataclass
class Token:
    """Mathematical token with type and value"""
    type: TokenType
    value: str
    original: str
    position: int


class MathTokenizer:
    """Tokenizes natural language mathematical expressions"""
    
    def __init__(self):
        # Pattern definitions for mathematical constructs
        self.patterns = {
            # Calculus patterns
            TokenType.INTEGRAL: [
                r'\b(?:integral|integrate|integration)\b',
                r'\b(?:double integral|triple integral)\b',
                r'\bint\b'
            ],
            
            TokenType.DERIVATIVE: [
                r'\b(?:derivative|differentiate|diff)\b',
                r'\b(?:first derivative|second derivative|nth derivative)\b',
                r'\bd/dx\b', r'\bdy/dx\b'
            ],
            
            TokenType.PARTIAL: [
                r'\b(?:partial derivative|partial)\b',
                r'\b∂\b'
            ],
            
            TokenType.LIMIT: [
                r'\b(?:limit|lim)\b'
            ],
            
            # Series and sequences
            TokenType.SUM: [
                r'\b(?:sum|summation|sigma)\b',
                r'\b(?:infinite sum)\b'
            ],
            
            TokenType.PRODUCT: [
                r'\b(?:product|multiplication)\b',
                r'\b(?:infinite product)\b'
            ],
            
            TokenType.SERIES: [
                r'\b(?:series|power series|taylor series|fourier series)\b'
            ],
            
            TokenType.SEQUENCE: [
                r'\b(?:sequence|arithmetic sequence|geometric sequence)\b'
            ],
            
            # Algebraic operations
            TokenType.FRACTION: [
                r'\b(?:over|divided by|fraction|ratio)\b',
                r'/'
            ],
            
            TokenType.POWER: [
                r'\b(?:power|exponent|raised to|squared|cubed)\b',
                r'\b(?:to the power of)\b',
                r'\b(?:to the .* power)\b',
                r'\^'
            ],
            
            TokenType.ROOT: [
                r'\b(?:square root|cube root|nth root|root|sqrt|radical)\b'
            ],
            
            TokenType.FACTORIAL: [
                r'\b(?:factorial|!)\b'
            ],
            
            TokenType.ABSOLUTE: [
                r'\b(?:absolute value|modulus|abs)\b',
                r'\|.*\|'
            ],
            
            # Functions - Trigonometric
            TokenType.TRIG: [
                r'\b(?:sin|sine|cos|cosine|tan|tangent)\b',
                r'\b(?:sec|secant|csc|cosecant|cot|cotangent)\b'
            ],
            
            TokenType.INVERSE_TRIG: [
                r'\b(?:arcsin|arccos|arctan|arcsec|arccsc|arccot)\b',
                r'\b(?:asin|acos|atan|asec|acsc|acot)\b',
                r'\b(?:inverse sine|inverse cosine|inverse tangent)\b'
            ],
            
            TokenType.HYPERBOLIC: [
                r'\b(?:sinh|cosh|tanh|sech|csch|coth)\b',
                r'\b(?:hyperbolic sine|hyperbolic cosine|hyperbolic tangent)\b'
            ],
            
            # Logarithmic and exponential
            TokenType.LOG: [
                r'\b(?:log|logarithm|ln|natural log|log base)\b',
                r'\b(?:common log|binary log)\b'
            ],
            
            TokenType.EXPONENTIAL: [
                r'\b(?:exp|exponential)\b',
                r'\b(?:exponential of)\b',
                r'\b(?:e to the power)\b'
            ],
            
            # Linear algebra
            TokenType.MATRIX: [
                r'\b(?:matrix|matrices)\b'
            ],
            
            TokenType.VECTOR: [
                r'\b(?:vector|vectors)\b'
            ],
            
            TokenType.DETERMINANT: [
                r'\b(?:determinant|det)\b'
            ],
            
            TokenType.TRANSPOSE: [
                r'\b(?:transpose|transposed)\b'
            ],
            
            TokenType.INVERSE: [
                r'\b(?:inverse|inverted)\b'
            ],
            
            TokenType.DOT_PRODUCT: [
                r'\b(?:dot product|scalar product|inner product|·)\b'
            ],
            
            TokenType.CROSS_PRODUCT: [
                r'\b(?:cross product|vector product|×)\b'
            ],
            
            TokenType.MAGNITUDE: [
                r'\b(?:magnitude|length|modulus)\b'
            ],
            
            TokenType.NORM: [
                r'\b(?:norm|euclidean norm|2-norm)\b'
            ],
            
            # Set theory
            TokenType.SET: [
                r'\b(?:set|subset|superset)\b'
            ],
            
            TokenType.UNION: [
                r'\b(?:union|∪)\b'
            ],
            
            TokenType.INTERSECTION: [
                r'\b(?:intersection|∩)\b'
            ],
            
            TokenType.ELEMENT: [
                r'\b(?:element of|in|∈|belongs to)\b'
            ],
            
            # Logic
            TokenType.AND: [
                r'\b(?:and|∧|logical and)\b'
            ],
            
            TokenType.OR: [
                r'\b(?:or|∨|logical or)\b'
            ],
            
            TokenType.NOT: [
                r'\b(?:not|¬|logical not)\b'
            ],
            
            TokenType.IMPLIES: [
                r'\b(?:implies|→|if then)\b'
            ],
            
            TokenType.IFF: [
                r'\b(?:if and only if|iff|↔)\b'
            ],
            
            TokenType.THEREFORE: [
                r'\b(?:therefore|thus|hence|consequently|∴)\b'
            ],
            
            TokenType.BECAUSE: [
                r'\b(?:because|since|given that|∵)\b',
                r'\bas\b(?=\s+(?:of|that|this|it|we|they|you|I|he|she|we|it))'  # "as" only when followed by specific words
            ],
            
            TokenType.QED: [
                r'\b(?:qed|Q\.E\.D\.|quod erat demonstrandum|proved|proof complete)\b'
            ],
            
            # Comparisons
            TokenType.LESS_THAN: [
                r'\b(?:less than|<)\b'
            ],
            
            TokenType.GREATER_THAN: [
                r'\b(?:greater than|>)\b'
            ],
            
            TokenType.LESS_EQUAL: [
                r'\b(?:less than or equal|≤|<=)\b'
            ],
            
            TokenType.GREATER_EQUAL: [
                r'\b(?:greater than or equal|≥|>=)\b'
            ],
            
            TokenType.NOT_EQUAL: [
                r'\b(?:not equal|≠|!=)\b'
            ],
            
            TokenType.APPROXIMATELY: [
                r'\b(?:approximately|≈|~)\b',
                r'\b(?:approximately equal|approximately equal to)\b'
            ],
            
            # Geometry
            TokenType.ANGLE: [
                r'\b(?:angle|∠)\b'
            ],
            
            TokenType.PARALLEL: [
                r'\b(?:parallel|∥)\b'
            ],
            
            TokenType.PERPENDICULAR: [
                r'\b(?:perpendicular|⊥)\b'
            ],
            
            TokenType.CONGRUENT: [
                r'\b(?:congruent|≅)\b'
            ],
            
            TokenType.SIMILAR: [
                r'\b(?:similar|∼)\b'
            ],
            
            # Statistics
            TokenType.PROBABILITY: [
                r'\b(?:probability)\b',
                r'\bP(?=\()\b'  # Match P only when followed by opening parenthesis
            ],
            
            TokenType.EXPECTED_VALUE: [
                r'\b(?:expected value|expectation|E)\b'
            ],
            
            TokenType.VARIANCE: [
                r'\b(?:variance|Var)\b'
            ],
            
            TokenType.STANDARD_DEVIATION: [
                r'\b(?:standard deviation|std dev|σ)\b'
            ],
            
            # Constants
            TokenType.INFINITY: [
                r'\b(?:infinity|inf|∞)\b'
            ],
            
            TokenType.PI: [
                r'\b(?:pi|π)\b'
            ],
            
            TokenType.E: [
                r'\b(?:e|euler)\b'
            ],
            
            # Basic operators
            TokenType.OPERATOR: [
                r'\b(?:plus|add|addition|\+)\b',
                r'\b(?:minus|subtract|subtraction|\-)\b',
                r'\b(?:times|multiply|multiplication|\*|×)\b',
                r'\b(?:divided by|division|÷)\b'
            ],
            
            # Structural elements
            TokenType.FROM: [r'\b(?:from)\b'],
            TokenType.TO: [r'\b(?:to)\b'],
            TokenType.OF: [r'\b(?:of)\b'],
            TokenType.EQUALS: [r'\b(?:equals|equal to)\b', r'='],
            TokenType.APPROACHES: [r'\b(?:approaches|tends to|goes to)\b'],
            TokenType.WITH_RESPECT_TO: [r'\b(?:with respect to)\b'],
            TokenType.SUCH_THAT: [r'\b(?:such that|where|:)\b'],
            TokenType.FOR_ALL: [r'\b(?:for all|∀)\b'],
            TokenType.EXISTS: [r'\b(?:there exists|∃)\b'],
            
            # Special limit words
            TokenType.AS: [r'\b(?:as)\b'],
            
            # Natural language mathematical properties
            TokenType.IS_POSITIVE: [r'\b(?:is positive|is greater than zero)\b'],
            TokenType.IS_NEGATIVE: [r'\b(?:is negative|is less than zero)\b'],
            TokenType.IS_ZERO: [r'\b(?:is zero|equals zero)\b'],
            TokenType.IS_NONZERO: [r'\b(?:is nonzero|is non-zero|is not zero)\b'],
            TokenType.IS_EVEN: [r'\b(?:is even)\b'],
            TokenType.IS_ODD: [r'\b(?:is odd)\b'],
            TokenType.IS_PRIME: [r'\b(?:is prime)\b'],
            TokenType.IS_REAL: [r'\b(?:is real|is a real number)\b'],
            TokenType.IS_INTEGER: [r'\b(?:is an integer|is integer)\b'],
            
            # Variables and numbers
            TokenType.VARIABLE: [
                r'\b[a-zA-Z]\b',  # Single letters
                r'\b(?:theta|phi|alpha|beta|gamma|delta|epsilon|zeta|eta|lambda|mu|nu|xi|rho|sigma|tau|upsilon|chi|psi|omega)\b',  # Greek letters
                r'\b(?:Theta|Phi|Alpha|Beta|Gamma|Delta|Lambda|Mu|Pi|Sigma|Omega)\b'  # Capital Greek
            ],
            
            TokenType.NUMBER: [
                r'\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b',
                r'\b(?:thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b',
                r'\b\d+(?:\.\d+)?\b'
            ],
            
            # Differentials
            TokenType.DIFFERENTIAL: [
                r'\bd[a-zA-Z]\b',  # dx, dy, dz, etc.
                r'\b∂[a-zA-Z]\b'   # ∂x, ∂y, etc.
            ],
            
            # Brackets and delimiters
            TokenType.BRACKET: [
                r'[\(\)\[\]\{\}]',
                r'\|.*\|'  # absolute value bars
            ]
        }
        
        # Compile all patterns
        self.compiled_patterns = {}
        for token_type, patterns in self.patterns.items():
            self.compiled_patterns[token_type] = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    
    def tokenize(self, text: str) -> List[Token]:
        """Tokenize mathematical text into tokens"""
        tokens = []
        words = text.lower().split()
        position = 0
        
        i = 0
        while i < len(words):
            word = words[i]
            matched = False
            
            # Special handling for "e to the power of x"
            if (i + 4 < len(words) and 
                words[i] == 'e' and words[i+1] == 'to' and words[i+2] == 'the' and 
                words[i+3] == 'power' and words[i+4] == 'of'):
                tokens.append(Token(TokenType.VARIABLE, 'e', 'e', position))
                tokens.append(Token(TokenType.POWER, '^', 'to the power of', position))
                i += 5
                matched = True
            # Special handling for "exponential of negative"
            elif (i + 2 < len(words) and 
                  words[i] == 'exponential' and words[i+1] == 'of' and words[i+2] == 'negative'):
                tokens.append(Token(TokenType.EXPONENTIAL, r'\exp(-', 'exponential of negative', position))
                i += 3
                matched = True
            else:
                # Try to match multi-word patterns first
                for length in range(5, 0, -1):  # Try up to 5 words
                    if i + length <= len(words):
                        phrase = ' '.join(words[i:i+length])
                        token_type = self._match_phrase(phrase)
                        if token_type != TokenType.UNKNOWN:
                            # Special handling for properties to include the variable
                            if token_type in [TokenType.IS_POSITIVE, TokenType.IS_NEGATIVE, TokenType.IS_ZERO, 
                                            TokenType.IS_NONZERO, TokenType.IS_EVEN, TokenType.IS_ODD,
                                            TokenType.IS_PRIME, TokenType.IS_REAL, TokenType.IS_INTEGER]:
                                # Don't include variable in the token value, handle separately
                                tokens.append(Token(token_type, self._convert_to_latex_value(token_type, phrase), phrase, position))
                            else:
                                tokens.append(Token(token_type, self._convert_to_latex_value(token_type, phrase), phrase, position))
                            i += length
                            matched = True
                            break
            
            if not matched:
                # Single word matching
                token_type = self._match_word(word)
                tokens.append(Token(token_type, self._convert_to_latex_value(token_type, word), word, position))
                i += 1
            
            position += 1
        
        return tokens
    
    def _match_phrase(self, phrase: str) -> TokenType:
        """Match a phrase against token patterns"""
        for token_type, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                if pattern.fullmatch(phrase):
                    return token_type
        return TokenType.UNKNOWN
    
    def _match_word(self, word: str) -> TokenType:
        """Match a single word against token patterns"""
        for token_type, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                if pattern.fullmatch(word):
                    return token_type
        return TokenType.UNKNOWN
    
    def _convert_to_latex_value(self, token_type: TokenType, text: str) -> str:
        """Convert token text to LaTeX representation"""
        conversions = {
            # Numbers
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
            'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
            'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20',
            'thirty': '30', 'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
            'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000', 'million': '1000000',
            
            # Constants
            'infinity': r'\infty', 'inf': r'\infty', '∞': r'\infty',
            'pi': r'\pi', 'π': r'\pi',
            'e': 'e', 'euler': 'e',
            
            # Greek letters (lowercase)
            'alpha': r'\alpha', 'beta': r'\beta', 'gamma': r'\gamma', 'delta': r'\delta',
            'epsilon': r'\epsilon', 'zeta': r'\zeta', 'eta': r'\eta', 'theta': r'\theta',
            'lambda': r'\lambda', 'mu': r'\mu', 'nu': r'\nu', 'xi': r'\xi',
            'rho': r'\rho', 'sigma': r'\sigma', 'tau': r'\tau', 'upsilon': r'\upsilon',
            'phi': r'\phi', 'chi': r'\chi', 'psi': r'\psi', 'omega': r'\omega',
            
            # Greek letters (uppercase)
            'Alpha': r'\Alpha', 'Beta': r'\Beta', 'Gamma': r'\Gamma', 'Delta': r'\Delta',
            'Lambda': r'\Lambda', 'Mu': r'\Mu', 'Pi': r'\Pi', 'Sigma': r'\Sigma',
            'Theta': r'\Theta', 'Phi': r'\Phi', 'Omega': r'\Omega',
            
            # Trigonometric functions
            'sin': r'\sin', 'sine': r'\sin', 'cos': r'\cos', 'cosine': r'\cos',
            'tan': r'\tan', 'tangent': r'\tan', 'sec': r'\sec', 'secant': r'\sec',
            'csc': r'\csc', 'cosecant': r'\csc', 'cot': r'\cot', 'cotangent': r'\cot',
            
            # Inverse trigonometric
            'arcsin': r'\arcsin', 'asin': r'\arcsin', 'inverse sine': r'\arcsin',
            'arccos': r'\arccos', 'acos': r'\arccos', 'inverse cosine': r'\arccos',
            'arctan': r'\arctan', 'atan': r'\arctan', 'inverse tangent': r'\arctan',
            'arcsec': r'\arcsec', 'arccsc': r'\arccsc', 'arccot': r'\arccot',
            
            # Hyperbolic functions
            'sinh': r'\sinh', 'hyperbolic sine': r'\sinh',
            'cosh': r'\cosh', 'hyperbolic cosine': r'\cosh',
            'tanh': r'\tanh', 'hyperbolic tangent': r'\tanh',
            'sech': r'\sech', 'csch': r'\csch', 'coth': r'\coth',
            
            # Logarithmic and exponential
            'ln': r'\ln', 'natural log': r'\ln', 'log': r'\log',
            'common log': r'\log', 'binary log': r'\log_2',
            'exp': r'\exp', 'exponential': r'\exp',
            'exponential of': r'\exp',
            
            # Basic operators
            'plus': '+', 'add': '+', 'addition': '+',
            'minus': '-', 'subtract': '-', 'subtraction': '-',
            'times': r'\cdot', 'multiply': r'\cdot', 'multiplication': r'\cdot',
            'divided by': r'\div', 'division': r'\div',
            'equals': '=', 'equal to': '=',
            
            # Comparison operators
            'less than': '<', 'greater than': '>',
            'less than or equal': r'\leq', '≤': r'\leq', '<=': r'\leq',
            'greater than or equal': r'\geq', '≥': r'\geq', '>=': r'\geq',
            'not equal': r'\neq', '≠': r'\neq', '!=': r'\neq',
            'approximately': r'\approx', '≈': r'\approx', '~': r'\approx',
            'approximately equal': r'\approx', 'approximately equal to': r'\approx',
            
            # Set theory
            'union': r'\cup', '∪': r'\cup',
            'intersection': r'\cap', '∩': r'\cap',
            'element of': r'\in', 'in': r'\in', '∈': r'\in', 'belongs to': r'\in',
            'subset': r'\subset', 'superset': r'\supset',
            
            # Logic
            'and': r'\land', '∧': r'\land', 'logical and': r'\land',
            'or': r'\lor', '∨': r'\lor', 'logical or': r'\lor',
            'not': r'\neg', '¬': r'\neg', 'logical not': r'\neg',
            'implies': r'\rightarrow', '→': r'\rightarrow', 'if then': r'\rightarrow',
            'if and only if': r'\leftrightarrow', 'iff': r'\leftrightarrow', '↔': r'\leftrightarrow',
            'for all': r'\forall', '∀': r'\forall',
            'there exists': r'\exists', '∃': r'\exists',
            'therefore': r'\therefore', 'thus': r'\therefore', 'hence': r'\therefore', 
            'consequently': r'\therefore', '∴': r'\therefore',
            'because': r'\because', 'since': r'\because', 'given that': r'\because', '∵': r'\because',
            'qed': r'\blacksquare', 'Q.E.D.': r'\blacksquare', 'quod erat demonstrandum': r'\blacksquare',
            'proved': r'\blacksquare', 'proof complete': r'\blacksquare',
            
            # Natural language mathematical properties
            'is positive': ' > 0', 'is greater than zero': ' > 0',
            'is negative': ' < 0', 'is less than zero': ' < 0',
            'is zero': ' = 0', 'equals zero': ' = 0',
            'is nonzero': r' \neq 0', 'is non-zero': r' \neq 0', 'is not zero': r' \neq 0',
            'is even': r' \in 2\mathbb{Z}', 'is odd': r' \in 2\mathbb{Z} + 1',
            'is prime': r' \in \mathbb{P}', 'is real': r' \in \mathbb{R}',
            'is an integer': r' \in \mathbb{Z}', 'is integer': r' \in \mathbb{Z}',
            'is a real number': r' \in \mathbb{R}',
            
            # Geometry
            'angle': r'\angle', '∠': r'\angle',
            'parallel': r'\parallel', '∥': r'\parallel',
            'perpendicular': r'\perp', '⊥': r'\perp',
            'congruent': r'\cong', '≅': r'\cong',
            'similar': r'\sim', '∼': r'\sim',
            
            # Linear algebra
            'matrix': r'\begin{matrix}', 'vector': r'\vec',
            'determinant': r'\det', 'det': r'\det',
            'transpose': r'^T', 'inverse': r'^{-1}',
            'dot product': r'\cdot', 'scalar product': r'\cdot', 'inner product': r'\langle \cdot, \cdot \rangle',
            'cross product': r'\times', 'vector product': r'\times',
            'magnitude': r'\|\cdot\|', 'length': r'\|\cdot\|', 'modulus': r'\|\cdot\|',
            'norm': r'\|\cdot\|', 'euclidean norm': r'\|\cdot\|_2', '2-norm': r'\|\cdot\|_2',
            
            # Statistics
            'probability': 'P', 'expected value': 'E', 'expectation': 'E',
            'variance': r'\text{Var}', 'standard deviation': r'\sigma',
            
            # Calculus
            'partial': r'\partial', '∂': r'\partial',
            'differential': 'd',
            
            # Powers and roots
            'squared': '^2', 'cubed': '^3',
            'to the power of': '^', 'power': '^',
            'square root': r'\sqrt', 'sqrt': r'\sqrt',
            'cube root': r'\sqrt[3]', 'nth root': r'\sqrt[n]',
            'factorial': '!',
            'absolute value': r'\left|', 'abs': r'\left|', 'modulus': r'\left|'
        }
        
        return conversions.get(text.lower(), text)


class State(enum.Enum):
    """FST states for mathematical expression parsing"""
    INITIAL = "initial"
    EXPECTING_FUNCTION = "expecting_function"
    EXPECTING_BOUNDS = "expecting_bounds"
    EXPECTING_INTEGRAND = "expecting_integrand"
    EXPECTING_DIFFERENTIAL = "expecting_differential"
    EXPECTING_POWER = "expecting_power"
    EXPECTING_DENOMINATOR = "expecting_denominator"
    EXPECTING_ARGUMENT = "expecting_argument"
    COMPLETE = "complete"


class MathFST:
    """Finite-State Transducer for converting text to LaTeX"""
    
    def __init__(self):
        self.tokenizer = MathTokenizer()
        self.reset()
    
    def reset(self):
        """Reset the FST to initial state"""
        self.state = State.INITIAL
        self.output_stack = []
        self.context_stack = []
        self.current_bounds = {}
        self.limit_pending = False
        
    def compile(self, text: str) -> str:
        """Main compilation function"""
        self.reset()
        tokens = self.tokenizer.tokenize(text)
        
        for token in tokens:
            self._process_token(token)
        
        # Finalize any open constructs
        self._finalize()
        
        return self._generate_latex()
    
    def _process_token(self, token: Token):
        """Process a single token based on current state"""
        # Calculus
        if token.type == TokenType.INTEGRAL:
            self._handle_integral(token)
        elif token.type == TokenType.DERIVATIVE:
            self._handle_derivative(token)
        elif token.type == TokenType.PARTIAL:
            self._handle_partial(token)
        elif token.type == TokenType.LIMIT:
            self._handle_limit(token)
        
        # Series and sequences
        elif token.type == TokenType.SUM:
            self._handle_sum(token)
        elif token.type == TokenType.PRODUCT:
            self._handle_product(token)
        elif token.type == TokenType.SERIES:
            self._handle_series(token)
        
        # Algebraic operations
        elif token.type == TokenType.FRACTION:
            self._handle_fraction(token)
        elif token.type == TokenType.POWER:
            self._handle_power(token)
        elif token.type == TokenType.ROOT:
            self._handle_root(token)
        elif token.type == TokenType.FACTORIAL:
            self._handle_factorial(token)
        elif token.type == TokenType.ABSOLUTE:
            self._handle_absolute(token)
        
        # Functions
        elif token.type in [TokenType.TRIG, TokenType.INVERSE_TRIG, TokenType.HYPERBOLIC, 
                           TokenType.LOG, TokenType.EXPONENTIAL]:
            self._handle_function(token)
        
        # Constants (but handle PI as operand if in bounds context)
        elif token.type in [TokenType.PI, TokenType.E]:
            if (self.state == State.EXPECTING_BOUNDS and self.context_stack and 
                self.context_stack[-1] == 'integral' and token.type == TokenType.PI):
                self._handle_operand(token)
            else:
                self._handle_constant(token)
        
        # Comparisons
        elif token.type in [TokenType.LESS_THAN, TokenType.GREATER_THAN, TokenType.LESS_EQUAL,
                           TokenType.GREATER_EQUAL, TokenType.NOT_EQUAL, TokenType.APPROXIMATELY]:
            self._handle_comparison(token)
        
        # Logic
        elif token.type in [TokenType.AND, TokenType.OR, TokenType.NOT, TokenType.IMPLIES, TokenType.IFF,
                           TokenType.THEREFORE, TokenType.BECAUSE, TokenType.QED]:
            self._handle_logic(token)
        
        # Set theory
        elif token.type in [TokenType.UNION, TokenType.INTERSECTION, TokenType.ELEMENT]:
            self._handle_set_operation(token)
        
        # Linear algebra
        elif token.type in [TokenType.MATRIX, TokenType.VECTOR, TokenType.DETERMINANT, 
                           TokenType.TRANSPOSE, TokenType.INVERSE, TokenType.DOT_PRODUCT,
                           TokenType.CROSS_PRODUCT, TokenType.MAGNITUDE, TokenType.NORM]:
            self._handle_linear_algebra(token)
        
        # Geometry
        elif token.type in [TokenType.ANGLE, TokenType.PARALLEL, TokenType.PERPENDICULAR,
                           TokenType.CONGRUENT, TokenType.SIMILAR]:
            self._handle_geometry(token)
        
        # Statistics
        elif token.type in [TokenType.PROBABILITY, TokenType.EXPECTED_VALUE, TokenType.VARIANCE,
                           TokenType.STANDARD_DEVIATION]:
            self._handle_statistics(token)
        
        # Structural elements
        elif token.type == TokenType.FROM:
            self._handle_from(token)
        elif token.type == TokenType.TO:
            self._handle_to(token)
        elif token.type == TokenType.OF:
            self._handle_of(token)
        elif token.type == TokenType.APPROACHES:
            self._handle_approaches(token)
        elif token.type == TokenType.AS:
            self._handle_as(token)
            # Explicitly return without adding to output to prevent 'as' from appearing
            return
        elif token.type == TokenType.EQUALS:
            self._handle_equals(token)
        elif token.type == TokenType.DIFFERENTIAL:
            self._handle_differential(token)
        elif token.type == TokenType.WITH_RESPECT_TO:
            self._handle_with_respect_to(token)
        elif token.type in [TokenType.SUCH_THAT, TokenType.FOR_ALL, TokenType.EXISTS]:
            self._handle_quantifier(token)
        elif token.type in [TokenType.IS_POSITIVE, TokenType.IS_NEGATIVE, TokenType.IS_ZERO, 
                           TokenType.IS_NONZERO, TokenType.IS_EVEN, TokenType.IS_ODD,
                           TokenType.IS_PRIME, TokenType.IS_REAL, TokenType.IS_INTEGER]:
            self._handle_property(token)
        
        # Basic elements
        elif token.type in [TokenType.VARIABLE, TokenType.NUMBER, TokenType.INFINITY]:
            self._handle_operand(token)
        elif token.type == TokenType.OPERATOR:
            self._handle_operator(token)
        else:
            # Handle unknown tokens by passing them through with proper spacing
            # Skip common English words and limit-specific words that don't belong in LaTeX
            skip_words = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'defined', 'set', 'line', 'triangle']
            
            # For limits, also skip "as" 
            if (self.context_stack and self.context_stack[-1] == 'limit'):
                skip_words.extend(['as'])
            
            if token.original.lower() not in skip_words:
                self.output_stack.append(f' {token.value} ')
            # Skip common English words that don't belong in LaTeX
    
    def _handle_integral(self, token: Token):
        """Handle integral tokens"""
        self.output_stack.append(r'\int')
        self.context_stack.append('integral')
        self.state = State.INITIAL  # Start in initial state, wait for "from"
        self.current_bounds = {}
    
    def _handle_derivative(self, token: Token):
        """Handle derivative tokens"""
        self.output_stack.append(r'\frac{d}{dx}')
        self.context_stack.append('derivative')
        self.state = State.EXPECTING_FUNCTION
    
    def _handle_limit(self, token: Token):
        """Handle limit tokens"""
        self.output_stack.append(r'\lim')
        self.context_stack.append('limit')
        self.state = State.INITIAL  # Start in initial state, wait for "as"
        self.current_bounds = {}
        self.limit_pending = True  # Flag to track that we need to process limit bounds
    
    def _handle_sum(self, token: Token):
        """Handle summation tokens"""
        self.output_stack.append(r'\sum')
        self.context_stack.append('sum')
        self.state = State.EXPECTING_BOUNDS
        self.current_bounds = {}
    
    def _handle_fraction(self, token: Token):
        """Handle fraction tokens"""
        if self.output_stack:
            # Move last element to numerator
            numerator = self.output_stack.pop()
            self.output_stack.append(f'\\frac{{{numerator}}}{{')
            self.context_stack.append('fraction')
            self.state = State.EXPECTING_DENOMINATOR
    
    def _handle_power(self, token: Token):
        """Handle power/exponent tokens"""
        if token.value in ['^2', '^3']:
            # Direct squared/cubed
            if self.output_stack:
                base = self.output_stack.pop()
                self.output_stack.append(f'{base}{token.value}')
        elif 'to the power of' in token.original.lower():
            # Handle "to the power of" pattern
            self.state = State.EXPECTING_POWER
        else:
            self.state = State.EXPECTING_POWER
    
    def _handle_root(self, token: Token):
        """Handle root tokens"""
        if 'square root' in token.original:
            self.output_stack.append(r'\sqrt{')
            self.context_stack.append('sqrt')
        else:
            self.output_stack.append(r'\sqrt[n]{')
            self.context_stack.append('nroot')
        self.state = State.EXPECTING_ARGUMENT
    
    def _handle_function(self, token: Token):
        """Handle function tokens (trig, log, etc.)"""
        if token.type == TokenType.EXPONENTIAL:
            if token.value.endswith('(-'):
                # Special case: "exponential of negative" already has opening
                self.output_stack.append(f'{token.value}')
                self.context_stack.append('function_partial_open')
            else:
                # Regular exponential function
                self.output_stack.append(f'{token.value}(')
                self.context_stack.append('function_with_parens')
        else:
            self.output_stack.append(f'{token.value}')
            self.context_stack.append('function')
        self.state = State.EXPECTING_ARGUMENT
    
    def _handle_from(self, token: Token):
        """Handle 'from' in bounds"""
        if self.context_stack and self.context_stack[-1] == 'integral':
            # For integrals, "from" always means we're starting bounds
            self.state = State.EXPECTING_BOUNDS
            self.current_bounds['lower_ready'] = True
        elif self.state == State.EXPECTING_BOUNDS:
            self.current_bounds['lower_ready'] = True
    
    def _handle_to(self, token: Token):
        """Handle 'to' in bounds"""
        if self.state == State.EXPECTING_BOUNDS:
            self.current_bounds['upper_ready'] = True
    
    def _handle_of(self, token: Token):
        """Handle 'of' transition"""
        if self.context_stack and self.context_stack[-1] in ['integral', 'derivative', 'sqrt', 'nroot']:
            self.state = State.EXPECTING_INTEGRAND
        elif self.context_stack and self.context_stack[-1] in ['sum', 'product']:
            # For summations/products, "of" means we're done with bounds and ready for the summand
            self.state = State.EXPECTING_INTEGRAND
        elif self.context_stack and self.context_stack[-1] == 'limit':
            # For limits, "of" means we're done with bounds and ready for the function
            # Ensure bounds are applied if they haven't been yet
            if ('variable' in self.current_bounds and 'lower' in self.current_bounds and 
                self.output_stack and r'\lim' in self.output_stack):
                # Find the \lim token and check if it already has bounds
                for i, item in enumerate(self.output_stack):
                    if item == r'\lim':
                        # Apply bounds if not already applied
                        var = self.current_bounds.get('variable', 'x')
                        self.output_stack[i] = f"\\lim_{{{var} \\to {self.current_bounds['lower']}}}"
                        break
            self.state = State.EXPECTING_INTEGRAND
    
    def _handle_as(self, token: Token):
        """Handle 'as' in limits"""
        if self.context_stack and self.context_stack[-1] == 'limit':
            self.state = State.EXPECTING_BOUNDS
            # Clear any existing bounds to start fresh
            self.current_bounds = {}
            # Don't add 'as' to output - it's handled by context
            return  # Explicitly return to prevent 'as' from being added
        # Don't add 'as' to output - it's handled by context
        return
    
    def _handle_approaches(self, token: Token):
        """Handle 'approaches' in limits"""
        if self.context_stack and self.context_stack[-1] == 'limit':
            self.state = State.EXPECTING_BOUNDS
            self.current_bounds['approaches'] = True
            # Don't add 'approaches' to output - it's handled by context
            return
    
    def _handle_equals(self, token: Token):
        """Handle 'equals' in bounds (especially for summations and products)"""
        if self.state == State.EXPECTING_BOUNDS and self.context_stack and self.context_stack[-1] in ['sum', 'product']:
            # For summation/product bounds like "i equals 1"
            self.current_bounds['equals_ready'] = True
        else:
            # Handle as regular operator in other contexts
            self.output_stack.append(' = ')
    
    def _handle_differential(self, token: Token):
        """Handle differential (dx, dy, etc.)"""
        if token.original.startswith('d'):
            var = token.original[1:]  # Extract variable
            self.output_stack.append(f'\\, d{var}')
            self.state = State.COMPLETE
    
    def _handle_operand(self, token: Token):
        """Handle variables and numbers"""
        if self.state == State.EXPECTING_BOUNDS:
            if self.context_stack and self.context_stack[-1] == 'sum':
                # For summation: handle "i equals 1 to n"
                if not self.current_bounds.get('variable'):
                    self.current_bounds['variable'] = token.value
                elif self.current_bounds.get('equals_ready'):
                    self.current_bounds['lower'] = token.value
                    self.current_bounds['equals_ready'] = False
                elif self.current_bounds.get('upper_ready'):
                    self.current_bounds['upper'] = token.value
                    self.current_bounds['upper_ready'] = False
                    # Check if we have all bounds for summation
                    if 'variable' in self.current_bounds and 'lower' in self.current_bounds:
                        self._apply_bounds()
            elif self.context_stack and self.context_stack[-1] == 'product':
                # For products: handle "i equals 1 to n"
                if not self.current_bounds.get('variable'):
                    self.current_bounds['variable'] = token.value
                elif self.current_bounds.get('equals_ready'):
                    self.current_bounds['lower'] = token.value
                    self.current_bounds['equals_ready'] = False
                elif self.current_bounds.get('upper_ready'):
                    self.current_bounds['upper'] = token.value
                    self.current_bounds['upper_ready'] = False
                    # Check if we have all bounds for product
                    if 'variable' in self.current_bounds and 'lower' in self.current_bounds:
                        self._apply_bounds()
            elif self.context_stack and self.context_stack[-1] == 'limit':
                # For limits: handle "x approaches zero"
                if self.state == State.EXPECTING_BOUNDS:
                    if not self.current_bounds.get('variable'):
                        self.current_bounds['variable'] = token.value
                        return  # Don't add to output stack - it's used in bounds
                    elif self.current_bounds.get('approaches'):
                        # Convert token value to proper LaTeX if needed
                        bound_value = self.tokenizer._convert_to_latex_value(token.type, token.value)
                        self.current_bounds['lower'] = bound_value
                        self.current_bounds['approaches'] = False
                        self._apply_bounds()
                        self.state = State.EXPECTING_INTEGRAND  # Ready for the function after bounds
                        return  # Don't add to output stack - it's used in bounds
                    else:
                        # If we're in limit context but not expecting bounds, skip this token
                        return
            elif self.context_stack and self.context_stack[-1] == 'integral':
                # For integrals: handle "from 0 to infinity"
                if self.current_bounds.get('lower_ready'):
                    self.current_bounds['lower'] = token.value
                    self.current_bounds['lower_ready'] = False
                    return  # Don't add to output stack - it's used in bounds
                elif self.current_bounds.get('upper_ready'):
                    self.current_bounds['upper'] = token.value
                    self.current_bounds['upper_ready'] = False
                    # Apply bounds immediately when we have both
                    if 'lower' in self.current_bounds and 'upper' in self.current_bounds:
                        self._apply_bounds()
                    return  # Don't add to output stack - it's used in bounds
            else:
                # For other constructs
                if self.current_bounds.get('lower_ready'):
                    self.current_bounds['lower'] = token.value
                    self.current_bounds['lower_ready'] = False
                elif self.current_bounds.get('upper_ready'):
                    self.current_bounds['upper'] = token.value
                    self.current_bounds['upper_ready'] = False
                    self._apply_bounds()
        elif self.state == State.EXPECTING_POWER:
            if self.output_stack:
                base = self.output_stack.pop()
                if token.value in ['x', 'y', 'z'] or token.value.isdigit():
                    self.output_stack.append(f'{base}^{{{token.value}}}')
                else:
                    self.output_stack.append(f'{base}^{token.value}')
            else:
                # Handle cases like "e to the power of x"
                self.output_stack.append(f'^{{{token.value}}}')
            self.state = State.INITIAL
        elif self.state == State.EXPECTING_DENOMINATOR:
            self.output_stack[-1] += f'{token.value}}}'
            self.context_stack.pop()
            self.state = State.INITIAL
        elif self.state == State.EXPECTING_ARGUMENT:
            self._close_function_argument(token.value)
        else:
            # Special check: if we're in limit context and expecting bounds, don't add to output
            if (self.context_stack and self.context_stack[-1] == 'limit' and
                self.state == State.EXPECTING_BOUNDS):
                # This operand should have been handled in the limit bounds logic above
                # If we reach here, consume it silently as it's likely a bounds component
                return

            # Skip common English words that don't belong in LaTeX
            if token.original.lower() not in ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'defined', 'set', 'line', 'triangle', 'as']:
                self.output_stack.append(token.value)
    
    def _handle_operator(self, token: Token):
        """Handle mathematical operators"""
        self.output_stack.append(f' {token.value} ')
    
    # New handlers for expanded functionality
    def _handle_partial(self, token: Token):
        """Handle partial derivative tokens"""
        self.output_stack.append(r'\frac{\partial}{\partial x}')
        self.context_stack.append('partial')
        self.state = State.EXPECTING_FUNCTION
    
    def _handle_product(self, token: Token):
        """Handle product tokens"""
        self.output_stack.append(r'\prod')
        self.context_stack.append('product')
        self.state = State.EXPECTING_BOUNDS
        self.current_bounds = {}
    
    def _handle_series(self, token: Token):
        """Handle series tokens"""
        if 'taylor' in token.original.lower():
            self.output_stack.append(r'\sum_{n=0}^{\infty}')
        elif 'fourier' in token.original.lower():
            self.output_stack.append(r'\sum_{n=-\infty}^{\infty}')
        else:
            self.output_stack.append(r'\sum')
        self.context_stack.append('series')
    
    def _handle_factorial(self, token: Token):
        """Handle factorial tokens"""
        if self.output_stack:
            operand = self.output_stack.pop()
            self.output_stack.append(f'{operand}!')
        else:
            self.output_stack.append('!')
    
    def _handle_absolute(self, token: Token):
        """Handle absolute value tokens"""
        self.output_stack.append(r'\left|')
        self.context_stack.append('absolute')
        self.state = State.EXPECTING_ARGUMENT
    
    def _handle_constant(self, token: Token):
        """Handle mathematical constants"""
        self.output_stack.append(token.value)
    
    def _handle_comparison(self, token: Token):
        """Handle comparison operators"""
        self.output_stack.append(f' {token.value} ')
    
    def _handle_logic(self, token: Token):
        """Handle logical operations"""
        self.output_stack.append(f' {token.value} ')
    
    def _handle_set_operation(self, token: Token):
        """Handle set theory operations"""
        self.output_stack.append(f' {token.value} ')
    
    def _handle_linear_algebra(self, token: Token):
        """Handle linear algebra operations"""
        if token.type == TokenType.MATRIX:
            self.output_stack.append(r'\begin{pmatrix}')
            self.context_stack.append('matrix')
        elif token.type == TokenType.VECTOR:
            self.output_stack.append(r'\vec{')
            self.context_stack.append('vector')
            self.state = State.EXPECTING_ARGUMENT
        elif token.type == TokenType.DETERMINANT:
            self.output_stack.append(r'\det')
            self.state = State.EXPECTING_ARGUMENT
        elif token.type == TokenType.TRANSPOSE:
            if self.output_stack:
                base = self.output_stack.pop()
                self.output_stack.append(f'{base}^T')
        elif token.type == TokenType.INVERSE:
            if self.output_stack:
                base = self.output_stack.pop()
                self.output_stack.append(f'{base}^{{-1}}')
        elif token.type == TokenType.DOT_PRODUCT:
            self.output_stack.append(r' \cdot ')
        elif token.type == TokenType.CROSS_PRODUCT:
            self.output_stack.append(r' \times ')
        elif token.type == TokenType.MAGNITUDE or token.type == TokenType.NORM:
            if 'inner product' in token.original.lower():
                self.output_stack.append(r'\langle ')
                self.context_stack.append('inner_product')
                self.state = State.EXPECTING_ARGUMENT
            else:
                self.output_stack.append(r'\|')
                self.context_stack.append('magnitude')
                self.state = State.EXPECTING_ARGUMENT
    
    def _handle_geometry(self, token: Token):
        """Handle geometric operations"""
        self.output_stack.append(token.value)
    
    def _handle_statistics(self, token: Token):
        """Handle statistical operations"""
        if token.type == TokenType.PROBABILITY:
            self.output_stack.append('P(')
            self.context_stack.append('probability')
            self.state = State.EXPECTING_ARGUMENT
        elif token.type == TokenType.EXPECTED_VALUE:
            self.output_stack.append('E[')
            self.context_stack.append('expected_value')
            self.state = State.EXPECTING_ARGUMENT
        else:
            self.output_stack.append(token.value)
    
    def _handle_with_respect_to(self, token: Token):
        """Handle 'with respect to' phrases"""
        # This usually modifies derivatives
        pass  # Implementation depends on context
    
    def _handle_quantifier(self, token: Token):
        """Handle quantifiers (for all, exists, such that)"""
        if token.type == TokenType.FOR_ALL:
            self.output_stack.append(r'\forall ')
        elif token.type == TokenType.EXISTS:
            self.output_stack.append(r'\exists ')
        elif token.type == TokenType.SUCH_THAT:
            self.output_stack.append(r' : ')
        else:
            self.output_stack.append(token.value)
    
    def _handle_property(self, token: Token):
        """Handle mathematical properties (is positive, is negative, etc.)"""
        self.output_stack.append(token.value)
    
    def _apply_bounds(self):
        """Apply bounds to current mathematical construct"""
        if self.context_stack and self.current_bounds:
            construct = self.context_stack[-1]
            
            if construct == 'integral' and 'lower' in self.current_bounds and 'upper' in self.current_bounds:
                # Replace \int with bounded integral
                for i in range(len(self.output_stack) - 1, -1, -1):  # Search backwards
                    if self.output_stack[i] == r'\int':
                        self.output_stack[i] = f"\\int_{{{self.current_bounds['lower']}}}^{{{self.current_bounds['upper']}}}"
                        break
            
            elif construct == 'limit' and 'lower' in self.current_bounds:
                # Add limit bounds - search more aggressively
                applied = False
                for i in range(len(self.output_stack) - 1, -1, -1):  # Search backwards
                    if self.output_stack[i] == r'\lim':
                        var = self.current_bounds.get('variable', 'x')
                        self.output_stack[i] = f"\\lim_{{{var} \\to {self.current_bounds['lower']}}}"
                        applied = True
                        self.limit_pending = False
                        break
                
                # If we couldn't find \lim, it might have been modified already
                if not applied:
                    for i in range(len(self.output_stack) - 1, -1, -1):
                        if r'\lim' in str(self.output_stack[i]):
                            # Already has bounds or is modified, skip
                            break
            
            elif construct == 'sum' and 'lower' in self.current_bounds and 'upper' in self.current_bounds:
                # Add summation bounds
                for i, elem in enumerate(self.output_stack):
                    if elem == r'\sum':
                        var = self.current_bounds.get('variable', 'i')
                        self.output_stack[i] = f"\\sum_{{{var}={self.current_bounds['lower']}}}^{{{self.current_bounds['upper']}}}"
                        break
            
            elif construct == 'product' and 'lower' in self.current_bounds and 'upper' in self.current_bounds:
                # Add product bounds
                for i, elem in enumerate(self.output_stack):
                    if elem == r'\prod':
                        var = self.current_bounds.get('variable', 'i')
                        self.output_stack[i] = f"\\prod_{{{var}={self.current_bounds['lower']}}}^{{{self.current_bounds['upper']}}}"
                        break
        
        self.current_bounds = {}
        self.state = State.EXPECTING_INTEGRAND
    
    def _close_function_argument(self, argument: str):
        """Close function argument with proper braces"""
        if self.context_stack:
            context = self.context_stack[-1]
            if context in ['sqrt', 'nroot']:
                self.output_stack.append(f'{argument}}}')
                self.context_stack.pop()
            elif context == 'function':
                # Check if the function needs parentheses
                if self.output_stack and self.output_stack[-1] in [r'\exp', r'\ln', r'\log']:
                    self.output_stack.append(f'({argument})')
                else:
                    self.output_stack.append(f' {argument}')
                self.context_stack.pop()
            elif context == 'function_with_parens':
                # Close function that already has opening parenthesis
                self.output_stack.append(f'{argument})')
                self.context_stack.pop()
            elif context == 'function_partial_open':
                # Special case for "exponential of negative" - argument and close
                self.output_stack.append(f'{argument})')
                self.context_stack.pop()
            elif context == 'magnitude':
                # Close magnitude notation
                self.output_stack.append(f'{argument}\\|')
                self.context_stack.pop()
            elif context == 'inner_product':
                # Handle inner product arguments (expecting two arguments)
                self.output_stack.append(f'{argument}, ')
                # Note: This is simplified - a full implementation would handle multiple arguments
                self.context_stack.pop()
            else:
                self.output_stack.append(f' {argument}')
        self.state = State.INITIAL
    
    def _finalize(self):
        """Finalize any unclosed constructs"""
        # Final check for limit bounds that haven't been applied
        if (self.limit_pending and 'limit' in self.context_stack and 
            'variable' in self.current_bounds and 'lower' in self.current_bounds):
            for i in range(len(self.output_stack) - 1, -1, -1):
                if self.output_stack[i] == r'\lim':
                    var = self.current_bounds.get('variable', 'x')
                    self.output_stack[i] = f"\\lim_{{{var} \\to {self.current_bounds['lower']}}}"
                    break
        
        while self.context_stack:
            context = self.context_stack.pop()
            if context == 'fraction':
                if self.output_stack and not self.output_stack[-1].endswith('}'):
                    self.output_stack[-1] += '}'
            elif context in ['sqrt', 'nroot']:
                # Close unclosed square root
                self.output_stack.append('}')
            elif context == 'function':
                # Functions without arguments are OK as-is
                pass
            elif context == 'function_with_parens':
                # Close unclosed function with parentheses
                self.output_stack.append(')')
            elif context == 'function_partial_open':
                # Close unclosed function_partial_open
                self.output_stack.append(')')
            elif context == 'absolute':
                # Close absolute value
                self.output_stack.append(r'\right|')
            elif context == 'vector':
                # Close vector notation
                self.output_stack.append('}')
            elif context == 'matrix':
                # Close matrix
                self.output_stack.append(r'\end{pmatrix}')
            elif context in ['probability', 'expected_value']:
                # Close probability or expected value
                if context == 'probability':
                    self.output_stack.append(')')
                else:
                    self.output_stack.append(']')
            elif context == 'magnitude':
                # Close magnitude/norm notation
                self.output_stack.append(r'\|')
            elif context == 'inner_product':
                # Close inner product notation
                self.output_stack.append(r'\rangle')
    
    def _generate_latex(self) -> str:
        """Generate final LaTeX output"""
        return ''.join(self.output_stack)

if __name__ == "__main__":
    # Simple test instead of interactive demo
    compiler = MathFST()
    test = 'the limit as n approaches infinity of 1 over n equals 0'
    result = compiler.compile(test)
    print(f'Input:  {test}')
    print(f'LaTeX:  {result}')
