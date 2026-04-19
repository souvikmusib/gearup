/**
 * Simple Mustache-style template renderer.
 * Replaces {{variableName}} with values from the variables map.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}
