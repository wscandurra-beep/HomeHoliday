export type InterestFlag = '' | 'Non interessante' | 'Interessante' | 'Da contattare' | 'Contattato' | 'Venduto';
export type ResultAnnotation = { flag: InterestFlag; note: string; hidden: boolean; visibilityRuleVersion?: 1 };
export function autoHideFlag(flag?: string): boolean;
export function normalizeAnnotation(annotation?: Partial<ResultAnnotation>): ResultAnnotation;
export function migrateAnnotations(annotations: Record<string, ResultAnnotation>): Record<string, ResultAnnotation>;
export function decodeCloudAnnotation(row: { flag: string; note: string }): ResultAnnotation;
export function encodeCloudNote(annotation: ResultAnnotation): string;
export function legacyVisibilityUpdates<T extends { flag: string; note: string }>(rows: T[]): { row: T; note: string }[];
