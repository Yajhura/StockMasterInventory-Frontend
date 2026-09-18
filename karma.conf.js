/**
 * Karma configuration for Angular 17.3 headless Chrome on Windows.
 *
 * - ChromeHeadlessNoSandbox: required when running in CI / Docker where the
 *   root user or restricted namespaces prevent the default sandbox.
 * - Coverage is emitted under `coverage/stockmaster/` (relative to the
 *   project root). The Angular CLI also generates an `lcov.info` from
 *   this reporter when integrated via `--code-coverage`.
 * - `singleRun` is driven by the `--watch=false` Angular CLI flag; Karma
 *   itself keeps watching by default to support `npm run test:watch`.
 */

// Karma + Chrome sometimes need an explicit CHROME_BIN on Windows hosts
// where PATH does not expose the browser. Default to the install path
// documented for this environment.
if (!process.env.CHROME_BIN) {
  process.env.CHROME_BIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {
        // Deterministic order makes failure diffs reproducible in CI logs.
        random: false,
      },
      // Keep Jasmine spec runner output visible while debugging in dev.
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/stockmaster'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcovonly' },
      ],
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--headless=new',
        ],
      },
    },
    restartOnFileChange: true,
  });
};