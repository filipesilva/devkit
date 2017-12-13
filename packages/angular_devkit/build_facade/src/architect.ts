import { Path, BaseException } from '@angular-devkit/core';
import { AngularWorkspace } from './workspace';


export class ProjectNotFoundException extends BaseException {
  constructor(name: string) {
    super(`Project ${JSON.stringify(name)} could not be found in workspace.`);
  }
}

export class TargetNotFoundException extends BaseException {
  constructor(name: string) {
    super(`Target ${JSON.stringify(name)} could not be found in project.`);
  }
}

export class ConfigurationNotFoundException extends BaseException {
  constructor(name: string) {
    super(`Configuration ${JSON.stringify(name)} could not be found in project.`);
  }
}

export interface BuildOptions {
  [k: string]: any
}

export class Architect {
  static create(workspacePath: Path): Architect {
    return new Architect(new AngularWorkspace(workspacePath));
  }

  constructor(private _workspace: AngularWorkspace) { };

  createTargetInputFromWorkspace(
    projectName?: string,
    targetName?: string,
    configurationName?: string,
    additionalInput?: { [k: string]: any },
  ): BuildOptions {

    const project = projectName
      ? this._workspace.getProjectByName(projectName)
      : this._workspace.getDefaultProject();

    if (!project) {
      throw new ProjectNotFoundException(projectName || 'default');
    }

    const target = targetName
      ? project.getTargetByName(targetName)
      : project.getDefaultTarget();

    if (!target) {
      throw new TargetNotFoundException(targetName || 'default');
    }

    const configuration = configurationName
      ? project.getConfigurationByName(configurationName)
      : project.getDefaultConfiguration();

    if (!configuration) {
      throw new ConfigurationNotFoundException(configurationName || 'default');
    }

    return {
      ...project.props,
      ...target.props,
      ...configuration.props,
      ...additionalInput,
    };
  };

  // createTargetInputFromInput<TT, CT>(
  //   projectName: string,
  //   targetType: string, targetInfo: TT,
  //   configurationType: string, configurationInfo: CT,
  // ): TargetInfo {

  // };

  // Will build the target (if the target supports build), using the input.
  // The input will be augmented using the project and target informations from
  // the workspace, then ran through the project+target JSON schemas for updating
  // default values.
  // If the target does not support build, will return null.
  // If the project or the target does not exist in the workspace, will throw.
  // build<T, BT, AT>(
  //   target: TargetInfo,
  //   input: T,
  // ): Observable<BuildEvent<BT, AT>> | null;

  // Same for all other actions supported by the Build Facade system.
  // run<T, BT, AT>(...): Observable<...> | null;
  // deploy<T, BT, AT>(...): Observable<...> | null;
}


