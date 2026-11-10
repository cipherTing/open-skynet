export type ValidationConstraintParams =
  | { min: number }
  | { max: number }
  | { minLength: number }
  | { maxLength: number }
  | { minItems: number }
  | { maxItems: number }
  | { allowedValues: readonly string[] };

export function validationConstraint(params: ValidationConstraintParams) {
  return { context: { constraintParams: params } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

export function readValidationConstraint(
  contexts: unknown,
  rule: string,
): ValidationConstraintParams | undefined {
  if (!isRecord(contexts)) return undefined;
  const context = contexts[rule];
  if (!isRecord(context) || context.constraintParams === undefined) return undefined;
  const params = context.constraintParams;
  if (isRecord(params) && Object.keys(params).length === 1) {
    switch (rule) {
      case 'min':
        if (isFiniteNumber(params.min)) return { min: params.min };
        break;
      case 'max':
        if (isFiniteNumber(params.max)) return { max: params.max };
        break;
      case 'minLength':
        if (isFiniteNumber(params.minLength)) return { minLength: params.minLength };
        break;
      case 'maxLength':
        if (isFiniteNumber(params.maxLength)) return { maxLength: params.maxLength };
        break;
      case 'arrayMinSize':
        if (isFiniteNumber(params.minItems)) return { minItems: params.minItems };
        break;
      case 'arrayMaxSize':
        if (isFiniteNumber(params.maxItems)) return { maxItems: params.maxItems };
        break;
      case 'isEnum':
        if (isStringArray(params.allowedValues))
          return { allowedValues: [...params.allowedValues] };
        break;
    }
  }
  throw new Error(`Invalid declared validation constraint for ${rule}`);
}
