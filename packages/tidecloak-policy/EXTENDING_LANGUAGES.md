# Extending with New Languages

This guide shows you how to add support for new programming languages to the Policy Builder. We'll walk through creating a Python code generator as an example.

## Table of Contents

- [Overview](#overview)
- [Step-by-Step Guide](#step-by-step-guide)
- [Complete Example: Python Generator](#complete-example-python-generator)
- [Testing Your Generator](#testing-your-generator)
- [Advanced Topics](#advanced-topics)

## Overview

The Policy Builder uses a **pluggable generator system** that allows you to add support for any programming language. Each generator is responsible for:

1. **Translating visual blocks** into target language code
2. **Generating plain English descriptions** of policies
3. **Validating code** written in the target language
4. **Compiling policies** (orchestrating translation and validation)

### Architecture

```
┌──────────────────────────────────────┐
│    CodeGenerator Interface           │
│  (shared/generators.ts)              │
└──────────────────────────────────────┘
           ▲          ▲          ▲
           │          │          │
     ┌─────┴─────┐   │   ┌──────┴──────┐
     │  CSharp   │   │   │   Python    │
     │ Generator │   │   │  Generator  │
     │ (Built-in)│   │   │  (Custom)   │
     └───────────┘   │   └─────────────┘
                     │
              ┌──────┴──────┐
              │    Java     │
              │  Generator  │
              │  (Custom)   │
              └─────────────┘

All registered in: server/lib/generators/registry.ts
```

## Step-by-Step Guide

### Step 1: Create Generator Class

Create a new file in `server/lib/generators/` for your language:

```typescript
// server/lib/generators/PythonGenerator.ts
import type { 
  CodeGenerator, 
  LanguageInfo, 
  ValidationResult 
} from "@shared/generators";
import type { PolicyBlock, Claim, CompileResult } from "@shared/schema";

export class PythonGenerator implements CodeGenerator {
  getLanguageInfo(): LanguageInfo {
    return {
      id: "python",
      name: "Python",
      version: "3.11",
      fileExtension: ".py",
      supportsValidation: true,
    };
  }

  translateBlocks(blocks: PolicyBlock[]): string {
    // TODO: Implement block-to-Python translation
    return "";
  }

  generateDescription(blocks: PolicyBlock[]): string {
    // TODO: Implement plain English description
    return "";
  }

  validateCode(code: string): ValidationResult {
    // TODO: Implement Python code validation
    return { valid: true, errors: [] };
  }

  async compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    claims?: Claim[]
  ): Promise<CompileResult> {
    // TODO: Orchestrate compilation
    return { success: false, message: "Not implemented" };
  }
}
```

### Step 2: Implement `translateBlocks()`

This is the core method that converts visual blocks to code.

**Key Concepts:**
- Traverse the block tree depth-first
- Generate code recursively for each block type
- Maintain proper indentation
- Handle special cases (empty blocks, invalid config)

**Example Structure:**

```typescript
translateBlocks(blocks: PolicyBlock[]): string {
  if (blocks.length === 0) {
    return this.generateEmptyPolicy();
  }

  const blockMap = this.buildBlockMap(blocks);
  const rootBlocks = this.getRootBlocks(blocks);

  const codeLines: string[] = [];
  rootBlocks.forEach(block => {
    codeLines.push(this.generateBlockCode(block, blockMap, 1));
  });

  return this.wrapInBoilerplate(codeLines.join("\n"));
}
```

**Helper Methods:**

```typescript
private buildBlockMap(blocks: PolicyBlock[]): { [id: string]: PolicyBlock } {
  const map: { [id: string]: PolicyBlock } = {};
  blocks.forEach(block => {
    map[block.id] = block;
  });
  return map;
}

private getRootBlocks(blocks: PolicyBlock[]): PolicyBlock[] {
  const blockMap = this.buildBlockMap(blocks);
  const childIds = new Set<string>();

  // Collect all child IDs
  blocks.forEach(block => {
    if (block.thenBlocks) block.thenBlocks.forEach(id => childIds.add(id));
    if (block.elseBlocks) block.elseBlocks.forEach(id => childIds.add(id));
    if (block.children) block.children.forEach(id => childIds.add(id));
  });

  // Root blocks are those not referenced as children
  return blocks.filter(block => !childIds.has(block.id))
                .sort((a, b) => a.order - b.order);
}
```

### Step 3: Implement Block Type Handlers

Handle each block type individually:

```typescript
private generateBlockCode(
  block: PolicyBlock,
  blockMap: { [id: string]: PolicyBlock },
  indent: number
): string {
  const indentStr = "    ".repeat(indent);
  const lines: string[] = [];

  switch (block.type) {
    case "condition": {
      const { field, operator, value } = block.config;
      if (!field) {
        lines.push(`${indentStr}# Incomplete condition`);
        return lines.join("\n");
      }

      // Generate condition check
      const condition = this.generateCondition(field, operator, value);
      lines.push(`${indentStr}# Check: ${field} ${operator} ${value}`);
      break;
    }

    case "if_else": {
      // Generate if/else statement
      const thenBlocks = block.thenBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
      const elseBlocks = block.elseBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
      
      // Find condition in thenBlocks
      const conditionBlock = thenBlocks.find(b => b.type === "condition");
      
      if (conditionBlock) {
        const condition = this.generateCondition(
          conditionBlock.config.field,
          conditionBlock.config.operator,
          conditionBlock.config.value
        );
        
        lines.push(`${indentStr}if ${condition}:`);
        
        // Generate If branch (skip condition block)
        const actionBlocks = thenBlocks.filter(b => b.id !== conditionBlock.id);
        if (actionBlocks.length > 0) {
          actionBlocks.forEach(child => {
            lines.push(this.generateBlockCode(child, blockMap, indent + 1));
          });
        } else {
          lines.push(`${indentStr}    pass`);
        }
        
        // Generate Else branch
        if (elseBlocks.length > 0) {
          lines.push(`${indentStr}else:`);
          elseBlocks.forEach(child => {
            lines.push(this.generateBlockCode(child, blockMap, indent + 1));
          });
        }
      }
      break;
    }

    case "action_allow": {
      lines.push(`${indentStr}return PolicyDecision.allow()`);
      break;
    }

    case "action_deny": {
      const message = block.config.message || "Access denied";
      lines.push(`${indentStr}return PolicyDecision.deny("${message}")`);
      break;
    }

    case "logic_and": {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      // Handle AND logic...
      break;
    }

    case "logic_or": {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      // Handle OR logic...
      break;
    }

    case "logic_not": {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      // Handle NOT logic...
      break;
    }
  }

  return lines.join("\n");
}
```

### Step 4: Implement Condition Generation

Generate language-specific condition expressions:

```typescript
private generateCondition(
  field: string,
  operator: string,
  value: string
): string {
  const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  
  switch (operator) {
    case "equals":
      return `context.claims.get("${field}") == "${escapedValue}"`;
    case "not_equals":
      return `context.claims.get("${field}") != "${escapedValue}"`;
    case "contains":
      return `"${escapedValue}" in context.claims.get("${field}", "")`;
    case "not_contains":
      return `"${escapedValue}" not in context.claims.get("${field}", "")`;
    case "greater_than":
      return `context.claims.get("${field}") > ${value}`;
    case "less_than":
      return `context.claims.get("${field}") < ${value}`;
    default:
      return `context.claims.get("${field}") == "${escapedValue}"`;
  }
}
```

### Step 5: Implement Code Validation

Validate code written directly in advanced mode:

```typescript
validateCode(code: string): ValidationResult {
  const errors: string[] = [];

  if (!code.trim()) {
    errors.push("Policy code is empty");
    return { valid: false, errors };
  }

  // Python-specific checks
  if (!code.includes("def authorize")) {
    errors.push("Policy must define an 'authorize' function");
  }

  if (!code.includes("return PolicyDecision")) {
    errors.push("Policy must return a PolicyDecision");
  }

  // Check indentation (Python requirement)
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && line.match(/^\s+/) && !line.match(/^(    |\t)+/)) {
      errors.push(`Line ${i + 1}: Invalid indentation (use 4 spaces or tabs)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### Step 6: Implement Plain English Generation

Create human-readable descriptions:

```typescript
generateDescription(blocks: PolicyBlock[]): string {
  if (blocks.length === 0) {
    return "No policy rules defined. Access will be denied by default.";
  }

  const blockMap = this.buildBlockMap(blocks);
  const rootBlocks = this.getRootBlocks(blocks);

  const descriptions: string[] = [];
  rootBlocks.forEach(block => {
    descriptions.push(...this.generateBlockDescription(block, blockMap));
  });

  return descriptions.join("\n");
}

private generateBlockDescription(
  block: PolicyBlock,
  blockMap: { [id: string]: PolicyBlock },
  prefix: string = ""
): string[] {
  const descriptions: string[] = [];

  switch (block.type) {
    case "condition": {
      const { field, operator, value } = block.config;
      if (!field) {
        descriptions.push(`${prefix}Check a condition`);
        return descriptions;
      }

      const opText = {
        equals: "equals",
        not_equals: "does not equal",
        contains: "contains",
        not_contains: "does not contain",
        greater_than: "is greater than",
        less_than: "is less than",
      }[operator] || "equals";

      descriptions.push(`${prefix}Check if ${field} ${opText} "${value || "..."}"`);
      break;
    }

    case "if_else": {
      const thenBlocks = block.thenBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
      const elseBlocks = block.elseBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
      
      const conditionBlock = thenBlocks.find(b => b.type === "condition");
      
      if (conditionBlock) {
        const { field, operator, value } = conditionBlock.config;
        descriptions.push(`${prefix}If ${field} ${operator} "${value}":`);
      } else {
        descriptions.push(`${prefix}Decision:`);
      }

      // Process If branch
      const actionBlocks = thenBlocks.filter(b => b.type !== "condition");
      actionBlocks.forEach(child => {
        descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
      });

      // Process Else branch
      if (elseBlocks.length > 0) {
        descriptions.push(`${prefix}Otherwise:`);
        elseBlocks.forEach(child => {
          descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
        });
      }
      break;
    }

    case "action_allow":
      descriptions.push(`${prefix}✓ Allow access`);
      break;

    case "action_deny":
      descriptions.push(`${prefix}✗ Deny access`);
      break;
  }

  return descriptions;
}
```

### Step 7: Implement Boilerplate

Wrap generated code in language-specific boilerplate:

```typescript
private wrapInBoilerplate(generatedCode: string): string {
  return `from policy import PolicyDecision, AccessContext

class GeneratedPolicy:
    def authorize(self, context: AccessContext) -> PolicyDecision:
${generatedCode}
        
        # Default: Deny access if no rules matched
        return PolicyDecision.deny("No matching rules")
`;
}

private generateEmptyPolicy(): string {
  return `from policy import PolicyDecision, AccessContext

class GeneratedPolicy:
    def authorize(self, context: AccessContext) -> PolicyDecision:
        # No blocks configured
        return PolicyDecision.deny("No policy rules defined")
`;
}
```

### Step 8: Implement Compile Method

Orchestrate the compilation process:

```typescript
async compile(
  mode: "simple" | "advanced",
  blocks?: PolicyBlock[],
  code?: string,
  claims?: Claim[]
): Promise<CompileResult> {
  if (mode === "simple") {
    if (!blocks || blocks.length === 0) {
      return {
        success: false,
        message: "No policy blocks defined",
        errors: ["Add at least one block to your policy"],
      };
    }

    const generatedCode = this.translateBlocks(blocks);
    const plainEnglish = this.generateDescription(blocks);

    return {
      success: true,
      message: `Successfully compiled ${blocks.length} block${blocks.length !== 1 ? "s" : ""}`,
      generatedCode,
      plainEnglish,
    };
  } else {
    // Advanced mode
    if (!code || !code.trim()) {
      return {
        success: false,
        message: "No policy code provided",
        errors: ["Enter Python policy code to compile"],
      };
    }

    const validation = this.validateCode(code);

    if (!validation.valid) {
      return {
        success: false,
        message: "Code validation failed",
        errors: validation.errors,
      };
    }

    return {
      success: true,
      message: "Python policy validated successfully",
      generatedCode: code,
    };
  }
}
```

### Step 9: Register Generator

Register your generator in the server startup:

```typescript
// server/index.ts
import { generatorRegistry } from "./lib/generators/registry";
import { CSharpGenerator } from "./lib/generators/CSharpGenerator";
import { PythonGenerator } from "./lib/generators/PythonGenerator";

(async () => {
  // Register code generators
  generatorRegistry.register("csharp", new CSharpGenerator());
  generatorRegistry.register("python", new PythonGenerator());
  log("Registered C# and Python code generators");

  // ... rest of server setup
})();
```

### Step 10: Test Your Generator

Test the generator works correctly:

```typescript
// Test file
import { PythonGenerator } from './PythonGenerator';
import type { PolicyBlock } from '@shared/schema';

const generator = new PythonGenerator();

const testBlocks: PolicyBlock[] = [
  {
    id: "1",
    type: "if_else",
    config: { description: "Check environment" },
    order: 0,
    thenBlocks: ["2", "3"],
    elseBlocks: ["4"],
  },
  {
    id: "2",
    type: "condition",
    config: { field: "env", operator: "equals", value: "production" },
    order: 1,
  },
  {
    id: "3",
    type: "action_allow",
    config: { message: "Production access granted" },
    order: 2,
  },
  {
    id: "4",
    type: "action_deny",
    config: { message: "Non-production environment" },
    order: 3,
  },
];

const code = generator.translateBlocks(testBlocks);
console.log(code);

const description = generator.generateDescription(testBlocks);
console.log(description);
```

## Complete Example: Python Generator

Here's a complete, working Python generator:

<details>
<summary>Click to expand full implementation</summary>

```typescript
// server/lib/generators/PythonGenerator.ts
import type { 
  CodeGenerator, 
  LanguageInfo, 
  ValidationResult 
} from "@shared/generators";
import type { PolicyBlock, Claim, CompileResult } from "@shared/schema";

interface BlockMap {
  [id: string]: PolicyBlock;
}

export class PythonGenerator implements CodeGenerator {
  getLanguageInfo(): LanguageInfo {
    return {
      id: "python",
      name: "Python",
      version: "3.11",
      fileExtension: ".py",
      supportsValidation: true,
    };
  }

  translateBlocks(blocks: PolicyBlock[]): string {
    if (blocks.length === 0) {
      return this.generateEmptyPolicy();
    }

    const blockMap = this.buildBlockMap(blocks);
    const rootBlocks = this.getRootBlocks(blocks);

    const codeLines: string[] = [];
    rootBlocks.forEach(block => {
      codeLines.push(this.generateBlockCode(block, blockMap, 2));
    });

    const hasReturn = codeLines.some(line => line.includes("return PolicyDecision"));
    let defaultReturn = "";
    if (!hasReturn) {
      defaultReturn = `
        # Default: Deny if no rules matched
        return PolicyDecision.deny("No matching rules")`;
    }

    return `from policy import PolicyDecision, AccessContext

class GeneratedPolicy:
    def authorize(self, context: AccessContext) -> PolicyDecision:
${codeLines.join("\n")}${defaultReturn}
`;
  }

  generateDescription(blocks: PolicyBlock[]): string {
    if (blocks.length === 0) {
      return "No policy rules defined. Access will be denied by default.";
    }

    const blockMap = this.buildBlockMap(blocks);
    const rootBlocks = this.getRootBlocks(blocks);

    const descriptions: string[] = [];
    rootBlocks.forEach(block => {
      descriptions.push(...this.generateBlockDescription(block, blockMap));
    });

    return descriptions.length > 0 ? descriptions.join("\n") : "No valid rules configured.";
  }

  validateCode(code: string): ValidationResult {
    const errors: string[] = [];

    if (!code.trim()) {
      errors.push("Policy code is empty");
      return { valid: false, errors };
    }

    if (!code.includes("def authorize")) {
      errors.push("Policy must define an 'authorize' method");
    }

    if (!code.includes("PolicyDecision")) {
      errors.push("Policy must return a PolicyDecision");
    }

    return { valid: errors.length === 0, errors };
  }

  async compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    claims?: Claim[]
  ): Promise<CompileResult> {
    if (mode === "simple") {
      if (!blocks || blocks.length === 0) {
        return {
          success: false,
          message: "No policy blocks defined",
          errors: ["Add at least one block to your policy"],
        };
      }

      const generatedCode = this.translateBlocks(blocks);
      const plainEnglish = this.generateDescription(blocks);

      return {
        success: true,
        message: `Successfully compiled ${blocks.length} block${blocks.length !== 1 ? "s" : ""}`,
        generatedCode,
        plainEnglish,
      };
    } else {
      if (!code || !code.trim()) {
        return {
          success: false,
          message: "No policy code provided",
          errors: ["Enter Python policy code to compile"],
        };
      }

      const validation = this.validateCode(code);

      if (!validation.valid) {
        return {
          success: false,
          message: "Code validation failed",
          errors: validation.errors,
        };
      }

      return {
        success: true,
        message: "Python policy validated successfully",
        generatedCode: code,
      };
    }
  }

  // Private helper methods...
  // (Same as shown in step-by-step guide above)
}
```

</details>

## Testing Your Generator

### Unit Tests

```typescript
describe('PythonGenerator', () => {
  let generator: PythonGenerator;

  beforeEach(() => {
    generator = new PythonGenerator();
  });

  it('should generate valid Python code for simple policy', () => {
    const blocks: PolicyBlock[] = [/* ... */];
    const code = generator.translateBlocks(blocks);
    expect(code).toContain('def authorize');
    expect(code).toContain('PolicyDecision');
  });

  it('should validate correct Python code', () => {
    const validCode = `
from policy import PolicyDecision, AccessContext

class GeneratedPolicy:
    def authorize(self, context: AccessContext) -> PolicyDecision:
        return PolicyDecision.allow()
`;
    const result = generator.validateCode(validCode);
    expect(result.valid).toBe(true);
  });
});
```

### Integration Tests

Test through the API:

```bash
curl -X POST http://localhost:5000/api/policy/compile \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "ForsetiModel:1",
    "mode": "simple",
    "language": "python",
    "blocks": [/* ... */]
  }'
```

### E2E Tests

Test the complete flow in the UI.

## Advanced Topics

### Handling Complex Logic Operators

For AND/OR/NOT operators, you may need special handling:

```typescript
case "logic_and": {
  const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
  const conditions = children
    .filter(c => c.type === "condition")
    .map(c => this.generateCondition(c.config.field, c.config.operator, c.config.value));
  
  if (conditions.length > 0) {
    lines.push(`${indentStr}if ${conditions.join(" and ")}:`);
    lines.push(`${indentStr}    # All conditions must be true`);
    lines.push(`${indentStr}    pass`);
  }
  break;
}
```

### Language-Specific Features

Some languages have unique features you might want to leverage:

**Python:**
- List comprehensions
- Context managers
- Decorators

**Java:**
- Annotations
- Streams API
- Optional types

**Go:**
- Goroutines
- Defer statements
- Interfaces

Adapt your generator to use these features where appropriate.

### Error Handling

Add robust error handling:

```typescript
private generateBlockCode(block: PolicyBlock, blockMap: BlockMap, indent: number): string {
  try {
    // ... code generation logic
  } catch (error) {
    return `${" ".repeat(indent * 4)}# Error generating block: ${error.message}`;
  }
}
```

### Performance Optimization

For large policies:
- Cache block maps
- Use iterative algorithms instead of recursive where possible
- Minimize string concatenation

## Checklist

Before releasing your generator:

- [ ] Implements all methods in `CodeGenerator` interface
- [ ] Handles all block types (`condition`, `if_else`, `logic_and`, `logic_or`, `logic_not`, `action_allow`, `action_deny`)
- [ ] Generates valid, syntactically correct code
- [ ] Validates advanced mode code correctly
- [ ] Produces accurate plain English descriptions
- [ ] Handles edge cases (empty policies, incomplete blocks)
- [ ] Properly escapes strings and special characters
- [ ] Registered in `generatorRegistry`
- [ ] Unit tests written
- [ ] Integration tests pass
- [ ] Documentation updated

## Resources

- [CodeGenerator Interface](./shared/generators.ts)
- [C# Generator (Reference Implementation)](./server/lib/generators/CSharpGenerator.ts)
- [Generator Registry](./server/lib/generators/registry.ts)
- [Architecture Guide](./ARCHITECTURE.md)
- [API Reference](./API_REFERENCE.md)

## Support

For questions or issues:
1. Check existing generator implementations
2. Review architecture documentation
3. Ask in the project discussions

Happy coding! 🚀
