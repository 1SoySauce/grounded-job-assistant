export type FillConfidence = 'green' | 'yellow' | 'red';

export interface ApplicationFieldDescriptor {
  id: string;
  label: string;
  normalizedLabel: string;
  type:
    | 'text'
    | 'email'
    | 'telephone'
    | 'number'
    | 'textarea'
    | 'radio'
    | 'checkbox'
    | 'select'
    | 'combobox'
    | 'date'
    | 'file'
    | 'unknown';
  options: string[];
  required: boolean;
  confidence: number;
  section: string;
}

export interface FillProposal {
  fieldId: string;
  meaning: string | null;
  proposedValue: string | number | boolean | null;
  sourcePath: string | null;
  confidence: number;
  reviewLevel: FillConfidence;
  usedAi: boolean;
}
