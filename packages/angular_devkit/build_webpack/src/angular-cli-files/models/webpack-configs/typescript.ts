// tslint:disable
// TODO: cleanup this file, it's copied as is from Angular CLI.

import * as path from 'path';
import { stripIndent } from 'common-tags';
import {
  AngularCompilerPlugin,
  AngularCompilerPluginOptions,
  PLATFORM
} from '@ngtools/webpack';
import { WebpackConfigOptions } from '../build-options';

const SilentError = require('silent-error');


const g: any = global;
const webpackLoader: string = g['angularCliIsLocal']
  ? g.angularCliPackages['@ngtools/webpack'].main
  : '@ngtools/webpack';


function _createAotPlugin(wco: WebpackConfigOptions, options: any, useMain = true) {
  const { appConfig, projectRoot, buildOptions } = wco;
  const appRoot = path.resolve(projectRoot, appConfig.root);
  options.compilerOptions = options.compilerOptions || {};

  if (wco.buildOptions.preserveSymlinks) {
    options.compilerOptions.preserveSymlinks = true;
  }

  // Read the environment, and set it in the compiler host.
  let hostReplacementPaths: any = {};
  // process environment file replacement
  if (appConfig.environments) {
    if (!appConfig.environmentSource) {
      let migrationMessage = '';
      if ('source' in appConfig.environments) {
        migrationMessage = '\n\n' + stripIndent`
          A new environmentSource entry replaces the previous source entry inside environments.

          To migrate angular-cli.json follow the example below:

          Before:

          "environments": {
            "source": "environments/environment.ts",
            "dev": "environments/environment.ts",
            "prod": "environments/environment.prod.ts"
          }


          After:

          "environmentSource": "environments/environment.ts",
          "environments": {
            "dev": "environments/environment.ts",
            "prod": "environments/environment.prod.ts"
          }
        `;
      }
      throw new SilentError(
        `Environment configuration does not contain "environmentSource" entry.${migrationMessage}`
      );

    }
    if (!(buildOptions.environment as any in appConfig.environments)) {
      throw new SilentError(`Environment "${buildOptions.environment}" does not exist.`);
    }

    const sourcePath = appConfig.environmentSource;
    const envFile = appConfig.environments[buildOptions.environment as any];

    hostReplacementPaths = {
      [path.resolve(appRoot, sourcePath)]: path.resolve(appRoot, envFile)
    };
  }

  let i18nInFile = buildOptions.i18nFile
    ? path.resolve(appRoot, buildOptions.i18nFile)
    : undefined;

  const additionalLazyModules: { [module: string]: string } = {};
  if (appConfig.lazyModules) {
    for (const lazyModule of appConfig.lazyModules) {
      additionalLazyModules[lazyModule] = path.resolve(
        projectRoot,
        appConfig.root,
        lazyModule,
      );
    }
  }

  const pluginOptions: AngularCompilerPluginOptions = {
    mainPath: useMain ? path.join(projectRoot, appConfig.root, appConfig.main) : undefined,
    i18nInFile: i18nInFile,
    i18nInFormat: buildOptions.i18nFormat,
    i18nOutFile: buildOptions.i18nOutFile,
    i18nOutFormat: buildOptions.i18nOutFormat,
    locale: buildOptions.i18nLocale,
    platform: appConfig.platform === 'server' ? PLATFORM.Server : PLATFORM.Browser,
    missingTranslation: buildOptions.i18nMissingTranslation,
    hostReplacementPaths,
    sourceMap: buildOptions.sourceMap,
    additionalLazyModules,
    nameLazyFiles: buildOptions.namedChunks,
    forkTypeChecker: buildOptions.forkTypeChecker,
    ...options
  };
  return new AngularCompilerPlugin(pluginOptions);
}

export function getNonAotConfig(wco: WebpackConfigOptions) {
  const { appConfig, projectRoot } = wco;
  const tsConfigPath = path.resolve(projectRoot, appConfig.root, appConfig.tsconfig);

  return {
    module: { rules: [{ test: /\.ts$/, loader: webpackLoader }] },
    plugins: [_createAotPlugin(wco, { tsConfigPath, skipCodeGeneration: true })]
  };
}

export function getAotConfig(wco: WebpackConfigOptions) {
  const { projectRoot, buildOptions, appConfig } = wco;
  const tsConfigPath = path.resolve(projectRoot, appConfig.root, appConfig.tsconfig);

  const loaders: any[] = [webpackLoader];
  if (buildOptions.buildOptimizer) {
    loaders.unshift({
      loader: '@angular-devkit/build-optimizer/webpack-loader',
      options: { sourceMap: buildOptions.sourceMap }
    });
  }

  const test = /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/;

  return {
    module: { rules: [{ test, use: loaders }] },
    plugins: [_createAotPlugin(wco, { tsConfigPath })]
  };
}

export function getNonAotTestConfig(wco: WebpackConfigOptions) {
  const { projectRoot, appConfig } = wco;
  const tsConfigPath = path.resolve(projectRoot, appConfig.root, appConfig.tsconfig);

  let pluginOptions: any = { tsConfigPath, skipCodeGeneration: true };

  if (appConfig.polyfills) {
    // TODO: remove singleFileIncludes for 2.0, this is just to support old projects that did not
    // include 'polyfills.ts' in `tsconfig.spec.json'.
    const polyfillsPath = path.resolve(projectRoot, appConfig.root, appConfig.polyfills);
    pluginOptions.singleFileIncludes = [polyfillsPath];
  }

  return {
    module: { rules: [{ test: /\.ts$/, loader: webpackLoader }] },
    plugins: [_createAotPlugin(wco, pluginOptions, false)]
  };
}
