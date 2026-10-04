declare module 'firebase/app' {
  export function initializeApp(config: any): any;
  export function getApps(): any[];
  export function getApp(): any;
}

declare module 'firebase/database' {
  export type Database = any;
  export function getDatabase(app?: any): any;
  export function ref(db: any, path?: string): any;
  export function onValue(ref: any, callback: (snapshot: any) => void, errorCallback?: (error: any) => void): () => void;
  export function set(ref: any, value: any): Promise<void>;
  export function get(ref: any): Promise<any>;
}
