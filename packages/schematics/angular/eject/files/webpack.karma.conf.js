/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

const path = require('path');

module.exports = function (config) {
  config.set({
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-webpack'),
      require('karma-sourcemap-loader'),
      require('@angular-devkit/build-karma/plugins/karma'),
    ],
    client: {
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    files: [
      <% if (polyfills) { %>path.join(__dirname, '<%= polyfills %>'),<% } %>
      path.join(__dirname, '<%= testMain %>'),
    ],
    preprocessors: {
      <% if (polyfills) { %>[path.join(__dirname, '<%= polyfills %>')]: ['webpack', 'sourcemap'],<% } %>
      [path.join(__dirname, '<%= testMain %>')]: ['webpack', 'sourcemap'],
    },
    // MIME types are needed when using TypeScript files.
    mime: {
      'text/x-typescript': ['ts', 'tsx']
    },
    reporters: [
      'progress',
      'kjhtml',
      '@angular-devkit/build-karma',
    ],
    webpack: require('./webpack.config.test.js'),
    browsers: ['Chrome'],
    singleRun: true
  });
};
