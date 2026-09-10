import { writeCompiledFirstGrove } from '../compiler/world-compiler.mjs';

const check = process.argv.includes('--check');
try {
  const { output } = await writeCompiledFirstGrove({ check });
  console.log(`${check ? 'CURRENT' : 'COMPILED'} ${output.packageRef}`);
  console.log(`fingerprint=${output.integrityFingerprint}`);
  console.log(`sources=${output.compiledFrom.length}`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
