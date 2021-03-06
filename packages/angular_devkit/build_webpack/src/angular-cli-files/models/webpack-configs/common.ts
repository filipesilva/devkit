// tslint:disable
// TODO: cleanup this file, it's copied as is from Angular CLI.

import * as webpack from 'webpack';
import * as path from 'path';
import * as CopyWebpackPlugin from 'copy-webpack-plugin';
import { NamedLazyChunksWebpackPlugin } from '../../plugins/named-lazy-chunks-webpack-plugin';
import { extraEntryParser, getOutputHashFormat, AssetPattern } from './utils';
import { isDirectory } from '../../utilities/is-directory';
import { requireProjectModule } from '../../utilities/require-project-module';
import { WebpackConfigOptions } from '../build-options';
import { ScriptsWebpackPlugin } from '../../plugins/scripts-webpack-plugin';
import { findUp } from '../../utilities/find-up';

const ProgressPlugin = require('webpack/lib/ProgressPlugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const SilentError = require('silent-error');

/**
 * Enumerate loaders and their dependencies from this file to let the dependency validator
 * know they are used.
 *
 * require('source-map-loader')
 * require('raw-loader')
 * require('url-loader')
 * require('file-loader')
 * require('@angular-devkit/build-optimizer')
 */

export function getCommonConfig(wco: WebpackConfigOptions) {
  const { projectRoot, buildOptions, appConfig } = wco;

  const appRoot = path.resolve(projectRoot, appConfig.root);
  const nodeModules = findUp('node_modules', projectRoot);
  if (!nodeModules) {
    throw new Error('Cannot locale node_modules directory.')
  }

  let extraPlugins: any[] = [];
  let extraRules: any[] = [];
  let entryPoints: { [key: string]: string[] } = {};

  if (appConfig.main) {
    entryPoints['main'] = [path.resolve(appRoot, appConfig.main)];
  }

  if (appConfig.polyfills) {
    entryPoints['polyfills'] = [path.resolve(appRoot, appConfig.polyfills)];
  }

  // determine hashing format
  const hashFormat = getOutputHashFormat(buildOptions.outputHashing as any);

  // process global scripts
  if (appConfig.scripts.length > 0) {
    const globalScripts = extraEntryParser(appConfig.scripts, appRoot, 'scripts');
    const globalScriptsByEntry = globalScripts
      .reduce((prev: { entry: string, paths: string[], lazy: boolean }[], curr) => {

        let existingEntry = prev.find((el) => el.entry === curr.entry);
        if (existingEntry) {
          existingEntry.paths.push(curr.path as string);
          // All entries have to be lazy for the bundle to be lazy.
          (existingEntry as any).lazy = existingEntry.lazy && curr.lazy;
        } else {
          prev.push({ entry: curr.entry as string, paths: [curr.path as string],
            lazy: curr.lazy as boolean });
        }
        return prev;
      }, []);


    // Add a new asset for each entry.
    globalScriptsByEntry.forEach((script) => {
      // Lazy scripts don't get a hash, otherwise they can't be loaded by name.
      const hash = script.lazy ? '' : hashFormat.script;
      extraPlugins.push(new ScriptsWebpackPlugin({
        name: script.entry,
        sourceMap: buildOptions.sourcemaps,
        filename: `${script.entry}${hash}.bundle.js`,
        scripts: script.paths,
        basePath: projectRoot,
      }));
    });
  }

  // process asset entries
  if (appConfig.assets) {
    const copyWebpackPluginPatterns = appConfig.assets.map((asset: string | AssetPattern) => {
      // Convert all string assets to object notation.
      asset = typeof asset === 'string' ? { glob: asset } : asset;
      // Add defaults.
      // Input is always resolved relative to the appRoot.
      asset.input = path.resolve(appRoot, asset.input || '').replace(/\\/g, '/');
      asset.output = asset.output || '';
      asset.glob = asset.glob || '';

      // Prevent asset configurations from writing outside of the output path, except if the user
      // specify a configuration flag.
      // Also prevent writing outside the project path. That is not overridable.
      const absoluteOutputPath = path.resolve(buildOptions.outputPath as string);
      const absoluteAssetOutput = path.resolve(absoluteOutputPath, asset.output);
      const outputRelativeOutput = path.relative(absoluteOutputPath, absoluteAssetOutput);

      if (outputRelativeOutput.startsWith('..') || path.isAbsolute(outputRelativeOutput)) {

        const projectRelativeOutput = path.relative(projectRoot, absoluteAssetOutput);
        if (projectRelativeOutput.startsWith('..') || path.isAbsolute(projectRelativeOutput)) {
          const message = 'An asset cannot be written to a location outside the project.';
          throw new SilentError(message);
        }

        if (!asset.allowOutsideOutDir) {
          const message = 'An asset cannot be written to a location outside of the output path. '
                        + 'You can override this message by setting the `allowOutsideOutDir` '
                        + 'property on the asset to true in the CLI configuration.';
          throw new SilentError(message);
        }
      }

      // Prevent asset configurations from reading files outside of the project.
      const projectRelativeInput = path.relative(projectRoot, asset.input);
      if (projectRelativeInput.startsWith('..') || path.isAbsolute(projectRelativeInput)) {
        const message = 'An asset cannot be read from a location outside the project.';
        throw new SilentError(message);
      }

      // Ensure trailing slash.
      if (isDirectory(path.resolve(asset.input))) {
        asset.input += '/';
      }

      // Convert dir patterns to globs.
      if (isDirectory(path.resolve(asset.input, asset.glob))) {
        asset.glob = asset.glob + '/**/*';
      }

      // Escape the input in case it has special charaters and use to make glob absolute
      const escapedInput = asset.input
        .replace(/[\\|\*|\?|\!|\(|\)|\[|\]|\{|\}]/g, (substring) => `\\${substring}`);

      return {
        context: asset.input,
        to: asset.output,
        from: {
          glob: path.resolve(escapedInput, asset.glob),
          dot: true
        }
      };
    });
    const copyWebpackPluginOptions = { ignore: ['.gitkeep', '**/.DS_Store', '**/Thumbs.db'] };

    const copyWebpackPluginInstance = new CopyWebpackPlugin(copyWebpackPluginPatterns,
      copyWebpackPluginOptions);

    // Save options so we can use them in eject.
    (copyWebpackPluginInstance as any)['copyWebpackPluginPatterns'] = copyWebpackPluginPatterns;
    (copyWebpackPluginInstance as any)['copyWebpackPluginOptions'] = copyWebpackPluginOptions;

    extraPlugins.push(copyWebpackPluginInstance);
  }

  if (buildOptions.progress) {
    extraPlugins.push(new ProgressPlugin({ profile: buildOptions.verbose, colors: true }));
  }

  if (buildOptions.showCircularDependencies) {
    extraPlugins.push(new CircularDependencyPlugin({
      exclude: /(\\|\/)node_modules(\\|\/)/
    }));
  }

  if (buildOptions.buildOptimizer) {
    extraRules.push({
      test: /\.js$/,
      use: [{
        loader: '@angular-devkit/build-optimizer/webpack-loader',
        options: { sourceMap: buildOptions.sourcemaps }
      }]
    });
  }

  if (buildOptions.namedChunks) {
    extraPlugins.push(new NamedLazyChunksWebpackPlugin());
  }

  // Load rxjs path aliases.
  // https://github.com/ReactiveX/rxjs/blob/master/doc/lettable-operators.md#build-and-treeshaking
  let alias = {};
  try {
    const rxjsPathMappingImport = wco.supportES2015
      ? 'rxjs/_esm2015/path-mapping'
      : 'rxjs/_esm5/path-mapping';
    const rxPaths = requireProjectModule(projectRoot, rxjsPathMappingImport);
    alias = rxPaths(nodeModules);
  } catch (e) { }

  return {
    resolve: {
      extensions: ['.ts', '.js'],
      modules: ['node_modules', nodeModules],
      symlinks: !buildOptions.preserveSymlinks,
      alias
    },
    resolveLoader: {
      modules: [nodeModules, 'node_modules']
    },
    context: __dirname,
    entry: entryPoints,
    output: {
      path: path.resolve(projectRoot, buildOptions.outputPath as string),
      publicPath: buildOptions.deployUrl,
      filename: `[name]${hashFormat.chunk}.bundle.js`,
      chunkFilename: `[id]${hashFormat.chunk}.chunk.js`
    },
    module: {
      rules: [
        { test: /\.html$/, loader: 'raw-loader' },
        {
          test: /\.(eot|svg|cur)$/,
          loader: 'file-loader',
          options: {
            name: `[name]${hashFormat.file}.[ext]`,
            limit: 10000
          }
        },
        {
          test: /\.(jpg|png|webp|gif|otf|ttf|woff|woff2|ani)$/,
          loader: 'url-loader',
          options: {
            name: `[name]${hashFormat.file}.[ext]`,
            limit: 10000
          }
        }
      ].concat(extraRules)
    },
    plugins: [
      new webpack.NoEmitOnErrorsPlugin()
    ].concat(extraPlugins)
  };
}
