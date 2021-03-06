/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { BuildEvent, Builder, BuilderContext, Target } from '@angular-devkit/architect';
import { getSystemPath } from '@angular-devkit/core';
import * as path from 'path';
import { Observable } from 'rxjs/Observable';
import * as ts from 'typescript'; // tslint:disable-line:no-implicit-dependencies
import {
  getCommonConfig,
  getDevConfig,
  getNonAotTestConfig,
  getStylesConfig,
  getTestConfig,
} from '../angular-cli-files/models/webpack-configs';
import { readTsconfig } from '../angular-cli-files/utilities/read-tsconfig';
import { requireProjectModule } from '../angular-cli-files/utilities/require-project-module';
import {
  AssetPattern,
  ExtraEntryPoint,
} from '../browser';
const webpackMerge = require('webpack-merge');


export interface KarmaBuilderOptions {
  main: string;
  tsConfig: string; // previously 'tsconfig'.
  karmaConfig: string; // previously 'config'.
  watch: boolean;
  codeCoverage: boolean;
  progress: boolean;
  preserveSymlinks?: boolean;

  // Options with no defaults.
  polyfills?: string;
  poll?: number;
  port?: number;
  browsers?: string;

  // A couple of options have different names.
  sourceMap: boolean; // previously 'sourcemaps'.

  // These options were not available as flags.
  assets: AssetPattern[];
  scripts: ExtraEntryPoint[];
  styles: ExtraEntryPoint[];
  stylePreprocessorOptions: { includePaths: string[] };

  // Some options are not needed anymore.
  // app?: string; // apps aren't used with build facade
  // singleRun?: boolean; // same as watch
  // colors: boolean; // we just passed it to the karma config
  // logLevel?: string; // same as above
  // reporters?: string; // same as above

  // TODO: figure out what to do about these.
  environment?: string; // Maybe replace with 'fileReplacement' object?
  forceTsCommonjs?: boolean; // Remove with webpack 4.
}

export class KarmaBuilder implements Builder<KarmaBuilderOptions> {
  constructor(public context: BuilderContext) { }

  run(target: Target<KarmaBuilderOptions>): Observable<BuildEvent> {

    const root = getSystemPath(target.root);
    const options = target.options;

    return new Observable(obs => {
      const karma = requireProjectModule(root, 'karma');
      const karmaConfig = path.resolve(root, options.karmaConfig);

      // TODO: adjust options to account for not passing them blindly to karma.
      // const karmaOptions: any = Object.assign({}, options);
      // tslint:disable-next-line:no-any
      const karmaOptions: any = {
        singleRun: !options.watch,
      };

      // Convert browsers from a string to an array
      if (options.browsers) {
        karmaOptions.browsers = options.browsers.split(',');
      }

      karmaOptions.webpackBuildFacade = {
        options: options,
        webpackConfig: this._buildWebpackConfig(root, options),
      };

      // TODO: inside the configs, always use the project root and not the workspace root.
      // Until then we pretend the app root is relative (``) but the same as `projectRoot`.
      (karmaOptions.webpackBuildFacade.options as any).root = ''; // tslint:disable-line:no-any

      // Assign additional karmaConfig options to the local ngapp config
      karmaOptions.configFile = karmaConfig;

      // :shipit:
      const karmaServer = new karma.Server(karmaOptions, () => obs.complete());
      karmaServer.start();
    });
  }

  private _buildWebpackConfig(projectRoot: string, options: KarmaBuilderOptions) {
    // tslint:disable-next-line:no-any
    let wco: any;

    const tsconfigPath = path.resolve(projectRoot, options.tsConfig as string);
    const tsConfig = readTsconfig(tsconfigPath);

    const projectTs = requireProjectModule(projectRoot, 'typescript') as typeof ts;

    const supportES2015 = tsConfig.options.target !== projectTs.ScriptTarget.ES3
      && tsConfig.options.target !== projectTs.ScriptTarget.ES5;

    const compatOptions = {
      ...options,
      // TODO: inside the configs, always use the project root and not the workspace root.
      // Until then we have to pretend the app root is relative (``) but the same as `projectRoot`.
      root: '',
      // Some asset logic inside getCommonConfig needs outputPath to be set.
      outputPath: '',
    };

    wco = {
      projectRoot,
      // TODO: use only this.options, it contains all flags and configs items already.
      buildOptions: compatOptions,
      appConfig: compatOptions,
      tsConfig,
      supportES2015,
    };

    const webpackConfigs: {}[] = [
      getCommonConfig(wco),
      getStylesConfig(wco),
      getDevConfig(wco),
      getNonAotTestConfig(wco),
      getTestConfig(wco),
    ];

    return webpackMerge(webpackConfigs);
  }
}

export default KarmaBuilder;
