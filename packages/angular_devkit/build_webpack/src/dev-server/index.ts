/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { BuildEvent, Builder, BuilderContext, Target } from '@angular-devkit/architect';
import { getSystemPath, tags } from '@angular-devkit/core';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs/Observable';
import { concatMap } from 'rxjs/operators';
import * as url from 'url';
import * as webpack from 'webpack';
import { getWebpackStatsConfig } from '../angular-cli-files/models/webpack-configs/utils';
import { checkPort } from '../angular-cli-files/utilities/check-port';
import {
  statsErrorsToString,
  statsToString,
  statsWarningsToString,
} from '../angular-cli-files/utilities/stats';
import {
  BrowserBuilder,
  BrowserBuilderOptions,
} from '../browser/';
const opn = require('opn');
const WebpackDevServer = require('webpack-dev-server');


export interface DevServerBuilderOptions {
  browserTarget: string;
  port: number;
  host: string;
  proxyConfig?: string;
  ssl: boolean;
  sslKey?: string;
  sslCert?: string;
  open: boolean;
  liveReload: boolean;
  publicHost?: string;
  servePath?: string;
  disableHostCheck: boolean;
  hmr: boolean;
  watch: boolean;
  hmrWarning: boolean;
  servePathDefaultWarning: boolean;
}

interface WebpackDevServerConfigurationOptions {
  contentBase?: boolean | string | string[];
  hot?: boolean;
  historyApiFallback?: { [key: string]: any } | boolean; // tslint:disable-line:no-any
  compress?: boolean;
  proxy?: { [key: string]: string };
  staticOptions?: any; // tslint:disable-line:no-any
  quiet?: boolean;
  noInfo?: boolean;
  lazy?: boolean;
  filename?: string;
  watchOptions?: {
    aggregateTimeout?: number;
    poll?: number;
  };
  publicPath?: string;
  headers?: { [key: string]: string };
  stats?: { [key: string]: boolean } | string | boolean;
  https?: boolean;
  key?: string;
  cert?: string;
  overlay?: boolean | { errors: boolean, warnings: boolean };
  public?: string;
  disableHostCheck?: boolean;
}

export class DevServerBuilder implements Builder<DevServerBuilderOptions> {

  constructor(public context: BuilderContext) { }

  run(target: Target<DevServerBuilderOptions>): Observable<BuildEvent> {
    const root = getSystemPath(target.root);
    const options = target.options;

    return checkPort(options.port, options.host).pipe(
      concatMap((port) => {
        options.port = port;

        return this._getBrowserOptions(options);
      }),
      concatMap((browserOptions) => new Observable(obs => {
        const browserBuilder = new BrowserBuilder(this.context);
        const webpackConfig = browserBuilder.buildWebpackConfig(target.root, browserOptions);
        const webpackCompiler = webpack(webpackConfig);
        const statsConfig = getWebpackStatsConfig(browserOptions.verbose);

        let webpackDevServerConfig: WebpackDevServerConfigurationOptions;
        try {
          webpackDevServerConfig = this._buildServerConfig(root, options, browserOptions);
        } catch (err) {
          obs.error(err);

          return;
        }

        // Resolve public host and client address.
        let clientAddress = `${options.ssl ? 'https' : 'http'}://0.0.0.0:0`;
        if (options.publicHost) {
          let publicHost = options.publicHost;
          if (!/^\w+:\/\//.test(publicHost)) {
            publicHost = `${options.ssl ? 'https' : 'http'}://${publicHost}`;
          }
          const clientUrl = url.parse(publicHost);
          options.publicHost = clientUrl.host;
          clientAddress = url.format(clientUrl);
        }

        // Resolve serve address.
        const serverAddress = url.format({
          protocol: options.ssl ? 'https' : 'http',
          hostname: options.host === '0.0.0.0' ? 'localhost' : options.host,
          port: options.port.toString(),
        });

        // Add live reload config.
        if (options.liveReload) {
          this._addLiveReload(options, browserOptions, webpackConfig, clientAddress);
        } else if (options.hmr) {
          this.context.logger.warn('Live reload is disabled. HMR option ignored.');
        }

        if (!options.watch) {
          // There's no option to turn off file watching in webpack-dev-server, but
          // we can override the file watcher instead.
          webpackConfig.plugins.unshift({
            // tslint:disable-next-line:no-any
            apply: (compiler: any) => {
              compiler.hooks.afterEnvironment.tap('angular-cli', () => {
                compiler.watchFileSystem = { watch: () => { } };
              });
            },
          });
        }

        if (browserOptions.optimizationLevel > 0) {
          this.context.logger.error(tags.stripIndents`
            ****************************************************************************************
            This is a simple server for use in testing or debugging Angular applications locally.
            It hasn't been reviewed for security issues.

            DON'T USE IT FOR PRODUCTION!
            ****************************************************************************************
          `);
        }

        this.context.logger.info(tags.oneLine`
          **
          Angular Live Development Server is listening on ${options.host}:
          ${options.port}, open your browser on ${serverAddress}${webpackDevServerConfig.publicPath}
          **
        `);

        const server = new WebpackDevServer(webpackCompiler, webpackDevServerConfig);

        // tslint:disable-next-line:no-any
        (webpackCompiler as any).hooks.done.tap('angular-cli', (stats: webpack.Stats) => {
          if (!browserOptions.verbose) {
            const json = stats.toJson(statsConfig);
            this.context.logger.info(statsToString(json, statsConfig));
            if (stats.hasWarnings()) {
              this.context.logger.info(statsWarningsToString(json, statsConfig));
            }
            if (stats.hasErrors()) {
              this.context.logger.info(statsErrorsToString(json, statsConfig));
            }
          }
          obs.next({ success: true });

          if (options.open) {
            opn(serverAddress + webpackDevServerConfig.publicPath);
          }
        });

        const httpServer = server.listen(
          options.port,
          options.host,
          (err: any) => { // tslint:disable-line:no-any
            if (err) {
              obs.error(err);
            }
          },
        );

        // Node 8 has a keepAliveTimeout bug which doesn't respect active connections.
        // Connections will end after ~5 seconds (arbitrary), often not letting the full download
        // of large pieces of content, such as a vendor javascript file.  This results in browsers
        // throwing a "net::ERR_CONTENT_LENGTH_MISMATCH" error.
        // https://github.com/angular/angular-cli/issues/7197
        // https://github.com/nodejs/node/issues/13391
        // https://github.com/nodejs/node/commit/2cb6f2b281eb96a7abe16d58af6ebc9ce23d2e96
        if (/^v8.\d.\d+$/.test(process.version)) {
          httpServer.keepAliveTimeout = 30000; // 30 seconds
        }

        // Teardown logic. Close the server when unsubscribed from.
        return () => server.close();
      })));
  }

  private _buildServerConfig(
    root: string,
    options: DevServerBuilderOptions,
    browserOptions: BrowserBuilderOptions,
  ) {
    if (options.disableHostCheck) {
      this.context.logger.warn(tags.oneLine`
        WARNING: Running a server with --disable-host-check is a security risk.
        See https://medium.com/webpack/webpack-dev-server-middleware-security-issues-1489d950874a
        for more information.
      `);
    }

    const servePath = this._buildServePath(options, browserOptions);

    const config: WebpackDevServerConfigurationOptions = {
      headers: { 'Access-Control-Allow-Origin': '*' },
      historyApiFallback: {
        index: `${servePath}/${browserOptions.index}`,
        disableDotRule: true,
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
      },
      stats: browserOptions.verbose ? getWebpackStatsConfig(browserOptions.verbose) : false,
      compress: browserOptions.optimizationLevel > 0,
      watchOptions: {
        poll: browserOptions.poll,
      },
      https: options.ssl,
      overlay: {
        errors: browserOptions.optimizationLevel === 0,
        warnings: false,
      },
      contentBase: false,
      public: options.publicHost,
      disableHostCheck: options.disableHostCheck,
      publicPath: servePath,
      hot: options.hmr,
    };

    if (options.ssl) {
      this._addSslConfig(root, options, config);
    }

    if (options.proxyConfig) {
      this._addProxyConfig(root, options, config);
    }

    return config;
  }

  private _addLiveReload(
    options: DevServerBuilderOptions,
    browserOptions: BrowserBuilderOptions,
    webpackConfig: any, // tslint:disable-line:no-any
    clientAddress: string,
  ) {
    // This allows for live reload of page when changes are made to repo.
    // https://webpack.js.org/configuration/dev-server/#devserver-inline
    let webpackDevServerPath;
    try {
      webpackDevServerPath = require.resolve('webpack-dev-server/client');
    } catch {
      throw new Error('The "webpack-dev-server" package could not be found.');
    }
    const entryPoints = [`${webpackDevServerPath}?${clientAddress}`];
    if (options.hmr) {
      const webpackHmrLink = 'https://webpack.js.org/guides/hot-module-replacement';

      this.context.logger.warn(
        tags.oneLine`NOTICE: Hot Module Replacement (HMR) is enabled for the dev server.`);

      const showWarning = options.hmrWarning;
      if (showWarning) {
        this.context.logger.info(tags.stripIndents`
          The project will still live reload when HMR is enabled,
          but to take advantage of HMR additional application code is required'
          (not included in an Angular CLI project by default).'
          See ${webpackHmrLink}
          for information on working with HMR for Webpack.`,
        );
        this.context.logger.warn(
          tags.oneLine`To disable this warning use "ng set warnings.hmrWarning=false".`);
      }
      entryPoints.push('webpack/hot/dev-server');
      webpackConfig.plugins.push(new webpack.HotModuleReplacementPlugin());
      if (browserOptions.extractCss) {
        this.context.logger.warn(tags.oneLine`NOTICE: (HMR) does not allow for CSS hot reload
                when used together with '--extract-css'.`);
      }
    }
    if (!webpackConfig.entry.main) { webpackConfig.entry.main = []; }
    webpackConfig.entry.main.unshift(...entryPoints);
  }

  private _addSslConfig(
    root: string,
    options: DevServerBuilderOptions,
    config: WebpackDevServerConfigurationOptions,
  ) {
    let sslKey: string | undefined = undefined;
    let sslCert: string | undefined = undefined;
    if (options.sslKey) {
      const keyPath = path.resolve(root, options.sslKey as string);
      if (existsSync(keyPath)) {
        sslKey = readFileSync(keyPath, 'utf-8');
      }
    }
    if (options.sslCert) {
      const certPath = path.resolve(root, options.sslCert as string);
      if (existsSync(certPath)) {
        sslCert = readFileSync(certPath, 'utf-8');
      }
    }

    config.https = true;
    if (sslKey != null && sslCert != null) {
      config.key = sslKey;
      config.cert = sslCert;
    }
  }

  private _addProxyConfig(
    root: string,
    options: DevServerBuilderOptions,
    config: WebpackDevServerConfigurationOptions,
  ) {
    let proxyConfig = {};
    const proxyPath = path.resolve(root, options.proxyConfig as string);
    if (existsSync(proxyPath)) {
      proxyConfig = require(proxyPath);
    } else {
      const message = 'Proxy config file ' + proxyPath + ' does not exist.';
      throw new Error(message);
    }
    config.proxy = proxyConfig;
  }

  private _buildServePath(options: DevServerBuilderOptions, browserOptions: BrowserBuilderOptions) {
    let servePath = options.servePath;
    if (!servePath && servePath !== '') {
      const defaultServePath =
        this._findDefaultServePath(browserOptions.baseHref, browserOptions.deployUrl);
      const showWarning = options.servePathDefaultWarning;
      if (defaultServePath == null && showWarning) {
        this.context.logger.warn(tags.oneLine`
            WARNING: --deploy-url and/or --base-href contain
            unsupported values for ng serve.  Default serve path of '/' used.
            Use --serve-path to override.
          `);
      }
      servePath = defaultServePath || '';
    }
    if (servePath.endsWith('/')) {
      servePath = servePath.substr(0, servePath.length - 1);
    }
    if (!servePath.startsWith('/')) {
      servePath = `/${servePath}`;
    }

    return servePath;
  }

  private _findDefaultServePath(baseHref?: string, deployUrl?: string): string | null {
    if (!baseHref && !deployUrl) {
      return '';
    }

    if (/^(\w+:)?\/\//.test(baseHref || '') || /^(\w+:)?\/\//.test(deployUrl || '')) {
      // If baseHref or deployUrl is absolute, unsupported by ng serve
      return null;
    }

    // normalize baseHref
    // for ng serve the starting base is always `/` so a relative
    // and root relative value are identical
    const baseHrefParts = (baseHref || '')
      .split('/')
      .filter(part => part !== '');
    if (baseHref && !baseHref.endsWith('/')) {
      baseHrefParts.pop();
    }
    const normalizedBaseHref = baseHrefParts.length === 0 ? '/' : `/${baseHrefParts.join('/')}/`;

    if (deployUrl && deployUrl[0] === '/') {
      if (baseHref && baseHref[0] === '/' && normalizedBaseHref !== deployUrl) {
        // If baseHref and deployUrl are root relative and not equivalent, unsupported by ng serve
        return null;
      }

      return deployUrl;
    }

    // Join together baseHref and deployUrl
    return `${normalizedBaseHref}${deployUrl || ''}`;
  }

  private _getBrowserOptions(options: DevServerBuilderOptions) {
    const [project, target, configuration] = options.browserTarget.split(':');
    // Override browser build watch setting.
    const overrides = { watch: options.watch };
    let browserTarget: Target<BrowserBuilderOptions>;

    const browserTargetOptions = { project, target, configuration, overrides };
    browserTarget = this.context.architect.getTarget<BrowserBuilderOptions>(browserTargetOptions);

    return this.context.architect.getBuilderDescription(browserTarget).pipe(
      concatMap(browserDescription =>
        this.context.architect.validateBuilderOptions(browserTarget, browserDescription)),
    );
  }
}


export default DevServerBuilder;
