import type { 
  CodeGenerator, 
  CompileResult,
  PolicyBlock,
  Claim,
  LanguageInfo,
  ValidationResult,
} from "../types";

interface BlockMap {
  [id: string]: PolicyBlock;
}

/**
 * C# Code Generator for Forseti/Ork authorization policies
 * Translates visual policy blocks into C# code that implements IAccessPolicy
 */
export class CSharpGenerator implements CodeGenerator {
  getLanguageInfo(): LanguageInfo {
    return {
      id: "csharp",
      name: "C#",
      version: "12.0",
      fileExtension: ".cs",
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

    const hasExplicitReturn = codeLines.some(line => line.includes("return PolicyDecision"));

    let defaultReturn = "";
    if (!hasExplicitReturn) {
      defaultReturn = `        
        // Default: Deny access if no rules matched
        return PolicyDecision.Deny("No matching rules");`;
    }

    return `using Ork.Forseti.Sdk;
using Ork.Shared.Models.Contracts;

public sealed class GeneratedPolicy : IAccessPolicy
{
    public PolicyDecision Authorize(AccessContext ctx)
    {
${codeLines.join("\n")}${defaultReturn}
    }
}`;
  }

  generateDescription(blocks: PolicyBlock[]): string {
    if (blocks.length === 0) {
      return "No policy rules defined. Access will be denied by default.";
    }

    const blockMap = this.buildBlockMap(blocks);
    const rootBlocks = this.getRootBlocks(blocks);

    const allDescriptions: string[] = [];
    rootBlocks.forEach(block => {
      allDescriptions.push(...this.generateBlockDescription(block, blockMap));
    });

    if (allDescriptions.length === 0) {
      return "No valid rules configured.";
    }

    return allDescriptions.join("\n");
  }

  validateCode(code: string): ValidationResult {
    const errors: string[] = [];

    if (!code.trim()) {
      errors.push("Policy code is empty");
      return { valid: false, errors };
    }

    // Basic syntax checks
    if (!code.includes("IAccessPolicy")) {
      errors.push("Policy must implement IAccessPolicy interface");
    }

    if (!code.includes("PolicyDecision")) {
      errors.push("Policy must return a PolicyDecision");
    }

    if (!code.includes("Authorize")) {
      errors.push("Policy must implement Authorize method");
    }

    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push("Mismatched braces in code");
    }

    return { valid: errors.length === 0, errors };
  }

  async compile(
    mode: "simple" | "advanced",
    blocks?: PolicyBlock[],
    code?: string,
    _claims?: Claim[]
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
          errors: ["Enter C# policy code to compile"],
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
        message: "C# policy validated successfully",
        generatedCode: code,
      };
    }
  }

  // Private helper methods

  private generateEmptyPolicy(): string {
    return `using Ork.Forseti.Sdk;
using Ork.Shared.Models.Contracts;

public sealed class GeneratedPolicy : IAccessPolicy
{
    public PolicyDecision Authorize(AccessContext ctx)
    {
        // No blocks configured
        return PolicyDecision.Deny("No policy rules defined");
    }
}`;
  }

  private buildBlockMap(blocks: PolicyBlock[]): BlockMap {
    const map: BlockMap = {};
    blocks.forEach(block => {
      map[block.id] = block;
    });
    return map;
  }

  private getRootBlocks(blocks: PolicyBlock[]): PolicyBlock[] {
    const childIds = new Set<string>();

    blocks.forEach(block => {
      if (block.thenBlocks) {
        block.thenBlocks.forEach(id => childIds.add(id));
      }
      if (block.elseBlocks) {
        block.elseBlocks.forEach(id => childIds.add(id));
      }
      if (block.children) {
        block.children.forEach(id => childIds.add(id));
      }
    });

    return blocks.filter(block => !childIds.has(block.id)).sort((a, b) => a.order - b.order);
  }

  private escapeCSharpString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private generateConditionExpression(block: PolicyBlock, suffix: string = ""): string | null {
    const { field, operator, value } = block.config;
    if (!field) return null;

    const operatorMap: Record<string, string> = {
      equals: "==",
      not_equals: "!=",
      greater_than: ">",
      less_than: "<",
    };

    const op = operatorMap[operator] || "==";
    const valueStr = this.escapeCSharpString(value || "");
    const varName = field.replace(/\./g, "_") + suffix;

    if (operator === "contains") {
      return `ctx.Claims.TryGetParameter<string>("${field}", out var ${varName}) && ${varName}.Contains("${valueStr}")`;
    } else if (operator === "not_contains") {
      return `ctx.Claims.TryGetParameter<string>("${field}", out var ${varName}) && !${varName}.Contains("${valueStr}")`;
    } else {
      return `ctx.Claims.TryGetParameter<string>("${field}", out var ${varName}) && ${varName} ${op} "${valueStr}"`;
    }
  }

  private generateBooleanExpression(block: PolicyBlock, blockMap: BlockMap, suffix: string = ""): string | null {
    if (block.type === "condition") {
      return this.generateConditionExpression(block, suffix);
    }

    if (block.type === "logic_and") {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      const conditions = children
        .filter(child => child.type === "condition")
        .map((child, idx) => this.generateConditionExpression(child, `${suffix}_and${idx}`))
        .filter(Boolean);
      
      if (conditions.length > 0) {
        return conditions.join(" && ");
      }
      return null;
    }

    if (block.type === "logic_or") {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      const conditions = children
        .filter(child => child.type === "condition")
        .map((child, idx) => this.generateConditionExpression(child, `${suffix}_or${idx}`))
        .filter(Boolean);
      
      if (conditions.length > 0) {
        return conditions.join(" || ");
      }
      return null;
    }

    if (block.type === "logic_not") {
      const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
      if (children.length > 0 && children[0].type === "condition") {
        const condition = this.generateConditionExpression(children[0], `${suffix}_not`);
        if (condition) {
          return `!(${condition})`;
        }
      }
      return null;
    }

    return null;
  }

  private generateBlockCode(
    block: PolicyBlock,
    blockMap: BlockMap,
    indent: number = 2
  ): string {
    const indentStr = "    ".repeat(indent);
    const lines: string[] = [];

    switch (block.type) {
      case "condition": {
        const { field, operator, value } = block.config;
        if (!field) {
          lines.push(`${indentStr}// Incomplete condition block`);
          return lines.join("\n");
        }

        lines.push(`${indentStr}// Check: ${field} ${operator} ${value || "..."}`);
        break;
      }

      case "if_else": {
        const description = block.config.description || "Decision";
        
        lines.push(`${indentStr}// ${description}`);

        const thenBlocks = block.thenBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
        const elseBlocks = block.elseBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
        
        const firstBlock = thenBlocks.find(b => 
          b.type === "condition" || b.type === "logic_and" || b.type === "logic_or" || b.type === "logic_not"
        );
        
        if (!firstBlock) {
          lines.push(`${indentStr}// WARNING: No condition specified - executing If branch unconditionally!`);
          if (thenBlocks.length > 0) {
            thenBlocks.forEach(childBlock => {
              lines.push(this.generateBlockCode(childBlock, blockMap, indent));
            });
          }
        } else {
          const booleanExpr = this.generateBooleanExpression(firstBlock, blockMap);
          
          if (!booleanExpr) {
            lines.push(`${indentStr}// Incomplete condition - missing required fields`);
            return lines.join("\n");
          }

          lines.push(`${indentStr}if (${booleanExpr})`);
          lines.push(`${indentStr}{`);

          const actionBlocks = thenBlocks.filter(b => b.id !== firstBlock.id);
          if (actionBlocks.length > 0) {
            actionBlocks.forEach(childBlock => {
              lines.push(this.generateBlockCode(childBlock, blockMap, indent + 1));
            });
          } else {
            lines.push(`${indentStr}    // If: no action specified`);
          }

          lines.push(`${indentStr}}`);

          if (elseBlocks.length > 0) {
            lines.push(`${indentStr}else`);
            lines.push(`${indentStr}{`);
            elseBlocks.forEach(childBlock => {
              lines.push(this.generateBlockCode(childBlock, blockMap, indent + 1));
            });
            lines.push(`${indentStr}}`);
          }
        }

        break;
      }

      case "action_allow": {
        lines.push(`${indentStr}return PolicyDecision.Allow();`);
        break;
      }

      case "action_deny": {
        const message = block.config.message || "Access denied";
        lines.push(`${indentStr}return PolicyDecision.Deny("${message}");`);
        break;
      }
    }

    return lines.join("\n");
  }

  private generateBlockDescription(
    block: PolicyBlock,
    blockMap: BlockMap,
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

        const opTextMap: Record<string, string> = {
          equals: "equals",
          not_equals: "does not equal",
          contains: "contains",
          not_contains: "does not contain",
          greater_than: "is greater than",
          less_than: "is less than",
        };
        const opText = opTextMap[operator as string] || "equals";

        descriptions.push(`${prefix}Check if ${field} ${opText} "${value || "..."}"`);
        break;
      }

      case "if_else": {
        const description = block.config.description || "Decision";
        
        const thenBlocks = block.thenBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
        const elseBlocks = block.elseBlocks?.map(id => blockMap[id]).filter(Boolean) || [];
        
        const conditionOrLogicBlock = thenBlocks.find(b => 
          b.type === "condition" || b.type === "logic_and" || b.type === "logic_or" || b.type === "logic_not"
        );
        
        let conditionText = "";
        if (conditionOrLogicBlock) {
          if (conditionOrLogicBlock.type === "condition" && conditionOrLogicBlock.config.field) {
            const { field, operator, value } = conditionOrLogicBlock.config;
            const opTextMap: Record<string, string> = {
              equals: "equals",
              not_equals: "does not equal",
              contains: "contains",
              not_contains: "does not contain",
              greater_than: "is greater than",
              less_than: "is less than",
            };
            const opText = opTextMap[operator as string] || "equals";
            conditionText = `If ${field} ${opText} "${value || "..."}"`;
          } else if (conditionOrLogicBlock.type === "logic_and") {
            conditionText = "If all conditions are met";
          } else if (conditionOrLogicBlock.type === "logic_or") {
            conditionText = "If any condition is met";
          } else if (conditionOrLogicBlock.type === "logic_not") {
            conditionText = "If condition is NOT met";
          }
        }
        
        descriptions.push(`${prefix}${conditionText || description}:`);
        
        const thenActionBlocks = thenBlocks.filter(b => 
          b.type !== "condition" && b.type !== "logic_and" && b.type !== "logic_or" && b.type !== "logic_not"
        );
        
        if (thenActionBlocks.length > 0) {
          thenActionBlocks.forEach(child => {
            descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
          });
        } else {
          descriptions.push(`${prefix}  (no action specified)`);
        }
        
        if (elseBlocks.length > 0) {
          descriptions.push(`${prefix}Otherwise:`);
          elseBlocks.forEach(child => {
            descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
          });
        }

        break;
      }

      case "logic_and": {
        const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
        if (children.length > 0) {
          descriptions.push(`${prefix}All of these conditions must be true:`);
          children.forEach(child => {
            descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
          });
        } else {
          descriptions.push(`${prefix}AND (no conditions)`);
        }
        break;
      }

      case "logic_or": {
        const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
        if (children.length > 0) {
          descriptions.push(`${prefix}At least one of these conditions must be true:`);
          children.forEach(child => {
            descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
          });
        } else {
          descriptions.push(`${prefix}OR (no conditions)`);
        }
        break;
      }

      case "logic_not": {
        const children = block.children?.map(id => blockMap[id]).filter(Boolean) || [];
        if (children.length > 0) {
          descriptions.push(`${prefix}NOT (invert):`);
          children.forEach(child => {
            descriptions.push(...this.generateBlockDescription(child, blockMap, prefix + "  "));
          });
        } else {
          descriptions.push(`${prefix}NOT (no condition)`);
        }
        break;
      }

      case "action_allow":
        descriptions.push(`${prefix}✓ Allow access${block.config.message ? `: ${block.config.message}` : ""}`);
        break;

      case "action_deny":
        descriptions.push(`${prefix}✗ Deny access${block.config.message ? `: ${block.config.message}` : ""}`);
        break;
    }

    return descriptions;
  }
}
