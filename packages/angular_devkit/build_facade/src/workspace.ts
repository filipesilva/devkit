import { Path, join, BaseException } from '@angular-devkit/core';
import * as fs from 'fs';


export class MissingWorkspaceConfigException extends BaseException {
  constructor(path: string, fileName: string) {
    super(`Workspace ${JSON.stringify(path)} is missing ${JSON.stringify(fileName)} config file.`);
  }
}

export class DuplicateDefaultProjectException extends BaseException {
  constructor() { super(`Workspace contains multiple default projects.`); }
}

export class DuplicateProjectNameException extends BaseException {
  constructor(projectName: string) {
    super(`Workspace contains multiple projects named (${JSON.stringify(projectName)})`);
  }
}

export class DuplicateProjectTargetException extends BaseException {
  constructor(projectName: string) {
    super(`Project contains multiple targets named (${JSON.stringify(projectName)})`);
  }
}

export class DuplicateDefaultTargetException extends BaseException {
  constructor() { super(`Project contains multiple default targets.`); }
}

export class DuplicateProjectConfigurationException extends BaseException {
  constructor(projectName: string) {
    super(`Project contains multiple configurations named (${JSON.stringify(projectName)})`);
  }
}

export class DuplicateDefaultConfigurationException extends BaseException {
  constructor() { super(`Project contains multiple default configurations.`); }
}

export class Target {
  readonly isDefault?: boolean;
  readonly type: { [k: string]: any };
  readonly props: { [k: string]: any };
  constructor(readonly name: string, rawProps: { [k: string]: any }) {
    this.name = rawProps.name;
    this.type = rawProps._targetType;
    this.isDefault = rawProps.default;
    // Remove base target properties from props.
    this.props = {
      ...rawProps,
      ...{ _targetType: undefined, default: undefined }
    }
  }
}

export class Configuration {
  readonly isDefault?: boolean;
  readonly props: { [k: string]: any };
  constructor(readonly name: string, rawProps: { [k: string]: any }) {
    this.isDefault = rawProps.default;
    // Remove base configuration properties from props.
    this.props = {
      ...rawProps,
      ...{ default: undefined }
    }
  }
}

export class Project {
  readonly type: string;
  readonly isDefault?: boolean;
  readonly props: { [k: string]: any };
  private _targets: Map<string, Target> = new Map<string, Target>();
  private _defaultTarget: Target | undefined;
  private _configurations: Map<string, Configuration> = new Map<string, Configuration>();
  private _defaultConfiguration: Configuration | undefined;

  constructor(readonly name: string, rawProps: { [k: string]: any }) {
    // TODO: validate props against schema.

    this.isDefault = rawProps.default;

    // Process targets.
    for (const [name, tProps] of Object.entries(rawProps.targets)) {
      if (this._targets.has(name)) {
        throw new DuplicateProjectTargetException(name);
      }

      const target = new Target(name, tProps);

      if (target.isDefault) {
        if (this._defaultTarget) {
          throw new DuplicateDefaultTargetException();
        } else {
          this._defaultTarget = target;
        }
      }

      this._targets.set(target.name, target);
    }

    // Process configurations.
    for (const [name, cProps] of Object.entries(rawProps.configurations)) {
      if (this._configurations.has(name)) {
        throw new DuplicateProjectConfigurationException(name);
      }

      const configuration = new Configuration(name, cProps);

      if (configuration.isDefault) {
        if (this._defaultConfiguration) {
          throw new DuplicateDefaultTargetException();
        } else {
          this._defaultConfiguration = configuration;
        }
      }
      this._configurations.set(configuration.name, configuration);
    }

    // Remove base project properties from props.
    this.props = {
      ...rawProps,
      ...{ _projectType: undefined, default: undefined, targets: undefined, configurations: undefined, }
    }
  }

  getDefaultTarget(): Target | undefined {
    return this._defaultTarget;
  };

  getTargetByName(name: string): Target | undefined {
    return this._targets.get(name);
  };

  getTargets(): Target[] {
    return Array.from(this._targets.values());
  };

  getDefaultConfiguration(): Configuration | undefined {
    return this._defaultConfiguration;
  };

  getConfigurationByName(name: string): Configuration | undefined {
    return this._configurations.get(name);
  };

  getConfigurations(): Configuration[] {
    return Array.from(this._configurations.values());
  };
}

export interface Workspace {
  readonly path: Path;
  readonly name: string;
  getDefaultProject(): Project | undefined;
  getProjectByName(name: string): Project | undefined;
  getProjects(): Project[];
}

export class AngularWorkspace implements Workspace {
  readonly name: string;
  private configFileName = '.angular.json';
  private _projects: Map<string, Project> = new Map<string, Project>();
  private _defaultProject: Project | undefined;

  constructor(readonly path: Path) {
    // Load workspace configuration file.
    const configFilePath = join(path, this.configFileName);

    if (!fs.existsSync(configFilePath)) {
      throw new MissingWorkspaceConfigException(path, this.configFileName)
    }

    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    // TODO: validate configContent against schema.
    const configObj = JSON.parse(configContent);

    // Save workspace name.
    this.name = configObj.workspaceName;

    // Process projects.
    for (const [name, props] of Object.entries(configObj.projects)) {
      if (this._projects.has(name)) {
        throw new DuplicateProjectNameException(name);
      }

      const project = new Project(name, props);

      if (project.isDefault) {
        if (this._defaultProject) {
          throw new DuplicateDefaultProjectException();
        } else {
          this._defaultProject = project;
        }
      }

      this._projects.set(project.name, project);
    }
  }

  getDefaultProject(): Project | undefined {
    return this._defaultProject;
  };

  getProjectByName(name: string): Project | undefined {
    return this._projects.get(name);
  };

  getProjects(): Project[] {
    return Array.from(this._projects.values());
  };
}
