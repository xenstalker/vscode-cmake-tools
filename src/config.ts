/**
 * Provides a typed interface to CMake Tools' configuration options. You'll want
 * to import the `config` default export, which is an instance of the
 * `ConfigurationReader` class.
 */ /** */

import * as util from '@cmt/util';
import * as os from 'os';
import * as vscode from 'vscode';

export type LogLevelKey = 'trace'|'debug'|'info'|'note'|'warning'|'error'|'fatal';

interface HardEnv {
  [key: string]: string;
}

export interface ExtensionConfigurationSettings {
  cmakePath: string;
  buildDirectory: string;
  installPrefix: string|null;
  sourceDirectory: string;
  saveBeforeBuild: boolean;
  buildBeforeRun: boolean;
  clearOutputBeforeBuild: boolean;
  configureSettings: {[key: string]: any};
  cacheInit: string|string[]|null;
  preferredGenerators: string[];
  generator: string|null;
  toolset: string|null;
  platform: string|null;
  configureArgs: string[];
  buildArgs: string[];
  buildToolArgs: string[];
  parallelJobs: number;
  ctestPath: string;
  ctest: {parallelJobs: number;};
  autoRestartBuild: boolean;
  parseBuildDiagnostics: boolean;
  enabledOutputParsers: string[];
  debugConfig: object;
  defaultVariants: object;
  ctestArgs: string[];
  environment: HardEnv;
  configureEnvironment: HardEnv;
  buildEnvironment: HardEnv;
  testEnvironment: HardEnv;
  mingwSearchDirs: string[];
  emscriptenSearchDirs: string[];
  useCMakeServer: boolean;
  enableTraceLogging: boolean;
  loggingLevel: LogLevelKey;
}

type EmittersOf<T> = {
  readonly[Key in keyof T]: vscode.EventEmitter<T[Key]>;
};

/**
 * This class exposes a number of readonly properties which can be used to
 * access configuration options. Each property corresponds to a value in
 * `settings.json`. See `package.json` for CMake Tools to see the information
 * on each property. An underscore in a property name corresponds to a dot `.`
 * in the setting name.
 */
export class ConfigurationReader implements vscode.Disposable {
  private _updateSubscription?: vscode.Disposable;

  constructor(private readonly _configData: ExtensionConfigurationSettings) {}

  get configData() { return this._configData; }

  dispose() {
    if (this._updateSubscription) {
      this._updateSubscription.dispose();
    }
  }

  /**
   * Get a configuration object relevant to the given workspace directory. This
   * supports multiple workspaces having differing configs.
   *
   * @param workspacePath A directory to use for the config
   */
  static createForDirectory(dirPath: string): ConfigurationReader {
    const data = ConfigurationReader.loadForPath(dirPath);
    const reader = new ConfigurationReader(data);
    reader._updateSubscription = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('cmake', vscode.Uri.file(dirPath))) {
        const new_data = ConfigurationReader.loadForPath(dirPath);
        reader.update(new_data);
      }
    });
    return reader;
  }

  static loadForPath(filePath: string): ExtensionConfigurationSettings {
    const data = vscode.workspace.getConfiguration('cmake', vscode.Uri.file(filePath)) as any as
        ExtensionConfigurationSettings;
    const platmap = {
      win32: 'windows',
      darwin: 'osx',
      linux: 'linux',
    } as {[k: string]: string};
    const platform = platmap[process.platform];
    const for_platform = (data as any)[platform] as ExtensionConfigurationSettings | undefined;
    return {...data, ...(for_platform || {})};
  }

  update(newData: ExtensionConfigurationSettings) { this.updatePartial(newData); }
  updatePartial(newData: Partial<ExtensionConfigurationSettings>) {
    const old_values = {...this.configData};
    Object.assign(this.configData, newData);
    for (const key_ of Object.getOwnPropertyNames(newData)) {
      const key = key_ as keyof ExtensionConfigurationSettings;
      if (!(key in this._emitters)) {
        continue;  // Extension config we load has some additional properties we don't care about.
      }
      const new_value = this.configData[key];
      const old_value = old_values[key];
      if (util.compare(new_value, old_value) !== util.Ordering.Equivalent) {
        const em: vscode.EventEmitter<ExtensionConfigurationSettings[typeof key]> = this._emitters[key];
        em.fire(newData[key]);
      }
    }
  }

  get buildDirectory(): string { return this.configData.buildDirectory; }

  get installPrefix(): string|null { return this.configData.installPrefix; }

  get sourceDirectory(): string { return this.configData.sourceDirectory as string; }

  get saveBeforeBuild(): boolean { return !!this.configData.saveBeforeBuild; }

  get buildBeforeRun(): boolean { return this.configData.buildBeforeRun; }

  get clearOutputBeforeBuild(): boolean { return !!this.configData.clearOutputBeforeBuild; }

  get autoRestartBuild(): boolean { return !!this.configData.autoRestartBuild; }

  get configureSettings(): any { return this.configData.configureSettings; }

  get cacheInit() { return this.configData.cacheInit; }

  get preferredGenerators(): string[] { return this.configData.preferredGenerators; }

  get generator(): string|null { return this.configData.generator; }

  get toolset(): string|null { return this.configData.toolset; }

  get platform(): string|null { return this.configData.platform; }

  get configureArgs(): string[] { return this.configData.configureArgs; }

  get buildArgs(): string[] { return this.configData.buildArgs; }

  get buildToolArgs(): string[] { return this.configData.buildToolArgs; }

  get parallelJobs(): number|null { return this.configData.parallelJobs; }

  get ctest_parallelJobs(): number|null { return this.configData.ctest.parallelJobs; }

  get parseBuildDiagnostics(): boolean { return !!this.configData.parseBuildDiagnostics; }

  get enableOutputParsers(): string[]|null { return this.configData.enabledOutputParsers; }

  get raw_cmakePath(): string { return this.configData.cmakePath; }

  get raw_ctestPath(): string { return this.configData.ctestPath; }

  get debugConfig(): any { return this.configData.debugConfig; }

  get environment() { return this.configData.environment; }

  get configureEnvironment() { return this.configData.configureEnvironment; }

  get buildEnvironment() { return this.configData.buildEnvironment; }

  get testEnvironment() { return this.configData.testEnvironment; }

  get defaultVariants(): Object { return this.configData.defaultVariants; }

  get ctestArgs(): string[] { return this.configData.ctestArgs; }

  get useCMakeServer(): boolean { return this.configData.useCMakeServer; }

  get numJobs(): number {
    const jobs = this.parallelJobs;
    if (!!jobs) {
      return jobs;
    }
    return os.cpus().length + 2;
  }

  get numCTestJobs(): number {
    const ctest_jobs = this.ctest_parallelJobs;
    if (!ctest_jobs) {
      return this.numJobs;
    }
    return ctest_jobs;
  }

  get mingwSearchDirs(): string[] { return this.configData.mingwSearchDirs; }

  get emscriptenSearchDirs(): string[] { return this.configData.emscriptenSearchDirs; }

  get loggingLevel(): LogLevelKey {
    if (process.env['CMT_LOGGING_LEVEL']) {
      return process.env['CMT_LOGGING_LEVEL']! as LogLevelKey;
    }
    return this.configData.loggingLevel;
  }
  get enableTraceLogging(): boolean { return this.configData.enableTraceLogging; }

  private readonly _emitters: EmittersOf<ExtensionConfigurationSettings> = {
    cmakePath: new vscode.EventEmitter<string>(),
    buildDirectory: new vscode.EventEmitter<string>(),
    installPrefix: new vscode.EventEmitter<string|null>(),
    sourceDirectory: new vscode.EventEmitter<string>(),
    saveBeforeBuild: new vscode.EventEmitter<boolean>(),
    buildBeforeRun: new vscode.EventEmitter<boolean>(),
    clearOutputBeforeBuild: new vscode.EventEmitter<boolean>(),
    configureSettings: new vscode.EventEmitter<{[key: string]: any}>(),
    cacheInit: new vscode.EventEmitter<string|string[]|null>(),
    preferredGenerators: new vscode.EventEmitter<string[]>(),
    generator: new vscode.EventEmitter<string|null>(),
    toolset: new vscode.EventEmitter<string|null>(),
    platform: new vscode.EventEmitter<string|null>(),
    configureArgs: new vscode.EventEmitter<string[]>(),
    buildArgs: new vscode.EventEmitter<string[]>(),
    buildToolArgs: new vscode.EventEmitter<string[]>(),
    parallelJobs: new vscode.EventEmitter<number>(),
    ctestPath: new vscode.EventEmitter<string>(),
    ctest: new vscode.EventEmitter<{parallelJobs: number;}>(),
    autoRestartBuild: new vscode.EventEmitter<boolean>(),
    parseBuildDiagnostics: new vscode.EventEmitter<boolean>(),
    enabledOutputParsers: new vscode.EventEmitter<string[]>(),
    debugConfig: new vscode.EventEmitter<object>(),
    defaultVariants: new vscode.EventEmitter<object>(),
    ctestArgs: new vscode.EventEmitter<string[]>(),
    environment: new vscode.EventEmitter<HardEnv>(),
    configureEnvironment: new vscode.EventEmitter<HardEnv>(),
    buildEnvironment: new vscode.EventEmitter<HardEnv>(),
    testEnvironment: new vscode.EventEmitter<HardEnv>(),
    mingwSearchDirs: new vscode.EventEmitter<string[]>(),
    emscriptenSearchDirs: new vscode.EventEmitter<string[]>(),
    useCMakeServer: new vscode.EventEmitter<boolean>(),
    enableTraceLogging: new vscode.EventEmitter<boolean>(),
    loggingLevel: new vscode.EventEmitter<LogLevelKey>(),
  };

  /**
   * Watch for changes on a particular setting
   * @param setting The name of the setting to watch
   * @param cb A callback when the setting changes
   */
  onChange<K extends keyof ExtensionConfigurationSettings>(setting: K,
                                                           cb: (value: ExtensionConfigurationSettings[K]) => void):
      vscode.Disposable {
    const emitter: vscode.EventEmitter<ExtensionConfigurationSettings[K]> = this._emitters[setting];
    return emitter.event(cb);
  }
}
