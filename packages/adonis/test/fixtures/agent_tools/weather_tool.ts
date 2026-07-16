import { z } from 'zod';
import { defineTool } from '../../../src/index.js';

/**
 * A fixture tool living in a `.ts` file — stands in for an app's `app/agent_tools/*.ts` in a dev /
 * ts-loader run. `discoverTools` must find and register it; the pre-fix scanner keyed its extension
 * gate off its OWN compiled `.js`, so it scanned this `.ts` directory for `.js` files and found none.
 */
export const fixtureWeather = defineTool(
  {
    name: 'fixtureWeather',
    kind: 'read',
    description: 'Fixture weather tool',
    input: z.object({ city: z.string() }),
  },
  async ({ city }: { city: string }) => ({ city, tempC: 20 }),
);
