/**
 * Node resolve hook for the strip-types harnesses: lets TS source files import
 * siblings without an extension ("./preprocess"), as Next's bundler does.
 * Usage: node --experimental-strip-types --import ./scripts/ts-register.mjs <script.ts>
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
