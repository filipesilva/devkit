// interface BuildContext {
//   logger: LoggerApi;
// }

// interface BuildStats {
//   start: Date;
//   end: Date;
//   hash: string;

//   totalSize: number;
//   criticalSize: number;
//   initialSize: number;
//   assetsSize: number;
// }

// interface BuildAsset {
//   name: string;
//   path: Path;
//   host: Host;

//   size: number;
//   flags: string[];
// }

// type BuildArtifact<T extends object> = T & {
//   name: string;
//   outputs: BuildAsset[];
//   flags: string[];
// }

// type BuildEvent<BuildT, ArtifactT> = BuildT & {
//   success: boolean;

//   artifacts: BuildArtifact<ArtifactT>[];
//   stats: BuildStats;
// }

// interface Builder<T, BuildT, ArtifactT> {
//   // Build the matrix as expressed from the input.
//   // The build should be ongoing as long as there are subscribers to
//   // the observable (or it completes).
//   build(
//     input: T,
//     context: BuildContext,
//   ): Observable<BuildEvent<BuildT, ArtifactT>>;
// }
