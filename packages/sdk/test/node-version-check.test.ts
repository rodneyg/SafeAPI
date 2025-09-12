import { describe, it, expect } from 'vitest';

describe('Node.js version check logic', () => {
  // Test the version check logic directly without importing the full SDK
  const versionCheckLogic = (mockProcess: any) => {
    if (typeof mockProcess !== 'undefined' && mockProcess.versions && mockProcess.versions.node) {
      const nodeVersion = mockProcess.versions.node;
      const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
      if (majorVersion < 20) {
        throw new Error(`SafeAPI SDK requires Node.js version 20 or higher. Current version: ${nodeVersion}`);
      }
    }
  };

  it('should not throw when Node.js version is 20 or higher', () => {
    const mockProcess = {
      versions: { node: '20.0.0' }
    };

    expect(() => versionCheckLogic(mockProcess)).not.toThrow();
  });

  it('should not throw when Node.js version is higher than 20', () => {
    const mockProcess = {
      versions: { node: '21.5.0' }
    };

    expect(() => versionCheckLogic(mockProcess)).not.toThrow();
  });

  it('should throw when Node.js version is lower than 20', () => {
    const mockProcess = {
      versions: { node: '18.17.0' }
    };

    expect(() => versionCheckLogic(mockProcess)).toThrow(
      'SafeAPI SDK requires Node.js version 20 or higher. Current version: 18.17.0'
    );
  });

  it('should throw when Node.js version is 19', () => {
    const mockProcess = {
      versions: { node: '19.9.0' }
    };

    expect(() => versionCheckLogic(mockProcess)).toThrow(
      'SafeAPI SDK requires Node.js version 20 or higher. Current version: 19.9.0'
    );
  });

  it('should not throw when process is undefined (browser environment)', () => {
    expect(() => versionCheckLogic(undefined)).not.toThrow();
  });

  it('should not throw when process.versions is undefined', () => {
    const mockProcess = {};
    expect(() => versionCheckLogic(mockProcess)).not.toThrow();
  });

  it('should not throw when process.versions.node is undefined', () => {
    const mockProcess = {
      versions: {}
    };
    expect(() => versionCheckLogic(mockProcess)).not.toThrow();
  });

  it('should work with current real Node.js version', () => {
    // Test with the actual current process to make sure it works in real environment
    expect(() => versionCheckLogic(process)).not.toThrow();
  });
});