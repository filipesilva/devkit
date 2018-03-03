// tslint:disable
// TODO: cleanup this file, it's copied as is from Angular CLI.

import * as path from 'path';
import * as glob from 'glob';

// import { CliConfig } from '../config';
import { WebpackConfigOptions, WebpackTestOptions } from '../build-options';


/**
 * Enumerate loaders and their dependencies from this file to let the dependency validator
 * know they are used.
 *
 * require('istanbul-instrumenter-loader')
 *
 */


export function getTestConfig(wco: WebpackConfigOptions<WebpackTestOptions>) {
  const { projectRoot, buildOptions, appConfig } = wco;

  const extraRules: any[] = [];
  const extraPlugins: any[] = [];

  // if (buildOptions.codeCoverage && CliConfig.fromProject()) {
  if (buildOptions.codeCoverage) {
    const codeCoverageExclude = buildOptions.codeCoverageExclude;
    let exclude: (string | RegExp)[] = [
      /\.(e2e|spec)\.ts$/,
      /node_modules/
    ];

    if (codeCoverageExclude) {
      codeCoverageExclude.forEach((excludeGlob: string) => {
        const excludeFiles = glob
          .sync(path.join(projectRoot, excludeGlob), { nodir: true })
          .map(file => path.normalize(file));
        exclude.push(...excludeFiles);
      });
    }

    extraRules.push({
      test: /\.(js|ts)$/, loader: 'istanbul-instrumenter-loader',
      options: { esModules: true },
      enforce: 'post',
      exclude
    });
  }

  return {
    resolve: {
      mainFields: [
        ...(wco.supportES2015 ? ['es2015'] : []),
        'browser', 'module', 'main'
      ]
    },
    devtool: buildOptions.sourceMap ? 'inline-source-map' : 'eval',
    entry: {
      main: path.resolve(projectRoot, appConfig.root, appConfig.main)
    },
    module: {
      rules: [].concat(extraRules as any)
    },
    plugins: extraPlugins,
    optimization: {
      // runtimeChunk: 'single',
      splitChunks: {
        chunks: buildOptions.commonChunk ? 'all' : 'initial',
        cacheGroups: {
          vendors: false,
          vendor: buildOptions.vendorChunk && {
            name: 'vendor',
            chunks: 'initial',
            test: (module: any, chunks: Array<{ name: string }>) => {
              const moduleName = module.nameForCondition ? module.nameForCondition() : '';
              return /[\\/]node_modules[\\/]/.test(moduleName)
                && !chunks.some(({ name }) => name === 'polyfills');
            },
          },
        }
      }
    },
  };
}
