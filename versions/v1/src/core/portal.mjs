const DISPOSITIONS = new Set([
  'NATIVE',
  'TRANSFORMED_EQUIVALENT',
  'TRANSFORMED_RESTRICTED',
  'PRESENT_BUT_INACTIVE',
  'LOCAL_SUBSTITUTE',
  'INCOMPATIBLE',
  'UNKNOWN_BLOCKED'
]);

function mappingFor(sourceRef, destinationAdapter) {
  return destinationAdapter?.portabilityMappings?.[sourceRef]
    ?? destinationAdapter?.capabilityMappings?.[sourceRef]
    ?? null;
}

function assertDisposition(mapping) {
  if (!DISPOSITIONS.has(mapping.disposition)) throw new TypeError('invalid compatibility disposition');
}

export function resolvePortableSemantic({ sourceRef, semanticType, destinationAdapter }) {
  if (typeof sourceRef !== 'string' || !sourceRef) throw new TypeError('sourceRef must be a non-empty string');
  if (typeof semanticType !== 'string' || !semanticType) throw new TypeError('semanticType must be a non-empty string');
  const mapping = mappingFor(sourceRef, destinationAdapter);
  if (!mapping) return {
    sourceRef,
    semanticType,
    destinationRef: destinationAdapter?.destinationRef ?? null,
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    changedProperties: [],
    reason: 'NO_DECLARED_MAPPING'
  };
  assertDisposition(mapping);
  return {
    sourceRef,
    semanticType,
    destinationRef: destinationAdapter?.destinationRef ?? null,
    disposition: mapping.disposition,
    destinationExpressionRef: mapping.destinationExpressionRef ?? null,
    changedProperties: mapping.changedProperties ?? [],
    reason: mapping.reason ?? null
  };
}

export function resolvePortableCapability({ capability, destinationAdapter }) {
  const mapping = mappingFor(capability.capabilityRef, destinationAdapter);
  if (!mapping) return {
    capabilityRef: capability.capabilityRef,
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    reason: 'NO_DECLARED_MAPPING'
  };
  assertDisposition(mapping);
  return {
    capabilityRef: capability.capabilityRef,
    disposition: mapping.disposition,
    destinationExpressionRef: mapping.destinationExpressionRef ?? null,
    changedProperties: mapping.changedProperties ?? [],
    reason: mapping.reason ?? null
  };
}
