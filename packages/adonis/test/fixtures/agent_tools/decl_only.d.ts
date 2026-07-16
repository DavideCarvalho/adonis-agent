// A declaration-only file next to the tool. `discoverTools` must SKIP it (it ends in `.d.ts`),
// otherwise it would try to import a module with no runtime value.
export type NotATool = { nope: true };
