const DISPOSITIONS = new Set([
  'NATIVE',
  'TRANSFORMED_EQUIVALENT',
  'TRANSFORMED_RESTRICTED',
  'PRESENT_BUT_INACTIVE',
  'LOCAL_SUBSTITUTE',
  'INCOMPATIBLE',
  'UNKNOWN_BLOCKED'
]);

export function resolvePortableCapability({ capability, destinationAdapter }) {
  const mapping = destinationAdapter?.capabilityMappings?.[capability.capabilityRef];
  if (!mapping) return {
    capabilityRef: capability.capabilityRef,
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    reason: 'NO_DECLARED_MAPPING'
  };
  if (!DISPOSITIONS.has(mapping.disposition)) throw new TypeError('invalid compatibility disposition');
  return {
    capabilityRef: capability.capabilityRef,
    disposition: mapping.disposition,
    destinationExpressionRef: mapping.destinationExpressionRef ?? null,
    changedProperties: mapping.changedProperties ?? [],
    reason: mapping.reason ?? null
  };
}
