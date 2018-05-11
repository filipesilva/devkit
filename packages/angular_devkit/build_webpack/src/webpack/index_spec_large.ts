/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { runTargetSpec } from '@angular-devkit/architect/testing';
import { join, normalize } from '@angular-devkit/core';
import { tap } from 'rxjs/operators';
import { host, workspaceRoot } from '../test-utils';


describe('Webpack Builder basic test', () => {
  const outputPath = normalize('dist');
  const webpackTargetSpec = { project: 'app', target: 'build' };

  beforeEach(done => host.initialize().subscribe(undefined, done.fail, done));
  afterEach(done => host.restore().subscribe(undefined, done.fail, done));

  it('works', (done) => {
    runTargetSpec(workspaceRoot, host, webpackTargetSpec).pipe(
      tap((buildEvent) => expect(buildEvent.success).toBe(true)),
      tap(() => {
        expect(host.scopedSync().exists(join(outputPath, 'bundle.js'))).toBe(true);
      }),
    ).subscribe(undefined, done.fail, done);
  }, 30000);
});
