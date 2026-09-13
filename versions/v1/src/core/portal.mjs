const DISPOSITIONS = new Set([
  'NATIVE',
  'TRANSFORMED_EQUIVALENT',
  'TRANSFORMED_RESTRICTED',
  'PRESENT_BUT_INACTIVE',
  'LOCAL_SUBSTITUTE',
  'INCOMPATIBLE',
  'UNKNOWN_BLOCKED'
]);

const PORTABLE_SEMANTIC_TYPES = new Set(['ITEM', 'ABILITY']);
const TRANSFORMED_DISPOSITIONS = new Set(['TRANSFORMED_EQUIVALENT', 'TRANSFORMED_RESTRICTED']);

function assertDisposition(mapping) {
  if (!DISPOSITIONS.has(mapping.disposition)) throw new TypeError('invalid compatibility disposition');
}

function assertPortableMappingEvidence(mapping) {
  assertDisposition(mapping);
  if (!Array.isArray(mapping.changedProperties)) throw new TypeError('portable mapping changedProperties must be an array');
  if (TRANSFORMED_DISPOSITIONS.has(mapping.disposition) && mapping.changedProperties.length === 0) {
    throw new TypeError('transformed portable mapping must declare changedProperties');
  }
  if (typeof mapping.reason !== 'string' || !mapping.reason) throw new TypeError('portable mapping reason must be a non-empty string');
  if (
    mapping.destinationExpressionRef !== undefined &&
    mapping.destinationExpressionRef !== null &&
    (typeof mapping.destinationExpressionRef !== 'string' || !mapping.destinationExpressionRef)
  ) {
    throw new TypeError('destinationExpressionRef must be null or a non-empty string');
  }
}

export function resolvePortableSemantic({ sourceRef, semanticType, destinationAdapter }) {
  if (typeof sourceRef !== 'string' || !sourceRef) throw new TypeError('sourceRef must be a non-empty string');
  if (!PORTABLE_SEMANTIC_TYPES.has(semanticType)) throw new TypeError('semanticType must be ITEM or ABILITY');
  if (typeof destinationAdapter?.destinationRef !== 'string' || !destinationAdapter.destinationRef) {
    throw new TypeError('destinationAdapter.destinationRef must be a non-empty string');
  }
  const mapping = destinationAdapter.portabilityMappings?.[sourceRef];
  if (!mapping) return {
    sourceRef,
    semanticType,
    destinationRef: destinationAdapter.destinationRef,
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    changedProperties: [],
    reason: 'NO_DECLARED_MAPPING'
  };
  assertPortableMappingEvidence(mapping);
  return {
    sourceRef,
    semanticType,
    destinationRef: destinationAdapter.destinationRef,
    disposition: mapping.disposition,
    destinationExpressionRef: mapping.destinationExpressionRef ?? null,
    changedProperties: mapping.changedProperties,
    reason: mapping.reason
  };
}

export function resolvePortableCapability({ capability, destinationAdapter }) {
  const mapping = destinationAdapter?.capabilityMappings?.[capability.capabilityRef];
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
