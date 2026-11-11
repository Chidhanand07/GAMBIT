"""Per-file metrics for Python sources, printed as JSON for metrics.js.

Complexity is McCabe-style: 1 + if/elif, for, while, except, conditional
expressions, comprehension filters, and each extra operand of and/or.
Nested functions are measured on their own.
"""
import ast
import json
import sys

FUNCTION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef)
BRANCH_NODES = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.IfExp, ast.ExceptHandler)


def complexity(fn):
    score = 1
    stack = list(ast.iter_child_nodes(fn))
    while stack:
        node = stack.pop()
        if isinstance(node, FUNCTION_NODES + (ast.Lambda,)):
            continue
        if isinstance(node, BRANCH_NODES):
            score += 1
        elif isinstance(node, ast.BoolOp):
            score += len(node.values) - 1
        elif isinstance(node, ast.comprehension):
            score += len(node.ifs)
        stack.extend(ast.iter_child_nodes(node))
    return score


def analyse(path):
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    tree = ast.parse(text)
    functions = [
        {
            "name": node.name,
            "line": node.lineno,
            "lines": node.end_lineno - node.lineno + 1,
            "complexity": complexity(node),
        }
        for node in ast.walk(tree)
        if isinstance(node, FUNCTION_NODES)
    ]
    return {"lines": len(text.splitlines()), "functions": functions, "anyCount": 0}


if __name__ == "__main__":
    print(json.dumps({path: analyse(path) for path in sys.argv[1:]}))
