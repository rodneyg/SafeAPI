export { UserManagedMode } from './UserManagedMode';
export { SharedResponsibilityMode } from './SharedResponsibilityMode';
export { DeveloperManagedMode } from './DeveloperManagedMode';
export { APIManagedMode } from './APIManagedMode';

// UX Mode factory function
import type { SafeAPIConfig, UXMode, UserManagedOptions, SharedResponsibilityOptions, DeveloperManagedOptions, APIManagedOptions } from '../types';
import { UserManagedMode } from './UserManagedMode';
import { SharedResponsibilityMode } from './SharedResponsibilityMode';
import { DeveloperManagedMode } from './DeveloperManagedMode';
import { APIManagedMode } from './APIManagedMode';

export function createUXMode(config: SafeAPIConfig) {
  const mode = config.uxMode || 'user-managed';

  switch (mode) {
    case 'user-managed':
      return new UserManagedMode(config as SafeAPIConfig & { uxMode: 'user-managed' });
    
    case 'shared-responsibility':
      return new SharedResponsibilityMode(config as SafeAPIConfig & { uxMode: 'shared-responsibility' });
    
    case 'developer-managed':
      return new DeveloperManagedMode(config as SafeAPIConfig & { uxMode: 'developer-managed' }, {});
    
    case 'api-managed':
      return new APIManagedMode(config as SafeAPIConfig & { uxMode: 'api-managed' }, {});
    
    default:
      throw new Error(`Unsupported UX mode: ${mode}`);
  }
}

// Type definitions for each mode's interface
export type SafeAPIUXMode = 
  | UserManagedMode 
  | SharedResponsibilityMode 
  | DeveloperManagedMode 
  | APIManagedMode;

export interface UXModeOptions {
  'user-managed': UserManagedOptions;
  'shared-responsibility': SharedResponsibilityOptions;
  'developer-managed': DeveloperManagedOptions;
  'api-managed': APIManagedOptions;
}