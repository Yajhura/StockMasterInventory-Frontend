/**
 * Angular 17 standalone test bootstrap.
 *
 * Loaded by `karma.conf.js` via the Angular CLI `test` architect target
 * (see `angular.json`). This entry point recursively pulls in every
 * `*.spec.ts` and framework shim used by the specs.
 *
 * Specs for this project use the Angular 17 standalone testing surface:
 *   - `TestBed.configureTestingModule({ imports: [Component] })` (no
 *     `declarations` array).
 *   - `provideHttpClient()` + `provideHttpClientTesting()` for HTTP
 *     specs (see AuthService / ApiVentasService specs).
 *   - `TestBed.runInInjectionContext(...)` to read signals from
 *     service providers without instantiating components.
 */

import 'zone.js';
import 'zone.js/testing';

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

declare const require: {
  context(
    path: string,
    deep?: boolean,
    filter?: RegExp
  ): {
    keys(): string[];
    <T>(id: string): T;
  };
};

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);

const context = require.context('./', true, /\.spec\.ts$/);
context.keys().forEach(context);